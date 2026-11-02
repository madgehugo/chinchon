"use strict";

/* =========================================================
   tools/bench.js: which CPU setting plays better?
   ---------------------------------------------------------
   Usage:  node tools/bench.js <rounds> <A> <B> [deck]
     <A> and <B> are CPU levels (greedy or smart), optionally with overrides
     for the SMART settings in ai.js, for example
         smart
         "smart:closeBonus=5,perfectBonus=1"
     Four CPUs play: A B A B. Seats AND the starting player rotate, so each
     side gets every position equally (use a multiple of 16 rounds). Without
     that rotation the side that always starts has an advantage; an earlier
     benchmark was fooled by exactly that.
   Lower average points per round is better. "se" is the standard error of
   each average; a difference smaller than about 2 x se is just noise. Run
   `smart smart` as a control to see how big the noise is.

   Example:  node tools/bench.js 3200 smart "smart:takeMargin=-1"
   ========================================================= */
const { loadGame } = require("./harness");

const [rounds = "1600", specA = "smart", specB = "greedy", deck = "40"] = process.argv.slice(2);
const g = loadGame();
g.setDeckSize(Number(deck));

// Turn "smart:closeBonus=5" into a registered strategy that applies those
// SMART settings while it decides, then puts the defaults back.
function register(spec) {
  const [base, settings] = spec.split(":");
  if (!settings) return base;                               // plain level name
  const overrides = {};
  for (const pair of settings.split(",")) {
    const [key, value] = pair.split("=");
    if (!(key in g.SMART)) { console.error(`Unknown setting "${key}". Known: ${Object.keys(g.SMART).join(", ")}`); process.exit(1); }
    overrides[key] = Number(value);
  }
  const inner = g.STRATEGIES[base];
  const wrap = (method) => (...args) => {
    const saved = { ...g.SMART };
    Object.assign(g.SMART, overrides);
    try { return inner[method](...args); } finally { Object.assign(g.SMART, saved); }
  };
  g.STRATEGIES[spec] = { chooseSource: wrap("chooseSource"), chooseClose: wrap("chooseClose"), chooseDiscard: wrap("chooseDiscard") };
  return spec;
}
const labels = [register(specA), register(specB)];

// Play one round with every seat run by its strategy (including seat 0).
function playRound(levels, start) {
  const s = g.state;
  s.inGame = [true, true, true, true];
  s.totals = [0, 0, 0, 0];
  s.gameOver = false;
  s.awaitingReentry = false;
  s.startPlayer = start;
  g.startRound();
  g.clearQueue();

  for (let guard = 0; s.phase !== "roundOver" && guard < 3000; guard++) {
    const p = s.currentPlayer;
    const strategy = g.STRATEGIES[levels[p]];
    if (!g.drawCard(p, strategy.chooseSource(p))) break;    // stalemate ended the round
    const closeIndex = strategy.chooseClose(p);
    if (closeIndex !== null) { g.closeRound(p, closeIndex); break; }
    g.discardCard(p, strategy.chooseDiscard(p));
    g.endTurn();
    g.clearQueue();
  }
  return s.roundResult;
}

const CHINCHON_SCORE = -25;   // how a Chinchón counts in the averages
const stats = {};
for (const label of labels) stats[label] = { n: 0, sum: 0, sumSq: 0, wins: 0, closes: 0 };
let stalemates = 0;

const started = Date.now();
for (let r = 0; r < Number(rounds); r++) {
  const rotation = r % 4;                                   // who sits where
  const start = Math.floor(r / 4) % 4;                      // who starts (independent of seating)
  const seat = [0, 1, 2, 3].map(s => labels[(s + rotation) % 2]);   // A B A B, shifted
  const result = playRound(seat, start);
  if (!result) continue;
  if (result.closer === null) stalemates++;

  const scores = result.points.map((pts, p) =>
    (result.chinchon && p === result.closer) ? CHINCHON_SCORE : pts);
  const best = Math.min(...scores);
  scores.forEach((score, p) => {
    const st = stats[seat[p]];
    st.n++; st.sum += score; st.sumSq += score * score;
    if (score === best) st.wins++;
    if (result.closer === p) st.closes++;
  });
}

console.log(`${rounds} rounds, ${deck}-card deck, ${((Date.now() - started) / 1000).toFixed(0)}s, ${stalemates} stalemates`);
const summary = labels.map(label => {
  const st = stats[label];
  const mean = st.sum / st.n;
  const se = Math.sqrt((st.sumSq / st.n - mean * mean) / st.n);
  console.log(`  ${label.padEnd(36)} avg points ${mean.toFixed(2)} (se ${se.toFixed(2)})` +
              `   rounds won ${(100 * st.wins / st.n).toFixed(1)}%   closed ${(100 * st.closes / st.n).toFixed(1)}%`);
  return { mean, se };
});
const diff = summary[0].mean - summary[1].mean;
const diffSe = Math.sqrt(summary[0].se ** 2 + summary[1].se ** 2);
console.log(`  difference (A - B): ${diff.toFixed(2)} points, se ${diffSe.toFixed(2)}` +
            `  -> ${Math.abs(diff) > 2 * diffSe ? (diff < 0 ? "A is better" : "B is better") : "no clear difference"}`);
