"use strict";

/* =========================================================
   tools/harness.js: run the game engine in Node (no browser)
   ---------------------------------------------------------
   Loads the game's own files (rules.js, i18n.js, ai.js, game.js, tests.js) into a
   sandbox and replaces the page with do-nothing stubs. Timers are fake:
   setTimeout just queues the callback and drain() runs the queue, so a whole
   game (CPU turns included) plays out instantly.
   Also holds what bench.js and gamebench.js share: strategy specs, the turn
   loop, command-line parsing and splitting the work over processes.
   Used by bench.js, gamebench.js and stress.js. ui.js is NOT loaded.
   ========================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { fork } = require("child_process");          // to start worker processes (for --jobs)

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
  state, STRATEGIES, FINISH, SMART, CPU_MODES, SCORE_LIMIT,
  setRandom, setDecisionRandom, makeSeededRandom, setDeckSize,
  newGame, startRound, nextRound, humanDraw, humanDiscard, humanClose, humanReenter,
  drawCard, discardCard, endTurn, closeRound, closeOptions, moveCard, sortHand,
  cpuWantsReentry, snapshotGame, restoreGame, resumeTurn,
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

// Turn a strategy spec such as "smart:takeMargin=-1" into a registered strategy that
// applies those settings (from SMART or FINISH in ai.js) while it decides, then
// puts the defaults back. A plain name ("hard") is returned as it is. Returns the name
// to look up in g.STRATEGIES.
function registerSpec(g, spec) {
  const [base, settings] = spec.split(":");
  if (!(base in g.STRATEGIES)) { console.error(`Unknown strategy "${base}". Known: ${Object.keys(g.STRATEGIES).join(", ")}`); process.exit(1); }
  if (!settings) return base;                               // plain level name
  const targets = [g.SMART, g.FINISH];                      // settings objects an override may name
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

// Play the current round to the end, every seat (seat 0 included) run by the strategy
// named in `seat`, as cpuTurn() does in the game. The benchmarks drive the turns
// themselves, so the CPU timer that endTurn() queues is dropped each time.
function playTurns(g, seat) {
  const s = g.state;
  for (let guard = 0; s.phase !== "roundOver" && guard < 3000; guard++) {
    const p = s.currentPlayer;
    const strategy = g.STRATEGIES[seat[p]];
    if (!g.drawCard(p, strategy.chooseSource(p))) return;   // stalemate ended the round
    const closeIndex = strategy.chooseClose(p);
    if (closeIndex !== null) { g.closeRound(p, closeIndex); return; }
    g.discardCard(p, strategy.chooseDiscard(p));
    g.endTurn();
    g.clearQueue();
  }
}

// Split the command line into positional arguments and "--name value" options.
// `flags` lists the options that take no value (such as --control).
// Returns { positional, has(name), option(name) }; option() is undefined when absent.
function parseArgs(argv, flags = ["--control"]) {
  const positional = [], options = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) positional.push(a);
    else if (flags.includes(a)) options[a] = true;
    else options[a] = argv[++i];                            // the value is the next argument
  }
  return { positional, has: name => name in options, option: name => options[name] };
}

// "none" means no limit (null); absent stays undefined; anything else is a number
const parseLimit = value => value === undefined ? undefined : value === "none" ? null : Number(value);

// Run `runShard([k, n])` over `jobs` processes and pass the list of their results to
// `report(parts, seconds)`. Shard k of n handles items k, k+n, k+2n, ... With one job
// it simply runs in this process. Otherwise fork() starts the calling script again as
// a child process with the shard in an environment variable; each child runs its
// share and sends the result back with process.send(), and every "message" event in
// the parent receives one child's result. (Disconnecting afterwards closes the channel
// to the parent, which lets the child exit.)
function runSharded(jobs, runShard, report) {
  const started = Date.now();
  const seconds = () => (Date.now() - started) / 1000;
  const script = require.main.filename;                     // the tool that called us
  if (process.env.HARNESS_SHARD) {
    process.send(runShard(process.env.HARNESS_SHARD.split("/").map(Number)), () => process.disconnect());
  } else if (jobs > 1) {
    const parts = [];
    for (let k = 0; k < jobs; k++) {
      const child = fork(script, process.argv.slice(2), { env: { ...process.env, HARNESS_SHARD: `${k}/${jobs}` } });
      child.on("message", part => {
        parts.push(part);
        if (parts.length === jobs) report(parts, seconds());
      });
    }
  } else {
    report([runShard([0, 1])], seconds());
  }
}

module.exports = { loadGame, registerSpec, playTurns, parseArgs, parseLimit, runSharded };
