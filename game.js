/* =========================================================
   game.js: game state and the flow of play
   ---------------------------------------------------------
   Holds `state` (everything that changes), deals rounds, runs turns for
   you and the CPUs, closes rounds and keeps score. It never builds HTML
   itself: it just calls render() and setStatus(), which live in ui.js.
   It also never stores a finished sentence: messages are kept as msg(key, data)
   (see i18n.js) so they can be shown in whichever language is current.
   ========================================================= */

"use strict";

// A CPU turn has two beats so you can follow it: first it draws (you see which
// pile it took from), then, after a pause, it discards. These are the pauses in
// milliseconds before each beat; the "CPU speed" dropdown picks a row.
const CPU_SPEEDS = {
  slow:   { draw: 2000, discard: 1600 },
  normal: { draw: 1200, discard: 1000 },
  fast:   { draw:  450, discard:  350 },
};

/* ---------------------------------------------------------
   1. GAME STATE: one object holding everything that changes.
   The rendering functions in ui.js only READ this; game logic WRITES it.
   Keeping state separate from display is the key design idea.
   --------------------------------------------------------- */
const state = {
  drawPile:    [],   // array of cards; the LAST element is the top card
  discardPile: [],   // same convention
  hands:       [],   // hands[0] = human's cards, hands[1..] = CPUs
  numPlayers:  MAX_PLAYERS,   // seats in use this game (2-4): you plus 1-3 CPUs. All per-player arrays have this length.
                             // (the browser's first-visit defaults for this and the other settings are the
                             // `selected` options in index.html: 1 CPU, 2 reshuffles, 1 re-entry)
  currentPlayer: 0,  // index of whose turn it is

  // Where we are inside a turn. Every turn is: draw -> (close, or discard).
  //   "draw"      - current player must take a card (hand has 7 cards)
  //   "discard"   - current player holds 8 cards and must discard one
  //   "roundOver" - someone closed; nothing more can be played
  phase: "draw",
  revealed: false,   // true after the round ends: show every hand face-up
  roundResult: null, // { closer, chinchon, points[] } once the round ends
  timer: null,       // id of the pending CPU setTimeout (so we can cancel it)
  reshuffles: 0,     // how many times the draw pile has been refilled this round
  turns: 0,          // turns completed so far this round (all players); see closingAllowed
  closing: false,    // true while you are choosing which card to close with
  lastDrawn: null,   // the card you drew this turn (your hand marks it until you discard)
  sortMode: "number",// how the Sort button orders your hand: "number" or "suit"
  cpuMode: "hard",   // "easy" | "medium" | "hard" | "mixed" (see CPU_MODES)
  cpuSpeed: "normal",// "slow" | "normal" | "fast" (see CPU_SPEEDS)
  showHints: false,  // is the hand analysis table visible? (off by default)
  showSettings: false, // is the settings panel open?
  showHelp: false,   // is the help panel (rules, settings, keys) open?
  showScores: false, // is the scores panel open?
  maxReshuffles: MAX_RESHUFFLES, // reshuffles allowed per round (null = no limit); a setting
  roundLimit: null,  // rounds per game (null = no limit: play until one player is left); a setting
  maxReentries: null, // times each player may re-enter after elimination (null = no limit); a setting
  layoffMode: "none", // laying off leftovers after a close: "auto" | "manual" | "none"; a setting
                      // (the Node tools keep "none"; the browser starts from index.html, "auto")
  layoff: null,       // while lay-offs are under way: { order: [players, in turn order], next: index into order }

  // What every player can see: cards a player took from the discard pile are
  // known to be in their hand until they discard them again. The smart-based CPUs
  // use this to work out which cards can still come from the draw pile (unseenCards in ai.js).
  known: [[], [], [], []],
  // Which strategy each CPU uses (see STRATEGIES). Index 0 is the human.
  cpuLevels: [null, "hard", "hard", "hard"],

  // ---- Game-level state: lasts across rounds ----
  round: 0,
  deals: 0,                           // how many times cards have been dealt (the UI plays the dealing animation when it changes)
  totals: [0, 0, 0, 0],               // running score per player (lower is better)
  inGame: [true, true, true, true],   // false = eliminated (may re-enter)
  startPlayer: 0,                     // who plays first this round (rotates)
  roundPoints: [null, null, null, null], // points from the last round (null = didn't play)
  entryScore: 0,                      // total a re-entering player starts with
  reentries: [0, 0, 0, 0],            // how many times each player has re-entered this game
  awaitingReentry: false,             // true while the human must choose re-enter / stay out
  gameOver: false,
  winner: null,
  status: [],                         // messages (see msg in i18n.js) shown in the status line; set by setStatus()
  summary: [],                        // messages describing how the last round ended
  notice: [],                         // messages about eliminations / re-entries after the last round
  roundDetail: null,                  // per-player breakdown of the round that just ended
  showResults: false,                 // is the results panel open?
};

/* ---------------------------------------------------------
   2. GAME SETUP: shuffle, deal, flip first discard, set turn
   --------------------------------------------------------- */
// Start a brand-new GAME: reset all scores, then start round 1.
// `cpuCount` (1-3) optionally changes how many CPUs play; omitted, it keeps the current number.
function newGame(cpuCount) {
  clearTimeout(state.timer);
  // The "New game" buttons call newGame(clickEvent), so only trust a plain number
  if (typeof cpuCount === "number") {
    state.numPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, cpuCount + 1));
  }
  state.round = 0;
  state.totals = Array(state.numPlayers).fill(0);
  state.inGame = Array(state.numPlayers).fill(true);
  state.reentries = Array(state.numPlayers).fill(0);
  state.startPlayer = 0;                       // you play first in round 1
  state.roundPoints = Array(state.numPlayers).fill(null);
  state.awaitingReentry = false;
  state.gameOver = false;
  state.winner = null;
  state.summary = [];
  state.notice = [];
  startRound();
}

// Start a new ROUND within the current game: shuffle, deal to the players
// who are still in the game, flip the first discard, and begin the turns.
function startRound() {
  // Fresh shuffled deck
  state.drawPile = shuffle(createDeck());

  // Empty hands for each player, e.g. [[], [], []]
  state.hands = Array.from({ length: state.numPlayers }, () => []);

  // Deal one card at a time around the table (like a real dealer),
  // rather than 7 in a row to each player.
  for (let n = 0; n < CARDS_PER_HAND; n++) {
    for (let p = 0; p < state.numPlayers; p++) {
      if (state.inGame[p]) state.hands[p].push(state.drawPile.pop());   // skip eliminated players
    }
  }

  // Turn the next card face-up to start the discard pile
  state.discardPile = [state.drawPile.pop()];

  clearTimeout(state.timer);        // cancel any CPU move left from a previous round
  state.round++;
  state.deals++;
  state.reshuffles = 0;
  state.turns = 0;
  state.lastDrawn = null;
  state.known = Array.from({ length: state.numPlayers }, () => []);
  state.currentPlayer = state.inGame[state.startPlayer]
    ? state.startPlayer
    : nextActivePlayer(state.startPlayer);
  state.phase = "draw";
  state.revealed = false;
  state.roundResult = null;
  state.roundDetail = null;
  state.layoff = null;
  state.showResults = false;

  beginTurn();
}

/* ---------------------------------------------------------
   3. TURN LOGIC: what happens when players act
   ---------------------------------------------------------
   Pattern used everywhere below:
     1. check the action is allowed (right player, right phase)
     2. change `state`
     3. call render() so the page reflects the new state
   --------------------------------------------------------- */

// If the draw pile ran out, shuffle the discard pile back in
// (leaving its top card in place so there is still something to take).
// Returns false if the pile could not be refilled (stalemate).
function refillDrawPileIfEmpty() {
  if (state.drawPile.length > 0) return true;
  if (deckIsFinished()) return false;

  state.reshuffles++;
  const top = state.discardPile.pop();
  state.drawPile = shuffle(state.discardPile);
  state.discardPile = [top];
  return true;
}

// How many more times the draw pile may be refilled this round (null = no limit).
// Everyone can see this; the board shows it and the hard CPU plans with it.
function reshufflesLeft() {
  return state.maxReshuffles === null ? null : Math.max(0, state.maxReshuffles - state.reshuffles);
}

// True when drawing from the deck is no longer possible: the pile is empty and cannot be
// refilled. The next player who draws from the deck then ends the round (a stalemate).
function deckIsFinished() {
  return state.drawPile.length === 0 && (state.discardPile.length <= 1 || reshufflesLeft() === 0);
}

// A CPU re-enters after elimination if the entry score is low enough. With a round
// limit a player who stays out can no longer win, so then the CPUs always come back.
function cpuWantsReentry() {
  return state.roundLimit !== null || state.entryScore <= CPU_REENTRY_MAX;
}

// True once the round limit has been reached: the game is decided after this round
// (or, after a tie for the lowest total, after the next round that breaks it)
function isLastRound() {
  return state.roundLimit !== null && state.round >= state.roundLimit;
}

// Nobody can close and the deck keeps running out: end the round with no
// closer. Everyone just scores their own unmatched points (no -10 bonus).
function endRoundStalemate() {
  const points = state.hands.map(hand => evaluateHand(hand).points);
  state.roundResult = { closer: null, chinchon: false, points };
  state.roundDetail = buildRoundDetail(null, false, points);
  state.showResults = true;
  state.phase = "roundOver";
  state.revealed = true;

  state.summary = [msg("sum.stalemate"), msg("sum.points", { list: pointsList(points, null, false) })];
  render();
  setStatus(...state.summary);
  scoreRound(null, { chinchon: false }, points);
}

// The data behind "Round points: You: 5 | CPU 1: 3" (the "list" placeholder in i18n.js):
// one row per player who took part in the round. Players who sat it out are left
// out, and so is anyone who is out by the time this is called.
function pointsList(points, closer, chinchon) {
  return points
    .map((pts, p) => ({ p, pts, chinchon: chinchon && p === closer }))
    .filter(row => state.inGame[row.p]);
}

// Move a card from a pile into a player's hand.
// source is "deck" (face-down draw pile) or "discard" (top face-up card).
// Returns the card, or null if the round ended in a stalemate instead.
function drawCard(player, source) {
  let card;
  if (source === "discard") {
    card = state.discardPile.pop();
    state.known[player].push(card);       // everyone saw them take it
  } else {
    if (!refillDrawPileIfEmpty()) {
      endRoundStalemate();
      return null;
    }
    card = state.drawPile.pop();
  }
  state.hands[player].push(card);
  return card;
}

// Move the card at position `cardIndex` from a hand onto the discard pile.
function discardCard(player, cardIndex) {
  const [card] = state.hands[player].splice(cardIndex, 1);   // remove 1 item
  state.discardPile.push(card);

  const k = state.known[player];                  // no longer a secret: it's on the pile
  const at = k.indexOf(card);
  if (at >= 0) k.splice(at, 1);
  return card;
}

// ---- Rearranging your own hand (state changes only; ui.js handles the dragging) ----
// Move the card at position `from` so that it ends up at position `to`
function moveCard(from, to) {
  const hand = state.hands[0];
  const [card] = hand.splice(from, 1);     // take it out...
  hand.splice(to, 0, card);                // ...and put it back at the new spot
  render();
}

// "Sort hand" button. The dropdown next to it picks the method:
//   "number": by value (1..12), ties broken by suit. Good for spotting groups.
//   "suit":   by suit, then by value. Good for spotting runs.
// (sort() compares two cards at a time; a negative result puts `a` first, and
// `x || y` means "use y only when x is 0", i.e. a tie-breaker.)
function sortHand() {
  const bySuit  = (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  const byValue = (a, b) => rankIndex(a) - rankIndex(b);
  state.hands[0].sort(state.sortMode === "suit"
    ? (a, b) => bySuit(a, b)  || byValue(a, b)
    : (a, b) => byValue(a, b) || bySuit(a, b));
  render();
}

// Pass the turn to the next player. Order is clockwise around the table:
// you (bottom) -> CPU 1 (left) -> CPU 2 (top) -> CPU 3 (right) -> you.
// With fewer CPUs the order is the same, just shorter (see SEAT_AREAS in ui.js).
// (Eliminated players are skipped.)
function endTurn() {
  state.turns++;
  state.lastDrawn = null;
  state.currentPlayer = nextActivePlayer(state.currentPlayer);
  state.phase = "draw";
  beginTurn();
}

// Players still in the game, e.g. [0, 2, 3]
function activePlayers() {
  return state.inGame.map((isIn, p) => isIn ? p : -1).filter(p => p >= 0);
}

// The next player clockwise after `from` who is still in the game
function nextActivePlayer(from) {
  for (let i = 1; i <= state.numPlayers; i++) {
    const p = (from + i) % state.numPlayers;
    if (state.inGame[p]) return p;
  }
  return from;
}

// Show the table, then either wait for the human or schedule the CPU's move
function beginTurn() {
  state.closing = false;     // never carry "closing mode" into another turn
  render();
  if (state.currentPlayer === 0) {
    // With the deck used up, clicking it ends the round: say so before it happens
    setStatus(msg(deckIsFinished() ? "msg.yourTurnDeckDone" : "msg.yourTurn"));
  } else {
    setStatus(msg("msg.playing", { who: state.currentPlayer }));
    state.timer = setTimeout(cpuTurn, CPU_SPEEDS[state.cpuSpeed].draw);   // run cpuTurn() after a pause
  }
}

// ---- Human actions (called from click handlers) ----

function humanDraw(source) {
  if (state.currentPlayer !== 0 || state.phase !== "draw") return;   // not allowed now
  if (source === "discard" && state.discardPile.length === 0) return;

  const card = drawCard(0, source);
  if (!card) return;                     // null = stalemate already ended the round
  state.lastDrawn = card;                // objects compare by identity, so this marks exactly this card
  state.phase = "discard";
  render();
  setStatus(msg("msg.pickDiscard"));
}

function humanDiscard(cardIndex) {
  if (state.currentPlayer !== 0 || state.phase !== "discard") return;
  discardCard(0, cardIndex);
  endTurn();
}

// Nobody may close during the first lap of a round: every player still in the
// round must have played one turn first. `state.turns` counts the turns completed
// this round, so with 4 players the starter's second turn (turns = 4) is the first
// one where closing is allowed. Applies to the human and the CPUs alike.
function closingAllowed() {
  return state.turns >= activePlayers().length;
}

// Every card you could discard to close the round, with what that would score.
// Returns [{ index, info }, ...] (empty if you cannot close this turn).
function closeOptions(hand) {
  const options = [];
  if (!closingAllowed()) return options;          // still the first lap
  hand.forEach((card, index) => {
    const info = getCloseInfo(hand.filter((c, j) => j !== index));
    if (info.canClose) options.push({ index, info });
  });
  return options;
}

// "Close round" button: switch into (or out of) closing mode. In closing mode
// only the cards that allow a legal close are clickable; clicking one discards
// it and closes the round.
function humanClose() {
  if (state.currentPlayer !== 0 || state.phase !== "discard") return;
  if (!state.closing && closeOptions(state.hands[0]).length === 0) return;
  state.closing = !state.closing;
  render();
  setStatus(msg(state.closing ? "msg.closing" : "msg.pickDiscard"));
}

// A CPU turn happens in two beats, with a pause between them (see CPU_SPEEDS):
//   beat 1, cpuTurn():       draw a card and show where it came from
//   beat 2, cpuFinishTurn(): close the round, or discard, then pass the turn
// The strategy (see STRATEGIES) makes the actual decisions.
function cpuStrategy(p) {
  return STRATEGIES[state.cpuLevels[p]] || STRATEGIES.hard;
}

function cpuTurn() {
  const p = state.currentPlayer;
  const source = cpuStrategy(p).chooseSource(p);
  const card = drawCard(p, source);
  if (!card) return;                      // null = stalemate ended the round

  const took = source === "discard"
    ? msg("msg.tookDiscard", { who: p, card })
    : msg("msg.drewDeck", { who: p });
  state.phase = "discard";                // (this only matters to the human's buttons)
  render();                               // the discard pile / draw pile count change here
  setStatus(took);
  state.timer = setTimeout(cpuFinishTurn, CPU_SPEEDS[state.cpuSpeed].discard);
}

function cpuFinishTurn() {
  if (state.phase !== "discard" || state.currentPlayer === 0) return;   // stale timer
  const p = state.currentPlayer;
  const strategy = cpuStrategy(p);

  const closeIndex = strategy.chooseClose(p);
  if (closeIndex !== null) {
    closeRound(p, closeIndex);
    return;
  }

  discardCard(p, strategy.chooseDiscard(p));
  endTurn();
}

// What the results screen shows: for every player who took part in the round,
// how their 7 cards split into melds and leftover cards, and the points they
// score. (`closer` is null after a stalemate.) A Chinchón is shown as a single
// run, since the best split for scoring might cut it into 3 + 4.
function buildRoundDetail(closer, chinchon, points) {
  const byRank = (a, b) => rankIndex(a) - rankIndex(b);
  return state.hands.map((hand, p) => {
    if (!state.inGame[p]) return null;              // sat this round out
    const ev = evaluateHand(hand);
    const isChinchon = chinchon && p === closer;
    const melds = isChinchon
      ? [{ type: "run", cards: [...hand].sort(byRank) }]
      : ev.melds.map(m => ({ type: m.type, cards: [...m.cards].sort(byRank) }));
    return {
      p,
      // `laid`: cards other players laid off onto this meld, as { card, by: player }
      melds: melds.map(m => ({ ...m, laid: [] })),
      unmatched: isChinchon ? [] : [...ev.unmatched].sort(byRank),
      laidOff: [],                                  // this player's cards that went onto others' melds
      points: points[p],                            // what this player scores this round
      closer: p === closer,
      chinchon: isChinchon,
    };
  });
}

// ---- End of round ----
// `closer` discards their last card and the round ends. Everyone's hand is
// evaluated: the closer gets their closing score (-10 bonus, or their
// unmatched points); everyone else gets their own unmatched points.
// With the lay-off rule on, the other players first lay off leftover cards
// (see LAYING OFF below), and only then is the round scored.
// scoreRound() then adds them to the running totals.
function closeRound(closer, discardIndex) {
  state.closing = false;
  discardCard(closer, discardIndex);
  const info = getCloseInfo(state.hands[closer]);

  const points = state.hands.map((hand, p) =>
    p === closer ? info.closerScore : evaluateHand(hand).points);

  state.roundResult = { closer, chinchon: info.chinchon, points };
  state.roundDetail = buildRoundDetail(closer, info.chinchon, points);
  state.showResults = true;
  state.phase = "roundOver";
  state.revealed = true;

  // Nobody lays off after a Chinchón (the game is over) or a close with no unmatched cards (-10)
  const layoffs = state.layoffMode !== "none" && !info.chinchon && info.closerScore !== CLOSE_BONUS;
  state.layoff = layoffs ? { order: layoffOrder(closer), next: 0 } : null;
  continueLayoffs();
}

// The second half of closeRound, once every lay-off is done: the round's points
// (the leftovers each player still holds) are final, so announce and score them.
function finishClose() {
  const { closer, chinchon } = state.roundResult;
  const points = state.roundResult.points.map((pts, p) =>
    state.roundDetail[p] ? state.roundDetail[p].points : pts);
  state.roundResult.points = points;
  render();

  const headline = msg(whoKey(chinchon ? "sum.chinchon" : "sum.closed", closer), { who: closer });
  state.summary = [headline, msg("sum.points", { list: pointsList(points, closer, chinchon) })];
  setStatus(...state.summary);

  scoreRound(closer, { chinchon }, points);
}

/* ---------------------------------------------------------
   LAYING OFF (the "Lay off leftovers" setting, state.layoffMode)
   ---------------------------------------------------------
   After a close, the other players take turns, clockwise from the closer, to
   lay off leftover cards onto any other player's melds (the closer's or another
   player's), including cards laid off before them. Each laid-off card no longer
   counts against its owner. The CPUs always lay off as well as they can
   (bestLayoff in rules.js); so do you in "auto" mode. In "manual" mode play stops
   at your turn until you have placed your cards and pressed Done.
   Everything happens in state.roundDetail (the results screen); the hands stay as they were.
   --------------------------------------------------------- */

// Who lays off, in turn order: everyone who played the round except the closer, clockwise from the closer
function layoffOrder(closer) {
  const order = [];
  for (let i = 1; i < state.numPlayers; i++) {
    const p = (closer + i) % state.numPlayers;
    if (state.roundDetail[p]) order.push(p);
  }
  return order;
}

// Play the lay-offs from state.layoff.next on. Stops (returns) at your turn in manual mode,
// unless you have no leftover cards; humanLayoffDone() then carries on from there.
function continueLayoffs() {
  const lo = state.layoff;
  while (lo && lo.next < lo.order.length) {
    const p = lo.order[lo.next];
    if (p === 0 && state.layoffMode === "manual" && state.roundDetail[0].unmatched.length > 0) {
      render();
      setStatus(msg("msg.layoff"));
      return;
    }
    autoLayoff(p);
    lo.next++;
  }
  state.layoff = null;
  finishClose();
}

// True while the game is waiting for you to lay off your cards (manual mode)
function awaitingLayoff() {
  return state.layoff !== null && state.layoff.order[state.layoff.next] === 0;
}

// Every meld player p may lay off onto: the melds of every other player in the round,
// each with the cards laid off on it so far. [{ owner, index, cards }, ...]
function layoffTargets(p) {
  const targets = [];
  state.roundDetail.forEach((d, owner) => {
    if (!d || owner === p) return;
    d.melds.forEach((m, index) => targets.push({ owner, index, cards: meldCards(m) }));
  });
  return targets;
}

// All the cards of a meld on the results screen: its own and the ones laid off on it
const meldCards = m => [...m.cards, ...m.laid.map(l => l.card)];

// Unmatched points of a list of cards
const pointsOfCards = cards => cards.reduce((sum, card) => sum + cardPoints(card), 0);

// Player p lays off leftover card number `cardIndex` onto meld `index` of player `owner`.
// Returns false, changing nothing, if the card does not fit there.
function layOff(p, cardIndex, owner, index) {
  const d = state.roundDetail[p];
  const target = owner !== p && state.roundDetail[owner] && state.roundDetail[owner].melds[index];
  const card = d.unmatched[cardIndex];
  if (!target || !card || !isMeld([...meldCards(target), card])) return false;
  d.unmatched.splice(cardIndex, 1);
  d.laidOff.push(card);
  target.laid.push({ card, by: p });
  d.points = pointsOfCards(d.unmatched);
  return true;
}

// Player p takes back laid-off card number `laidIndex` from meld `index` of player `owner`
// (your undo in manual mode). Only allowed if the meld is still a meld without it.
function takeBack(p, owner, index, laidIndex) {
  const target = state.roundDetail[owner] && state.roundDetail[owner].melds[index];
  const laid = target && target.laid[laidIndex];
  if (!laid || laid.by !== p) return false;
  const rest = meldCards(target).filter(card => card !== laid.card);
  if (!isMeld(rest)) return false;                    // another card hangs on this one
  const d = state.roundDetail[p];
  target.laid.splice(laidIndex, 1);
  // (found by key, not as the same object: after a saved game is restored, the copy in
  // d.laidOff and the one on the meld are two separate objects)
  d.laidOff.splice(d.laidOff.findIndex(card => cardKey(card) === cardKey(laid.card)), 1);
  d.unmatched.push(laid.card);
  d.unmatched.sort((a, b) => rankIndex(a) - rankIndex(b));
  d.points = pointsOfCards(d.unmatched);
  return true;
}

// The best lay-off for player p, played out card by card
function autoLayoff(p) {
  const d = state.roundDetail[p];
  const targets = layoffTargets(p);
  for (const { card, meld } of bestLayoff(d.unmatched, targets.map(tg => tg.cards))) {
    layOff(p, d.unmatched.indexOf(card), targets[meld].owner, targets[meld].index);
  }
}

// ---- Your lay-offs in manual mode (called from the results panel in ui.js) ----
function humanLayOff(cardIndex, owner, index) {
  if (!awaitingLayoff()) return false;
  const ok = layOff(0, cardIndex, owner, index);
  render();
  setStatus(...(ok ? [] : [msg("msg.layoffNoFit", { card: state.roundDetail[0].unmatched[cardIndex] })]),
            msg("msg.layoff"));
  return ok;
}
function humanTakeBack(owner, index, laidIndex) {
  if (!awaitingLayoff()) return false;
  const ok = takeBack(0, owner, index, laidIndex);
  render();
  return ok;
}
// "Done": the players after you lay off, then the round is scored
function humanLayoffDone() {
  if (!awaitingLayoff()) return;
  state.layoff.next++;
  continueLayoffs();
}

/* ---------------------------------------------------------
   4. SCORING: totals, elimination, re-entry, next round
   ---------------------------------------------------------
   After every round:
     1. each player's round points are added to their total
     2. anyone above SCORE_LIMIT is eliminated
     3. eliminated players may RE-ENTER, starting with the same total as
        the highest-scoring player still in the game (the "entry score").
        CPUs decide automatically; the human is asked.
     4. if only one player is left in the game, they win
   With a round limit (state.roundLimit), the game also ends after that many rounds:
   the lowest total among the players still in wins, and a tie means one more round.
   --------------------------------------------------------- */
function scoreRound(closer, info, points) {
  state.notice = [];            // forget last round's eliminations / re-entries
  state.roundPoints = points.map((pts, p) => state.inGame[p] ? pts : null);

  // Chinchón ends the whole game immediately (traditional rule)
  if (info.chinchon && CHINCHON_ENDS_GAME) {
    endGame(closer, "reason.chinchon");
    return;
  }

  // 1. Add the round's points to the running totals
  for (let p = 0; p < state.numPlayers; p++) {
    if (state.inGame[p]) state.totals[p] += points[p] ?? 0;   // ?? = "if null, use 0"
  }

  // 2. Eliminate anyone over the limit
  const busted = [];
  for (let p = 0; p < state.numPlayers; p++) {
    if (state.inGame[p] && state.totals[p] > SCORE_LIMIT) {
      state.inGame[p] = false;
      busted.push(p);
    }
  }
  const notes = [];
  if (busted.length) notes.push(msg("notice.out", { limit: SCORE_LIMIT, names: busted }));

  // Edge case: everyone went over the limit in the same round.
  // The lowest total wins the game.
  const active = activePlayers();
  if (active.length === 0) {
    const winner = busted.reduce((a, b) => state.totals[a] <= state.totals[b] ? a : b);
    endGame(winner, "reason.allOut");
    return;
  }

  // Only one player left under the limit: they win, and nobody gets to re-enter.
  if (active.length === 1) {
    state.notice = notes;
    endGame(active[0], "reason.lastStanding");
    return;
  }

  // Round limit reached: the lowest total among the players still in wins. A tie for
  // the lowest total means one more round for everyone still in, then the same check.
  // Nobody re-enters any more: an eliminated player could no longer win.
  if (isLastRound()) {
    const lowest = Math.min(...active.map(p => state.totals[p]));
    const leaders = active.filter(p => state.totals[p] === lowest);
    state.notice = notes;
    if (leaders.length === 1) {
      endGame(leaders[0], "reason.roundLimit");
      return;
    }
    notes.push(msg("notice.tieBreak", { score: lowest, names: leaders }));
    finishRoundScoring();
    return;
  }

  // 3. Re-entry. The entry score is the highest total among players still in.
  state.entryScore = Math.max(...active.map(p => state.totals[p]));
  const returned = [];
  for (let p = 1; p < state.numPlayers; p++) {          // CPUs decide automatically
    if (!state.inGame[p] && canReenter(p) && cpuWantsReentry()) {
      reenter(p);
      returned.push(p);
    }
  }
  if (returned.length) {
    notes.push(msg("notice.reentered", { score: state.entryScore, names: returned }));
  }
  state.notice = notes;

  // The human, if out and still allowed back, must choose (buttons appear; see renderControls)
  if (!state.inGame[0] && canReenter(0)) {
    state.awaitingReentry = true;
    render();
    setStatus(...state.summary, ...state.notice, msg("msg.mayReenter"));
    return;
  }
  finishRoundScoring();
}

// Has player p any re-entries left under the re-entry limit?
function canReenter(p) {
  return state.maxReentries === null || state.reentries[p] < state.maxReentries;
}

// Put a player back in the game with the entry score
function reenter(p) {
  state.inGame[p] = true;
  state.totals[p] = state.entryScore;
  state.reentries[p]++;
}

// Called when the human answers the re-entry question
function humanReenter(wantsIn) {
  if (!state.awaitingReentry) return;
  state.awaitingReentry = false;
  if (wantsIn) reenter(0);
  finishRoundScoring();
}

// 4. Wait for "Next round" (a game with one player left was already ended in step 2)
function finishRoundScoring() {
  render();
  setStatus(...state.summary, ...state.notice, msg("msg.pressNext"));
}

// `reason` is a message key ("reason.chinchon", ...), not a sentence
function endGame(winner, reason) {
  state.gameOver = true;
  state.winner = winner;
  state.awaitingReentry = false;
  render();
  // Short on purpose: the round summary and totals are in the results panel
  setStatus(msg("msg.gameOver", { winner, reason }));
}

// "Next round" button: rotate the starting player, then deal again
function nextRound() {
  if (state.phase !== "roundOver" || state.layoff || state.awaitingReentry || state.gameOver) return;
  state.startPlayer = nextActivePlayer(state.startPlayer);
  startRound();
}

/* ---------------------------------------------------------
   5. SAVING AND RESTORING A GAME
   ---------------------------------------------------------
   A phone may close the app whenever it is in the background, so ui.js saves
   the game in progress (in localStorage) when the page is hidden, and restores
   it when the page opens again. The functions here only turn `state` into a
   plain object and back; they never touch the page or the storage, so the Node
   tools can test them (and a future server could use them as they are).
   --------------------------------------------------------- */
const SAVE_VERSION = 2;   // bump when the shape of `state` changes: older saves are then ignored
                          // (2: laying off, state.layoffMode and state.layoff)
// Fields of `state` that describe this moment on screen rather than the game, so are not saved
const UNSAVED_FIELDS = ["timer", "closing", "showSettings", "showHelp", "showScores"];

// A copy of the game as a plain object, ready for JSON.stringify.
// JSON.parse(JSON.stringify(x)) is a quick deep copy (like copy.deepcopy in Python)
// for data made only of objects, arrays, strings, numbers, booleans and null.
function snapshotGame() {
  const saved = JSON.parse(JSON.stringify(state));
  for (const key of UNSAVED_FIELDS) delete saved[key];
  saved.version = SAVE_VERSION;
  saved.deckSize = DECK_SIZE;        // lives in rules.js, not in state; a 48-card game must resume on 48
  return saved;
}

// Is `saved` a game we can safely continue? Checks the version, that every field is there,
// and that the piles and hands hold exactly one full deck, each card once.
function isValidSave(saved) {
  if (!saved || saved.version !== SAVE_VERSION) return false;
  const fields = Object.keys(state).filter(key => !UNSAVED_FIELDS.includes(key));
  if (!fields.every(key => key in saved)) return false;
  if (!(saved.numPlayers >= MIN_PLAYERS && saved.numPlayers <= MAX_PLAYERS)) return false;
  if (!Array.isArray(saved.hands) || saved.hands.length !== saved.numPlayers) return false;
  if (saved.deckSize !== 40 && saved.deckSize !== 48) return false;

  const values = saved.deckSize === 48 ? VALUES_48 : VALUES_40;
  const cards = [...saved.drawPile, ...saved.discardPile, ...saved.hands.flat()];
  const ok = card => card && SUITS.includes(card.suit) && values.includes(card.value);
  return cards.length === saved.deckSize && cards.every(ok) &&
         new Set(cards.map(cardKey)).size === saved.deckSize;
}

// Put a saved game into `state`. Returns false, changing nothing, if the save is not usable.
function restoreGame(saved) {
  if (!isValidSave(saved)) return false;
  clearTimeout(state.timer);
  setDeckSize(saved.deckSize);
  for (const key of Object.keys(state)) {
    if (!UNSAVED_FIELDS.includes(key)) state[key] = saved[key];
  }
  state.timer = null;
  state.closing = false;
  state.showSettings = state.showHelp = state.showScores = false;

  // Re-link cards. In JS, `a === b` on two objects asks "the same object?" (like
  // Python's `is`), and the game relies on that: state.lastDrawn must be the very card
  // object in your hand, and state.known must hold the card objects in the hands
  // (discardCard looks them up with indexOf). After JSON they are look-alike copies,
  // so point them back at the real cards, found by their key ("o12" = 12 of oros).
  const real = new Map([...state.drawPile, ...state.discardPile, ...state.hands.flat()]
    .map(card => [cardKey(card), card]));
  const relink = card => card && real.get(cardKey(card));
  state.lastDrawn = relink(state.lastDrawn) || null;
  state.known = state.known.map(cards => cards.map(relink).filter(Boolean));
  return true;
}

// Carry on playing after restoreGame(): draw the table, and if a CPU was on the move,
// start its timer again (a timer does not survive the app being closed).
function resumeTurn() {
  if (state.phase === "roundOver") {
    render();
  } else if (state.currentPlayer !== 0 && state.phase === "discard") {
    // The CPU had drawn and was about to discard: do its second beat
    render();
    setStatus(msg("msg.playing", { who: state.currentPlayer }));
    state.timer = setTimeout(cpuFinishTurn, CPU_SPEEDS[state.cpuSpeed].discard);
  } else {
    beginTurn();   // your turn, or a CPU about to draw
  }
}
