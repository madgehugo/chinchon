/* =========================================================
   ai.js: the CPU players
   ---------------------------------------------------------
   Strategies decide WHAT to do; game.js decides WHEN (see cpuTurn there).
   Everything here only reads `state` and the helpers in rules.js.
   Ideas that were benchmarked and did not make the CPUs stronger are
   listed, with their results, in CPU_EXPERIMENTS.md.
   ========================================================= */

"use strict";

// CPU difficulty. Each mode lists the strategy for seats 0-3 (seat 0 is you); with fewer
// CPUs in the game only the first entries are used.
// The keys "easy", "medium" and "hard" refer to entries in STRATEGIES (bottom of this file).
const CPU_MODES = {
  easy:   [null, "easy",   "easy",   "easy"],
  medium: [null, "medium", "medium", "medium"],
  hard:   [null, "hard",   "hard",   "hard"],
  mixed:  [null, "easy",   "medium", "hard"],   // one CPU of each level
};
// (the name shown next to each CPU on the table is the text key "level.<name>" in i18n.js)

// Chance (0 to 1) that a CPU makes a deliberate mistake on a decision (where to
// draw from, what to discard). Easy plays "greedy" with mistakes; medium plays
// "finish" with fewer mistakes. Hard never makes one. Medium's value was tuned
// with tools/bench.js (results in the comment above STRATEGIES.easy).
const EASY_MISTAKE_CHANCE   = 0.25;
const MEDIUM_MISTAKE_CHANCE = 0.16;

/* ---------------------------------------------------------
   CPU STRATEGIES
   ---------------------------------------------------------
   A strategy is an object with three decision functions. Each receives the
   player index `p` and reads the table from `state`:
     chooseSource(p)  -> "deck" or "discard"     (hand has 7 cards)
     chooseClose(p)   -> discard index to close with, or null to keep playing
                         (hand has 8 cards, after drawing)
     chooseDiscard(p) -> index of the card to throw away (hand has 8 cards)
   cpuTurn() calls them in that order. Adding a new CPU level is just adding
   another entry to STRATEGIES. The three levels shown to the player (easy,
   medium, hard) are built from the base strategies greedy, smart and finish.
   --------------------------------------------------------- */

// Tunable settings for the "smart" strategy. tools/bench.js can override them for
// one side of a benchmark, e.g. "smart:takeMargin=-1" (see registerSpec in tools/harness.js).
const SMART = {
  chinchonValue: 100,  // how much a Chinchón is worth, in "points saved" (it wins the game)
  takeMargin:    0,    // take the discard only if it beats drawing by more than this
  closeMax:      7,    // never close above this many unmatched points
};

// ---- Helpers shared by the strategies ----

// Is this 7-card hand a Chinchón (one suit, 7 consecutive cards)? Cheap check.
function isSingleSuitRun(hand) {
  if (hand.length !== CHINCHON_LENGTH) return false;
  if (!hand.every(card => card.suit === hand[0].suit)) return false;
  const ranks = hand.map(rankIndex).sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
}

// How "bad" a 7-card hand is (lower = better): its unmatched points, or a big
// negative number for a Chinchón.
function handCost(hand) {
  return isSingleSuitRun(hand) ? -SMART.chinchonValue : pointsOf(hand);
}

// Given 8 cards, the discard that leaves the best 7-card hand right now
// (ties: throw the higher card). Returns { cost, index }.
// `costOf` scores a 7-card hand; greedy passes pointsOf instead of the default.
// (`costOf = handCost` is a default argument, like Python's.)
function bestAfterDiscard(hand, costOf = handCost) {
  let best = null;
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.filter((card, j) => j !== i);
    const cost = costOf(rest);
    const better = best === null || cost < best.cost ||
                   (cost === best.cost && cardPoints(hand[i]) > cardPoints(hand[best.index]));
    if (better) best = { cost, index: i };
  }
  return best;
}

// Cards that could still be in the draw pile, as far as player p can tell:
// everything except p's own hand, the discard pile, and cards other players
// are known to be holding (because they took them from the discard pile).
function unseenCards(p, hand) {
  const seen = new Set([...hand, ...state.discardPile].map(cardKey));
  for (let q = 0; q < state.numPlayers; q++) {
    if (q !== p) state.known[q].forEach(card => seen.add(cardKey(card)));
  }
  return createDeck().filter(card => !seen.has(cardKey(card)));
}

// One-step lookahead: if I hold this 7-card hand and draw a random card from
// `pool`, then make the best discard, what is the AVERAGE cost of my hand?
// This rewards hands that are close to completing melds ("outs").
function expectedCostAfterDraw(hand7, pool) {
  if (pool.length === 0) return handCost(hand7);
  let sum = 0;
  for (const card of pool) sum += bestAfterDiscard([...hand7, card]).cost;
  return sum / pool.length;
}

// smart's discard: the card that leaves the hand with the best AVERAGE result after
// the next draw. A card that is one step from a meld is worth keeping even if it has
// a high point value. (Ties, within rounding: throw the higher card.)
function smartDiscard(p) {
  const hand = state.hands[p];
  const unseen = unseenCards(p, hand);
  let best = null;
  for (let i = 0; i < hand.length; i++) {
    const score = expectedCostAfterDraw(hand.filter((card, j) => j !== i), unseen);
    const better = best === null || score < best.score - 1e-9 ||
                   (Math.abs(score - best.score) <= 1e-9 &&
                    cardPoints(hand[i]) > cardPoints(hand[best.index]));
    if (better) best = { score, index: i };
  }
  return best.index;
}

// The top card of the discard pile (call only when the pile is not empty)
const topDiscard = () => state.discardPile[state.discardPile.length - 1];

// ---- Which closes a CPU will consider ----
// The best close for CPU p (findBestClose in rules.js), or null if there is none it
// will take. On top of the rules (no closing in the first lap, see closingAllowed in
// game.js), a CPU never closes with a score that would put its own total over
// SCORE_LIMIT, even when it could re-enter afterwards. A Chinchón is always fine (it
// wins). findBestClose returns the lowest closing score, so if that one goes over,
// every other way of closing would too.
function cpuBestClose(p) {
  if (!closingAllowed()) return null;
  const option = findBestClose(state.hands[p]);
  if (option && !option.info.chinchon &&
      state.totals[p] + option.info.closerScore > SCORE_LIMIT) return null;
  return option;
}

// ---- The base strategies ----

const STRATEGIES = {

  // GREEDY: looks only at the points right now.
  greedy: {
    // Take the top discard only if holding it makes the hand strictly better
    chooseSource(p) {
      if (state.discardPile.length === 0) return "deck";
      const hand = state.hands[p];
      return bestAfterDiscard([...hand, topDiscard()], pointsOf).cost < pointsOf(hand) ? "discard" : "deck";
    },
    // Close as soon as the rules allow it (and it does not put me out, see cpuBestClose)
    chooseClose(p) {
      const option = cpuBestClose(p);
      return option ? option.discardIndex : null;
    },
    // Discard the card that leaves the fewest unmatched points
    chooseDiscard(p) {
      return bestAfterDiscard(state.hands[p], pointsOf).index;
    },
  },

  // SMART: thinks about probabilities.
  smart: {
    // Compare the sure thing (take the visible card) with the gamble (draw a
    // random unseen card), using the average result of the gamble.
    chooseSource(p) {
      if (state.discardPile.length === 0) return "deck";
      const hand = state.hands[p];
      const takeCost = bestAfterDiscard([...hand, topDiscard()]).cost;
      const drawCost = expectedCostAfterDraw(hand, unseenCards(p, hand));
      return takeCost < drawCost - SMART.takeMargin ? "discard" : "deck";
    },

    // Close for a Chinchón or a -10 right away; otherwise close if the score is at
    // most SMART.closeMax.
    chooseClose(p) {
      const option = cpuBestClose(p);
      if (!option) return null;
      const info = option.info;
      if (info.chinchon || info.unmatched.length === 0) return option.discardIndex;
      return info.closerScore > SMART.closeMax ? null : option.discardIndex;
    },

    chooseDiscard: smartDiscard,
  },
};

// ---- End-of-deck awareness (the "finish" strategy) ----
// With a reshuffle limit (state.maxReshuffles) the end of a round can be seen coming:
// once no reshuffles are left, the round ends when someone has to draw from an empty
// deck, and everyone then pays the points in their hand. smart ignores this, which
// costs it in three places:
//   * when the deck is finished, drawing from it ends the round with the hand as it
//     is, so the real choice is "take the discard" or "stop here";
//   * when the deck is empty but will be reshuffled, the next card comes from the
//     discard pile, whose cards are known, not from the unseen cards;
//   * when it will not draw again, building towards future melds is pointless and
//     the discard should simply leave the fewest points.
// Benchmarked against plain smart (6,400 rounds each, A - B, negative = better):
//   reshuffles      0              1              2              5 (default)
//   40-card deck   -0.03 se 0.02  -0.02 se 0.02   0.00 se 0.02  +0.02 se 0.02
//   48-card deck   -0.02 se 0.01  -0.01 se 0.01  -0.01 se 0.01  -0.02 se 0.01
// Never measurably worse and slightly better when the deck runs out often, so hard and
// medium are built on it: the gain is small because these moments are rare and short.
// lastDraws 1 (switch to "points now" one turn earlier) was WORSE: +0.25 se 0.04 on the
// 40-card deck with 0 reshuffles, no difference elsewhere.
// (FINISH's rules never act at 2 players: the 25-card draw pile does not run out.)
const FINISH = {
  lastDraws: 0,      // discard for points now once p expects at most this many more draws
};

// How many more cards p expects to draw from the deck this round (Infinity while the
// deck can still be refilled). Players draw in turn, so with `left` cards in the pile
// and `n` players, p's next draw is the n-th card from now, the one after the 2n-th...
function drawsLeft(p) {
  if (reshufflesLeft() !== 0) return Infinity;              // 0 = the last pile; null or more = no end in sight
  return Math.floor(state.drawPile.length / activePlayers().length);
}

// The cards a draw from the deck could give p: normally the unseen cards, but right
// after the pile ran out it is refilled from the discard pile (all but its top card).
function drawableCards(p, hand) {
  if (state.drawPile.length === 0 && !deckIsFinished()) return state.discardPile.slice(0, -1);
  return unseenCards(p, hand);
}

// FINISH: smart, plus the three end-of-deck rules above. Closing is smart's.
// (`...STRATEGIES.smart` copies smart's functions in; the ones below replace two of them.)
STRATEGIES.finish = {
  ...STRATEGIES.smart,
  chooseSource(p) {
    if (state.discardPile.length === 0) return "deck";
    const hand = state.hands[p];
    const takeCost = bestAfterDiscard([...hand, topDiscard()]).cost;
    // Drawing would end the round now: take the discard only if it improves the hand
    if (deckIsFinished()) return takeCost < handCost(hand) ? "discard" : "deck";
    const drawCost = expectedCostAfterDraw(hand, drawableCards(p, hand));
    return takeCost < drawCost - SMART.takeMargin ? "discard" : "deck";
  },
  chooseDiscard(p) {
    if (drawsLeft(p) <= FINISH.lastDraws) return bestAfterDiscard(state.hands[p]).index;
    return smartDiscard(p);
  },
};

// ---- The levels ----

// Wrap a strategy so that, with probability `chance`, it makes a mistake when
// choosing where to draw from or what to discard. A mistake is the opposite
// source, or a random card. Closing is left alone: a CPU that has a legal close
// takes it, so the mistakes only affect how well the hand is built.
// (`base` is passed in rather than looked up, so any strategy can be wrapped.)
function withMistakes(base, chance) {
  return {
    chooseSource(p) {
      const source = base.chooseSource(p);
      if (decisionRandom() >= chance || state.discardPile.length === 0) return source;
      return source === "deck" ? "discard" : "deck";
    },
    chooseClose: (p) => base.chooseClose(p),
    chooseDiscard(p) {
      if (decisionRandom() >= chance) return base.chooseDiscard(p);
      return Math.floor(decisionRandom() * state.hands[p].length);   // random int 0..n-1
    },
  };
}

// Benchmarked over 3,200 rounds each (2 CPUs of each level, seats and starting player
// rotated). Average points lost per round against hard:
//   easy   (greedy, 25% mistakes)  8.91 worse than hard
//   medium (smart,  16% mistakes)  4.60 worse than hard (target: about half of easy's)
// Tuning medium: 10% -> 2.75, 14% -> 3.81, 16% -> 4.60, 18% -> 4.92, 25% -> 7.82.
// Noise is about +/-0.22, so retune only if you change the strategies.
// (Measured when hard was plain smart; finish plays the same moves except when the
// deck runs out, so it still holds with the default 5 reshuffles.)
STRATEGIES.easy   = withMistakes(STRATEGIES.greedy, EASY_MISTAKE_CHANCE);
STRATEGIES.medium = withMistakes(STRATEGIES.finish, MEDIUM_MISTAKE_CHANCE);
STRATEGIES.hard   = STRATEGIES.finish;  // the very same object: hard IS finish (smart + end-of-deck rules)
