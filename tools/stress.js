"use strict";

/* =========================================================
   tools/stress.js: play many random games and look for bugs
   ---------------------------------------------------------
   Usage:  node tools/stress.js [games per deck size]     (default 40)
   The human seat makes random legal moves (draws, rearranges, discards,
   closes, re-enters); the CPUs play normally. After every move it checks
   that no card was lost or duplicated, and it checks that rounds end, hand
   sizes are right and nobody active is over the score limit.
   Exits with a non-zero code if anything failed.
   ========================================================= */
const { loadGame } = require("./harness");

const GAMES = Number(process.argv[2] || 40);
const g = loadGame();
const state = g.state;
let totalErrors = 0;

for (const size of [40, 48]) {
  g.setDeckSize(size);
  console.log("--- deck", size);
  const stats = { games: 0, rounds: 0, chinchon: 0, humanOut: 0, endlessRound: 0, stuck: 0, errors: 0, stalemates: 0, winners: [0, 0, 0, 0], maxRoundTurns: 0 };
  const fail = (m, ...a) => { stats.errors++; if (stats.errors < 10) console.error("FAIL", m, ...a); };
  const audit = (label) => {
    const all = [...state.drawPile, ...state.discardPile, ...state.hands.flat()];
    const keys = new Set(all.map(c => c.suit + c.value));
    if (all.length !== size || keys.size !== size) fail("card audit", label, all.length, keys.size);
  };
  const settle = () => { if (!g.drain(20000)) { stats.endlessRound++; return false; } return true; };

  for (let n = 0; n < GAMES; n++) {
    state.cpuLevels = [...g.CPU_MODES[["easy", "medium", "hard", "mixed"][n % 4]]];
    g.newGame(1 + Math.floor(n / 4) % 3); settle();   // cycle through 1, 2 and 3 CPUs
    let rounds = 0, ok = true;
    while (ok && !state.gameOver && rounds < 300) {
      rounds++; stats.rounds++;
      let turns = 0;
      while (state.phase !== "roundOver" && turns++ < 800) {
        // CPUs advance through the fake-timer queue; the human plays at random
        if (state.currentPlayer !== 0 || !state.inGame[0]) {
          ok = settle(); if (!ok) break;
          if (state.phase !== "roundOver" && state.currentPlayer !== 0) { stats.stuck++; ok = false; break; }
          continue;
        }
        g.humanDraw(Math.random() < 0.5 ? "deck" : "discard");
        audit("draw");
        if (state.phase === "discard") {
          if (Math.random() < 0.3) { g.moveCard(0, state.hands[0].length - 1); g.sortHand(); }
          if (g.closeOptions(state.hands[0]).length && Math.random() < 0.9) {
            g.humanClose();
            if (state.closing) { const o = g.closeOptions(state.hands[0]); g.closeRound(0, o[Math.floor(Math.random() * o.length)].index); }
          } else g.humanDiscard(Math.floor(Math.random() * state.hands[0].length));
        }
        audit("turn");
      }
      stats.maxRoundTurns = Math.max(stats.maxRoundTurns, turns);
      if (/Stalemate/.test(state.summary)) stats.stalemates++;
      if (!ok) break;
      if (state.phase !== "roundOver") { stats.stuck++; break; }
      state.hands.forEach((h, p) => { if (h.length !== 0 && h.length !== 7) fail("hand size", p, h.length); });
      if (state.gameOver) break;
      if (state.awaitingReentry) { stats.humanOut++; g.humanReenter(Math.random() < 0.5); }
      if (state.gameOver) break;
      g.nextRound();
    }
    if (state.gameOver) { stats.games++; stats.winners[state.winner]++; if (/Chinch/.test(state.summary)) stats.chinchon++; }
    for (let p = 0; p < state.numPlayers; p++) if (state.inGame[p] && state.totals[p] > g.SCORE_LIMIT) fail("active over limit", p, state.totals[p]);
  }
  console.log(stats);
  totalErrors += stats.errors + stats.stuck + stats.endlessRound;
}
console.log(totalErrors ? `PROBLEMS FOUND: ${totalErrors}` : "stress test passed");
process.exit(totalErrors ? 1 : 0);
