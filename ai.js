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
// (the name shown next to each CPU on the table is the text key "level.<name>" in i18n.js)

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
  // Deeper search was tried later (duplicate dealing, A - B, negative = better), and was
  // not kept: valuing take-vs-draw by the hand one draw later, -0.03 se 0.03 (6,400
  // rounds; 48-card deck -0.04 se 0.04), about 4x slower; a two-draw lookahead for the
  // discard (best 3 candidates only), -0.05 se 0.08, about 20x slower. Both no gain.
  // Combinations of the earlier ideas were also tried, in case they help together
  // (6,400 rounds each, A - B against plain smart, negative = better):
  //   aware late 1.5 + perfectBonus 1 + closeBonus 5          -0.01  se 0.03  no gain
  //   aware late 1.5 + perfectBonus 1 + takeMargin -1         -0.01  se 0.05  no gain
  //   perfectBonus 1 + closeBonus 5 + denyWeight 1.5 + takeMargin -1   +0.18  se 0.05  WORSE
  //   all of the above together (on aware)                    +0.02  se 0.05  no gain
  // Monte Carlo rollouts (the "mc" strategy below) did not beat smart either.
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
// `costOf` scores a 7-card hand; it defaults to handCost (the "risk" strategy
// passes its own). `costOf = handCost` is a default argument, like Python's.
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

// One-step lookahead: if I hold this 7-card hand and draw a random unseen
// card, then make the best discard, what is the AVERAGE cost of my hand?
// This rewards hands that are close to completing melds ("outs").
// (`costOf` as in bestAfterDiscard.)
function expectedCostAfterDraw(hand7, unseen, costOf = handCost) {
  if (unseen.length === 0) return costOf(hand7);
  let sum = 0;
  for (const card of unseen) sum += bestAfterDiscard([...hand7, card], costOf).cost;
  return sum / unseen.length;
}

// ---- Round-length awareness (used by the "aware" strategy) ----
// Rounds are short: about 10-12 turns in total (state.turns), whatever the number of
// players. Early on there is time to build, so cards that are one step from a meld
// are worth more than their lookahead already says. Late, the round may end any turn
// and every unmatched point is about to be paid, so high cards should go now.
const AWARE = {
  lateStart:  6,     // total turns before the round starts to count as "late"
  lateFull:   16,    // total turns by which it counts as fully late
  lateWeight: 0.5,   // late: extra cost per unmatched point left in the hand right now
  earlyBonus: 0.5,   // early: cost taken off for each partial meld (a pair, or two near cards of one suit)
};

// 0 at the start of the round, rising to 1 as it gets late
function lateness() {
  const t = (state.turns - AWARE.lateStart) / (AWARE.lateFull - AWARE.lateStart);
  return Math.min(1, Math.max(0, t));
}

// How many partial melds (pairs, or same-suit cards 1-2 steps apart) the unmatched cards form
function partialMelds(unmatched) {
  let count = 0;
  for (let i = 0; i < unmatched.length; i++) {
    for (let j = i + 1; j < unmatched.length; j++) {
      const a = unmatched[i], b = unmatched[j];
      if (a.value === b.value) count++;
      else if (a.suit === b.suit && Math.abs(rankIndex(a) - rankIndex(b)) <= 2) count++;
    }
  }
  return count;
}

// Cost adjustment for keeping this 7-card hand, given how late it is (lower = better)
function awareAdjustment(hand7) {
  const late = lateness();
  const ev = evaluateHand(hand7);
  return late * AWARE.lateWeight * ev.points - (1 - late) * AWARE.earlyBonus * partialMelds(ev.unmatched);
}

// ---- Game-risk awareness (used by the "risk" strategy) ----
// smart only tries to score few points this round. Near the end of a GAME what matters
// is who goes over SCORE_LIMIT: a hand worth 12 points is a disaster at 92 but harmless
// at 30, and an opponent near the limit is worth ending the round on. These settings
// change the hand cost only when someone is near the limit, so early in a game risk
// plays exactly like smart.
// Going out is only a disaster when it is FINAL. While re-entry is open (the entry
// score would be <= CPU_REENTRY_MAX), going out puts a player back in at the entry
// score, which is LOWER than the total that knocked them out. So all the terms below
// apply only when going out would be final, for me and for the opponent I push.
const RISK = {
  entryGuess:  5,    // how much the entry score may still rise this round (others score too)
  nearLimit:   25,   // a player within this many points of SCORE_LIMIT counts as near it
  bustPenalty: 15,   // extra cost of a hand that would put me over the limit if someone closed now
  overWeight:  1,    // ...plus this much per point it would go over by
  closeSelf:   3,    // when I am near the limit: cost taken off a hand that could close right now
  closePush:   3,    // when an opponent is near it: the same (ending the round may knock them out)
  noBustClose: 0,    // 1 = never close if the closing score itself would put me out for good
                     // (off: it LOSES games, see the results above STRATEGIES.risk)
};

// Points player p can still take without going out (going over the limit is out)
function roomLeft(p) {
  return SCORE_LIMIT - state.totals[p];
}

// If player q went out this round, would it be for good? The entry score would be the
// highest total among the others still in (plus whatever they score this round), and
// it must be <= CPU_REENTRY_MAX for a re-entry.
function outIsFinal(q) {
  let entry = 0;
  for (let r = 0; r < state.numPlayers; r++) {
    if (r !== q && state.inGame[r]) entry = Math.max(entry, state.totals[r]);
  }
  return entry + RISK.entryGuess > CPU_REENTRY_MAX;
}

// Is any other player still in the game near the limit, with no way back if they go out?
function opponentNearLimit(p) {
  for (let q = 0; q < state.numPlayers; q++) {
    if (q !== p && state.inGame[q] && roomLeft(q) <= RISK.nearLimit && outIsFinal(q)) return true;
  }
  return false;
}

// handCost plus the game-risk terms above, for player p's 7-card hand (lower = better)
function riskCost(hand, p) {
  if (isSingleSuitRun(hand)) return -SMART.chinchonValue;
  const s = evalSummary(hand);
  const room = roomLeft(p);
  const final = outIsFinal(p);
  let cost = s.points;
  if (final && s.points > room) cost += RISK.bustPenalty + RISK.overWeight * (s.points - room);

  const canClose = s.melds >= 1 && s.points <= MAX_UNMATCHED_TO_CLOSE;
  if (canClose) {
    if (final && room <= RISK.nearLimit) cost -= RISK.closeSelf;
    if (opponentNearLimit(p))            cost -= RISK.closePush;
  }
  return cost;
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
      return smartDiscard(p, () => 0);
    },
  },
};

// The discard choice shared by smart, aware and risk. `adjust(rest)` adds to the cost of
// keeping the 7 cards `rest` (smart adds nothing; aware adds its round-length terms).
// `costOf` scores the hands in the lookahead (risk passes its own; see bestAfterDiscard).
function smartDiscard(p, adjust, costOf = handCost) {
  const hand = state.hands[p];
  const unseen = unseenCards(p, hand);
  let best = null;
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.filter((card, j) => j !== i);
    let score = expectedCostAfterDraw(rest, unseen, costOf) + adjust(rest);
    if (SMART.denyWeight) score += SMART.denyWeight * denialRisk(p, hand[i]);
    const better = best === null || score < best.score - 1e-9 ||
                   (Math.abs(score - best.score) <= 1e-9 &&
                    cardPoints(hand[i]) > cardPoints(hand[best.index]));
    if (better) best = { score, index: i };
  }
  return best.index;
}

// AWARE: smart, plus the round-length weighting above in the discard choice.
// NOT used by any level: benchmarked against plain smart with duplicate dealing
// (3,200 plays = 1,600 deals each; A - B in avg points per round, lower is better,
// so negative = aware is better; se is of the difference):
//   lateWeight 0.5, earlyBonus 0.5 (defaults)     +0.02  se 0.05  no gain
//   earlyBonus 0 (late dumping only), weight 0.5  -0.01  se 0.03  no gain
//   lateWeight 1.5, earlyBonus 0                  -0.04  se 0.03  no gain
//   lateWeight 4,   earlyBonus 0                  -0.03  se 0.04  no gain
//   lateWeight 0,   earlyBonus 0.5 (early only)   +0.05  se 0.05  no gain
//   lateWeight 0,   earlyBonus 1.5                +0.05  se 0.07  no gain
//   lateWeight 0,   earlyBonus 4                  +0.62  se 0.13  WORSE
//   both 1.5, late from turn 3 to 10              +0.06  se 0.07  no gain
//   lateWeight 4, late from turn 3 to 10          +0.02  se 0.04  no gain
// smart's one-step lookahead already prices partial melds and late rounds barely
// change what the best discard is, so the extra terms rarely alter a decision.
STRATEGIES.aware = {
  ...STRATEGIES.smart,                                   // same source and close decisions
  chooseDiscard(p) { return smartDiscard(p, awareAdjustment); },
};

// RISK: smart, with every hand scored by riskCost (game-risk awareness, see RISK above)
// instead of handCost, and one optional closing rule.
// NOT used by any level. Single rounds cannot show it (all totals are 0 there, so it plays
// exactly like smart), so it was benchmarked over whole games with tools/gamebench.js:
// one risk CPU against hard CPUs, 4,000 games each, 40-card deck. A's share of games won
// (fair share 25% with 4 players, 50% with 2; se about 0.3-0.4):
//   setting                                          4 players   2 players
//   first version (no re-entry check, noBustClose 1)  ~47.6%*     48.5%*   WORSE
//   noBustClose 1 (refuse a close that is final)       23.4%      48.6%    WORSE
//   defaults (noBustClose 0)                           24.9%      50.5%    no gain
//   bustPenalty 40, overWeight 2, close bonuses 8      24.9%      50.5%    no gain
//   push only (closePush 8, the rest 0)                24.9%       -       no gain
//   (* measured with an older A B A B seating, fair share 50%)
// Why: hard already closes at every legal chance and already keeps its points low, so
// the "close earlier, keep low cards, end the round on a weak opponent" levers are mostly
// used already. Refusing a final-bust close is wrong because going out for good only
// happens when the others are high as well: closing makes them pay their (usually larger)
// points, they often go over too, and then the lowest total wins.
// An early version ignored re-entry and did worse: while re-entry is open, going out
// puts a player back in LOWER, so avoiding it (or pushing an opponent into it) is no gain.
STRATEGIES.risk = {
  chooseSource(p) {
    if (state.discardPile.length === 0) return "deck";
    const hand = state.hands[p];
    const top = state.discardPile[state.discardPile.length - 1];
    const costOf = h => riskCost(h, p);                  // a function "bound" to this player
    const takeCost = bestAfterDiscard([...hand, top], costOf).cost;
    const drawCost = expectedCostAfterDraw(hand, unseenCards(p, hand), costOf);
    return takeCost < drawCost - SMART.takeMargin ? "discard" : "deck";
  },
  // Like smart, except that closing with a score that would put me out for good is
  // refused: it is certain elimination, while playing on leaves a chance to improve.
  chooseClose(p) {
    const option = findBestClose(state.hands[p]);
    if (RISK.noBustClose && option && !option.info.chinchon &&
        option.info.closerScore > roomLeft(p) && outIsFinal(p)) return null;
    return STRATEGIES.smart.chooseClose(p);
  },
  chooseDiscard(p) { return smartDiscard(p, () => 0, h => riskCost(h, p)); },
};

// ---- Monte Carlo rollouts (used by the "mc" strategy) ----
// smart looks one draw ahead and only at its own hand. It cannot see how a discard plays
// out over the rest of the round: whether an opponent closes first, how long the round
// lasts, which cards come back. Rollouts estimate that directly. For each candidate discard
// we guess the hidden cards many times ("determinize": deal the unseen cards at random to
// the opponents' hands and the draw pile, keeping the cards they are known to hold), play
// the rest of the round out quickly with a simple policy for everyone, and average the
// points this player ends with. The same guesses are used for every candidate ("common
// random numbers"), so the luck of a guess affects all candidates alike and cancels out.
// NOT used by any level: benchmarked against plain smart (1,600 rounds, A - B, duplicate
// dealing, negative = better):
//   defaults (3 candidates, 48 rollouts, margin 0)   +0.36  se 0.19  no gain (if anything worse)
//   margin 1.5, 96 rollouts                          -0.00  se 0.11  no gain
// It closed and won rounds more often but lost more points when it did not: the quick
// rollout policy is weaker than smart, so the rollouts reward hands that suit a fast
// greedy finish. It is also about 20x slower than smart (about 0.5 s per round).
const MC = {
  candidates: 3,     // roll out only smart's best few discards (the others are rarely right)
  rollouts:   48,    // guessed deals per candidate
  maxTurns:   40,    // a rollout this long ends as a stalemate (everyone scores their points)
  margin:     0,     // keep smart's own pick unless another candidate's rollouts beat it by this many points
};

// A cheap discard rule for inside the rollouts: the card that leaves the fewest unmatched
// points (like greedy, but through the evalSummary cache). Returns { index, points, melds }.
function quickDiscard(hand) {
  let best = null;
  for (let i = 0; i < hand.length; i++) {
    const s = evalSummary(hand.filter((card, j) => j !== i));
    if (best === null || s.points < best.points ||
        (s.points === best.points && cardPoints(hand[i]) > cardPoints(hand[best.index]))) {
      best = { index: i, points: s.points, melds: s.melds };
    }
  }
  return best;
}

// One guess at the hidden cards, as player p sees them: { hands, draw }. Opponents keep
// the cards they are known to hold plus random unseen ones; the rest is the draw pile.
function determinize(p, hand8) {
  const unseen = unseenCards(p, hand8);
  for (let i = unseen.length - 1; i > 0; i--) {                 // Fisher-Yates, as in shuffle()
    const j = Math.floor(decisionRandom() * (i + 1));
    [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
  }
  const hands = state.hands.map((hand, q) => {
    if (q === p || !state.inGame[q]) return [];
    const missing = hand.length - state.known[q].length;
    return [...state.known[q], ...unseen.splice(0, missing)];   // splice removes and returns
  });
  return { hands, draw: unseen };
}

// Play the round on from player p's discard of `top` (p keeps `hand7`), every player
// using the quick policy: take the discard if it lowers your points, close as soon as
// you can. Returns the points p ends the round with. `guess` is not changed.
function rollout(p, hand7, top, guess) {
  const hands = guess.hands.map(hand => [...hand]);
  hands[p] = [...hand7];
  const draw = [...guess.draw];
  let q = p;
  for (let turn = 0; turn < MC.maxTurns; turn++) {
    q = nextActivePlayer(q);
    const hand = hands[q];
    if (quickDiscard([...hand, top]).points < evalSummary(hand).points) {
      hand.push(top);
    } else {
      if (draw.length === 0) break;                             // no reshuffles here: stalemate
      hand.push(draw.pop());
    }
    const d = quickDiscard(hand);
    [top] = hand.splice(d.index, 1);
    if (isSingleSuitRun(hand)) return q === p ? -SMART.chinchonValue : evalSummary(hands[p]).points;
    if (d.melds >= 1 && d.points <= MAX_UNMATCHED_TO_CLOSE) {
      if (q !== p) return evalSummary(hands[p]).points;
      return d.points === 0 ? CLOSE_BONUS : d.points;
    }
  }
  return evalSummary(hands[p]).points;
}

// MC: smart, except that the discard is chosen among smart's best MC.candidates by
// the average result of MC.rollouts rollouts each.
STRATEGIES.mc = {
  ...STRATEGIES.smart,
  chooseDiscard(p) {
    const hand = state.hands[p];
    const unseen = unseenCards(p, hand);
    const scored = hand.map((card, i) => ({ i, score: expectedCostAfterDraw(hand.filter((c, j) => j !== i), unseen) }));
    scored.sort((a, b) => a.score - b.score);
    const shortlist = scored.slice(0, MC.candidates);
    if (shortlist.length < 2 || unseen.length === 0) return scored[0].i;

    const guesses = Array.from({ length: MC.rollouts }, () => determinize(p, hand));
    let best = null;
    for (const { i } of shortlist) {
      const rest = hand.filter((card, j) => j !== i);
      let mean = guesses.reduce((sum, g) => sum + rollout(p, rest, hand[i], g), 0) / guesses.length;
      if (i === shortlist[0].i) mean -= MC.margin;              // smart's pick gets a head start
      if (best === null || mean < best.mean) best = { i, mean };
    }
    return best.i;
  },
};

// ---- End-of-deck awareness (used by the "finish" strategy) ----
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
STRATEGIES.finish = {
  ...STRATEGIES.smart,
  chooseSource(p) {
    if (state.discardPile.length === 0) return "deck";
    const hand = state.hands[p];
    const top = state.discardPile[state.discardPile.length - 1];
    const takeCost = bestAfterDiscard([...hand, top]).cost;
    // Drawing would end the round now: take the discard only if it improves the hand
    if (deckIsFinished()) return takeCost < handCost(hand) ? "discard" : "deck";
    const drawCost = expectedCostAfterDraw(hand, drawableCards(p, hand));
    return takeCost < drawCost - SMART.takeMargin ? "discard" : "deck";
  },
  chooseDiscard(p) {
    if (drawsLeft(p) <= FINISH.lastDraws) return bestAfterDiscard(state.hands[p]).index;
    return smartDiscard(p, () => 0);
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

// The levels. Benchmarked over 3,200 rounds each (2 CPUs of each level, seats and
// starting player rotated). Average points lost per round against hard:
//   easy   (greedy, 25% mistakes)  8.91 worse than hard
//   medium (smart,  16% mistakes)  4.60 worse than hard (target: about half of easy's)
// Tuning medium: 10% -> 2.75, 14% -> 3.81, 16% -> 4.60, 18% -> 4.92, 25% -> 7.82.
// Noise is about +/-0.22, so retune only if you change the strategies.
STRATEGIES.easy   = withMistakes(STRATEGIES.greedy, EASY_MISTAKE_CHANCE);
// (The table above was measured when hard was plain smart; finish plays the same moves
// except when the deck runs out, so it still holds with the default 5 reshuffles.)
STRATEGIES.medium = withMistakes(STRATEGIES.finish, MEDIUM_MISTAKE_CHANCE);
STRATEGIES.hard   = STRATEGIES.finish;  // the very same object: hard IS finish (smart + end-of-deck rules)

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
