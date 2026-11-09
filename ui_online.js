/* =========================================================
   ui_online.js: the screens for playing online with friends
   ---------------------------------------------------------
   Moved out of ui.js to keep that file shorter. It loads after ui.js because
   the wiring below uses ui.js's helpers (wirePanel, escapeHtml...) as soon as
   the file runs; render() in ui.js calls renderOnline(), renderReactions() and
   renderTitle() from here, but only later, once start.js has run.
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   PLAYING ONLINE: the online sheet (create or join a room, the players in it)
   ---------------------------------------------------------
   The connection itself is in net.js (`online`, createRoom, joinRoom, leaveRoom);
   this part draws `online` and passes the clicks on. Once the host starts, views
   of the game arrive and the table shows the online game (applyView in net.js),
   while the game on this device waits, saved, until you leave the room.
   --------------------------------------------------------- */
const NAME_STORAGE_KEY = "chinchon-name";   // localStorage: your online nickname
// Settings that belong to the room in an online game, so they are locked while you play one
const ROOM_SETTING_IDS = ["cpu-count", "cpu-mode", "deck-size", "deck-tip-btn",
                          "reshuffles", "reentries", "round-limit", "layoff", "new-game"];
const TURN_WARN_MS = 15000;      // the turn bar shows in the last this-many milliseconds of your time
const TURN_TICK_MS = 250;        // how often the turn bar's countdown is redrawn
const TURN_BUZZ_MS = 200;        // the buzz when your turn comes while the game is in the background
const REACTION_SHOW_MS = 2500;   // how long a reaction stays by the seat of whoever sent it
// The room's rules: [setting, label key, how its value reads, its dropdown in Settings].
// The online sheet lists them in the lobby, and the create form has a copy of each Settings
// dropdown (made by makeRulePicks) to choose them; the time per turn has its own dropdown
// there, since it is not one of your Settings. (`??` = "if null or undefined, use this instead")
const showLimit = v => v === null ? t("set.noLimit") : String(v);
const ROOM_RULES = [
  ["deckSize",      "set.deck",         v => t(`set.deck.${v}`),         "deck-size"],
  ["cpuMode",       "set.level",        v => t(`level.${v}`),            "cpu-mode"],
  ["maxReshuffles", "set.reshuffles",   showLimit,                       "reshuffles"],
  ["maxReentries",  "set.reentries",    showLimit,                       "reentries"],
  ["roundLimit",    "set.rounds",       showLimit,                       "round-limit"],
  ["layoffMode",    "set.layoff",       v => t(`set.layoff.${v}`),       "layoff"],
  ["turnLimit",     "online.turnLimit", v => t(`online.turn.${v ?? "none"}`), null],
];
// A dropdown's value as a setting: "none" is no limit (null), digits are a number ("40" -> 40),
// anything else stays text ("hard")
const optionValue = value => value === "none" ? null : /^\d+$/.test(value) ? Number(value) : value;

// The create form's copies of the Settings dropdowns, made once at startup. cloneNode(true)
// copies an element with everything inside it (the label, the dropdown and its options,
// with their data-i18n keys, so they switch language with the rest of the page). Each copy
// gets the id "online-" + the original's, so the two never mix.
function makeRulePicks() {
  const box = document.getElementById("online-rule-picks");
  for (const [, , , id] of ROOM_RULES) {
    if (!id) continue;
    const label = document.getElementById(id).closest("label").cloneNode(true);
    label.querySelector("select").id = `online-${id}`;
    label.htmlFor = `online-${id}`;                       // (the `for` attribute)
    // ...and its explanation line, which the copy's (i) button opens
    const info = document.getElementById(`info-${id}`).cloneNode(true);
    info.id = `online-info-${id}`;
    info.hidden = true;
    label.querySelector(".info-btn").setAttribute("aria-controls", info.id);
    label.querySelector(".info-btn").setAttribute("aria-expanded", "false");
    box.append(label, info);
  }
}
makeRulePicks();

// Set the create form's rules to your own Settings (each time the online sheet opens)
function fillRulePicks() {
  for (const [, , , id] of ROOM_RULES) {
    if (id) document.getElementById(`online-${id}`).value = document.getElementById(id).value;
  }
}

function setOnlineOpen(open) {
  if (open) endTutorial();                    // (tutorial.js) going online starts from your own game
  state.showOnline = open;
  if (open) {
    online.error = online.code ? online.error : null;   // a fresh start shows no old problem
    if (!online.code) fillRulePicks();
    warmUpServer();                                     // (net.js) a sleeping server starts waking up now
  }
  render();
}

function renderOnline() {
  const inRoom = Boolean(online.code);
  const chip = document.getElementById("online-chip");
  chip.hidden = !inRoom;
  if (inRoom) chip.textContent = t("online.chip", { code: online.code });
  document.getElementById("online-open").hidden = !serverUrl();
  document.getElementById("online-top").hidden = !serverUrl() || inRoom;   // (in a room the chip takes its place)
  document.getElementById("conn-bar").hidden = online.connection !== "lost";
  // Your seat is played by a CPU while you are connected: your time for a turn ran out
  document.getElementById("away-bar").hidden = !(online.playing && state.seats[0] === "away");
  renderTurnBar();
  for (const id of ROOM_SETTING_IDS) document.getElementById(id).disabled = online.playing;
  if (online.playing) {
    syncSettingDropdowns();                          // show the room's rules in the (locked) dropdowns
    document.getElementById("deck-tip").hidden = true;   // (its button is locked too)
  }

  document.getElementById("online-sheet").hidden = !state.showOnline;
  if (!state.showOnline) return;
  const error = document.getElementById("online-error");
  error.hidden = !online.error;
  error.textContent = online.error ? t(online.error) : "";
  document.getElementById("online-waking").hidden = !online.waking;
  document.getElementById("online-start").hidden = inRoom;
  document.getElementById("online-room").hidden = !inRoom;
  const busy = Boolean(online.queued || online.asking);   // a create or join is on its way
  document.getElementById("online-create").disabled = busy;
  document.getElementById("online-join").disabled = busy;
  if (!inRoom) return;

  const lobby = online.lobby;
  const isHost = Boolean(lobby) && lobby.you === lobby.host;
  document.getElementById("online-code-line").textContent = t("online.codeLine", { code: online.code });
  renderPeople(lobby, isHost);

  // The number of seats: the host may change it between games
  const between = lobby && (!lobby.started || lobby.gameOver);
  document.getElementById("online-seats-row").hidden = !(isHost && between);
  if (lobby) document.getElementById("online-seats").value = String(lobby.players);

  // What happens next
  const me = lobby && lobby.people[lobby.you];
  const host = lobby && lobby.people[lobby.host];
  document.getElementById("online-wait").textContent =
    !lobby || online.connection !== "open" ? t("online.connecting")
    : !lobby.started ? (isHost ? t("online.youStart") : t("online.waitHost", { name: host ? host.name : "" }))
    : !me.playing    ? t("online.waitNext")
    : lobby.gameOver ? t("online.gameOver")
    :                  t("online.inGame");
  document.getElementById("online-startgame").hidden = !(isHost && !lobby.started);

  // The room's rules (a <dl>: pairs of <dt> name and <dd> value)
  const rules = document.getElementById("online-rules");
  rules.innerHTML = "";
  if (lobby) {
    for (const [key, label, show] of ROOM_RULES) {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = t(label);
      dd.textContent = show(lobby.settings[key]);
      rules.append(dt, dd);
    }
  }
}

// The players in the room (names are what people typed, so textContent, never innerHTML),
// then the empty seats the CPUs take. The host gets Make host and Remove by the others.
// Redrawn only when something in it changed: views arrive all through a game, and a
// button rebuilt under your finger would lose your tap.
let peopleDrawn = null;            // what the list shows now (as JSON), to spot a change
function renderPeople(lobby, isHost) {
  const drawn = JSON.stringify([lobby, currentLang]);
  if (drawn === peopleDrawn) return;
  peopleDrawn = drawn;
  const list = document.getElementById("online-people");
  list.innerHTML = "";
  if (!lobby) return;
  let present = 0;
  lobby.people.forEach((person, i) => {
    if (person.left) return;       // left for good: a CPU plays their seat until the next game
    present++;
    const tags = [i === lobby.you && t("online.you"), i === lobby.host && t("online.host"),
                  !person.connected && t("online.offline"),
                  lobby.started && !person.playing && t("online.nextGame"),
                  person.wins > 0 && plural("online.wins", person.wins)].filter(Boolean);
    const li = document.createElement("li");
    li.classList.toggle("offline", !person.connected);
    const name = document.createElement("span");
    name.textContent = person.name + (tags.length ? ` (${tags.join(", ")})` : "");
    li.appendChild(name);
    if (isHost && i !== lobby.you) {
      li.append(personButton("online.makeHost", () => makeHost(i)),
                personButton("online.remove", () => removePlayer(i)));
    }
    list.appendChild(li);
  });
  for (let i = present; i < lobby.players; i++) {
    const li = document.createElement("li");
    li.className = "cpu";
    li.textContent = t("online.cpuSeat");
    list.appendChild(li);
  }
}
function personButton(key, onClick) {
  const button = document.createElement("button");
  button.className = "secondary small";
  button.textContent = t(key);
  button.addEventListener("click", onClick);
  return button;
}

// "Ana 2 · Luis 1 · CPUs 0": the games won in this room, for the game-over banner
// (online only; "" otherwise). The CPUs are only listed if they play or have won.
function roomTally() {
  const lobby = online.lobby;
  if (!online.playing || !lobby) return "";
  const people = lobby.people.filter(person => person.playing && !person.left);
  const parts = people.map(person => `${person.name} ${person.wins}`);
  if (lobby.players > people.length || lobby.cpuWins > 0) parts.push(`${t("online.tallyCpus")} ${lobby.cpuWins}`);
  return parts.join(" · ");
}

// The bar under the table in the last seconds of your time for a turn
function renderTurnBar() {
  const left = online.playing && online.turnEndsAt !== null ? online.turnEndsAt - Date.now() : null;
  const bar = document.getElementById("turn-bar");
  bar.hidden = left === null || left > TURN_WARN_MS;
  if (!bar.hidden) bar.textContent = t("online.turnLeft", { n: Math.max(0, Math.ceil(left / 1000)) });
}
setInterval(renderTurnBar, TURN_TICK_MS);   // the countdown moves between renders too

// ---- Reactions: the smiley button and the emoji by the seats ----
// A reaction shows by the seat of whoever sent it, then fades. Each seat shows one at
// a time (a new one replaces the last), so it never becomes a list.
let reactPickerOpen = false;       // is the row of emoji open?
let reactionShown = 0;             // online.reaction.n of the last reaction put on the table
function renderReactions() {
  const btn = document.getElementById("react-btn");
  btn.hidden = !online.playing;
  if (!online.playing) reactPickerOpen = false;
  btn.setAttribute("aria-expanded", String(reactPickerOpen));
  document.getElementById("react-picker").hidden = !reactPickerOpen;

  const r = online.reaction;
  if (!r || r.n === reactionShown) return;
  reactionShown = r.n;
  if (!online.playing || r.who >= state.numPlayers) return;
  const seat = document.getElementById(`seat-${r.who}`);
  const old = seat.querySelector(".reaction");
  if (old) old.remove();
  const bubble = document.createElement("div");
  bubble.className = "reaction";
  bubble.textContent = REACTIONS[r.id] || "";
  seat.appendChild(bubble);
  setTimeout(() => bubble.remove(), REACTION_SHOW_MS);
}
// The emoji buttons, made once from REACTIONS (i18n.js)
REACTIONS.forEach((emoji, id) => {
  const button = document.createElement("button");
  button.className = "secondary icon";
  button.textContent = emoji;
  button.addEventListener("click", () => {
    sendReaction(id);                                  // (net.js)
    reactPickerOpen = false;
    render();
  });
  document.getElementById("react-picker").appendChild(button);
});
document.getElementById("react-btn").addEventListener("click", () => {
  reactPickerOpen = !reactPickerOpen;
  render();
});
document.getElementById("away-back").addEventListener("click", () => sendBack());
document.getElementById("online-seats").addEventListener("change", (e) => setRoomPlayers(Number(e.target.value)));

// The tab's title. Online, while the game is in the background and it is your move, it
// says so, so that you see it from another tab (and on the phone's list of open apps).
function renderTitle() {
  const yourMove = online.playing && document.hidden && state.phase !== "roundOver" &&
                   state.currentPlayer === 0 && isHuman(0);
  document.title = yourMove ? t("online.titleTurn") : t("app.title");
}

// The nickname typed in the sheet (remembered for next time), or null after saying what is wrong
function onlineName() {
  const name = document.getElementById("online-name").value.trim();
  try { localStorage.setItem(NAME_STORAGE_KEY, name); } catch (err) { /* fine */ }
  if (!name) { online.error = "online.err.badName"; render(); return null; }
  return name;
}

// The address that opens this game straight at the join form of the room, or null when the
// page was opened from a file (a file:// address means nothing on another device)
function roomLink() {
  if (location.protocol !== "http:" && location.protocol !== "https:") return null;
  const params = new URLSearchParams({ room: online.code });
  const server = new URLSearchParams(location.search).get("server");
  if (server) params.set("server", server);
  return `${location.origin}${location.pathname}?${params}`;
}

// "Play online" in Settings opens the online sheet (and closes Settings); so do "Play with
// friends" in the top bar (wide screens) and the room chip
function openOnlineSheet() {
  state.showSettings = false;
  setOnlineOpen(true);
}
document.getElementById("online-open").addEventListener("click", openOnlineSheet);
document.getElementById("online-top").addEventListener("click", openOnlineSheet);
wirePanel("online-chip", "online-close", "online-sheet", setOnlineOpen, () => state.showOnline);

document.getElementById("online-create").addEventListener("click", () => {
  const name = onlineName();
  if (!name) return;
  // The rules chosen in the form (the server checks each value)
  const settings = {
    players: Number(document.getElementById("online-players").value),
    turnLimit: optionToLimit(document.getElementById("online-turn").value),
  };
  for (const [key, , , id] of ROOM_RULES) {
    if (id) settings[key] = optionValue(document.getElementById(`online-${id}`).value);
  }
  createRoom(name, settings);
});
document.getElementById("online-join").addEventListener("click", () => {
  const name = onlineName();
  if (!name) return;
  const code = document.getElementById("online-code").value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { online.error = "online.err.badCode"; render(); return; }
  joinRoom(code, name);
});
// Enter in the code box joins
document.getElementById("online-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("online-join").click();
});
document.getElementById("online-startgame").addEventListener("click", () => sendOnline({ type: "start" }));
document.getElementById("online-leave").addEventListener("click", () => leaveRoom());

// Share the room: the phone's own share menu where there is one (navigator.share), else copy
// the link. Both are promises (they finish later); .catch: the player closed the menu, fine.
document.getElementById("online-share").addEventListener("click", () => {
  const url = roomLink();
  const text = t("online.shareText", { code: online.code });
  const note = document.getElementById("online-shared");
  if (navigator.share) {
    navigator.share({ title: t("app.title"), text, url: url || undefined }).catch(() => {});
  } else if (url && navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => { note.textContent = t("online.shared", { url }); note.hidden = false; })
      .catch(() => { note.textContent = url; note.hidden = false; });
  } else {
    note.textContent = url || text;        // nothing to share with: show it, to copy by hand
    note.hidden = false;
  }
});

// Back to the game on this device after an online game (leaveRoom in net.js calls this):
// the game saved when the online one began, or a new one with your settings
function restoreLocalGame() {
  if (loadGame()) resumeTurn();
  else newGame(loadSettings());
  syncSettingDropdowns();
}

