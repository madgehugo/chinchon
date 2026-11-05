"use strict";

/* =========================================================
   tools/bench.js: which CPU setting plays better?
   ---------------------------------------------------------
   Usage:  node tools/bench.js <rounds> <A> <B> [deck]
     <A> and <B> are strategies (easy, medium, hard, greedy, smart or finish), optionally with
     overrides for the SMART or FINISH settings in ai.js, for example
         smart
         "smart:takeMargin=-1,closeMax=5"
     Four CPUs play: A B A B (with --players 2: A B; with 3: A B A, then B A B). Seats AND
     the starting player rotate, so each side gets every position equally (use a multiple
     of 16 rounds; 12 with 3 players). Without that rotation the side that always starts
     has an advantage; an earlier benchmark was fooled by exactly that.
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

   --jobs N splits the deals over N processes (one per CPU core), as in gamebench.js. The
   result is exactly the same as without it, only faster.
   --reshuffles N plays with that reshuffle limit per round (0, 1, 2, ... or "none"; the
   default is the game's own, MAX_RESHUFFLES).
   --players N plays at a table of N (2, 3 or 4; default 4). The two sides each get half the
   seats; with 3 players a side has two seats in one play and one in the other, and each
   side's points are averaged over its own seats.

   Example:  node tools/bench.js 3200 smart "smart:takeMargin=-1"
             node tools/bench.js 3200 finish smart 48 --reshuffles 2 --jobs 8
             node tools/bench.js 6400 "hard:takeMargin=1.5" hard --players 2 --jobs 8
   ========================================================= */
const { loadGame, registerSpec, playTurns, parseArgs, parseLimit, runSharded } = require("./harness");

const args = parseArgs(process.argv.slice(2));
const CONTROL = args.has("--control");                      // see NOISE CONTROL above
const JOBS = Number(args.option("--jobs") ?? 1);
const RESHUFFLES = parseLimit(args.option("--reshuffles")); // undefined = the game's default
const PLAYERS = Number(args.option("--players") ?? 4);
if (!(PLAYERS >= 2 && PLAYERS <= 4)) { console.error("--players must be 2, 3 or 4"); process.exit(1); }
const [rounds = "1600", specA = "smart", specB = "greedy", deck = "40"] = args.positional;
const g = loadGame();
g.setDeckSize(Number(deck));
g.newGame(PLAYERS - 1);       // sizes every per-player array in state for this table
g.clearQueue();
if (RESHUFFLES !== undefined) g.state.maxReshuffles = RESHUFFLES;

// "smart:takeMargin=-1" style specs become registered strategies (see registerSpec in harness.js)
const labels = [registerSpec(g, specA), registerSpec(g, specB)];

// Play one round from scratch (all totals 0) with every seat run by its strategy.
function playRound(levels, start) {
  const s = g.state;
  s.inGame = Array(PLAYERS).fill(true);
  s.totals = Array(PLAYERS).fill(0);
  s.gameOver = false;
  s.awaitingReentry = false;
  s.startPlayer = start;
  g.startRound();
  g.clearQueue();
  playTurns(g, levels);
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
  // side[s] is 0 (A) or 1 (B) for seat s: A B A B, shifted by the rotation
  const side = Array.from({ length: PLAYERS }, (_, s) => (s + rotation) % 2);
  const seat = side.map(x => labels[x]);
  const result = playRound(seat, start);
  if (!result) return null;
  if (result.closer === null) stalemates++;

  const scores = result.points.map((pts, p) =>
    (result.chinchon && p === result.closer) ? CHINCHON_SCORE : pts);
  const best = Math.min(...scores);
  const sumOf = [0, 0], seats = [0, 0];                     // points of A's seats and of B's seats, and how many
  scores.forEach((score, p) => {
    const st = stats[seat[p]];
    st.n++; st.sum += score; st.sumSq += score * score;
    if (score === best) st.wins++;
    if (result.closer === p) st.closes++;
    sumOf[side[p]] += score;      // by side, not by label, since A and B may be the same spec
    seats[side[p]]++;
  });
  return sumOf[0] / seats[0] - sumOf[1] / seats[1];
}

const deals = Math.floor(Number(rounds) / 2);

// Play this process's share of the deals. `shard` = [k, n]: deals k, k+n, k+2n, ...
// Returns everything the report needs, so the shares of several processes can be added up.
function runShard([k, n]) {
  const dealDiffs = [];                                     // A - B for each deal, averaged over its two plays
  for (let d = k; d < deals; d += n) {
    const rotation = d % 4;                                 // who sits where (swapped for the second play)
    const start = Math.floor(d / 4) % PLAYERS;              // who starts (independent of seating)
    const first = playDeal(d, rotation, start);
    // A and B swap seats with identical cards (in --control mode: a different, independent deal)
    const second = playDeal(d, rotation + 1, start, CONTROL ? d + deals : d);
    if (first !== null && second !== null) dealDiffs.push((first + second) / 2);
  }
  g.setRandom(Math.random);
  g.setDecisionRandom(Math.random);
  return { stats, stalemates, dealDiffs };
}

function report(parts, seconds) {
  // Add up the shares (with one process there is just one part)
  const all = {};
  for (const label of labels) all[label] = { n: 0, sum: 0, sumSq: 0, wins: 0, closes: 0 };
  const dealDiffs = [];
  let stalemateCount = 0;
  for (const part of parts) {
    for (const label of labels) for (const key in all[label]) all[label][key] += part.stats[label][key];
    dealDiffs.push(...part.dealDiffs);
    stalemateCount += part.stalemates;
  }

  const limit = g.state.maxReshuffles === null ? "no reshuffle limit" : `at most ${g.state.maxReshuffles} reshuffles`;
  console.log(`${deals * 2} rounds (${deals} deals, each played ${CONTROL ? "on two independent deals: CONTROL, no pairing" : "twice, same cards"}), ${PLAYERS} players, ${deck}-card deck, ${limit}, ${seconds.toFixed(0)}s, ${stalemateCount} stalemates`);
  const summary = labels.map(label => {
    const st = all[label];
    const mean = st.sum / st.n;
    const se = Math.sqrt((st.sumSq / st.n - mean * mean) / st.n);
    console.log(`  ${label.padEnd(36)} avg points ${mean.toFixed(2)}   rounds won ${(100 * st.wins / st.n).toFixed(1)}%   closed ${(100 * st.closes / st.n).toFixed(1)}%`);
    return { mean, se };
  });
  if (labels[0] !== labels[1]) {                            // for comparison: the old unpaired formula
    console.log(`  (old unpaired se of the difference: ${Math.hypot(summary[0].se, summary[1].se).toFixed(2)})`);
  }
  // The deals are independent of each other; the two plays of one deal are not, so
  // the standard error comes from the per-deal differences rather than from the two averages.
  const diff = dealDiffs.reduce((a, b) => a + b, 0) / dealDiffs.length;
  const variance = dealDiffs.reduce((a, x) => a + (x - diff) ** 2, 0) / (dealDiffs.length - 1);
  const diffSe = Math.sqrt(variance / dealDiffs.length);
  console.log(`  difference (A - B): ${diff.toFixed(2)} points, se ${diffSe.toFixed(2)}` +
              `  -> ${Math.abs(diff) > 2 * diffSe ? (diff < 0 ? "A is better" : "B is better") : "no clear difference"}`);
}

runSharded(JOBS, runShard, report);
