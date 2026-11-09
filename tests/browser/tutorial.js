// Browser test: the tutorial (tutorial.js) — the first-visit offer, the fixed deal, the coach
// refusing other moves, a whole guided round, and getting your own game back (needs Playwright; see README)
const { chromium } = require('playwright');
const { GAME_URL, OUT, makeChecker } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();
  const sizes = [['desktop', { width: 1000, height: 900 }], ['phone', { width: 390, height: 844 }]];
  const langs = ['en', 'es'];

  for (const [i, [size, viewport]] of sizes.entries()) {
    const lang = langs[i];                                      // English on the desktop, Spanish on the phone
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push('console: ' + m.text()); });
    const label = text => `${size}: ${text}`;
    const shot = name => page.screenshot({ path: `${OUT}/tutorial-${size}-${lang}-${name}.png` });
    const step = () => page.evaluate(() => TUTORIAL_STEPS[tutorial.step].text);
    const handKeys = player => page.evaluate(p => state.hands[p].map(cardKey).join(' '), player);
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

    // A first visit (a new browser page has empty storage): the offer shows
    await page.goto(GAME_URL);
    await page.evaluate(l => { setLanguage(l); CPU_PAUSE.draw = 300; CPU_PAUSE.discard = 250; }, lang);
    check(await page.isVisible('#tutorial-offer'), label('the first visit offers the tutorial'));
    await shot('offer');

    // "No thanks" puts it away for good
    await page.click('#tutorial-no');
    check(!(await page.isVisible('#tutorial-offer')), label('No thanks hides the offer'));
    await page.reload();
    check(!(await page.isVisible('#tutorial-offer')), label('and it does not come back'));

    // A game of your own under way: play one turn, so there is something to come back to
    await page.evaluate(() => { CPU_PAUSE.draw = 300; CPU_PAUSE.discard = 250;
                                for (const s of Object.values(STRATEGIES)) if (s !== STRATEGIES.tutorial) s.chooseClose = () => null; });
    await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 15000 });
    await page.click('#draw-pile');
    const ownHand = await handKeys(0);
    const ownPlayers = await page.evaluate(() => state.numPlayers);

    // Start it from the Help panel
    await page.click('#help-btn');
    await page.click('#tutorial-start');
    check(await page.evaluate(() => tutorial.active && !state.showHelp), label('Help starts the tutorial and closes'));
    check(await handKeys(0) === 'b3 b4 b5 o7 c7 e12 c2', label('you are dealt the tutorial hand'));
    check(await handKeys(1) === 'o3 o5 c10 c12 e1 e4 b11', label('the CPU is dealt its hand'));
    check(await page.evaluate(() => cardKey(topDiscard()) === 'e7' && state.drawPile.length === 40 - 15),
          label('the 7 of espadas is on the discard pile'));
    check(await page.isVisible('#coach'), label('the coach shows'));
    check(await noOverflow(), label('no sideways scrolling'));
    await shot('1-welcome');

    // Steps that only explain: moves are refused until Next
    await page.click('#discard-pile');
    check(await page.evaluate(() => state.phase === 'draw' && state.hands[0].length === 7), label('a move before Next is refused'));
    await page.click('#coach-next');
    check(await page.locator('#hand-0 .card.coach-target').count() === 3, label('the run glows on the hand step'));
    await shot('2-hand');
    await page.click('#coach-next');
    check(await step() === 'tut.take', label('then: take the discard'));

    // Take the discard (the deck is refused)
    await page.click('#draw-pile');
    check(await page.evaluate(() => state.hands[0].length === 7), label('drawing from the pile is refused'));
    check(await page.evaluate(() => document.getElementById('discard-pile').classList.contains('coach-target')),
          label('the discard pile glows'));
    await shot('3-take');
    await page.click('#discard-pile');
    check(await step() === 'tut.discard', label('took the 7: now discard'));
    await shot('4-discard');

    // Discard the 12 (another card is refused)
    await page.locator('#hand-0 .card').nth(0).click();
    check(await page.evaluate(() => state.hands[0].length === 8), label('discarding another card is refused'));
    await page.locator('#hand-0 .card.coach-target').click();
    check(await step() === 'tut.cpu', label('the CPU plays'));
    await page.waitForFunction(() => tutorial.step === 5, null, { timeout: 15000 });
    check(await page.evaluate(() => cardKey(topDiscard()) === 'o11'), label('the CPU threw away the 11'));
    await shot('5-draw');

    // Draw from the pile, then close with the 2
    await page.click('#draw-pile');
    check(await handKeys(0) === 'b3 b4 b5 o7 c7 c2 e7 o1', label('you drew the 1 of oros'));
    await page.locator('#hand-0 .card').nth(0).click();
    check(await page.evaluate(() => state.hands[0].length === 8), label('a plain discard is refused before closing'));
    await shot('6-close');
    await page.click('#close-btn');
    check(await step() === 'tut.closeWith', label('closing mode: now pick the 2'));
    await page.click('#close-btn');
    check(await page.evaluate(() => state.closing), label('closing cannot be cancelled'));
    await page.locator('#hand-0 .card.coach-target').click();
    check(await page.evaluate(() => state.phase === 'roundOver' && state.roundResult.closer === 0),
          label('you closed the round'));
    check(await page.evaluate(() => state.roundPoints[0] === 1 && state.roundPoints[1] === 43),
          label('you score 1, the CPU 43 (nothing laid off)'));
    check(await step() === 'tut.results', label('the last step explains the results'));
    check(!(await page.isVisible('#res-next')) && !(await page.isVisible('#next-btn')), label('no Next round'));
    check(await page.evaluate(() => {
      const coach = document.getElementById('coach').getBoundingClientRect();
      const buttons = document.querySelector('#results .panel-buttons').getBoundingClientRect();
      return buttons.bottom <= coach.top;
    }), label('the coach does not cover the results buttons'));
    check(await noOverflow(), label('no sideways scrolling at the end'));
    await shot('7-results');

    // Back to your own game
    await page.click('#coach-end');
    check(await page.evaluate(() => !tutorial.active), label('the tutorial is over'));
    check(await handKeys(0) === ownHand && await page.evaluate(() => state.numPlayers) === ownPlayers,
          label('your own game is back'));
    check(await page.evaluate(() => state.currentPlayer === 0 && state.phase === 'discard'), label('still your turn to discard'));

    // A reload in the middle of the tutorial brings back your own game too, and Skip ends it
    await page.click('#help-btn');
    await page.click('#tutorial-start');
    await page.click('#coach-next');
    await page.click('#help-btn');
    await page.click('#tutorial-start');                     // started again: still knows your game
    check(await page.evaluate(() => tutorial.active && tutorial.step === 0 && tutorial.hadGame),
          label('starting again from Help begins at step 1'));
    await page.reload();
    check(await page.evaluate(() => !tutorial.active) && await handKeys(0) === ownHand, label('a reload brings back your game'));
    await page.click('#help-btn');
    await page.click('#tutorial-start');
    await page.click('#coach-skip');
    check(await page.evaluate(() => !tutorial.active) && await handKeys(0) === ownHand, label('Skip brings back your game'));
    await page.close();
  }

  // The offer's Start button starts it; with no game of yours under way, the end starts a new one
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(GAME_URL);
  await page.click('#tutorial-yes');
  check(await page.evaluate(() => tutorial.active && !tutorial.hadGame), 'offer: Start begins the tutorial');
  check(!(await page.isVisible('#tutorial-offer')), 'offer: the bar is gone');
  await page.click('#coach-skip');
  check(await page.evaluate(() => !tutorial.active && state.numPlayers === 2 && state.cpuLevels[1] !== 'tutorial'),
        'offer: Skip starts a game with your settings');
  check(await page.evaluate(() => localStorage.getItem('chinchon-settings') === null),
        'the tutorial saved no settings of its own');

  await browser.close();
  finish();
})();
