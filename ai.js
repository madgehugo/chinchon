/* =========================================================
   ai.js: the CPU players
   ---------------------------------------------------------
   Strategies decide WHAT to do; game.js decides WHEN (see cpuTurn there).
   Everything here only reads `state` and the helpers in rules.js.
   ========================================================= */

"use strict";

// CPU difficulty. Each mode lists the strategy for seats 0-3 (seat 0 is you); with fewer
// CPUs in the game only the first entries are used.
// The keys "easy", "medium" and "hard" refer to entries in STRATEGIES (section 4d).
const CPU_MODES = {
  easy:   [null, "easy",   "easy",   "easy"],
  medium: [null, "medium", "medium", "medium"],
  hard:   [null, "hard",   "hard",   "hard"],
  mixed:  [null, "easy",   "medium", "hard"],   // one CPU of each level
};
// The name shown next to each CPU on the table
const LEVEL_LABEL = { easy: "easy", medium: "medium", hard: "hard" };

// Chance (0 to 1) that a CPU makes a deliberate mistake on a decision (where to
// draw from, what to discard). Easy plays "greedy" with mistakes; medium plays
// the "smart" strategy with fewer mistakes. Hard never makes one. Medium's value
// was tuned with tools/bench.js (results in the comment above STRATEGIES.easy).
const EASY_MISTAKE_CHANCE   = 0.25;
const MEDIUM_MISTAKE_CHANCE = 0.16;

/* ---------------------------------------------------------
   4d. CPU STRATEGIES
   ---------------------------------------------------------
   A strategy is an object with three decision functions. Each receives the
   player index `p` and reads the table from `state`:
     chooseSource(p)  -> "deck" or "discard"     (hand has 7 cards)
     chooseClose(p)   -> discard index to close with, or null to keep playing
                         (hand has 8 cards, after drawing)
     chooseDiscard(p) -> index of the card to throw away (hand has 8 cards)
   cpuTurn() calls them in that order. Adding a new CPU level is just adding
   another entry to STRATEGIES at the bottom of this section. The three levels
   shown to the player (easy, medium, hard) are built from the two base
   strategies, greedy and smart.
   --------------------------------------------------------- */

// Tunable settings for the "smart" strategy
const SMART = {
  chinchonValue: 100,  // how much a Chinchón is worth, in "points saved" (it wins the game)
  takeMargin:    0,    // take the discard only if it beats drawing by more than this
  closeMax:      7,    // never close above this many unmatched points
  // "Hold off closing" option: skip a legal close if the chance of a perfect hand
  // next turn is >= waitProb (a value above 1 means never wait). Benchmarked over
  // 3,200 rounds against CPUs that close immediately: waitProb 0.08 waited on 41%
  // of legal closes and did WORSE (16.3 vs 15.6 avg points, 23.7% vs 27.2% rounds
  // won); 0.12 waited on 12% and made no measurable difference. So it stays off.
  waitProb:      1.01,
  waitMinScore:  3,    // ...and it only applies when closing now would score at least this

  // ---- Ideas for a stronger CPU. All are OFF (0) because none beat the settings above. ----
  // Each was played as 2 CPUs using the idea vs 2 plain smart CPUs, seats and starting
  // player rotated so neither side got an edge. The same test with two identical CPUs
  // differs by about +/-0.25 points, so smaller differences are noise.
  //   setting                       avg points/round, idea vs plain    (3,200-4,800 rounds)
  //   closeBonus 5                   16.84 vs 16.59   no gain
  //   closeBonus 5 + perfectBonus    16.88 vs 16.82   no gain
  //   perfectBonus alone             16.90 vs 16.47   no gain
  //   denyWeight 1.5                 16.46 vs 16.63   no gain
  //   denyWeight 3                   17.11 vs 16.21   WORSE
  //   denyWeight 6                   17.46 vs 16.34   WORSE
  //   takeMargin -1                  16.69 vs 16.41   no gain
  //   takeMargin +1.5                16.69 vs 16.54   no gain
  // (Lower is better.) A real step up probably needs deeper search or simulating
  // opponents, which costs much more computing time per move.
  closeBonus:   0,     // reward a hand that could close right now (a meld and <= 7 points)
  perfectBonus: 0,     // 1 = value a hand with no unmatched cards at the real -10, not 0
  denyWeight:   0,     // penalty for discarding a card an opponent is known to need
};

// ---- Helpers shared by the smart strategy ----

// Is this 7-card hand a Chinchón (one suit, 7 consecutive cards)? Cheap check.
function isSingleSuitRun(hand) {
  if (hand.length !== CHINCHON_LENGTH) return false;
  if (!hand.every(card => card.suit === hand[0].suit)) return false;
  const ranks = hand.map(rankIndex).sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
}

// How "bad" a 7-card hand is (lower = better): its unmatched points, or a big
// negative number for a Chinchón. Two optional tweaks (see SMART) make the
// number closer to what the hand is really worth in the game.
function handCost(hand) {
  if (isSingleSuitRun(hand)) return -SMART.chinchonValue;
  const s = evalSummary(hand);
  let cost = (s.points === 0 && SMART.perfectBonus) ? CLOSE_BONUS : s.points;
  if (s.melds >= 1 && s.points <= MAX_UNMATCHED_TO_CLOSE) cost -= SMART.closeBonus;
  return cost;
}

// How much would discarding `card` help the opponents, as far as we can tell?
// We only know the cards they took from the discard pile and still hold
// (state.known). If the card would complete a group or run of three with two
// of those cards the risk is 2; if it would pair up with one, 0.5.
function denialRisk(p, card) {
  let risk = 0;
  const r = rankIndex(card);
  for (let q = 0; q < state.numPlayers; q++) {
    if (q === p || !state.inGame[q]) continue;
    const known = state.known[q];
    if (known.length === 0) continue;

    // Group: same value as the known cards
    const sameValue = known.filter(k => k.value === card.value).length;
    let rq = sameValue >= 2 ? 2 : sameValue === 1 ? 0.5 : 0;

    // Run: the known cards of this suit, as positions in the deck order
    const ranks = new Set(known.filter(k => k.suit === card.suit).map(rankIndex));
    if ((ranks.has(r - 2) && ranks.has(r - 1)) || (ranks.has(r - 1) && ranks.has(r + 1)) ||
        (ranks.has(r + 1) && ranks.has(r + 2))) rq = Math.max(rq, 2);
    else if (ranks.has(r - 1) || ranks.has(r + 1)) rq = Math.max(rq, 0.5);

    risk += rq;
  }
  return risk;
}

// Given 8 cards, the discard that leaves the best 7-card hand right now.
function bestAfterDiscard(hand) {
  let best = null;
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.filter((card, j) => j !== i);
    const cost = handCost(rest);
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

// One-step lookahead: if I hold this 7-card hand and draw a random unseen
// card, then make the best discard, what is the AVERAGE cost of my hand?
// This rewards hands that are close to completing melds ("outs").
function expectedCostAfterDraw(hand7, unseen) {
  if (unseen.length === 0) return handCost(hand7);
  let sum = 0;
  for (const card of unseen) sum += bestAfterDiscard([...hand7, card]).cost;
  return sum / unseen.length;
}

// ---- The base strategies (greedy, smart) and the three levels built from them ----

const STRATEGIES = {

  // SIMPLE: purely greedy. Looks only at the points right now.
  greedy: {
    // Take the top discard only if holding it makes the hand strictly better
    chooseSource(p) {
      if (state.discardPile.length === 0) return "deck";
      const hand = state.hands[p];
      const top = state.discardPile[state.discardPile.length - 1];
      return bestDiscard([...hand, top]).points < evaluateHand(hand).points ? "discard" : "deck";
    },
    // Close as soon as the rules allow it
    chooseClose(p) {
      const option = findBestClose(state.hands[p]);
      return option ? option.discardIndex : null;
    },
    // Discard the card that leaves the fewest unmatched points
    chooseDiscard(p) {
      return bestDiscard(state.hands[p]).index;
    },
  },

  // SMART: thinks about probabilities.
  smart: {
    // Compare the sure thing (take the visible card) with the gamble (draw a
    // random unseen card), using the average result of the gamble.
    chooseSource(p) {
      if (state.discardPile.length === 0) return "deck";
      const hand = state.hands[p];
      const top = state.discardPile[state.discardPile.length - 1];
      const takeCost = bestAfterDiscard([...hand, top]).cost;
      const drawCost = expectedCostAfterDraw(hand, unseenCards(p, hand));
      return takeCost < drawCost - SMART.takeMargin ? "discard" : "deck";
    },

    // Close for a Chinchón or a -10 right away. Otherwise close if the points
    // are low enough, unless a perfect hand is likely next turn (see SMART).
    chooseClose(p) {
      const hand = state.hands[p];
      const option = findBestClose(hand);
      if (!option) return null;

      const info = option.info;
      if (info.chinchon || info.unmatched.length === 0) return option.discardIndex;
      if (info.closerScore > SMART.closeMax) return null;

      if (info.closerScore >= SMART.waitMinScore && SMART.waitProb <= 1) {
        // Keep the hand we would play on with, and see how often one more draw
        // gives a perfect hand (cost <= 0 means no unmatched cards or Chinchón).
        const keep = this.chooseDiscard(p);                   // index we would throw away
        const rest = hand.filter((card, i) => i !== keep);
        const unseen = unseenCards(p, hand);
        const perfect = unseen.filter(card => bestAfterDiscard([...rest, card]).cost <= 0).length;
        if (unseen.length > 0 && perfect / unseen.length >= SMART.waitProb) return null;
      }
      return option.discardIndex;
    },

    // Discard the card that leaves the hand with the best AVERAGE result after
    // the next draw. A card that is one step from a meld is worth keeping even
    // if it has a high point value.
    chooseDiscard(p) {
      const hand = state.hands[p];
      const unseen = unseenCards(p, hand);
      let best = null;
      for (let i = 0; i < hand.length; i++) {
        const rest = hand.filter((card, j) => j !== i);
        let score = expectedCostAfterDraw(rest, unseen);
        if (SMART.denyWeight) score += SMART.denyWeight * denialRisk(p, hand[i]);
        const better = best === null || score < best.score - 1e-9 ||
                       (Math.abs(score - best.score) <= 1e-9 &&
                        cardPoints(hand[i]) > cardPoints(hand[best.index]));
        if (better) best = { score, index: i };
      }
      return best.index;
    },
  },
};

// Wrap a strategy so that, with probability `chance`, it makes a mistake when
// choosing where to draw from or what to discard. A mistake is the opposite
// source, or a random card. Closing is left alone: a CPU that has a legal close
// takes it, so the mistakes only affect how well the hand is built.
// (`base` is passed in rather than looked up, so any strategy can be wrapped.)
function withMistakes(base, chance) {
  return {
    chooseSource(p) {
      const source = base.chooseSource(p);
      if (Math.random() >= chance || state.discardPile.length === 0) return source;
      return source === "deck" ? "discard" : "deck";
    },
    chooseClose: (p) => base.chooseClose(p),
    chooseDiscard(p) {
      if (Math.random() >= chance) return base.chooseDiscard(p);
      return Math.floor(Math.random() * state.hands[p].length);   // random int 0..n-1
    },
  };
}

// The levels. Benchmarked over 3,200 rounds each (2 CPUs of each level, seats and
// starting player rotated). Average points lost per round against hard:
//   easy   (greedy, 25% mistakes)  8.91 worse than hard
//   medium (smart,  16% mistakes)  4.60 worse than hard (target: about half of easy's)
// Tuning medium: 10% -> 2.75, 14% -> 3.81, 16% -> 4.60, 18% -> 4.92, 25% -> 7.82.
// Noise is about +/-0.22, so retune only if you change the strategies.
STRATEGIES.easy   = withMistakes(STRATEGIES.greedy, EASY_MISTAKE_CHANCE);
STRATEGIES.medium = withMistakes(STRATEGIES.smart, MEDIUM_MISTAKE_CHANCE);
STRATEGIES.hard   = STRATEGIES.smart;   // the very same object: hard IS smart, unchanged

// (Simple strategy helper.) Which card should this 8-card hand discard? Try
// each one and keep the choice that leaves the fewest unmatched points
// (ties: throw the higher card).
function bestDiscard(hand) {
  let best = null;
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.filter((card, j) => j !== i);
    const points = evaluateHand(rest).points;
    const better = best === null || points < best.points ||
                   (points === best.points && cardPoints(hand[i]) > cardPoints(hand[best.index]));
    if (better) best = { index: i, points };
  }
  return best;
}
