// Browser test: two people play online (needs Playwright, and `cd server && npm install`; see README).
// Starts the game server on a free port, then opens the game from it in two separate browsers:
// Ana in English and Luis in Spanish, at phone width. Ana creates a room, Luis joins it from the
// shared link, they play a few turns, Luis reloads and gets his seat back, and Ana leaves.
process.env.CPU_DELAY_MS = '60';                 // quick CPUs (read by server/room.js)
const { chromium } = require('playwright');
const { OUT, makeChecker } = require('./helpers');
let startServer;
try { ({ startServer } = require('../../server/server')); } catch (err) {
  console.error('The server is not installed: run  cd server && npm install  first.');
  process.exit(1);
}

(async () => {
  const server = await startServer(0);
  const url = `http://localhost:${server.port}/`;
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();

  // One player: a separate browser context (its own localStorage, like another phone)
  async function player(locale) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${locale}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${locale} console: ${m.text()}`); });
    return page;
  }
  const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const seatText = (page, p) => page.locator(`#seat-${p} .seat-who`).textContent();

  const ana = await player('en-GB');
  const luis = await player('es-ES');

  // ---- On a wide screen the top bar has "Play with friends"; a phone does not ----
  await ana.setViewportSize({ width: 1280, height: 800 });
  await ana.goto(url);
  check(await ana.isVisible('#settings-btn'), 'the game loads from the server');
  check(await ana.isVisible('#online-top'), 'a wide screen shows "Play with friends" in the top bar');
  check(await ana.evaluate(() => { const bar = document.getElementById('topbar'); return bar.scrollWidth <= bar.clientWidth; }),
        '...and the top bar still fits');
  await ana.click('#online-top');
  check(await ana.isVisible('#online-sheet'), '...which opens the online sheet');
  await ana.click('#online-close');
  await ana.setViewportSize({ width: 390, height: 844 });
  check(!(await ana.isVisible('#online-top')), 'a phone has no such button (Settings has it)');

  // ---- Ana creates a room from Settings ----
  await ana.click('#settings-btn');
  check(await ana.isVisible('#online-open'), 'Settings offers "Play online" (a server is there)');
  await ana.click('#online-open');
  check(await ana.isVisible('#online-sheet') && !(await ana.isVisible('#settings-sheet')), 'the online sheet opens in place of Settings');
  await ana.click('#online-create');
  check(await ana.textContent('#online-error') === await ana.evaluate(() => t('online.err.badName')), 'no name: asks for one');
  await ana.fill('#online-name', 'Ana');
  check(await ana.inputValue('#online-deck-size') === await ana.inputValue('#deck-size') && await ana.inputValue('#online-layoff') === 'auto',
        "the create form's rules start as Ana's own Settings");
  await ana.selectOption('#online-deck-size', '48');   // a rule for this room only
  await ana.selectOption('#online-round-limit', '10');
  await ana.click('#online-create');
  await ana.waitForFunction(() => online.code && online.lobby);
  const code = await ana.evaluate(() => online.code);
  check(/^[A-Z2-9]{4}$/.test(code), `a room code (${code})`);
  check(await ana.isVisible('#online-startgame') && await ana.isVisible('#online-chip'), 'the host sees Start, and the room chip shows');
  await ana.screenshot({ path: `${OUT}/online-lobby-en-390.png` });
  await ana.setViewportSize({ width: 1280, height: 800 });
  check(!(await ana.isVisible('#online-top')) && await ana.isVisible('#online-chip'), 'in a room, the chip takes the button\'s place');
  await ana.setViewportSize({ width: 390, height: 844 });

  // ---- Luis opens the shared link ----
  await luis.goto(`${url}?room=${code}`);
  check(await luis.isVisible('#online-sheet'), 'a shared link opens the join form');
  check(await luis.inputValue('#online-code') === code, '...with the code filled in');
  check(await noOverflow(luis), 'the join form fits at 390px (Spanish)');
  await luis.screenshot({ path: `${OUT}/online-join-es-390.png` });
  await luis.fill('#online-name', 'Luis');
  await luis.click('#online-join');
  await ana.waitForFunction(() => online.lobby && online.lobby.people.length === 2);
  await luis.waitForFunction(() => online.lobby && online.lobby.people.length === 2);
  check(!(await luis.isVisible('#online-startgame')), 'only the host can start');
  check((await luis.textContent('#online-wait')).includes('Ana'), 'Luis is told who will start the game');
  check((await luis.textContent('#online-rules')).includes('48 cartas') && (await luis.textContent('#online-rules')).includes('10'),
        'the room has the rules Ana chose in the form');
  check(await ana.inputValue('#deck-size') === '40', "...which did not change Ana's own Settings");
  check(await luis.locator('#online-rules dd').count() === 7 && (await luis.textContent('#online-rules')).includes('Sin límite'),
        "the lobby lists the room's rules, in Luis's language (time per turn: no limit by default)");
  check(await ana.locator('#online-people button').count() === 2 && await luis.locator('#online-people button').count() === 0,
        'the host gets Make host and Remove by the other player; Luis gets no buttons');
  check(await ana.isVisible('#online-seats-row') && !(await luis.isVisible('#online-seats-row')), 'only the host can change the seats');
  check(await ana.isVisible('#online-change-rules') && !(await luis.isVisible('#online-change-rules')), '...and the rules');
  await ana.click('#online-change-rules');
  check(await ana.inputValue('#room-round-limit') === '10' && await ana.inputValue('#room-deck-size') === '48',
        "the host's form starts at the room's rules");
  await ana.selectOption('#room-reshuffles', '3');
  await ana.click('#online-rules-send');
  await luis.waitForFunction(() => online.lobby.settings.maxReshuffles === 3);
  check(!(await luis.isVisible('#online-rules-ask')) && !(await ana.isVisible('#online-rules-form')),
        'before the first game, the new rules are the room\'s at once (nobody is asked)');
  check(await noOverflow(ana), "the host's lobby fits at 390px");
  await ana.screenshot({ path: `${OUT}/online-host-en-390.png` });
  check(await noOverflow(luis), 'the online sheet fits at 390px (Spanish)');
  await luis.screenshot({ path: `${OUT}/online-lobby-es-390.png` });

  // ---- Start: each sees the table from their own seat ----
  await ana.click('#online-startgame');
  await ana.waitForFunction(() => online.playing);
  await luis.waitForFunction(() => online.playing);
  check(!(await ana.isVisible('#online-sheet')), 'the sheet makes way for the table');
  check(await seatText(ana, 0) === 'You' && await seatText(ana, 1) === 'Luis', 'Ana: You at the bottom, Luis next');
  check(await seatText(luis, 0) === 'Tú' && await seatText(luis, 3) === 'Ana', 'Luis: Tú at the bottom, Ana before him');
  check(await ana.locator('#hand-1 .card.back').count() === 7 && await ana.locator('#hand-1 .card:not(.back)').count() === 0,
        "Ana cannot see Luis's cards");
  check(await ana.evaluate(() => state.hands[1].every(card => card.hidden)), '...and neither does her page: they never arrived');
  check(await ana.isDisabled('#deck-size') && await ana.isDisabled('#new-game') && !(await ana.isDisabled('#lang')),
        "the room's rules are locked in Settings; the language is not");

  // ---- A few turns each ----
  // Whoever's turn it is draws and taps a card to discard (the CPUs play in between)
  async function playTurn(page) {
    await page.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw' && online.connection === 'open', null, { timeout: 20000 });
    await page.click('#draw-pile');
    await page.waitForFunction(() => state.phase === 'discard' && state.hands[0].length === 8);
    await page.locator('#hand-0 .card').nth(0).click();
    await page.waitForFunction(() => state.currentPlayer !== 0 || state.phase === 'roundOver');
  }
  const stopClosing = () => {   // no CPU closes, so the round lasts (the server's CPUs are in the server)
    for (const room of server.rooms.values()) for (const s of Object.values(room.game.STRATEGIES)) s.chooseClose = () => null;
  };
  stopClosing();
  for (let i = 0; i < 2; i++) { await playTurn(ana); await playTurn(luis); }
  check(await ana.evaluate(() => state.turns) >= 6, 'two turns each, with the CPUs in between');
  const anaToast = await ana.evaluate(() => document.querySelector('#toasts .toast')?.textContent || '');
  check(await ana.evaluate(() => state.discardPile.length) === await luis.evaluate(() => state.discardPile.length),
        'both see the same discard pile');
  check(anaToast === '' || !anaToast.includes('You'), 'toasts are about the other players');
  check(await noOverflow(ana) && await noOverflow(luis), 'the online table fits at 390px in both languages');
  await ana.screenshot({ path: `${OUT}/online-table-en-390.png` });
  await luis.screenshot({ path: `${OUT}/online-table-es-390.png` });

  // ---- A reaction: Ana sends one, Luis sees it by her seat ----
  await ana.click('#react-btn');
  check(await ana.isVisible('#react-picker'), 'the smiley button opens the row of emoji');
  check(await noOverflow(ana), '...which fits at 390px');
  await ana.screenshot({ path: `${OUT}/online-react-en-390.png` });
  await ana.locator('#react-picker button').nth(1).click();
  await luis.waitForSelector('#seat-3 .reaction', { timeout: 3000 });
  await luis.waitForTimeout(400);                // (the pop-up animation, for the screenshot)
  await luis.screenshot({ path: `${OUT}/online-reaction-es-390.png` });
  check(await luis.textContent('#seat-3 .reaction') === await luis.evaluate(() => REACTIONS[1]), "Luis sees Ana's reaction by her seat");
  check(!(await ana.isVisible('#react-picker')), '...and Ana\'s row of emoji closes');

  // ---- Pausing: Ana asks in the room panel, Luis agrees under the table, Ana resumes ----
  await ana.click('#online-chip');
  await ana.click('#online-pause');
  check(!(await ana.isVisible('#online-sheet')), 'asking to pause closes the room panel...');
  await ana.waitForSelector('#pause-bar', { state: 'visible' });
  check(!(await ana.isVisible('#pause-yes')) && await ana.isVisible('#pause-no'), '...and Ana waits for the others (and may take it back)');
  await luis.waitForSelector('#pause-bar', { state: 'visible' });
  check((await luis.textContent('#pause-text')).includes('Ana') && await luis.isVisible('#pause-yes'), 'Luis is asked whether to pause');
  check(await noOverflow(luis), '...in a bar that fits at 390px');
  await luis.screenshot({ path: `${OUT}/online-pause-ask-es-390.png` });
  await luis.click('#pause-yes');
  await ana.waitForFunction(() => onlinePaused());
  await luis.waitForFunction(() => onlinePaused());
  check(await ana.isVisible('#pause-resume') && await luis.isVisible('#pause-resume'), 'once he agrees, both see the game paused, with Resume');
  const pausedTurns = await ana.evaluate(() => state.turns);
  await ana.waitForTimeout(1000);
  check(await ana.evaluate(() => state.turns) === pausedTurns, '...and nobody moves, CPUs included');
  await ana.screenshot({ path: `${OUT}/online-paused-en-390.png` });
  await ana.click('#pause-resume');
  await ana.waitForFunction(() => !onlinePaused());
  await luis.waitForFunction(() => !onlinePaused());
  check(!(await ana.isVisible('#pause-bar')) && !(await luis.isVisible('#pause-bar')), 'Resume goes on with the game for both');

  // ---- New rules during the game: Ana asks, Luis agrees under the table, a new game starts ----
  const dealsBeforeRules = await ana.evaluate(() => state.deals);
  await ana.click('#online-chip');
  await ana.click('#online-change-rules');
  await ana.selectOption('#room-round-limit', '5');
  check(await noOverflow(ana), "the host's form for new rules fits at 390px");
  await ana.waitForTimeout(400);                 // (the panel slides in, for the screenshot)
  await ana.locator('#online-rules-send').scrollIntoViewIfNeeded();
  await ana.screenshot({ path: `${OUT}/online-rules-form-en-390.png` });
  await ana.click('#online-rules-send');
  check(!(await ana.isVisible('#online-sheet')), 'asking for new rules closes the room panel...');
  await ana.waitForSelector('#rules-bar', { state: 'visible' });
  check(await ana.locator('#rules-bar button').count() === 1, '...and Ana waits for the others (and may take it back)');
  await luis.waitForSelector('#rules-bar', { state: 'visible' });
  const rulesText = await luis.textContent('#rules-bar');
  check(rulesText.includes('Ana') && rulesText.includes('10 → 5') && await luis.locator('#rules-bar li').count() === 1,
        'Luis is asked, and sees only what would change');
  check(await noOverflow(luis), '...in a bar that fits at 390px');
  await luis.screenshot({ path: `${OUT}/online-rules-ask-es-390.png` });
  await luis.locator('#rules-bar button').first().click();
  await ana.waitForFunction(d => state.deals > d && state.round === 1 && state.roundLimit === 5, dealsBeforeRules);
  await luis.waitForFunction(() => state.roundLimit === 5 && !online.lobby.rulesAsk);
  check(!(await ana.isVisible('#rules-bar')) && !(await luis.isVisible('#rules-bar')),
        'once he agrees, a new game starts with the new rules for both');

  // ---- Luis's time runs out (done by the server here): a bar gives him his seat back ----
  const room = [...server.rooms.values()][0];
  room.game.seatAway(1);
  await luis.waitForSelector('#away-bar', { state: 'visible' });
  await luis.click('#away-back');
  await luis.waitForFunction(() => state.seats[0] === 'human');
  check(!(await luis.isVisible('#away-bar')), '"I\'m back" gives Luis his seat back');

  // ---- Luis reloads: same seat, same hand ----
  const hand = await luis.evaluate(() => state.hands[0].map(cardKey).sort().join(' '));
  await luis.reload();
  await luis.waitForFunction(() => online.playing && online.connection === 'open');
  check(await luis.evaluate(() => state.hands[0].map(cardKey).sort().join(' ')) === hand, 'after a reload: back in the seat, same hand');
  check(await seatText(luis, 3) === 'Ana', '...with the table the same way round');

  // ---- End of a round: Next round waits for both ----
  await ana.waitForFunction(() => state.currentPlayer === 0 && state.phase === 'draw', null, { timeout: 20000 });
  await ana.click('#draw-pile');
  await ana.waitForFunction(() => state.phase === 'discard');
  room.game.closeRound(0, 0);                    // (the server closes for Ana: no need for a real close here)
  await ana.waitForSelector('#res-next', { state: 'visible' });
  await luis.waitForSelector('#res-next', { state: 'visible' });
  const deals = await ana.evaluate(() => state.deals);
  await ana.click('#res-next');
  await ana.waitForFunction(() => state.ready[0]);
  check((await ana.textContent('#res-next')).includes('Luis') && await ana.isDisabled('#res-next'), 'Ana is told the round waits for Luis');
  await ana.screenshot({ path: `${OUT}/online-waiting-en-390.png` });
  await luis.click('#res-next');
  await ana.waitForFunction(d => state.deals === d + 1, deals);
  check(true, '...and it starts once he presses it too');

  // ---- Ana leaves: back to her own game; Luis sees her seat played by the CPU ----
  await ana.click('#online-chip');
  await ana.click('#online-leave');
  await ana.waitForFunction(() => !online.playing && !online.code);
  check(await ana.evaluate(() => state.seats.every((s, p) => s === (p === 0 ? 'human' : 'cpu')) && state.names.every(n => n === null)),
        'leaving: Ana is back at her own game on this device');
  check(!(await ana.isDisabled('#deck-size')), '...with her settings unlocked');
  await luis.waitForFunction(() => state.seats[3] === 'away');
  check((await luis.locator('#seat-3 .seat-level').textContent()).includes('CPU'), "Luis sees Ana's seat played by the CPU");

  await browser.close();
  await server.close();
  finish();
})();
