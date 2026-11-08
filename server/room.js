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
   "after the current piece of work") each connected player is sent their own
   view of the game (viewFor in view.js).

   A seat here is { name, token, socket, awayTimer }. The token is a long random
   secret given to the player when they join; with it they can come back to the
   same seat after a reload or a lost connection (rejoin). It is the only proof
   of who is who, so it is never sent to anybody else.
   ========================================================= */
const crypto = require("crypto");
const { loadEngine } = require("../tools/harness");
const { viewFor, realSeat } = require("./view");

// (the tests make these short through environment variables, so they need not wait)
const AWAY_AFTER_MS  = Number(process.env.AWAY_AFTER_MS)  || 30 * 1000;   // a dropped player gets this long to come back before a CPU plays for them
const LOBBY_LEAVE_MS = Number(process.env.LOBBY_LEAVE_MS) || 60 * 1000;   // a dropped player in the lobby loses their place after this long

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
    this.seats = [];             // the people, in seat order: { name, token, socket, awayTimer }
    this.host = 0;               // index into seats of the player who may press Start
    this.game = null;            // the engine, once the game has started
    this.timers = new Set();     // the engine's pending timers (cleared when the room closes)
    this.flushQueued = false;
    this.emptySince = Date.now(); // when the last connection dropped (null while anyone is connected);
                                  // server.js throws away rooms that stay empty too long
  }

  get started() { return this.game !== null; }

  // ---- People coming and going ----

  // Add a person. Returns their seat number, or an error key ("online.err...") if they cannot join.
  join(name, socket) {
    if (this.started) return "online.err.started";
    if (this.seats.length >= this.settings.players) return "online.err.full";
    const token = crypto.randomBytes(18).toString("base64url");      // 144 random bits
    this.seats.push({ name, token, socket, awayTimer: null });
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
    if (this.started) this.game.seatBack(s);                     // no-op unless a CPU was playing for them
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
    if (!this.started) {
      // In the lobby: a player who left is taken off the list (now, or if they do not come back)
      const remove = () => this.removeFromLobby(seat);
      if (forGood) remove(); else seat.awayTimer = setTimeout(remove, LOBBY_LEAVE_MS);
    } else if (forGood) {
      seat.token = null;                                         // no coming back to this seat
      this.game.seatAway(s);
    } else {
      seat.awayTimer = setTimeout(() => this.game && this.game.seatAway(s), AWAY_AFTER_MS);
    }
    if (this.connectedCount() === 0) this.emptySince = Date.now();
    this.sendLobby();
  }

  removeFromLobby(seat) {
    const s = this.seats.indexOf(seat);
    if (s < 0 || this.started) return;
    this.seats.splice(s, 1);
    if (this.host >= this.seats.length || this.host === s) this.host = 0;   // the first player takes over
    else if (s < this.host) this.host--;
    this.sendLobby();
  }

  connectedCount() { return this.seats.filter(seat => seat.socket).length; }

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
    this.sendLobby();
    return null;
  }

  // Deal a new game with the same people (Start, and "New game" after a game ends)
  newGame() {
    const g = this.game;
    const n = Math.max(this.settings.players, this.seats.length);
    const seats = Array.from({ length: n }, (_, p) =>
      p >= this.seats.length ? "cpu" : this.seats[p].token ? "human" : "away");   // (no token: left for good)
    // CPU levels from the host's setting; a person's seat is played at "hard" while they are away
    g.state.cpuLevels = g.CPU_MODES[this.settings.cpuMode].map((level, p) => p < this.seats.length ? "hard" : level);
    g.newGame(n - 1, { seats, names: seats.map((_, p) => p < this.seats.length ? this.seats[p].name : null) });
    // Anyone whose connection is down right now is away from the start
    this.seats.forEach((seat, p) => { if (seat.token && !seat.socket && !seat.awayTimer) g.seatAway(p); });
  }

  // A move from seat s: { name, args }, with seat numbers in the sender's numbering.
  // Returns an error key, or null.
  action(s, name, args) {
    if (!this.started) return "online.err.notStarted";
    const g = this.game;
    const action = Object.hasOwn(g.ACTIONS, name) ? g.ACTIONS[name] : null;
    if (!action || !Array.isArray(args) || args.length !== action.args.length) return "online.err.badMove";
    // Seat arguments: the sender counts from themselves (see view.js); turn them into real seats
    const n = g.state.numPlayers;
    const real = args.map((value, i) =>
      action.args[i] === "seat" && Number.isInteger(value) && value >= 0 && value < n ? realSeat(value, s, n) : value);
    g.runAction(s, name, real);       // checks the types and whether the move is allowed now
    this.queueFlush();                // (a refused move still gets an answer, so the page catches up)
    return null;
  }

  // "New game" after the game is over: any player in the room may press it
  again(s) {
    if (!this.started || !this.game.state.gameOver) return "online.err.notOver";
    this.newGame();
    return null;
  }

  // ---- Sending ----

  send(socket, message) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));   // 1 = OPEN
  }

  // The list of players (for the lobby, and for the page to know who is connected)
  sendLobby() {
    this.seats.forEach((seat, s) => this.send(seat.socket, {
      type: "lobby",
      code: this.code,
      you: s,
      host: this.host,
      started: this.started,
      players: this.settings.players,
      people: this.seats.map(other => ({ name: other.name, connected: Boolean(other.socket), left: !other.token })),
    }));
  }

  // Send everyone their view, once per burst of changes
  queueFlush() {
    if (this.flushQueued || !this.started) return;
    this.flushQueued = true;
    setImmediate(() => {
      this.flushQueued = false;
      if (!this.game) return;
      const deckSize = this.game.deckSize();
      try {
        this.seats.forEach((seat, s) => {
          if (seat.socket) this.send(seat.socket, { type: "view", state: viewFor(this.game.state, s, deckSize) });
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
    if (this.game) this.game.state.timer = null;
    this.game = null;
  }
}

module.exports = { Room, cleanSettings, AWAY_AFTER_MS, SETTING_CHOICES };
