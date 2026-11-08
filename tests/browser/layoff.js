// Browser test: New game closes Settings, the striped Hints bar for a card that fits two
// melds, and laying off leftover cards (automatic and manual) on the results screen
const { chromium } = require('playwright');
const { GAME_URL, OUT, makeChecker, noCpuClose } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const { errors, check, finish } = makeChecker();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(GAME_URL);
  await page.evaluate(() => newGame(2));
  await noCpuClose(page);
  const vis = (id) => page.locator(id).isVisible();
  const read = (fn) => page.evaluate(fn);

  // --- A: New game in the Settings sheet closes the sheet ---
  await page.click('#settings-btn');
  check(await vis('#settings-sheet'), 'A Settings opens');
  await page.click('#new-game');
  check(!(await vis('#settings-sheet')) && !(await read(() => state.showSettings)), 'A New game closes Settings');

  // --- B: Hints: 3-3-3-3 with 4-5-6 of bastos, the 3 of bastos fits either meld ---
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.hands[0] = [c(3,'oros'), c(3,'copas'), c(3,'espadas'), c(3,'bastos'), c(4,'bastos'), c(5,'bastos'), c(6,'bastos')];
    state.showHints = true;
    render();
  });
  const shared = await page.locator('#hand-0 .card.meld-shared').count();
  check(shared === 1, `B one card has the striped bar (got ${shared})`);
  check(await read(() => document.querySelector('#hand-0 .card.meld-shared').title.startsWith('3')), 'B the striped card is the 3');
  await page.screenshot({ path: OUT + '/hints-shared.png' });
  await page.evaluate(() => { state.showHints = false; render(); });

  // CPU 1 closes on 2 points (runs 1-2-3 oros and 4-5-6 copas, the 2 of bastos left over), you
  // hold the 4 of oros and the 7 and 10 of copas, CPU 2 a group of 7s and the 3 of bastos
  const closeWith = (mode) => page.evaluate((mode) => {
    const c = (value, suit) => ({ value, suit });
    state.layoffMode = mode;
    state.hands[0] = [c(4,'oros'), c(7,'copas'), c(10,'copas'), c(12,'bastos'), c(11,'bastos'), c(5,'espadas'), c(3,'bastos')];
    state.hands[1] = [c(1,'oros'), c(2,'oros'), c(3,'oros'), c(4,'copas'), c(5,'copas'), c(6,'copas'), c(2,'bastos'), c(12,'espadas')];
    state.hands[2] = [c(7,'oros'), c(7,'espadas'), c(7,'bastos'), c(1,'copas'), c(1,'espadas'), c(6,'bastos'), c(10,'oros')];
    state.totals = [0, 0, 0];
    state.currentPlayer = 1; state.phase = 'discard'; state.turns = 9;
    closeRound(1, 7);
  }, mode);

  // --- C: automatic: you lay off 4 of oros, 7 and 10 of copas (21 points) ---
  await closeWith('auto');
  check(await read(() => state.layoff === null && state.roundResult.points[0] === 28), 'C auto: your points drop from 49 to 28');
  check(await page.locator('.res-row .card.laid').count() === 3, 'C auto: three laid-off cards on the melds');
  check(await page.locator('.res-group.laidoff .card').count() === 3, 'C auto: your row shows the cards you laid off');
  check(await vis('#res-next'), 'C auto: Next round straight away');
  await page.screenshot({ path: OUT + '/layoff-auto.png', fullPage: true });
  await page.click('#res-next');

  // --- D: manual: the round waits for you; place 7 then 10 of copas by tapping ---
  await closeWith('manual');
  check(await read(() => awaitingLayoff(0)), 'D manual: waiting for you');
  check(await vis('#res-layoff-done') && !(await vis('#res-next')), 'D manual: Done instead of Next round');
  check(await page.locator('#next-btn').isDisabled(), 'D manual: the Next round button under the table is off');
  const yourLeftover = (n) => page.locator('.res-row').first().locator('.res-group.leftover .card').nth(n);
  const copasRun = page.locator('.res-row').nth(1).locator('.res-group.meld').nth(1);
  // your leftovers sorted by rank: 3b 4o 5e 7c 10c 11b 12b
  await yourLeftover(3).click();
  check(await page.locator('.res-group.leftover .card.picked').count() === 1, 'D manual: the picked card is marked');
  check(await page.locator('.res-group.meld.target').count() >= 3, 'D manual: other players\' melds become targets');
  await copasRun.click();
  await yourLeftover(3).click();                     // the 10 of copas, now 4th
  await copasRun.click();
  check(await read(() => state.roundDetail[0].laidOff.length === 2 && state.roundDetail[0].points === 32), 'D manual: 7 and 10 laid off');
  await yourLeftover(0).click();                     // 3 of bastos fits nowhere
  await copasRun.click();
  check(await read(() => state.status.some(m => m.key === 'msg.layoffNoFit')), 'D manual: a card that does not fit is refused');
  await page.screenshot({ path: OUT + '/layoff-manual.png', fullPage: true });
  await page.click('#res-layoff-done');
  check(await read(() => state.layoff === null && state.totals[0] === 32), 'D manual: Done scores the round');
  check(await vis('#res-next'), 'D manual: Next round after Done');

  // --- E: the setting is in Settings, and a close with -10 allows no lay-off ---
  check(await page.locator('#layoff option').count() === 3, 'E three lay-off options');
  await page.click('#res-next');
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.layoffMode = 'auto';
    state.hands[0] = [c(4,'oros'), c(7,'copas'), c(10,'copas'), c(12,'bastos'), c(11,'bastos'), c(5,'espadas'), c(3,'bastos')];
    state.hands[1] = [c(1,'oros'), c(2,'oros'), c(3,'oros'), c(4,'copas'), c(5,'copas'), c(6,'copas'), c(7,'copas'), c(12,'espadas')];
    state.currentPlayer = 1; state.phase = 'discard'; state.turns = 9;
    closeRound(1, 7);
  });
  check(await read(() => state.roundResult.points[1] === -10 && state.roundDetail[0].laidOff.length === 0), 'E no lay-off after a -10 close');

  await browser.close();
  finish();
})();
