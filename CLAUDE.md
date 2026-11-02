# Chinchón: notes for Claude Code

Browser Chinchón (Spanish card game), 1 human vs 3 CPUs. Plain HTML/CSS/JS, no build step, no dependencies.
The owner is an experienced Python/R programmer who is new to web languages and wants this codebase to be
clean, readable and well commented so they can learn from it. Keep comments explanatory, and explain
JS/CSS idioms briefly where they are not obvious to a Python/R programmer.

See `README.md` for the file map, the rules as implemented and how the pieces connect. Do not duplicate it here.

## Hard constraints

* **Classic `<script>` tags in one shared global scope, no ES modules**, so the game works from `file://`.
  Script order in `index.html` is `rules.js, ai.js, game.js, tests.js, ui.js`; a file may only use what earlier
  files define at load time. `build_single.py` depends on the exact `<link>`/`<script src>` tag shapes in `index.html`.
* **No libraries, no build step, no external requests.**
* **Logic vs display:** `rules.js`, `ai.js`, `game.js` never touch the DOM except through `render()` and `setStatus()`
  (defined in `ui.js`; stubbed in `tools/harness.js`). Keep it that way, because the Node tools rely on it.
* **State flow:** change `state`, then call `render()`. `render()` only reads `state`.
* Files must not contain the text `</script` (the single-file bundler refuses it).

## Decisions the owner made (do not undo without asking)

* No move log and no "discarded by X" label on the discard pile: "the player should keep track themselves".
* The player chooses which card to close with. Closing with no unmatched cards scores -10 (and is not a Chinchón).
* Close rule: at least one meld and at most 7 unmatched points, any number of cards. No jokers.
* Re-entry after elimination uses the highest current total among players still in.
* CPU turns are deliberately slow by default so the player can follow discards (`CPU_SPEEDS` in `game.js`).
* Sort button defaults to sorting by number; the user can switch to suit.
* No `alert`/`confirm`/`prompt` (they do not work when the game runs inside a published Claude artifact); use in-page
  bars like `#deck-confirm`.

## CPU tuning: what was already tried

`ai.js` has `greedy` ("simple") and `smart` (expected cost after the next draw). Eight tuning ideas (close bonus,
perfect bonus, denial of known cards, take margins, waiting to close) were benchmarked and none beat plain `smart`;
results are in the comments above `SMART`. Do not re-run those without a new idea. A real improvement probably needs
deeper search or opponent modelling. Benchmark with `tools/bench.js`; the harness rotates seats and the starting
player because an earlier version without that rotation gave a false advantage to whoever started. It also deals
each hand twice with the two sides in swapped seats (seeded shuffle via `setRandom`; the browser keeps `Math.random`),
which cuts the standard error by about a third. `smart smart` now always prints exactly 0, so it is no longer a noise
control; change `SEED` in `bench.js` to gauge noise instead.

## How to check your work

```bash
node tools/stress.js 20                      # engine: random games on both decks, card audit (must print "stress test passed")
node tools/bench.js 1600 smart greedy        # CPU strength
npm run test:browser                         # needs: npm install && npx playwright install chromium
```

* Unit tests (`tests.js`) run on every page load and print to the browser console.
* UI changes: run the browser tests and look at the page at about 390px width (no horizontal overflow, cards tappable).
* If you change the HTML ids that the browser tests use (`#close-btn`, `#results`, `#res-next`, ...), update them too.

## Conventions

* Constants in UPPER_CASE near the top of a file; one-line comment on what each is.
* Each section of a file starts with a banner comment saying what the section is for.
* Mobile first matters: hand cards use `touch-action: none` and pointer events, with an 8px tap-versus-drag threshold.
* After a change, update `README.md` if the rules, files or commands changed.

## Deploying

GitHub Pages serves `main` at the repo root. Push to `main`; nothing else to do. `chinchon-single.html` is a
build product and is git-ignored.
