// Browser test: English/Spanish switch (needs Playwright; see README)
// Checks <html lang>, static and dynamic text, live re-rendering of stored messages, the
// remembered choice, the default from the browser language, and no overflow at phone width.
const { chromium } = require('playwright');
const path = require('path');
const { GAME_URL, OUT, makeChecker, cpu1Closes } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const { errors, check, finish } = makeChecker();

  // Browser language Spanish -> the game starts in Spanish
  const ctx = await browser.newContext({ locale: 'es-MX', reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(GAME_URL);
  const text = sel => page.locator(sel).innerText();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

  check(await page.evaluate(() => document.documentElement.lang) === 'es', 'default from navigator.language: <html lang="es">');
  check((await text('#sort-btn')) === 'Ordenar mano', 'static button text in Spanish');
  check((await text('#status')).startsWith('Tu turno'), 'status line in Spanish');
  check(!(await overflow()), 'no horizontal overflow (Spanish, 390px)');
  await page.screenshot({ path: path.join(OUT, 'lang-es-390.png') });

  // The status line was written in Spanish; switching must rewrite it, not just the buttons
  await page.selectOption('#lang', 'en');
  check(await page.evaluate(() => document.documentElement.lang) === 'en', '<html lang> follows the dropdown');
  check((await text('#status')).startsWith('Your turn'), 'stored status message re-rendered in English');
  check((await text('#sort-btn')) === 'Sort hand', 'static button text in English');
  check((await page.title()) === 'Chinchón', 'document title');
  check(!(await overflow()), 'no horizontal overflow (English, 390px)');
  await page.screenshot({ path: path.join(OUT, 'lang-en-390.png') });

  // The choice is remembered across a reload (it beats the browser language)
  await page.reload();
  check(await page.evaluate(() => document.documentElement.lang) === 'en', 'saved choice wins after reload');

  // End a round and check the results panel and its notice follow the language
  await page.evaluate(() => {
    newGame(3);   // a full table, as the totals below expect (the page starts with 1 CPU)
    state.totals = [99, 10, 20, 30];
  });
  await cpu1Closes(page);
  check((await text('#results-title')) === 'Round 1: CPU 1 closed the round', 'results title (English)');
  check((await text('#results-notice')).startsWith('You are out of the game. Re-enter with'), 'results notice (English)');
  await page.screenshot({ path: path.join(OUT, 'lang-results-en-390.png') });
  await page.selectOption('#lang', 'es');
  check((await text('#results-title')) === 'Ronda 1: CPU 1 cerró la ronda', 'results title switches to Spanish');
  check((await text('#results-notice')).startsWith('Estás eliminado. ¿Volver a entrar con'), 'results notice switches to Spanish');
  check((await text('#res-reenter')) === 'Volver a entrar', 'results buttons switch');
  check(!(await overflow()), 'no horizontal overflow (results, Spanish, 390px)');
  await page.screenshot({ path: path.join(OUT, 'lang-results-es-390.png') });

  // Settings panel and hints in Spanish at phone width
  await page.click('#res-hide');
  await page.click('#settings-btn');
  await page.click('#hints-btn');
  check(!(await overflow()), 'no horizontal overflow (settings + hints, Spanish, 390px)');
  check((await text('#analysis')).includes('Análisis de tu mano'), 'hints panel in Spanish');
  await page.screenshot({ path: path.join(OUT, 'lang-settings-es-390.png') });
  await ctx.close();

  // An unsupported browser language falls back to English
  const ctx2 = await browser.newContext({ locale: 'fr-FR' });
  const page2 = await ctx2.newPage();
  await page2.goto(GAME_URL);
  check(await page2.evaluate(() => document.documentElement.lang) === 'en', 'unsupported language falls back to English');
  await browser.close();
  finish();
})();
