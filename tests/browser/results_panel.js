// Browser test: results panel paths (elimination + re-entry, Chinchón game over, Escape key)
const { chromium } = require('playwright');
const { GAME_URL, OUT, makeChecker, cpu1Closes } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1000, height: 1100 } });
  const { errors, check, finish } = makeChecker();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(GAME_URL);
  await page.evaluate(() => newGame(3));   // a full table, as these checks expect (the page starts with 1 CPU)
  const vis = (id) => page.locator(id).isVisible();
  const read = (fn) => page.evaluate(fn);

  // --- A: the human is eliminated by CPU 1 closing, and gets a re-entry choice ---
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.totals = [99, 10, 20, 30]; state.inGame = [true, true, true, true];
    state.hands[0] = [c(12,'oros'),c(11,'copas'),c(10,'espadas'),c(12,'bastos'),c(7,'oros'),c(5,'copas'),c(3,'espadas')];
  });
  await cpu1Closes(page);
  check(await read(() => state.reentryPending.includes(0)), 'A eliminated: asked to re-enter');
  check(await vis('#results'), 'A the results panel is open');
  check(await vis('#res-reenter') && await vis('#res-stayout'), 'A Re-enter and Stay out buttons shown');
  check(!(await vis('#res-next')), 'A Next round hidden while the question is open');
  check((await page.locator('.res-row .badge.out').count()) >= 1, 'A you are shown as out');
  // hide -> the small re-entry bar appears instead
  await page.click('#res-hide');
  check(await vis('#reentry'), 'A hiding the panel shows the re-entry bar');
  await page.click('#results-btn');
  await page.click('#res-reenter');
  check(await read(() => state.inGame[0] && state.totals[0] === state.entryScore), 'A re-entered with the entry score');
  check(await vis('#res-next'), 'A Next round shown after answering');
  await page.click('#res-next');

  // --- B: a CPU makes Chinchón -> game over panel ---
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.hands[2] = [1,2,3,4,5,6,7].map(v => c(v, 'copas')).concat([c(12,'oros')]);
    state.currentPlayer = 2; state.phase = 'discard';
    state.turns = 8;   // past the first lap, when closing is allowed
    closeRound(2, closeOptions(state.hands[2])[0].index);
  });
  check(await read(() => state.gameOver && state.winner === 2 && state.roundResult.chinchon), 'B Chinchón ends the game, CPU 2 wins');
  check(await vis('#results-banner'), 'B game-over banner shown');
  check(await vis('#res-newgame') && !(await vis('#res-next')), 'B New game shown instead of Next round');
  check((await page.locator('.res-row.closer .res-group.meld .card').count()) === 7, 'B the Chinchón is shown as one group of 7');
  await page.screenshot({ path: OUT + '/gameover.png' });
  await page.click('#res-newgame');
  check(!(await vis('#results')), 'B New game closes the panel');
  check(await read(() => state.round === 1 && state.totals.every(t => t === 0)), 'B New game resets round and totals');

  // --- C: Escape closes the panel ---
  await cpu1Closes(page);
  await page.keyboard.press('Escape');
  check(!(await vis('#results')), 'C Escape hides the panel');

  await browser.close();
  finish();
})();
