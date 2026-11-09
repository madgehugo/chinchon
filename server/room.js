"use strict";

/* =========================================================
   server/room.js: one online game (a "room") and the people in it
   ---------------------------------------------------------
   A room starts as a LOBBY: the host creates it, friends join with its code,
   and the host presses Start. Then the room loads its own copy of the game
   engine (rules.js, ai.js, game.js... through loadEngine in tools/harness.js,
   the same way the benchmark tools do) and plays it with real timers. People
   take the first seats, CPUs the rest.

   Every time the engine calls render() or setStatus(), the room is marked as
   changed, and once the engine has finished what it was doing (setImmediate:
   "after the current piece of work") each player at the table is sent their own
   view of the game (viewFor in view.js).

   A seat here is { name, token, socket, awayTimer, playing, wins, lastReact }.
   The token is a long random secret given to the player when they join; with it
   they can come back to the same seat after a reload or a lost connection
   (rejoin). It is the only proof of who is who, so it is never sent to anybody
   else. A player who left for good keeps their seat (token null, played by the
   CPU) until the next game is dealt, so that the seat numbers of the game stay
   the same.

   People may join at any time while there is a free place. During a game they
   wait (`playing` false) and are dealt in when the next game starts. Between
   games (in the lobby, or once a game is over) the host can change the number
   of seats, remove a player, or hand the room to someone else.

   The room also keeps the game moving when a person does not: with a time per
   turn, a CPU plays for whoever runs out of time (watchWaits), and once someone
   has pressed Next round, the others get NEXT_ROUND_WAIT_MS to do the same.
   ========================================================= */
const crypto = require("crypto");
const { loadEngine } = require("../tools/harness");
const { viewFor, viewerSeat, realSeat } = require("./view");

// (the tests make these short through environment variables, so they need not wait)
const AWAY_AFTER_MS  = Number(process.env.AWAY_AFTER_MS)  || 30 * 1000;   // a dropped player gets this long to come back before a CPU plays for them
const LOBBY_LEAVE_MS = Number(process.env.LOBBY_LEAVE_MS) || 60 * 1000;   // a dropped player in the lobby loses their place after this long
const NEXT_ROUND_WAIT_MS = Number(process.env.NEXT_ROUND_WAIT_MS) || 90 * 1000;   // once someone pressed Next round, the next round starts after this long anyway
const SECOND_MS      = Number(process.env.SECOND_MS)      || 1000;        // one second of the turn limit (the tests make it shorter)
const REACT_GAP_MS   = 1500;      // a player's reactions closer together than this are dropped (no flooding the table)

// What the host chooses for the game (sent with "create"), and the values each may take.
// Anything else is replaced by the first value in the list (the default).
const SETTING_CHOICES = {
  players:       [4, 2, 3],                       // seats at the table; people first, CPUs fill the rest
  deckSize:      [40, 48],
  cpuMode:       ["hard", "medium", "easy", "mixed"],
  cpuSpeed:      ["normal", "slow", "fast"],
  maxReshuffles: [2, 0, 1, 3, 5, null],           // null = no limit (as in the Settings dropdowns)
  maxReentries:  [1, 0, 2, null],
  roundLimit:    [null, 5, 10, 15, 20],
  layoffMode:    ["auto", "manual", "none"],
  turnLimit:     [null, 30, 60, 120],             // seconds a person has for a turn before a CPU plays for them (null = no limit)
};
function cleanSettings(settings) {
  const out = {};
  for (const [key, choices] of Object.entries(SETTING_CHOICES)) {
    const value = settings && settings[key];
    out[key] = choices.includes(value) ? value : choices[0];
  }
  return out;
}

class Room {
  constructor(code, settings) {
    this.code = code;
    this.settings = cleanSettings(settings);
    this.seats = [];             // the people, in seat order (see the top of this file)
    this.hostSeat = null;        // the seat (the object, so it survives seats moving up) of the player who may start and change the room
    this.game = null;            // the engine, once the game has started
    this.timers = new Set();     // the engine's pending timers (cleared when the room closes)
    this.flushQueued = false;
    this.emptySince = Date.now(); // when the last connection dropped (null while anyone is connected);
                                  // server.js throws away rooms that stay empty too long
    this.cpuWins = 0;            // games won by CPUs in this room (people's wins are in their seats)
    this.counted = false;        // has the winner of the current game been added to the tally?
    this.waitMoment = null;      // what the turn timer is timing (see watchWaits)
    this.turnTimer = null;       // the turn limit's timer, while it runs...
    this.turnEnds = null;        // ...when it runs out (Date.now() time)...
    this.turnSeats = [];         // ...and the seats it is waiting for
    this.nextTimer = null;       // the timer that starts the next round when someone waited too long
  }

  get started() { return this.game !== null; }
  get host() { return this.seats.indexOf(this.hostSeat); }    // the host's seat number (-1: none)
  // In the lobby, or after a game: the time when the room may be changed
  get between() { return !this.started || this.game.state.gameOver; }
  // The people still in the room (not those who left for good)
  people() { return this.seats.filter(seat => seat.token); }

  // ---- People coming and going ----

  // Add a person. Returns their seat number, or an error key ("online.err...") if they cannot join.
  join(name, socket) {
    if (this.people().length >= this.settings.players) return "online.err.full";
    const token = crypto.randomBytes(18).toString("base64url");      // 144 random bits
    const seat = { name, token, socket, awayTimer: null, playing: false, wins: 0, lastReact: 0 };
    this.seats.push(seat);
    if (!this.hostSeat) this.hostSeat = seat;
    this.emptySince = null;
    this.sendLobby();
    return this.seats.length - 1;
  }

  // The player with this token is back on a new connection. Returns their seat or an error key.
  rejoin(token, socket) {
    const s = this.seats.findIndex(seat => seat.token === token);
    if (s < 0) return "online.err.noSeat";
    const seat = this.seats[s];
    if (seat.socket && seat.socket !== socket) seat.socket.close(4000, "replaced");   // an older tab or connection
    seat.socket = socket;
    clearTimeout(seat.awayTimer);
    seat.awayTimer = null;
    this.emptySince = null;
    if (this.started && seat.playing) this.game.seatBack(s);    // no-op unless a CPU was playing for them
    this.sendLobby();
    this.queueFlush();
    return s;
  }

  // The connection `socket` of seat s dropped (or s pressed Leave: then `forGood`). A connection
  // that was already replaced by a newer one (rejoin) changes nothing.
  disconnect(s, forGood, socket) {
    const seat = this.seats[s];
    if (!seat || seat.socket !== socket) return;
    seat.socket = null;
    clearTimeout(seat.awayTimer);
    if (!this.started || !seat.playing) {
      // In the lobby, or waiting for the next game: a player who left is taken off the list
      // (now, or if they do not come back)
      const remove = () => this.removeSeat(seat);
      if (forGood) remove(); else seat.awayTimer = setTimeout(remove, LOBBY_LEAVE_MS);
    } else if (forGood) {
      this.leaveGame(seat);
    } else {
      // (the seat is looked up when the timer fires: a new game may have moved it up)
      seat.awayTimer = setTimeout(() => {
        if (this.game && seat.playing) this.game.seatAway(this.seats.indexOf(seat));
      }, AWAY_AFTER_MS);
    }
    if (this.connectedCount() === 0) this.emptySince = Date.now();
    this.sendLobby();
  }

  // A player at the table leaves for good: the CPU plays their seat until the game ends
  leaveGame(seat) {
    seat.token = null;                                         // no coming back to this seat
    clearTimeout(seat.awayTimer);
    this.game.seatAway(this.seats.indexOf(seat));
    if (seat === this.hostSeat) this.passHost();
  }

  // Take a seat off the list. Only for a seat that is not in the current game (whose seat
  // numbers must not move, even once it is over); those go in newGame().
  removeSeat(seat) {
    const s = this.seats.indexOf(seat);
    if (s < 0 || (this.started && seat.playing)) return;
    clearTimeout(seat.awayTimer);
    this.seats.splice(s, 1);
    if (seat === this.hostSeat) this.passHost();
    this.sendLobby();
  }

  // The host is gone: the first person still connected takes over (or the first one still in)
  passHost() {
    this.hostSeat = this.seats.find(seat => seat.token && seat.socket) ||
                    this.seats.find(seat => seat.token) || null;
  }

  connectedCount() { return this.seats.filter(seat => seat.socket).length; }

  // ---- What the host may change ----

  // The number of seats at the table, between games. Returns an error key, or null.
  setPlayers(s, players) {
    if (s !== this.host) return "online.err.notHost";
    if (!this.between) return "online.err.notNow";
    if (!SETTING_CHOICES.players.includes(players)) return "online.err.badMessage";
    if (this.people().length > players) return "online.err.seatsTaken";
    this.settings.players = players;
    this.sendLobby();
    return null;
  }

  // The seat numbered `target` in a message from the host, if a person still in the room sits there
  personAt(target) {
    const seat = Number.isInteger(target) ? this.seats[target] : null;
    return seat && seat.token ? seat : null;
  }

  // Remove player `target` from the room. During a game the CPU plays their seat to the end.
  remove(s, target) {
    if (s !== this.host) return "online.err.notHost";
    const seat = this.personAt(target);
    if (!seat || target === s) return "online.err.badMessage";
    this.send(seat.socket, { type: "error", key: "online.err.removed" });
    if (seat.socket) seat.socket.close(4001, "removed");
    seat.socket = null;
    if (this.started && seat.playing) this.leaveGame(seat);
    else { seat.token = null; this.removeSeat(seat); }
    this.sendLobby();
    return null;
  }

  // Hand the room to player `target`
  makeHost(s, target) {
    if (s !== this.host) return "online.err.notHost";
    const seat = this.personAt(target);
    if (!seat) return "online.err.badMessage";
    this.hostSeat = seat;
    this.sendLobby();
    return null;
  }

  // ---- Playing ----

  // The host pressed Start: load the engine and deal the first round
  start(s) {
    if (s !== this.host) return "online.err.notHost";
    if (this.started) return null;
    const room = this;
    this.game = loadEngine({
      // Real timers, remembered so that close() can cancel them
      setTimeout(fn, ms) {
        const id = setTimeout(() => { room.timers.delete(id); fn(); }, ms);
        room.timers.add(id);
        return id;
      },
      clearTimeout(id) { clearTimeout(id); room.timers.delete(id); },
      render: () => this.queueFlush(),
      status: () => this.queueFlush(),
    });
    const g = this.game, st = this.settings;
    // For the tests (test.js): CPU_DELAY_MS replaces every CPU pause, so games play out in seconds
    if (process.env.CPU_DELAY_MS) {
      for (const row of Object.values(g.CPU_SPEEDS)) row.draw = row.discard = Number(process.env.CPU_DELAY_MS);
    }
    g.setDeckSize(st.deckSize);
    g.state.cpuMode = st.cpuMode;
    g.state.cpuSpeed = st.cpuSpeed;
    g.state.maxReshuffles = st.maxReshuffles;
    g.state.maxReentries = st.maxReentries;
    g.state.roundLimit = st.roundLimit;
    g.state.layoffMode = st.layoffMode;
    this.newGame();
    return null;
  }

  // Deal a new game with the people in the room (Start, and "New game" after a game ends)
  newGame() {
    const g = this.game;
    // Seats of players who left for good are given up now (to newcomers, or to the CPUs),
    // and everyone who was waiting for this game sits down
    this.seats = this.seats.filter(seat => seat.token);
    this.seats.forEach(seat => { seat.playing = true; });
    this.counted = false;
    const n = Math.max(this.settings.players, this.seats.length);
    const seats = Array.from({ length: n }, (_, p) => p < this.seats.length ? "human" : "cpu");
    // CPU levels from the host's setting; a person's seat is played at "hard" while they are away
    g.state.cpuLevels = g.CPU_MODES[this.settings.cpuMode].map((level, p) => p < this.seats.length ? "hard" : level);
    g.newGame(n - 1, { seats, names: seats.map((_, p) => p < this.seats.length ? this.seats[p].name : null) });
    // Anyone whose connection is down right now is away from the start
    this.seats.forEach((seat, p) => { if (!seat.socket && !seat.awayTimer) g.seatAway(p); });
    this.sendLobby();
  }

  // A move from seat s: { name, args }, with seat numbers in the sender's numbering.
  // Returns an error key, or null.
  action(s, name, args) {
    if (!this.started) return "online.err.notStarted";
    if (!this.seats[s].playing) return "online.err.badMove";      // waiting for the next game
    const g = this.game;
    const action = Object.hasOwn(g.ACTIONS, name) ? g.ACTIONS[name] : null;
    if (!action || !Array.isArray(args) || args.length !== action.args.length) return "online.err.badMove";
    // Seat arguments: the sender counts from themselves (see view.js); turn them into real seats
    const n = g.state.numPlayers;
    const real = args.map((value, i) =>
      action.args[i] === "seat" && Number.isInteger(value) && value >= 0 && value < n ? realSeat(value, s, n) : value);
    // A move from a player the CPU was standing in for (their time ran out): they are back
    if (g.state.seats[s] === "away") g.seatBack(s);
    g.runAction(s, name, real);       // checks the types and whether the move is allowed now
    this.queueFlush();                // (a refused move still gets an answer, so the page catches up)
    return null;
  }

  // "I'm back" after the CPU played for a player whose time ran out
  back(s) {
    if (this.started && this.seats[s].playing) this.game.seatBack(s);
    return null;
  }

  // "New game" after the game is over: any player in the room may press it
  again(s) {
    if (!this.started || !this.game.state.gameOver) return "online.err.notOver";
    this.newGame();
    return null;
  }

  // A reaction (an index into REACTIONS in i18n.js) from seat s, shown to everyone at the
  // table by the sender's seat. Too many too fast are dropped without a word.
  react(s, id) {
    const seat = this.seats[s];
    if (!this.started || !seat.playing) return null;
    if (!Number.isInteger(id) || id < 0 || id >= this.game.REACTIONS.length) return "online.err.badMessage";
    const now = Date.now();
    if (now - seat.lastReact < REACT_GAP_MS) return null;
    seat.lastReact = now;
    const n = this.game.state.numPlayers;
    this.seats.forEach((other, me) => {
      if (other.playing) this.send(other.socket, { type: "react", who: viewerSeat(s, me, n), id });
    });
    return null;
  }

  // ---- Keeping the game moving ----

  // The people the game is waiting for right now: whoever's turn it is, the one laying off
  // by hand, or those asked whether to re-enter
  waitingOn() {
    const st = this.game.state;
    const human = p => st.seats[p] === "human";
    if (st.gameOver) return [];
    if (st.phase !== "roundOver") return human(st.currentPlayer) ? [st.currentPlayer] : [];
    if (st.layoff) return [st.layoff.order[st.layoff.next]].filter(human);
    return st.reentryPending.filter(human);
  }

  // Called after every change of the game (queueFlush): adds the winner of a finished game
  // to the room's tally, and starts or stops the two timers that keep the game moving
  watchWaits() {
    const g = this.game, st = g.state;

    if (st.gameOver && !this.counted) {
      this.counted = true;
      const winner = this.seats[st.winner];
      if (winner && winner.playing) winner.wins++; else this.cpuWins++;
      this.sendLobby();
    }

    // The turn limit. One timer per "moment" the game waits for people: a whole turn
    // (drawing and discarding), one player's lay-offs, or the re-entry question.
    const waiting = this.waitingOn();
    const moment = !waiting.length ? null
      : [st.deals, st.turns, st.currentPlayer,
         st.phase !== "roundOver" ? "turn" : st.layoff ? `layoff${st.layoff.next}` : "reentry"].join("|");
    if (moment !== this.waitMoment) {
      this.waitMoment = moment;
      clearTimeout(this.turnTimer);
      this.turnTimer = this.turnEnds = null;
      if (moment && this.settings.turnLimit) {
        const ms = this.settings.turnLimit * SECOND_MS;
        this.turnEnds = Date.now() + ms;
        this.turnTimer = setTimeout(() => {
          this.turnTimer = null;
          if (this.game) for (const p of this.waitingOn()) this.game.seatAway(p);   // the CPU answers for them
        }, ms);
      }
    }
    this.turnSeats = this.turnTimer ? waiting : [];

    // Next round: once someone has pressed it, the others have NEXT_ROUND_WAIT_MS to follow
    if (!(g.roundCanAdvance() && st.ready.some(Boolean))) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    } else if (!this.nextTimer) {
      this.nextTimer = setTimeout(() => {
        this.nextTimer = null;
        if (this.game) this.game.nextRound();
      }, NEXT_ROUND_WAIT_MS);
    }
  }

  // ---- Sending ----

  send(socket, message) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));   // 1 = OPEN
  }

  // The list of players and the room's rules (for the online sheet), sent whenever they change
  sendLobby() {
    this.seats.forEach((seat, s) => this.send(seat.socket, {
      type: "lobby",
      code: this.code,
      you: s,
      host: this.host,
      started: this.started,
      gameOver: this.started && this.game.state.gameOver,
      players: this.settings.players,
      settings: this.settings,
      cpuWins: this.cpuWins,
      people: this.seats.map(other => ({ name: other.name, connected: Boolean(other.socket), left: !other.token,
                                         playing: other.playing, wins: other.wins })),
    }));
  }

  // Send everyone at the table their view, once per burst of changes. `turnLeft` is how many
  // milliseconds that player has left before a CPU plays for them (null: no limit is running for them).
  queueFlush() {
    if (this.flushQueued || !this.started) return;
    this.flushQueued = true;
    setImmediate(() => {
      this.flushQueued = false;
      if (!this.game) return;
      try {
        this.watchWaits();
        const deckSize = this.game.deckSize(), now = Date.now();
        this.seats.forEach((seat, s) => {
          if (!seat.socket || !seat.playing) return;
          const turnLeft = this.turnSeats.includes(s) ? Math.max(0, this.turnEnds - now) : null;
          this.send(seat.socket, { type: "view", state: viewFor(this.game.state, s, deckSize), turnLeft });
        });
      } catch (err) {
        console.error(`room ${this.code}:`, err);    // a bug: keep the server running for the other rooms
      }
    });
  }

  // The room is being thrown away: stop every timer
  close() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    for (const seat of this.seats) clearTimeout(seat.awayTimer);
    clearTimeout(this.turnTimer);
    clearTimeout(this.nextTimer);
    if (this.game) this.game.state.timer = null;
    this.game = null;
  }
}

module.exports = { Room, cleanSettings, AWAY_AFTER_MS, SETTING_CHOICES };
