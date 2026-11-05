// Browser test: card animations play (and stay short) normally, and do not run with reduced motion (needs Playwright; see README)
const { chromium } = require('playwright');
const { GAME_URL, makeChecker, noCpuClose } = require('./helpers');

// How many card animations are running, and the longest duration among them (ms)
const running = (page) => page.evaluate(() => {
  const anims = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList.contains('card')
                                                  && a.constructor.name === 'Animation');
  return { count: anims.length, longest: Math.max(0, ...anims.map(a => a.effect.getTiming().duration)) };
});

// True once no card slide (Web Animations API, constructor "Animation") is running. CSS
// animations (constructor "CSSAnimation": the pulsing pile outline, the thinking dots)
// loop forever on purpose, so they are left out.
const slidesDone = () => document.getAnimations().every(a => a.constructor.name !== 'Animation');

(async () => {
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();

  for (const reduced of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1150 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    page.on('pageerror', e => errors.push((reduced ? 'reduced: ' : 'normal: ') + e.message));
    await page.goto(GAME_URL);
    await page.evaluate(() => newGame(3));   // a full table, as these checks expect (the page starts with 1 CPU)
    await noCpuClose(page);
    await page.click('#settings-btn');
    await page.selectOption('#cpu-speed', 'fast');
    const tag = reduced ? 'REDUCED' : 'NORMAL';

    // 1. dealing: start a new game and look straight away
    await page.click('#new-game');
    const deal = await running(page);
    if (reduced) check(deal.count === 0, tag + ' deal: no card animations');
    else check(deal.count === 28 && deal.longest <= 300, tag + ' deal: 28 cards animated, each <= 300 ms (' + deal.count + ', ' + deal.longest + ' ms)');

    // 2. drawing: wait for the dealing to end, then take a card from the draw pile
    await page.waitForFunction(slidesDone, null, { timeout: 5000 });
    await page.click('#draw-pile .card');
    const draw = await running(page);
    if (reduced) check(draw.count === 0, tag + ' draw: no card animations');
    else check(draw.count === 1 && draw.longest <= 300, tag + ' draw: your new card slides in (' + draw.count + ', ' + draw.longest + ' ms)');

    // 3. discarding: tap a card; the new top of the discard pile slides from where it was
    await page.waitForFunction(slidesDone, null, { timeout: 5000 });
    await page.locator('#hand-0 .card').nth(2).click();
    const disc = await running(page);
    if (reduced) check(disc.count === 0, tag + ' discard: no card animations');
    else check(disc.count >= 1 && disc.longest <= 300, tag + ' discard: discard pile card slides (' + disc.count + ', ' + disc.longest + ' ms)');

    // 4. hover lift (transition, not an animation): a card rises under the mouse unless motion is reduced
    await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 15000 });
    const card = page.locator('#hand-0 .card').nth(3);
    const y0 = (await card.boundingBox()).y;
    await card.hover();
    await page.waitForTimeout(300);
    const y1 = (await card.boundingBox()).y;
    if (reduced) check(y1 === y0, tag + ' hover: card stays put (' + y0 + ' -> ' + y1 + ')');
    else check(y1 < y0, tag + ' hover: card lifts (' + y0 + ' -> ' + y1 + ')');
    await page.close();
  }

  await browser.close();
  finish();
})();
