// Browser test: choosing 1, 2 or 3 CPUs (needs Playwright; see README)
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const url = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const OUT = process.argv[2] || os.tmpdir();      // screenshots go here

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [label, viewport] of [['desktop', { width: 1000, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(label + ': ' + e.message));
    await page.goto(url);
    await page.selectOption('#cpu-speed', 'fast');
    for (const cpus of [1, 2, 3]) {
      await page.selectOption('#cpu-count', String(cpus));   // asks first once a game is under way
      if (await page.locator('#deck-confirm').isVisible()) await page.click('#deck-yes');
      // let the CPUs play until it is your turn (or the round ends)
      await page.waitForFunction(() => state.currentPlayer === 0 || state.phase === 'roundOver', null, { timeout: 15000 });
      const info = await page.evaluate(() => ({
        players: state.numPlayers,
        shownSeats: [...document.querySelectorAll('.seat')].filter(s => !s.hidden).length,
        hands: state.hands.length,
        scoreRows: document.querySelectorAll('#scoreboard tr').length - 1,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        dealt: state.hands.every(h => h.length >= 7),
      }));
      const ok = info.players === cpus + 1 && info.shownSeats === cpus + 1 && info.hands === cpus + 1 &&
                 info.scoreRows === cpus + 1 && !info.overflow && info.dealt;
      console.log(label.toUpperCase(), cpus, 'CPU(s):', JSON.stringify(info), ok ? 'ok' : 'FAIL');
      if (!ok) errors.push(`${label} ${cpus} cpus`);
      await page.screenshot({ path: path.join(OUT, `cpus-${label}-${cpus}.png`) });
    }
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'ERRORS: none');
  process.exit(errors.length ? 1 : 0);
})();
