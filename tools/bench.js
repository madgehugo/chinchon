"use strict";

/* =========================================================
   tools/bench.js: which CPU setting plays better?
   ---------------------------------------------------------
   Usage:  node tools/bench.js <rounds> <A> <B> [deck]
     <A> and <B> are CPU levels (easy, medium, hard, greedy or smart), optionally with overrides
     for the SMART or AWARE settings in ai.js, for example
         smart
         "smart:closeBonus=5,perfectBonus=1"
     Four CPUs play: A B A B. Seats AND the starting player rotate, so each
     side gets every position equally (use a multiple of 16 rounds). Without
     that rotation the side that always starts has an advantage; an earlier
     benchmark was fooled by exactly that.
     DUPLICATE DEALING: every deal is played twice, with A and B in swapped
     seats, from the same seeded shuffle. Both sides therefore get identical
     cards, and luck of the deal cancels out of the A - B difference. <rounds>
     counts plays, so 3200 means 1600 deals. The seed is fixed, so a run is
     repeatable (as long as neither strategy uses Math.random, as easy and
     medium do for their mistakes).
   Lower average points per round is better. "se" is the standard error of
   each average; a difference smaller than about 2 x se is just noise. Run
   `smart smart` as a control to see how big the noise is.

   NOISE CONTROL: add --control and the two plays of each deal use DIFFERENT, independent
   deals instead of the same one (no pairing). `smart smart --control` then shows how big
   the luck of the cards is without duplicate dealing; the difference should be about 0,
   within a couple of standard errors. (With duplicate dealing, `smart smart` is exactly 0.)

   Example:  node tools/bench.js 3200 smart "smart:takeMargin=-1"
   ========================================================= */
const { loadGame, registerSpec } = require("./harness");

const CONTROL = process.argv.includes("--control");         // see NOISE CONTROL above
const [rounds = "1600", specA = "smart", specB = "greedy", deck = "40"] =
  process.argv.slice(2).filter(arg => arg !== "--control");
const g = loadGame();
g.setDeckSize(Number(deck));

// "smart:closeBonus=5" style specs become registered strategies (see registerSpec in harness.js)
const labels = [registerSpec(g, specA), registerSpec(g, specB)];

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
const SEED = 12345;           // base seed: deal d is shuffled with SEED + d
const stats = {};
for (const label of labels) stats[label] = { n: 0, sum: 0, sumSq: 0, wins: 0, closes: 0 };
let stalemates = 0;

// Play one deal (same shuffle every time for a given `deal`) with the given seating and
// starter. Adds to `stats` and returns A's average minus B's average points in this play.
function playDeal(deal, rotation, start, shuffleSeed = deal) {
  // Two separate seeded streams: one for shuffles (and reshuffles), one for the CPUs'
  // mistake rolls. A different decision in one play can then never change a later shuffle.
  g.setRandom(g.makeSeededRandom(SEED + shuffleSeed));
  g.setDecisionRandom(g.makeSeededRandom(SEED + 1e6 + shuffleSeed));
  const seat = [0, 1, 2, 3].map(s => labels[(s + rotation) % 2]);   // A B A B, shifted
  const result = playRound(seat, start);
  if (!result) return null;
  if (result.closer === null) stalemates++;

  const scores = result.points.map((pts, p) =>
    (result.chinchon && p === result.closer) ? CHINCHON_SCORE : pts);
  const best = Math.min(...scores);
  const sumOf = [0, 0];                                     // points of A's two seats, of B's two seats
  scores.forEach((score, p) => {
    const st = stats[seat[p]];
    st.n++; st.sum += score; st.sumSq += score * score;
    if (score === best) st.wins++;
    if (result.closer === p) st.closes++;
    sumOf[(p + rotation) % 2] += score;      // side 0 = A, 1 = B (by seat, since A and B may be the same spec)
  });
  return (sumOf[0] - sumOf[1]) / 2;
}

const deals = Math.floor(Number(rounds) / 2);
const dealDiffs = [];                                       // A - B for each deal, averaged over its two plays
const started = Date.now();
for (let d = 0; d < deals; d++) {
  const rotation = d % 4;                                   // who sits where (swapped for the second play)
  const start = Math.floor(d / 4) % 4;                      // who starts (independent of seating)
  const first = playDeal(d, rotation, start);
  // A and B swap seats with identical cards (in --control mode: a different, independent deal)
  const second = playDeal(d, rotation + 1, start, CONTROL ? d + deals : d);
  if (first !== null && second !== null) dealDiffs.push((first + second) / 2);
}
g.setRandom(Math.random);
g.setDecisionRandom(Math.random);

console.log(`${deals * 2} rounds (${deals} deals, each played ${CONTROL ? "on two independent deals: CONTROL, no pairing" : "twice, same cards"}), ${deck}-card deck, ${((Date.now() - started) / 1000).toFixed(0)}s, ${stalemates} stalemates`);
const summary = labels.map(label => {
  const st = stats[label];
  const mean = st.sum / st.n;
  const se = Math.sqrt((st.sumSq / st.n - mean * mean) / st.n);
  console.log(`  ${label.padEnd(36)} avg points ${mean.toFixed(2)}   rounds won ${(100 * st.wins / st.n).toFixed(1)}%   closed ${(100 * st.closes / st.n).toFixed(1)}%`);
  return { mean, se };
});
if (labels[0] !== labels[1]) {                              // for comparison: the old unpaired formula
  console.log(`  (old unpaired se of the difference: ${Math.hypot(summary[0].se, summary[1].se).toFixed(2)})`);
}
// The deals are independent of each other; the two plays of one deal are not, so
// the standard error comes from the per-deal differences rather than from the two averages.
const diff = dealDiffs.reduce((a, b) => a + b, 0) / dealDiffs.length;
const variance = dealDiffs.reduce((a, x) => a + (x - diff) ** 2, 0) / (dealDiffs.length - 1);
const diffSe = Math.sqrt(variance / dealDiffs.length);
console.log(`  difference (A - B): ${diff.toFixed(2)} points, se ${diffSe.toFixed(2)}` +
            `  -> ${Math.abs(diff) > 2 * diffSe ? (diff < 0 ? "A is better" : "B is better") : "no clear difference"}`);
