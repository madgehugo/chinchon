// Browser test: mouse drag, touch drag, taps, results panel, phone layout (needs Playwright; see README)
const { chromium } = require('playwright');
const { GAME_URL, OUT, makeChecker, noCpuClose } = require('./helpers');

const handNames = (page) => page.evaluate(() => state.hands[0].map(c => c.value + c.suit[0]).join(' '));
const center = async (page, i) => { const b = await page.locator('#hand-0 .card').nth(i).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const turnState = (page) => page.evaluate(() => state.phase + '/' + state.currentPlayer + '/' + state.hands[0].length);

// Give the human an 8-card hand that can close (runs 1-3 oros and 4-6 copas), mid-turn
const closableHand = (page) => page.evaluate(() => {
  const c = (value, suit) => ({ value, suit });
  state.hands[0] = [c(1,'oros'),c(2,'oros'),c(3,'oros'),c(4,'copas'),c(5,'copas'),c(6,'copas'),c(12,'bastos'),c(2,'espadas')];
  state.phase = 'discard'; state.currentPlayer = 0; render();
});

(async () => {
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();

  // ================= DESKTOP: mouse =================
  let page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1000, height: 1150 } });
  page.on('pageerror', e => errors.push('desktop: ' + e.message));
  await page.goto(GAME_URL);
  await page.evaluate(() => newGame(3));   // a full table, as these checks expect (the page starts with 1 CPU)
  await noCpuClose(page);
  await page.click('#settings-btn');            // settings live in a collapsible panel
  await page.evaluate(() => { CPU_PAUSE.draw = 450; CPU_PAUSE.discard = 350; });   // quicker CPUs
  await page.keyboard.press('Escape');          // close the settings sheet, which covers the table

  const before = await handNames(page);
  const a = await center(page, 0), b = await center(page, 5);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y - 10, { steps: 3 });
  const ghostWhileDragging = await page.locator('.card.ghost').count();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  const after = await handNames(page);
  check(after.split(' ')[5] === before.split(' ')[0], `MOUSE drag 0 -> 5 moves the card (${before} => ${after})`);
  check(ghostWhileDragging === 1, 'MOUSE a ghost card follows the pointer');
  check((await page.locator('.card.ghost').count()) === 0, 'MOUSE the ghost is removed on drop');

  // a plain click on the draw pile, then a plain click (tap) on a card discards it
  await page.click('#draw-pile .card');
  check((await page.evaluate(() => state.phase + '/' + state.hands[0].length)) === 'discard/8', 'MOUSE click the draw pile: 8 cards, discard phase');
  const c0 = await center(page, 2);
  await page.mouse.click(c0.x, c0.y);
  check((await turnState(page)) === 'draw/1/7', 'MOUSE click a card: discarded, CPU 1 to play');

  // ---- results panel: force a close ----
  await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 15000 });
  await closableHand(page);
  await page.click('#close-btn');
  check((await page.locator('#hand-0 .card.close-option').count()) >= 1, 'RESULTS closing mode marks the closing cards');
  await page.locator('#hand-0 .card.close-option').first().click();
  check(await page.locator('#results').isVisible(), 'RESULTS panel opens when you close');
  check((await page.evaluate(() => state.roundResult.closer)) === 0, 'RESULTS you are the closer');
  check((await page.locator('.res-row').count()) === 4, 'RESULTS one row per player');
  check((await page.locator('.res-group.meld').count()) >= 2, 'RESULTS your two melds are shown');
  await page.screenshot({ path: OUT + '/desktop_results.png' });
  await page.click('#res-hide');
  check(!(await page.locator('#results').isVisible()), 'RESULTS Hide closes the panel');
  check(await page.locator('#results-btn').isEnabled(), 'RESULTS the Round results button is enabled');
  await page.click('#results-btn');
  check(await page.locator('#results').isVisible(), 'RESULTS the button reopens the panel');
  await page.click('#res-next');
  check(!(await page.locator('#results').isVisible()), 'RESULTS Next round closes the panel');
  check((await page.evaluate(() => state.round)) === 2, 'RESULTS Next round starts round 2');
  await page.close();

  // ================= PHONE: touch =================
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push('phone: ' + e.message));
  await page.goto(GAME_URL);
  await page.evaluate(() => newGame(3));
  await noCpuClose(page);
  await page.click('#settings-btn');
  await page.evaluate(() => { CPU_PAUSE.draw = 450; CPU_PAUSE.discard = 350; });   // quicker CPUs
  await page.keyboard.press('Escape');          // close the settings sheet, which covers the table
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), 'PHONE no horizontal overflow');
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
  check(tafter.split(' ')[4] === tb.split(' ')[0], `TOUCH drag 0 -> 4 moves the card (${tb} => ${tafter})`);
  check(ghostTouch === 1, 'TOUCH a ghost card follows the finger');
  check((await page.evaluate(() => window.scrollY)) === scrollBefore, 'TOUCH dragging does not scroll the page');

  // tap the draw pile, then tap a card to discard
  const dp = await page.locator('#draw-pile .card').boundingBox();
  await page.touchscreen.tap(dp.x + dp.width / 2, dp.y + dp.height / 2);
  check((await page.evaluate(() => state.phase + '/' + state.hands[0].length)) === 'discard/8', 'TOUCH tap the draw pile: 8 cards');
  const tcard = await center(page, 1);
  await page.touchscreen.tap(tcard.x, tcard.y);
  check((await turnState(page)) === 'draw/1/7', 'TOUCH tap a card: discarded, CPU 1 to play');

  // phone results panel
  await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 15000 });
  await closableHand(page);
  await page.screenshot({ path: OUT + '/phone_hand8.png' });
  await page.evaluate(() => { toggleClosing(); const o = closeOptions(state.hands[0])[0]; act('close', cardKey(state.hands[0][o.index])); });
  await page.screenshot({ path: OUT + '/phone_results.png' });
  check(await page.locator('#results').isVisible(), 'PHONE results panel opens');

  // The (i) buttons in Settings: each opens and closes its setting's explanation, and does not
  // open the dropdown it sits next to; the copies in the online create form open their own line
  await page.evaluate(() => { setResultsOpen(false); setSettingsOpen(true); });
  const infoCount = await page.locator('#settings .info-btn').count();
  const infoTexts = await page.evaluate(() => [...document.querySelectorAll('#settings .opt-info')].every(p => p.textContent.length > 40));
  check(infoCount === 8 && infoTexts, 'SETTINGS every setting but the language has an (i) button with its text');
  await page.click('#settings .info-btn[aria-controls="info-reshuffles"]');
  check(await page.isVisible('#info-reshuffles') &&
        await page.getAttribute('#settings .info-btn[aria-controls="info-reshuffles"]', 'aria-expanded') === 'true',
        'SETTINGS (i) opens the explanation');
  check(await page.evaluate(() => document.activeElement.id !== 'reshuffles'), 'SETTINGS (i) does not open the dropdown');
  check(await page.evaluate(() => { const p = document.querySelector('#settings-sheet .panel'); return p.scrollWidth <= p.clientWidth; }),
        'SETTINGS no sideways scrolling with an explanation open');
  await page.screenshot({ path: OUT + '/phone_settings_info.png' });
  await page.click('#settings .info-btn[aria-controls="info-reshuffles"]');
  check(!(await page.isVisible('#info-reshuffles')), 'SETTINGS (i) again closes it');
  await page.evaluate(() => { setSettingsOpen(false); setOnlineOpen(true); });
  if (await page.isVisible('#online-rule-picks')) {
    await page.click('#online-rule-picks .info-btn[aria-controls="online-info-layoff"]');
    check(await page.isVisible('#online-info-layoff') && !(await page.isVisible('#info-layoff')),
          'ONLINE FORM the copied (i) button opens its own explanation');
  }

  await browser.close();
  finish();
})();
