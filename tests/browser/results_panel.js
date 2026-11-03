// Browser test: results panel paths (elimination + re-entry, Chinchón game over, Escape key)
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const URL_ = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const OUT = process.argv[2] || os.tmpdir();      // screenshots go here
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1000, height: 1100 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL_);
  const vis = (id) => page.locator(id).isVisible();

  // --- A: the human is eliminated by CPU 1 closing, and gets a re-entry choice ---
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.totals = [99, 10, 20, 30]; state.inGame = [true, true, true, true];
    state.hands[0] = [c(12,'oros'),c(11,'copas'),c(10,'espadas'),c(12,'bastos'),c(7,'oros'),c(5,'copas'),c(3,'espadas')];
    state.hands[1] = [c(1,'oros'),c(2,'oros'),c(3,'oros'),c(4,'copas'),c(2,'bastos'),c(12,'copas'),c(5,'espadas'),c(6,'bastos')].slice(0, 8);
    state.hands[1][5] = c(2,'espadas');   // 1-2-3 oros run + 4c 2b 2e 5e 6b ... pick closable below
    state.hands[1] = [c(1,'oros'),c(2,'oros'),c(3,'oros'),c(4,'copas'),c(5,'copas'),c(6,'copas'),c(2,'bastos'),c(12,'espadas')];
    state.currentPlayer = 1; state.phase = 'discard'; render();
    closeRound(1, closeOptions(state.hands[1])[0].index);
  });
  console.log('A eliminated: awaitingReentry =', await page.evaluate(() => state.awaitingReentry),
              '| panel =', await vis('#results'), '| Re-enter btn =', await vis('#res-reenter'), '| Stay out btn =', await vis('#res-stayout'),
              '| Next btn hidden =', !(await vis('#res-next')));
  console.log('A notice:', (await page.textContent('#results-notice')).trim());
  console.log('A you shown as out:', await page.locator('.res-row .badge.out').count() >= 1);
  // hide -> the small re-entry bar appears instead
  await page.click('#res-hide');
  console.log('A hidden panel -> inline re-entry bar visible =', await vis('#reentry'));
  await page.click('#results-btn');
  await page.click('#res-reenter');
  console.log('A after re-enter: in game =', await page.evaluate(() => state.inGame[0]), '| total =', await page.evaluate(() => state.totals[0]),
              '| Next btn =', await vis('#res-next'));
  await page.click('#res-next');

  // --- B: a CPU makes Chinchón -> game over panel ---
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.hands[2] = [1,2,3,4,5,6,7].map(v => c(v, 'copas')).concat([c(12,'oros')]);
    state.currentPlayer = 2; state.phase = 'discard'; render();
    closeRound(2, closeOptions(state.hands[2])[0].index);
  });
  console.log('B game over =', await page.evaluate(() => state.gameOver), '| title:', await page.textContent('#results-title'));
  console.log('B notice:', (await page.textContent('#results-notice')).trim());
  console.log('B New game btn =', await vis('#res-newgame'), '| Next btn hidden =', !(await vis('#res-next')),
              '| Chinchón run shown as one group of 7 =', (await page.locator('.res-row.closer .res-group.meld .card').count()) === 7);
  await page.screenshot({ path: OUT + '/gameover.png' });
  await page.click('#res-newgame');
  console.log('B new game: panel hidden =', !(await vis('#results')), '| round =', await page.evaluate(() => state.round), '| totals =', await page.evaluate(() => state.totals.join(',')));

  // --- C: Escape closes the panel ---
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.hands[1] = [c(1,'oros'),c(2,'oros'),c(3,'oros'),c(4,'copas'),c(5,'copas'),c(6,'copas'),c(2,'bastos'),c(12,'espadas')];
    state.currentPlayer = 1; state.phase = 'discard'; render();
    closeRound(1, closeOptions(state.hands[1])[0].index);
  });
  await page.keyboard.press('Escape');
  console.log('C Escape hides panel =', !(await vis('#results')));
  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
})();
