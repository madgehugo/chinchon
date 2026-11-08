# Chinchón

A browser game of **Chinchón**, the Spanish card game: you against one to three CPU players, or online with friends.
Plain HTML, CSS and JavaScript, with no build step, no framework and no libraries. (The online server in `server/`
is a small Node program with one library; the game itself needs nothing.)

**Play it:** `https://madgehugo.github.io/chinchon/` (GitHub Pages; replace the placeholders with your own).
Or download the repo and open `index.html` in a browser. It works straight from disk.

## Install on your phone

From the GitHub Pages link the game installs as an app: its own icon on the home screen, full screen with no
browser bars, and it opens without a network once it has been opened online once.

* **iPhone / iPad (Safari):** open the link, tap Share, then **Add to Home Screen**.
* **Android (Chrome):** open the link, then tap **Install** when offered, or menu (⋮) → **Add to Home screen** / **Install app**.

Updates: while online the app always loads the newest files (see `sw.js`), so a push to `main` reaches installed
copies the next time they open. Installing needs https, so it does not work from a file opened from disk.

## Phone app (App Store and Google Play)

The store apps are the same files inside [Capacitor](https://capacitorjs.com), a native shell that shows the game
full screen in the phone's own web view. Everything for it lives in `app/`, the one folder with dependencies; the game
itself still has none, and never loads anything from `app/`.

| In `app/` | What it is |
| --- | --- |
| `package.json` | Capacitor and its `App` plugin (Android's back button), pinned to exact versions, and the commands below. |
| `capacitor.config.json` | App id `io.github.madgehugo.chinchon` (permanent once published), name, launch colour, Android system bars. |
| `copy_web.js` | Copies the game into `www/` (git-ignored). The file list is `APP_FILES` in `sw.js`, so there is one list to keep. |
| `ios/`, `android/` | The native projects for Xcode and Android Studio, made by Capacitor. Committed: signing and version numbers live there. |

**Once:** install Xcode (Mac App Store; then `sudo xcode-select -s /Applications/Xcode.app` and open it once) and
Android Studio (it brings its own Java; open it once to install the SDK and an emulator). Then `cd app && npm install`.
(`app/android` uses Gradle 9.5.1 instead of the 8.14.3 Capacitor sets up, because the Java that comes with Android
Studio, version 25, is too new for 8.14. Gradle 9.6 and later do not work with the Android plugin in use, so stay on 9.5
until Capacitor moves to a newer one.)

**After changing the game:** `cd app && npm run sync` (copies the files into both native projects), then build:
`npm run ios` opens Xcode (choose a simulator or your phone, press Run); `npm run android` opens Android Studio (Run).
After changing `icon.svg`, `node tools/make_icons.js` also redraws the native icons and launch screens.
Inside the app `ui.js` sees `window.Capacitor` (`NATIVE_APP`): it skips the service worker, saves on the native `pause` event (Android's web view does not always report going to the background) and handles the back button.

**Versions:** each upload needs a higher build number. iOS: Xcode → the App target → General → Version and Build.
Android: `versionName` and `versionCode` in `app/android/app/build.gradle`.

**Publishing checklist**

* Privacy policy URL for both stores: `https://madgehugo.github.io/chinchon/privacy.html` (`privacy.html`).
* iOS ([Apple Developer Program](https://developer.apple.com/programs/), $99/year): in Xcode set your Team under
  Signing & Capabilities; Product → Archive → Distribute → App Store Connect. In App Store Connect create the app
  (same bundle id), add screenshots, description, age rating and App Privacy "Data Not Collected"; test with
  TestFlight, then submit for review.
* Android ([Google Play Console](https://play.google.com/console), $25 once): Build → Generate Signed App Bundle
  (.aab). **Back up the keystore and its passwords**: every update must be signed with it. In the Console: store
  listing, Data safety "no data collected", content rating, then a closed test (new personal accounts need 12 testers
  for 14 days) before production.

## Online play

Friends play on their own phones or computers. One player opens Settings → **Play online with friends**, types a
name and creates a room; the room gets a 4-letter code (no I, L, O, 0 or 1, which look alike) and a link to share.
The others open the link (or type the code), and the host presses Start. People take the first seats and CPUs the
rest, and the room plays with the host's Settings (deck, CPU level and speed, and the rules).

**How it works.** The game runs on a server, never on the players' devices: anything a page holds can be read by
whoever uses it, so the deck and the other hands must stay on the server. `server/room.js` loads the real
`rules.js`, `ai.js` and `game.js` into a sandbox for each room (as the benchmark tools do) and runs the game there with
real timers. Every change is sent to each player as a **view** (`server/view.js`): `state` with the other hands and the
draw pile replaced by face-down placeholders, and the seats renumbered so that the player is seat 0. Because `ui.js`
already draws seat 0 as "You" at the bottom, it draws an online game with no changes. Moves go the other way as
`ACTIONS` (`game.js`), the only door into the game, and each one is checked by type and by whether it is allowed.

* **Leaving and coming back.** If a connection drops, the seat waits 30 seconds (`AWAY_AFTER_MS`), then a CPU plays
  for that player (`state.seats[p] === "away"`) until they are back. Opening the game again rejoins the same seat with
  a secret token kept in `localStorage`. Leave room gives the seat to the CPU for good and brings back your own game.
* **Your own game** on the device is saved when an online game starts and comes back when you leave.
* **Rooms live in memory.** A server restart ends the games in progress, and a room nobody has been connected to
  for 30 minutes is thrown away.

**Running the server on your computer** (for testing; you need Node.js):

```bash
cd server && npm install && npm start      # http://localhost:8080
```

The server also serves the game's files, so you can open `http://localhost:8080`. To test with phones, put them on
the same Wi-Fi and open `http://<your computer's address>:8080` (on a Mac: System Settings → Wi-Fi → Details →
IP address). On those addresses the page uses the server it came from; anywhere else (GitHub Pages, a file, the
store apps) it uses `SERVER_URL` in `net.js`. Any page can be pointed at another server with
`?server=ws://address:8080` in its address.

**Deploying the server.** It runs on [Render](https://render.com) at `https://chinchon.onrender.com` (a Web Service
connected to this repo: root directory empty, build `cd server && npm ci`, start `node server/server.js`, health check
`/health`, one instance). Every push to `main` redeploys it, which ends the online games in progress. Any other host
that runs Node and allows WebSockets would do too (Fly.io, Railway, a VPS...). The steps for a host:

1. Run `npm install` and `npm start` in `server/`. It listens on `PORT` (default 8080), and `/health` answers "ok"
   for hosts that check the server is up. The whole repo must be there, since the server loads the game files from it.
2. The host must give it an **https** address: GitHub Pages is https, and browsers block an https page from talking
   to an unencrypted `ws://` server, so the page connects with `wss://` (the encrypted form).
3. Set the environment variable `ALLOWED_ORIGINS=https://madgehugo.github.io` (the address the game is published at;
   several are separated by commas). Pages from other sites are refused.
4. Put the server's address in `SERVER_URL` at the top of `net.js` (now `"wss://chinchon.onrender.com"`),
   push to `main`, and run `cd app && npm run sync` for the store apps.
5. The store listings change: the privacy answers become "data is collected" (see `privacy.html`): the nickname you
   type and your moves are sent to the server, used only to run the game, kept in memory only for the life of the
   room, and never shared or sold. Not linked to your identity, not used for tracking.

| In `server/` | What it is |
| --- | --- |
| `server.js` | The HTTP and WebSocket server: the message types (listed at the top), checking what pages send (nicknames, origins, message size, a rate limit), rooms by code, and serving the game files. |
| `room.js` | One room: the lobby, the seats and their tokens, loading the engine and starting the game, players going away and coming back, and sending each player their view. |
| `view.js` | `viewFor(state, seat)`: what one player may see, renumbered so that they are seat 0. |
| `test.js` | Server tests (`npm test`): whole games with scripted players, a check that no view ever holds a card that player may not see, disconnect and rejoin, and the limits. |
| `package.json` | Its one dependency, [`ws`](https://github.com/websockets/ws) (the WebSocket server), pinned to an exact version. |

## Features

* **English and Spanish**, with a language dropdown at the top of the Settings sheet. The first visit follows the browser's language (Spanish if it starts with `es`, else English); after that the choice is remembered in `localStorage`. All text lives in `i18n.js`.
* A slim top bar holds the title, the current round and round icon buttons for Scores, Hints, Help, Sound (on/off) and Settings.
  Settings and Scores open as sheets (from the side on a desktop, from the bottom on a phone) that close with their
  X button, Escape or a tap on the background. Settings has the dropdowns (language, sort mode, CPUs, level, speed, deck,
  reshuffles per round, re-entries per player, rounds per game, lay off leftovers) and New game (which also closes the sheet). Under your hand are only the play
  buttons: Sort and Close (Next round and Round results once a round is over). Hints (off by default) shows the hand
  analysis under your hand, a coloured bar under each meld (striped in both colours
  for a card that fits either meld, such as the fourth 3 in 3-3-3-3 with 4-5-6 of that 3's suit), and the best closing score on the Close button.
* 1 human vs 1, 2 or 3 CPUs (1 by default; the "CPUs" dropdown starts a new game). With 3 CPUs on the 40-card deck, the Settings panel suggests the 48-card deck (one button switches), since four players empty the 40-card draw pile quickly, with a CPU difficulty setting (easy, medium, hard, or mixed) and an adjustable CPU speed.
* **Online play** (Settings → Play online with friends): 2-4 people, each on their own device, with CPUs in the empty
  seats. See "Online play" below.
* 40-card Spanish deck (1-7, 10-12) or 48-card deck (adds the 8s and 9s), which suits bigger groups.
* Adjustable rules: how often the draw pile may be reshuffled in a round (0, 1, 2, 3, 5 or no limit, default 2; the board
  shows how many reshuffles are left), how many times each player may re-enter after elimination (0, 1, 2 or
  no limit, default 1), how many rounds a game lasts (no limit, 5, 10, 15 or 20) and laying off leftover cards
  (automatic, manual or off; default automatic). Changing any of them starts a new game.
* Cards show their number of suit symbols (the 4 of swords has four swords), drawn as inline SVG shapes defined once in `ui.js` (`SUIT_SPRITE`) so they look the same on every device.
* Game feel: what a CPU draws shows as a short toast near the piles (one at a time, gone before the next turn); after
  each round every seat shows its score floating up ("+12", "−10") once the results panel is out of the way; with Hints
  on, the cards of a meld you just completed glow once. Sound effects (card snaps, a tick when your turn starts,
  jingles for a close, a Chinchón and a win) are made in code in `sound.js`, start after your first tap or click (browsers
  require that), and the speaker button in the top bar mutes them (remembered like the settings).
* Short card animations (260 ms or less each): the deal, drawing from either pile, discarding, and a gentle lift when you hover or press one of your cards. They switch off when the system asks for reduced motion (`prefers-reduced-motion`).
* Drag cards to rearrange your hand; one button sorts by number or by suit. Your hand spreads over the width
  available, so on a phone the cards overlap only as much as they must.
* Turn cues: the seat whose turn it is has a gold label (a CPU's also shows animated dots while it plays), the pile
  you may draw from pulses, and the card you just drew has a small gold dot until you discard.
* Keyboard play: `1`-`8` discard that card (or close with it in closing mode), `D` draws from the pile, `T` takes the
  top discard, `C` closes, `S` sorts, `Enter` starts the next round, `H` opens the help, `Escape` closes the open panel or hides the results. Game keys do nothing while a panel is open. The help line is in
  the Settings panel (hidden on touch screens, where the status line says "tap" instead of "click").
* The end of a game opens the results with a banner: the winner and the final standings. A few suit symbols float up
  when you win or someone makes a Chinchón (not with reduced motion).
* Easter egg: a Chinchón (anyone's) fills the whole screen with fireworks and emojis for about six seconds, with a
  boom and crackle per burst (`launchFireworks` in `ui.js`, a particle system on a `<canvas>` that taps go through;
  not with reduced motion; a new deal stops it).
* A Help panel (the `?` button or the `H` key) explains the rules, every setting, Hints, the results screen and the
  keyboard keys, in fold-out sections (`<details>` elements in `index.html`; the text is the `help.*` keys in `i18n.js`).
* The settings are remembered between visits (`localStorage`, like the language; see `saveSettings` in `ui.js`).
* A game in progress is saved whenever you leave the page (another app, the home screen, closing the tab) and continues
  where it was when you come back, even mid-way through a CPU's turn. New game starts afresh.
* Installable on a phone, with offline play (see "Install on your phone" above).
* You pick which card to close with.
* Round results screen showing every hand split into melds and leftovers.
* Elimination and re-entry. Works with mouse, touch and pen, and has a phone layout.

## Rules as implemented

* Seven cards each. On your turn, draw from the pile or take the top discard, then discard one card or close.
* **Groups:** 3 or 4 cards of the same number. **Runs:** 3 or more consecutive cards of one suit, in deck order
  (7-10-11 is a run in the 40-card deck; 7-8-9-10 in the 48-card deck). No wraparound. A card belongs to one meld only.
* **Closing:** you need at least one meld and at most 7 unmatched points. Closing with no unmatched cards scores **-10**.
  Nobody may close in the first lap of a round: every player still in must have played one turn first.
* **Points:** 1-9 count face value, the figures (10, 11, 12) count 10. Lower is better; everyone else adds their
  unmatched points to their total.
* **Chinchón:** all seven cards form one run in a single suit. It ends the whole game with a win for that player
  (`CHINCHON_ENDS_GAME` in `rules.js`).
* **Elimination:** over 100 points you are out. An eliminated player may **re-enter** with the same total as the
  highest-scoring player still in. CPUs re-enter only if that total is 70 or less (with a round limit they always
  re-enter, since a player who stays out cannot win). The re-entry setting limits how many times each player may
  come back in one game; with none left, an eliminated player stays out.
* **Stalemate:** when the draw pile runs out it is refilled from the discard pile, up to the reshuffle limit
  (a setting; 2 by default). After that, the next player to draw from the empty pile ends the round with no closer,
  and everyone scores the unmatched points in their hand. Taking the top discard instead keeps the round going.
  The board warns about this under the draw pile and in the status line.
* **Round limit** (optional setting): after the last round the player still in with the lowest total wins.
  Elimination over 100 still applies until then, and nobody re-enters after the last round. If two or more
  players tie for the lowest total, everyone still in plays one more round, until the tie is broken.
* **Laying off** (setting "Lay off leftovers"): after a close, the other players take turns, clockwise from the
  closer, to add leftover cards to any other player's melds (the closer's or another player's): the 4th card of a
  group, or the next card at either end of a run. Cards laid off earlier, by anyone, can be built on (7 then 10 onto
  4-5-6). Laid-off cards do not count. Not after a Chinchón or a close with -10, nor after a stalemate. The CPUs lay
  off as well as they can (`bestLayoff` in `rules.js`); in **automatic** mode so do you; in **manual** mode the round
  waits while you tap your leftover cards and the melds in the results panel (tap a card you laid off to take it back,
  if nothing hangs on it), then Done. With Hints on, the melds your picked card fits are outlined in green.
  Each player's melds are their best split (fewest unmatched points); nobody re-arranges a hand to lay off more.
* No jokers.

## Files

| File | What it contains |
| --- | --- |
| `index.html` | The page skeleton: empty containers that the JavaScript fills in. |
| `favicon.svg` | The small icon in the browser tab (two cards on the green table). |
| `icon.svg`, `icons/` | The app icon for phones: `icon.svg` is the picture (full-bleed, cards inside the mask "safe zone"); `icons/*.png` are made from it by `tools/make_icons.js`. |
| `manifest.webmanifest` | What a phone needs to install the game as an app: name, icons, colours, full-screen mode. |
| `sw.js` | The service worker: keeps a copy of the files so the installed app opens offline (network first, cache as fallback). Not one of the page's `<script>` tags; `ui.js` registers it. |
| `style.css` | How it looks, including the phone layout (`@media` block at the end). |
| `rules.js` | The rules: deck, shuffling, runs and groups, scoring, closing. No display code. |
| `i18n.js` | All the player-visible text in English and Spanish (`STRINGS`), `t(key, vars)`, `plural()`, `setLanguage()`, and the `msg()` helper for messages kept in `state`. |
| `ai.js` | The CPU players: base strategies `greedy`, `smart` and `finish`, the easy/medium/hard levels built from them, and the tunable `SMART` settings. |
| `CPU_EXPERIMENTS.md` | Ideas for a stronger CPU that were benchmarked and did not help, with their results. |
| `game.js` | The game state (`state`), turns, rounds, scoring, elimination and re-entry, players leaving and coming back (online), and `ACTIONS`, the list of moves a player can make. |
| `net.js` | Where your moves go (`act()`): into the game on this device, or to the online server; the connection, and putting the server's views into `state`. |
| `tests.js` | Unit tests for the rules and CPU logic; they run on page load and report in the console (F12). |
| `sound.js` | Sound effects made in code with the Web Audio API (no audio files); only `ui.js` calls it. |
| `ui.js` | Drawing the table, clicks, touch and mouse dragging, the panels, toasts and score pop-ups, startup. |
| `tools/` | Node scripts: `harness.js` (runs the engine without a browser, plus what the benchmarks share), `bench.js` (CPU benchmark over single rounds), `gamebench.js` (CPU benchmark over whole games), `stress.js` (random-game bug hunt), `make_icons.js` (draws the app icons, and the store apps' icons and launch screens). |
| `tests/browser/` | Playwright browser tests (drag, touch, results panel, laying off and the striped Hints bar, 1-3 CPU layouts, phone layout, animations, language switch, toasts, pop-ups, Chinchón fireworks and sound, saving and resuming, installing and offline play, the store app's back button and pause save, two people playing online); `helpers.js` holds what they share. |
| `build_single.py` | Optional: bundles everything into one `chinchon-single.html` for emailing or hosting as one file (it plays the same, but cannot be installed as an app). |
| `privacy.html` | The privacy policy page the app stores ask for (English and Spanish). Not part of the game. |
| `app/` | The App Store and Google Play apps (see "Phone app" above). |
| `server/` | The online server (see "Online play" above). |
| `CLAUDE.md` | Notes for Claude Code (and a useful summary for any contributor). |

The scripts share one global scope, so the order of the `<script>` tags in `index.html` matters: each file may use what
the files above it define (`rules.js, i18n.js, ai.js, game.js, net.js, tests.js, sound.js, ui.js`). They are plain scripts rather than ES modules so
the game also works from `file://`, where browsers block modules.

## How the pieces connect

* **`state.numPlayers`** (2-4) is how many seats are in use; every per-player array has that length, and `MAX_PLAYERS`
  in `rules.js` is the table size. `renderSeats()` in `ui.js` places the seats (1 CPU sits opposite you).
* **`state`** (in `game.js`) holds everything that changes. Game logic writes to it; `render()` in `ui.js` only reads it
  and rebuilds the page. Nearly every action is "check it is allowed, change `state`, call `render()`".
* **Seats and moves.** `state.seats` says who plays each seat: `"human"`, `"cpu"`, or `"away"` (an online player whose
  connection dropped, played by the CPU). On one device it is you in seat 0 and CPUs. A player's moves are the
  `ACTIONS` in `game.js` (draw, discard, close, order, lay off, take back, done, re-enter, next); `ui.js` never calls the
  move functions itself but `act(name, ...)` in `net.js`, which runs the action for seat 0 or sends it to the server.
  Cards in moves are named by key (`"o12"`, see `cardKey`), not by position. Closing mode (`state.closing`) is only how
  your screen behaves, so it is not an action.
* A **turn** is: draw, then discard one card or close. `state.phase` tracks this (`draw`, `discard`, `roundOver`).
* **Text and languages.** Nothing in the game files is a finished sentence. A message is a key plus its data,
  `msg("sum.closed", { who: 2 })`; `state.status`, `state.summary` and `state.notice` hold lists of these, and
  `t()` turns them into words only when the page is drawn. That is why `setLanguage()` can call `render()` and have
  everything, including the status line written earlier, appear in the new language. Placeholders named `who`,
  `names`, `card`, `list`, ... hold data (a player number, a card) and are formatted by `FORMATTERS` in `i18n.js`.
  Messages whose verb changes with the subject come as `key.you` and `key.cpu`; the form is chosen when the message
  is shown, from its `who` (see `messageKey`), so "Your turn" to player 2 is "Ana is playing..." to everyone else.
  game.js only says who a message is about. Online nicknames are in `state.names` (shown by `playerName`; they are
  what people typed, so `ui.js` escapes them before they go into HTML). Counts use
  `key.one` / `key.other` (see `plural`). Static HTML text carries `data-i18n="key"` (or `data-i18n-title`,
  `data-i18n-aria` for attributes), and `applyStaticText()` in `ui.js` fills it in.
* **To add or change a text:** add the key to BOTH `en` and `es` in `STRINGS`. The unit test `runTestsI18n` fails if the two languages differ in keys
  or `{placeholders}`. **To add a language:** add an entry to `STRINGS` and an `<option>` to `#lang` in `index.html`.
* **Saving and resuming.** `snapshotGame()` in `game.js` turns `state` into a plain object (leaving out what only
  belongs to the screen: the timer, open panels, closing mode) and `restoreGame()` checks a saved one (version
  `SAVE_VERSION`, every field present, exactly one full deck) and puts it back; `resumeTurn()` restarts play, including a
  CPU's pending timer. They never touch the page or storage. `saveGame()` / `loadGame()` in `ui.js` keep the JSON in
  `localStorage` and save on `visibilitychange` / `pagehide`. **If you add or rename a field of `state`, bump
  `SAVE_VERSION`**, so an old save is ignored instead of loaded half-right. Cards are compared as objects
  (`state.lastDrawn`, `state.known`), so `restoreGame` re-links those to the card objects in the hands.
* **Installing and offline.** `index.html` links `manifest.webmanifest` and the iOS icon; `ui.js` registers `sw.js` on
  https or localhost only, and not in the store app. Every file the page loads must also be in `APP_FILES` in `sw.js`
  (`tests/browser/pwa.js` checks); `app/copy_web.js` uses the same list.
* **Laying off** happens in `closeRound` (`game.js`) before the round is scored: `state.layoff` holds the turn
  order and whose turn it is; `continueLayoffs()` plays the CPUs' lay-offs and stops at a human's in manual mode, and
  `humanLayoffDone()` carries on. Cards move only within `state.roundDetail` (the results screen), never in the
  hands; `finishClose()` then scores what each player still holds.
* CPU turns have two timed beats (draw, then discard) so you can follow them. Decisions come from a **strategy** object in
  `ai.js` with three functions: `chooseSource`, `chooseClose`, `chooseDiscard`. A new level is an entry in `STRATEGIES`
  plus an entry in `CPU_MODES` and a `level.<name>` text in `i18n.js`.

## CPU levels

| Level | How it plays |
| --- | --- |
| Easy | `greedy` (looks only at points right now), with a 25% chance per decision of a mistake (`EASY_MISTAKE_CHANCE`). |
| Medium | `finish` with a 16% chance of a mistake (`MEDIUM_MISTAKE_CHANCE`). |
| Hard | `finish` (`smart`, the probability-based strategy, plus end-of-deck rules), no mistakes. |
| Mixed | One CPU of each level: CPU 1 easy, CPU 2 medium, CPU 3 hard (with fewer CPUs, the first ones). |

A mistake is drawing from the other pile or discarding a random card; CPUs never miss a legal close, except that no
CPU closes with a score that would put its total over 100 (even when it could re-enter).
Benchmark (`node tools/bench.js 3200 <A> <B>`, 2 CPUs of each level, seats and starter rotated; the standard errors below were measured before duplicate dealing was added and were about 0.2, now roughly a third smaller):

| A vs B | A avg points | B avg points | A - B |
| --- | --- | --- | --- |
| hard vs easy | 14.20 | 23.11 | -8.91 |
| hard vs medium | 15.43 | 20.04 | -4.60 |
| medium vs easy | 17.23 | 21.85 | -4.62 |

* A **tap** on one of your cards discards it (or closes, in closing mode); a **drag** rearranges the hand. Both use pointer
  events, so mouse, touch and pen share one code path.

## Changing things

All the rule numbers are named constants near the top of `rules.js` (`SCORE_LIMIT`, `MAX_UNMATCHED_TO_CLOSE`,
`CLOSE_BONUS`, ...). CPU tuning lives in the `SMART` and `FINISH` objects in `ai.js`.
Hard and medium are built on `finish`: `smart` plus three rules for when the deck runs out under the reshuffle limit
(take-or-stop when drawing would end the round, draw odds from the known discards when the pile is about to be refilled,
and discarding for points once no draw is left). Results above `FINISH`: slightly better with few reshuffles, never worse.
Many other ideas for a stronger CPU were benchmarked (tuning settings, round-length and game-risk awareness, deeper
search, Monte Carlo rollouts, at 2, 3 and 4 players) and none beat plain `smart`. `CPU_EXPERIMENTS.md` has the results
and says where the code for them is in the git history.

## Testing

You need [Node.js](https://nodejs.org) for the tools. Run these from the repo root.

```bash
node tools/stress.js 20           # play random games on both decks, check no card is lost; ~seconds
node tools/bench.js 1600 smart greedy             # compare two CPU settings
node tools/bench.js 3200 smart "smart:takeMargin=-1"   # try a SMART override against the default
node tools/gamebench.js 4000 hard medium 40 4 --jobs 8   # whole games: one A against three B, on 8 CPU cores
node tools/bench.js 3200 finish smart 48 --reshuffles 2   # 48-card deck, at most 2 reshuffles (gamebench: also --rounds, --reentries)
node tools/bench.js 6400 "hard:takeMargin=1.5" hard --players 2 --jobs 8   # a 1v1 table (default 4 players)
npm install && npx playwright install chromium    # once, for the browser tests
cd server && npm install && cd ..  # once, for the online tests (the server's one library)
npm run test:browser              # drag, touch, results panel, laying off, 1-3 CPU layouts, phone layout, animations, language switch, toasts and sound, resume, offline, store app, online
cd server && npm test             # the online server: whole games, the hidden-card check, disconnects, limits
node tools/make_icons.js          # after changing icon.svg: redraws icons/*.png and the app/ icons (commit them)
```

* Unit tests in `tests.js` run every time the page loads; open the console (F12) and look for
  "All ... tests passed" or "TEST FAILED: ...". Each browser test prints `ok` or `FAIL` per check and exits
  with an error if any check failed.
* `bench.js` rotates seats and the starting player, and plays every deal twice from the same seeded shuffle with the two
  sides in swapped seats ("duplicate dealing"), so both sides get identical cards. `<rounds>` counts plays (3200 = 1600
  deals). It prints a standard error computed from the per-deal differences; differences under about two standard
  errors are noise. Use at least 1,600 rounds. `--jobs N` splits the deals over N processes, with exactly the same
  result, only faster.
* The shuffle uses `random` in `rules.js` and the easy/medium mistake rolls use a separate `decisionRandom`; both are
  `Math.random` in the browser. The benchmark swaps in two seeded generators (`makeSeededRandom`), so runs are exactly
  repeatable and a different decision can never change a later shuffle.
* **Noise control:** `smart smart` with duplicate dealing is always exactly 0, so use `node tools/bench.js 3200 smart smart --control`
  instead. It plays the two halves of each deal on independent deals (no pairing) and shows the noise a plain comparison
  would have (about 0.21 at 3200 plays). Its difference should be within about two standard errors of 0. Changing `SEED`
  in `bench.js` also shows how much a result moves.
* `bench.js` scores single rounds with every total at 0, so it cannot see anything that depends on the game score
  (elimination, re-entry, playing safe near 100). `gamebench.js` plays whole games with the real scoring and counts
  wins. It seats ONE player A against a field of B's, because two A's at one table act as a team (one A going out can
  still knock a B out for the other). Each deal is played with A in every seat, so a fair share is exactly 1/players
  (25% with 4 players); `--control` gives the noise level (about 0.7 percentage points at 4,000 games, 0.3-0.4 paired).
  4,000 games take about 5 minutes with `--jobs 8`.
* `stress.js` plays every other game with several human seats (as online), whose players sometimes go away and come
  back, and tries moves that are not allowed (which must change nothing).
* `stress.js` also saves and restores the game at random moments (through JSON, as the browser does) and keeps playing
  from the copy, so a field that does not survive saving shows up there.
* After changing `ui.js` or `style.css`, run the browser tests and check the page at phone width (about 390px), in both
  languages (Spanish labels are longer). `tools/stress.js` does not depend on any text: it reads `state.roundResult`.

## Building a single file

```bash
python3 build_single.py            # writes chinchon-single.html
```

## Deploying

The site is served by GitHub Pages from the `main` branch root. Push to `main` and it redeploys in a minute or two.
The online server is deployed separately (see "Online play").
There is no build step, so what is in the repo is what is served. The store apps do not update this way: see
"Phone app" above (sync, a new build number, upload, review).

## License

MIT. See [`LICENSE`](LICENSE).
