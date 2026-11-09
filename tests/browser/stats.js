// Browser test: "Your record" in the Scores sheet counts each round and game once (needs Playwright; see README)
const { chromium } = require('playwright');
const { GAME_URL, makeChecker, noCpuClose } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(GAME_URL);

  const reload = async () => { await page.reload(); await noCpuClose(page); };
  const record = () => page.evaluate(() => JSON.parse(localStorage.getItem('chinchon-stats')));
  const hard = async () => ((await record()) || { levels: {} }).levels.hard;

  // Player p gets these cards (by key) and closes with the last one, at once. The cards are
  // swapped in from wherever they are, so the deck stays whole and the game can be saved.
  const closeWith = (p, keys) => page.evaluate(([p, keys]) => {
    if (state.hands[p].length === 7) state.hands[p].push(state.drawPile.pop());   // a player about to discard holds 8
    const places = [state.drawPile, state.discardPile, ...state.hands];
    keys.forEach((key, i) => {
      const from = places.find(cards => cards.some(c => cardKey(c) === key));
      const j = from.findIndex(c => cardKey(c) === key);
      [from[j], state.hands[p][i]] = [state.hands[p][i], from[j]];
    });
    state.currentPlayer = p; state.phase = 'discard';
    state.turns = 8;                                       // past the first lap, when closing is allowed
    closeRound(p, 7);
  }, [p, keys]);

  await page.evaluate(() => { CPU_PAUSE.draw = 300; CPU_PAUSE.discard = 200; state.cpuMode = 'hard'; newGame(1); });
  await noCpuClose(page);
  check(await record() === null, 'nothing is recorded before a round ends');

  // CPU 1 closes: one round for you, not a close of yours
  await closeWith(1, ['o1', 'o2', 'o3', 'c4', 'c5', 'c6', 'b2', 'e12']);
  let s = await hard();
  check(s && s.rounds === 1 && s.closes === 0 && s.games === 0, 'a round the CPU closed counts once');
  await reload();
  check((await hard()).rounds === 1, 'a reload of the finished round does not count it again');

  // Next round: you close with no unmatched cards (-10)
  await page.evaluate(() => act('next'));
  await closeWith(0, ['o1', 'o2', 'o3', 'c4', 'c5', 'c6', 'c7', 'e12']);
  s = await hard();
  check(s.rounds === 2 && s.closes === 1 && s.perfect === 1 && s.best === -10, 'your -10 close is counted');

  // Next round: CPU 1 makes a Chinchón, which ends the game (lost)
  await page.evaluate(() => act('next'));
  await closeWith(1, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'e12']);
  s = await hard();
  check(await page.evaluate(() => state.gameOver) && s.games === 1 && s.wins === 0 && s.rounds === 3,
        'the game over is counted, as a loss');
  await reload();
  s = await hard();
  check(s.games === 1 && s.rounds === 3, 'a reload of the finished game does not count it again');

  // The Scores sheet shows it, in both languages, without overflowing a phone screen
  await page.evaluate(() => { state.showResults = false; setScoresOpen(true); });
  check((await page.locator('#record-body tr').count()) === 2, 'the record table has a header and one level');
  for (const lang of ['en', 'es']) {
    await page.evaluate(lang => setLanguage(lang), lang);
    const wide = await page.evaluate(() => document.querySelector('#scores .panel').scrollWidth >
                                           document.querySelector('#scores .panel').clientWidth);
    check(!wide, `the record fits at 390px (${lang})`);
  }

  // Reset asks first, then clears; the round on the table is still not counted again
  await page.click('#record-reset');
  check(await page.isVisible('#record-confirm'), 'Reset asks first');
  await page.click('#record-yes');
  check(Object.keys((await record()).levels).length === 0, 'the record is cleared');
  await reload();
  check(Object.keys((await record()).levels).length === 0, 'and the finished game is not counted again after a reload');

  // The tutorial does not count
  await page.evaluate(() => { state.showScores = false; startTutorial(); });
  await page.waitForFunction(() => tutorial.active);
  await closeWith(1, ['o1', 'o2', 'o3', 'c4', 'c5', 'c6', 'b2', 'e12']);
  check(Object.keys((await record()).levels).length === 0, 'a tutorial round is not counted');

  await browser.close();
  finish();
})();
