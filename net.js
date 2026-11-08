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
   The server waits 30 seconds for you before a CPU plays for you.

   This file never touches the page: it changes `online` and `state` and calls
   render(), like game.js. The online sheet in ui.js shows `online`.
   ========================================================= */

"use strict";

// The online server, once it is running somewhere, e.g. "wss://chinchon.example.com".
// Empty: no server yet. (Testing: a page opened from the server itself on this computer
// or the home network finds it at the same address; ?server=ws://... in the page
// address picks any other one.)
const SERVER_URL = "";
const ROOM_STORAGE_KEY = "chinchon-room";        // localStorage: { code, token } of the room you are in
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];   // waits between tries after a dropped connection
// Fields of `state` that belong to this screen, not to the game: a view from the server
// never overwrites them (where your panels are, closing mode, how you sort your hand)
const VIEWER_FIELDS = ["closing", "sortMode", "showHints", "showSettings", "showHelp", "showScores",
                       "showResults", "showOnline", "timer"];

// Everything about the online connection. ui.js reads it to draw the online sheet.
const online = {
  socket: null,        // the WebSocket, while one is open or opening
  connection: "off",   // "off" | "connecting" | "open" | "lost" (dropped; trying again)
  code: null,          // the room you are in ("K7QF"), or null
  token: null,         // your secret for coming back to your seat (never shown to anybody)
  lobby: null,         // the last list of players from the server (see sendLobby in server/room.js)
  error: null,         // the last problem, as a text key ("online.err...") for the online sheet
  playing: false,      // true once a view has arrived: the table shows the online game
  tries: 0,            // reconnection attempts since the connection dropped
};

// Do move `name` (one of ACTIONS in game.js) with its arguments, as you (seat 0).
// On one device this returns what the move returned (false = it was not allowed). Online it
// returns true once the move is sent; the server's answer (a new view) redraws the table.
function act(name, ...args) {
  if (!online.playing) return runAction(0, name, args);
  if (online.connection !== "open") return false;
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
  if (SERVER_URL) return SERVER_URL;
  // A page served by the game server on this computer or the home network (npm start in
  // server/): the server is at the same address. ws:// is the WebSocket form of http://.
  const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/;
  if (location.protocol === "http:" && local.test(location.hostname) && !window.Capacitor) {
    return `ws://${location.host}`;
  }
  return null;
}

// Open the connection, then send `first` (create or join) or, if we are in a room
// already, rejoin it
function connectOnline(first) {
  const url = serverUrl();
  if (!url) { online.error = "online.err.noServer"; render(); return; }
  if (online.socket) online.socket.close();
  online.connection = "connecting";
  render();
  let socket;
  try { socket = new WebSocket(url); } catch (err) { online.connection = "off"; online.error = "online.err.noServer"; render(); return; }
  online.socket = socket;

  // (addEventListener with an arrow function, like the click handlers in ui.js)
  socket.addEventListener("open", () => {
    online.connection = "open";
    online.tries = 0;
    if (online.code && online.token) sendOnline({ type: "rejoin", code: online.code, token: online.token });
    else if (first) sendOnline(first);
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
    if (online.code) {
      // In a room: keep trying, more slowly each time (backoff)
      online.connection = "lost";
      const wait = RECONNECT_DELAYS_MS[Math.min(online.tries, RECONNECT_DELAYS_MS.length - 1)];
      online.tries++;
      setTimeout(() => { if (online.code && !online.socket) connectOnline(null); }, wait);
    } else {
      online.connection = "off";
      if (first && !online.error) online.error = "online.err.noServer";   // never got in
    }
    render();
  });
}

function sendOnline(message) {
  if (online.socket && online.socket.readyState === WebSocket.OPEN) online.socket.send(JSON.stringify(message));
}

// Create a room (you are its host) or join one with its code
function createRoom(name, settings) {
  online.error = null;
  connectOnline({ type: "create", name, settings });
}
function joinRoom(code, name) {
  online.error = null;
  connectOnline({ type: "join", code, name });
}

// Leave the room for good, and go back to the game on this device
function leaveRoom() {
  sendOnline({ type: "leave" });
  const wasPlaying = online.playing;
  forgetRoom();
  if (online.socket) online.socket.close();
  online.socket = null;
  online.connection = "off";
  online.lobby = null;
  online.playing = false;
  if (wasPlaying) restoreLocalGame();   // (ui.js: the game you had before going online)
  render();
}

// Was this page in a room when it was last closed (a reload, the app killed in the
// background)? Then go back in. Called once at startup by ui.js.
function resumeRoom() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY)); } catch (err) { /* none */ }
  if (!saved || typeof saved.code !== "string" || typeof saved.token !== "string" || !serverUrl()) return;
  online.code = saved.code;
  online.token = saved.token;
  connectOnline(null);
}

function rememberRoom() {
  try { localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ code: online.code, token: online.token })); } catch (err) { /* fine */ }
}
function forgetRoom() {
  online.code = online.token = null;
  try { localStorage.removeItem(ROOM_STORAGE_KEY); } catch (err) { /* fine */ }
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
      rememberRoom();
      break;
    case "lobby":
      online.lobby = m;
      break;
    case "view":
      applyView(m.state);
      return;                                      // (applyView draws the table itself)
    case "error":
      online.error = m.key;
      // Our room or seat is gone (the server restarted, or the room was thrown away): stop trying
      if (m.key === "online.err.noRoom" || m.key === "online.err.noSeat") {
        const wasPlaying = online.playing;
        forgetRoom();
        online.lobby = null;
        online.playing = false;
        if (wasPlaying) restoreLocalGame();
      }
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
