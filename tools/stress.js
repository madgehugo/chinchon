"use strict";

/* =========================================================
   tools/stress.js: play many random games and look for bugs
   ---------------------------------------------------------
   Usage:  node tools/stress.js [games per deck size]     (default 40)
   The human seat makes random legal moves (draws, rearranges, discards,
   closes, re-enters); the CPUs play normally. After every move it checks
   that no card was lost or duplicated, and it checks that rounds end, hand
   sizes are right and nobody active is over the score limit. Games cycle through
   the reshuffle, re-entry, round-limit and lay-off settings, and it checks those rules too
   (in manual lay-off mode the human lays off random cards, takes some back, then is Done).
   Now and then it saves the game and restores it (as the browser does when the
   app is closed and opened again) and keeps playing from the restored copy.
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
  const stats = { games: 0, rounds: 0, chinchon: 0, humanOut: 0, endlessRound: 0, stuck: 0, errors: 0, stalemates: 0, tieBreaks: 0, layoffs: 0, winners: [0, 0, 0, 0], maxRoundTurns: 0, restores: 0 };
  const fail = (m, ...a) => { stats.errors++; if (stats.errors < 10) console.error("FAIL", m, ...a); };
  const audit = (label) => {
    const all = [...state.drawPile, ...state.discardPile, ...state.hands.flat()];
    const keys = new Set(all.map(c => c.suit + c.value));
    if (all.length !== size || keys.size !== size) fail("card audit", label, all.length, keys.size);
  };
  const settle = () => { if (!g.drain(20000)) { stats.endlessRound++; return false; } return true; };
  // Save and restore through JSON, like a reload in the browser, then carry on from the copy.
  // The copy must save to exactly the same thing, and broken saves must be refused.
  const roundTrip = (label) => {
    const before = JSON.stringify(g.snapshotGame());
    g.clearQueue();                                   // a closed app keeps no timers
    if (!g.restoreGame(JSON.parse(before))) { fail("restore refused a good save", label); return; }
    if (JSON.stringify(g.snapshotGame()) !== before) fail("restore changed the game", label);
    // Cards are compared as objects, so a known card must be the very object in that hand
    if (state.known.some((cards, p) => cards.some(c => !state.hands[p].includes(c)))) fail("known card not re-linked", label);
    if (state.lastDrawn && !state.hands[0].includes(state.lastDrawn)) fail("drawn card not re-linked", label);
    const bad = JSON.parse(before);
    (bad.drawPile.length ? bad.drawPile : bad.discardPile).pop();   // one card missing
    if (g.restoreGame(bad) || g.restoreGame({ ...JSON.parse(before), version: -1 })) fail("restore accepted a broken save", label);
    stats.restores++;
    g.resumeTurn();
  };

  // After a round: every meld with cards laid off on it is still a meld, each player's points are
  // what they still hold, nothing was laid off when the rule says it may not be, and every card of a
  // hand appears exactly once on the results screen.
  const checkLayoffs = () => {
    const rr = state.roundResult;
    state.roundDetail.forEach((d, p) => {
      if (!d) return;
      const shown = [...d.melds.flatMap(m => m.cards), ...d.unmatched, ...d.laidOff].map(c => c.suit + c.value).sort();
      if (shown.join() !== state.hands[p].map(c => c.suit + c.value).sort().join()) fail("results lose or repeat a card", p);
      for (const m of d.melds) if (!g.isMeld([...m.cards, ...m.laid.map(l => l.card)])) fail("laid-off meld is not a meld", p);
      if (d.laidOff.length) {
        stats.layoffs++;
        if (state.layoffMode === "none" || p === rr.closer || rr.points[rr.closer] === -10) fail("laid off when not allowed", p);
      }
      if (p !== rr.closer && rr.points[p] !== d.unmatched.reduce((s, c) => s + g.cardPoints(c), 0)) fail("lay-off points", p);
    });
  };

  for (let n = 0; n < GAMES; n++) {
    state.cpuLevels = [...g.CPU_MODES[["easy", "medium", "hard", "mixed"][n % 4]]];
    state.maxReshuffles = [5, 0, 1, 2, 3, null][n % 6];       // cycle through the settings menus
    state.roundLimit = [null, 5, 10, 15, 20][Math.floor(n / 6) % 5];
    state.maxReentries = [null, 0, 1, 2][Math.floor(n / 2) % 4];
    state.layoffMode = ["auto", "manual", "none"][n % 3];
    g.newGame(1 + Math.floor(n / 4) % 3); settle();   // cycle through 1, 2 and 3 CPUs
    let rounds = 0, ok = true;
    while (ok && !state.gameOver && rounds < 300) {
      rounds++; stats.rounds++;
      let turns = 0;
      while (state.phase !== "roundOver" && turns++ < 800) {
        // CPUs advance through the fake-timer queue; the human plays at random
        if (state.currentPlayer !== 0 || !state.inGame[0]) {
          if (Math.random() < 0.05) { g.drain(1); roundTrip("cpu turn"); }   // part-way through CPU turns
          ok = settle(); if (!ok) break;
          if (state.phase !== "roundOver" && state.currentPlayer !== 0) { stats.stuck++; ok = false; break; }
          continue;
        }
        g.humanDraw(Math.random() < 0.5 ? "deck" : "discard");
        audit("draw");
        if (Math.random() < 0.05) { roundTrip("your discard"); audit("restore"); }
        if (state.phase === "discard") {
          if (Math.random() < 0.3) { g.moveCard(0, state.hands[0].length - 1); g.sortHand(); }
          if (g.closeOptions(state.hands[0]).length && Math.random() < 0.9) {
            g.humanClose();
            if (state.closing) { const o = g.closeOptions(state.hands[0]); g.closeRound(0, o[Math.floor(Math.random() * o.length)].index); }
          } else g.humanDiscard(Math.floor(Math.random() * state.hands[0].length));
        }
        audit("turn");
      }
      // Manual lay-off: the human tries random placements (most do not fit), takes some back, then is Done
      if (ok && g.awaitingLayoff()) {
        if (Math.random() < 0.1) roundTrip("your lay-off");
        for (let k = 0; k < 20 && g.awaitingLayoff(); k++) {
          const left = state.roundDetail[0].unmatched;
          const targets = g.layoffTargets(0);
          if (!left.length || !targets.length) break;
          const tg = targets[Math.floor(Math.random() * targets.length)];
          g.humanLayOff(Math.floor(Math.random() * left.length), tg.owner, tg.index);
          const meld = state.roundDetail[tg.owner].melds[tg.index];
          if (meld.laid.length && Math.random() < 0.2) g.humanTakeBack(tg.owner, tg.index, meld.laid.length - 1);
        }
        g.humanLayoffDone();
      }
      if (state.layoff) fail("lay-offs never finished", state.layoffMode);
      if (ok && state.roundDetail) checkLayoffs();
      stats.maxRoundTurns = Math.max(stats.maxRoundTurns, turns);
      if (state.roundResult.closer === null) stats.stalemates++;   // no closer = stalemate
      // Nobody may close before everyone in the round has played once (closingAllowed)
      else if (state.turns < state.roundDetail.filter(Boolean).length) fail("closed in the first lap", state.turns);
      if (state.maxReshuffles !== null && state.reshuffles > state.maxReshuffles) fail("too many reshuffles", state.reshuffles);
      if (state.maxReentries !== null && state.reentries.some(r => r > state.maxReentries)) fail("too many re-entries", state.reentries);
      if (state.roundLimit !== null && state.round >= state.roundLimit && !state.gameOver) stats.tieBreaks++;   // a tie: one more round
      if (!ok) break;
      if (state.phase !== "roundOver") { stats.stuck++; break; }
      state.hands.forEach((h, p) => { if (h.length !== 0 && h.length !== 7) fail("hand size", p, h.length); });
      if (Math.random() < 0.1) roundTrip("round over");
      if (state.gameOver) break;
      if (state.awaitingReentry && state.maxReentries !== null && state.reentries[0] >= state.maxReentries) fail("asked to re-enter with none left");
      if (state.awaitingReentry) { stats.humanOut++; g.humanReenter(Math.random() < 0.5); }
      if (state.gameOver) break;
      g.nextRound();
    }
    if (state.gameOver) { stats.games++; stats.winners[state.winner]++; if (state.roundResult.chinchon) stats.chinchon++; }
    // A game with a round limit must not end early by that rule, nor run past it except to break a tie
    if (state.gameOver && state.roundLimit !== null && !state.roundResult.chinchon) {
      const active = state.totals.map((t, p) => p).filter(p => state.inGame[p]);
      const lowest = Math.min(...active.map(p => state.totals[p]));
      if (active.length > 1 && state.round < state.roundLimit) fail("ended before the round limit", state.round);
      if (active.length > 1 && (state.totals[state.winner] !== lowest || active.filter(p => state.totals[p] === lowest).length !== 1)) {
        fail("round-limit winner is not the unique lowest total", state.winner, state.totals);
      }
    }
    if (!state.gameOver && state.roundLimit !== null && rounds >= 300) fail("round-limit game never ended");
    for (let p = 0; p < state.numPlayers; p++) if (state.inGame[p] && state.totals[p] > g.SCORE_LIMIT) fail("active over limit", p, state.totals[p]);
  }
  console.log(stats);
  totalErrors += stats.errors + stats.stuck + stats.endlessRound;
}
console.log(totalErrors ? `PROBLEMS FOUND: ${totalErrors}` : "stress test passed");
process.exit(totalErrors ? 1 : 0);
