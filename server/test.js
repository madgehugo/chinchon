"use strict";

/* =========================================================
   server/test.js: tests for the online server
   ---------------------------------------------------------
   Usage:  cd server && npm test       (needs npm install first; takes about a minute)
   Starts the server on a free port in this process and connects scripted
   players to it (WebSocket clients from the `ws` package), which play whole
   games with random moves, some of them not allowed. Checks:
     - nobody is ever sent a card they may not see (every view is checked
       against the real game at the moment it is made: the "hidden-card audit")
     - each player sees the table from their own seat (seat 0 = you)
     - moves that are not allowed, and messages that are malformed, change nothing
     - a player whose connection drops is played by the CPU, and gets the same
       seat back with their token; a connection that stops answering pings is closed
     - the next round waits for everyone (or starts anyway after a while), the turn
       limit, reactions, pausing, joining during a game, the room's tally of wins
     - the host's tools: seats, removing a player, handing the room over
     - feedback reports: cleaned, passed on (to a stand-in for GitHub), their limits
     - the limits: nickname cleaning, unknown rooms, full rooms, the host, origins,
       flooding, tries per address; and the goodbye when the server stops
   Exits with a non-zero code if anything failed.
   ========================================================= */

// Short waits for the tests (read by room.js and server.js when they load, so set before require)
process.env.AWAY_AFTER_MS = "300";
process.env.LOBBY_LEAVE_MS = "300";
process.env.CPU_DELAY_MS = "2";
// (read by server.js) Two scripted players against each other move as fast as the server
// answers, about 2,000 messages a second each on a fast machine. At 1,000 the rate limit
// sometimes cut one off mid-round (close code 4008), freezing its view. The flood test still
// trips it: it sends 100 messages at once, and the burst allowance (RATE_BURST) is 30.
process.env.RATE_PER_SECOND = "10000";
process.env.NEXT_ROUND_WAIT_MS = "300";
process.env.SECOND_MS = "30";             // a turn limit of "30 seconds" lasts 900 ms (see TURN_LIMIT_MS)
process.env.HEARTBEAT_MS = "100";
process.env.ROOM_TRIES_PER_MINUTE = "60";

// The 30-second turn limit the tests use, in real milliseconds. Not much shorter: the test must
// catch a player's turn before their time runs out, and a busy machine (other programs, a slow
// GitHub runner) can hold the test up for a few hundred milliseconds.
const TURN_LIMIT_MS = 30 * Number(process.env.SECOND_MS);

const WebSocket = require("ws");
const { loadGame } = require("../tools/harness");

// The hidden-card audit: wrap viewFor before room.js picks it up, so that every view the
// server makes is checked against the real state it was made from.
const viewModule = require("./view");
const realViewFor = viewModule.viewFor;
let audited = 0;
viewModule.viewFor = (state, me, deckSize) => {
  const view = realViewFor(state, me, deckSize);
  auditView(state, me, view);
  return view;
};
// Feedback reports go to this stand-in instead of GitHub (server.js calls feedback.forward,
// so replacing it here, before server.js loads, is enough). forwardFails makes it fail.
const feedbackModule = require("./feedback");
const forwarded = [];
let forwardFails = false;
feedbackModule.forward = async (report) => {
  if (forwardFails) throw new Error("GitHub is down (test)");
  forwarded.push(report);
};
const { cleanReport, issueFor } = feedbackModule;
const { startServer, cleanName, originAllowed } = require("./server");

let failures = 0;
function check(ok, label) {
  if (!ok) { failures++; console.error("FAIL", label); }
  else console.log("ok  ", label);
}
const sleep = ms => new Promise(done => setTimeout(done, ms));
const key = card => card.suit[0] + card.value;              // as cardKey in rules.js

// Every card in a value (an object or array of any depth): objects with a suit
function cardsIn(value, out = []) {
  if (Array.isArray(value)) value.forEach(v => cardsIn(v, out));
  else if (value && typeof value === "object") {
    if (typeof value.suit === "string") out.push(key(value));
    else Object.values(value).forEach(v => cardsIn(v, out));
  }
  return out;
}

// May player `me` see every card in `view`? Only their own hand, the discard pile, cards
// everyone saw being taken (known), and every hand once the round is over (revealed).
let auditFailures = 0;
function auditView(state, me, view) {
  audited++;
  const allowed = new Set([...state.hands[me], ...state.discardPile, ...state.known.flat()].map(key));
  if (state.revealed) state.hands.flat().forEach(card => allowed.add(key(card)));
  const leaked = cardsIn(view).filter(k => !allowed.has(k));
  const hiddenOk = view.drawPile.every(c => c.hidden) &&
                   (state.revealed || view.hands.slice(1).every(hand => hand.every(c => c.hidden)));
  if ((leaked.length || !hiddenOk) && auditFailures++ < 5) {
    console.error("FAIL hidden-card audit: seat", me, "was sent", leaked.join(" ") || "an unhidden hand or pile");
  }
}

/* ---------------------------------------------------------
   A scripted player
   --------------------------------------------------------- */
function connect(port, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}`, origin ? { origin } : {});
    const client = { socket, inbox: [], view: null, turnLeft: null, lobby: null, token: null, code: null, errors: [], closedWith: null };
    socket.on("message", (data) => {
      const m = JSON.parse(data);
      client.inbox.push(m);
      if (m.type === "view") { client.view = m.state; client.turnLeft = m.turnLeft; }
      if (m.type === "lobby") client.lobby = m;
      if (m.type === "joined") { client.token = m.token; client.code = m.code; }
      if (m.type === "error") client.errors.push(m.key);
      if (client.onMessage) client.onMessage(m);
    });
    socket.on("close", (code) => { client.closedWith = code; });
    socket.on("open", () => resolve(client));
    socket.on("error", reject);
  });
}
const send = (client, message) => client.socket.send(typeof message === "string" ? message : JSON.stringify(message));

// Wait until `test()` is true (checked every few ms), or give up after `ms`
async function until(test, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await sleep(5); }
  return false;
}

// The engine, only to work out which closes are legal from a player's view
const rulesEngine = loadGame();
function closeKeys(view) {
  rulesEngine.state.turns = view.turns;
  rulesEngine.state.inGame = view.inGame;
  return rulesEngine.closeOptions(view.hands[0]).map(o => key(view.hands[0][o.index]));
}
const pick = list => list[Math.floor(Math.random() * list.length)];

// Play from `client`'s views with random moves until the game ends (or `stop()` says so).
// Acts at most once per moment of the game, so it does not send the same move again.
function autoplay(client, stop = () => false) {
  let lastMoment = null;
  const act = (name, ...args) => send(client, { type: "action", name, args });
  client.onMessage = (m) => {
    if (m.type !== "view" || stop()) return;
    const v = m.state;
    const moment = [v.deals, v.turns, v.phase, v.currentPlayer, v.layoff && v.layoff.next, v.reentryPending.length].join();
    if (moment === lastMoment) return;
    lastMoment = moment;
    if (v.gameOver) return;
    if (v.phase === "roundOver") {
      if (v.layoff && v.layoff.order[v.layoff.next] === 0) {
        const left = v.roundDetail[0].unmatched;
        const owners = v.roundDetail.map((d, p) => d && p !== 0 && d.melds.length ? p : -1).filter(p => p >= 0);
        if (left.length && owners.length && Math.random() < 0.7) act("layOff", key(pick(left)), pick(owners), 0);
        act("layoffDone");
      } else if (v.reentryPending.includes(0)) {
        act("reenter", Math.random() < 0.7);
      } else if (!v.layoff && !v.reentryPending.length) {
        act("next");
      }
      return;
    }
    if (v.currentPlayer !== 0 || v.seats[0] !== "human") return;
    if (v.phase === "draw") { act("draw", Math.random() < 0.5 ? "deck" : "discard"); return; }
    if (Math.random() < 0.2) act("order", [...v.hands[0]].reverse().map(key));
    const closes = closeKeys(v);
    if (closes.length && Math.random() < 0.8) act("close", pick(closes));
    else act("discard", key(pick(v.hands[0])));
  };
  if (client.view) client.onMessage({ type: "view", state: client.view });   // it may be our move already
}

/* ---------------------------------------------------------
   The tests
   --------------------------------------------------------- */
async function main() {
  // ---- Pure functions ----
  check(cleanName("  Ana  María ") === "Ana María", "cleanName trims and joins spaces");
  check(cleanName("<b>Bob</b>") === "bBobb", "cleanName drops HTML characters");
  check(cleanName("José-Luis_2.0") === "José-Luis_2.0", "cleanName keeps accents, digits and . _ -");
  check(cleanName("x".repeat(40)).length === 16, "cleanName cuts at 16 characters");
  check(cleanName("<>") === null && cleanName(5) === null, "cleanName refuses empty and non-text names");
  check(originAllowed("null", "h") && originAllowed("http://localhost:3000", "h") && originAllowed("http://192.168.1.5:8080", "192.168.1.5:8080"),
        "origins: file://, localhost and the server's own pages are allowed");
  check(!originAllowed("https://evil.example", "192.168.1.5:8080"), "origins: another site is refused");

  const server = await startServer(0);
  const port = server.port;

  // ---- Lobby errors ----
  const lone = await connect(port);
  send(lone, "not json");
  send(lone, { type: "join", code: "ZZZZ", name: "Eve" });
  send(lone, { type: "create", name: "<>" });
  send(lone, { type: "action", name: "draw", args: ["deck"] });
  await until(() => lone.errors.length >= 4);
  check(lone.errors.join() === "online.err.badMessage,online.err.noRoom,online.err.badName,online.err.notInRoom",
        "malformed message, unknown room, bad name, move outside a room: each gets its error");

  // ---- Origin ----
  const refused = await connect(port, "https://evil.example").then(() => false, () => true);
  check(refused, "a page from another site cannot connect");

  // ---- Two people and two CPUs, manual lay-offs ----
  const ana = await connect(port), luis = await connect(port);
  send(ana, { type: "create", name: "Ana", settings: { players: 4, layoffMode: "manual", roundLimit: 5, cpuMode: "mixed" } });
  await until(() => ana.code);
  send(luis, { type: "join", code: ana.code.toLowerCase(), name: "Luis" });
  await until(() => luis.lobby && luis.lobby.people.length === 2);
  check(luis.lobby.you === 1 && luis.lobby.host === 0 && luis.lobby.people[0].name === "Ana", "join with a lower-case code; lobby lists both");
  send(luis, { type: "start" });
  await until(() => luis.errors.length);
  check(luis.errors.includes("online.err.notHost"), "only the host may start");

  send(ana, { type: "start" });
  await until(() => ana.view && luis.view);
  check(ana.view.names[0] === "Ana" && ana.view.names[1] === "Luis" && luis.view.names[0] === "Luis" && luis.view.names[3] === "Ana",
        "each player is seat 0 in their own view, the others in table order");
  check(JSON.stringify(ana.view.seats) === '["human","human","cpu","cpu"]' && luis.view.seats[3] === "human",
        "people first, CPUs in the empty seats");
  check(luis.view.currentPlayer === 3 && ana.view.currentPlayer === 0, "whose turn it is, seen from each side");

  // A move out of turn, and a card Luis does not hold, change nothing
  const before = JSON.stringify(luis.view.hands[0]);
  send(luis, { type: "action", name: "draw", args: ["deck"] });
  send(ana, { type: "action", name: "draw", args: ["deck"] });
  await until(() => ana.view.phase === "discard");
  const toDiscard = ana.view.hands[0][0];
  send(ana, { type: "action", name: "discard", args: ["o99"] });
  send(ana, { type: "action", name: "discard", args: [key(luis.view.hands[0][0])] });
  send(ana, { type: "action", name: "bogus", args: [] });
  await sleep(50);
  check(JSON.stringify(luis.view.hands[0]) === before && luis.view.hands[0].length === 7, "a move out of turn changes nothing");
  check(ana.view.phase === "discard" && ana.view.hands[0].length === 8 && ana.view.currentPlayer === 0,
        "discarding a card you do not hold changes nothing");
  check(ana.errors.includes("online.err.badMove"), "an unknown move is reported");
  send(ana, { type: "action", name: "discard", args: [key(toDiscard)] });
  await until(() => luis.view.currentPlayer === 0);
  check(key(luis.view.discardPile.at(-1)) === key(toDiscard), "Luis sees Ana's discard, then it is his turn");

  // ---- Luis's connection drops: after the wait a CPU plays for him; he comes back ----
  const luisToken = luis.token, code = ana.code;
  autoplay(ana);
  luis.socket.terminate();
  check(await until(() => ana.view.seats[1] === "away", 2000), "a dropped player is marked away after the wait");
  check(await until(() => ana.view.turns > 6 || ana.view.phase === "roundOver", 4000), "the game goes on while he is away (the CPU plays his turns)");
  const back = await connect(port);
  send(back, { type: "rejoin", code, token: "wrong" });
  await until(() => back.errors.length);
  check(back.errors.includes("online.err.noSeat"), "a wrong token gets no seat");
  send(back, { type: "rejoin", code: ` ${code.toLowerCase()} `, token: luisToken });
  check(await until(() => back.view && back.view.seats[0] === "human" && back.view.names[0] === "Luis"), "rejoin with the token: same seat, human again");
  check(await until(() => ana.view.seats[1] === "human"), "Ana sees him back");

  // ---- Play on to the end of the game (round limit 5) ----
  autoplay(back);
  const ended = await until(() => ana.view.gameOver && back.view.gameOver, 60000);
  check(ended, "a whole game is played to the end");
  check(ana.view.winner === (back.view.winner + 1) % 4, "both see the same winner, each from their own seat");
  check(await until(() => ana.lobby.cpuWins + ana.lobby.people.reduce((sum, p) => sum + p.wins, 0) === 1),
        "the room's tally counts the game's winner");

  // ---- Joining after the start: you wait, then play from the next game ----
  const late = await connect(port);
  send(late, { type: "join", code, name: "Late" });
  await until(() => late.lobby && late.lobby.people.length === 3);
  await sleep(50);
  check(late.view === null && late.lobby.started && !late.lobby.people[2].playing && late.lobby.gameOver,
        "someone joining after the start waits (no view of the game they are not in)");
  // A new game in the same room deals them in
  const deals = ana.view.deals;
  autoplay(late);
  send(back, { type: "again" });
  check(await until(() => ana.view.deals > deals && !ana.view.gameOver), "\"again\" deals a new game for the same table");
  check(await until(() => late.view && late.view.names[0] === "Late" && ana.view.names[2] === "Late" && ana.view.seats[2] === "human"),
        "...with the newcomer in the next seat");

  // ---- Full room ----
  const solo = await connect(port), other = await connect(port), third = await connect(port);
  send(solo, { type: "create", name: "Solo", settings: { players: 2 } });
  await until(() => solo.code);
  send(other, { type: "join", code: solo.code, name: "Other" });
  await until(() => other.lobby);
  send(third, { type: "join", code: solo.code, name: "Third" });
  await until(() => third.errors.length);
  check(third.errors.includes("online.err.full"), "a full room refuses another player");
  // In the lobby, someone leaving moves the others up; their seat must still work
  send(solo, { type: "leave" });
  check(await until(() => other.lobby && other.lobby.people.length === 1 && other.lobby.you === 0 && other.lobby.host === 0),
        "when the host leaves the lobby, the next player becomes host");
  send(other, { type: "start" });
  check(await until(() => other.view && other.view.names[0] === "Other"), "the new host can start (seat numbers moved up)");

  // ---- Next round waits for everyone; reactions; the turn limit ----
  const pia = await connect(port), teo = await connect(port);
  send(pia, { type: "create", name: "Pia", settings: { players: 2, turnLimit: 30 } });
  await until(() => pia.code);
  send(teo, { type: "join", code: pia.code, name: "Teo" });
  await until(() => teo.lobby);
  check(pia.lobby.settings.turnLimit === 30 && teo.lobby.settings.deckSize === 40, "the lobby tells everyone the room's rules");
  // The turn limit stays off for the first round, so no turn timer runs while they react and
  // play (on a busy machine TURN_LIMIT_MS is short enough to hand a turn to the CPU now and
  // then, which can leave a scripted player waiting for good). Off BEFORE the start: a timer
  // starts with the first turn, and turning the setting off later would not stop that one.
  // It is back on for the next round.
  const piaRoom = server.rooms.get(pia.code);
  piaRoom.settings.turnLimit = null;
  send(pia, { type: "start" });
  await until(() => pia.view && teo.view);
  send(pia, { type: "react", id: 2 });
  send(pia, { type: "react", id: 3 });                       // too soon after the first: dropped
  send(teo, { type: "react", id: 99 });
  await until(() => teo.errors.includes("online.err.badMessage"));
  await sleep(50);
  const reacts = c => c.inbox.filter(m => m.type === "react");
  check(reacts(pia).length === 1 && reacts(pia)[0].who === 0 && reacts(teo).length === 1 && reacts(teo)[0].who === 1 && reacts(teo)[0].id === 2,
        "a reaction reaches the table, from the sender's seat; one too soon after it is dropped");

  // Each plays until the round is over, and then never again
  const untilRoundOver = c => { let over = false; return () => over || (over = c.view.phase === "roundOver"); };
  autoplay(pia, untilRoundOver(pia));
  autoplay(teo, untilRoundOver(teo));
  check(await until(() => pia.view.phase === "roundOver" && teo.view.phase === "roundOver" && !pia.view.layoff, 60000), "the two play a round");
  piaRoom.settings.turnLimit = 30;
  const deal = pia.view.deals;
  send(pia, { type: "action", name: "next", args: [] });
  check(await until(() => teo.view.ready[1]), "Teo sees that Pia pressed Next round");
  await sleep(50);
  check(pia.view.phase === "roundOver" && pia.view.deals === deal, "the next round waits for Teo...");
  check(await until(() => pia.view.deals === deal + 1, 2000), "...but starts anyway once he made Pia wait long enough");

  // Whoever's turn it is now does nothing: after the turn limit the CPU plays for them.
  // (Found the moment it is told its time, which starts with the new round's first turn.)
  let slow = null;
  await until(() => (slow = [pia, teo].find(c => c.view.currentPlayer === 0 && c.view.seats[0] === "human" && c.turnLeft > 0)));
  // (`slow &&` everywhere below: if no such moment was found, these checks fail one by one
  // instead of the whole test crashing on `slow.view`, so the tests after them still run)
  check(slow && slow.turnLeft <= TURN_LIMIT_MS, "the player whose turn it is is told how long they have");
  check(slow && await until(() => slow.view.seats[0] === "away", TURN_LIMIT_MS + 2000), "when the time is up, the CPU plays for them");
  if (slow) send(slow, { type: "back" });
  check(slow && await until(() => slow.view.seats[0] === "human"), "\"I'm back\" gives them their seat again");

  // ---- Pausing: asked, refused, agreed; the turn limit waits; anyone resumes ----
  const mia = await connect(port), rob = await connect(port);
  send(mia, { type: "create", name: "Mia", settings: { players: 3, turnLimit: 30 } });
  await until(() => mia.code);
  send(rob, { type: "join", code: mia.code, name: "Rob" });
  await until(() => rob.lobby);
  send(mia, { type: "start" });
  // Nobody moves, so the game soon waits on one of them (the CPU's turn, if first, takes 2 ms)
  let waited = null;
  await until(() => (waited = [mia, rob].find(c => c.view && c.view.currentPlayer === 0 && c.view.seats[0] === "human" && c.turnLeft > 0)));
  send(mia, { type: "pause" });
  check(await until(() => rob.lobby.pauseAsk && rob.lobby.pauseAsk.by === 0 && !rob.lobby.paused),
        "asking to pause shows the request to the others, and does not pause yet");
  send(rob, { type: "nopause" });
  check(await until(() => mia.lobby.pauseAsk === null), "a no drops the request");
  send(mia, { type: "pause" });                              // too soon after her last request: ignored
  await sleep(50);
  check(mia.lobby.pauseAsk === null, "a player cannot ask again straight away");
  send(rob, { type: "pause" });
  await until(() => mia.lobby.pauseAsk && mia.lobby.pauseAsk.by === 1);
  send(mia, { type: "pause" });                              // (a request is there: this is her yes)
  check(await until(() => mia.lobby.paused && rob.lobby.paused && !rob.lobby.pauseAsk), "once everyone agrees, the game is paused");
  check(waited && await until(() => waited.turnLeft === null), "a paused game shows no turn countdown");
  const turnsBefore = waited && waited.view.turns;
  if (waited) send(waited, { type: "action", name: "draw", args: ["deck"] });
  await sleep(TURN_LIMIT_MS + 300);
  check(waited && waited.view.turns === turnsBefore && waited.view.phase === "draw" && waited.view.seats[0] === "human",
        "while paused, moves are refused and the turn limit does not run out");
  send(waited === mia ? rob : mia, { type: "resume" });      // (not necessarily the one whose turn it is)
  check(await until(() => !mia.lobby.paused && !rob.lobby.paused), "anyone at the table can resume");
  check(waited && await until(() => waited.turnLeft > 0 && waited.turnLeft <= TURN_LIMIT_MS), "...and the turn countdown is back");
  check(waited && await until(() => waited.view.seats[0] === "away", TURN_LIMIT_MS + 2000), "...and runs out as before");

  // ---- The host's tools ----
  const host = await connect(port), j1 = await connect(port), j2 = await connect(port);
  send(host, { type: "create", name: "Host", settings: { players: 3 } });
  await until(() => host.code);
  send(j1, { type: "join", code: host.code, name: "Uno" });
  await until(() => j1.lobby);
  send(j2, { type: "join", code: host.code, name: "Dos" });
  await until(() => host.lobby && host.lobby.people.length === 3);
  send(host, { type: "players", players: 2 });
  send(j1, { type: "players", players: 4 });
  await until(() => host.errors.length && j1.errors.length);
  check(host.errors.includes("online.err.seatsTaken") && j1.errors.includes("online.err.notHost"),
        "fewer seats than people, or a change by someone else, is refused");
  send(host, { type: "remove", seat: 2 });
  check(await until(() => j2.errors.includes("online.err.removed") && host.lobby.people.length === 2), "the host can remove a player");
  send(host, { type: "players", players: 2 });
  check(await until(() => j1.lobby.players === 2), "...and change the number of seats");
  send(host, { type: "host", seat: 1 });
  check(await until(() => j1.lobby.host === 1 && j1.lobby.you === 1), "...and hand the room to another player");

  // ---- A connection that stops answering pings is closed ----
  const ghost = await connect(port);
  send(ghost, { type: "ping" });
  check(await until(() => ghost.inbox.some(m => m.type === "pong")), "a ping message gets a pong");
  send(ghost, { type: "join", code: host.code, name: "Ghost" });
  await until(() => j1.lobby.people.length === 2 && ghost.errors.includes("online.err.full"));
  send(j1, { type: "players", players: 3 });
  await until(() => j1.lobby.players === 3);
  send(ghost, { type: "join", code: host.code, name: "Ghost" });
  await until(() => j1.lobby.people.length === 3);
  ghost.socket.pause();                                      // stops reading, so it never answers a ping
  check(await until(() => j1.lobby.people[2] && !j1.lobby.people[2].connected, 2000), "a silent connection is closed by the heartbeat");

  // ---- Flooding ----
  const flood = await connect(port);
  for (let i = 0; i < 100; i++) send(flood, { type: "leave" });
  check(await until(() => flood.closedWith === 4008), "a connection that floods the server is closed");

  // ---- Too many tries at rooms from one address ----
  const guesser = await connect(port);
  for (let i = 0; i < 70; i++) {
    send(guesser, { type: "join", code: "ZZZZ", name: "Guess" });
    if (i % 10 === 9) await sleep(20);                     // (slower than the flood limit)
  }
  check(await until(() => guesser.errors.includes("online.err.tooMany")), "an address trying too many rooms is told to wait");

  // ---- Feedback reports ----
  const r = cleanReport({ kind: "bug", text: "  It froze\u0007 \r\nafter a close  ",
                          details: { userAgent: "Test/1", round: 3, phase: { a: 1 }, secret: "x" } });
  check(r && r.text === "It froze \nafter a close" && r.contact === "" &&
        JSON.stringify(r.details) === JSON.stringify({ userAgent: "Test/1", round: 3 }),
        "cleanReport: control characters out, only known details that are plain values");
  check(cleanReport({ kind: "rant", text: "x" }) === null && cleanReport({ kind: "idea", text: "   " }) === null &&
        cleanReport({ kind: "idea", text: "x".repeat(1001) }) === null && cleanReport({ kind: "idea", text: 5 }) === null &&
        cleanReport({ kind: "idea", text: "x", contact: "y".repeat(101) }) === null,
        "cleanReport: a bad kind, an empty, too long or non-text message, a too long contact are refused");
  check(cleanReport({ kind: "idea", text: "😀".repeat(1000) }) !== null, "...and 1000 emoji are 1000 characters, not 2000");
  const sneaky = issueFor(cleanReport({ kind: "other", text: "```\n@someone [x](https://evil.example)\n```", contact: "@me" }));
  check(sneaky.body.includes("````\n```\n@someone [x](https://evil.example)\n```\n````") && sneaky.body.includes("```\n@me\n```") &&
        sneaky.title.startsWith("[other] "),
        "issueFor: the player's text sits in a code block it cannot close (no links or @mentions)");

  const reporter = await connect(port);                       // never joins a room
  const answers = () => reporter.inbox.filter(m => m.type === "feedbackSent" || m.type === "error").length;
  const report = { type: "feedback", kind: "bug", text: "The cards vanished", contact: "a@b.c", details: { lang: "en", evil: "x" } };
  send(reporter, report);
  check(await until(() => reporter.inbox.some(m => m.type === "feedbackSent")) && forwarded.length === 1 &&
        forwarded[0].text === "The cards vanished" && forwarded[0].contact === "a@b.c" && !("evil" in forwarded[0].details),
        "a report is passed on without being in a room, and the page is told");
  send(reporter, { type: "feedback", kind: "bug", text: "" });
  check(await until(() => reporter.errors.includes("feedback.err.bad")), "an empty report is refused");
  forwardFails = true;
  send(reporter, report);
  check(await until(() => reporter.errors.includes("feedback.err.failed")), "a report that cannot be delivered: the page is told");
  forwardFails = false;
  for (let i = 0; i < 3; i++) {                               // (one at a time: each waits for its answer)
    const before = answers();
    send(reporter, report);
    await until(() => answers() > before);
  }
  send(reporter, report);
  check(await until(() => reporter.errors.includes("feedback.err.tooMany")) && forwarded.length === 4,
        "the sixth report from one address in an hour is refused");

  check(auditFailures === 0 && audited > 100, `hidden-card audit: ${audited} views checked, nothing leaked`);

  // ---- The server stops: everyone is told why ----
  await server.shutdown();
  check(pia.errors.includes("online.err.restart") && pia.closedWith === 1012, "when the server stops, every player is told it restarted");
  for (const c of [lone, ana, back, late, solo, other, third, pia, teo, mia, rob, host, j1, j2, ghost, guesser, reporter]) c.socket.terminate();
  console.log(failures ? `${failures} FAILED` : "server tests passed");
  process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
