/* =========================================================
   start.js: runs once when the page loads, after every other file
   ---------------------------------------------------------
   Loads the settings and the saved game, then starts play, rejoins an online
   room, offers the tutorial, and sets up the installed app (service worker)
   and the store app (Capacitor). It is the last <script>, so everything the
   other files define already exists.
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   START: run once when the page loads
   --------------------------------------------------------- */
if (typeof runSelfTests === "function") runSelfTests();   // results in the console (F12)
const savedCpuCount = loadSettings();   // last visit's settings (or the defaults written in index.html)
const resumed = loadGame();           // the game left unfinished last time, if any
if (resumed) resumeTurn();            // carry on with it
else newGame(savedCpuCount);          // or start a new one with those settings
syncSettingDropdowns();      // after newGame, which sets the number of players

// Online: your nickname from last time; back into the room you were in (a reload, or the
// app was closed); or, opened from a shared link (?room=K7QF), the join form with its code
try { document.getElementById("online-name").value = localStorage.getItem(NAME_STORAGE_KEY) || ""; } catch (err) { /* fine */ }
resumeRoom();
const linkedRoom = new URLSearchParams(location.search).get("room");
if (linkedRoom && !online.code && serverUrl()) {
  document.getElementById("online-code").value = linkedRoom.toUpperCase().slice(0, 4);
  setOnlineOpen(true);
}
// A first visit (no saved settings or game, not opened from a room link): offer the tutorial
if (!resumed && !linkedRoom && !online.code) offerTutorial();

// The App Store / Google Play app (app/ in this repo) runs these same files inside a
// native shell called Capacitor, which defines `window.Capacitor` before any script
// here runs. In the browser it does not exist. (`window.Capacitor` rather than plain
// `Capacitor`: reading a global that was never defined is an error, a missing property is not.)
const NATIVE_APP = Boolean(window.Capacitor);

// Offline play once the game is installed on a phone: register sw.js, the "service
// worker" (a script the browser keeps running in the background that answers the
// page's file requests, from a saved copy when there is no network). Browsers allow
// one only on https:// or localhost, so this is skipped when the game is opened
// from disk (file://), and in the store app, whose files are on the phone already.
// Inside some embeds it can still fail; that is fine, the game just has no offline
// copy. (.catch on a promise = what to do if it fails.)
if ("serviceWorker" in navigator && !NATIVE_APP &&
    (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* no offline copy; fine */ });
}

// The store app talks to the native "App" plugin (app/package.json) through the bridge
// functions Capacitor puts on window.Capacitor, so the game needs no Capacitor JavaScript
// library of its own. PluginHeaders lists the native plugins.
if (NATIVE_APP && (window.Capacitor.PluginHeaders || []).some(plugin => plugin.name === "App")) {
  // "pause": the app went to the background. Android's web view does not always report
  // that to the page (no visibilitychange), so save here too.
  window.Capacitor.addListener("App", "pause", saveGame);
  // Android's back button: close the open panel, as Escape does; with none open, save
  // and leave the app (the default would be to go back a page, and the game has only one).
  if (window.Capacitor.getPlatform() === "android") {
    window.Capacitor.addListener("App", "backButton", () => {
      if (!closeTopPanel()) { saveGame(); window.Capacitor.nativeCallback("App", "exitApp", {}); }
    });
  }
}
