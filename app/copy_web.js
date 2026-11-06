"use strict";

/* =========================================================
   app/copy_web.js: copy the game into www/ for the native apps
   ---------------------------------------------------------
   Usage:  node copy_web.js      (or: npm run copy, which npm run sync also does)
   Capacitor builds the iOS and Android apps from the folder named by "webDir"
   in capacitor.config.json (www/). The game itself lives at the repo root,
   so this script copies it here. The list of files is APP_FILES in ../sw.js,
   the same list the service worker saves for offline play, so a new game
   file only has to be added in one place (tests/browser/pwa.js checks that
   list against index.html). Never edit www/: it is deleted and refilled on
   every run, and git ignores it.
   ========================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");       // the game's files
const WWW = path.join(__dirname, "www");       // where Capacitor looks for them

// sw.js is a service worker, not a module, so it cannot be require()d. Instead,
// take the text of the APP_FILES array out of it and evaluate just that.
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const found = sw.match(/const APP_FILES = (\[[\s\S]*?\]);/);
if (!found) throw new Error("APP_FILES not found in sw.js");
// "./" means the folder itself (index.html), which is also in the list by name.
const files = vm.runInNewContext(found[1]).filter(f => f !== "./");

const missing = files.filter(f => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) throw new Error("listed in sw.js but missing: " + missing.join(", "));

fs.rmSync(WWW, { recursive: true, force: true });    // like `rm -rf www`
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(WWW, f)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), path.join(WWW, f));
}
console.log(`copied ${files.length} files into www/`);
