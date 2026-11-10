"use strict";

/* =========================================================
   sw.js: the service worker, which lets the installed app open offline
   ---------------------------------------------------------
   A service worker is a script the browser runs apart from the page. Once
   ui.js has registered it, every file the page asks for goes through the
   "fetch" handler below, which can answer from the network or from a cache
   (a store of saved responses the browser keeps for this site).

   Strategy: network first, cache as fallback. When online you always get the
   newest version of every file (so a new deploy shows up straight away, with
   no version number to bump); each good answer is also saved in the cache,
   and with no network the saved copy is used. The files are small, so asking
   the network first costs almost nothing.

   This file is not one of the page's <script> tags: it runs in its own
   separate scope, where `self` is the service worker (there is no `window`
   or `document` here).
   ========================================================= */

const CACHE_NAME = "chinchon";   // name of this site's cache
// Everything the page needs, saved as soon as the service worker is installed,
// so the game works offline even before every file has been fetched once.
// A new file that index.html loads must be added here too (tests/browser/pwa.js checks).
const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "rules.js", "i18n.js", "ai.js", "game.js", "net.js", "tests.js", "sound.js", "tutorial.js", "ui.js",
  "effects.js", "ui_online.js", "ui_feedback.js", "start.js",
  "favicon.svg",
  "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

// Installed (the first visit, or sw.js changed): fill the cache.
// event.waitUntil(promise) tells the browser "not finished until this promise is";
// a promise is a value that arrives later, like a future in R or Python.
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();            // take over now instead of after every tab is closed
});

// Active: remove caches with any other name (from an older version of this file),
// and start handling the pages that are already open.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Every request from the page. Only plain reads (GET) of this site's own files
// are handled; anything else goes to the network as usual.
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();   // a response can be read only once: one for the page, one for the cache
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      // No network: the saved copy. ignoreSearch so "index.html?x" still finds "index.html".
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
