// Browser test: mouse drag, touch drag, taps, results panel, phone layout (needs Playwright; see README)
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const URL_ = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const OUT = process.argv[2] || os.tmpdir();      // screenshots go here
const url = URL_;
const handNames = (page) => page.evaluate(() => state.hands[0].map(c => c.value + c.suit[0]).join(' '));
const center = async (page, i) => { const b = await page.locator('#hand-0 .card').nth(i).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const log = (...a) => console.log(...a);
// The test waits for the 3 CPUs to play and hand the turn back to the human. In about 1 game in 8 a CPU is dealt a
// hand it can close on its first turn, which ends the round, so the wait would time out. Stop CPUs from closing.
// (`const STRATEGIES` only fixes the name; the objects inside it can still be changed, like a Python dict.)
const noCpuClose = (page) => page.evaluate(() => { for (const s of Object.values(STRATEGIES)) s.chooseClose = () => null; });

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ================= DESKTOP: mouse =================
  let page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1000, height: 1150 } });
  page.on('pageerror', e => errors.push('desktop: ' + e.message));
  await page.goto(url);
  await noCpuClose(page);
  await page.click('#settings-btn');            // settings live in a collapsible panel
  await page.selectOption('#cpu-speed', 'fast');

  const before = await handNames(page);
  const a = await center(page, 0), b = await center(page, 5);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y - 10, { steps: 3 });
  const ghostWhileDragging = await page.locator('.card.ghost').count();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  const after = await handNames(page);
  log('MOUSE drag 0 -> 5:', before, ' => ', after,
      '| moved ok:', after.split(' ')[5] === before.split(' ')[0], '| ghost shown during drag:', ghostWhileDragging === 1,
      '| ghost removed:', (await page.locator('.card.ghost').count()) === 0);

  // a plain click on the draw pile, then a plain click (tap) on a card discards it
  await page.click('#draw-pile .card');
  const phase1 = await page.evaluate(() => state.phase + '/' + state.hands[0].length);
  const c0 = await center(page, 2);
  await page.mouse.click(c0.x, c0.y);
  const phase2 = await page.evaluate(() => state.phase + '/' + state.currentPlayer + '/' + state.hands[0].length);
  log('MOUSE tap flow: after draw =', phase1, '| after tap-discard =', phase2);

  // ---- results panel: force a close ----
  await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 15000 });
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.hands[0] = [c(1,'oros'),c(2,'oros'),c(3,'oros'),c(4,'copas'),c(5,'copas'),c(6,'copas'),c(12,'bastos'),c(2,'espadas')];
    state.phase = 'discard'; state.currentPlayer = 0; render();
  });
  await page.click('#close-btn');
  const options = await page.locator('#hand-0 .card.close-option').count();
  await page.locator('#hand-0 .card.close-option').first().click();
  const panelVisible = await page.locator('#results').isVisible();
  log('RESULTS: close options =', options, '| panel visible =', panelVisible,
      '| title =', await page.textContent('#results-title'));
  log('RESULTS rows:', await page.locator('.res-row').count(), '| melds shown:', await page.locator('.res-group.meld').count(),
      '| leftovers:', await page.locator('.res-group.leftover').count());
  await page.screenshot({ path: OUT + '/desktop_results.png' });
  await page.click('#res-hide');
  log('RESULTS hide: panel visible =', await page.locator('#results').isVisible(), '| reopen button enabled =', await page.locator('#results-btn').isEnabled());
  await page.click('#results-btn');
  log('RESULTS reopen: visible =', await page.locator('#results').isVisible());
  await page.click('#res-next');
  log('RESULTS next round: panel hidden =', !(await page.locator('#results').isVisible()), '| round =', await page.evaluate(() => state.round));
  await page.close();

  // ================= PHONE: touch =================
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push('phone: ' + e.message));
  await page.goto(url);
  await noCpuClose(page);
  await page.click('#settings-btn');            // settings live in a collapsible panel
  await page.selectOption('#cpu-speed', 'fast');
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  log('PHONE horizontal overflow:', overflow.sw > overflow.cw, overflow);
  await page.screenshot({ path: OUT + '/phone_table.png', fullPage: true });

  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const tb = await handNames(page);
  const ta = await center(page, 0), tc = await center(page, 4);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await touch('touchStart', ta.x, ta.y);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', ta.x + (tc.x - ta.x) * i / 8, ta.y + (tc.y - ta.y) * i / 8 - i); await page.waitForTimeout(16); }
  const ghostTouch = await page.locator('.card.ghost').count();
  await page.waitForTimeout(120);
  await touch('touchEnd');
  await page.waitForTimeout(150);
  const tafter = await handNames(page);
  log('TOUCH drag 0 -> 4:', tb, ' => ', tafter, '| moved ok:', tafter.split(' ')[4] === tb.split(' ')[0],
      '| ghost shown:', ghostTouch === 1, '| page did not scroll:', (await page.evaluate(() => window.scrollY)) === scrollBefore);

  // tap the draw pile, then tap a card to discard
  const dp = await page.locator('#draw-pile .card').boundingBox();
  await page.touchscreen.tap(dp.x + dp.width / 2, dp.y + dp.height / 2);
  log('TOUCH tap draw pile -> phase/hand:', await page.evaluate(() => state.phase + '/' + state.hands[0].length));
  const tcard = await center(page, 1);
  await page.touchscreen.tap(tcard.x, tcard.y);
  log('TOUCH tap card -> phase/current/hand:', await page.evaluate(() => state.phase + '/' + state.currentPlayer + '/' + state.hands[0].length));

  // phone results panel
  await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 15000 });
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.hands[0] = [c(1,'oros'),c(2,'oros'),c(3,'oros'),c(4,'copas'),c(5,'copas'),c(6,'copas'),c(12,'bastos'),c(2,'espadas')];
    state.phase = 'discard'; state.currentPlayer = 0; render();
  });
  await page.screenshot({ path: OUT + '/phone_hand8.png' });
  await page.evaluate(() => { humanClose(); });
  await page.evaluate(() => { const o = closeOptions(state.hands[0])[0]; closeRound(0, o.index); });
  await page.screenshot({ path: OUT + '/phone_results.png' });
  log('PHONE results visible:', await page.locator('#results').isVisible());

  log('ERRORS:', errors.length ? errors.join(' | ') : 'none');
  await browser.close();
})();
