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
// milliseconds before each beat. (An object, not two constants, so the tests can
// shorten them: server/room.js and tests/browser/ change the numbers inside.)
const CPU_PAUSE = { draw: 1200, discard: 1000 };

/* ---------------------------------------------------------
   1. GAME STATE: one object holding everything that changes.
   The rendering functions in ui.js only READ this; game logic WRITES it.
   Keeping state separate from display is the key design idea.
   --------------------------------------------------------- */
const state = {
  drawPile:    [],   // array of cards; the LAST element is the top card
  discardPile: [],   // same convention
  hands:       [],   // hands[p] = player p's cards (on this device seat 0 is always you)
  numPlayers:  MAX_PLAYERS,   // seats in use this game (2-4): you plus 1-3 others. All per-player arrays have this length.
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
  showHints: false,  // is the hand analysis table visible? (off by default)
  showSettings: false, // is the settings panel open?
  showHelp: false,   // is the help panel (rules, settings, keys) open?
  showScores: false, // is the scores panel open?
  showOnline: false, // is the online panel (create / join a room) open?
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
  // Who plays each seat: "human" (waits for clicks, or for moves sent over the network),
  // "cpu", or "away" (a human whose connection dropped in an online game: a CPU plays
  // for them until they come back; see seatAway). On one device it is you plus CPUs.
  seats: ["human", "cpu", "cpu", "cpu"],
  names: [null, null, null, null],    // online nicknames by seat (null = "You" / "CPU n"; see playerName)

  // ---- Game-level state: lasts across rounds ----
  round: 0,
  deals: 0,                           // how many times cards have been dealt (the UI plays the dealing animation when it changes)
  totals: [0, 0, 0, 0],               // running score per player (lower is better)
  inGame: [true, true, true, true],   // false = eliminated (may re-enter)
  startPlayer: 0,                     // who plays first this round (rotates)
  roundPoints: [null, null, null, null], // points from the last round (null = didn't play)
  entryScore: 0,                      // total a re-entering player starts with
  reentries: [0, 0, 0, 0],            // how many times each player has re-entered this game
  reentryPending: [],                 // human players who are out and must still choose re-enter / stay out
  ready: [false, false, false, false], // after a round: who has pressed Next round (online, every person must; see humanNext)
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
// `table` (optional, used by the online server) says who sits where: { seats, names }, one
// entry per seat. Without it, it is you in seat 0 and CPUs in the others.
// `deck` (optional, used by the tutorial) is the first round's deck in a fixed order
// instead of a shuffled one (see startRound).
function newGame(cpuCount, table, deck) {
  clearTimeout(state.timer);
  // The "New game" buttons call newGame(clickEvent), so only trust a plain number
  if (typeof cpuCount === "number") {
    state.numPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, cpuCount + 1));
  }
  state.seats = table ? [...table.seats]
                      : Array.from({ length: state.numPlayers }, (_, p) => p === 0 ? "human" : "cpu");
  state.names = table ? [...table.names] : Array(state.numPlayers).fill(null);
  state.round = 0;
  state.totals = Array(state.numPlayers).fill(0);
  state.inGame = Array(state.numPlayers).fill(true);
  state.reentries = Array(state.numPlayers).fill(0);
  state.startPlayer = 0;                       // you play first in round 1
  state.roundPoints = Array(state.numPlayers).fill(null);
  state.reentryPending = [];
  state.gameOver = false;
  state.winner = null;
  state.summary = [];
  state.notice = [];
  startRound(deck);
}

// Start a new ROUND within the current game: shuffle, deal to the players
// who are still in the game, flip the first discard, and begin the turns.
// `deck` (optional) replaces the shuffle with a fixed order. Cards are dealt with pop(),
// from the END of the array, so a fixed deck lists the last card to be drawn first.
function startRound(deck) {
  // Fresh shuffled deck (`[...deck]` copies the array, so the caller's stays as it was)
  state.drawPile = deck ? [...deck] : shuffle(createDeck());

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
  state.ready = Array(state.numPlayers).fill(false);
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

// ---- Rearranging a hand (state changes only; ui.js handles the dragging) ----
// Put player p's hand in the order given by `keys` (card keys such as "o12", see cardKey
// in rules.js). Cards are named by key, not by position, because over the network a
// position can be out of date. Ignored unless `keys` names exactly the cards in the hand.
function setHandOrder(p, keys) {
  const hand = state.hands[p];
  if (!hand || keys.length !== hand.length) return;
  const byKey = new Map(hand.map(card => [cardKey(card), card]));
  const ordered = keys.map(key => byKey.get(key));
  if (ordered.some(card => !card) || new Set(keys).size !== keys.length) return;
  hand.splice(0, hand.length, ...ordered);    // replace the contents, keeping the same array
  render();
}

// A sorted copy of a hand, for the "Sort hand" button. The dropdown next to it picks the method:
//   "number": by value (1..12), ties broken by suit. Good for spotting groups.
//   "suit":   by suit, then by value. Good for spotting runs.
// (sort() compares two cards at a time; a negative result puts `a` first, and
// `x || y` means "use y only when x is 0", i.e. a tie-breaker.)
function sortedHand(hand, mode) {
  const bySuit  = (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  const byValue = (a, b) => rankIndex(a) - rankIndex(b);
  return [...hand].sort(mode === "suit"
    ? (a, b) => bySuit(a, b)  || byValue(a, b)
    : (a, b) => byValue(a, b) || bySuit(a, b));
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

// Is seat p played by a person who is here (on this device or connected)? "away" seats
// are humans who lost their connection: the CPU plays for them, so they count as not human.
function isHuman(p) {
  return state.seats[p] === "human";
}

// Show the table, then either wait for the human or schedule the CPU's move.
// The status message names the player (`who`); i18n.js then says "Your turn..." to that
// player and "Ana is playing..." to everyone else (see the .you / .cpu keys there).
function beginTurn() {
  state.closing = false;     // never carry "closing mode" into another turn
  render();
  // With the deck used up, clicking it ends the round: say so before it happens
  setStatus(msg(deckIsFinished() ? "msg.turnDeckDone" : "msg.turn", { who: state.currentPlayer }));
  if (!isHuman(state.currentPlayer)) {
    state.timer = setTimeout(cpuTurn, CPU_PAUSE.draw);   // run cpuTurn() after a pause
  }
}

// ---- Human actions (called through ACTIONS below: from clicks, or from the network) ----
// Each one first checks that the move is allowed (right player, right moment) and does
// nothing otherwise, so a stale click or a message from a cheating client changes nothing.

// The position of the card with key `key` in player p's hand, or -1
const indexOfKey = (p, key) => state.hands[p].findIndex(card => cardKey(card) === key);

function humanDraw(p, source) {
  if (state.currentPlayer !== p || !isHuman(p) || state.phase !== "draw") return;   // not allowed now
  if (source === "discard" && state.discardPile.length === 0) return;

  const card = drawCard(p, source);
  if (!card) return;                     // null = stalemate already ended the round
  state.lastDrawn = card;                // objects compare by identity, so this marks exactly this card
  state.phase = "discard";
  render();
  setStatus(drewMessage(p, source, card));
}

// What everyone is told about a draw: the player who drew is asked to discard, the others
// see a toast "Ana drew from the draw pile..." (the .you / .cpu keys in i18n.js). The card
// is only named when it came from the discard pile, where everyone saw it.
function drewMessage(p, source, card) {
  return source === "discard" ? msg("msg.tookDiscard", { who: p, card })
                              : msg("msg.drewDeck", { who: p });
}

function humanDiscard(p, key) {
  if (state.currentPlayer !== p || !isHuman(p) || state.phase !== "discard") return;
  const index = indexOfKey(p, key);
  if (index < 0) return;
  discardCard(p, index);
  endTurn();
}

// Close the round by discarding the card with key `key`. Only a card that allows a
// legal close is accepted (closeOptions); the round then ends (closeRound).
function humanCloseWith(p, key) {
  if (state.currentPlayer !== p || !isHuman(p) || state.phase !== "discard") return;
  const index = indexOfKey(p, key);
  if (!closeOptions(state.hands[p]).some(o => o.index === index)) return;
  closeRound(p, index);
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

// A CPU turn happens in two beats, with a pause between them (see CPU_PAUSE):
//   beat 1, cpuTurn():       draw a card and show where it came from
//   beat 2, cpuFinishTurn(): close the round, or discard, then pass the turn
// The strategy (see STRATEGIES) makes the actual decisions.
function cpuStrategy(p) {
  return STRATEGIES[state.cpuLevels[p]] || STRATEGIES.hard;
}

function cpuTurn() {
  const p = state.currentPlayer;
  // Stale timer: an away player came back in the meantime and plays this turn themselves
  if (state.phase !== "draw" || isHuman(p)) return;
  const source = cpuStrategy(p).chooseSource(p);
  const card = drawCard(p, source);
  if (!card) return;                      // null = stalemate ended the round

  state.phase = "discard";                // (this only matters to the human's buttons)
  render();                               // the discard pile / draw pile count change here
  setStatus(drewMessage(p, source, card));
  state.timer = setTimeout(cpuFinishTurn, CPU_PAUSE.discard);
}

function cpuFinishTurn() {
  if (state.phase !== "discard" || isHuman(state.currentPlayer)) return;   // stale timer
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

  // (the .you / .cpu form is picked when the message is shown, so each player reads it from their side)
  const headline = msg(chinchon ? "sum.chinchon" : "sum.closed", { who: closer });
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

// Play the lay-offs from state.layoff.next on. Stops (returns) at a human's turn in manual
// mode, unless they have no leftover cards; humanLayoffDone() then carries on from there.
function continueLayoffs() {
  const lo = state.layoff;
  while (lo && lo.next < lo.order.length) {
    const p = lo.order[lo.next];
    if (isHuman(p) && state.layoffMode === "manual" && state.roundDetail[p].unmatched.length > 0) {
      render();
      setStatus(msg("msg.layoff", { who: p }));
      return;
    }
    autoLayoff(p);
    lo.next++;
  }
  state.layoff = null;
  finishClose();
}

// True while the game is waiting for player p to lay off their cards (manual mode)
function awaitingLayoff(p) {
  return state.layoff !== null && state.layoff.order[state.layoff.next] === p;
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

// ---- A human's lay-offs in manual mode (from the results panel in ui.js, through ACTIONS) ----
// The leftover card is named by key, like the cards of a hand (see setHandOrder).
// Returns false, changing nothing, when it is not p's turn to lay off or the card does not fit.
function humanLayOff(p, key, owner, index) {
  if (!awaitingLayoff(p) || !isHuman(p)) return false;
  const cardIndex = state.roundDetail[p].unmatched.findIndex(card => cardKey(card) === key);
  if (cardIndex < 0 || !layOff(p, cardIndex, owner, index)) return false;
  render();
  return true;
}
function humanTakeBack(p, owner, index, laidIndex) {
  if (!awaitingLayoff(p) || !isHuman(p)) return false;
  const ok = takeBack(p, owner, index, laidIndex);
  render();
  return ok;
}
// "Done": the players after p lay off, then the round is scored
function humanLayoffDone(p) {
  if (!awaitingLayoff(p) || !isHuman(p)) return;
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
  for (let p = 0; p < state.numPlayers; p++) {          // CPUs (and away players) decide automatically
    if (!isHuman(p) && !state.inGame[p] && canReenter(p) && cpuWantsReentry()) {
      reenter(p);
      returned.push(p);
    }
  }
  if (returned.length) {
    notes.push(msg("notice.reentered", { score: state.entryScore, names: returned }));
  }
  state.notice = notes;

  // Humans who are out and still allowed back must choose (buttons appear; see renderControls)
  state.reentryPending = playersOut().filter(p => isHuman(p) && canReenter(p));
  if (state.reentryPending.length) {
    askReentry();
    return;
  }
  finishRoundScoring();
}

// Players who are out of the game, e.g. [1]
function playersOut() {
  return state.inGame.map((isIn, p) => isIn ? -1 : p).filter(p => p >= 0);
}

// Show the re-entry question to whoever still has to answer it (one message per player:
// "You may re-enter below" to them, "Waiting for Ana..." to the others)
function askReentry() {
  render();
  setStatus(...state.summary, ...state.notice,
            ...state.reentryPending.map(p => msg("msg.mayReenter", { who: p })));
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

// Called when human player p answers the re-entry question. Once everyone has answered,
// the round's scoring is finished.
function humanReenter(p, wantsIn) {
  if (!state.reentryPending.includes(p)) return;
  state.reentryPending = state.reentryPending.filter(q => q !== p);
  if (wantsIn) reenter(p);
  if (state.reentryPending.length) askReentry();
  else finishRoundScoring();
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
  state.reentryPending = [];
  render();
  // Short on purpose: the round summary and totals are in the results panel
  setStatus(msg("msg.gameOver", { winner, reason }));
}

// Is the round over and scored, with nothing left to answer, so that the next one may start?
function roundCanAdvance() {
  return state.phase === "roundOver" && !state.layoff && !state.reentryPending.length && !state.gameOver;
}

// Has every person at the table pressed Next round? (CPUs and away players never hold it up)
function everyoneReady() {
  return state.seats.every((seat, p) => seat !== "human" || state.ready[p]);
}

// Player p pressed "Next round". In an online game every person must press it, so that
// nobody's look at the results is cut short by a quicker player; on one device there is
// only you, so the next round starts at once.
function humanNext(p) {
  if (!isHuman(p) || !roundCanAdvance()) return;
  state.ready[p] = true;
  if (everyoneReady()) nextRound();
  else render();
}

// Start the next round: rotate the starting player, then deal again. (The online server
// also calls this directly when someone has waited too long for the others; see room.js.)
function nextRound() {
  if (!roundCanAdvance()) return;
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
const SAVE_VERSION = 4;   // bump when the shape of `state` changes: older saves are then ignored
                          // (2: laying off, state.layoffMode and state.layoff;
                          //  3: several human seats, state.seats, state.names and state.reentryPending;
                          //  4: state.ready, for Next round with several people)
// Fields of `state` that describe this moment on screen rather than the game, so are not saved
const UNSAVED_FIELDS = ["timer", "closing", "showSettings", "showHelp", "showScores", "showOnline"];

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
  state.showSettings = state.showHelp = state.showScores = state.showOnline = false;
  relinkCards();
  return true;
}

// Re-link cards after state was filled from JSON (a saved game, or a view sent by the
// online server). In JS, `a === b` on two objects asks "the same object?" (like Python's
// `is`), and the game relies on that: state.lastDrawn must be the very card object in your
// hand, and state.known must hold the card objects in the hands (discardCard looks them up
// with indexOf). After JSON they are look-alike copies, so point them back at the real
// cards, found by their key ("o12" = 12 of oros). Cards the online view hides from you
// ({ hidden: true }, see server/view.js) have no key and are skipped; a known card that is
// not on show stays the copy it is.
function relinkCards() {
  const all = [...state.drawPile, ...state.discardPile, ...state.hands.flat()].filter(card => card.suit);
  const real = new Map(all.map(card => [cardKey(card), card]));
  const relink = card => card && (real.get(cardKey(card)) || card);
  state.lastDrawn = relink(state.lastDrawn) || null;
  state.known = state.known.map(cards => cards.map(relink));
}

// Carry on playing after restoreGame(): draw the table, and if a CPU was on the move,
// start its timer again (a timer does not survive the app being closed).
function resumeTurn() {
  if (state.phase === "roundOver") {
    render();
  } else if (!isHuman(state.currentPlayer) && state.phase === "discard") {
    // The CPU had drawn and was about to discard: do its second beat
    render();
    setStatus(msg("msg.turn", { who: state.currentPlayer }));
    state.timer = setTimeout(cpuFinishTurn, CPU_PAUSE.discard);
  } else {
    beginTurn();   // your turn, or a CPU about to draw
  }
}

/* ---------------------------------------------------------
   6. PLAYERS LEAVING AND COMING BACK (online games)
   ---------------------------------------------------------
   When an online player's connection drops for long enough, the server calls
   seatAway(p): the seat is then played by the CPU (cpuStrategy) until seatBack(p).
   Whatever the game was waiting for from that player happens straight away, so one
   player leaving never stalls the game for the others. On one device these are
   never called.
   --------------------------------------------------------- */
function seatAway(p) {
  if (state.seats[p] !== "human") return;
  state.seats[p] = "away";
  if (state.reentryPending.includes(p)) {           // asked to re-enter: answer as a CPU would
    humanReenter(p, cpuWantsReentry());
  } else if (awaitingLayoff(p)) {                    // laying off by hand: lay off as a CPU would
    autoLayoff(p);
    state.layoff.next++;
    continueLayoffs();
  } else if (state.currentPlayer === p && state.phase !== "roundOver") {
    // Their turn: the CPU takes the next beat (drawing, or discarding if they already drew)
    clearTimeout(state.timer);
    state.timer = setTimeout(state.phase === "draw" ? cpuTurn : cpuFinishTurn,
                             CPU_PAUSE.discard);
    render();
  } else if (roundCanAdvance() && everyoneReady()) {  // the others were only waiting for them to press Next round
    nextRound();
  } else {
    render();
  }
}

// The player is back. A CPU beat already scheduled for them finds the seat human again
// and does nothing (see the checks at the top of cpuTurn and cpuFinishTurn), so if it is
// their turn they simply carry on from where the CPU left it.
function seatBack(p) {
  if (state.seats[p] !== "away") return;
  state.seats[p] = "human";
  render();
}

/* ---------------------------------------------------------
   7. ACTIONS: everything a human player can ask the game to do
   ---------------------------------------------------------
   The one doorway for a player's moves. On one device ui.js calls these for
   seat 0 (through act() in net.js); in an online game the server calls them
   for whichever seat sent the move. Each entry lists the TYPES of its arguments
   (after the player), so the server can check a message from the network before
   it gets anywhere near the game:
     "source": "deck" or "discard"
     "card":   a card key such as "o12"
     "cards":  a list of card keys
     "seat":   a seat number (the server turns the sender's numbering into the real one)
     "count":  a small whole number
     "bool":   true or false
   The functions themselves check that the move is allowed right now.
   --------------------------------------------------------- */
const ACTIONS = {
  draw:       { args: ["source"],                run: (p, source) => humanDraw(p, source) },
  discard:    { args: ["card"],                  run: (p, key) => humanDiscard(p, key) },
  close:      { args: ["card"],                  run: (p, key) => humanCloseWith(p, key) },
  order:      { args: ["cards"],                 run: (p, keys) => setHandOrder(p, keys) },
  layOff:     { args: ["card", "seat", "count"], run: (p, key, owner, index) => humanLayOff(p, key, owner, index) },
  takeBack:   { args: ["seat", "count", "count"], run: (p, owner, index, laidIndex) => humanTakeBack(p, owner, index, laidIndex) },
  layoffDone: { args: [],                        run: (p) => humanLayoffDone(p) },
  reenter:    { args: ["bool"],                  run: (p, wantsIn) => humanReenter(p, wantsIn) },
  next:       { args: [],                        run: (p) => humanNext(p) },
};

// Does `value` have the argument type `type` (see the list above)?
function isActionArg(type, value) {
  const isKey = v => typeof v === "string" && v.length <= 3 && /^[ocbe]\d{1,2}$/.test(v);
  const isCount = v => Number.isInteger(v) && v >= 0 && v < 100;
  switch (type) {
    case "source": return value === "deck" || value === "discard";
    case "card":   return isKey(value);
    case "cards":  return Array.isArray(value) && value.length <= 8 && value.every(isKey);
    case "seat":   return Number.isInteger(value) && value >= 0 && value < state.numPlayers;
    case "count":  return isCount(value);
    case "bool":   return typeof value === "boolean";
    default:       return false;
  }
}

// Run action `name` for player p, if the arguments have the right types.
// Returns what the action returned (false from a lay-off that did not fit), or false
// when the request itself was malformed.
function runAction(p, name, args) {
  const action = Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : null;   // (hasOwn: not "toString" and friends)
  if (!action || !Array.isArray(args) || args.length !== action.args.length) return false;
  if (!action.args.every((type, i) => isActionArg(type, args[i]))) return false;
  return action.run(p, ...args);
}
