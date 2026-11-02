"use strict";

/* =========================================================
   tools/harness.js: run the game engine in Node (no browser)
   ---------------------------------------------------------
   Loads the game's own files (rules.js, ai.js, game.js, tests.js) into a
   sandbox and replaces the page with do-nothing stubs. Timers are fake:
   setTimeout just queues the callback and drain() runs the queue, so a whole
   game (CPU turns included) plays out instantly.
   Used by bench.js and stress.js. ui.js is NOT loaded.
   ========================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT  = path.join(__dirname, "..");
const FILES = ["rules.js", "ai.js", "game.js", "tests.js"];   // same order as index.html

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
function setStatus() {}
globalThis.__game = {
  state, STRATEGIES, MAX_PLAYERS, SMART, CPU_MODES, SCORE_LIMIT,
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

module.exports = { loadGame };
