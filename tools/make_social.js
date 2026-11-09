"use strict";

/* =========================================================
   tools/make_social.js: draw the link-preview picture (icons/social.png)
   ---------------------------------------------------------
   Usage:  node tools/make_social.js
   Opens social.html in a headless browser at 1200x630 and takes a screenshot.
   Run it again after changing social.html, and commit the PNG. Needs Playwright.
   ========================================================= */
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto("file://" + path.join(ROOT, "social.html"));
  await page.screenshot({ path: path.join(ROOT, "icons", "social.png") });
  await browser.close();
  console.log("wrote icons/social.png (1200x630)");
})();
