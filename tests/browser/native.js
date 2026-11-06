// Browser test: the parts of ui.js that only run inside the store app (needs Playwright; see README)
// The real app runs the game inside Capacitor's native shell, which defines window.Capacitor.
// Here a stand-in for it is put on the page before any of the game's scripts run, recording
// what the game asks of it, and the test presses Android's back button by calling the
// listener the game registered.
const { chromium } = require('playwright');
const { GAME_URL, makeChecker } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push('console: ' + m.text()); });

  // addInitScript runs this in the page before the page's own scripts, as Capacitor's bridge does
  await page.addInitScript(() => {
    window.nativeCalls = [];
    window.Capacitor = {
      getPlatform: () => 'android',
      PluginHeaders: [{ name: 'App', methods: [] }],
      addListener: (plugin, event, callback) => { nativeCalls.push(`${plugin}.addListener ${event}`); window.pressBack = callback; },
      nativeCallback: (plugin, method) => { nativeCalls.push(`${plugin}.${method}`); },
    };
  });
  await page.goto(GAME_URL);
  check(await page.evaluate(() => NATIVE_APP === true), 'the game knows it runs in the store app');
  check(await page.evaluate(() => typeof pressBack === 'function'), 'it listens for the back button');

  // Back with a panel open closes it, and the app stays open
  await page.click('#settings-btn');
  check(await page.evaluate(() => state.showSettings), 'Settings is open');
  await page.evaluate(() => pressBack());
  check(await page.evaluate(() => !state.showSettings), 'back closes Settings');
  check(await page.evaluate(() => !nativeCalls.includes('App.exitApp')), '... without leaving the app');

  // Back with nothing open saves the game and leaves
  await page.evaluate(() => localStorage.removeItem(GAME_STORAGE_KEY));
  await page.evaluate(() => pressBack());
  check(await page.evaluate(() => nativeCalls.includes('App.exitApp')), 'back with no panel open leaves the app');
  check(await page.evaluate(() => localStorage.getItem(GAME_STORAGE_KEY) !== null), '... after saving the game');
  await page.close();

  // In a plain browser none of this happens
  const plain = await browser.newPage();
  plain.on('pageerror', e => errors.push('plain: ' + e.message));
  await plain.goto(GAME_URL);
  check(await plain.evaluate(() => NATIVE_APP === false), 'in a browser the game is not the store app');

  await browser.close();
  finish();
})();
