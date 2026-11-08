"use strict";

/* =========================================================
   server/view.js: what one player is allowed to see of the game
   ---------------------------------------------------------
   The server holds the whole game, `state` from game.js, with every hand and
   the order of the draw pile. Each player gets a VIEW of it:

   1. Hidden cards are hidden. The other players' hands become face-down
      placeholders ({ hidden: true }, as many as they hold) until the round ends
      and every hand is shown anyway, and so does the draw pile. Cards that
      everyone saw (the discard pile, state.known) stay as they are.

   2. The seats are renumbered so that the player is seat 0. The page (ui.js)
      draws seat 0 as "You" at the bottom of the table, and i18n.js shows
      messages about seat 0 as "Your turn", so with the numbers turned round
      every player sees the game from their own chair without ui.js knowing
      anything about the network. Seat s becomes (s - me) mod n: with 4 seats,
      player 2 sees seat 2 as 0, seat 3 as 1, seat 0 as 2 and seat 1 as 3, so
      the order round the table stays the same.

   Nothing here changes `state`; viewFor() builds a new object.
   ========================================================= */

// Fields of `state` that the page has no use for (timer: the pending CPU move, which in
// Node is an object that cannot even be turned into JSON)
const SERVER_ONLY = ["timer"];

// A card the viewer may not see: the page draws it face down (createCardElement in ui.js)
const HIDDEN = Object.freeze({ hidden: true });

// The view of `state` for the player in seat `me`. `deckSize` is the deck in use
// (it lives in rules.js, not in state, and the page needs it to judge runs).
function viewFor(state, me, deckSize) {
  const n = state.numPlayers;
  const seat = p => (p === null || p === undefined) ? p : (p - me + n) % n;   // real seat -> viewer's seat
  const turn = list => list.map((_, i) => list[(i + me) % n]);                // per-seat array, renumbered
  const copy = value => JSON.parse(JSON.stringify(value));                     // deep copy (see snapshotGame)

  const shown = { ...state };                     // a shallow copy, to leave out the server-only fields
  for (const key of SERVER_ONLY) delete shown[key];
  const view = copy(shown);

  // ---- 1. Hide what this player may not see ----
  view.drawPile = state.drawPile.map(() => HIDDEN);
  view.hands = state.hands.map((hand, p) =>
    p === me || state.revealed ? copy(hand) : hand.map(() => HIDDEN));
  // The gold dot on the card you just drew: only for the player who drew it
  const mine = state.lastDrawn && state.hands[me].includes(state.lastDrawn);
  view.lastDrawn = mine ? copy(state.lastDrawn) : null;

  // ---- 2. Renumber the seats so that this player is seat 0 ----
  for (const key of ["hands", "totals", "inGame", "roundPoints", "reentries", "known", "seats", "names"]) {
    view[key] = turn(view[key]);
  }
  view.cpuLevels = turn(view.cpuLevels.slice(0, n));
  for (const key of ["currentPlayer", "startPlayer", "winner"]) view[key] = seat(view[key]);
  view.reentryPending = view.reentryPending.map(seat);
  if (view.layoff) view.layoff.order = view.layoff.order.map(seat);
  if (view.roundResult) {
    view.roundResult.closer = seat(view.roundResult.closer);
    view.roundResult.points = turn(view.roundResult.points);
  }
  if (view.roundDetail) {
    view.roundDetail = turn(view.roundDetail);
    for (const d of view.roundDetail) {
      if (!d) continue;
      d.p = seat(d.p);
      for (const m of d.melds) for (const laid of m.laid) laid.by = seat(laid.by);
    }
  }
  // Messages hold seat numbers in their data (see FORMATTERS in i18n.js)
  for (const key of ["status", "summary", "notice"]) {
    view[key] = view[key].map(m => ({ key: m.key, vars: renumberVars(m.vars, seat) }));
  }

  view.deckSize = deckSize;
  return view;
}

// The data of one message with its seat numbers renumbered: `who` and `winner` are a seat,
// `names` a list of seats, `list` a list of rows { p, pts, chinchon } (see FORMATTERS in i18n.js)
function renumberVars(vars, seat) {
  const out = { ...vars };
  if ("who" in out) out.who = seat(out.who);
  if ("winner" in out) out.winner = seat(out.winner);
  if (Array.isArray(out.names)) out.names = out.names.map(seat);
  if (Array.isArray(out.list)) out.list = out.list.map(row => ({ ...row, p: seat(row.p) }));
  return out;
}

// The other way round: a seat number in a move a player sent (their numbering) -> the real seat
function realSeat(viewerSeat, me, n) {
  return (viewerSeat + me) % n;
}

module.exports = { viewFor, realSeat };
