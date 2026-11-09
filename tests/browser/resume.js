// Browser test: the game in progress is saved and continues after a reload (needs Playwright; see README)
const { chromium } = require('playwright');
const { GAME_URL, makeChecker, noCpuClose } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(GAME_URL);

  // A reload replaces the page, so the test's changes to the CPUs must be made again each time
  const reload = async () => { await page.reload(); await noCpuClose(page); };
  const handKeys = () => page.evaluate(() => state.hands[0].map(cardKey).join(' '));
  // Card animations running in the hands (the deal animation would show here)
  const handAnimations = () => page.evaluate(() => document.getAnimations()
    .filter(a => a.effect && a.effect.target && a.effect.target.closest('[id^="hand-"]')).length);

  await page.evaluate(() => { CPU_PAUSE.draw = 450; CPU_PAUSE.discard = 350; newGame(2); });
  await noCpuClose(page);
  await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 15000 });

  // Your turn, card drawn: after a reload it is the same hand, still your discard, drawn card still marked
  await page.click('#draw-pile .card');
  const hand = await handKeys();
  const totals = await page.evaluate(() => state.totals.join(' '));
  await reload();
  check(await handKeys() === hand, 'same hand after a reload');
  check(await page.evaluate(() => state.currentPlayer === 0 && state.phase === 'discard'), 'still your turn to discard');
  check(await page.evaluate(() => state.hands[0].includes(state.lastDrawn)), 'the drawn card is the very card in your hand');
  check((await page.locator('#hand-0 .card.just-drawn').count()) === 1, 'the drawn card is still marked');
  check(await handAnimations() === 0, 'no deal animation when a game is continued');

  // Reload while a CPU is between drawing and discarding: it finishes its turn and play comes back to you
  await page.locator('#hand-0 .card').nth(0).click();
  await page.waitForFunction(() => state.currentPlayer !== 0 && state.phase === 'discard', null, { timeout: 15000 });
  await reload();
  check(await page.evaluate(() => state.currentPlayer !== 0), 'a CPU is still on the move after the reload');
  await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 15000 });
  check(await page.evaluate(() => state.hands.every(h => h.length === 7)), 'the CPUs finished their turns after the reload');

  // Round over with the results open: still open after a reload, with the same scores.
  // CPU 1 closes with the hand cpu1Closes (helpers.js) uses, but built by swapping in the
  // real cards from wherever they are: a save with a card twice would be refused.
  await page.evaluate(() => {
    const want = ['o1', 'o2', 'o3', 'c4', 'c5', 'c6', 'b2', 'e12'];
    drawCard(1, 'deck');                                   // a CPU about to discard holds 8 cards
    const places = [state.drawPile, state.discardPile, ...state.hands];
    want.forEach((key, i) => {
      const from = places.find(cards => cards.some(c => cardKey(c) === key));
      const j = from.findIndex(c => cardKey(c) === key);
      [from[j], state.hands[1][i]] = [state.hands[1][i], from[j]];   // swap the two cards
    });
    state.currentPlayer = 1; state.phase = 'discard';
    state.turns = 8;                                       // past the first lap, when closing is allowed
    closeRound(1, closeOptions(state.hands[1])[0].index);
  });
  const scored = await page.evaluate(() => state.totals.join(' '));
  check(scored !== totals, 'the round was scored');
  await reload();
  check(await page.evaluate(() => state.phase === 'roundOver' && state.showResults), 'the round is still over, results open');
  check(await page.isVisible('#results'), 'the results panel is showing');
  check(await page.evaluate(() => state.totals.join(' ')) === scored, 'same scores after a reload');
  check((await page.locator('.score-pop').count()) === 0, 'no score pop-ups replayed');

  // New game starts afresh, and the next reload continues that one
  await page.evaluate(() => newGame());
  const fresh = await handKeys();
  await reload();
  check(await page.evaluate(() => state.round === 1 && state.totals.every(t => t === 0)), 'New game started a fresh game');
  check(await handKeys() === fresh, 'and that game is the one continued');

  // A damaged save is ignored: a new game starts
  await page.evaluate(() => {
    removeEventListener('pagehide', saveGame);        // so leaving the page does not overwrite the bad save
    localStorage.setItem('chinchon-game', '{"version": 1, "hands": "nonsense"}');
  });
  await reload();
  check(await page.evaluate(() => state.round === 1 && state.hands[0].length === 7), 'a damaged save starts a new game');

  await browser.close();
  finish();
})();
