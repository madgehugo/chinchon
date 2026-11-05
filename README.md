# Chinchón

A browser game of **Chinchón**, the Spanish card game: you against one to three CPU players.
Plain HTML, CSS and JavaScript, with no build step, no framework and no libraries.

**Play it:** `https://madgehugo.github.io/chinchon/` (GitHub Pages; replace the placeholders with your own).
Or download the repo and open `index.html` in a browser. It works straight from disk.

## Features

* **English and Spanish**, with a language dropdown next to the Settings button. The first visit follows the browser's language (Spanish if it starts with `es`, else English); after that the choice is remembered in `localStorage`. All text lives in `i18n.js`.
* Sort and Close sit under your hand; the dropdowns (sort mode, CPUs, level, speed, deck, reshuffles per round, re-entries per player, rounds per game) and New game are in a panel behind the Settings button, and the hand analysis table is behind the Hints toggle (off by default).
* 1 human vs 1, 2 or 3 CPUs (the "CPUs" dropdown starts a new game), with a CPU difficulty setting (easy, medium, hard, or mixed) and an adjustable CPU speed.
* 40-card Spanish deck (1-7, 10-12) or 48-card deck (adds the 8s and 9s), which suits bigger groups.
* Adjustable rules: how often the draw pile may be reshuffled in a round (0, 1, 2, 3, 5 or no limit; the board
  shows how many reshuffles are left), how many times each player may re-enter after elimination (0, 1, 2 or
  no limit) and how many rounds a game lasts (no limit, 5, 10, 15 or 20). Changing any of them starts a new game.
* Cards show their number of suit symbols (the 4 of swords has four swords), drawn as inline SVG shapes defined once in `ui.js` (`SUIT_SPRITE`) so they look the same on every device.
* Short card animations (260 ms or less each): the deal, drawing from either pile, discarding, and a gentle lift when you hover or press one of your cards. They switch off when the system asks for reduced motion (`prefers-reduced-motion`).
* Drag cards to rearrange your hand; one button sorts by number or by suit.
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
  (default 5, a setting). After that, the next player to draw from the empty pile ends the round with no closer,
  and everyone scores the unmatched points in their hand. Taking the top discard instead keeps the round going.
  The board warns about this under the draw pile and in the status line.
* **Round limit** (optional setting): after the last round the player still in with the lowest total wins.
  Elimination over 100 still applies until then, and nobody re-enters after the last round. If two or more
  players tie for the lowest total, everyone still in plays one more round, until the tie is broken.
* No jokers.

## Files

| File | What it contains |
| --- | --- |
| `index.html` | The page skeleton: empty containers that the JavaScript fills in. |
| `favicon.svg` | The small icon in the browser tab (two cards on the green table). |
| `style.css` | How it looks, including the phone layout (`@media` block at the end). |
| `rules.js` | The rules: deck, shuffling, runs and groups, scoring, closing. No display code. |
| `i18n.js` | All the player-visible text in English and Spanish (`STRINGS`), `t(key, vars)`, `plural()`, `setLanguage()`, and the `msg()` helper for messages kept in `state`. |
| `ai.js` | The CPU players (base strategies `greedy`, `smart` and `finish`, the easy/medium/hard levels built from them), experiments that were not kept, and the tunable `SMART` settings. |
| `game.js` | The game state (`state`), turns, rounds, scoring, elimination and re-entry. |
| `tests.js` | Unit tests for the rules and CPU logic; they run on page load and report in the console (F12). |
| `ui.js` | Drawing the table, clicks, touch and mouse dragging, the results panel, startup. |
| `tools/` | Node scripts: `harness.js` (runs the engine without a browser), `bench.js` (CPU benchmark over single rounds), `gamebench.js` (CPU benchmark over whole games), `stress.js` (random-game bug hunt). |
| `tests/browser/` | Playwright browser tests (drag, touch, results panel, 1-3 CPU layouts, phone layout, animations, language switch). |
| `build_single.py` | Optional: bundles everything into one `chinchon-single.html` for emailing or hosting as one file. |
| `CLAUDE.md` | Notes for Claude Code (and a useful summary for any contributor). |

The scripts share one global scope, so the order of the `<script>` tags in `index.html` matters: each file may use what
the files above it define (`rules.js, i18n.js, ai.js, game.js, tests.js, ui.js`). They are plain scripts rather than ES modules so
the game also works from `file://`, where browsers block modules.

## How the pieces connect

* **`state.numPlayers`** (2-4) is how many seats are in use; every per-player array has that length, and `MAX_PLAYERS`
  in `rules.js` is the table size. `renderSeats()` in `ui.js` places the seats (1 CPU sits opposite you).
* **`state`** (in `game.js`) holds everything that changes. Game logic writes to it; `render()` in `ui.js` only reads it
  and rebuilds the page. Nearly every action is "check it is allowed, change `state`, call `render()`".
* A **turn** is: draw, then discard one card or close. `state.phase` tracks this (`draw`, `discard`, `roundOver`).
* **Text and languages.** Nothing in the game files is a finished sentence. A message is a key plus its data,
  `msg("sum.closed.cpu", { who: 2 })`; `state.status`, `state.summary` and `state.notice` hold lists of these, and
  `t()` turns them into words only when the page is drawn. That is why `setLanguage()` can call `render()` and have
  everything, including the status line written earlier, appear in the new language. Placeholders named `who`,
  `names`, `card`, `list`, ... hold data (a player number, a card) and are formatted by `FORMATTERS` in `i18n.js`.
  Messages whose verb changes with the subject come as `key.you` and `key.cpu` (see `whoKey`); counts use
  `key.one` / `key.other` (see `plural`). Static HTML text carries `data-i18n="key"` (or `data-i18n-title`,
  `data-i18n-aria` for attributes), and `applyStaticText()` in `ui.js` fills it in.
* **To add or change a text:** add the key to BOTH `en` and `es` in `STRINGS` (the Spanish line gets a `// TODO review`
  comment until a native speaker has checked it). The unit test `runTestsI18n` fails if the two languages differ in keys
  or `{placeholders}`. **To add a language:** add an entry to `STRINGS` and an `<option>` to `#lang` in `index.html`.
* CPU turns have two timed beats (draw, then discard) so you can follow them. Decisions come from a **strategy** object in
  `ai.js` with three functions: `chooseSource`, `chooseClose`, `chooseDiscard`. A new level is an entry in `STRATEGIES`
  plus an entry in `CPU_MODES` and a `level.<name>` text in `i18n.js`.

## CPU levels

| Level | How it plays |
| --- | --- |
| Easy | `greedy` (looks only at points right now), with a 25% chance per decision of a mistake (`EASY_MISTAKE_CHANCE`). |
| Medium | `smart` with a 16% chance of a mistake (`MEDIUM_MISTAKE_CHANCE`). |
| Hard | `smart`, no mistakes. |
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
`CLOSE_BONUS`, ...). CPU tuning lives in the `SMART` object in `ai.js`; its comments record which ideas were benchmarked
and how they scored. Nine tuning ideas were tried (the ninth, round-length awareness, is the `aware` strategy) and none beat plain `smart`, so they are left off.
Two later ideas did not beat it either: deeper search (results in the `SMART` comments) and game-risk awareness, the
`risk` strategy (playing safe near the score limit and ending rounds on opponents near it; results above `STRATEGIES.risk`).
Nor did combinations of the earlier ideas (results in the `SMART` comments) or Monte Carlo rollouts, the `mc` strategy
(guess the hidden cards, play the round out many times for each candidate discard; results above `MC`).
Hard and medium are built on `finish`: `smart` plus three rules for when the deck runs out under the reshuffle limit
(take-or-stop when drawing would end the round, draw odds from the known discards when the pile is about to be refilled,
and discarding for points once no draw is left). Results above `FINISH`: slightly better with few reshuffles, never worse.

## Testing

You need [Node.js](https://nodejs.org) for the tools. Run these from the repo root.

```bash
node tools/stress.js 20           # play random games on both decks, check no card is lost; ~seconds
node tools/bench.js 1600 smart greedy             # compare two CPU settings
node tools/bench.js 3200 smart "smart:takeMargin=-1"   # try a SMART override against the default
node tools/gamebench.js 4000 risk hard 40 4 --jobs 8   # whole games: one A against three B, on 8 CPU cores
node tools/bench.js 3200 finish smart 48 --reshuffles 2   # 48-card deck, at most 2 reshuffles (gamebench: also --rounds, --reentries)
npm install && npx playwright install chromium    # once, for the browser tests
npm run test:browser              # drag, touch, results panel, 1-3 CPU layouts, phone layout, animations, language switch
```

* Unit tests in `tests.js` run every time the page loads; open the console (F12) and look for
  "All ... tests passed" or "TEST FAILED: ...".
* `bench.js` rotates seats and the starting player, and plays every deal twice from the same seeded shuffle with the two
  sides in swapped seats ("duplicate dealing"), so both sides get identical cards. `<rounds>` counts plays (3200 = 1600
  deals). It prints a standard error computed from the per-deal differences; differences under about two standard
  errors are noise. Use at least 1,600 rounds. `--jobs N` splits the deals over N processes, with exactly the same
  result (useful for slow strategies such as `mc`).
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
* After changing `ui.js` or `style.css`, run the browser tests and check the page at phone width (about 390px), in both
  languages (Spanish labels are longer). `tools/stress.js` does not depend on any text: it reads `state.roundResult`.

## Building a single file

```bash
python3 build_single.py            # writes chinchon-single.html
```

## Deploying

The site is served by GitHub Pages from the `main` branch root. Push to `main` and it redeploys in a minute or two.
There is no build step, so what is in the repo is what is served.

## License

MIT. See [`LICENSE`](LICENSE).
