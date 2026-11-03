# Chinchón

A browser game of **Chinchón**, the Spanish card game: you against one to three CPU players.
Plain HTML, CSS and JavaScript, with no build step, no framework and no libraries.

**Play it:** `https://madgehugo.github.io/chinchon/` (GitHub Pages; replace the placeholders with your own).
Or download the repo and open `index.html` in a browser. It works straight from disk.

## Features

* Sort and Close sit under your hand; the dropdowns (sort mode, CPUs, level, speed, deck) and New game are in a panel behind the Settings button, and the hand analysis table is behind the Hints toggle (off by default).
* 1 human vs 1, 2 or 3 CPUs (the "CPUs" dropdown starts a new game), with a CPU difficulty setting (easy, medium, hard, or mixed) and an adjustable CPU speed.
* 40-card Spanish deck (1-7, 10-12) or 48-card deck (adds the 8s and 9s), which suits bigger groups.
* Cards show their number of suit symbols (the 4 of swords has four swords), drawn as inline SVG shapes defined once in `ui.js` (`SUIT_SPRITE`) so they look the same on every device.
* Drag cards to rearrange your hand; one button sorts by number or by suit.
* You pick which card to close with.
* Round results screen showing every hand split into melds and leftovers.
* Elimination and re-entry. Works with mouse, touch and pen, and has a phone layout.

## Rules as implemented

* Seven cards each. On your turn, draw from the pile or take the top discard, then discard one card or close.
* **Groups:** 3 or 4 cards of the same number. **Runs:** 3 or more consecutive cards of one suit, in deck order
  (7-10-11 is a run in the 40-card deck; 7-8-9-10 in the 48-card deck). No wraparound. A card belongs to one meld only.
* **Closing:** you need at least one meld and at most 7 unmatched points. Closing with no unmatched cards scores **-10**.
* **Points:** 1-9 count face value, the figures (10, 11, 12) count 10. Lower is better; everyone else adds their
  unmatched points to their total.
* **Chinchón:** all seven cards form one run in a single suit. It ends the whole game with a win for that player
  (`CHINCHON_ENDS_GAME` in `rules.js`).
* **Elimination:** over 100 points you are out. An eliminated player may **re-enter** with the same total as the
  highest-scoring player still in. CPUs re-enter only if that total is 70 or less.
* **Stalemate:** if the draw pile runs out more than 5 times in one round, the round ends with no closer.
* No jokers.

## Files

| File | What it contains |
| --- | --- |
| `index.html` | The page skeleton: empty containers that the JavaScript fills in. |
| `style.css` | How it looks, including the phone layout (`@media` block at the end). |
| `rules.js` | The rules: deck, shuffling, runs and groups, scoring, closing. No display code. |
| `ai.js` | The CPU players (base strategies `greedy` and `smart`, the easy/medium/hard levels built from them) and the tunable `SMART` settings. |
| `game.js` | The game state (`state`), turns, rounds, scoring, elimination and re-entry. |
| `tests.js` | Unit tests for the rules and CPU logic; they run on page load and report in the console (F12). |
| `ui.js` | Drawing the table, clicks, touch and mouse dragging, the results panel, startup. |
| `tools/` | Node scripts: `harness.js` (runs the engine without a browser), `bench.js` (CPU benchmark over single rounds), `gamebench.js` (CPU benchmark over whole games), `stress.js` (random-game bug hunt). |
| `tests/browser/` | Playwright browser tests (drag, touch, results panel, 1-3 CPU layouts, phone layout). |
| `build_single.py` | Optional: bundles everything into one `chinchon-single.html` for emailing or hosting as one file. |
| `CLAUDE.md` | Notes for Claude Code (and a useful summary for any contributor). |

The scripts share one global scope, so the order of the `<script>` tags in `index.html` matters: each file may use what
the files above it define (`rules.js, ai.js, game.js, tests.js, ui.js`). They are plain scripts rather than ES modules so
the game also works from `file://`, where browsers block modules.

## How the pieces connect

* **`state.numPlayers`** (2-4) is how many seats are in use; every per-player array has that length, and `MAX_PLAYERS`
  in `rules.js` is the table size. `renderSeats()` in `ui.js` places the seats (1 CPU sits opposite you).
* **`state`** (in `game.js`) holds everything that changes. Game logic writes to it; `render()` in `ui.js` only reads it
  and rebuilds the page. Nearly every action is "check it is allowed, change `state`, call `render()`".
* A **turn** is: draw, then discard one card or close. `state.phase` tracks this (`draw`, `discard`, `roundOver`).
* CPU turns have two timed beats (draw, then discard) so you can follow them. Decisions come from a **strategy** object in
  `ai.js` with three functions: `chooseSource`, `chooseClose`, `chooseDiscard`. A new level is an entry in `STRATEGIES`
  plus an entry in `CPU_MODES` and `LEVEL_LABEL`.

## CPU levels

| Level | How it plays |
| --- | --- |
| Easy | `greedy` (looks only at points right now), with a 25% chance per decision of a mistake (`EASY_MISTAKE_CHANCE`). |
| Medium | `smart` with a 16% chance of a mistake (`MEDIUM_MISTAKE_CHANCE`). |
| Hard | `smart`, no mistakes. |
| Mixed | One CPU of each level: CPU 1 easy, CPU 2 medium, CPU 3 hard (with fewer CPUs, the first ones). |

A mistake is drawing from the other pile or discarding a random card; CPUs never miss a legal close.
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

## Testing

You need [Node.js](https://nodejs.org) for the tools. Run these from the repo root.

```bash
node tools/stress.js 20           # play random games on both decks, check no card is lost; ~seconds
node tools/bench.js 1600 smart greedy             # compare two CPU settings
node tools/bench.js 3200 smart "smart:takeMargin=-1"   # try a SMART override against the default
node tools/gamebench.js 4000 risk hard 40 4 --jobs 8   # whole games: one A against three B, on 8 CPU cores
npm install && npx playwright install chromium    # once, for the browser tests
npm run test:browser              # drag, touch, results panel, 1-3 CPU layouts, phone layout
```

* Unit tests in `tests.js` run every time the page loads; open the console (F12) and look for
  "All ... tests passed" or "TEST FAILED: ...".
* `bench.js` rotates seats and the starting player, and plays every deal twice from the same seeded shuffle with the two
  sides in swapped seats ("duplicate dealing"), so both sides get identical cards. `<rounds>` counts plays (3200 = 1600
  deals). It prints a standard error computed from the per-deal differences; differences under about two standard
  errors are noise. Use at least 1,600 rounds.
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
* After changing `ui.js` or `style.css`, run the browser tests and check the page at phone width (about 390px).

## Building a single file

```bash
python3 build_single.py            # writes chinchon-single.html
```

## Deploying

The site is served by GitHub Pages from the `main` branch root. Push to `main` and it redeploys in a minute or two.
There is no build step, so what is in the repo is what is served.

## License

MIT. See [`LICENSE`](LICENSE).
