"use strict";

/* =========================================================
   server/server.js: the online game server
   ---------------------------------------------------------
   Usage:  cd server && npm install && npm start      (PORT=8080 by default)

   Players' pages connect here over a WebSocket: a connection that stays open,
   so both sides can send messages whenever they like (unlike a normal web
   request, where only the page asks). Every message is a small JSON object
   with a `type`:

     page -> server
       create  { name, settings }   make a room; you are its host
       join    { code, name }       sit down in a room's lobby
       rejoin  { code, token }      come back to your seat (after a reload or a lost connection)
       start   {}                   the host starts the game
       action  { name, args }       a move: one of ACTIONS in game.js
       again   {}                   a new game in the same room, once a game is over
       leave   {}                   leave the room for good
     server -> page
       joined  { code, token }      you are in; keep the token to rejoin
       lobby   { code, you, host, started, players, people }   who is in the room
       view    { state }            the game as you may see it (server/view.js)
       error   { key }              something went wrong; key is a text key in i18n.js

   The server checks everything a page sends: a page can be changed by whoever
   uses it, so it is never trusted. Moves go through runAction (game.js), which
   checks their types and whether they are allowed.

   It also serves the game's own files (the list in ../sw.js), so phones on the
   same Wi-Fi can open http://<this computer's address>:8080 while you test.
   ========================================================= */
const fs = require("fs");
const path = require("path");
const http = require("http");
const vm = require("vm");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { Room } = require("./room");

const PORT = Number(process.env.PORT) || 8080;
const MAX_ROOMS = 500;                       // rooms at once (a bound on memory use)
const MAX_MESSAGE_BYTES = 4096;              // a bigger message is refused (the biggest real one is ~300 bytes)
const RATE_PER_SECOND = Number(process.env.RATE_PER_SECOND) || 10;   // messages a connection may send per second, on average...
                                             // (test.js raises it: its players move far faster than people)
const RATE_BURST = 30;                       // ...and in one burst
const MAX_NAME = 16;                         // characters in a nickname
const EMPTY_ROOM_MS = 30 * 60 * 1000;        // a room nobody has been connected to for this long is thrown away
const SWEEP_EVERY_MS = 60 * 1000;            // how often to look for such rooms
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no I/L/1 or O/0, which look alike
const CODE_LENGTH = 4;
// Web pages allowed to connect, besides pages served by this server and local testing. The
// published game's address goes here, e.g. ALLOWED_ORIGINS=https://madgehugo.github.io
// (several separated by commas). "null" is a page opened from disk (file://), and the two
// localhost ones are the store apps (Capacitor on iOS and Android).
const ALLOWED_ORIGINS = new Set(["null", "capacitor://localhost", "https://localhost",
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)]);

/* ---------------------------------------------------------
   Serving the game's files (for testing on phones over Wi-Fi)
   --------------------------------------------------------- */
const ROOT = path.join(__dirname, "..");
// The files the page loads: APP_FILES in sw.js (read the way app/copy_web.js does), plus sw.js itself
const swText = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const GAME_FILES = new Set([...vm.runInNewContext(swText.match(/const APP_FILES = (\[[\s\S]*?\]);/)[1]), "sw.js"]
  .filter(f => f !== "./"));
const CONTENT_TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".webmanifest": "application/manifest+json" };

function serveFile(req, res) {
  const url = new URL(req.url, "http://x");                  // (only the path matters here)
  if (url.pathname === "/health") { res.end("ok"); return; } // for hosting services that check the server is up
  let file = "index.html";
  try { if (url.pathname !== "/") file = decodeURIComponent(url.pathname.slice(1)); } catch (err) { file = ""; }
  if (!GAME_FILES.has(file)) { res.writeHead(404); res.end("not found"); return; }   // only the game's own files
  res.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(file)] || "application/octet-stream",
                       "Cache-Control": "no-cache" });
  fs.createReadStream(path.join(ROOT, file)).pipe(res);
}

/* ---------------------------------------------------------
   Checking what pages send
   --------------------------------------------------------- */

// A nickname as it may be shown to others: letters (any alphabet), digits, spaces and . _ -
// only, at most MAX_NAME characters. Returns null if nothing is left.
// (\p{L} = any letter, \p{M} = accents written as separate marks, \p{N} = any digit;
// Array.from splits by character, so an emoji or accented letter is never cut in half.)
function cleanName(name) {
  if (typeof name !== "string") return null;
  const clean = name.normalize("NFC").replace(/[^\p{L}\p{M}\p{N} ._-]/gu, "").replace(/\s+/g, " ").trim();
  return Array.from(clean).slice(0, MAX_NAME).join("").trim() || null;
}

// May a page from `origin` connect? Pages served by this server, local testing, and the
// addresses in ALLOWED_ORIGINS. (A program that is not a browser can claim any origin; this
// only stops other web sites from using the server from their pages.)
function originAllowed(origin, host) {
  if (!origin || ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.host === host || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch (err) {
    return false;
  }
}

function newCode(rooms) {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

/* ---------------------------------------------------------
   The server
   --------------------------------------------------------- */
function startServer(port = PORT) {
  const rooms = new Map();                   // code -> Room
  const httpServer = http.createServer(serveFile);
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ origin, req }) => originAllowed(origin, req.headers.host),
  });

  wss.on("connection", (socket) => {
    // What this connection is: which room and seat (once it has joined), and its message allowance.
    // The seat is kept as the object in room.seats, not its number: in the lobby the numbers
    // move up when someone leaves. seatNumber() looks the number up when it is needed.
    const conn = { room: null, seat: null, allowance: RATE_BURST, last: Date.now() };
    const seatNumber = () => conn.room.seats.indexOf(conn.seat);
    const send = message => socket.send(JSON.stringify(message));
    const fail = key => send({ type: "error", key });

    socket.on("message", (data) => {
      // Rate limit ("token bucket"): the allowance grows by RATE_PER_SECOND each second up to
      // RATE_BURST, and each message spends one. A page that floods the server is cut off.
      const now = Date.now();
      conn.allowance = Math.min(RATE_BURST, conn.allowance + (now - conn.last) / 1000 * RATE_PER_SECOND);
      conn.last = now;
      if (--conn.allowance < 0) { socket.close(4008, "too many messages"); return; }

      let m;
      try { m = JSON.parse(data); } catch (err) { fail("online.err.badMessage"); return; }
      if (!m || typeof m !== "object") { fail("online.err.badMessage"); return; }
      // A bug must not stop the server for every other room: report it and carry on
      try { handle(m); } catch (err) { console.error(err); fail("online.err.server"); }
    });

    socket.on("close", () => {
      if (conn.room) conn.room.disconnect(seatNumber(), false, socket);
    });

    // Sit this connection in seat `s` of `room` (or report the error key that join/rejoin returned)
    function seated(room, s) {
      if (typeof s === "string") { fail(s); return; }
      conn.room = room;
      conn.seat = room.seats[s];
      send({ type: "joined", code: room.code, token: room.seats[s].token });
      room.sendLobby();
      room.queueFlush();
    }

    function handle(m) {
      const room = conn.room;
      switch (m.type) {
        case "create": {
          if (room) return fail("online.err.inRoom");
          const name = cleanName(m.name);
          if (!name) return fail("online.err.badName");
          if (rooms.size >= MAX_ROOMS) return fail("online.err.busy");
          const created = new Room(newCode(rooms), m.settings);
          rooms.set(created.code, created);
          return seated(created, created.join(name, socket));
        }
        case "join": {
          if (room) return fail("online.err.inRoom");
          const name = cleanName(m.name);
          if (!name) return fail("online.err.badName");
          const target = typeof m.code === "string" && rooms.get(m.code.trim().toUpperCase());
          if (!target) return fail("online.err.noRoom");
          return seated(target, target.join(name, socket));
        }
        case "rejoin": {
          if (room) return fail("online.err.inRoom");
          const target = typeof m.code === "string" && rooms.get(m.code.toUpperCase());
          if (!target) return fail("online.err.noRoom");
          if (typeof m.token !== "string") return fail("online.err.noSeat");
          return seated(target, target.rejoin(m.token, socket));
        }
        case "start":
        case "action":
        case "again": {
          if (!room || seatNumber() < 0) return fail("online.err.notInRoom");
          const error = m.type === "start"  ? room.start(seatNumber())
                      : m.type === "action" ? room.action(seatNumber(), m.name, m.args)
                      :                       room.again(seatNumber());
          if (error) fail(error);
          return;
        }
        case "leave": {
          if (!room) return;
          room.disconnect(seatNumber(), true, socket);
          conn.room = null;
          return;
        }
        default:
          fail("online.err.badMessage");
      }
    }
  });

  // Throw away rooms that have been empty for too long (or lost every player in the lobby)
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const empty = room.seats.length === 0 || (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_MS);
      if (empty) { room.close(); rooms.delete(code); }
    }
  }, SWEEP_EVERY_MS);

  return new Promise(resolve => {
    httpServer.listen(port, () => {
      resolve({
        port: httpServer.address().port,       // (port 0 = "any free port", used by the tests)
        rooms,
        close() {
          clearInterval(sweeper);
          for (const room of rooms.values()) room.close();
          for (const client of wss.clients) client.terminate();
          wss.close();
          return new Promise(done => httpServer.close(done));
        },
      });
    });
  });
}

// `node server.js` starts the server; `require("./server")` (the tests) only loads the function
if (require.main === module) {
  startServer().then(({ port }) => console.log(`Chinchón server on http://localhost:${port}`));
}

module.exports = { startServer, cleanName, originAllowed };
