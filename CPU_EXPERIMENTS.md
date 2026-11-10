# CPU experiments: what was tried and did not help

The CPU levels in `ai.js` are built on two strategies: `greedy` (points right now) and `smart`
(expected cost after the next draw), plus `finish` (`smart` with end-of-deck rules). Many ideas
for a stronger CPU were benchmarked against `smart` and **none beat it**. This file keeps the
results so they are not re-run without a new idea. The code for the experiments was removed to
keep `ai.js` short; it is in the git history up to commit `e8550f9` (look for `AWARE`, `RISK`,
`MC`, `denialRisk` and the `closeBonus` / `perfectBonus` / `denyWeight` / `waitProb` settings in
`ai.js` there). The opponent-modelling strategy `model` is in commit `588aa48` (below).

A real improvement probably needs deeper search, which costs much more computing time per move.
A simple opponent model was tried too (see "Opponent modelling" below) and did not help. A rollout idea would need a rollout policy close to `smart`'s strength.

How to read the tables: lower points are better. "A - B" is A's average points per round minus
B's, so **negative = A is better**. "se" is the standard error of the difference; a difference
under about two standard errors is noise. See README.md, "Testing", for how the benchmarks work.

## Tuning settings for `smart` (4 players)

Two CPUs using the idea against two plain `smart` CPUs, seats and starting player rotated,
3,200-4,800 rounds, before duplicate dealing (noise about +/-0.25 points):

| Setting | Avg points, idea vs plain | Verdict |
| --- | --- | --- |
| closeBonus 5 (reward a hand that could close now) | 16.84 vs 16.59 | no gain |
| closeBonus 5 + perfectBonus | 16.88 vs 16.82 | no gain |
| perfectBonus alone (value a perfect hand at -10, not 0) | 16.90 vs 16.47 | no gain |
| denyWeight 1.5 (avoid discarding cards an opponent is known to need) | 16.46 vs 16.63 | no gain |
| denyWeight 3 | 17.11 vs 16.21 | WORSE |
| denyWeight 6 | 17.46 vs 16.34 | WORSE |
| takeMargin -1 (take the discard more readily) | 16.69 vs 16.41 | no gain |
| takeMargin +1.5 (take it less readily) | 16.69 vs 16.54 | no gain |

**Waiting to close** (skip a legal close when a perfect hand next turn is likely), against CPUs
that close at once, 3,200 rounds: waiting at a 0.08 chance held off 41% of legal closes and did
WORSE (16.3 vs 15.6 avg points, 23.7% vs 27.2% rounds won); at 0.12 it held off 12% and made no
measurable difference.

## Combinations (duplicate dealing, 6,400 rounds, A - B against plain `smart`)

| Combination | A - B | Verdict |
| --- | --- | --- |
| aware late 1.5 + perfectBonus 1 + closeBonus 5 | -0.01 se 0.03 | no gain |
| aware late 1.5 + perfectBonus 1 + takeMargin -1 | -0.01 se 0.05 | no gain |
| perfectBonus 1 + closeBonus 5 + denyWeight 1.5 + takeMargin -1 | +0.18 se 0.05 | WORSE |
| all of the above together (on aware) | +0.02 se 0.05 | no gain |

## Deeper search

* Valuing take-vs-draw by the hand one draw later: -0.03 se 0.03 (6,400 rounds; 48-card deck
  -0.04 se 0.04), about 4x slower. No gain.
* A two-draw lookahead for the discard (best 3 candidates only): -0.05 se 0.08, about 20x slower.
  No gain.

## Round-length awareness (`aware`)

Rounds are short (about 10-12 turns in total). The idea: early on, value partial melds (pairs,
near cards of one suit) more; late, charge extra per unmatched point so high cards go first.
3,200 plays each, duplicate dealing, A - B against `smart`:

| Setting | A - B | Verdict |
| --- | --- | --- |
| lateWeight 0.5, earlyBonus 0.5 | +0.02 se 0.05 | no gain |
| earlyBonus 0, lateWeight 0.5 | -0.01 se 0.03 | no gain |
| lateWeight 1.5, earlyBonus 0 | -0.04 se 0.03 | no gain |
| lateWeight 4, earlyBonus 0 | -0.03 se 0.04 | no gain |
| lateWeight 0, earlyBonus 0.5 | +0.05 se 0.05 | no gain |
| lateWeight 0, earlyBonus 1.5 | +0.05 se 0.07 | no gain |
| lateWeight 0, earlyBonus 4 | +0.62 se 0.13 | WORSE |
| both 1.5, late from turn 3 to 10 | +0.06 se 0.07 | no gain |
| lateWeight 4, late from turn 3 to 10 | +0.02 se 0.04 | no gain |

Why: `smart`'s one-step lookahead already prices partial melds, and late rounds barely change
which discard is best.

## Game-risk awareness (`risk`)

`smart` only plays for few points this round. `risk` added game-level terms when someone is near
the score limit and going out would be final (no re-entry): a penalty for hands that would bust
me, and bonuses for hands that could close when I or an opponent is near the limit. Single
rounds cannot show this, so it was measured over whole games (`tools/gamebench.js`, one `risk`
CPU against `hard` CPUs, 4,000 games, 40-card deck). A's share of games won (fair share 25% with
4 players, 50% with 2; se about 0.3-0.4):

| Setting | 4 players | 2 players | Verdict |
| --- | --- | --- | --- |
| first version (no re-entry check, refuse final-bust closes) | ~47.6%* | 48.5%* | WORSE |
| refuse a close that would put me out for good | 23.4% | 48.6% | WORSE |
| defaults | 24.9% | 50.5% | no gain |
| bustPenalty 40, overWeight 2, close bonuses 8 | 24.9% | 50.5% | no gain |
| push only (closePush 8, the rest 0) | 24.9% | - | no gain |

(* measured with an older A B A B seating, fair share 50%.)

Why: `hard` already closes at every legal chance and keeps its points low, so these levers are
mostly used already. Refusing a final-bust close is wrong because going out for good only happens
when the others are high too: closing makes them pay their (usually larger) points, they often go
over as well, and then the lowest total wins. While re-entry is open, going out puts a player back
in at a LOWER total, so avoiding it gains nothing.

These numbers were measured before the owner decided that no CPU closes with a score that puts it
over the limit (`cpuBestClose` in `ai.js`). That rule is a choice about how the CPUs behave, not a
strength tweak; the table suggests it costs `hard` a little in close endgames.

## Monte Carlo rollouts (`mc`)

For each of `smart`'s best few discards: guess the hidden cards many times (deal the unseen cards
at random to the opponents and the draw pile, keeping the cards they are known to hold), play the
round out with a quick greedy policy for everyone, and average this player's points. The same
guesses were used for every candidate. 1,600 rounds, A - B against `smart`:

| Setting | A - B | Verdict |
| --- | --- | --- |
| 3 candidates, 48 rollouts, margin 0 | +0.36 se 0.19 | no gain (if anything worse) |
| margin 1.5, 96 rollouts | -0.00 se 0.11 | no gain |
| own discards inside the rollouts use `smart`'s lookahead | +0.30 se 0.19 | no gain |

It closed and won rounds more often but lost more points when it did not. About 20x slower than
`smart` (about 0.5 s per discard).

## Smaller tables (`bench.js --players`)

All of the above was measured at 4 players. Re-checked at 2 and 3 players (6,400 rounds,
40-card deck, 2 reshuffles; A - B against plain `hard`, or `aware` against `smart`):

| Setting | 2 players | 3 players | Verdict |
| --- | --- | --- | --- |
| denyWeight 1.5 | +0.01 se 0.02 | +0.06 se 0.03 | no gain |
| denyWeight 3 | +0.07 se 0.03 | +0.23 se 0.04 | WORSE |
| takeMargin -1 | +0.21 se 0.06 | +0.10 se 0.06 | WORSE / no gain |
| takeMargin +1.5 | -0.01 se 0.06 | +0.01 se 0.05 | no gain |
| closeBonus 5 | -0.06 se 0.04 | -0.00 se 0.03 | no gain |
| perfectBonus 1 | -0.03 se 0.02 | -0.02 se 0.02 | no gain |
| waitProb 0.12 | +0.23 se 0.03 | +0.13 se 0.02 | WORSE |
| aware (vs smart) | -0.02 se 0.05 | -0.04 se 0.02* | no gain |

(* 19,200 rounds.) So one set of settings serves every table size. Even in 1v1, where every
discard goes to the one opponent, holding back the cards they are known to want does not pay.

## Opponent modelling (`model`, commit `588aa48`)

`finish` plus a guess at what each opponent holds, from a public log of the round
(`state.history`: who took which card from the discard pile, who passed on which top card,
who threw what). Each unseen card gets, per opponent, a weight: times `takeFactor` (3) for every
card that opponent took that it could meld with (same number, or same suit within 2), times
`passFactor` (0.7) for every related card they passed on, times `throwFactor` (0.6) for every
related card they threw. Their unknown cards are spread over the unseen cards in proportion.
Two uses, unlike the old `denyWeight` (flat weights from known cards, every opponent):

* **Denial**, against the **next** player only (the only one who can take my discard): each
  discard is charged `denyWeight` x the points they would likely save with it (the chance they
  hold each pair that melds with it, times the pair's points).
* **Draw odds** (`poolWeights` 1): a card that someone probably holds counts less in my
  expected cost after a draw.

With both off it plays exactly like `finish` (checked: difference 0.00). About as fast as `finish`.
A - B against `hard`, 40-card deck, 5 reshuffles unless stated:

| Setting | Table | Rounds | A - B | Verdict |
| --- | --- | --- | --- | --- |
| denyWeight 0.25, no draw odds | 4 players | 3,200 | -0.14 se 0.10 | no gain |
| denyWeight 0.5, no draw odds | 4 players | 3,200 | -0.09 se 0.11 | no gain |
| denyWeight 1, no draw odds | 4 players | 3,200 | +0.62 se 0.13 | WORSE |
| draw odds only | 4 players | 3,200 | -0.10 se 0.07 | no gain |
| takeFactor 6, denyWeight 0.5, no draw odds | 4 players | 3,200 | -0.03 se 0.11 | no gain |
| denyWeight 0.5 + draw odds | 4 players | 3,200 | -0.28 se 0.11 | looked better... |
| denyWeight 0.5 + draw odds | 4 players | 6,400 | -0.11 se 0.08 | ...but not on more deals |
| denyWeight 0.5 + draw odds | 3 players | 6,400 | +0.39 se 0.09 | WORSE |
| denyWeight 0.5 + draw odds | 2 players | 6,400 | +0.23 se 0.09 | WORSE |
| denyWeight 0.5 + draw odds | 48-card deck | 6,400 | +0.05 se 0.08 | no gain |
| denyWeight 0.5 + draw odds | 2 reshuffles | 6,400 | -0.08 se 0.08 | no gain |
| **denyWeight 0.25 + draw odds** | 4 players | 6,400 | **-0.20 se 0.07** | better |
| denyWeight 0.25 + draw odds | 4 players, other seed | 6,400 | **-0.22 se 0.07** | better |
| denyWeight 0.25 + draw odds | 3 players | 6,400 | +0.03 se 0.08 | no gain |
| denyWeight 0.25, no draw odds | 3 players | 6,400 | +0.08 se 0.08 | no gain |
| denyWeight 0.25 + draw odds | 2 players | 6,400 | -0.04 se 0.08 | no gain |
| denyWeight 0.25 + draw odds | 48-card deck | 6,400 | -0.07 se 0.07 | no gain |
| denyWeight 0.25 + draw odds | 48-card, 3 players | 6,400 | +0.16 se 0.09 | no gain (if anything worse) |

("other seed": `SEED` in `bench.js` changed, so entirely new deals.) The one setting that won,
denyWeight 0.25 with draw odds at 4 players, was checked over **whole games**
(`gamebench.js 4000 "model:denyWeight=0.25" hard 40 4`): one `model` CPU against three `hard`
won 24.1% of games (fair share 25.0%, se 0.6), so no gain. Saving about 0.2 points a round at
4 players does not turn into wins, and the strategy is no better at 2 or 3 players, so it was
not kept. A stronger opponent model would need a better guess than these hand-set factors
(for example, factors fitted to what `smart` CPUs actually hold in benchmark games).

## What was kept: `finish` (end-of-deck rules)

`finish` is `smart` plus three rules for when the deck runs out under the reshuffle limit. It is
the base of the medium and hard levels; its results are in the comment above `FINISH` in `ai.js`.
