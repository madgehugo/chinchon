"use strict";

/* =========================================================
   tools/make_icons.js: draw the app icons (PNG) from icon.svg
   ---------------------------------------------------------
   Usage:  node tools/make_icons.js
   Phones want PNG icons at fixed sizes for the home screen (iOS does not
   accept SVG there), so this opens icon.svg in a headless browser at each
   size and takes a screenshot into icons/. Run it again after changing
   icon.svg, and commit the PNGs. Needs Playwright (npm install).
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

(async () => {
  const svg = fs.readFileSync(path.join(ROOT, "icon.svg"), "utf8");
  fs.mkdirSync(path.join(ROOT, "icons"), { recursive: true });
  const browser = await chromium.launch();
  for (const [name, size] of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    // The SVG inline in a page with no margin, stretched to the whole viewport
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: path.join(ROOT, "icons", name) });
    await page.close();
    console.log(`wrote icons/${name} (${size}x${size})`);
  }
  await browser.close();
})();
