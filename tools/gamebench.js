"use strict";

/* =========================================================
   tools/gamebench.js: which CPU setting wins more GAMES?
   ---------------------------------------------------------
   Usage:  node tools/gamebench.js <games> <A> <B> [deck] [players] [--jobs N]
     <A>, <B>   CPU levels or specs, exactly as in bench.js (e.g. hard, medium,
                "hard:takeMargin=1.5")
     [deck]     40 (default) or 48
     [players]  2, 3 or 4 (default 4): ONE player A against the rest, all B
     --jobs N   split the games over N processes (one per CPU core) to save time
     --reshuffles N   reshuffle limit per round (0, 1, 2, ... or "none"; default the game's own)
     --rounds N       round limit per game (default none: play until one player is left)
     --reentries N    re-entries allowed per player (default none = no limit)
   bench.js scores single rounds, so it cannot see anything that depends on the
   running totals: elimination over SCORE_LIMIT, re-entry, playing safe near the
   limit. This plays whole games instead, with the real scoring code from game.js,
   and counts who wins. Every seat (seat 0 included) is run by its strategy, and
   seat 0 re-enters by the same rule as the CPUs (entry score <= CPU_REENTRY_MAX).

   WHY ONE A: with two A's at the table (A B A B, as bench.js uses) the two A's are a
   team: an A that closes and goes out itself can still knock a B out and so help the
   other A win. A real CPU plays for itself, so here one A plays against a field of B's.

   DUPLICATE DEALING: each deal is played once per seat, with A moved to that seat
   and the same seeded shuffles. Every seat (including who starts) then gets A
   equally, and the games share their first round. With A = B every one of those
   games has the same winner, so A wins exactly 1 / players of them (the "fair
   share"). For a noise control add --control: each seat then gets an independent deal.

   Result: A's share of the games won, against the fair share (25% with 4 players).
   "se" is the standard error from the per-deal shares; a difference from the fair
   share under about 2 x se is noise.

   Example:  node tools/gamebench.js 4000 hard medium 40 4 --jobs 8
   ========================================================= */
const { loadGame, registerSpec, playTurns, parseArgs, parseLimit, runSharded } = require("./harness");

const MAX_ROUNDS = 500;       // a game longer than this counts as unfinished (should not happen)
const SEED = 54321;           // base seed: game k uses SEED + k (and others; see playGame)

// ---- Command line ----
const args = parseArgs(process.argv.slice(2));
const CONTROL = args.has("--control");
const JOBS = Number(args.option("--jobs") ?? 1);
const RESHUFFLES = parseLimit(args.option("--reshuffles"));            // undefined = the game's default
const ROUND_LIMIT = parseLimit(args.option("--rounds")) ?? null;       // default: no round limit
const REENTRIES = parseLimit(args.option("--reentries")) ?? null;      // default: no re-entry limit
const [games = "400", specA = "hard", specB = "medium", deck = "40", players = "4"] = args.positional;
const NUM_PLAYERS = Number(players);
if (!(NUM_PLAYERS >= 2 && NUM_PLAYERS <= 4)) { console.error("players must be 2, 3 or 4"); process.exit(1); }

/* ---------------------------------------------------------
   Playing games (what each worker process does)
   --------------------------------------------------------- */

// Play a whole game with strategy names `seat` (one per seat). Returns the winner's seat
// and the number of rounds, or winner null if the game did not finish.
function playGame(g, seat, seed) {
  // Separate seeded streams for shuffles and for mistake rolls (easy/medium), as in bench.js
  g.setRandom(g.makeSeededRandom(SEED + seed));
  g.setDecisionRandom(g.makeSeededRandom(SEED + 1e6 + seed));
  const s = g.state;
  g.newGame(NUM_PLAYERS - 1);          // resets totals and deals round 1 (seat 0 starts)
  g.clearQueue();
  let rounds = 0;
  while (!s.gameOver && rounds < MAX_ROUNDS) {
    rounds++;
    playTurns(g, seat);
    if (s.reentryPending.length) g.humanReenter(0, g.cpuWantsReentry());   // seat 0 decides like a CPU
    if (!s.gameOver) { g.nextRound(); g.clearQueue(); }
  }
  return { winner: s.gameOver ? s.winner : null, rounds };
}

// Play this worker's share of the deals. `shard` = [k, n]: deals k, k+n, k+2n, ...
function runShard([k, n]) {
  const g = loadGame();
  g.setDeckSize(Number(deck));
  if (RESHUFFLES !== undefined) g.state.maxReshuffles = RESHUFFLES;
  g.state.roundLimit = ROUND_LIMIT;
  g.state.maxReentries = REENTRIES;
  const [labelA, labelB] = [registerSpec(g, specA), registerSpec(g, specB)];
  const result = { dealShares: [], winsA: 0, games: 0, rounds: 0, unfinished: 0 };
  const deals = Math.floor(Number(games) / NUM_PLAYERS);

  for (let deal = k; deal < deals; deal += n) {
    let winsA = 0, finished = 0;
    for (let seatA = 0; seatA < NUM_PLAYERS; seatA++) {
      // A in seat `seatA`, B everywhere else
      const seat = Array.from({ length: NUM_PLAYERS }, (_, i) => i === seatA ? labelA : labelB);
      const seed = CONTROL ? deal * NUM_PLAYERS + seatA : deal;   // --control: independent games
      const { winner, rounds } = playGame(g, seat, seed);
      result.games++;
      result.rounds += rounds;
      if (winner === null || winner === undefined) { result.unfinished++; continue; }
      finished++;
      if (winner === seatA) winsA++;
    }
    result.winsA += winsA;
    if (finished === NUM_PLAYERS) result.dealShares.push(winsA / NUM_PLAYERS);   // A's share of this deal's games
  }
  g.setRandom(Math.random);
  g.setDecisionRandom(Math.random);
  return result;
}

/* ---------------------------------------------------------
   Combining and reporting (the main process)
   --------------------------------------------------------- */

function report(parts, seconds) {
  const all = { dealShares: [], winsA: 0, games: 0, rounds: 0, unfinished: 0 };
  for (const r of parts) {
    all.dealShares.push(...r.dealShares);
    all.winsA += r.winsA; all.games += r.games; all.rounds += r.rounds; all.unfinished += r.unfinished;
  }
  const x = all.dealShares;
  const fair = 1 / NUM_PLAYERS;
  const mean = x.reduce((a, b) => a + b, 0) / x.length;
  const variance = x.reduce((a, v) => a + (v - mean) ** 2, 0) / (x.length - 1);
  const se = Math.sqrt(variance / x.length);
  // (the 1e-9 absorbs rounding: 1/3 written as a sum of shares is not exactly 1/3)
  const verdict = Math.abs(mean - fair) > 2 * se + 1e-9 ? (mean > fair ? "A is better" : "B is better") : "no clear difference";

  console.log(`${all.games} games (${x.length} deals${CONTROL ? ", CONTROL: no pairing" : ", each played with A in every seat"}), ` +
              `${NUM_PLAYERS} players, ${deck}-card deck, ` +
              `reshuffles ${RESHUFFLES === undefined ? "default" : RESHUFFLES ?? "unlimited"}, round limit ${ROUND_LIMIT ?? "none"}, re-entries ${REENTRIES ?? "unlimited"}, ${(all.rounds / all.games).toFixed(1)} rounds per game, ` +
              `${all.unfinished} unfinished, ${seconds.toFixed(0)}s`);
  console.log(`  one A (${specA}) against ${NUM_PLAYERS - 1} x B (${specB}): A won ${all.winsA} games`);
  console.log(`  A's share of games won: ${(100 * mean).toFixed(1)}% (fair share ${(100 * fair).toFixed(1)}%), ` +
              `se ${(100 * se).toFixed(1)}  -> ${verdict}`);
}

runSharded(JOBS, runShard, report);
