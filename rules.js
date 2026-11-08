/* =========================================================
   rules.js: the rules of Chinchón (no display code, no CPU logic)
   ---------------------------------------------------------
   Everything here is "pure": functions take cards or hands and return
   answers without touching the page or the game state. That makes them
   easy to test (see tests.js) and to reuse (ai.js builds on them).

   Quick translation guide from Python/R:
     const x = ...      constant binding (can't be reassigned)
     let x = ...        normal variable
     [ ... ]            array  (Python list / R vector)
     { a: 1, b: 2 }     object (Python dict / R named list)
     arr.map(f)         like a list comprehension / sapply
     arr.push(x)        like list.append(x)
     arr.pop()          removes & returns the LAST element
     x => x * 2         arrow function (Python lambda)
     `Hi ${name}`       template string (Python f-string)
   ========================================================= */

"use strict"; // makes JS stricter about mistakes (catches typos)

/* ---------------------------------------------------------
   1. CONSTANTS: the shape of a Spanish deck
   --------------------------------------------------------- */
const SUITS  = ["oros", "copas", "espadas", "bastos"];
// Two deck variants. The 48-card deck adds the 8s and 9s, which suits bigger
// tables. `VALUES` is the list currently in use; it is a `let` (not `const`)
// because setDeckSize() swaps it. Everything else (building the deck, run
// detection via rankIndex) reads VALUES, so it adapts automatically.
const VALUES_40 = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const VALUES_48 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
let VALUES = VALUES_40;
let DECK_SIZE = 40;      // 40 or 48; kept in step with VALUES by setDeckSize()

function setDeckSize(size) {
  VALUES = (size === 48) ? VALUES_48 : VALUES_40;
  DECK_SIZE = (size === 48) ? 48 : 40;
  evalCache.clear();     // cached hand scores depend on which cards are consecutive
}

const SUIT_SYMBOL = { oros: "🪙", copas: "🏆", espadas: "🗡️", bastos: "🪵" };

const MAX_PLAYERS    = 4;   // seats at the table: player 0 = you, players 1-3 = CPUs (or, online, other people)
const MIN_PLAYERS    = 2;   // you plus at least one other player
// (how many seats are actually used in the current game is state.numPlayers, in game.js)
const CARDS_PER_HAND = 7;
// (player names are text, so they live in i18n.js: see playerName)

/* ---------------------------------------------------------
   2. DECK FUNCTIONS
   --------------------------------------------------------- */

// Build an ordered deck (40 or 48 cards, see VALUES). Each card is a small object.
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });   // shorthand for { suit: suit, value: value }
    }
  }
  return deck;
}

// The random number source used by shuffle(). The game uses Math.random; the
// benchmark swaps in a seeded generator with setRandom() so that the same deal
// can be replayed. (A function can be stored in a variable and replaced, like
// assigning a callable to a name in Python.)
let random = Math.random;
function setRandom(fn) { random = fn; }

// A second, separate source for the CPUs' deliberate mistakes (easy and medium levels,
// see ai.js). Keeping it apart from the shuffle means a different decision in one play
// can never change which cards a later shuffle produces.
let decisionRandom = Math.random;
function setDecisionRandom(fn) { decisionRandom = fn; }

// A small seeded random number generator (mulberry32): the same seed always gives
// the same sequence of numbers between 0 and 1. Only used by the Node benchmarks.
function makeSeededRandom(seed) {
  let a = seed >>> 0;                  // keep it a 32-bit unsigned integer
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle: walk backwards, swapping each card with a
// randomly chosen card at or before it. Unbiased, unlike sort(random).
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));   // random int 0..i
    [deck[i], deck[j]] = [deck[j], deck[i]];         // swap
  }
  return deck;
}

/* ---------------------------------------------------------
   3. HAND EVALUATION: melds, points, closing rules
   ---------------------------------------------------------
   Terminology:
     - Group: 3 or 4 cards of the SAME VALUE (any suits)
     - Run:   3+ cards of the SAME SUIT in consecutive order
              (deck order is 1 2 3 4 5 6 7 10 11 12, so 7-10-11 counts)
     - Meld:  a group or a run
     - Unmatched cards: cards that are not part of any chosen meld
   A card can only belong to ONE meld at a time.
   --------------------------------------------------------- */

// ---- Rule constants (change here if your house rules change) ----
const SCORE_LIMIT            = 100;  // player is out when total goes over this
const MAX_UNMATCHED_TO_CLOSE = 7;    // unmatched points allowed when closing
const CLOSE_BONUS            = -10;  // score for closing with NO unmatched cards
const CHINCHON_LENGTH        = 7;    // a 7-card run in one suit = Chinchón
const CHINCHON_ENDS_GAME     = true; // traditional rule: Chinchón wins the whole game
const CPU_REENTRY_MAX        = 70;   // a CPU re-enters only if the entry score is <= this
const MAX_RESHUFFLES         = 5;    // default for state.maxReshuffles: if the deck runs out more
                                     // than this many times in a round, the round ends with no closer
                                     // (the Node tools use it; the browser starts from the option marked
                                     // `selected` in index.html, which is 2)

// Points an unmatched card costs. Traditional rule: figures (10, 11, 12)
// are worth 10 points each; 1-7 are worth their face value.
function cardPoints(card) {
  return card.value >= 10 ? 10 : card.value;
}

// Position of a card in the deck order: values 1..7 -> 0..6, 10 -> 7,
// 11 -> 8, 12 -> 9. Two cards are "consecutive" if their ranks differ by 1.
// (So 7 and 10 are consecutive, but 12 and 1 are not: no wrap-around.)
function rankIndex(card) {
  return VALUES.indexOf(card.value);
}

// All ways to choose `size` items from `items` (like Python's
// itertools.combinations). Recursive: either take the first item or skip it.
function combinations(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;                 // destructuring
  const withFirst    = combinations(rest, size - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, size);
  return withFirst.concat(withoutFirst);
}

// Find EVERY possible meld in a hand. Melds are described by the INDICES
// of the cards in the hand (not copies), so we can check overlaps easily.
function findAllMelds(hand) {
  const melds = [];
  const allIdx = hand.map((card, i) => i);        // [0, 1, 2, ...]

  // Groups: for each value, every subset of 3 or more cards with that value
  for (const value of VALUES) {
    const idx = allIdx.filter(i => hand[i].value === value);
    for (let size = 3; size <= idx.length; size++) {
      for (const combo of combinations(idx, size)) {
        melds.push({ type: "group", indices: combo });
      }
    }
  }

  // Runs: per suit, sort by rank, then extend each start point while the
  // next card is consecutive. Every stretch of 3+ is a valid run.
  for (const suit of SUITS) {
    const idx = allIdx
      .filter(i => hand[i].suit === suit)
      .sort((a, b) => rankIndex(hand[a]) - rankIndex(hand[b]));
    for (let start = 0; start < idx.length; start++) {
      let end = start;
      while (end + 1 < idx.length &&
             rankIndex(hand[idx[end + 1]]) === rankIndex(hand[idx[end]]) + 1) {
        end++;
        if (end - start >= 2) {
          melds.push({ type: "run", indices: idx.slice(start, end + 1) });
        }
      }
    }
  }
  return melds;
}

// Find the arrangement of non-overlapping melds that leaves the FEWEST
// unmatched points. Brute force (try every combination of melds) is fine
// for 7-8 cards. Returns { melds, unmatched, points }.
function evaluateHand(hand) {
  const allMelds = findAllMelds(hand);
  const totalPoints = hand.reduce((sum, card) => sum + cardPoints(card), 0);

  let best = { melds: [], points: totalPoints };  // start: no melds at all

  // Depth-first search. `from` makes us consider melds in order, so we
  // never try the same set twice in a different order.
  function search(from, used, chosen, meldedPoints) {
    const points = totalPoints - meldedPoints;
    if (points < best.points) best = { melds: [...chosen], points };

    for (let k = from; k < allMelds.length; k++) {
      const meld = allMelds[k];
      if (meld.indices.some(i => used.has(i))) continue;   // overlaps: skip

      meld.indices.forEach(i => used.add(i));
      chosen.push(meld);
      const pts = meld.indices.reduce((s, i) => s + cardPoints(hand[i]), 0);
      search(k + 1, used, chosen, meldedPoints + pts);
      chosen.pop();                                         // undo (backtrack)
      meld.indices.forEach(i => used.delete(i));
    }
  }
  search(0, new Set(), [], 0);

  // Convert indices back into real cards for the caller
  const usedIdx = new Set(best.melds.flatMap(m => m.indices));
  return {
    melds: best.melds.map(m => ({ type: m.type, cards: m.indices.map(i => hand[i]) })),
    unmatched: hand.filter((card, i) => !usedIdx.has(i)),
    points: best.points,
  };
}

// Chinchón: the whole 7-card hand is a single run in one suit.
// Checked separately because a 7-run can also be split as 3+4, which
// would hide it from the "fewest points" search above.
function isChinchon(hand) {
  return hand.length === CHINCHON_LENGTH &&
         findAllMelds(hand).some(m => m.type === "run" && m.indices.length === CHINCHON_LENGTH);
}

// Everything the game needs to know about a hand at closing time.
//   canClose    - at least one meld AND unmatched points <= 7
//   chinchon    - 7-card run: wins the round outright
//   closerScore - what the closer adds to their total
//                 (-10 if no unmatched cards and not Chinchón)
function getCloseInfo(hand) {
  const ev = evaluateHand(hand);
  const chinchon = isChinchon(hand);
  const canClose = chinchon ||
                   (ev.melds.length >= 1 && ev.points <= MAX_UNMATCHED_TO_CLOSE);

  let closerScore = null;
  if (canClose && !chinchon) {
    closerScore = ev.unmatched.length === 0 ? CLOSE_BONUS : ev.points;
  }
  return { ...ev, chinchon, canClose, closerScore };
}

// With 8 cards in hand (after drawing), which card should be discarded to
// close the round? Tries each discard; prefers Chinchón, then lowest score.
// Returns { discardIndex, info } or null if no discard allows closing.
// Used by the "Close round" button and by the CPU strategies.
function findBestClose(hand) {
  let best = null;
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.filter((card, j) => j !== i);
    const info = getCloseInfo(rest);
    if (!info.canClose) continue;
    const rank = info.chinchon ? -Infinity : info.closerScore;   // lower = better
    if (best === null || rank < best.rank) best = { discardIndex: i, info, rank };
  }
  return best && { discardIndex: best.discardIndex, info: best.info };
}

// Do these cards make ONE meld, all of them together (one group or one run)?
function isMeld(cards) {
  return cards.length >= 3 && findAllMelds(cards).some(m => m.indices.length === cards.length);
}

/* ---------------------------------------------------------
   4. LAYING OFF: leftover cards onto other players' melds
   ---------------------------------------------------------
   An optional rule (state.layoffMode in game.js): once a round is closed, the
   other players may get rid of leftover cards by adding them to melds on the
   table, so those cards no longer count against them. A card can only extend
   a meld (the 4th card of a group, or the next card at either end of a run),
   and a card just laid off can itself be built on: 7 then 10 onto 4-5-6.
   --------------------------------------------------------- */

// The best way to lay off `cards` onto `melds` (an array of card arrays): the placement
// that gets rid of the most points. Order matters: a group of 5s can take the 5 of
// bastos, but so can the run 6-7-10 of bastos, and only the run then takes the 4 too.
// So this tries every order (a depth-first search like evaluateHand's), skipping
// placements it has already seen in another order. Returns [{ card, meld }, ...]
// (meld = index into `melds`) in an order that can be played out one by one.
function bestLayoff(cards, melds) {
  const table = melds.map(m => [...m]);       // copies that the search grows and shrinks
  const seen = new Set();                     // placements already explored, as text keys
  let best = { points: 0, moves: [] };

  function search(left, moves, points) {
    // The same cards in the same melds, whatever the order, is the same position
    const key = moves.map(m => `${cardKey(m.card)}>${m.meld}`).sort().join(" ");
    if (seen.has(key)) return;
    seen.add(key);
    if (points > best.points) best = { points, moves: [...moves] };

    left.forEach((card, i) => {
      table.forEach((meld, k) => {
        if (!isMeld([...meld, card])) return;              // does not fit this meld
        meld.push(card);
        moves.push({ card, meld: k });
        search(left.filter((c, j) => j !== i), moves, points + cardPoints(card));
        moves.pop();                                       // undo (backtrack)
        meld.pop();
      });
    });
  }
  search(cards, [], 0);
  return best.moves;
}

/* ---------------------------------------------------------
   5. REMEMBERING EVALUATIONS
   ---------------------------------------------------------
   evaluateHand() is the slow part, and the same hands come up again and again
   (especially while the CPUs look ahead). So we remember the answers: a "cache"
   or "memo". The key ignores card order, since the order doesn't change the score.
   --------------------------------------------------------- */
const cardKey = card => card.suit[0] + card.value;                 // e.g. "o12"
const handKey = hand => hand.map(cardKey).sort().join(" ");        // order-independent

const evalCache = new Map();
// Returns { points, melds } where `melds` is how many melds the best split uses.
function evalSummary(hand) {
  const key = handKey(hand);
  let summary = evalCache.get(key);
  if (summary === undefined) {
    const ev = evaluateHand(hand);
    summary = { points: ev.points, melds: ev.melds.length };
    if (evalCache.size > 200000) evalCache.clear();                // keep memory bounded
    evalCache.set(key, summary);
  }
  return summary;
}
// Just the unmatched points of a hand (cached)
function pointsOf(hand) { return evalSummary(hand).points; }
