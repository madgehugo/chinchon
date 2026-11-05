// Browser test: toasts, score pop-ups, meld glow and sound (needs Playwright; see README)
const { chromium } = require('playwright');
const { GAME_URL, makeChecker, noCpuClose, cpu1Closes } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(GAME_URL);

  // No audio engine before the player has touched the page (browsers would warn)
  check(await page.evaluate(() => audio === null), 'no AudioContext before the first tap');

  // Record which sounds are asked for. playSound is a plain function declaration, so it is a
  // property of `window` and replacing that property changes what ui.js calls.
  await page.evaluate(() => {
    window.played = [];
    const original = playSound;
    window.playSound = name => { played.push(name); original(name); };
  });
  await page.evaluate(() => newGame(3));
  await noCpuClose(page);
  check(await page.evaluate(() => played.includes('deal')), 'a deal plays the deal sound');

  // Your draw and discard, then a CPU's turn: the toast says what it drew, the status line says it is playing
  await page.click('#draw-pile .card');                   // also the first tap: unlocks audio
  check(await page.evaluate(() => audio !== null), 'the first tap creates the AudioContext');
  await page.locator('#hand-0 .card').nth(0).click();
  check(await page.evaluate(() => played.includes('draw') && played.includes('discard')), 'drawing and discarding play sounds');
  await page.waitForSelector('#toasts .toast', { timeout: 5000 });
  check((await page.locator('#toasts .toast').count()) === 1, 'a CPU draw shows exactly one toast');
  check(await page.evaluate(() => document.getElementById('status').textContent === tm(msg('msg.playing', { who: state.currentPlayer }))),
        'the status line says which CPU is playing (the toast has the draw)');
  await page.waitForFunction(() => state.currentPlayer === 0, null, { timeout: 15000 });
  check(await page.evaluate(() => played.includes('turn')), 'your turn plays the turn sound');

  // Meld glow: with Hints on, completing a meld makes its cards glow once
  await page.click('#hints-btn');
  await page.evaluate(() => {
    const c = (value, suit) => ({ value, suit });
    state.hands[0] = [c(1,'oros'), c(2,'oros'), c(4,'copas'), c(7,'espadas'), c(10,'bastos'), c(11,'copas'), c(12,'espadas')];
    state.discardPile.push(c(3, 'oros'));                  // completes 1-2-3 of oros
    render();
  });
  await page.click('#discard-pile .card');
  // (the glow is the only animation that changes box-shadow; a.effect.target is the animated element)
  const glowing = await page.evaluate(() => document.getAnimations().filter(a =>
    a.effect && a.effect.target && a.effect.target.closest('#hand-0') &&
    a.effect.getKeyframes().some(k => k.boxShadow)).length);
  check(glowing === 3, `the three cards of the new meld glow (${glowing})`);

  // Score pop-ups wait for the results panel to be hidden, then float above each seat
  await cpu1Closes(page);
  check((await page.locator('.score-pop').count()) === 0, 'no pop-ups while the results panel is open');
  check(await page.evaluate(() => played.includes('close')), 'a close plays the close sound');
  await page.click('#res-hide');
  const pops = await page.locator('.score-pop').count();
  check(pops >= 3, `pop-ups appear once the panel is hidden (${pops})`);
  await page.waitForTimeout(1700);
  check((await page.locator('.score-pop').count()) === 0, 'the pop-ups remove themselves');

  // The Sound button in the top bar mutes, shows it, and is remembered
  const pressed = () => page.getAttribute('#sound-btn', 'aria-pressed');
  check((await pressed()) === 'true', 'the Sound button starts pressed (sound on)');
  await page.click('#sound-btn');
  check(await page.evaluate(() => soundOn === false), 'the Sound button turns sound off');
  check((await pressed()) === 'false' && (await page.getAttribute('#sound-btn use', 'href')) === '#ico-mute', 'muted: not pressed, crossed-out speaker');
  await page.reload();
  check(await page.evaluate(() => soundOn === false) && (await pressed()) === 'false', 'muting is remembered after a reload');
  await page.click('#sound-btn');
  check(await page.evaluate(() => soundOn === true), 'a second press turns sound back on');
  await page.close();

  // Reduced motion: no pop-ups (sounds and toasts still work)
  const calm = await browser.newPage({ viewport: { width: 1000, height: 1100 }, reducedMotion: 'reduce' });
  calm.on('pageerror', e => errors.push('reduced: ' + e.message));
  await calm.goto(GAME_URL);
  await calm.evaluate(() => newGame(3));
  await cpu1Closes(calm);
  await calm.click('#res-hide');
  check((await calm.locator('.score-pop').count()) === 0, 'reduced motion: no score pop-ups');

  await browser.close();
  finish();
})();
