/* =========================================================
   ui.js: everything you see and click
   ---------------------------------------------------------
   Turns `state` into HTML (render) and turns clicks/drags into calls to
   the functions in game.js.
   ========================================================= */

"use strict";

const FACE_NAME   = { 10: "Sota", 11: "Caballo", 12: "Rey" };  // shown on figure cards
const FIGURE_ICON = { 10: "🧑", 11: "🐴", 12: "👑" };

// Where to put each pip on a 1-7 card. Each pair is [x%, y%] inside the
// card's face area: x = 0 (left) .. 100 (right), y = 0 (top) .. 100 (bottom).
// The number of pairs equals the card's value, so a 4 shows 4 symbols.
const PIP_LAYOUTS = {
  1: [[50, 50]],
  2: [[50, 20], [50, 80]],
  3: [[50, 15], [50, 50], [50, 85]],
  4: [[28, 22], [72, 22], [28, 78], [72, 78]],
  5: [[28, 22], [72, 22], [50, 50], [28, 78], [72, 78]],
  6: [[28, 12], [72, 12], [28, 50], [72, 50], [28, 88], [72, 88]],
  7: [[28, 12], [72, 12], [50, 31], [28, 50], [72, 50], [28, 88], [72, 88]],
};

/* ---------------------------------------------------------
   5. RENDERING: turn `state` into HTML elements.
   Each render function rebuilds its container from scratch.
   Simple and fine for a small game.
   --------------------------------------------------------- */

// Build one card element. faceUp = false gives the patterned back.
function createCardElement(card, faceUp) {
  const el = document.createElement("div");
  el.className = "card";

  if (!faceUp) {
    el.classList.add("back");
    return el;
  }

  el.classList.add(`suit-${card.suit}`);
  const label  = card.value;   // the cards show 1-7 and 10, 11, 12 as numbers
  const symbol = SUIT_SYMBOL[card.suit];

  // Build the middle of the card.
  //  - values 1-7: that many suit symbols, positioned from PIP_LAYOUTS
  //  - values 10-12: a framed figure with its name (Sota / Caballo / Rey)
  let faceHTML;
  if (card.value <= 7) {
    const size = card.value === 1 ? "big" : card.value === 7 ? "xs" : (card.value >= 5 ? "sm" : "");
    const pips = PIP_LAYOUTS[card.value]
      .map(([x, y]) => `<span class="pip ${size}" style="left:${x}%;top:${y}%">${symbol}</span>`)
      .join("");
    faceHTML = `<div class="face">${pips}</div>`;
  } else {
    faceHTML = `
      <div class="face figure">
        <span class="fig-suit">${symbol}</span>
        <span class="fig-icon">${FIGURE_ICON[card.value]}</span>
        <span class="fig-name">${FACE_NAME[card.value]}</span>
      </div>`;
  }

  // innerHTML lets us write the card's insides as an HTML string
  el.innerHTML = `
    <div class="corner">${label}</div>
    ${faceHTML}
    <div class="corner bottom">${label}</div>
  `;
  // Tooltip on hover, e.g. "12 de oros (Rey)"
  const faceName = FACE_NAME[card.value] ? ` (${FACE_NAME[card.value]})` : "";
  el.title = `${card.value} de ${card.suit}${faceName}`;
  return el;
}

// Draw one player's hand into its container
function renderHand(playerIndex) {
  const container = document.getElementById(`hand-${playerIndex}`);
  container.innerHTML = "";                       // clear old cards

  // Only the human's cards show, until the round ends and everything is revealed
  const faceUp = (playerIndex === 0) || state.revealed;
  const canDiscard = playerIndex === 0 && state.currentPlayer === 0 && state.phase === "discard";

  // In closing mode: a Map from card index -> close info, for the legal cards only
  const closable = (canDiscard && state.closing)
    ? new Map(closeOptions(state.hands[0]).map(o => [o.index, o.info]))
    : null;

  state.hands[playerIndex].forEach((card, index) => {
    const el = createCardElement(card, faceUp);
    let onTap = null;                                        // what a plain tap or click does
    if (closable) {
      if (closable.has(index)) {
        const info = closable.get(index);
        el.classList.add("clickable", "close-option");
        el.title += info.chinchon ? " - close with CHINCHÓN!"
                                  : ` - close and score ${info.closerScore}`;
        onTap = () => closeRound(0, index);
      } else {
        el.classList.add("dimmed");                          // this discard is not a legal close
      }
    } else if (canDiscard) {
      el.classList.add("clickable");                         // CSS highlights it
      onTap = () => humanDiscard(index);
    }
    if (playerIndex === 0) makeInteractive(el, index, onTap);   // tap = act, drag = rearrange
    container.appendChild(el);
  });
}

/* ---------------------------------------------------------
   Pressing one of your cards: a tap acts (discard / close), a drag
   rearranges. Pointer events cover mouse, touch and pen with ONE code path
   (the older HTML5 drag-and-drop API does not work on most phones).
   The ORDER of state.hands[0] is the order you see, so moving a card just
   means moving it inside that array (moveCard in game.js) and re-rendering.
   --------------------------------------------------------- */
const DRAG_THRESHOLD = 8;   // pixels the pointer must travel before a press counts as a drag
let dragFrom = null;        // index of the card being pressed or dragged (null = idle);
                            // render() leaves your hand alone while this is set
let drag = null;            // details of the gesture in progress

function makeInteractive(el, index, onTap) {
  el.addEventListener("contextmenu", (e) => e.preventDefault());   // no long-press menu on touch

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;       // left button only
    dragFrom = index;
    drag = { index, el, onTap, id: e.pointerId, startX: e.clientX, startY: e.clientY,
             active: false, ghost: null, target: index, offX: 0, offY: 0 };
    // Capture: keep receiving this pointer's events even when it leaves the card
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* e.g. synthetic events */ }
  });

  el.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (moved < DRAG_THRESHOLD) return;       // still just a press (tiny finger wobble)
      startDrag();
    }
    dragTo(e.clientX, e.clientY);
  });

  el.addEventListener("pointerup",     (e) => endGesture(e, true));
  el.addEventListener("pointercancel", (e) => endGesture(e, false));
}

// The press became a drag: fade the original card and float a copy under the pointer
function startDrag() {
  const rect = drag.el.getBoundingClientRect();
  const style = getComputedStyle(drag.el);
  drag.active = true;
  drag.offX = drag.startX - rect.left;          // where on the card it was grabbed
  drag.offY = drag.startY - rect.top;
  drag.el.classList.add("dragging");

  const ghost = drag.el.cloneNode(true);
  ghost.classList.remove("dragging", "clickable", "close-option", "dimmed", "drop-target");
  ghost.classList.add("ghost");
  // The copy lives in <body>, outside your hand, so give it the hand's card size
  ghost.style.setProperty("--card-w", style.getPropertyValue("--card-w"));
  ghost.style.setProperty("--card-h", style.getPropertyValue("--card-h"));
  document.body.appendChild(ghost);
  drag.ghost = ghost;
}

function dragTo(x, y) {
  drag.ghost.style.left = (x - drag.offX) + "px";
  drag.ghost.style.top  = (y - drag.offY) + "px";

  // Drop position: the card in your hand whose centre is nearest to the pointer
  const cards = [...document.querySelectorAll("#hand-0 .card")];
  let best = drag.index, bestDist = Infinity;
  cards.forEach((c, i) => {
    const r = c.getBoundingClientRect();
    const dist = Math.abs(x - (r.left + r.width / 2));
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  drag.target = best;
  cards.forEach((c, i) => c.classList.toggle("drop-target", i === best && i !== drag.index));
}

// Finger or button released (completed = true) or the gesture was cancelled
function endGesture(e, completed) {
  if (!drag || e.pointerId !== drag.id) return;
  const g = drag;
  drag = null;
  dragFrom = null;                              // render() may touch your hand again
  try { g.el.releasePointerCapture(g.id); } catch (err) { /* already released */ }
  if (g.ghost) g.ghost.remove();

  if (g.active) {
    if (completed && g.target !== g.index) moveCard(g.index, g.target);   // re-renders
    else render();                                                        // dropped in place
  } else if (completed && g.onTap) {
    g.onTap();                                  // a plain tap: discard / close
  } else {
    render();                                   // nothing to do; catch up on skipped redraws
  }
}

// Draw the centre piles
function renderPiles() {
  const drawSlot    = document.getElementById("draw-slot");
  const discardSlot = document.getElementById("discard-slot");
  drawSlot.innerHTML = "";
  discardSlot.innerHTML = "";

  // Draw pile: show a face-down card if any remain, else an empty outline
  if (state.drawPile.length > 0) {
    drawSlot.appendChild(createCardElement(null, false));
  } else {
    drawSlot.innerHTML = '<div class="pile-empty"></div>';
  }
  document.getElementById("draw-label").textContent =
    `Draw pile (${state.drawPile.length})`;

  // Discard pile: show only the TOP card, face-up
  if (state.discardPile.length > 0) {
    const top = state.discardPile[state.discardPile.length - 1];
    discardSlot.appendChild(createCardElement(top, true));
  } else {
    discardSlot.innerHTML = '<div class="pile-empty"></div>';
  }
  document.getElementById("discard-label").textContent =
    `Discard pile (${state.discardPile.length})`;
}

// Highlight whoever's turn it is
function renderTurnIndicator() {
  for (let p = 0; p < NUM_PLAYERS; p++) {
    const seat = document.getElementById(`seat-${p}`);
    seat.classList.toggle("active", p === state.currentPlayer && state.phase !== "roundOver");

    // Seat label: name, running total, and OUT if eliminated
    const base = p === 0 ? "You (Player 1)"
               : `${PLAYER_NAMES[p]} (${LEVEL_LABEL[state.cpuLevels[p]] || "smart"})`;
    seat.querySelector(".seat-name").textContent =
      `${base} · ${state.totals[p]} pts${state.inGame[p] ? "" : " · OUT"}`;
  }
}

// Master render: redraw everything from state
function render() {
  for (let p = 0; p < NUM_PLAYERS; p++) {
    // While you are dragging a card, don't rebuild your hand (it would cancel the drag)
    if (p === 0 && dragFrom !== null) continue;
    renderHand(p);
  }
  renderPiles();
  renderTurnIndicator();
  renderControls();
  renderScoreboard();
  renderAnalysis();
  renderResults();
}

// Table of running totals under the game
function renderScoreboard() {
  const rows = PLAYER_NAMES.map((name, p) => {
    const last = state.roundPoints[p];
    return `<tr class="${state.inGame[p] ? "" : "out"}">` +
           `<td>${name}</td><td>${state.totals[p]}</td>` +
           `<td>${last === null ? "–" : last}</td>` +
           `<td>${state.inGame[p] ? "in" : "OUT"}</td></tr>`;
  }).join("");

  document.getElementById("scoreboard").innerHTML =
    `<b>Round ${state.round}</b> (out above ${SCORE_LIMIT} points)` +
    `<table><tr><th>Player</th><th>Total</th><th>Last round</th><th>Status</th></tr>${rows}</table>`;
}

// Enable/disable the buttons and highlight the piles you can click
function renderControls() {
  const myTurn  = state.currentPlayer === 0;
  const drawing = myTurn && state.phase === "draw";
  const closeAllowed = myTurn && state.phase === "discard" &&
                       findBestClose(state.hands[0]) !== null;

  document.getElementById("close-btn").disabled = !closeAllowed;
  document.getElementById("close-btn").textContent =
    state.closing ? "Cancel closing" : "Close round";
  document.getElementById("sort-btn").disabled = state.hands[0].length === 0;
  document.getElementById("next-btn").disabled =
    !(state.phase === "roundOver" && !state.awaitingReentry && !state.gameOver);

  // Re-entry question, shown only while the human is out and must choose
  document.getElementById("results-btn").disabled = !(state.phase === "roundOver" && state.roundDetail);
  // (while the results panel is open, it asks the question itself)
  document.getElementById("reentry").hidden = !(state.awaitingReentry && !state.showResults);
  document.getElementById("reentry-text").textContent =
    `You are out of the game. Re-enter with ${state.entryScore} points?`;
  document.getElementById("draw-pile").classList.toggle("can-pick", drawing);
  document.getElementById("discard-pile").classList.toggle(
    "can-pick", drawing && state.discardPile.length > 0);
}

// Debug panel under the table: shows how the evaluator sees YOUR hand.
// (Useful while building; you can remove it later.)
function renderAnalysis() {
  const describe = card => `${card.value}${SUIT_SYMBOL[card.suit]}`;
  if (state.hands[0].length === 0) {          // you are out of the game
    document.getElementById("analysis").innerHTML =
      "<b>Your hand analysis</b><br>You are not playing this round.";
    return;
  }
  const info = getCloseInfo(state.hands[0]);

  const meldText = info.melds.length
    ? info.melds.map(m => `${m.type}: ${m.cards.map(describe).join(" ")}`).join(" | ")
    : "none";
  const unmatchedText = info.unmatched.length
    ? `${info.unmatched.map(describe).join(" ")} (${info.points} pts)`
    : "none";

  let closeText = "No";
  if (state.hands[0].length > CARDS_PER_HAND) {
    // 8 cards in hand: you must discard one to close, so show the best option
    const option = findBestClose(state.hands[0]);
    if (option) {
      const discarded = describe(state.hands[0][option.discardIndex]);
      closeText = option.info.chinchon
        ? `Yes: discard ${discarded} for CHINCHÓN!`
        : `Yes: discard ${discarded} (would score ${option.info.closerScore})`;
    }
  } else if (info.chinchon) {
    closeText = "Yes: CHINCHÓN!";
  } else if (info.canClose) {
    closeText = `Yes (would score ${info.closerScore})`;
  }

  document.getElementById("analysis").innerHTML =
    `<b>Your hand analysis</b><br>Melds: ${meldText}<br>` +
    `Unmatched: ${unmatchedText}<br>Can close: ${closeText}`;
}

// ---- The round results panel ----
// Shows, for every player in the round, how their cards split into melds and
// leftover cards, what they scored, and their new total.

// A labelled group of small cards ("Run", "Group" or "Left over")
function resultGroup(cards, label, cls) {
  const box = document.createElement("div");
  box.className = "res-group " + cls;
  const row = document.createElement("div");
  row.className = "res-cards-row";
  cards.forEach(c => row.appendChild(createCardElement(c, true)));
  const caption = document.createElement("div");
  caption.className = "res-label";
  caption.textContent = label;
  box.append(row, caption);
  return box;
}

function resultRow(d) {
  const name = d.p === 0 ? "You" : PLAYER_NAMES[d.p];
  const row = document.createElement("div");
  row.className = "res-row" + (d.closer ? " closer" : "");

  const pts = d.chinchon ? "Chinchón!" : (d.points > 0 ? `+${d.points}` : String(d.points));
  const gameEndedHere = state.roundResult.chinchon && CHINCHON_ENDS_GAME;
  const total = gameEndedHere ? "" : `total ${state.totals[d.p]}`;
  const badges = (d.closer && !d.chinchon ? '<span class="badge">closed</span>' : "") +
                 (!state.inGame[d.p] ? '<span class="badge out">out</span>' : "");
  const head = document.createElement("div");
  head.className = "res-head";
  head.innerHTML = `<b>${name}</b>${badges}` +
                   `<span class="res-pts${d.points < 0 || d.chinchon ? " good" : ""}">${pts}</span>` +
                   `<span class="res-total">${total}</span>`;

  const cards = document.createElement("div");
  cards.className = "res-cards";
  d.melds.forEach(m => cards.appendChild(resultGroup(m.cards, m.type === "run" ? "Run" : "Group", "meld")));
  if (d.unmatched.length) {
    const sum = d.unmatched.reduce((s, c) => s + cardPoints(c), 0);
    cards.appendChild(resultGroup(d.unmatched, `Left over: ${sum} pts`, "leftover"));
  }
  row.append(head, cards);
  return row;
}

function renderResults() {
  const overlay = document.getElementById("results");
  const detail = state.roundDetail;
  const show = state.phase === "roundOver" && state.showResults && detail;
  overlay.hidden = !show;
  if (!show) return;

  const rr = state.roundResult;
  const name = p => p === 0 ? "You" : PLAYER_NAMES[p];
  const headline = rr.closer === null ? "Stalemate: nobody closed"
                 : rr.chinchon        ? `${name(rr.closer)} made CHINCHÓN!`
                 :                      `${name(rr.closer)} closed the round`;
  document.getElementById("results-title").textContent = `Round ${state.round}: ${headline}`;

  const body = document.getElementById("results-body");
  body.innerHTML = "";
  detail.forEach(d => { if (d) body.appendChild(resultRow(d)); });

  let notice = state.notice;
  if (state.awaitingReentry) {
    notice = `You are out of the game. Re-enter with ${state.entryScore} points? ${state.notice}`;
  } else if (state.gameOver) {
    notice = `${state.winner === 0 ? "You win" : name(state.winner) + " wins"} the game! ${state.notice}`;
  }
  document.getElementById("results-notice").textContent = notice;

  document.getElementById("res-next").hidden     = state.awaitingReentry || state.gameOver;
  document.getElementById("res-reenter").hidden  = !state.awaitingReentry;
  document.getElementById("res-stayout").hidden  = !state.awaitingReentry;
  document.getElementById("res-newgame").hidden  = !state.gameOver;
}

function setResultsOpen(open) {
  state.showResults = open;
  render();
}

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

/* ---------------------------------------------------------
   6. EVENT WIRING: connect clicks to functions.
   addEventListener("click", fn) means: "when this element is clicked,
   call fn". The human's cards get their own click handlers inside
   renderHand(), because those elements are rebuilt on every render.
   --------------------------------------------------------- */
document.getElementById("new-game").addEventListener("click", newGame);
document.getElementById("draw-pile").addEventListener("click", () => humanDraw("deck"));
document.getElementById("discard-pile").addEventListener("click", () => humanDraw("discard"));
document.getElementById("close-btn").addEventListener("click", humanClose);
document.getElementById("next-btn").addEventListener("click", nextRound);
document.getElementById("sort-btn").addEventListener("click", sortHand);

// Choosing a sort method also sorts straight away
document.getElementById("sort-mode").addEventListener("change", (e) => {
  state.sortMode = e.target.value;
  sortHand();
});

// CPU difficulty: takes effect from the next CPU move (no new game needed)
document.getElementById("cpu-mode").addEventListener("change", (e) => {
  state.cpuMode = e.target.value;
  state.cpuLevels = [...CPU_MODES[state.cpuMode]];
  render();                                   // refresh the seat labels
});

// CPU speed: also takes effect immediately
document.getElementById("cpu-speed").addEventListener("change", (e) => {
  state.cpuSpeed = e.target.value;
});

// Changing the deck starts a new game. If a game is under way, ask first with a
// bar inside the page (the browser's pop-up dialogs are blocked in some places).
let pendingDeck = null;

function switchDeck(size) {
  setDeckSize(size);
  newGame();
}

function closeDeckConfirm(keepPlaying) {
  document.getElementById("deck-confirm").hidden = true;
  if (keepPlaying) document.getElementById("deck-size").value = String(DECK_SIZE);   // put the dropdown back
  pendingDeck = null;
}

document.getElementById("deck-size").addEventListener("change", (e) => {
  const size = Number(e.target.value);
  const inProgress = state.round > 1 || state.totals.some(t => t !== 0) ||
                     state.hands[0].length > CARDS_PER_HAND;
  if (!inProgress) { switchDeck(size); return; }
  pendingDeck = size;
  document.getElementById("deck-confirm-text").textContent =
    `Switch to the ${size}-card deck? This starts a new game.`;
  document.getElementById("deck-confirm").hidden = false;
});
document.getElementById("deck-yes").addEventListener("click", () => {
  const size = pendingDeck;
  closeDeckConfirm(false);
  if (size !== null) switchDeck(size);
});
document.getElementById("deck-no").addEventListener("click", () => closeDeckConfirm(true));
document.getElementById("reenter-yes").addEventListener("click", () => humanReenter(true));
document.getElementById("reenter-no").addEventListener("click", () => humanReenter(false));

// Results panel buttons
document.getElementById("results-btn").addEventListener("click", () => setResultsOpen(true));
document.getElementById("res-hide").addEventListener("click", () => setResultsOpen(false));
document.getElementById("res-next").addEventListener("click", nextRound);
document.getElementById("res-reenter").addEventListener("click", () => humanReenter(true));
document.getElementById("res-stayout").addEventListener("click", () => humanReenter(false));
document.getElementById("res-newgame").addEventListener("click", newGame);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.showResults) setResultsOpen(false);
});

/* ---------------------------------------------------------
   7. START: run once when the page loads
   --------------------------------------------------------- */
if (typeof runSelfTests === "function") runSelfTests();   // results in the console (F12)
newGame();
