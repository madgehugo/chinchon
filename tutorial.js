/* =========================================================
   tutorial.js: a guided first round for new players
   ---------------------------------------------------------
   The tutorial is a real round on the real table, against one CPU, with a
   fixed deal (TUTORIAL_DEAL) instead of a shuffled one. A coach box under the
   table (#coach) says what to do at each step (TUTORIAL_STEPS), the card or
   pile to use glows, and every other move is refused: act() in net.js and
   toggleClosing() in ui.js ask tutorialAllows() first.

   Like closing mode, the tutorial belongs to this screen only, not to the game:
   its progress is the `tutorial` object below, never part of `state`. So it is
   not saved (a reload brings back your own game), the online server never sees
   it, and the Node tools do not load this file. Your own game is saved when the
   tutorial starts and comes back when it ends, as when you go online.

   Only ui.js calls in here, and only at run time (it is loaded after this file).
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   The deal. Card keys as cardKey() in rules.js writes them: the suit's first
   letter and the value ("b3" = 3 of bastos, "e12" = 12 of espadas).
   You hold a run (3-4-5 of bastos) and two 7s; the 7 on the discard pile
   makes them a group. The CPU's hand has no meld and nothing it could lay off
   on your melds at the end, so the results stay simple.
   --------------------------------------------------------- */
const TUTORIAL_DEAL = {
  hands: [
    ["b3", "b4", "b5", "o7", "c7", "e12", "c2"],      // you (seat 0), in the order you see them
    ["o3", "o5", "c10", "c12", "e1", "e4", "b11"],    // the CPU (seat 1)
  ],
  discard: "e7",                                      // the first card on the discard pile
  draws: ["o11", "o1"],                               // the draw pile's top cards: the CPU's draw, then yours
  cpuDiscards: ["o11"],                               // what the CPU throws away, turn by turn
};
const TUTORIAL_STORAGE_KEY = "chinchon-tutorial";     // localStorage: set once the first-visit offer was answered

// The deck for startRound (game.js), which deals with pop() from the END of the array:
// so the cards to come out first go last. The rest of the deck lies below, in createDeck order.
function buildTutorialDeck() {
  const [you, cpu] = TUTORIAL_DEAL.hands;
  const order = [];                                   // the cards in the order they come out
  for (let n = 0; n < CARDS_PER_HAND; n++) order.push(you[n], cpu[n]);   // dealt one at a time, in turn
  order.push(TUTORIAL_DEAL.discard, ...TUTORIAL_DEAL.draws);
  const rest = createDeck().filter(card => !order.includes(cardKey(card)));
  const byKey = new Map(createDeck().map(card => [cardKey(card), card]));
  return [...rest, ...order.reverse().map(key => byKey.get(key))];
}

/* ---------------------------------------------------------
   The scripted CPU: an extra entry in STRATEGIES (ai.js), so game.js plays it
   like any other CPU. It always draws from the pile, never closes, and throws
   away the cards in cpuDiscards (after those, it plays like the "simple" CPU).
   --------------------------------------------------------- */
STRATEGIES.tutorial = {
  chooseSource() { return "deck"; },
  chooseClose() { return null; },
  chooseDiscard(p) {
    const key = TUTORIAL_DEAL.cpuDiscards.find(k => state.hands[p].some(card => cardKey(card) === k));
    const index = state.hands[p].findIndex(card => cardKey(card) === key);
    return index >= 0 ? index : STRATEGIES.greedy.chooseDiscard(p);
  },
};

/* ---------------------------------------------------------
   The steps. Each one has:
     text:   the i18n key of what the coach says (a ".touch" version, if there
             is one, says "tap" instead of "click"; see statusText in ui.js)
     allow:  the one move this step waits for, as (action name, args) => true/false.
             "closing" is the Close button (closing mode is not an action).
             Missing: no move is allowed, and the coach shows a Next button.
     target: what glows: card keys in your hand, and/or ids of the piles or buttons
     done:   () => true once the step is over (it reads `state`); missing: Next ends it
   Rearranging your hand (the "order" action: dragging, Sort) is always allowed.
   --------------------------------------------------------- */
const youHold = key => state.hands[0].some(card => cardKey(card) === key);

const TUTORIAL_STEPS = [
  { text: "tut.welcome" },
  { text: "tut.hand", target: { cards: ["b3", "b4", "b5"] } },
  { text: "tut.take",
    allow: (name, args) => name === "draw" && args[0] === "discard",
    target: { ids: ["discard-pile"] },
    done: () => youHold("e7") },
  { text: "tut.discard",
    allow: (name, args) => name === "discard" && args[0] === "e12",
    target: { cards: ["e12"] },
    done: () => !youHold("e12") },
  { text: "tut.cpu",
    done: () => state.currentPlayer === 0 && state.phase === "draw" },
  { text: "tut.draw",
    allow: (name, args) => name === "draw" && args[0] === "deck",
    target: { ids: ["draw-pile"] },
    done: () => youHold("o1") },
  { text: "tut.closeBtn",
    allow: name => name === "closing",
    target: { ids: ["close-btn"] },
    done: () => state.closing },
  { text: "tut.closeWith",
    allow: (name, args) => name === "close" && args[0] === "c2",
    target: { cards: ["c2"] },
    done: () => state.phase === "roundOver" },
  { text: "tut.results", last: true },
];

/* ---------------------------------------------------------
   The controller
   --------------------------------------------------------- */
const tutorial = {
  active: false,      // true while the tutorial is on the table
  step: 0,            // index into TUTORIAL_STEPS
  hadGame: false,     // was a game of yours under way when it started? (then "Back to my game")
  hintsBefore: false, // your Hints setting, put back at the end (the tutorial turns Hints on)
};

const tutorialStep = () => TUTORIAL_STEPS[tutorial.step];

// Start the tutorial (from the Help panel or the first-visit offer)
function startTutorial() {
  if (online.code) return;                  // never in an online room (the button is hidden there)
  answerTutorialOffer();
  if (!tutorial.active) {                   // (started again from Help: your game is saved already)
    tutorial.hadGame = gameInProgress();    // (ui.js)
    tutorial.hintsBefore = state.showHints;
    saveGame();                             // your own game, to come back to (ui.js)
    tutorial.active = true;                 // from now on saveGame() saves nothing
  }
  tutorial.step = 0;
  state.showHelp = state.showSettings = state.showScores = state.showOnline = false;
  // The tutorial's table. These fields come back with your game (or your settings) at the end.
  setDeckSize(40);
  state.cpuLevels = [null, "tutorial", null, null];
  state.layoffMode = "auto";
  state.maxReshuffles = 2;
  state.roundLimit = null;
  state.showHints = true;                   // the coloured bars under your melds help to explain them
  newGame(1, null, buildTutorialDeck());
}

// Leave the tutorial: back to the game you had, or a new one with your settings
function endTutorial() {
  if (!tutorial.active) return;
  tutorial.active = false;
  clearTimeout(state.timer);
  if (!(tutorial.hadGame && loadGame())) newGame(loadSettings());   // (ui.js)
  else resumeTurn();
  state.showHints = tutorial.hintsBefore;
  render();
}

// Is this move one the tutorial allows right now? (Always yes outside the tutorial.)
function tutorialAllows(name, args = []) {
  if (!tutorial.active || name === "order") return true;
  const step = tutorialStep();
  return Boolean(step.allow && step.allow(name, args));
}

// A refused move: shake the coach box, so you look at what it asks for.
// (Removing the class and reading offsetWidth makes the browser restart the animation.)
function tutorialNudge() {
  const box = document.getElementById("coach");
  box.classList.remove("nudge");
  void box.offsetWidth;
  box.classList.add("nudge");
}

// Move on past every step that is already done. render() calls this first, so the
// cards and buttons are drawn with the right step's highlights. It changes only
// `tutorial`, never `state`.
function advanceTutorial() {
  if (!tutorial.active) return;
  while (tutorialStep().done && tutorialStep().done()) tutorial.step++;
}

// The Next button of a step that only explains something
function tutorialNext() {
  if (tutorialStep().done || tutorialStep().last) return;
  tutorial.step++;
  render();
}

// Is this card of your hand the one the current step points at? (renderHand in ui.js)
function isTutorialTarget(card) {
  const target = tutorial.active && tutorialStep().target;
  return Boolean(target && target.cards && target.cards.includes(cardKey(card)));
}

// Draw the coach box, the glow on the piles and buttons, and the Help panel's button.
// render() calls this near the end, after the buttons have been set for the game.
function renderTutorial() {
  const box = document.getElementById("coach");
  document.getElementById("tutorial-start").hidden = Boolean(online.code);
  document.getElementById("tutorial-offer").hidden = !tutorialOffered || tutorial.active;
  box.hidden = !tutorial.active;
  document.getElementById("status").hidden = tutorial.active;          // the coach takes its place
  // The last step floats at the bottom of the screen, over the results (style.css)
  const floating = tutorial.active && Boolean(tutorialStep().last);
  box.classList.toggle("floating", floating);
  document.body.classList.toggle("coach-floating", floating);
  const ids = tutorial.active && tutorialStep().target ? tutorialStep().target.ids || [] : [];
  for (const id of ["draw-pile", "discard-pile", "close-btn"]) {
    const el = document.getElementById(id);
    el.classList.toggle("coach-target", ids.includes(id));
    // Only the coach's pile glows: the usual "you may draw here" pulse would point at both
    if (tutorial.active) el.classList.remove("can-pick");
  }
  if (!tutorial.active) return;

  const step = tutorialStep();
  document.getElementById("coach-step").textContent =
    t("tut.step", { n: tutorial.step + 1, total: TUTORIAL_STEPS.length });
  // The last step names the round's scores: {you} and {cpu}
  const vars = { you: state.roundPoints[0], cpu: state.roundPoints[1] };
  document.getElementById("coach-text").textContent = statusText(msg(step.text, vars));   // (ui.js)
  // Next for the steps that only explain; the way out on the last one
  document.getElementById("coach-next").hidden = Boolean(step.done || step.last);
  const end = document.getElementById("coach-end");
  end.hidden = !step.last;
  end.textContent = t(tutorial.hadGame ? "tut.backToGame" : "tut.playGame");
  document.getElementById("coach-skip").hidden = Boolean(step.last);
  // How tall the box is now, so style.css can leave that much room under the panels
  document.body.style.setProperty("--coach-h", `${box.offsetHeight}px`);
  // The round is over but this is not a game: no Next round
  if (state.phase === "roundOver") {
    document.getElementById("next-btn").hidden = true;
    document.getElementById("res-next").hidden = true;
  }
}

/* ---------------------------------------------------------
   The first-visit offer: a bar over the table, "New to Chinchón?", shown once
   to someone with no saved settings and no saved game (see the startup code in
   ui.js). Either answer, or starting the tutorial from Help, puts it away for good.
   --------------------------------------------------------- */
let tutorialOffered = false;      // is the offer bar showing?

function offerTutorial() {
  let answered = true, firstVisit = false;
  try {
    answered = localStorage.getItem(TUTORIAL_STORAGE_KEY) !== null;
    firstVisit = localStorage.getItem(SETTINGS_STORAGE_KEY) === null;   // (ui.js)
  } catch (err) { /* no storage: don't offer it on every visit */ }
  tutorialOffered = firstVisit && !answered;
  render();
}

function answerTutorialOffer() {
  tutorialOffered = false;
  try { localStorage.setItem(TUTORIAL_STORAGE_KEY, "answered"); } catch (err) { /* fine */ }
}

document.getElementById("tutorial-yes").addEventListener("click", startTutorial);
document.getElementById("tutorial-no").addEventListener("click", () => { answerTutorialOffer(); render(); });
document.getElementById("tutorial-start").addEventListener("click", startTutorial);
document.getElementById("coach-next").addEventListener("click", tutorialNext);
document.getElementById("coach-skip").addEventListener("click", endTutorial);
document.getElementById("coach-end").addEventListener("click", endTutorial);
