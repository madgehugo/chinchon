/* =========================================================
   net.js: where a player's moves go, and the online connection
   ---------------------------------------------------------
   ui.js never calls the game's move functions directly. It calls act(name, ...)
   with the name of one of the ACTIONS in game.js ("draw", "discard", ...), and
   act() decides where the move goes:
     - on one device, straight into the game, for you in seat 0;
     - in an online game, to the server (server/server.js), which runs the real
       game and sends back a VIEW of it: `state` as you may see it, with the
       other hands hidden and the seats renumbered so that you are seat 0
       (server/view.js). applyView() puts that view into `state` and calls
       render(), so ui.js draws an online game exactly as it draws a local one.

   The connection is a WebSocket: a connection to the server that stays open,
   so the server can send a new view whenever anybody moves. Messages are small
   JSON objects with a `type` (the list is at the top of server/server.js).
   When the connection drops (a phone locks, the network changes), it is opened
   again by itself and you "rejoin" your seat with the token the server gave you.
   The server waits 30 seconds for you before a CPU plays for you. When the page
   comes back to the screen it checks at once that the connection still works
   (checkConnection), since a phone may have dropped it without noticing.

   The server may be asleep (a free hosting plan stops it when nobody plays), and
   then the first connection takes up to a minute. So the connection is opened as
   soon as the online sheet opens (warmUpServer), and the sheet says the server is
   waking up when it takes a while.

   The same connection carries feedback reports (sendFeedback, for ui_feedback.js),
   opening one just for the report when you are not playing online.

   This file never touches the page: it changes `online` and `state` and calls
   render(), like game.js. The online sheet in ui.js shows `online`.
   ========================================================= */

"use strict";

// The online server (server/ in this repo, running on Render). wss:// is the encrypted
// WebSocket form of https://. (Testing: a page opened from the server itself on this
// computer or the home network finds it at the same address instead; ?server=ws://...
// in the page address picks any other one.)
const SERVER_URL = "wss://chinchon.onrender.com";
const ROOM_STORAGE_KEY = "chinchon-room";        // localStorage: { code, token } of the room you are in
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];   // waits between tries after a dropped connection
const WAKING_AFTER_MS = 5000;                    // connecting for longer than this: say the server is waking up
const PONG_WAIT_MS = 4000;                       // checkConnection: no answer within this long means the connection is dead
// Errors after which the room is gone for us: stop trying to get back in
const ROOM_GONE_ERRORS = ["online.err.noRoom", "online.err.noSeat", "online.err.restart", "online.err.removed"];
// Fields of `state` that belong to this screen, not to the game: a view from the server
// never overwrites them (where your panels are, closing mode, how you sort your hand)
const VIEWER_FIELDS = ["closing", "sortMode", "showHints", "showSettings", "showHelp", "showScores",
                       "showResults", "showOnline", "timer"];

// Everything about the online connection. ui.js reads it to draw the online sheet.
const online = {
  socket: null,        // the WebSocket, while one is open or opening
  connection: "off",   // "off" | "connecting" | "open" | "lost" (dropped; trying again)
  waking: false,       // true while connecting has taken longer than WAKING_AFTER_MS
  code: null,          // the room you are in ("K7QF"), or null
  token: null,         // your secret for coming back to your seat (never shown to anybody)
  lobby: null,         // the last list of players from the server (see sendLobby in server/room.js)
  error: null,         // the last problem, as a text key ("online.err...") for the online sheet
  playing: false,      // true once a view has arrived: the table shows the online game
  tries: 0,            // reconnection attempts since the connection dropped
  queued: null,        // a create or join waiting for the connection to open...
  asking: false,       // ...or sent, and waiting for the server's answer
  turnEndsAt: null,    // when your time for this turn runs out (Date.now() time), or null if no limit is running
  reaction: null,      // the latest reaction from anyone: { who, id, n } (n counts them, so ui.js shows each once)
  lastPong: 0,         // when the server last answered a ping (checkConnection)
  // A feedback report (sendFeedback): status "idle" | "sending" | "sent" | "failed", the
  // error key if it failed, and the report itself while it waits for the connection to open
  feedback: { status: "idle", error: null, waiting: null },
  feedbackSocket: null, // a connection opened only for feedback, closed again once it is answered
};

// Do move `name` (one of ACTIONS in game.js) with its arguments, as you (seat 0).
// On one device this returns what the move returned (false = it was not allowed). Online it
// returns true once the move is sent; the server's answer (a new view) redraws the table.
function act(name, ...args) {
  // The tutorial allows only the move its coach asks for (tutorialAllows in tutorial.js,
  // which is loaded later but is there by the time anyone clicks)
  if (!tutorialAllows(name, args)) { tutorialNudge(); return false; }
  if (!online.playing) return runAction(0, name, args);
  if (online.connection !== "open") return false;
  // A paused game takes no moves, except rearranging your hand (the server refuses them too)
  if (onlinePaused() && name !== "order") return false;
  // Rearranging your hand shows at once rather than after the server's answer (a drag that
  // jumps back for a moment looks broken); the server's view then puts it the same way
  if (name === "order") setHandOrder(0, args[0]);
  sendOnline({ type: "action", name, args });
  return true;
}

/* ---------------------------------------------------------
   Connecting
   --------------------------------------------------------- */

// Where the server is, or null if there is none to use (then ui.js hides "Play online")
function serverUrl() {
  const asked = new URLSearchParams(location.search).get("server");
  if (asked) return asked;
  // A page served by the game server on this computer or the home network (npm start in
  // server/, for testing): the server is at the same address, not the published one.
  // ws:// is the WebSocket form of http://.
  const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/;
  if (location.protocol === "http:" && local.test(location.hostname) && !window.Capacitor) {
    return `ws://${location.host}`;
  }
  return SERVER_URL || null;
}

// Open the connection, then, if we are in a room already, rejoin it, or else send the
// create or join waiting in online.queued (if any)
function connectOnline() {
  const url = serverUrl();
  if (!url) { online.error = "online.err.noServer"; render(); return; }
  if (online.socket) online.socket.close();
  online.connection = "connecting";
  online.waking = false;
  render();
  let socket;
  try { socket = new WebSocket(url); } catch (err) { online.connection = "off"; online.error = "online.err.noServer"; render(); return; }
  online.socket = socket;
  // Still not open after a few seconds: the server is probably starting up (see the top of this file)
  setTimeout(() => {
    if (online.socket === socket && socket.readyState === WebSocket.CONNECTING) { online.waking = true; render(); }
  }, WAKING_AFTER_MS);

  // (addEventListener with an arrow function, like the click handlers in ui.js)
  socket.addEventListener("open", () => {
    online.connection = "open";
    online.waking = false;
    online.tries = 0;
    if (online.code && online.token) sendOnline({ type: "rejoin", code: online.code, token: online.token });
    else sendQueued();
    if (online.feedback.waiting) {
      sendOnline(online.feedback.waiting);
      online.feedback.waiting = null;
    }
    render();
  });
  socket.addEventListener("message", (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    handleServerMessage(m);
  });
  socket.addEventListener("close", () => {
    if (online.socket !== socket) return;          // an old connection we replaced
    online.socket = null;
    online.waking = false;
    // A report on its way gets no answer now: say so (the sheet keeps the text, to try again)
    if (online.feedback.status === "sending") online.feedback = { status: "failed", error: "online.err.noServer", waiting: null };
    if (online.code) {
      // In a room: keep trying, more slowly each time (backoff)
      online.connection = "lost";
      const wait = RECONNECT_DELAYS_MS[Math.min(online.tries, RECONNECT_DELAYS_MS.length - 1)];
      online.tries++;
      setTimeout(() => { if (online.code && !online.socket) connectOnline(); }, wait);
    } else {
      online.connection = "off";
      // A create or join that never got an answer: the server could not be reached
      if ((online.queued || online.asking) && !online.error) online.error = "online.err.noServer";
      online.queued = null;
      online.asking = false;
    }
    render();
  });
}

// Send the create or join that was waiting for the connection
function sendQueued() {
  if (!online.queued) return;
  sendOnline(online.queued);
  online.queued = null;
  online.asking = true;
}

// Open the connection without joining anything yet, so that a sleeping server starts
// waking up while you type your name (ui.js calls this when the online sheet opens)
function warmUpServer() {
  if (!online.socket && !online.code && serverUrl()) connectOnline();
}

// The page is back on the screen (or the device is back online): make sure the connection
// to our room still works. A dropped one is opened again now rather than after the backoff
// wait; an open one is asked for a "pong", and if none comes, it was dead and is replaced.
function checkConnection() {
  if (!online.code) return;
  if (!online.socket) { connectOnline(); return; }
  if (online.socket.readyState !== WebSocket.OPEN) return;      // (still connecting)
  const socket = online.socket, asked = Date.now();
  sendOnline({ type: "ping" });
  setTimeout(() => {
    if (online.socket === socket && online.lastPong < asked) {
      online.socket = null;                        // so its "close" event is ignored...
      socket.close();
      connectOnline();                             // ...and a new connection takes over
    }
  }, PONG_WAIT_MS);
}

function sendOnline(message) {
  if (online.socket && online.socket.readyState === WebSocket.OPEN) online.socket.send(JSON.stringify(message));
}

// Create a room (you are its host) or join one with its code. The message goes at once if
// the connection is open, when it opens if it is opening, or else on a new connection.
function createRoom(name, settings) {
  askServer({ type: "create", name, settings });
}
function joinRoom(code, name) {
  askServer({ type: "join", code, name });
}
function askServer(message) {
  online.error = null;
  online.queued = message;
  if (online.socket && online.socket.readyState === WebSocket.OPEN) sendQueued();
  else if (!online.socket) connectOnline();
  render();
}

// Room messages from ui.js: "I'm back", a reaction, pausing, the host's tools and the vote on
// new rules (see server/server.js)
const sendBack      = ()     => sendOnline({ type: "back" });
const sendReaction  = id     => sendOnline({ type: "react", id });
const sendPause     = ()     => sendOnline({ type: "pause" });     // ask to pause, or agree to pause
const sendNoPause   = ()     => sendOnline({ type: "nopause" });   // say no to pausing (or take back your request)
const sendResume    = ()     => sendOnline({ type: "resume" });
const setRoomPlayers = n     => sendOnline({ type: "players", players: n });
const proposeRules  = settings => sendOnline({ type: "rules", settings });   // the host's new rules
const sendRulesYes  = ()     => sendOnline({ type: "rulesyes" });  // agree to the new rules
const sendRulesNo   = ()     => sendOnline({ type: "rulesno" });   // say no to them (or take back your request)
const removePlayer  = seat   => sendOnline({ type: "remove", seat });
const makeHost      = seat   => sendOnline({ type: "host", seat });

// Send a report to the developer: { kind, text, contact, details } (see server/feedback.js).
// It goes at once if the connection is open, or when it opens; with no connection, one is
// opened for it (and closed again by feedbackAnswered).
function sendFeedback(report) {
  const message = { type: "feedback", ...report };      // (...: copy in the report's fields)
  online.feedback = { status: "sending", error: null, waiting: null };
  if (online.socket && online.socket.readyState === WebSocket.OPEN) sendOnline(message);
  else {
    online.feedback.waiting = message;
    if (!online.socket) { connectOnline(); online.feedbackSocket = online.socket; }
  }
  render();
}
// The server answered a report (status "sent" or "failed")
function feedbackAnswered(status, error) {
  online.feedback = { status, error, waiting: null };
  closeFeedbackSocket();
}
// Close the connection opened only for feedback (the feedback sheet opens one as it opens,
// so a sleeping server wakes up while you type), unless the online sheet or a room is
// using it by now, or a report is still on its way
function closeFeedbackSocket() {
  const socket = online.socket;
  if (socket && socket === online.feedbackSocket && online.feedback.status !== "sending" &&
      !online.code && !online.queued && !online.asking && !state.showOnline) {
    socket.close();                              // (its "close" event sets the connection to "off")
  }
  if (online.feedback.status !== "sending") online.feedbackSocket = null;
}

// Leave the room for good, and go back to the game on this device
function leaveRoom() {
  sendOnline({ type: "leave" });
  if (online.socket) online.socket.close();
  online.socket = null;
  online.connection = "off";
  exitRoom();
  render();
}

// Out of the room (you left, or it is gone): forget it, and if its game was on the table,
// bring back the game on this device. Returns true if a game was brought back.
function exitRoom() {
  const wasPlaying = online.playing;
  forgetRoom();
  online.lobby = null;
  online.playing = false;
  online.turnEndsAt = null;
  if (wasPlaying) restoreLocalGame();   // (ui.js: the game you had before going online)
  return wasPlaying;
}

// Was this page in a room when it was last closed (a reload, the app killed in the
// background)? Then go back in. Called once at startup by ui.js.
function resumeRoom() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY)); } catch (err) { /* none */ }
  if (!saved || typeof saved.code !== "string" || typeof saved.token !== "string" || !serverUrl()) return;
  online.code = saved.code;
  online.token = saved.token;
  connectOnline();
}

function rememberRoom() {
  try { localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ code: online.code, token: online.token })); } catch (err) { /* fine */ }
}
function forgetRoom() {
  online.code = online.token = null;
  try { localStorage.removeItem(ROOM_STORAGE_KEY); } catch (err) { /* fine */ }
}

// Is the online game on the table paused? (everyone agreed; see server/room.js)
function onlinePaused() {
  return Boolean(online.playing && online.lobby && online.lobby.paused);
}

/* ---------------------------------------------------------
   What the server says
   --------------------------------------------------------- */
function handleServerMessage(m) {
  switch (m.type) {
    case "joined":
      online.code = m.code;
      online.token = m.token;
      online.error = null;
      online.asking = false;
      rememberRoom();
      break;
    case "lobby":
      online.lobby = m;
      break;
    case "view":
      // How long you have for this turn, as a time on this device's own clock (the two
      // clocks need not agree, so the server sends "milliseconds from now")
      online.turnEndsAt = m.turnLeft === null || m.turnLeft === undefined ? null : Date.now() + m.turnLeft;
      applyView(m.state);
      return;                                      // (applyView draws the table itself)
    case "react":
      online.reaction = { who: m.who, id: m.id, n: (online.reaction ? online.reaction.n : 0) + 1 };
      break;
    case "pong":
      online.lastPong = Date.now();
      return;                                      // (nothing to redraw)
    case "feedbackSent":
      feedbackAnswered("sent", null);
      break;
    case "error":
      // About a feedback report: for the feedback sheet, not the online one
      if (typeof m.key === "string" && m.key.startsWith("feedback.err.")) {
        feedbackAnswered("failed", m.key);
        break;
      }
      online.error = m.key;
      online.asking = false;
      // Our room or seat is gone (the server restarted, the room was thrown away, the host
      // removed us): stop trying, and go back to the game on this device
      // (and if that ends a game on the table, the online sheet says what happened)
      if (ROOM_GONE_ERRORS.includes(m.key) && exitRoom()) state.showOnline = true;
      break;
  }
  render();
}

// Put the server's view of the game into `state` and draw it
function applyView(view) {
  if (!online.playing) {
    // The first view: leave the game on this device (it is saved, see ui.js) for the online one
    saveGame();                                    // (ui.js; it saves nothing once online.playing is true)
    clearTimeout(state.timer);                     // no CPU of the local game may move from now on
    state.timer = null;
    online.playing = true;
    state.showOnline = false;                      // the sheet makes way for the table
  }
  const before = { phase: state.phase, deals: state.deals, status: JSON.stringify(state.status) };
  setDeckSize(view.deckSize);
  for (const key of Object.keys(state)) {
    if (key in view && !VIEWER_FIELDS.includes(key) && key !== "status") state[key] = view[key];
  }
  relinkCards();                                   // (game.js) cards that are the same card are the same object

  // The results panel opens when a round ends, as on one device, and otherwise stays the
  // way you left it (a view arrives every time anybody does anything)
  if (state.phase !== "roundOver") state.showResults = false;
  else if (before.phase !== "roundOver" || before.deals !== state.deals) state.showResults = true;
  if (state.currentPlayer !== 0 || state.phase !== "discard") state.closing = false;

  render();
  // setStatus (ui.js) also shows the toast of another player's draw, so only call it for news
  if (JSON.stringify(view.status) !== before.status) setStatus(...view.status);
}
