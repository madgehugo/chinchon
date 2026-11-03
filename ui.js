/* =========================================================
   ui.js: everything you see and click
   ---------------------------------------------------------
   Turns `state` into HTML (render) and turns clicks/drags into calls to
   the functions in game.js.
   ========================================================= */

"use strict";

const FACE_NAME   = { 10: "Sota", 11: "Caballo", 12: "Rey" };  // shown on figure cards

const MOVE_MS          = 260;   // how long one card takes to slide (kept under 300 ms)
const DEAL_STAGGER_MS  = 30;    // delay between one dealt card and the next

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

// Suit symbols, drawn as inline SVG (vector graphics written as text, so they stay sharp at any
// size and need no image files). Each <symbol> is drawn once on a 24x24 grid in the hidden sprite
// below; every use of a suit is then a tiny <svg><use href="#sym-oros"/></svg> pointing at it
// (see suitIcon). `fill="currentColor"` means "use the text colour of the surroundings", so the
// CSS colours .suit-oros, .suit-copas, ... colour the symbols too. `--cut` is the card-paper
// colour, used for the details cut out of each shape (coin ring, cup bowl, blade groove, knots).
const SUIT_SPRITE = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="sym-oros" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill="currentColor"/>
    <circle cx="12" cy="12" r="7.6" fill="none" stroke="var(--cut,#fffaf0)" stroke-width="1.6"/>
    <path d="M12 7.4l1.5 3.1 3.4.4-2.5 2.3.7 3.4-3.1-1.7-3.1 1.7.7-3.4-2.5-2.3 3.4-.4z" fill="var(--cut,#fffaf0)"/>
  </symbol>
  <symbol id="sym-copas" viewBox="0 0 24 24">
    <path d="M3.5 2h17c.4 7.5-3 12-8.5 12S3.1 9.5 3.5 2z" fill="currentColor"/>
    <path d="M10.6 13.5h2.8v5.2h-2.8z" fill="currentColor"/>
    <path d="M6.5 19.5c0-.6.5-1 1-1h9c.5 0 1 .4 1 1V22h-11z" fill="currentColor"/>
    <path d="M6.2 4.2h11.6c.1 3.6-2 6.3-5.8 6.3S6.1 7.8 6.2 4.2z" fill="none" stroke="var(--cut,#fffaf0)" stroke-width="1.3"/>
  </symbol>
  <symbol id="sym-espadas" viewBox="0 0 24 24">
    <path d="M12 .8l3 4.7v10H9v-10z" fill="currentColor"/>
    <path d="M12 4v10.5" stroke="var(--cut,#fffaf0)" stroke-width="1.1"/>
    <rect x="4" y="15.5" width="16" height="2.6" rx="1.3" fill="currentColor"/>
    <rect x="10.5" y="18" width="3" height="3" fill="currentColor"/>
    <circle cx="12" cy="22" r="1.8" fill="currentColor"/>
  </symbol>
  <!-- club: a smooth tapered cudgel, tilted, with two knots; drawn large so it matches the other suits -->
  <symbol id="sym-bastos" viewBox="0 0 24 24">
    <g transform="rotate(38 12 12) translate(12 12) scale(1.1) translate(-12 -12)">
      <path d="M12 1c4.4 0 5.8 2.7 5.1 6.3-.5 3-2.3 5.3-2.5 8.2l-.2 5.2c-.1 1.7-4.1 1.7-4.2 0l-.2-5.2c-.2-2.9-2-5.2-2.5-8.2C6.2 3.7 7.6 1 12 1z" fill="currentColor"/>
      <circle cx="10.8" cy="5.5" r="1.2" fill="var(--cut,#fffaf0)"/>
      <circle cx="13.8" cy="9.5" r="1" fill="var(--cut,#fffaf0)"/>
    </g>
  </symbol>
  <!-- figures: 10 Sota (page), 11 Caballo (horse), 12 Rey (king, shown as a crown) -->
  <symbol id="sym-fig-10" viewBox="0 0 24 24">
    <path d="M7.2 8C7.2 4.2 9.3 2 12 2s4.8 2.200 4.800 6z" fill="currentColor"/>
    <path d="M16.200 4.500q4-1.500 5 2.500-2.500-.8-4.300 0z" fill="currentColor"/>
    <circle cx="12" cy="10.500" r="3.600" fill="currentColor"/>
    <path d="M3.500 22c0-5.200 3.700-8 8.500-8s8.500 2.800 8.500 8z" fill="currentColor"/>
    <path d="M7.800 8.100h8.400" stroke="var(--cut,#fffaf0)" stroke-width="1"/>
    <path d="M9.300 14.800L12 18l2.700-3.200" fill="none" stroke="var(--cut,#fffaf0)" stroke-width="1.200"/>
  </symbol>
  <symbol id="sym-fig-11" viewBox="0 0 24 24">
    <path d="M5 22c0-5.500 2.200-9.500 4.800-12.500L8.200 4.800l3.200 1.800C12.500 3.800 14.800 2 17.500 2.500L17 5c3 1 5 4.300 5 8l-2 1.800-3.800-1.500c-1.500.8-2.400 2.500-2.400 4.200 0 1.700.8 3.200 1.800 4.500z" fill="currentColor"/>
    <circle cx="15.800" cy="7.800" r="1" fill="var(--cut,#fffaf0)"/>
    <path d="M9.800 9.500q3 1.500 3.800 5" fill="none" stroke="var(--cut,#fffaf0)" stroke-width="1"/>
  </symbol>
  <symbol id="sym-fig-12" viewBox="0 0 24 24">
    <path d="M2.500 19.500L1.500 6.500l6 5L12 3.500l4.500 8 6-5-1 13z" fill="currentColor"/>
    <rect x="2.500" y="19.500" width="19" height="2.800" rx="1" fill="currentColor"/>
    <circle cx="12" cy="15.500" r="1.400" fill="var(--cut,#fffaf0)"/>
    <circle cx="7" cy="15.500" r="1" fill="var(--cut,#fffaf0)"/>
    <circle cx="17" cy="15.500" r="1" fill="var(--cut,#fffaf0)"/>
  </symbol>
</svg>`;

// HTML for one suit symbol. Its size is 1em, so it scales with the font-size of whatever holds it.
const suitIcon = suit =>
  `<svg class="suit-icon" aria-label="${suit}" role="img"><use href="#sym-${suit}"/></svg>`;

// Same idea for the figure cards (10 Sota, 11 Caballo, 12 Rey); coloured by the card's suit colour.
const figureIcon = value =>
  `<svg class="suit-icon" aria-hidden="true"><use href="#sym-fig-${value}"/></svg>`;

// Put the sprite into the page once, at load (it is invisible; it only holds the shapes).
document.body.insertAdjacentHTML("afterbegin", SUIT_SPRITE);

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
  const symbol = suitIcon(card.suit);

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
        <span class="fig-icon">${figureIcon(card.value)}</span>
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
        onTap = () => { discardFrom = el.getBoundingClientRect(); closeRound(0, index); };
      } else {
        el.classList.add("dimmed");                          // this discard is not a legal close
      }
    } else if (canDiscard) {
      el.classList.add("clickable");                         // CSS highlights it
      onTap = () => { discardFrom = el.getBoundingClientRect(); humanDiscard(index); };
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

// Where each seat sits on the table (grid-area names from style.css), by number of
// players. Index = seat number. With one CPU it sits opposite you; with two they
// sit left and right; with three, left, top and right.
const SEAT_AREAS = {
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
};

// Place the seats for the current number of players and hide the unused ones
function renderSeats() {
  const areas = SEAT_AREAS[state.numPlayers];
  document.getElementById("table").dataset.players = state.numPlayers;   // CSS reads this (data-players)
  for (let p = 0; p < MAX_PLAYERS; p++) {
    const seat = document.getElementById(`seat-${p}`);
    seat.hidden = p >= state.numPlayers;
    if (p < state.numPlayers) {
      seat.style.gridArea = areas[p];
      // CPUs at the left or right edge stack their cards vertically (see style.css)
      seat.classList.toggle("side", areas[p] === "left" || areas[p] === "right");
    }
  }
}

// Highlight whoever's turn it is
function renderTurnIndicator() {
  for (let p = 0; p < state.numPlayers; p++) {
    const seat = document.getElementById(`seat-${p}`);
    seat.classList.toggle("active", p === state.currentPlayer && state.phase !== "roundOver");

    // Seat label: name, running total, and OUT if eliminated
    const base = p === 0 ? "You (Player 1)"
               : `${PLAYER_NAMES[p]} (${LEVEL_LABEL[state.cpuLevels[p]] || "hard"})`;
    seat.querySelector(".seat-name").textContent =
      `${base} · ${state.totals[p]} pts${state.inGame[p] ? "" : " · OUT"}`;
  }
}

// Master render: redraw everything from state
function render() {
  renderSeats();
  const rebuilt = [];                 // which hands were redrawn this time (the animations need it)
  for (let p = 0; p < state.numPlayers; p++) {
    // While you are dragging a card, don't rebuild your hand (it would cancel the drag)
    rebuilt[p] = !(p === 0 && dragFrom !== null);
    if (rebuilt[p]) renderHand(p);
  }
  renderPiles();
  renderTurnIndicator();
  renderControls();
  renderScoreboard();
  renderAnalysis();
  renderResults();
  renderToggles();
  animateChanges(rebuilt);            // last, because it needs the new cards to be in the page
}

/* ---------------------------------------------------------
   Card animations. render() rebuilds every card from scratch, so a card that
   "moves" is really a new element. To make it look like it travelled, we compare
   this render with the previous one (animSeen), and slide the NEW card in from
   where it came from: the draw pile, the discard pile, or the hand it was played from.
   The sliding uses the Web Animations API: element.animate(keyframes, options).
   Nothing here changes `state`, and nothing runs when the player's system asks
   for reduced motion.
   --------------------------------------------------------- */
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");  // live: .matches follows the OS setting
let animSeen = { deals: 0, drawLen: 0, discardLen: 0, handLen: [] };   // what the previous render looked like
let discardFrom = null;       // where the card you just tapped was (set by the tap, used once)

// Slide a card element from `from` (a rectangle) to where it now is.
// matchSize: also start at the size of `from` (a pile card is bigger than a hand card).
function slideFrom(el, from, matchSize, delay = 0) {
  const to = el.getBoundingClientRect();
  const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
  const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
  const scale = matchSize ? from.width / to.width : 1;
  el.style.zIndex = 30;                                   // fly above the other cards
  const anim = el.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "none" }],
    { duration: MOVE_MS, delay, easing: "ease-out", fill: "backwards" });   // backwards: wait at the start spot during the delay
  const done = () => { el.style.zIndex = ""; };
  anim.onfinish = done;
  anim.oncancel = done;
}

const rectOf = id => document.getElementById(id).getBoundingClientRect();

// The cards of a new round fly out of the draw pile one at a time, round the table
function animateDeal() {
  const from = rectOf("draw-slot");
  let n = 0;
  for (let r = 0; r < CARDS_PER_HAND; r++) {
    for (let p = 0; p < state.numPlayers; p++) {
      const card = document.querySelectorAll(`#hand-${p} .card`)[r];
      if (card) slideFrom(card, from, true, (n++) * DEAL_STAGGER_MS);
    }
  }
}

function animateChanges(rebuilt) {
  const prev = animSeen;
  const now = { deals: state.deals, drawLen: state.drawPile.length,
                discardLen: state.discardPile.length, handLen: prev.handLen.slice() };
  state.hands.forEach((hand, p) => { if (rebuilt[p]) now.handLen[p] = hand.length; });

  if (!REDUCED_MOTION.matches) {
    if (now.deals !== prev.deals) {
      animateDeal();
    } else {
      for (let p = 0; p < state.numPlayers; p++) {
        if (!rebuilt[p]) continue;
        const before = prev.handLen[p] || 0, after = now.handLen[p];
        if (after === before + 1) {
          // A card was drawn. It came from the discard pile if that shrank and the draw pile did not.
          const fromDiscard = now.discardLen === prev.discardLen - 1 && now.drawLen === prev.drawLen;
          const cards = document.querySelectorAll(`#hand-${p} .card`);
          slideFrom(cards[cards.length - 1], rectOf(fromDiscard ? "discard-slot" : "draw-slot"), true);
        } else if (after === before - 1 && now.discardLen === prev.discardLen + 1) {
          // A card was discarded: slide the new top of the discard pile in from the hand
          const top = document.querySelector("#discard-slot .card");
          const from = (p === 0 && discardFrom) ? discardFrom : rectOf(`hand-${p}`);
          if (top) slideFrom(top, from, p === 0 && discardFrom !== null);
        }
      }
    }
  }
  animSeen = now;
  discardFrom = null;
}

// Hints / Settings buttons and the settings panel follow state
function renderToggles() {
  document.getElementById("settings").hidden = !state.showSettings;
  const hints = document.getElementById("hints-btn");
  hints.setAttribute("aria-pressed", String(state.showHints));
  hints.textContent = state.showHints ? "Hints: on" : "Hints";
  const settings = document.getElementById("settings-btn");
  settings.setAttribute("aria-expanded", String(state.showSettings));
  settings.classList.toggle("active", state.showSettings);
}

// Table of running totals under the game
function renderScoreboard() {
  const rows = PLAYER_NAMES.slice(0, state.numPlayers).map((name, p) => {
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
  const box = document.getElementById("analysis");
  box.hidden = !state.showHints;               // the table is only shown when Hints is on
  if (!state.showHints) return;
  const describe = card => `${card.value}${suitIcon(card.suit)}`;
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
document.getElementById("new-game").addEventListener("click", () => newGame());
document.getElementById("draw-pile").addEventListener("click", () => humanDraw("deck"));
document.getElementById("discard-pile").addEventListener("click", () => humanDraw("discard"));
document.getElementById("close-btn").addEventListener("click", humanClose);
document.getElementById("next-btn").addEventListener("click", nextRound);
document.getElementById("sort-btn").addEventListener("click", sortHand);
document.getElementById("hints-btn").addEventListener("click", () => {
  state.showHints = !state.showHints;
  render();
});
document.getElementById("settings-btn").addEventListener("click", () => {
  state.showSettings = !state.showSettings;
  render();
});

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

// Changing the deck or the number of CPUs starts a new game. If a game is under way,
// ask first with a bar inside the page (the browser's pop-up dialogs are blocked in
// some places). `pendingChange` holds the function to run if the player says yes
// (functions are ordinary values in JS, so we can store one and call it later).
let pendingChange = null;

// Put both dropdowns back to what the game is actually using
function syncSettingDropdowns() {
  document.getElementById("deck-size").value = String(DECK_SIZE);
  document.getElementById("cpu-count").value = String(state.numPlayers - 1);
}

function closeConfirm(accepted) {
  document.getElementById("deck-confirm").hidden = true;
  const change = pendingChange;
  pendingChange = null;
  if (accepted && change) change(); else syncSettingDropdowns();
}

function askBeforeNewGame(question, change) {
  const inProgress = state.round > 1 || state.totals.some(t => t !== 0) ||
                     state.hands[0].length > CARDS_PER_HAND;
  if (!inProgress) { change(); return; }
  pendingChange = change;
  document.getElementById("deck-confirm-text").textContent = question;
  document.getElementById("deck-confirm").hidden = false;
}

document.getElementById("deck-size").addEventListener("change", (e) => {
  const size = Number(e.target.value);
  askBeforeNewGame(`Switch to the ${size}-card deck? This starts a new game.`,
                   () => { setDeckSize(size); newGame(); });
});
document.getElementById("cpu-count").addEventListener("change", (e) => {
  const cpus = Number(e.target.value);
  askBeforeNewGame(`Play against ${cpus} CPU${cpus === 1 ? "" : "s"}? This starts a new game.`,
                   () => newGame(cpus));
});
document.getElementById("deck-yes").addEventListener("click", () => closeConfirm(true));
document.getElementById("deck-no").addEventListener("click", () => closeConfirm(false));
document.getElementById("reenter-yes").addEventListener("click", () => humanReenter(true));
document.getElementById("reenter-no").addEventListener("click", () => humanReenter(false));

// Results panel buttons
document.getElementById("results-btn").addEventListener("click", () => setResultsOpen(true));
document.getElementById("res-hide").addEventListener("click", () => setResultsOpen(false));
document.getElementById("res-next").addEventListener("click", nextRound);
document.getElementById("res-reenter").addEventListener("click", () => humanReenter(true));
document.getElementById("res-stayout").addEventListener("click", () => humanReenter(false));
document.getElementById("res-newgame").addEventListener("click", () => newGame());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.showResults) setResultsOpen(false);
});

/* ---------------------------------------------------------
   7. START: run once when the page loads
   --------------------------------------------------------- */
if (typeof runSelfTests === "function") runSelfTests();   // results in the console (F12)
newGame();
