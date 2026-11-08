/* =========================================================
   ui.js: everything you see and click
   ---------------------------------------------------------
   Turns `state` into HTML (render) and turns clicks/drags into calls to
   the functions in game.js.
   ========================================================= */

"use strict";

const MOVE_MS          = 260;   // how long one card takes to slide (kept under 300 ms)
const DEAL_STAGGER_MS  = 30;    // delay between one dealt card and the next
const GLOW_MS          = 900;   // how long the glow on a newly completed meld lasts
const POP_MS           = 1500;  // how long a "+12" score pop-up floats above a seat
const TOAST_EXTRA_MS   = 300;   // a CPU's toast stays this long after the CPU's discard pause

// Where to put each pip on a 1-9 card (8 and 9 only exist in the 48-card deck).
// Each pair is [x%, y%] inside the card's face area:
// x = 0 (left) .. 100 (right), y = 0 (top) .. 100 (bottom).
// The number of pairs equals the card's value, so a 4 shows 4 symbols.
const PIP_LAYOUTS = {
  1: [[50, 50]],
  2: [[50, 20], [50, 80]],
  3: [[50, 15], [50, 50], [50, 85]],
  4: [[28, 22], [72, 22], [28, 78], [72, 78]],
  5: [[28, 22], [72, 22], [50, 50], [28, 78], [72, 78]],
  6: [[28, 12], [72, 12], [28, 50], [72, 50], [28, 88], [72, 88]],
  7: [[28, 12], [72, 12], [50, 31], [28, 50], [72, 50], [28, 88], [72, 88]],
  8: [[28, 12], [72, 12], [28, 37], [72, 37], [28, 63], [72, 63], [28, 88], [72, 88]],
  9: [[22, 12], [78, 12], [22, 37], [78, 37], [50, 50], [22, 63], [78, 63], [22, 88], [78, 88]],
};

// Suit symbols and button icons, drawn as inline SVG (vector graphics written as text, so they
// stay sharp at any size and need no image files). Each <symbol> is drawn once on a 24x24 grid in
// the hidden sprite below; every use is then a tiny <svg><use href="#sym-oros"/></svg> pointing
// at it (see suitIcon; index.html uses the #ico-... button icons the same way). `fill="currentColor"` means "use the text colour of the surroundings", so the
// CSS colours .suit-oros, .suit-copas, ... colour the symbols too. `--cut` is the card-paper
// colour, used for the details cut out of each shape (coin ring, cup bowl, blade groove, knots).
const ICON_SPRITE = `
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
    <path d="M7.2 8C7.2 4.2 9.3 2 12 2s4.8 2.2 4.8 6z" fill="currentColor"/>
    <path d="M16.2 4.5q4-1.5 5 2.5-2.5-.8-4.3 0z" fill="currentColor"/>
    <circle cx="12" cy="10.5" r="3.6" fill="currentColor"/>
    <path d="M3.5 22c0-5.2 3.7-8 8.5-8s8.5 2.8 8.5 8z" fill="currentColor"/>
    <path d="M7.8 8.1h8.4" stroke="var(--cut,#fffaf0)" stroke-width="1"/>
    <path d="M9.3 14.8L12 18l2.7-3.2" fill="none" stroke="var(--cut,#fffaf0)" stroke-width="1.2"/>
  </symbol>
  <symbol id="sym-fig-11" viewBox="0 0 24 24">
    <path d="M5 22c0-5.5 2.2-9.5 4.8-12.5L8.2 4.8l3.2 1.8C12.5 3.8 14.8 2 17.5 2.5L17 5c3 1 5 4.3 5 8l-2 1.8-3.8-1.5c-1.5.8-2.4 2.5-2.4 4.2 0 1.7.8 3.2 1.8 4.5z" fill="currentColor"/>
    <circle cx="15.8" cy="7.8" r="1" fill="var(--cut,#fffaf0)"/>
    <path d="M9.8 9.5q3 1.5 3.8 5" fill="none" stroke="var(--cut,#fffaf0)" stroke-width="1"/>
  </symbol>
  <symbol id="sym-fig-12" viewBox="0 0 24 24">
    <path d="M2.5 19.5L1.5 6.5l6 5L12 3.5l4.5 8 6-5-1 13z" fill="currentColor"/>
    <rect x="2.5" y="19.5" width="19" height="2.8" rx="1" fill="currentColor"/>
    <circle cx="12" cy="15.5" r="1.4" fill="var(--cut,#fffaf0)"/>
    <circle cx="7" cy="15.5" r="1" fill="var(--cut,#fffaf0)"/>
    <circle cx="17" cy="15.5" r="1" fill="var(--cut,#fffaf0)"/>
  </symbol>
  <!-- button icons: lines rather than filled shapes (stroke = the line colour) -->
  <symbol id="ico-scores" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
    <path d="M3 20h18M5 20v-6h4v6M10 20V8h4v12M15 20v-9h4v9"/>
  </symbol>
  <symbol id="ico-hints" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.8 10.6c.6.5.8 1.3.8 2.4h6c0-1.1.2-1.9.8-2.4A6 6 0 0 0 12 3z"/>
  </symbol>
  <symbol id="ico-help" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/>
    <circle cx="12" cy="17" r=".6" fill="currentColor"/>
  </symbol>
  <symbol id="ico-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/>
    <circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>
  </symbol>
  <symbol id="ico-sound" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>
  </symbol>
  <symbol id="ico-mute" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>
  </symbol>
  <symbol id="ico-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M6 6l12 12M18 6L6 18"/>
  </symbol>
</svg>`;

// HTML for one suit symbol. Its size is 1em, so it scales with the font-size of whatever holds it.
const suitIcon = suit =>
  `<svg class="suit-icon" aria-label="${t(`suit.${suit}`)}" role="img"><use href="#sym-${suit}"/></svg>`;

// The same, for a purely decorative symbol that screen readers skip: the figure pictures
// ("fig-10" Sota, "fig-11" Caballo, "fig-12" Rey; coloured by the card's suit colour) and the
// celebration at the end of a game (a suit name).
const decorIcon = name =>
  `<svg class="suit-icon" aria-hidden="true"><use href="#sym-${name}"/></svg>`;

// Put the sprite into the page once, at load (it is invisible; it only holds the shapes).
document.body.insertAdjacentHTML("afterbegin", ICON_SPRITE);

/* ---------------------------------------------------------
   RENDERING: turn `state` into HTML elements.
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
  const symbol = suitIcon(card.suit);

  // Build the middle of the card.
  //  - values 1-9: that many suit symbols, positioned from PIP_LAYOUTS
  //  - values 10-12: a framed figure with its name (Sota / Caballo / Rey)
  let faceHTML;
  if (card.value <= 9) {
    const size = card.value === 1 ? "big" : card.value >= 7 ? "xs" : (card.value >= 5 ? "sm" : "");
    const pips = PIP_LAYOUTS[card.value]
      .map(([x, y]) => `<span class="pip ${size}" style="left:${x}%;top:${y}%">${symbol}</span>`)
      .join("");
    faceHTML = `<div class="face">${pips}</div>`;
  } else {
    faceHTML = `
      <div class="face figure">
        <span class="fig-suit">${symbol}</span>
        <span class="fig-icon">${decorIcon(`fig-${card.value}`)}</span>
        <span class="fig-name">${t(`card.fig.${card.value}`)}</span>
      </div>`;
  }

  // innerHTML lets us write the card's insides as an HTML string.
  // The corners show the number (the figures too: 10, 11, 12).
  el.innerHTML = `
    <div class="corner">${card.value}</div>
    ${faceHTML}
    <div class="corner bottom">${card.value}</div>
  `;
  // Tooltip on hover, e.g. "12 de oros (Rey)"; {fig} is empty for the number cards
  el.title = t("card.title", { value: card.value, suit: card.suit, fig: card.value });
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

  // Hints on: the cards of each meld in your hand get a coloured bar along the bottom
  // (two colours, so two melds side by side can be told apart; 7 or 8 cards hold at most two melds).
  // A Map from card object to the meld numbers it fits; evaluateHand returns the hand's own card objects.
  const meldOf = new Map();
  if (playerIndex === 0 && state.showHints && state.hands[0].length > 0) {
    const melds = evaluateHand(state.hands[0]).melds;
    melds.forEach((m, k) => m.cards.forEach(c => meldOf.set(c, [k])));
    // A card that could just as well join the other meld (3-3-3-3 with 4-5-6 of the 3's suit:
    // that 3 fits the group or the run) gets both colours, as a striped bar
    melds.forEach((m, k) => m.cards.forEach(c => {
      melds.forEach((other, j) => { if (j !== k && isMeld([...other.cards, c])) meldOf.get(c).push(j); });
    }));
  }
  // ...and when a card you take completes a new meld, its cards glow once (see glowMelds)
  const newMeld = playerIndex === 0 && meldGrew();

  // How many cards are in the hand: style.css uses it to spread your hand over the
  // available width (less overlap when there is room, more when there is not)
  container.style.setProperty("--hand-n", state.hands[playerIndex].length);

  state.hands[playerIndex].forEach((card, index) => {
    const el = createCardElement(card, faceUp);
    // The card you drew this turn gets a small gold dot until you discard
    if (canDiscard && card === state.lastDrawn) el.classList.add("just-drawn");
    if (meldOf.has(card)) {
      const fits = meldOf.get(card);
      el.classList.add("in-meld", fits.length > 1 ? "meld-shared" : fits[0] % 2 ? "meld-b" : "meld-a");
    }
    let onTap = null;                                        // what a plain tap or click does
    if (closable) {
      if (closable.has(index)) {
        const info = closable.get(index);
        el.classList.add("clickable", "close-option");
        el.title += info.chinchon ? t("card.closeChinchon")
                                  : t("card.closeScore", { n: info.closerScore });
        onTap = () => { discardFrom = el.getBoundingClientRect(); act("close", cardKey(card)); };
      } else {
        el.classList.add("dimmed");                          // this discard is not a legal close
      }
    } else if (canDiscard) {
      el.classList.add("clickable");                         // CSS highlights it
      onTap = () => { discardFrom = el.getBoundingClientRect(); act("discard", cardKey(card)); };
    }
    if (playerIndex === 0) makeInteractive(el, index, onTap);   // tap = act, drag = rearrange
    container.appendChild(el);
  });
  if (newMeld && meldOf.size > 0) glowMelds(container, meldOf);
}

// Has the number of melds in your hand gone up since your hand was last drawn? A new deal
// starts the count again, so a dealt hand never glows. (evalSummary in rules.js caches the
// answer, so asking on every render is cheap.)
let meldsSeen = { deals: 0, count: 0 };
function meldGrew() {
  const count = state.hands[0].length ? evalSummary(state.hands[0]).melds : 0;
  const grew = state.deals === meldsSeen.deals && count > meldsSeen.count;
  meldsSeen = { deals: state.deals, count };
  return grew;
}

// A soft green glow that rises and fades on the cards of your melds (Hints on, motion allowed)
function glowMelds(container, meldOf) {
  if (REDUCED_MOTION.matches) return;
  const cards = container.querySelectorAll(".card");
  state.hands[0].forEach((card, i) => {
    if (!meldOf.has(card)) return;
    cards[i].animate(
      [{ boxShadow: "0 0 0 0 rgba(95, 216, 138, 0)" },
       { boxShadow: "0 0 20px 5px rgba(95, 216, 138, .85)", offset: 0.35 },
       { boxShadow: "0 0 0 0 rgba(95, 216, 138, 0)" }],
      { duration: GLOW_MS, easing: "ease-out" });
  });
}

/* ---------------------------------------------------------
   Pressing one of your cards: a tap acts (discard / close), a drag
   rearranges. Pointer events cover mouse, touch and pen with ONE code path
   (the older HTML5 drag-and-drop API does not work on most phones).
   The ORDER of state.hands[0] is the order you see, so moving a card just
   means asking for a new order (the "order" action, setHandOrder in game.js).
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
    if (completed && g.target !== g.index) moveCard(g.index, g.target);   // re-renders (or the server's answer will)
    else render();                                                        // dropped in place
  } else if (completed && g.onTap) {
    g.onTap();                                  // a plain tap: discard / close
  } else {
    render();                                   // nothing to do; catch up on skipped redraws
  }
}

// Move the card at position `from` in your hand so that it ends up at position `to`
function moveCard(from, to) {
  const keys = state.hands[0].map(cardKey);
  const [key] = keys.splice(from, 1);      // take it out...
  keys.splice(to, 0, key);                 // ...and put it back at the new spot
  act("order", keys);
}

// The "Sort hand" button (and choosing a sort method): sort by the method in state.sortMode
function sortMyHand() {
  if (state.hands[0].length === 0) return;
  act("order", sortedHand(state.hands[0], state.sortMode).map(cardKey));
}

// "Close round" button: switch into (or out of) closing mode. In closing mode only the
// cards that allow a legal close are clickable; clicking one discards it and closes the
// round (the "close" action). Closing mode is only how YOUR screen behaves, so it is
// not an action; renderStatus explains it while it is on.
function toggleClosing() {
  if (state.currentPlayer !== 0 || state.phase !== "discard") return;
  if (!state.closing && closeOptions(state.hands[0]).length === 0) return;
  state.closing = !state.closing;
  render();
}

// Text that came from a person (an online nickname), made safe to put into innerHTML:
// characters that mean something in HTML are written as entities, so "<b>" shows as
// itself instead of turning the rest of the page bold.
const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => HTML_ENTITIES[ch]);

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
    t("pile.draw", { n: state.drawPile.length });
  // How many more times the deck can be refilled (nothing shown when there is no limit),
  // or, once it is used up, a warning that drawing from it ends the round
  const left = reshufflesLeft();
  document.getElementById("reshuffle-label").textContent =
    deckIsFinished() ? t("pile.endsRound") : left === null ? "" : t("pile.reshuffles", { n: left });
  document.getElementById("reshuffle-label").classList.toggle("warn", deckIsFinished());

  // Discard pile: show only the TOP card, face-up
  if (state.discardPile.length > 0) {
    const top = state.discardPile[state.discardPile.length - 1];
    discardSlot.appendChild(createCardElement(top, true));
  } else {
    discardSlot.innerHTML = '<div class="pile-empty"></div>';
  }
  document.getElementById("discard-label").textContent =
    t("pile.discard", { n: state.discardPile.length });
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
    const active = p === state.currentPlayer && state.phase !== "roundOver";
    seat.classList.toggle("active", active);
    seat.classList.toggle("thinking", active && p !== 0);   // CSS adds animated dots to a CPU's name

    // Seat label, drawn as a "chip": a round avatar with a suit symbol (each seat has its
    // own suit), the name with the CPU level under it, the running total in a badge,
    // and OUT if eliminated. The whole chip is also read out as one line by screen
    // readers (aria-label), since the separate pieces would not make a sentence.
    seat.classList.toggle("out", !state.inGame[p]);
    const label = seat.querySelector(".seat-name");
    // Under the name: a CPU's level, "away" for an online player whose seat the CPU is playing
    // for the moment, and nothing for a person
    const under = state.seats[p] === "cpu"  ? t(`level.${state.cpuLevels[p] || "hard"}`)
                : state.seats[p] === "away" ? t("seat.away") : "";
    const level = under ? `<span class="seat-level">${under}</span>` : "";
    label.innerHTML =
      `<span class="avatar suit-${SUITS[p]}">${decorIcon(SUITS[p])}</span>` +
      `<span class="seat-text"><span class="seat-who">${escapeHtml(playerName(p))}</span>${level}</span>` +
      `<span class="score-badge">${state.totals[p]}</span>` +
      (state.inGame[p] ? "" : `<span class="seat-out">${t("board.out")}</span>`);
    label.setAttribute("aria-label", t("seat.score", { name: playerName(p), n: state.totals[p] }) +
                                     (state.inGame[p] ? "" : ` · ${t("board.out")}`));
  }
}

// Master render: redraw everything from state
function render() {
  applyStaticText();
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
  renderOnline();
  renderStatus();
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
let animSeen = { deals: 0, drawLen: 0, discardLen: 0, handLen: [],      // what the previous render looked like
                 phase: null, current: null, gameOver: false };
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

// Called at the end of every render(): compare with the previous render and play what
// changed, as card slides (unless reduced motion is on) and sounds (unless Sound is off).
function animateChanges(rebuilt) {
  const prev = animSeen;
  const now = { deals: state.deals, drawLen: state.drawPile.length,
                discardLen: state.discardPile.length, handLen: prev.handLen.slice(),
                phase: state.phase, current: state.currentPlayer, gameOver: state.gameOver };
  state.hands.forEach((hand, p) => { if (rebuilt[p]) now.handLen[p] = hand.length; });
  const motion = !REDUCED_MOTION.matches;

  if (now.deals !== prev.deals) {
    stopFireworks();                                  // a new round or game: the Chinchón party is over
    if (motion) animateDeal();
    playSound("deal");
  } else {
    for (let p = 0; p < state.numPlayers; p++) {
      if (!rebuilt[p]) continue;
      const before = prev.handLen[p] || 0, after = now.handLen[p];
      if (after === before + 1) {
        // A card was drawn. It came from the discard pile if that shrank and the draw pile did not.
        const fromDiscard = now.discardLen === prev.discardLen - 1 && now.drawLen === prev.drawLen;
        const cards = document.querySelectorAll(`#hand-${p} .card`);
        if (motion) slideFrom(cards[cards.length - 1], rectOf(fromDiscard ? "discard-slot" : "draw-slot"), true);
        playSound("draw");
      } else if (after === before - 1 && now.discardLen === prev.discardLen + 1) {
        // A card was discarded: slide the new top of the discard pile in from the hand
        const top = document.querySelector("#discard-slot .card");
        const from = (p === 0 && discardFrom) ? discardFrom : rectOf(`hand-${p}`);
        if (top && motion) slideFrom(top, from, p === 0 && discardFrom !== null);
        playSound("discard");
      }
    }
  }

  // The round just ended (a close or a stalemate), the game just ended with your win,
  // or your turn just began
  if (now.phase === "roundOver" && prev.phase !== "roundOver") {
    const chinchon = Boolean(state.roundResult && state.roundResult.chinchon);
    playSound(chinchon ? "chinchon" : "close");
    if (chinchon) launchFireworks();                   // the easter egg (not with reduced motion)
  }
  if (now.gameOver && !prev.gameOver && state.winner === 0) playSound("win");
  if (now.phase === "draw" && now.current === 0 && now.deals === prev.deals &&
      (prev.current !== 0 || prev.phase !== "draw")) playSound("turn");

  queueScorePops(now.deals !== prev.deals && state.round === 1);   // true when a new game was dealt
  animSeen = now;
  discardFrom = null;
}

// ---- Score pop-ups ----
// When a round has been scored, each seat shows what it scored ("+12", "-10") floating up
// from its name. The results panel opens over the table at that moment, so the pop-ups
// wait until it is out of the way (hidden, or the next round has started).
// (Keyed by state.deals, which goes up with every deal, unlike the round number.)
let scorePops = { deal: 0, points: null };    // the deal already queued, and points waiting to be shown
function queueScorePops(newGame) {
  if (newGame) scorePops.points = null;                          // an old game's points are not shown
  // A round result we have not queued yet (and not while lay-offs can still change the points)
  if (state.roundDetail && !state.layoff && scorePops.deal !== state.deals) {
    scorePops = { deal: state.deals, points: state.roundDetail.map(d => d && d.points) };
  }
  if (!scorePops.points || state.showResults) return;
  if (!REDUCED_MOTION.matches) {
    scorePops.points.forEach((pts, p) => {
      if (pts === null || pts === undefined || pts === 0 || p >= state.numPlayers) return;
      showScorePop(p, pts);
    });
  }
  scorePops.points = null;
}
function showScorePop(p, pts) {
  const pop = document.createElement("span");
  pop.className = "score-pop" + (pts < 0 ? " good" : "");
  pop.textContent = pts > 0 ? `+${pts}` : `\u2212${-pts}`;   // \u2212 is a real minus sign
  // Starting over the top edge of the seat's name chip: offsetTop is the chip's distance
  // from the top of the seat (the seat is the positioned box the pop-up is placed in)
  const seat = document.getElementById(`seat-${p}`);
  seat.appendChild(pop);
  pop.style.top = `${seat.querySelector(".seat-name").offsetTop - pop.offsetHeight / 2}px`;
  const anim = pop.animate(
    [{ opacity: 0, transform: "translate(-50%, 6px) scale(.8)" },
     { opacity: 1, transform: "translate(-50%, -10px) scale(1.1)", offset: 0.2 },
     { opacity: 0, transform: "translate(-50%, -24px) scale(1)" }],
    { duration: POP_MS, easing: "ease-out" });
  anim.onfinish = () => pop.remove();
}

/* ---------------------------------------------------------
   CHINCHÓN FIREWORKS: an easter egg for the rarest hand in the game.
   When anyone makes a Chinchón, fireworks and emojis fill the whole screen for a
   few seconds. They are painted on a <canvas>, a bitmap that the script draws on
   (rather like a plotting device in R), laid over everything. pointer-events: none
   (style.css) lets taps go through it to the results panel underneath.
   The show is a simple particle system: every frame, each particle moves by its
   velocity, gravity pulls it down, and it fades as its life runs out. Rockets fly
   up and burst into sparks or into a handful of emojis, and emojis rain from the top.
   Skipped with reduced motion. Nothing here changes `state`.
   --------------------------------------------------------- */
const FIREWORKS_MS      = 6500;   // how long the whole show lasts
const ROCKETS_UNTIL_MS  = 4500;   // no new rockets after this, so the last bursts fade in time
const ROCKET_EVERY_MS   = 260;    // a new rocket this often
const RAIN_UNTIL_MS     = 3000;   // emojis keep raining from the top until this
const RAIN_EVERY_MS     = 90;     // a new falling emoji this often
const SPARKS_PER_BURST  = 70;     // sparks in one burst
const EMOJIS_PER_BURST  = 9;      // emojis in one emoji burst (every third burst)
const GRAVITY           = 0.06;   // pixels per frame per frame, pulling sparks and emojis down
const ROCKET_GRAVITY    = 0.25;   // stronger for the rockets, so they shoot up fast and burst within about a second
const FIREWORK_COLOURS  = ["#f5c84c", "#ff5d73", "#5fd88a", "#5ec8f0", "#c77dff", "#ffffff"];
const FIREWORK_EMOJIS   = ["🎉", "🎆", "🎇", "✨", "🥳", "🍾", "🏆", "🌟", "👑", "🃏", "💰", "🤩"];
const EMOJI_FONT        = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

let fireworks = null;     // the show in progress (null = none)

// A random number between lo and hi, and a random item of a list
const between = (lo, hi) => lo + Math.random() * (hi - lo);
const pickOne = list => list[Math.floor(Math.random() * list.length)];

function launchFireworks() {
  if (fireworks || REDUCED_MOTION.matches) return;
  const canvas = document.createElement("canvas");
  canvas.id = "fireworks";
  canvas.setAttribute("aria-hidden", "true");          // decoration only: screen readers skip it
  document.body.appendChild(canvas);
  const now = performance.now();                       // milliseconds, like Date.now() but smoother
  fireworks = { canvas, ctx: canvas.getContext("2d"), start: now, last: now,
                nextRocket: 0, nextRain: 0, bursts: 0, rockets: [], particles: [] };
  // requestAnimationFrame(f) calls f just before the browser paints the next frame
  // (about 60 times a second), passing it the current time
  requestAnimationFrame(fireworksFrame);
}

function stopFireworks() {
  if (!fireworks) return;
  fireworks.canvas.remove();
  fireworks = null;
}

// A rocket from the bottom edge, fast enough to burst somewhere in the top half.
// (Thrown upwards at speed v, it climbs v² / 2g before it stops: so v = √(2 g height).)
function addRocket(w, h) {
  const climb = h * between(0.5, 0.8);
  fireworks.rockets.push({ x: between(w * 0.1, w * 0.9), y: h, vx: between(-1, 1),
                           vy: -Math.sqrt(2 * ROCKET_GRAVITY * climb), colour: pickOne(FIREWORK_COLOURS) });
}

// A rocket at the top of its climb bursts: into sparks of its colour, or every third time into emojis
function burst(rocket) {
  const emojis = ++fireworks.bursts % 3 === 0;
  const count = emojis ? EMOJIS_PER_BURST : SPARKS_PER_BURST;
  for (let i = 0; i < count; i++) {
    const angle = between(0, 2 * Math.PI);
    const speed = emojis ? between(1.5, 3.5) : between(1, 4.5);
    const life = between(55, 90);                      // in frames
    fireworks.particles.push({
      x: rocket.x, y: rocket.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life, maxLife: life, gravity: GRAVITY,
      colour: emojis ? null : pickOne([rocket.colour, rocket.colour, "#ffffff"]),
      emoji: emojis ? pickOne(FIREWORK_EMOJIS) : null, size: between(22, 36),
      rot: 0, spin: between(-0.08, 0.08),
    });
  }
  playSound("firework");
}

// An emoji falling from the top edge, swaying a little and spinning slowly
function addRain(w) {
  fireworks.particles.push({
    x: between(0, w), y: -30, vx: between(-0.6, 0.6), vy: between(1.5, 3.5),
    life: 400, maxLife: 400, gravity: 0.01,
    colour: null, emoji: pickOne(FIREWORK_EMOJIS), size: between(24, 44),
    rot: between(-0.5, 0.5), spin: between(-0.04, 0.04),
  });
}

// One frame of the show: add rockets and rain while it is their time, move everything, draw it
function fireworksFrame(now) {
  const fw = fireworks;
  if (!fw) return;                                     // stopped since the last frame
  const t = now - fw.start;
  if (t > FIREWORKS_MS) { stopFireworks(); return; }

  // Keep the canvas as big as the window, in real screen pixels (devicePixelRatio is 2 or 3
  // on most phones), and draw in CSS pixels: setTransform scales everything for us
  const w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
  if (fw.canvas.width !== Math.round(w * dpr) || fw.canvas.height !== Math.round(h * dpr)) {
    fw.canvas.width = Math.round(w * dpr);
    fw.canvas.height = Math.round(h * dpr);
  }
  const ctx = fw.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // dt: how many 60-per-second frames have passed, so the speed is the same on any screen
  // (capped, so a pause in a background tab does not make everything jump)
  const dt = Math.min(3, (now - fw.last) / (1000 / 60));
  fw.last = now;

  while (t < ROCKETS_UNTIL_MS && t >= fw.nextRocket) { addRocket(w, h); fw.nextRocket += ROCKET_EVERY_MS; }
  while (t < RAIN_UNTIL_MS && t >= fw.nextRain) { addRain(w); fw.nextRain += RAIN_EVERY_MS; }

  // Rockets: a short bright streak going up; they burst once they stop climbing
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  fw.rockets = fw.rockets.filter(r => {
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.vy += ROCKET_GRAVITY * dt;
    if (r.vy >= 0) { burst(r); return false; }         // false = drop it from the list
    ctx.strokeStyle = r.colour;
    ctx.beginPath();
    ctx.moveTo(r.x - r.vx * 2, r.y - r.vy * 2);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
    return true;
  });

  // Sparks and emojis: fade out over their life (globalAlpha is the see-through-ness of what is drawn next)
  ctx.font = `30px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fw.particles = fw.particles.filter(p => {
    p.vx *= 0.985;                                     // a little air resistance
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.rot += p.spin * dt;
    p.life -= dt;
    if (p.life <= 0 || p.y > h + 50) return false;
    ctx.globalAlpha = Math.min(1, p.life / p.maxLife * 1.5);
    if (p.emoji) {
      ctx.save();                                      // save/restore: the move and turn apply to this emoji only
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.font = `${p.size}px ${EMOJI_FONT}`;
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    } else {
      ctx.strokeStyle = p.colour;                      // a spark: a short line along its path
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    return true;
  });
  ctx.globalAlpha = 1;

  requestAnimationFrame(fireworksFrame);
}

// The text written in index.html (data-i18n attributes): rewritten whenever the language
// changes, and once at startup. Everything else is rebuilt by render() anyway.
let staticTextLang = null;    // the language the page text is currently in
function applyStaticText() {
  if (staticTextLang === currentLang) return;
  staticTextLang = currentLang;
  document.documentElement.lang = currentLang;                     // <html lang="es">
  document.title = t("app.title");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  // data-i18n-title="key" is read in JS as dataset.i18nTitle (dashes become camelCase)
  document.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.getElementById("lang").value = currentLang;
  if (pendingQuestion) {                                           // a confirm bar is open
    document.getElementById("deck-confirm-text").textContent = pendingQuestion();
  }
  const toast = document.querySelector("#toasts .toast");
  if (toast && toastMessage) toast.textContent = tm(toastMessage);
}

// The top bar's buttons and the panels they open follow state. The Hints button is a
// toggle: aria-pressed tells screen readers (and style.css) whether it is on.
function renderToggles() {
  document.getElementById("hints-btn").setAttribute("aria-pressed", String(state.showHints));
  // Sound: pressed while sound is on, and a crossed-out speaker when it is off
  const sound = document.getElementById("sound-btn");
  sound.setAttribute("aria-pressed", String(soundOn));
  sound.querySelector("use").setAttribute("href", soundOn ? "#ico-sound" : "#ico-mute");
  document.getElementById("settings-sheet").hidden = !state.showSettings;
  document.getElementById("settings-btn").setAttribute("aria-expanded", String(state.showSettings));
  document.getElementById("scores").hidden = !state.showScores;
  document.getElementById("scores-btn").setAttribute("aria-expanded", String(state.showScores));
  // The tip is in the settings panel, so it shows up right where you picked 3 CPUs
  document.getElementById("deck-tip").hidden = !(state.numPlayers === MAX_PLAYERS && DECK_SIZE === 40);
  document.getElementById("help").hidden = !state.showHelp;
  document.getElementById("help-btn").setAttribute("aria-expanded", String(state.showHelp));
}

// Table of running totals under the game
function renderScoreboard() {
  const rows = Array.from({ length: state.numPlayers }, (_, p) => {
    const last = state.roundPoints[p];
    return `<tr class="${state.inGame[p] ? "" : "out"}">` +
           `<td>${escapeHtml(playerName(p))}</td><td>${state.totals[p]}</td>` +
           `<td>${last === null ? "–" : last}</td>` +
           `<td class="col-status">${t(state.inGame[p] ? "board.in" : "board.out")}</td></tr>`;
  }).join("");

  // "Round 3", "Round 3 of 10", or "Round 11: tie-break" once past the round limit:
  // in full above the table, and the short form in the top bar
  const vars = { n: state.round, max: state.roundLimit, limit: SCORE_LIMIT };
  const kind = state.roundLimit === null      ? "round"
             : state.round > state.roundLimit ? "tieBreak"
             :                                  "roundOf";
  const heading = t(`board.${kind}`, vars);
  document.getElementById("round-chip").textContent = t(`top.${kind}`, vars);
  document.getElementById("scoreboard").innerHTML =
    `<b>${heading}</b>` +
    `<table><tr><th>${t("board.player")}</th><th>${t("board.total")}</th>` +
    `<th>${t("board.last")}</th><th class="col-status">${t("board.status")}</th></tr>${rows}</table>`;
}

// Enable/disable the buttons and highlight the piles you can click
function renderControls() {
  const myTurn  = state.currentPlayer === 0;
  const drawing = myTurn && state.phase === "draw";
  const closeAllowed = myTurn && state.phase === "discard" &&
                       closeOptions(state.hands[0]).length > 0;

  // Buttons that only make sense at one moment are hidden the rest of the time, so the
  // button bar stays short (on a phone it would otherwise wrap onto three rows):
  // Close round during the play, Next round and Round results once the round is over.
  const roundOver = state.phase === "roundOver";
  document.getElementById("close-btn").hidden = roundOver;
  document.getElementById("next-btn").hidden = !roundOver;
  document.getElementById("results-btn").hidden = !roundOver;

  document.getElementById("close-btn").disabled = !closeAllowed;
  document.getElementById("close-btn").textContent = closeButtonText(closeAllowed);
  document.getElementById("sort-btn").disabled = state.hands[0].length === 0;
  document.getElementById("next-btn").disabled =
    !(roundOver && !state.layoff && !state.reentryPending.length && !state.gameOver);
  document.getElementById("results-btn").disabled = !(roundOver && state.roundDetail);

  // Re-entry question, shown only while you are out and must choose
  // (while the results panel is open, it asks the question itself)
  document.getElementById("reentry").hidden = !(state.reentryPending.includes(0) && !state.showResults);
  document.getElementById("reentry-text").textContent = reentryText();
  document.getElementById("draw-pile").classList.toggle("can-pick", drawing);
  document.getElementById("discard-pile").classList.toggle(
    "can-pick", drawing && state.discardPile.length > 0);
}

// "Close round", or "Cancel closing" in closing mode. With Hints on and a close possible,
// it also says the best score you could close with: "Close round (3 pts)" or "Close: CHINCHÓN!".
function closeButtonText(closeAllowed) {
  if (state.closing) return t("btn.closeCancel");
  if (!closeAllowed || !state.showHints) return t("btn.close");
  const options = closeOptions(state.hands[0]);
  if (options.some(o => o.info.chinchon)) return t("btn.closeChinchon");
  return t("btn.closeBest", { n: Math.min(...options.map(o => o.info.closerScore)) });
}

// The Hints panel under the table: how the evaluator sees YOUR hand (melds, leftover
// points, and whether and how you could close)
function renderAnalysis() {
  const box = document.getElementById("analysis");
  box.hidden = !state.showHints;               // the table is only shown when Hints is on
  if (!state.showHints) return;
  const describe = card => `${card.value}${suitIcon(card.suit)}`;
  const title = `<b>${t("hint.title")}</b><br>`;
  if (state.hands[0].length === 0) {          // you are out of the game
    box.innerHTML = title + t("hint.notPlaying");
    return;
  }
  const info = getCloseInfo(state.hands[0]);

  const meldText = info.melds.length
    ? info.melds.map(m => `${meldName(m.type)}: ${m.cards.map(describe).join(" ")}`).join(" | ")
    : t("hint.none");
  const unmatchedText = info.unmatched.length
    ? `${info.unmatched.map(describe).join(" ")} (${info.points} pts)`
    : t("hint.none");

  let closeText = t("hint.no");
  if (!closingAllowed()) {
    closeText = t("hint.notYet");                 // first lap: nobody may close yet
  } else if (state.hands[0].length > CARDS_PER_HAND) {
    // 8 cards in hand: you must discard one to close, so show the best option
    const option = findBestClose(state.hands[0]);
    if (option) {
      const discarded = describe(state.hands[0][option.discardIndex]);
      closeText = option.info.chinchon
        ? t("hint.yesDiscardChinchon", { discard: discarded })
        : t("hint.yesDiscard", { discard: discarded, n: option.info.closerScore });
    }
  } else if (info.chinchon) {
    closeText = t("hint.yesChinchon");
  } else if (info.canClose) {
    closeText = t("hint.yes", { n: info.closerScore });
  }

  box.innerHTML = title + `${t("hint.melds")}: ${meldText}<br>` +
    `${t("hint.unmatched")}: ${unmatchedText}<br>${t("hint.canClose")}: ${closeText}`;
}

// ---- The round results panel ----
// Shows, for every player in the round, how their cards split into melds and
// leftover cards, what they scored, and their new total.

// A labelled group of small cards ("Run", "Group", "Left over" or "Laid off").
// `laidBy` (optional) says, card by card, who laid that card off onto this meld
// (undefined for the meld's own cards): those cards get a dashed outline and a tooltip.
function resultGroup(cards, label, cls, laidBy = []) {
  const box = document.createElement("div");
  box.className = "res-group " + cls;
  const row = document.createElement("div");
  row.className = "res-cards-row";
  cards.forEach((c, i) => {
    const el = createCardElement(c, true);
    if (laidBy[i] !== undefined) {
      el.classList.add("laid");
      el.title += t("card.laidBy", { who: laidBy[i] });
    }
    row.appendChild(el);
  });
  const caption = document.createElement("div");
  caption.className = "res-label";
  caption.textContent = label;
  box.append(row, caption);
  return box;
}

// Manual lay-off: the leftover card you picked in the results panel (an index into
// your leftover cards), waiting for you to pick the meld it goes on. null = none picked.
// Screen-only, like dragFrom, so it lives here and not in `state`.
let layoffPick = null;

// One meld on the results screen, with the cards laid off on it sorted in among its own.
// While you lay off by hand: on another player's row, a click on the meld puts your picked
// card there, and a click on a card you laid off takes it back.
function resultMeld(d, m, index) {
  // { card, by, laidIndex }: by and laidIndex are only set for laid-off cards
  const all = [...m.cards.map(card => ({ card })),
               ...m.laid.map((l, laidIndex) => ({ card: l.card, by: l.by, laidIndex }))]
    .sort((a, b) => rankIndex(a.card) - rankIndex(b.card));
  const box = resultGroup(all.map(x => x.card), meldName(m.type), "meld", all.map(x => x.by));
  if (!awaitingLayoff(0) || d.p === 0) return box;

  if (layoffPick !== null) {
    box.classList.add("target");
    // Hints on: show which melds your picked card fits (with Hints off you work it out yourself)
    if (state.showHints && isMeld([...meldCards(m), state.roundDetail[0].unmatched[layoffPick]])) {
      box.classList.add("fits");
    }
    box.addEventListener("click", () => {
      const card = state.roundDetail[0].unmatched[layoffPick];
      layoffPick = null;
      // A card that does not fit is refused here, with a message, before asking the game
      if (isMeld([...meldCards(m), card])) act("layOff", cardKey(card), d.p, index);
      else setStatus(msg("msg.layoffNoFit", { card }), msg("msg.layoff", { who: 0 }));
    });
  }
  box.querySelectorAll(".card").forEach((el, i) => {
    if (all[i].by !== 0) return;
    el.classList.add("clickable");
    el.addEventListener("click", (e) => {
      e.stopPropagation();                        // only take the card back, don't also lay one off
      layoffPick = null;
      act("takeBack", d.p, index, all[i].laidIndex);
    });
  });
  return box;
}

function resultRow(d) {
  const name = playerName(d.p);
  const row = document.createElement("div");
  row.className = "res-row" + (d.closer ? " closer" : "");

  const pts = d.chinchon ? t("res.chinchon") : (d.points > 0 ? `+${d.points}` : String(d.points));
  const gameEndedHere = state.roundResult.chinchon && CHINCHON_ENDS_GAME;
  // (no total while lay-offs are still going on: the round has not been scored yet)
  const total = gameEndedHere || state.layoff ? "" : t("res.total", { n: state.totals[d.p] });
  const badges = (d.closer && !d.chinchon ? `<span class="badge">${t("res.badgeClosed")}</span>` : "") +
                 (!state.inGame[d.p] ? `<span class="badge out">${t("res.badgeOut")}</span>` : "");
  const head = document.createElement("div");
  head.className = "res-head";
  head.innerHTML = `<b>${escapeHtml(name)}</b>${badges}` +
                   `<span class="res-pts${d.points < 0 || d.chinchon ? " good" : ""}">${pts}</span>` +
                   `<span class="res-total">${total}</span>`;

  const cards = document.createElement("div");
  cards.className = "res-cards";
  d.melds.forEach((m, index) => cards.appendChild(resultMeld(d, m, index)));
  if (d.unmatched.length) {
    const box = resultGroup(d.unmatched, t("res.leftover", { n: pointsOfCards(d.unmatched) }), "leftover");
    // Laying off by hand: a click on one of your leftover cards picks it (a second click drops it)
    if (d.p === 0 && awaitingLayoff(0)) {
      box.querySelectorAll(".card").forEach((el, i) => {
        el.classList.add("clickable");
        el.classList.toggle("picked", i === layoffPick);
        el.addEventListener("click", () => {
          layoffPick = layoffPick === i ? null : i;
          render();
        });
      });
    }
    cards.appendChild(box);
  }
  if (d.laidOff.length) {
    cards.appendChild(resultGroup(d.laidOff, t("res.laidOff", { n: pointsOfCards(d.laidOff) }), "laidoff"));
  }
  row.append(head, cards);
  return row;
}

function renderResults() {
  const overlay = document.getElementById("results");
  const detail = state.roundDetail;
  const show = state.phase === "roundOver" && state.showResults && detail;
  overlay.hidden = !show;
  if (!awaitingLayoff(0)) layoffPick = null;     // a pick only lasts while you are laying off
  if (!show) return;

  const rr = state.roundResult;
  const headline = rr.closer === null ? t("res.head.stalemate")
                 : rr.chinchon        ? t(whoKey("res.head.chinchon", rr.closer), { who: rr.closer })
                 :                      t(whoKey("res.head.closed", rr.closer), { who: rr.closer });
  document.getElementById("results-title").textContent = t("res.title", { n: state.round, headline });

  const body = document.getElementById("results-body");
  body.innerHTML = "";
  detail.forEach(d => { if (d) body.appendChild(resultRow(d)); });

  renderGameOverBanner();
  let notice = tms(state.notice);
  const askMe = state.reentryPending.includes(0);
  if (askMe) notice = `${reentryText()} ${notice}`;   // (a win is announced by the banner)
  document.getElementById("results-notice").textContent = notice;

  document.getElementById("res-layoff-done").hidden = !awaitingLayoff(0);
  document.getElementById("res-next").hidden     = Boolean(state.layoff) || state.reentryPending.length > 0 || state.gameOver;
  document.getElementById("res-reenter").hidden  = !askMe;
  document.getElementById("res-stayout").hidden  = !askMe;
  document.getElementById("res-newgame").hidden  = !state.gameOver;
}

// At the end of a game, the results panel opens with a banner: who won, and the final
// standings (the winner first, then the others still in by total, then those who are out).
// When you win, or anyone makes a Chinchón, a few suit symbols float up from it.
const CELEBRATION_PIPS = 10;    // how many suit symbols float up from the banner
function renderGameOverBanner() {
  const banner = document.getElementById("results-banner");
  banner.hidden = !state.gameOver;
  if (!state.gameOver) { banner.innerHTML = ""; return; }

  const order = Array.from({ length: state.numPlayers }, (_, p) => p)
    .filter(p => p !== state.winner)
    .sort((a, b) => (state.inGame[b] - state.inGame[a]) || (state.totals[a] - state.totals[b]));
  order.unshift(state.winner);
  // (state.inGame[b] - state.inGame[a]: true counts as 1 and false as 0, so players still in come first)
  const rows = order.map((p, i) =>
    `<li class="${p === state.winner ? "winner" : ""}${state.inGame[p] ? "" : " out"}">` +
    `<span>${i + 1}. ${escapeHtml(playerName(p))}</span><span>${state.totals[p]}</span></li>`).join("");

  const celebrate = state.winner === 0 || (state.roundResult && state.roundResult.chinchon);
  const pips = celebrate
    ? Array.from({ length: CELEBRATION_PIPS }, (_, i) =>
        `<span class="confetti suit-${SUITS[i % SUITS.length]}" ` +
        `style="left:${5 + i * 90 / CELEBRATION_PIPS}%;animation-delay:${i * 90}ms">` +
        `${decorIcon(SUITS[i % SUITS.length])}</span>`).join("")
    : "";

  banner.innerHTML =
    `${pips}<div class="banner-label">${t("res.gameOver")}</div>` +
    `<div class="banner-win">${escapeHtml(t(whoKey("res.noticeWin", state.winner), { who: state.winner }))}</div>` +
    `<div class="banner-label">${t("res.standings")}</div><ol class="standings">${rows}</ol>`;
}

function setResultsOpen(open) {
  state.showResults = open;
  render();
}

// The status line. Pass messages (msg(key, data) from i18n.js), not sentences: they are kept
// in state.status so that renderStatus() can write them again in another language.
// What a CPU drew is shown as a toast near the piles instead (see showToast).
function setStatus(...messages) {
  state.status = messages;
  messages.filter(isToast).forEach(showToast);
  renderStatus();
}

// ---- Toasts: a short note over the table, one at a time, that fades by itself ----
// Only for what another player (a CPU, or a person online) just drew, so it is never a log
// of moves (the owner decided against one): each toast replaces the last and is gone before
// the next turn. Your own draw is not a toast: it asks you to discard (the .you form).
const TOAST_KEYS = ["msg.drewDeck", "msg.tookDiscard"];
const isToast = m => TOAST_KEYS.includes(m.key) && m.vars.who !== 0;
let toastMessage = null;       // the message on show (re-translated on a language switch)
let toastTimer = null;
function showToast(m) {
  const box = document.getElementById("toasts");
  clearTimeout(toastTimer);
  toastMessage = m;
  box.innerHTML = "";
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = tm(m);
  box.appendChild(el);
  // stay through the CPU's pause before it discards, then fade out (style.css) and go
  toastTimer = setTimeout(() => {
    toastMessage = null;
    el.classList.add("leaving");
    toastTimer = setTimeout(() => el.remove(), 250);
  }, CPU_SPEEDS[state.cpuSpeed].discard + TOAST_EXTRA_MS);
}

// On a touch screen, a message with a ".touch" version (e.g. "msg.pickDiscard.touch", which
// says "tap" instead of "click") is shown in that version. "(pointer: coarse)" means the main
// pointer is a finger rather than a mouse. game.js does not need to know about any of this.
const COARSE_POINTER = window.matchMedia("(pointer: coarse)");
function statusText(m) {
  const touchKey = `${messageKey(m)}.touch`;
  return COARSE_POINTER.matches && touchKey in STRINGS.en ? t(touchKey, m.vars) : tm(m);
}

// The toast messages are left out of the status line, which says "CPU 1 is playing..."
// instead while the toast shows what that CPU drew. In closing mode (toggleClosing) the
// line explains how to close instead.
function renderStatus() {
  let shown = state.status.filter(m => !isToast(m));
  if (shown.length === 0 && state.status.length > 0) shown = [msg("msg.turn", { who: state.currentPlayer })];
  if (state.closing) shown = [msg("msg.closing")];
  document.getElementById("status").textContent = shown.map(statusText).join(" ");
}

// "Capitalised meld name" for a meld type ("run" or "group")
const meldName = type => t(`meld.${type}`);

// "You are out of the game. Re-enter with 64 points?", plus "(Re-entries left: 2.)"
// when the re-entry setting has a limit (the count includes the one being offered)
function reentryText() {
  const question = plural("reentry.text", state.entryScore);
  if (state.maxReentries === null) return question;
  return `${question} ${t("reentry.left", { n: state.maxReentries - state.reentries[0] })}`;
}

/* ---------------------------------------------------------
   EVENT WIRING: connect clicks to functions.
   addEventListener("click", fn) means: "when this element is clicked,
   call fn". The human's cards get their own click handlers inside
   renderHand(), because those elements are rebuilt on every render.
   --------------------------------------------------------- */
// New game (in the Settings sheet) also closes the sheet, so you see the new deal
document.getElementById("new-game").addEventListener("click", () => { setSettingsOpen(false); newGame(); });
document.getElementById("draw-pile").addEventListener("click", () => act("draw", "deck"));
document.getElementById("discard-pile").addEventListener("click", () => act("draw", "discard"));
document.getElementById("close-btn").addEventListener("click", toggleClosing);
document.getElementById("next-btn").addEventListener("click", () => act("next"));
document.getElementById("sort-btn").addEventListener("click", sortMyHand);
document.getElementById("hints-btn").addEventListener("click", () => {
  state.showHints = !state.showHints;
  render();
});

// The panels opened from the top bar: Help (also the H key), Settings and Scores. Each
// closes with its own button, Escape (see the keyboard handler), or a click on the dark
// background around it.
function setHelpOpen(open) {
  state.showHelp = open;
  render();
}
// Escape (and Android's back button in the phone app): close the panel on top.
// Returns false if none was open.
function closeTopPanel() {
  if (state.showHelp) setHelpOpen(false);             // the help opens on top of the others
  else if (state.showOnline) setOnlineOpen(false);
  else if (state.showSettings) setSettingsOpen(false);
  else if (state.showScores) setScoresOpen(false);
  else if (state.showResults) setResultsOpen(false);
  else return false;
  return true;
}
// Closing Settings with a "start a new game?" question still open counts as "no"
// (closeConfirm puts the dropdowns back to what the game is using)
function setSettingsOpen(open) {
  if (!open && pendingChange) closeConfirm(false);
  state.showSettings = open;
  render();
}
function setScoresOpen(open) {
  state.showScores = open;
  render();
}
// Wire one panel: its top-bar button toggles it, its close button and its background close it
function wirePanel(buttonId, closeId, overlayId, setOpen, isOpen) {
  document.getElementById(buttonId).addEventListener("click", () => setOpen(!isOpen()));
  document.getElementById(closeId).addEventListener("click", () => setOpen(false));
  document.getElementById(overlayId).addEventListener("click", (e) => {
    // e.target is the element actually clicked: the overlay itself only outside the panel
    if (e.target === e.currentTarget) setOpen(false);
  });
}
wirePanel("help-btn", "help-close", "help", setHelpOpen, () => state.showHelp);
wirePanel("settings-btn", "settings-close", "settings-sheet", setSettingsOpen, () => state.showSettings);
wirePanel("scores-btn", "scores-close", "scores", setScoresOpen, () => state.showScores);

// Language: setLanguage (i18n.js) remembers the choice and calls render()
document.getElementById("lang").addEventListener("change", (e) => setLanguage(e.target.value));

// Choosing a sort method also sorts straight away
document.getElementById("sort-mode").addEventListener("change", (e) => {
  state.sortMode = e.target.value;
  saveSettings();
  sortMyHand();
});

// CPU difficulty: takes effect from the next CPU move (no new game needed)
document.getElementById("cpu-mode").addEventListener("change", (e) => {
  state.cpuMode = e.target.value;
  state.cpuLevels = [...CPU_MODES[state.cpuMode]];
  saveSettings();
  render();                                   // refresh the seat labels
});

// CPU speed: also takes effect immediately
document.getElementById("cpu-speed").addEventListener("change", (e) => {
  state.cpuSpeed = e.target.value;
  saveSettings();
});

// The Sound button turns sound on or off (sound.js); a card snap confirms that it is on
document.getElementById("sound-btn").addEventListener("click", () => {
  setSoundOn(!soundOn);
  saveSettings();
  render();
  playSound("draw");
});
// Browsers allow sound only after the player has touched the page: wake the audio
// engine on every tap, click and key press (cheap once it is running).
// `capture: true` runs this before any other handler, so the sound of that very tap plays.
for (const type of ["pointerdown", "keydown"]) {
  document.addEventListener(type, unlockAudio, { capture: true });
}

// Changing the deck or the number of CPUs starts a new game. If a game is under way,
// ask first with a bar inside the page (the browser's pop-up dialogs are blocked in
// some places). `pendingChange` holds the function to run if the player says yes
// (functions are ordinary values in JS, so we can store one and call it later).
let pendingChange = null;
let pendingQuestion = null;     // function giving the question text for the bar that is open

// Put the dropdowns that start a new game back to what the game is actually using
function syncSettingDropdowns() {
  document.getElementById("sort-mode").value = state.sortMode;
  document.getElementById("cpu-mode").value = state.cpuMode;
  document.getElementById("cpu-speed").value = state.cpuSpeed;
  document.getElementById("deck-size").value = String(DECK_SIZE);
  document.getElementById("cpu-count").value = String(state.numPlayers - 1);
  document.getElementById("reshuffles").value = limitToOption(state.maxReshuffles);
  document.getElementById("round-limit").value = limitToOption(state.roundLimit);
  document.getElementById("reentries").value = limitToOption(state.maxReentries);
  document.getElementById("layoff").value = state.layoffMode;
}

// The limit dropdowns use "none" for "no limit", which is null in state
function limitToOption(limit) { return limit === null ? "none" : String(limit); }
function optionToLimit(value) { return value === "none" ? null : Number(value); }

/* ---------------------------------------------------------
   Remembering the settings between visits. They are stored in localStorage
   (the browser's small per-site key/value store) as one JSON object whose keys
   are the dropdown ids and whose values are dropdown values, e.g.
   {"cpu-count": "2", "reshuffles": "none"}. The language is stored separately
   by setLanguage() in i18n.js. localStorage can throw (private windows, blocked
   site data), so both functions use try/catch and the game works without it.
   --------------------------------------------------------- */
const SETTINGS_STORAGE_KEY = "chinchon-settings";   // localStorage key for the settings object

// Save what the game is actually using (state), not what the dropdowns show
// (plus "sound", from the Sound button in the top bar):
// a dropdown can be ahead of the game while its "start a new game?" bar is open
function saveSettings() {
  const settings = {
    "sort-mode":   state.sortMode,
    "cpu-count":   String(state.numPlayers - 1),
    "cpu-mode":    state.cpuMode,
    "cpu-speed":   state.cpuSpeed,
    "sound":       soundOn ? "on" : "off",
    "deck-size":   String(DECK_SIZE),
    "reshuffles":  limitToOption(state.maxReshuffles),
    "reentries":   limitToOption(state.maxReentries),
    "round-limit": limitToOption(state.roundLimit),
    "layoff":      state.layoffMode,
  };
  if (online.playing) {
    // In an online game `state` holds the room's rules, not yours: only remember the two
    // choices that are yours there (the sort method and sound), on top of what was saved
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)) || {}; } catch (err) { /* none */ }
    Object.assign(settings, saved, { "sort-mode": settings["sort-mode"], "sound": settings.sound });
  }
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch (err) { /* not remembered; fine */ }
}

// Put the saved settings into `state` (before the first game starts). A value is only
// used if its dropdown has that option, so an old or edited entry cannot break the game.
// Returns the number of CPUs to start with.
function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)) || {}; } catch (err) { /* none saved */ }
  // The saved value for dropdown `id` if it is one of its options, else the dropdown's current value.
  // (`[...select.options]` turns the HTML option list into a real array so .some() works.)
  const pick = id => {
    const select = document.getElementById(id);
    const ok = [...select.options].some(o => o.value === saved[id]);
    return ok ? saved[id] : select.value;
  };
  state.sortMode      = pick("sort-mode");
  state.cpuMode       = pick("cpu-mode");
  state.cpuLevels     = [...CPU_MODES[state.cpuMode]];
  state.cpuSpeed      = pick("cpu-speed");
  setSoundOn(saved.sound !== "off");          // a button, not a dropdown, so not through pick()
  setDeckSize(Number(pick("deck-size")));
  state.maxReshuffles = optionToLimit(pick("reshuffles"));
  state.maxReentries  = optionToLimit(pick("reentries"));
  state.roundLimit    = optionToLimit(pick("round-limit"));
  state.layoffMode    = pick("layoff");
  return Number(pick("cpu-count"));
}

/* ---------------------------------------------------------
   Remembering the game in progress. A phone may close the app at any moment
   while it is in the background, so the game is saved whenever the page is
   hidden and continued when it opens again (a reload continues it too; New game
   starts afresh). snapshotGame / restoreGame in game.js do the real work; this
   part only stores the result, as JSON, in localStorage.
   --------------------------------------------------------- */
const GAME_STORAGE_KEY = "chinchon-game";   // localStorage key for the saved game

function saveGame() {
  if (online.playing) return;     // an online game lives on the server; keep the game of this device as it was
  try { localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(snapshotGame())); } catch (err) { /* not saved; fine */ }
}

// Put the saved game into `state`. Returns false if there is none (or it is from an
// older version of the game, or damaged), and then `state` is unchanged.
function loadGame() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY)); } catch (err) { /* none saved */ }
  if (!restoreGame(saved)) return false;
  // The table is already as it should be: don't play the deal animation, the deal
  // sound or the score pop-ups again (see animateChanges and queueScorePops)
  animSeen = { deals: state.deals, drawLen: state.drawPile.length, discardLen: state.discardPile.length,
               handLen: state.hands.map(hand => hand.length),
               phase: state.phase, current: state.currentPlayer, gameOver: state.gameOver };
  // (saved in the middle of your lay-offs: the round is not scored yet, so its pop-ups are still to come)
  scorePops = { deal: state.layoff ? 0 : state.deals, points: null };
  return true;
}

// "visibilitychange" fires when the page is hidden (another app, the home screen, a
// locked phone) or shown again; "pagehide" when it is being left or closed. Those
// are the last moments a phone reliably gives a page, so that is when we save.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});
window.addEventListener("pagehide", saveGame);

function closeConfirm(accepted) {
  document.getElementById("deck-confirm").hidden = true;
  const change = pendingChange;
  pendingChange = null;
  pendingQuestion = null;
  if (accepted && change) { change(); saveSettings(); } else syncSettingDropdowns();
}

// `question` is a function returning the text, so the bar can be written again if the
// language is switched while it is open (see applyStaticText)
function askBeforeNewGame(question, change) {
  const inProgress = state.round > 1 || state.totals.some(t => t !== 0) ||
                     state.hands[0].length > CARDS_PER_HAND;
  if (!inProgress) { change(); saveSettings(); return; }
  pendingChange = change;
  pendingQuestion = question;
  document.getElementById("deck-confirm-text").textContent = question();
  document.getElementById("deck-confirm").hidden = false;
}

// Switching deck starts a new game; the dropdown and the 48-card tip's button both come here.
// syncSettingDropdowns: after the tip's button the Deck dropdown must show the new size too.
function chooseDeckSize(size) {
  askBeforeNewGame(() => t("confirm.deck", { n: size }),
                   () => { setDeckSize(size); newGame(); syncSettingDropdowns(); });
}
document.getElementById("deck-size").addEventListener("change", (e) => chooseDeckSize(Number(e.target.value)));
document.getElementById("deck-tip-btn").addEventListener("click", () => chooseDeckSize(48));
document.getElementById("cpu-count").addEventListener("change", (e) => {
  const cpus = Number(e.target.value);
  askBeforeNewGame(() => plural("confirm.cpus", cpus),
                   () => newGame(cpus));
});
// The rule limits also start a new game, so a game is never played under mixed rules
document.getElementById("reentries").addEventListener("change", (e) => {
  const limit = optionToLimit(e.target.value);
  askBeforeNewGame(() => t("confirm.rules"), () => { state.maxReentries = limit; newGame(); });
});
document.getElementById("reshuffles").addEventListener("change", (e) => {
  const limit = optionToLimit(e.target.value);
  askBeforeNewGame(() => t("confirm.rules"), () => { state.maxReshuffles = limit; newGame(); });
});
document.getElementById("round-limit").addEventListener("change", (e) => {
  const limit = optionToLimit(e.target.value);
  askBeforeNewGame(() => t("confirm.rules"), () => { state.roundLimit = limit; newGame(); });
});
document.getElementById("layoff").addEventListener("change", (e) => {
  const mode = e.target.value;
  askBeforeNewGame(() => t("confirm.rules"), () => { state.layoffMode = mode; newGame(); });
});
document.getElementById("deck-yes").addEventListener("click", () => closeConfirm(true));
document.getElementById("deck-no").addEventListener("click", () => closeConfirm(false));
document.getElementById("reenter-yes").addEventListener("click", () => act("reenter", true));
document.getElementById("reenter-no").addEventListener("click", () => act("reenter", false));

// Results panel buttons
document.getElementById("results-btn").addEventListener("click", () => setResultsOpen(true));
document.getElementById("res-hide").addEventListener("click", () => setResultsOpen(false));
document.getElementById("res-next").addEventListener("click", () => act("next"));
document.getElementById("res-layoff-done").addEventListener("click", () => act("layoffDone"));
document.getElementById("res-reenter").addEventListener("click", () => act("reenter", true));
document.getElementById("res-stayout").addEventListener("click", () => act("reenter", false));
document.getElementById("res-newgame").addEventListener("click", () => {
  if (online.playing) sendOnline({ type: "again" });   // online: a new game for the same room
  else newGame();
});

// Keyboard play (handy on a desktop). The keys call the same functions as the clicks:
//   1-8 discard (or, in closing mode, close with) that card, counted from the left
//   D draw pile, T take the top discard, C close (or cancel closing), S sort,
//   Enter next round, H help, Escape close the open panel or hide the results panel.
// While a panel (help, settings, scores) is open, only H and Escape work: no moves behind it.
// Keys are ignored while a dropdown has the focus or Ctrl/Cmd/Alt is held (browser shortcuts).
// On a focused button (the one you clicked last) Enter and Space press that button, as usual.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeTopPanel(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || dragFrom !== null) return;
  if (["SELECT", "INPUT"].includes(e.target.tagName)) return;

  const key = e.key.toLowerCase();
  if (e.target.tagName === "BUTTON" && (key === "enter" || key === " ")) return;
  if (key === "h") { setHelpOpen(!state.showHelp); e.preventDefault(); return; }
  if (state.showHelp || state.showSettings || state.showScores || state.showOnline) return;
  if (key >= "1" && key <= "9" && key.length === 1) {
    const index = Number(key) - 1;
    const el = document.querySelectorAll("#hand-0 .card")[index];
    if (!el || state.currentPlayer !== 0 || state.phase !== "discard") return;
    if (state.closing && !closeOptions(state.hands[0]).some(o => o.index === index)) return;
    discardFrom = el.getBoundingClientRect();        // so the card slides from where it was
    act(state.closing ? "close" : "discard", cardKey(state.hands[0][index]));
  } else if (key === "d") {
    act("draw", "deck");
  } else if (key === "t") {
    act("draw", "discard");
  } else if (key === "c") {
    toggleClosing();
  } else if (key === "s") {
    sortMyHand();
  } else if (key === "enter") {
    act("next");                                     // does nothing unless a round just ended
  } else {
    return;                                          // not one of our keys: let the browser have it
  }
  e.preventDefault();
});

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
const ROOM_SETTING_IDS = ["cpu-count", "cpu-mode", "cpu-speed", "deck-size", "deck-tip-btn",
                          "reshuffles", "reentries", "round-limit", "layoff", "new-game"];

function setOnlineOpen(open) {
  state.showOnline = open;
  if (open) online.error = online.code ? online.error : null;   // a fresh start shows no old problem
  render();
}

function renderOnline() {
  const inRoom = Boolean(online.code);
  const chip = document.getElementById("online-chip");
  chip.hidden = !inRoom;
  if (inRoom) chip.textContent = t("online.chip", { code: online.code });
  document.getElementById("online-open").hidden = !serverUrl();
  document.getElementById("conn-bar").hidden = online.connection !== "lost";
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
  document.getElementById("online-start").hidden = inRoom;
  document.getElementById("online-room").hidden = !inRoom;
  const busy = online.connection === "connecting";
  document.getElementById("online-create").disabled = busy;
  document.getElementById("online-join").disabled = busy;
  if (!inRoom) return;

  // In a room: its code, the players (names are what people typed, so textContent, never
  // innerHTML), the empty seats the CPUs will take, and what happens next
  const lobby = online.lobby;
  document.getElementById("online-code-line").textContent = t("online.codeLine", { code: online.code });
  const list = document.getElementById("online-people");
  list.innerHTML = "";
  if (lobby) {
    lobby.people.forEach((person, i) => {
      const tags = [i === lobby.you && t("online.you"), i === lobby.host && t("online.host"),
                    !person.connected && t("online.offline")].filter(Boolean);
      const li = document.createElement("li");
      li.textContent = person.name + (tags.length ? ` (${tags.join(", ")})` : "");
      li.classList.toggle("offline", !person.connected);
      list.appendChild(li);
    });
    for (let i = lobby.people.length; i < lobby.players; i++) {
      const li = document.createElement("li");
      li.className = "cpu";
      li.textContent = t("online.cpuSeat");
      list.appendChild(li);
    }
  }
  const isHost = lobby && lobby.you === lobby.host;
  document.getElementById("online-wait").textContent =
    !lobby || online.connection !== "open" ? t("online.connecting")
    : lobby.started ? t("online.inGame")
    : isHost        ? t("online.youStart")
    :                 t("online.waitHost", { name: lobby.people[lobby.host].name });
  document.getElementById("online-startgame").hidden = !(isHost && !lobby.started);
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

// Settings opens the online sheet (and closes itself); so does the room chip in the top bar
document.getElementById("online-open").addEventListener("click", () => {
  state.showSettings = false;
  setOnlineOpen(true);
});
wirePanel("online-chip", "online-close", "online-sheet", setOnlineOpen, () => state.showOnline);

document.getElementById("online-create").addEventListener("click", () => {
  const name = onlineName();
  if (!name) return;
  // The room's game uses your settings (the server checks each value)
  createRoom(name, {
    players: Number(document.getElementById("online-players").value),
    deckSize: DECK_SIZE, cpuMode: state.cpuMode, cpuSpeed: state.cpuSpeed,
    maxReshuffles: state.maxReshuffles, maxReentries: state.maxReentries,
    roundLimit: state.roundLimit, layoffMode: state.layoffMode,
  });
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

/* ---------------------------------------------------------
   START: run once when the page loads
   --------------------------------------------------------- */
if (typeof runSelfTests === "function") runSelfTests();   // results in the console (F12)
const savedCpuCount = loadSettings();   // last visit's settings (or the defaults written in index.html)
if (loadGame()) resumeTurn();         // carry on with the game left unfinished last time
else newGame(savedCpuCount);          // or start a new one with those settings
syncSettingDropdowns();      // after newGame, which sets the number of players

// Online: your nickname from last time; back into the room you were in (a reload, or the
// app was closed); or, opened from a shared link (?room=K7QF), the join form with its code
try { document.getElementById("online-name").value = localStorage.getItem(NAME_STORAGE_KEY) || ""; } catch (err) { /* fine */ }
resumeRoom();
const linkedRoom = new URLSearchParams(location.search).get("room");
if (linkedRoom && !online.code && serverUrl()) {
  document.getElementById("online-code").value = linkedRoom.toUpperCase().slice(0, 4);
  setOnlineOpen(true);
}

// The App Store / Google Play app (app/ in this repo) runs these same files inside a
// native shell called Capacitor, which defines `window.Capacitor` before any script
// here runs. In the browser it does not exist. (`window.Capacitor` rather than plain
// `Capacitor`: reading a global that was never defined is an error, a missing property is not.)
const NATIVE_APP = Boolean(window.Capacitor);

// Offline play once the game is installed on a phone: register sw.js, the "service
// worker" (a script the browser keeps running in the background that answers the
// page's file requests, from a saved copy when there is no network). Browsers allow
// one only on https:// or localhost, so this is skipped when the game is opened
// from disk (file://), and in the store app, whose files are on the phone already.
// Inside some embeds it can still fail; that is fine, the game just has no offline
// copy. (.catch on a promise = what to do if it fails.)
if ("serviceWorker" in navigator && !NATIVE_APP &&
    (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* no offline copy; fine */ });
}

// The store app talks to the native "App" plugin (app/package.json) through the bridge
// functions Capacitor puts on window.Capacitor, so the game needs no Capacitor JavaScript
// library of its own. PluginHeaders lists the native plugins.
if (NATIVE_APP && (window.Capacitor.PluginHeaders || []).some(plugin => plugin.name === "App")) {
  // "pause": the app went to the background. Android's web view does not always report
  // that to the page (no visibilitychange), so save here too.
  window.Capacitor.addListener("App", "pause", saveGame);
  // Android's back button: close the open panel, as Escape does; with none open, save
  // and leave the app (the default would be to go back a page, and the game has only one).
  if (window.Capacitor.getPlatform() === "android") {
    window.Capacitor.addListener("App", "backButton", () => {
      if (!closeTopPanel()) { saveGame(); window.Capacitor.nativeCallback("App", "exitApp", {}); }
    });
  }
}
