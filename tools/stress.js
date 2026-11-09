"use strict";

/* =========================================================
   tools/stress.js: play many random games and look for bugs
   ---------------------------------------------------------
   Usage:  node tools/stress.js [games per deck size]     (default 40)
   The human seats make random moves through runAction (draws, rearranges,
   discards, closes, re-enters, and now and then a move that is not allowed,
   which must change nothing); the CPUs play normally. Every other game has
   several human seats, as in an online game, and their players sometimes go
   away (the CPU plays for them) and come back. After every move it checks
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
  const stats = { games: 0, rounds: 0, chinchon: 0, humanOut: 0, endlessRound: 0, stuck: 0, errors: 0, stalemates: 0, tieBreaks: 0, layoffs: 0, winners: [0, 0, 0, 0], maxRoundTurns: 0, restores: 0, multiHuman: 0, aways: 0, refused: 0 };
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
    // (the drawn card is in a hand, or on the discard pile when it was discarded to close)
    if (state.lastDrawn && ![...state.hands.flat(), ...state.discardPile].includes(state.lastDrawn)) fail("drawn card not re-linked", label);
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

  const pick = list => list[Math.floor(Math.random() * list.length)];
  const human = p => state.seats[p] === "human";
  // A move that is not allowed must change nothing: try one for a player whose turn it is not
  const tryRefused = (label) => {
    const others = state.seats.map((x, p) => p).filter(p => p !== state.currentPlayer && human(p));
    if (!others.length || state.phase === "roundOver") return;
    const before = JSON.stringify(g.snapshotGame());
    const p = pick(others);
    g.runAction(p, "draw", ["deck"]);
    g.runAction(p, "discard", [g.cardKey(state.hands[state.currentPlayer][0])]);   // a card p does not even hold
    g.runAction(state.currentPlayer, "bogus", []);
    g.runAction(state.currentPlayer, "discard", [42]);
    if (JSON.stringify(g.snapshotGame()) !== before) fail("a move that is not allowed changed the game", label);
    stats.refused++;
  };
  // Away players come back now and then (the CPU played for them meanwhile)
  const maybeBack = () => state.seats.forEach((x, p) => { if (x === "away" && Math.random() < 0.3) g.seatBack(p); });

  for (let n = 0; n < GAMES; n++) {
    state.cpuLevels = [...g.CPU_MODES[["easy", "medium", "hard", "mixed"][n % 4]]];
    state.maxReshuffles = [5, 0, 1, 2, 3, null][n % 6];       // cycle through the settings menus
    state.roundLimit = [null, 5, 10, 15, 20][Math.floor(n / 6) % 5];
    state.maxReentries = [null, 0, 1, 2][Math.floor(n / 2) % 4];
    state.layoffMode = ["auto", "manual", "none"][n % 3];
    const cpus = 1 + Math.floor(n / 4) % 3;                // cycle through 1, 2 and 3 CPUs
    if (n % 2) {
      // Several people at the table (an online game): seat 0 and at least one more seat are human
      const seats = Array.from({ length: cpus + 1 }, (_, p) => p === 0 || p === 1 || Math.random() < 0.5 ? "human" : "cpu");
      g.newGame(cpus, { seats, names: seats.map((x, p) => x === "human" ? `P${p}` : null) });
      stats.multiHuman++;
    } else {
      g.newGame(cpus);
    }
    settle();
    let rounds = 0, ok = true;
    while (ok && !state.gameOver && rounds < 300) {
      rounds++; stats.rounds++;
      let turns = 0;
      while (state.phase !== "roundOver" && turns++ < 800) {
        // CPUs advance through the fake-timer queue; the humans play at random
        const p = state.currentPlayer;
        if (!human(p)) {
          if (Math.random() < 0.05) { g.drain(1); roundTrip("cpu turn"); }   // part-way through CPU turns
          ok = settle(); if (!ok) break;
          if (state.phase !== "roundOver" && !human(state.currentPlayer)) { stats.stuck++; ok = false; break; }
          maybeBack();
          continue;
        }
        if (Math.random() < 0.03) tryRefused("before draw");
        // Now and then a person (not seat 0, which stands for this device) loses their connection
        if (p !== 0 && Math.random() < 0.05) { g.seatAway(p); stats.aways++; continue; }
        g.runAction(p, "draw", [Math.random() < 0.5 ? "deck" : "discard"]);
        audit("draw");
        if (Math.random() < 0.05) { roundTrip("your discard"); audit("restore"); }
        if (state.phase === "discard" && state.currentPlayer === p) {
          if (Math.random() < 0.3) {
            g.runAction(p, "order", [state.hands[p].map(g.cardKey).reverse()]);
            g.runAction(p, "order", [g.sortedHand(state.hands[p], pick(["number", "suit"])).map(g.cardKey)]);
          }
          if (Math.random() < 0.03) tryRefused("before discard");
          if (p !== 0 && Math.random() < 0.03) { g.seatAway(p); stats.aways++; continue; }   // gone after drawing
          const options = g.closeOptions(state.hands[p]);
          if (options.length && Math.random() < 0.9) g.runAction(p, "close", [g.cardKey(state.hands[p][pick(options).index])]);
          else g.runAction(p, "discard", [g.cardKey(pick(state.hands[p]))]);
        }
        audit("turn");
      }
      // Manual lay-off: each human in turn tries random placements (most do not fit), takes some
      // back, then is Done (or now and then goes away, and the CPU lays off for them)
      for (let guard = 0; ok && state.layoff && guard < 10; guard++) {
        const p = state.layoff.order[state.layoff.next];
        if (!g.awaitingLayoff(p)) { fail("lay-offs stopped at a player who is not asked", p); break; }
        if (Math.random() < 0.1) roundTrip("your lay-off");
        if (p !== 0 && Math.random() < 0.1) { g.seatAway(p); stats.aways++; continue; }
        for (let k = 0; k < 20 && g.awaitingLayoff(p); k++) {
          const left = state.roundDetail[p].unmatched;
          const targets = g.layoffTargets(p);
          if (!left.length || !targets.length) break;
          const tg = pick(targets);
          g.runAction(p, "layOff", [g.cardKey(pick(left)), tg.owner, tg.index]);
          const meld = state.roundDetail[tg.owner].melds[tg.index];
          if (meld.laid.length && Math.random() < 0.2) g.runAction(p, "takeBack", [tg.owner, tg.index, meld.laid.length - 1]);
        }
        g.runAction(p, "layoffDone", []);
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
      for (const p of state.reentryPending) {
        if (state.maxReentries !== null && state.reentries[p] >= state.maxReentries) fail("asked to re-enter with none left", p);
        if (!human(p)) fail("a CPU was asked to re-enter", p);
      }
      // Everyone asked answers (in any order), or goes away and the CPU answers for them
      while (state.reentryPending.length) {
        const p = pick(state.reentryPending);
        stats.humanOut++;
        if (p !== 0 && Math.random() < 0.1) { g.seatAway(p); stats.aways++; }
        else g.runAction(p, "reenter", [Math.random() < 0.5]);
      }
      if (state.gameOver) break;
      maybeBack();
      // Every person presses Next round, in any order; the round starts only after the last one
      const people = state.seats.map((x, q) => q).filter(human).sort(() => Math.random() - 0.5);
      people.forEach((p, i) => {
        if (i > 0 && state.phase !== "roundOver") fail("the next round started before everyone pressed Next round");
        g.runAction(p, "next", []);
      });
      if (state.phase === "roundOver") fail("Next round did not start a round");
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
