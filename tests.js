/* =========================================================
   tests.js: self-tests for the rules, run when the page loads
   ---------------------------------------------------------
   Open the browser console (F12 > Console) to see the results. Nothing is
   printed for a passing check; a failing check logs "TEST FAILED: ...".
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   3c. SELF-TESTS: run on page load; results appear in the browser
   console (F12 > Console). console.assert logs only if it FAILS.
   --------------------------------------------------------- */
function runSelfTests() {
  const originalDeck = DECK_SIZE;
  setDeckSize(40);                                // the tests below assume the 40-card deck
  try { runTests40(); runTests48(); runTestsAI(); runTestsRoundDetail(); runTestsI18n(); }
  finally { setDeckSize(originalDeck); }          // always restore the player's choice
}

// 48-card deck: 8 and 9 exist, so 7-8-9-10 are consecutive
function runTests48() {
  setDeckSize(48);
  const c = (value, suit) => ({ value, suit });
  let failures = 0;
  const check = (ok, label) => { if (!ok) { failures++; console.error("TEST FAILED:", label); } };

  check(createDeck().length === 48, "48-card deck has 48 cards");
  let r = evaluateHand([c(7,"oros"), c(8,"oros"), c(9,"oros"), c(10,"oros")]);
  check(r.melds.length === 1 && r.points === 0, "7-8-9-10 is one run");
  r = evaluateHand([c(8,"copas"), c(8,"oros"), c(8,"bastos"), c(9,"oros")]);
  check(r.melds.length === 1 && r.points === 9, "group of 8s leaves the 9");
  check(cardPoints(c(9,"oros")) === 9 && cardPoints(c(12,"oros")) === 10, "9 scores 9, figures score 10");
  const chin = [4,5,6,7,8,9,10].map(v => c(v, "espadas"));
  check(getCloseInfo(chin).chinchon, "Chinchón across the 7/8 boundary");
  if (failures === 0) console.log("All 48-card tests passed.");
}

function runTests40() {
  const c = (value, suit) => ({ value, suit });   // shorthand card builder
  let failures = 0;
  const check = (condition, label) => {
    if (!condition) { failures++; console.error("TEST FAILED:", label); }
  };

  // Run across the 7 -> 10 gap
  let r = getCloseInfo([c(7,"oros"), c(10,"oros"), c(11,"oros"), c(1,"copas")]);
  check(r.melds.length === 1 && r.melds[0].type === "run", "7-10-11 is a run");

  // No wrap-around: 12, 1, 2 is NOT a run
  r = evaluateHand([c(12,"oros"), c(1,"oros"), c(2,"oros")]);
  check(r.melds.length === 0, "12-1-2 is not a run");

  // Group of three
  r = evaluateHand([c(5,"oros"), c(5,"copas"), c(5,"bastos"), c(2,"espadas")]);
  check(r.melds.length === 1 && r.points === 2, "group of three 5s");

  // Chinchón: 7 consecutive cards of one suit
  const chin = [1,2,3,4,5,6,7].map(v => c(v, "oros"));
  r = getCloseInfo(chin);
  check(r.chinchon && r.canClose && r.closerScore === null, "Chinchón detected");

  // All cards matched but not Chinchón: runs 1-4 oros + 5-7 copas -> -10
  r = getCloseInfo([1,2,3,4].map(v => c(v,"oros")).concat([5,6,7].map(v => c(v,"copas"))));
  check(!r.chinchon && r.canClose && r.closerScore === -10, "no unmatched = -10");

  // Close allowed with exactly 7 unmatched points (meld + 3 + 4)
  r = getCloseInfo([c(1,"oros"), c(2,"oros"), c(3,"oros"), c(3,"copas"), c(4,"espadas")]);
  check(r.canClose && r.points === 7 && r.closerScore === 7, "close at 7 points");

  // Not allowed with 8 unmatched points
  r = getCloseInfo([c(1,"oros"), c(2,"oros"), c(3,"oros"), c(4,"copas"), c(4,"espadas")]);
  check(!r.canClose, "cannot close at 8 points");

  // Not allowed without a meld, even if points are low
  r = getCloseInfo([c(1,"oros"), c(2,"copas"), c(3,"espadas")]);
  check(!r.canClose, "cannot close without a meld");

  // The engine picks the best arrangement, not the first one it finds
  r = evaluateHand([c(6,"oros"), c(6,"copas"), c(6,"bastos"), c(5,"oros"), c(7,"oros")]);
  // The 6 of oros fits the run 5-6-7 OR the group of 6s, but not both.
  // Run leaves 6+6 = 12 points; group leaves 5+7 = 12 points.
  check(r.points === 12 && r.melds.length === 1, "overlapping melds: card used once");

  // With four 6s, the best split uses BOTH melds: run 5-6-7 of oros takes
  // the 6 of oros, and the other three 6s form a group -> 0 points left.
  r = evaluateHand([c(6,"oros"), c(6,"copas"), c(6,"bastos"), c(6,"espadas"), c(5,"oros"), c(7,"oros")]);
  check(r.points === 0 && r.melds.length === 2, "run + group sharing a value");

  // findBestClose: 8 cards, discarding the loose 12 allows -10
  const eight = [1,2,3,4].map(v => c(v,"oros")).concat([5,6,7].map(v => c(v,"copas")), [c(12,"bastos")]);
  const bc = findBestClose(eight);
  check(bc && eight[bc.discardIndex].value === 12 && bc.info.closerScore === -10,
        "findBestClose picks the 12 to discard");

  console.log(failures === 0 ? "All hand-evaluation tests passed." : `${failures} test(s) failed.`);
}

// The CPU's helper functions (ai.js)
function runTestsAI() {
  const c = (value, suit) => ({ value, suit });
  let failures = 0;
  const check = (ok, label) => { if (!ok) { failures++; console.error("TEST FAILED:", label); } };
  const savedKnown = state.known, savedIn = state.inGame, savedSettings = { ...SMART };
  const savedHands = state.hands, savedTotals = state.totals, savedTurns = state.turns;

  // denialRisk: opponent 1 is known to hold the 5 and 6 of oros
  state.inGame = [true, true, true, true];
  state.known = [[], [c(5, "oros"), c(6, "oros")], [], []];
  check(denialRisk(0, c(7, "oros")) === 2, "7 would complete 5-6-7 for the opponent");
  check(denialRisk(0, c(4, "oros")) === 2, "4 would complete 4-5-6 for the opponent");
  check(denialRisk(0, c(2, "oros")) === 0, "2 of oros is harmless");
  check(denialRisk(0, c(7, "copas")) === 0, "same number, other suit: harmless");
  state.known = [[], [c(6, "oros"), c(6, "copas")], [], []];
  check(denialRisk(0, c(6, "bastos")) === 2, "a third 6 would complete a group");

  // handCost options: all off by default, so cost is just the unmatched points
  const closable = [c(1,"oros"), c(2,"oros"), c(3,"oros"), c(4,"copas"), c(2,"bastos")];   // 6 points
  check(handCost(closable) === 6, "default cost is the unmatched points");
  SMART.closeBonus = 5;
  check(handCost(closable) === 1, "closeBonus rewards a hand that could close");
  Object.assign(SMART, savedSettings);

  // cpuBestClose: no closing in the first lap, and never a close that goes over SCORE_LIMIT.
  // The 8-card hand closes on 7 points at best (discard the 12, keep the 7).
  const eight = [c(1,"oros"), c(2,"oros"), c(3,"oros"), c(4,"copas"), c(5,"copas"), c(6,"copas"), c(7,"bastos"), c(12,"bastos")];
  state.hands = [eight, [], [], []];
  state.totals = [0, 0, 0, 0];
  state.turns = 3;                                  // 4 players, only 3 turns played: first lap
  check(!closingAllowed() && cpuBestClose(0) === null, "nobody closes in the first lap");
  check(closeOptions(eight).length === 0, "the human cannot close in the first lap either");
  state.turns = 4;
  check(closingAllowed() && cpuBestClose(0) !== null, "closing allowed once everyone has played");
  state.totals = [SCORE_LIMIT - 7, 0, 0, 0];
  check(cpuBestClose(0) !== null, "a close that lands exactly on the limit is fine");
  state.totals = [SCORE_LIMIT - 6, 0, 0, 0];
  check(cpuBestClose(0) === null, "a CPU does not close if it would go over the limit");

  state.hands = savedHands; state.totals = savedTotals; state.turns = savedTurns;
  state.known = savedKnown; state.inGame = savedIn;       // leave the game state as we found it
  if (failures === 0) console.log("All CPU helper tests passed.");
}

// The per-player breakdown shown on the round results screen (game.js)
function runTestsRoundDetail() {
  const c = (value, suit) => ({ value, suit });
  let failures = 0;
  const check = (ok, label) => { if (!ok) { failures++; console.error("TEST FAILED:", label); } };
  const savedHands = state.hands, savedIn = state.inGame, savedDeck = DECK_SIZE;
  setDeckSize(40);

  const run = [1,2,3,4,5,6,7].map(v => c(v, "oros"));
  const mixed = [c(1,"oros"), c(2,"oros"), c(3,"oros"), c(5,"copas"), c(12,"bastos"), c(7,"espadas"), c(4,"copas")];
  state.inGame = [true, true, false, true];
  state.hands = [run, mixed, [], mixed];
  const d = buildRoundDetail(0, true, [null, 33, 0, 33]);

  check(d[2] === null, "a player who sat out has no entry");
  check(d[0].chinchon && d[0].melds.length === 1 && d[0].melds[0].cards.length === 7, "Chinchón shows as ONE run of 7");
  check(d[1].melds.length === 1 && d[1].melds[0].type === "run" && d[1].unmatched.length === 4, "other hands split into meld + leftovers");
  check(d[1].points === 33 && !d[1].closer, "points come from the points array");

  state.hands = savedHands; state.inGame = savedIn; setDeckSize(savedDeck);
  if (failures === 0) console.log("All round-detail tests passed.");
}

// The texts (i18n.js): both languages must be complete and agree with each other
function runTestsI18n() {
  let failures = 0;
  const check = (ok, label) => { if (!ok) { failures++; console.error("TEST FAILED:", label); } };
  const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join(",");
  const savedLang = currentLang;
  const reference = STRINGS.en;

  for (const lang of LANGUAGES) {
    for (const key of Object.keys(reference)) {
      check(key in STRINGS[lang], `${lang} is missing "${key}"`);
      if (key in STRINGS[lang]) {
        check(placeholders(STRINGS[lang][key]) === placeholders(reference[key]),
              `${lang} "${key}" has different {placeholders} from English`);
      }
    }
    for (const key of Object.keys(STRINGS[lang])) check(key in reference, `${lang} has an extra key "${key}"`);
  }

  // t() fills placeholders; plural() picks key.one or key.other; players get a name in each language
  currentLang = "en";
  check(t("pile.draw", { n: 5 }) === "Draw pile (5)", "t fills {n}");
  check(plural("confirm.cpus", 1).includes("1 CPU?") && plural("confirm.cpus", 3).includes("3 CPUs?"), "plural: one / other");
  check(playerName(0) === "You" && playerName(2) === "CPU 2", "English player names");
  currentLang = "es";
  check(playerName(0) === "Tú" && t("pile.discard", { n: 2 }) === "Descartes (2)", "Spanish text");
  check(t(whoKey("sum.closed", 1), { who: 1 }) === "CPU 1 cerró la ronda.", "who formatter + .cpu variant");
  currentLang = savedLang;

  if (failures === 0) console.log("All text (i18n) tests passed.");
}
