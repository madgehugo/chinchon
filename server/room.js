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

   A seat here is { name, token, socket, awayTimer, playing, wins, lastReact, lastPauseAsk, lastRulesAsk }.
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

   Players may PAUSE a game if everyone agrees: one asks, and once every person
   at the table who is connected has agreed, the game stops. Moves are refused,
   the engine's timers (the CPUs' turns) are held back until it goes on, and the
   turn limit keeps the time that was left. Anyone at the table may resume, so a
   pause never needs everyone back to end.

   The host may CHANGE THE RULES (the deck, CPU level, reshuffles...). In the
   lobby, before the first game, the change is made at once, as in the create
   form. After that it is a request, like a pause: once every person in the room
   who is connected has agreed, the new rules are the room's. A game in progress
   then ends and a new one is dealt with them; after a game they are used for
   the next one.
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
const PAUSE_ASK_MS   = 60 * 1000; // a request to pause that not everyone has agreed to is dropped after this long
const PAUSE_ASK_GAP_MS = 10 * 1000; // a player may ask to pause at most once in this long (no pestering the table)
const RULES_ASK_MS   = 60 * 1000; // a request to change the rules that not everyone has agreed to is dropped after this long
const RULES_ASK_GAP_MS = 10 * 1000; // the host may ask to change the rules at most once in this long

// What the host chooses for the game (sent with "create"), and the values each may take.
// Anything else is replaced by the first value in the list (the default).
const SETTING_CHOICES = {
  players:       [4, 2, 3],                       // seats at the table; people first, CPUs fill the rest
  deckSize:      [40, 48],
  cpuMode:       ["hard", "medium", "easy", "mixed"],
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
// The settings the host may change with a "rules" message: all but the number of seats,
// which has its own message (between games only)
const RULE_KEYS = Object.keys(SETTING_CHOICES).filter(key => key !== "players");
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
    this.paused = false;         // is the game paused (everyone agreed)?
    this.pauseAsk = null;        // a request to pause: { by, agreed, timer } (by: a seat object; agreed: a Set of them)
    this.held = new Map();       // engine timers that came due while paused: timer id -> function, run on resume
    this.pausedTurnLeft = null;  // milliseconds the turn limit had left when the game was paused (null: none was running)
    this.rulesAsk = null;        // the host's request to change the rules: { by, settings, agreed, timer } (as pauseAsk)
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
    const seat = { name, token, socket, awayTimer: null, playing: false, wins: 0,
                   lastReact: 0, lastPauseAsk: 0, lastRulesAsk: 0 };
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
    this.checkPause();                 // (they may have been the last one who had not agreed to pause...
    this.checkRules();                 // ...or to the new rules)
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
    this.checkRules();
    this.sendLobby();
  }

  // The host is gone: the first person still connected takes over (or the first one still in)
  // (a request to change the rules was the old host's, so it goes too)
  passHost() {
    this.hostSeat = this.seats.find(seat => seat.token && seat.socket) ||
                    this.seats.find(seat => seat.token) || null;
    this.dropRulesAsk();
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
    this.checkPause();
    this.checkRules();
    this.sendLobby();
    return null;
  }

  // Hand the room to player `target`
  makeHost(s, target) {
    if (s !== this.host) return "online.err.notHost";
    const seat = this.personAt(target);
    if (!seat) return "online.err.badMessage";
    this.hostSeat = seat;
    this.dropRulesAsk();               // (the request was the old host's)
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
      // While the game is paused, a timer that comes due is held back (in room.held) until it goes on.
      setTimeout(fn, ms) {
        const id = setTimeout(() => {
          room.timers.delete(id);
          if (room.paused) room.held.set(id, fn); else fn();
        }, ms);
        room.timers.add(id);
        return id;
      },
      // (a held timer the engine cancels, e.g. a player is back during the pause, must not run later)
      clearTimeout(id) { clearTimeout(id); room.timers.delete(id); room.held.delete(id); },
      render: () => this.queueFlush(),
      status: () => this.queueFlush(),
    });
    // For the tests (test.js): CPU_DELAY_MS replaces every CPU pause, so games play out in seconds
    if (process.env.CPU_DELAY_MS) {
      this.game.CPU_PAUSE.draw = this.game.CPU_PAUSE.discard = Number(process.env.CPU_DELAY_MS);
    }
    this.newGame();
    return null;
  }

  // Deal a new game with the people in the room and the room's rules (Start, "New game"
  // after a game ends, and new rules everyone agreed to)
  newGame() {
    const g = this.game, st = this.settings;
    g.setDeckSize(st.deckSize);
    g.state.cpuMode = st.cpuMode;
    g.state.maxReshuffles = st.maxReshuffles;
    g.state.maxReentries = st.maxReentries;
    g.state.roundLimit = st.roundLimit;
    g.state.layoffMode = st.layoffMode;
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
    // Paused: no moves, except rearranging your own hand (which changes nothing for anybody else)
    if (this.paused && name !== "order") { this.queueFlush(); return null; }
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

  // ---- Pausing (see the top of this file) ----

  // The people whose agreement a pause needs: everyone at the table who is connected
  voters() { return this.seats.filter(seat => seat.playing && seat.token && seat.socket); }

  // Seat s presses Pause: asks the table, or agrees to the request already made
  pause(s) {
    const seat = this.seats[s];
    if (!this.started || this.game.state.gameOver || !seat.playing || this.paused) return null;
    if (!this.pauseAsk) {
      const now = Date.now();
      if (now - seat.lastPauseAsk < PAUSE_ASK_GAP_MS) return null;
      seat.lastPauseAsk = now;
      this.pauseAsk = { by: seat, agreed: new Set(), timer: setTimeout(() => this.dropPauseAsk(), PAUSE_ASK_MS) };
    }
    this.pauseAsk.agreed.add(seat);
    this.checkPause();
    this.sendLobby();
    return null;
  }

  // Seat s says no to the request to pause (or takes back their own)
  noPause(s) {
    if (this.seats[s].playing) this.dropPauseAsk();
    return null;
  }

  dropPauseAsk() {
    if (!this.pauseAsk) return;
    clearTimeout(this.pauseAsk.timer);
    this.pauseAsk = null;
    this.sendLobby();
  }

  // Has everyone agreed to the request? Then pause: stop the turn limit (remembering the time
  // it had left) and the wait for Next round. The engine's timers are held from now on (start).
  checkPause() {
    const ask = this.pauseAsk;
    if (!ask || !this.voters().every(seat => ask.agreed.has(seat))) return;
    clearTimeout(ask.timer);
    this.pauseAsk = null;
    this.paused = true;
    if (this.turnTimer) {
      this.pausedTurnLeft = Math.max(0, this.turnEnds - Date.now());
      clearTimeout(this.turnTimer);
      this.turnTimer = this.turnEnds = null;
    }
    clearTimeout(this.nextTimer);       // (watchWaits starts the wait again on resume)
    this.nextTimer = null;
    this.queueFlush();                  // a view with no turn countdown
  }

  // Anyone at the table goes on with the game: the turn limit runs again from where it
  // stopped, and the engine's timers that came due meanwhile run now (in the order they came due)
  resume(s) {
    if (!this.paused || !this.seats[s].playing) return null;
    this.paused = false;
    if (this.pausedTurnLeft !== null) this.startTurnTimer(this.pausedTurnLeft);
    this.pausedTurnLeft = null;
    const held = [...this.held.values()];
    this.held.clear();
    held.forEach(fn => fn());
    this.sendLobby();
    this.queueFlush();
    return null;
  }

  // ---- Changing the rules (see the top of this file) ----

  // The people whose agreement new rules need: everyone in the room who is connected,
  // including those waiting for the next game (they will play with the new rules too)
  rulesVoters() { return this.seats.filter(seat => seat.token && seat.socket); }

  // The host asks for new rules: `settings` holds some or all of RULE_KEYS (a key left out
  // keeps its value). In the lobby they are the room's at once; after that the others must agree.
  proposeRules(s, settings) {
    if (s !== this.host) return "online.err.notHost";
    if (!settings || typeof settings !== "object") return "online.err.badMessage";
    const next = {};
    for (const key of RULE_KEYS) {
      next[key] = Object.hasOwn(settings, key) ? settings[key] : this.settings[key];
      if (!SETTING_CHOICES[key].includes(next[key])) return "online.err.badMessage";
    }
    if (RULE_KEYS.every(key => next[key] === this.settings[key])) return null;   // nothing changes
    if (!this.started) {
      Object.assign(this.settings, next);      // (copies next's fields into the room's settings)
      this.sendLobby();
      return null;
    }
    const seat = this.seats[s], now = Date.now();
    if (this.rulesAsk || now - seat.lastRulesAsk < RULES_ASK_GAP_MS) return null;
    seat.lastRulesAsk = now;
    this.rulesAsk = { by: seat, settings: next, agreed: new Set([seat]),
                      timer: setTimeout(() => this.dropRulesAsk(), RULES_ASK_MS) };
    this.checkRules();                         // (with nobody else connected it applies at once)
    this.sendLobby();
    return null;
  }

  // Seat s agrees to the new rules
  rulesYes(s) {
    if (!this.rulesAsk || !this.seats[s].token) return null;
    this.rulesAsk.agreed.add(this.seats[s]);
    this.checkRules();
    this.sendLobby();
    return null;
  }

  // Seat s says no to the new rules (or the host takes the request back)
  rulesNo(s) {
    if (this.seats[s].token) this.dropRulesAsk();
    return null;
  }

  dropRulesAsk() {
    if (!this.rulesAsk) return;
    clearTimeout(this.rulesAsk.timer);
    this.rulesAsk = null;
    this.sendLobby();
  }

  // Has everyone agreed to the new rules? Then they are the room's. A game in progress ends
  // (unpaused: its held timers belong to it) and a new one is dealt with them; a game that is
  // over keeps its results on the table, and "New game" uses them.
  checkRules() {
    const ask = this.rulesAsk;
    if (!ask || !this.rulesVoters().every(seat => ask.agreed.has(seat))) return;
    clearTimeout(ask.timer);
    this.rulesAsk = null;
    Object.assign(this.settings, ask.settings);
    if (!this.started || this.game.state.gameOver) return;
    this.paused = false;
    this.pausedTurnLeft = null;
    this.held.clear();
    if (this.pauseAsk) { clearTimeout(this.pauseAsk.timer); this.pauseAsk = null; }
    clearTimeout(this.turnTimer);
    this.turnTimer = this.turnEnds = this.waitMoment = null;   // (the new game's first turn starts its own)
    this.newGame();
    this.queueFlush();
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
      this.dropPauseAsk();                       // (a game that is over cannot be paused)
      this.sendLobby();
    }

    // Paused: no timers run (checkPause stopped them, resume starts them again)
    if (this.paused) { this.turnSeats = []; return; }

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
      if (moment && this.settings.turnLimit) this.startTurnTimer(this.settings.turnLimit * SECOND_MS);
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

  // The turn limit: in `ms` the CPU answers for whoever the game is still waiting on
  startTurnTimer(ms) {
    this.turnEnds = Date.now() + ms;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (this.game) for (const p of this.waitingOn()) this.game.seatAway(p);
    }, ms);
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
      paused: this.paused,
      // A request to pause: who asked and who has agreed so far (seat numbers, like `you` and `host`)
      pauseAsk: this.pauseAsk && { by: this.seats.indexOf(this.pauseAsk.by),
                                   agreed: [...this.pauseAsk.agreed].map(seat => this.seats.indexOf(seat)) },
      // A request to change the rules: the same, and the rules asked for
      rulesAsk: this.rulesAsk && { by: this.seats.indexOf(this.rulesAsk.by), settings: this.rulesAsk.settings,
                                   agreed: [...this.rulesAsk.agreed].map(seat => this.seats.indexOf(seat)) },
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
    if (this.pauseAsk) clearTimeout(this.pauseAsk.timer);
    if (this.rulesAsk) clearTimeout(this.rulesAsk.timer);
    this.held.clear();
    if (this.game) this.game.state.timer = null;
    this.game = null;
  }
}

module.exports = { Room, cleanSettings, AWAY_AFTER_MS, SETTING_CHOICES, RULE_KEYS };
