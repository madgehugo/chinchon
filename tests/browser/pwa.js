// Browser test: installable app and offline play (needs Playwright; see README)
// Service workers do not run on file://, so unlike the other tests this one serves the
// game from a small web server on localhost (Node's built-in http module).
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const { makeChecker } = require('./helpers');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.webmanifest': 'application/manifest+json' };   // Content-Type by extension

// Width and height of a PNG: they are stored at bytes 16-23 of the file
function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

(async () => {
  const { errors, check, finish } = makeChecker();

  // 1. The manifest and its icons
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check(manifest.display === 'standalone' && manifest.start_url === './', 'manifest: full-screen app starting at ./');
  for (const icon of manifest.icons) {
    const file = path.join(ROOT, icon.src);
    check(fs.existsSync(file) && pngSize(file) === icon.sizes, `manifest icon ${icon.src} exists at ${icon.sizes}`);
  }
  check(manifest.icons.some(i => i.purpose === 'maskable'), 'manifest has a maskable icon');
  check(pngSize(path.join(ROOT, 'icons', 'apple-touch-icon.png')) === '180x180', 'iOS icon is 180x180');

  // 2. Everything index.html loads is in the service worker's list, and every listed file exists.
  // (The list is read out of sw.js and evaluated, since sw.js cannot be require()d.)
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const appFiles = vm.runInNewContext(sw.match(/const APP_FILES = (\[[\s\S]*?\]);/)[1]);
  const loaded = [...html.matchAll(/<(?:link [^>]*href|script src)="([^"]+)"/g)].map(m => m[1]);
  const missing = loaded.filter(f => !appFiles.includes(f));
  check(missing.length === 0, `every file index.html loads is in APP_FILES in sw.js${missing.length ? ' (missing: ' + missing + ')' : ''}`);
  const absent = appFiles.filter(f => f !== './' && !fs.existsSync(path.join(ROOT, f)));
  check(absent.length === 0, `every file in APP_FILES exists${absent.length ? ' (absent: ' + absent + ')' : ''}`);

  // 3. Served over http: the service worker installs, then the game opens with the server gone
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html');
    const file = path.join(ROOT, path.normalize(name));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, 'localhost', resolve));   // port 0 = any free port
  const url = `http://localhost:${server.address().port}/`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  check(true, 'the service worker installed and controls the page');
  const linked = await page.evaluate(() => document.querySelector('link[rel="manifest"]').href);
  check(linked === url + 'manifest.webmanifest', 'the page links the manifest');

  // Offline: stop the server (and drop its open connections), then open the game again
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await context.setOffline(true);
  await page.reload();
  check((await page.locator('#hand-0 .card').count()) >= 7, 'the game opens offline');
  check(await page.evaluate(() => typeof runSelfTests === 'function' && document.getElementById('topbar') !== null),
        'all scripts and the page came from the offline copy');

  await browser.close();
  finish();
})();
