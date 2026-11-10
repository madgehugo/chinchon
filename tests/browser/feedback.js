// Browser test: the feedback sheet (needs Playwright, and `cd server && npm install`; see README).
// Starts the game server on a free port with a stand-in for GitHub, opens the game from it at
// phone width, and sends a bug report from Settings and an idea from Help, in both languages.
const { chromium } = require('playwright');
const { OUT, makeChecker } = require('./helpers');
let startServer, feedbackModule;
try {
  // The stand-in goes in before server.js loads (it calls feedback.forward; see server/test.js)
  feedbackModule = require('../../server/feedback');
  ({ startServer } = require('../../server/server'));
} catch (err) {
  console.error('The server is not installed: run  cd server && npm install  first.');
  process.exit(1);
}
const forwarded = [];
let forwardFails = false;
feedbackModule.forward = async (report) => {
  if (forwardFails) throw new Error('GitHub is down (test)');
  forwarded.push(report);
};

(async () => {
  const server = await startServer(0);
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  // (a failed connection on purpose, at the end, logs an error of its own: that one is expected)
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('WebSocket')) errors.push(`console: ${m.text()}`); });
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const tr = (key) => page.evaluate(k => t(k), key);

  await page.goto(`http://localhost:${server.port}/`);

  // ---- From Settings: a bug report, with its details ----
  await page.click('#settings-btn');
  check(await page.isVisible('#feedback-open'), 'Settings offers "Report a bug or send an idea"');
  await page.click('#feedback-open');
  check(await page.isVisible('#feedback-sheet') && !(await page.isVisible('#settings-sheet')), 'the feedback sheet opens in place of Settings');
  check(await page.isDisabled('#feedback-send'), 'Send waits for a message');
  check(await page.inputValue('#feedback-kind') === 'bug' && await page.isVisible('#feedback-details-box'),
        'a bug report says what else it sends...');
  await page.click('#feedback-details-box summary');
  const shown = await page.textContent('#feedback-details');
  check(shown.includes('lang: en') && shown.includes('round: ') && shown.includes('userAgent: '), '...and lists it when opened');

  // Keys typed in the box are text, not moves (D would draw from the pile)
  const handBefore = await page.evaluate(() => state.hands[0].length);
  await page.click('#feedback-text');
  await page.keyboard.type('Dragged a card and it disappeared');
  check(await page.inputValue('#feedback-text') === 'Dragged a card and it disappeared' &&
        await page.evaluate(() => state.hands[0].length) === handBefore, 'typing in the box plays no moves');
  check(await page.textContent('#feedback-count') === '33 / 1000', 'the count follows the text');
  await page.fill('#feedback-contact', 'player@example.com');
  check(await noOverflow(), 'the sheet fits at 390px');
  await page.screenshot({ path: `${OUT}/feedback-en-390.png` });
  await page.click('#feedback-send');
  await page.waitForFunction(() => online.feedback.status === 'sent');
  check(await page.textContent('#feedback-status') === await tr('fb.thanks'), 'sent: the sheet says thank you');
  check(forwarded.length === 1 && forwarded[0].kind === 'bug' && forwarded[0].contact === 'player@example.com' &&
        forwarded[0].details.lang === 'en' && forwarded[0].details.online === false, '...and the server passed it on, with its details');
  check(await page.inputValue('#feedback-text') === '' && await page.isDisabled('#feedback-send'), '...and the form is empty again');
  await page.waitForFunction(() => online.connection === 'off');
  check(true, 'the connection opened for the report is closed again');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#feedback-sheet')), 'Escape closes the sheet');

  // ---- From Help, in Spanish: an idea (no details), and a failure keeps the text ----
  await page.evaluate(() => setLanguage('es'));
  await page.click('#help-btn');
  await page.click('#help-feedback');
  check(await page.isVisible('#feedback-sheet') && !(await page.isVisible('#help')), 'Help opens the sheet too, in place of itself');
  check(await page.textContent('#feedback-status') === '' || !(await page.isVisible('#feedback-status')), 'it starts fresh');
  await page.selectOption('#feedback-kind', 'idea');
  check(!(await page.isVisible('#feedback-details-box')), 'an idea sends no details');
  await page.fill('#feedback-text', 'Más barajas, por favor');
  check(await noOverflow(), 'the sheet fits at 390px (Spanish)');
  await page.waitForTimeout(500);                // (the sheet's slide-in, for the screenshot)
  await page.screenshot({ path: `${OUT}/feedback-es-390.png` });
  forwardFails = true;
  await page.click('#feedback-send');
  await page.waitForFunction(() => online.feedback.status === 'failed');
  check(await page.textContent('#feedback-error') === await tr('feedback.err.failed') &&
        await page.inputValue('#feedback-text') === 'Más barajas, por favor', 'not delivered: it says so and keeps the text');
  forwardFails = false;
  await page.click('#feedback-send');
  await page.waitForFunction(() => online.feedback.status === 'sent');
  check(forwarded.length === 2 && forwarded[1].kind === 'idea' && Object.keys(forwarded[1].details).length === 0, '...and trying again works');

  // ---- No server: the report fails and the text stays ----
  await page.waitForFunction(() => online.connection === 'off');
  await server.close();
  await page.fill('#feedback-text', 'Otra idea');
  await page.click('#feedback-send');
  await page.waitForFunction(() => online.feedback.status === 'failed', null, { timeout: 10000 });
  check(await page.textContent('#feedback-error') === await tr('online.err.noServer') && await page.inputValue('#feedback-text') === 'Otra idea',
        'with the server unreachable: it says so and keeps the text');

  await browser.close();
  finish();
})();
