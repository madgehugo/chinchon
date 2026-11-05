// Shared by the browser tests (needs Playwright; see README)
const path = require('path');
const os = require('os');

const GAME_URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');   // the game, opened from disk
const OUT = process.argv[2] || os.tmpdir();                                // screenshots go here

// check(ok, label) prints "ok" or "FAIL" with the label; finish() prints a summary and
// exits with code 1 if any check failed or the page threw an error (`errors` collects
// those too: push to it from a page's 'pageerror' handler).
function makeChecker() {
  const errors = [];
  return {
    errors,
    check(ok, label) { console.log(ok ? 'ok  ' : 'FAIL', label); if (!ok) errors.push(label); },
    finish() {
      console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'ERRORS: none');
      process.exit(errors.length ? 1 : 0);
    },
  };
}

// Some tests wait for the CPUs to play and hand the turn back to the human. In about 1
// game in 8 a CPU is dealt a hand it can close on its first turn, which ends the round,
// so the wait would time out. This stops the CPUs from closing.
// (`const STRATEGIES` only fixes the name; the objects inside it can still be changed, like a Python dict.)
const noCpuClose = page => page.evaluate(() => { for (const s of Object.values(STRATEGIES)) s.chooseClose = () => null; });

// Make CPU 1 close the round at once with a fixed hand (a run of oros and one of copas,
// leaving 2 + 12 points to choose from). Runs inside the page.
const cpu1Closes = page => page.evaluate(() => {
  const c = (value, suit) => ({ value, suit });
  state.hands[1] = [c(1,'oros'), c(2,'oros'), c(3,'oros'), c(4,'copas'), c(5,'copas'), c(6,'copas'), c(2,'bastos'), c(12,'espadas')];
  state.currentPlayer = 1; state.phase = 'discard';
  state.turns = 8;   // past the first lap, when closing is allowed
  closeRound(1, closeOptions(state.hands[1])[0].index);
});

module.exports = { GAME_URL, OUT, makeChecker, noCpuClose, cpu1Closes };
