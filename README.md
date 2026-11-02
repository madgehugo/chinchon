<<<<<<< HEAD
# Chinchón

A browser game of Chinchón: you against 3 CPU players. Plain HTML, CSS and
JavaScript, with no build step and no libraries. Open `index.html` in a browser.

## Files

| File | What it contains |
| --- | --- |
| `index.html` | The page skeleton: empty containers that the JavaScript fills in. |
| `style.css` | How it looks, including the phone layout (`@media` block at the end). |
| `rules.js` | The rules: deck, shuffling, runs and groups, scoring, closing. No display code. |
| `ai.js` | The CPU players (`simple` and `smart`) and their tunable settings. |
| `game.js` | The game state (`state`), turns, rounds, scoring, elimination and re-entry. |
| `tests.js` | Self-tests for the rules; results appear in the browser console (F12). |
| `ui.js` | Drawing the table, clicks, touch and mouse dragging, the results panel, startup. |
| `build_single.py` | Optional: bundles everything into one `chinchon-single.html`. |

The scripts share one global scope, so the order of the `<script>` tags in
`index.html` matters: each file may use what the files above it define.
(Plain scripts rather than ES modules, so it also works when opened straight
from disk with `file://`, where browsers block modules.)

## How the pieces connect

* **`state`** (in `game.js`) holds everything that changes. Game logic writes to it;
  `render()` in `ui.js` only reads it and rebuilds the page. Nearly every action is
  "check it is allowed, change `state`, call `render()`".
* A **turn** is: draw (pile or top discard), then discard one card, or close.
  `state.phase` tracks this (`draw`, `discard`, `roundOver`).
* CPU turns have two timed beats (draw, then discard) so you can follow them.
  The decisions come from a **strategy** object in `ai.js` with three functions:
  `chooseSource`, `chooseClose`, `chooseDiscard`. Adding a level means adding an entry
  to `STRATEGIES` (and to `CPU_MODES`).
* Pressing a card of yours: a **tap** discards (or closes, in closing mode) and a
  **drag** rearranges the hand. Both use pointer events, so mouse, touch and pen
  share one code path.

## Rules as implemented

* 40-card Spanish deck (1-7, 10, 11, 12), or 48 cards with the 8s and 9s. Seven cards each.
* **Groups:** 3 or 4 of the same number. **Runs:** 3 or more consecutive cards of one suit,
  in deck order (7-10-11 is a run in the 40-card deck; 7-8-9-10 in the 48-card deck).
  A card can be in only one meld.
* **Closing:** you need at least one meld and at most 7 unmatched points. You choose which
  card to discard when you close. Closing with no unmatched cards scores **-10**.
* **Chinchón:** all seven cards form one run in one suit. Ends the whole game
  (`CHINCHON_ENDS_GAME` in `rules.js`).
* **Points:** 1-9 count face value, the figures (10, 11, 12) count 10. Lower is better.
  Everyone adds their unmatched points to their total each round.
* **Elimination:** over 100 points you are out. An eliminated player may **re-enter** with the
  same total as the highest-scoring player still in. CPUs re-enter only if that total is 70 or less.
* **Stalemate:** if the draw pile has run out more than 5 times in a round, the round ends
  with no closer.

## Changing things

All the rule numbers are named constants near the top of `rules.js`
(`SCORE_LIMIT`, `MAX_UNMATCHED_TO_CLOSE`, `CLOSE_BONUS`, ...). CPU tuning lives in the
`SMART` object in `ai.js`; its comments record which ideas were benchmarked and what happened.

## Tests

Open the page and the console (F12). `tests.js` runs on load and prints
"All ... tests passed" for each group, or "TEST FAILED: ..." for any failure.
=======
# chinchon
Playing around with Claude to make a Chinchon app.
>>>>>>> 6e4cb4d217ef26eac56271f1a09dff07d96bfe9a
