"use strict";

/* =========================================================
   tools/harness.js: run the game engine in Node (no browser)
   ---------------------------------------------------------
   Loads the game's own files (rules.js, i18n.js, ai.js, game.js, tests.js) into a
   sandbox and replaces the page with do-nothing stubs. Timers are fake:
   setTimeout just queues the callback and drain() runs the queue, so a whole
   game (CPU turns included) plays out instantly.
   Used by bench.js and stress.js. ui.js is NOT loaded.
   ========================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT  = path.join(__dirname, "..");
const FILES = ["rules.js", "i18n.js", "ai.js", "game.js", "tests.js"];   // same order as index.html

function loadGame() {
  const queue = [];                                  // pending fake timers
  const sandbox = {
    console,
    setTimeout: (fn) => { queue.push(fn); return queue.length; },
    clearTimeout: () => { queue.length = 0; },
  };

  // The game's files, then stubs for the two functions game.js expects from
  // ui.js, then an object exposing what the tools need (top-level `const`s are
  // not visible from outside the sandbox otherwise).
  const source = FILES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n") + `
function render() {}
function setStatus(...messages) { state.status = messages; }
globalThis.__game = {
  state, STRATEGIES, AWARE, RISK, MAX_PLAYERS, SMART, CPU_MODES, SCORE_LIMIT, CPU_REENTRY_MAX,
  setRandom, setDecisionRandom, makeSeededRandom,
  setDeckSize, getDeckSize: () => DECK_SIZE,
  newGame, startRound, nextRound, humanDraw, humanDiscard, humanClose, humanReenter,
  drawCard, discardCard, endTurn, closeRound, closeOptions, findBestClose, moveCard, sortHand,
  runSelfTests,
};`;
  vm.runInNewContext(source, sandbox, { filename: "game-bundle.js" });

  const g = sandbox.__game;
  g.clearQueue = () => { queue.length = 0; };
  // Run queued timers (CPU turns) until there are none left. Returns false if
  // it hit the safety limit, which would mean a turn loop that never ends.
  g.drain = (max = 20000) => {
    let n = 0;
    while (queue.length && n < max) { queue.shift()(); n++; }
    return n < max;
  };
  return g;
}

// Turn a strategy spec such as "smart:closeBonus=5" into a registered strategy that
// applies those settings (from SMART, AWARE or RISK in ai.js) while it decides, then
// puts the defaults back. A plain name ("hard") is returned as it is. Returns the name
// to look up in g.STRATEGIES. Used by bench.js and gamebench.js.
function registerSpec(g, spec) {
  const [base, settings] = spec.split(":");
  if (!settings) return base;                               // plain level name
  const targets = [g.SMART, g.AWARE, g.RISK];               // settings objects an override may name
  const overrides = [];                                     // [object, key, value]
  for (const pair of settings.split(",")) {
    const [key, value] = pair.split("=");
    const target = targets.find(t => key in t);
    if (!target) { console.error(`Unknown setting "${key}". Known: ${targets.flatMap(Object.keys).join(", ")}`); process.exit(1); }
    overrides.push([target, key, Number(value)]);
  }
  const inner = g.STRATEGIES[base];
  const wrap = (method) => (...args) => {
    const saved = overrides.map(([t, k]) => t[k]);
    overrides.forEach(([t, k, v]) => { t[k] = v; });
    try { return inner[method](...args); } finally { overrides.forEach(([t, k], i) => { t[k] = saved[i]; }); }
  };
  g.STRATEGIES[spec] = { chooseSource: wrap("chooseSource"), chooseClose: wrap("chooseClose"), chooseDiscard: wrap("chooseDiscard") };
  return spec;
}

module.exports = { loadGame, registerSpec };
