"use strict";

/* =========================================================
   tools/make_icons.js: draw the app icons (PNG) from icon.svg
   ---------------------------------------------------------
   Usage:  node tools/make_icons.js
   Phones want PNG icons at fixed sizes for the home screen (iOS does not
   accept SVG there), so this opens icon.svg in a headless browser at each
   size and takes a screenshot. It writes:
     * icons/ : the installable web app's icons (manifest and apple-touch-icon);
     * the store apps' icons and launch screens inside app/ios and app/android,
       when those folders exist. Their file names and sizes come from the
       placeholder images Capacitor put there, so each one is redrawn at the
       size it already has.
   Run it again after changing icon.svg, and commit the PNGs. Needs Playwright
   (npm install).
   ========================================================= */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
// File name in icons/ and its size in pixels (square). The manifest lists the first three;
// index.html's apple-touch-icon is the iOS one. The maskable icon is the same picture:
// icon.svg already keeps the cards inside the safe zone that masks never cut.
const ICONS = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
];
const IOS_ASSETS = path.join(ROOT, "app", "ios", "App", "App", "Assets.xcassets");   // iOS icon and launch screen
const ANDROID_RES = path.join(ROOT, "app", "android", "app", "src", "main", "res");   // Android images, one folder per screen density
const LAUNCH_COLOUR = "#08170e";   // launch screen background: the page's dark felt (body background in style.css)
const LAUNCH_CARDS = 0.45;         // width of the cards picture on the launch screen, as a share of the shorter side
// Android's adaptive icon: the phone shows the middle 72 of the image's 108 units (and cuts
// its own shape out of that), so the cards are drawn at 72/108 of the size they have in icon.svg.
const ADAPTIVE_SHARE = 72 / 108;

// How each picture is drawn. The page is the SVG inline with no margin; `felt: false`
// hides the felt square (the first <rect> directly inside the <svg>), leaving only the cards.
const STYLES = {
  full:       { felt: true },                                     // the icon as it is, a full square
  round:      { felt: true, round: true },                        // cut into a circle (Android's round icon)
  foreground: { felt: false, share: ADAPTIVE_SHARE },             // cards on transparent (Android's adaptive icon)
  launch:     { felt: false, share: LAUNCH_CARDS, background: LAUNCH_COLOUR },
};

// Width and height of a PNG: they are stored at bytes 16-23 of the file
function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

// Every file in a folder and the folders inside it (like Python's os.walk)
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

// The store apps' images: [file, style]. The sizes are read from the files themselves.
function nativeImages() {
  const kind = name =>
    name.startsWith("ic_launcher_foreground") ? "foreground" :
    name.startsWith("ic_launcher_round") ? "round" :
    name.startsWith("ic_launcher") || name.startsWith("AppIcon") ? "full" :
    name.startsWith("splash") ? "launch" : null;
  return [...walk(IOS_ASSETS), ...walk(ANDROID_RES)]
    .filter(f => f.endsWith(".png") && kind(path.basename(f)))
    .map(f => [f, kind(path.basename(f))]);
}

(async () => {
  const svg = fs.readFileSync(path.join(ROOT, "icon.svg"), "utf8");
  fs.mkdirSync(path.join(ROOT, "icons"), { recursive: true });
  const jobs = [
    ...ICONS.map(([name, size]) => [path.join(ROOT, "icons", name), "full", size, size]),
    ...nativeImages().map(([file, style]) => [file, style, ...pngSize(file)]),
  ];
  const browser = await chromium.launch();
  for (const [file, styleName, width, height] of jobs) {
    const s = STYLES[styleName];
    const side = Math.round(Math.min(width, height) * (s.share || 1));   // size of the SVG on the page
    const page = await browser.newPage({ viewport: { width, height } });
    // A flex box centres the SVG; anything outside it is the background (transparent if none)
    await page.setContent(`<style>
      html, body { margin: 0; height: 100%; background: ${s.background || "transparent"}; }
      body { display: flex; align-items: center; justify-content: center; }
      svg { display: block; width: ${side}px; height: ${side}px; ${s.round ? "border-radius: 50%;" : ""} }
      ${s.felt ? "" : "svg > rect { display: none; }"}
    </style>${svg}`);
    // omitBackground: keep the transparent parts transparent instead of white
    await page.screenshot({ path: file, omitBackground: !s.background });
    await page.close();
    console.log(`wrote ${path.relative(ROOT, file)} (${width}x${height}, ${styleName})`);
  }
  await browser.close();
})();
