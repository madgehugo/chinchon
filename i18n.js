/* =========================================================
   i18n.js: English and Spanish text ("internationalisation", i18n for short)
   ---------------------------------------------------------
   Every sentence the player can see lives in STRINGS below, once per language.
   The rest of the code asks for text by KEY: t("btn.sort") gives "Sort hand" or
   "Ordenar mano", depending on the current language.

   The key rule for the whole project: `state` (game.js) never stores a finished
   sentence, only a key plus its data (see msg() below). The sentence is built when the
   page is drawn, so switching language and calling render() redraws everything,
   even a status line that was written a minute ago.

   This file never touches the page. ui.js does that (see applyStaticText there).
   It loads right after rules.js and may be used by every file after it.
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   1. THE TEXT
   ---------------------------------------------------------
   Keys are "area.name". {braces} are placeholders filled in by t(). A key that
   exists in two forms, key.one and key.other, is a plural (see plural() below).
   The Spanish has been reviewed by a native speaker; mark any NEW Spanish line with
   "// TODO review" until one has checked it. Both languages must have exactly the same keys and placeholders;
   runTestsI18n() in tests.js checks that on every page load.
   --------------------------------------------------------- */
const STRINGS = {
  en: {
    "app.title": "Chinchón",
    "lang.label": "Language",

    // ---- Buttons ----
    "btn.sort": "Sort hand",
    "btn.close": "Close round",
    "btn.closeCancel": "Cancel closing",
    "btn.next": "Next round",
    "btn.results": "Round results",
    "btn.hints": "Hints",
    "btn.hintsOn": "Hints: on",
    "btn.settings": "Settings",
    "btn.newGame": "New game",
    "btn.reenter": "Re-enter",
    "btn.stayOut": "Stay out",
    "btn.hide": "Hide",

    // ---- Settings panel ----
    "set.sortBy": "Sort by",
    "set.sort.number": "Number",
    "set.sort.suit": "Suit",
    "set.cpus": "CPUs",
    "set.level": "CPU level",
    "set.speed": "CPU speed",
    "set.speed.slow": "Slow",
    "set.speed.normal": "Normal",
    "set.speed.fast": "Fast",
    "set.deck": "Deck",
    "set.deck.40": "40 cards",
    "set.deck.48": "48 cards (with 8s and 9s)",
    "set.reshuffles": "Reshuffles per round",
    "set.rounds": "Rounds per game",
    "set.reentries": "Re-entries per player",
    "set.noLimit": "No limit",
    "level.easy": "Easy",
    "level.medium": "Medium",
    "level.hard": "Hard",
    "level.mixed": "Mixed",

    // ---- Table ----
    "player.you": "You",
    "player.cpu": "CPU {n}",
    "pile.draw": "Draw pile ({n})",
    "pile.discard": "Discard pile ({n})",
    "pile.reshuffles": "Reshuffles left: {n}",
    "pile.endsRound": "Drawing here ends the round",
    "seat.you": "You (Player 1)",
    "seat.cpu": "{name} ({level})",
    "seat.score": "{name} · {n} pts",
    "seat.out": " · OUT",

    // ---- Cards ----
    "suit.oros": "oros",
    "suit.copas": "copas",
    "suit.espadas": "espadas",
    "suit.bastos": "bastos",
    "card.fig.10": "Sota",
    "card.fig.11": "Caballo",
    "card.fig.12": "Rey",
    "card.title": "{value} of {suit}{fig}",
    "card.closeChinchon": " - close with CHINCHÓN!",
    "card.closeScore": " - close and score {n}",
    "meld.run": "Run",
    "meld.group": "Group",

    // ---- Scoreboard ----
    "board.round": "Round {n} (out above {limit} points)",
    "board.roundOf": "Round {n} of {max} (out above {limit} points)",
    "board.tieBreak": "Round {n}: tie-break (out above {limit} points)",
    "board.player": "Player",
    "board.total": "Total",
    "board.last": "Last round",
    "board.status": "Status",
    "board.in": "in",
    "board.out": "OUT",

    // ---- Status line ----
    "msg.yourTurn": "Your turn: click the draw pile or the top discard to take a card.",
    "msg.yourTurnDeckDone": "Your turn: the draw pile is used up. Take the top discard to play on, or click the empty pile to end the round (everyone scores their hand).",
    "msg.playing": "{who} is playing...",
    "msg.tookDiscard": "{who} took {card} from the discard pile...",
    "msg.drewDeck": "{who} drew from the draw pile...",
    "msg.pickDiscard": "Click a card in your hand to discard it, or press Close round if you can.",
    "msg.closing": "Closing: click the highlighted card you want to discard. (Press the button again to cancel.)",
    "msg.mayReenter": "You may re-enter below.",
    "msg.pressNext": "Press Next round.",
    "msg.gameOver": "Game over! {winner} ({reason}).",

    // ---- How a round ended (the .you / .cpu variants fix the verb for "You" vs "CPU 1") ----
    "sum.stalemate": "Stalemate: the deck ran out too many times and nobody closed.",
    "sum.closed.you": "You closed the round.",
    "sum.closed.cpu": "{who} closed the round.",
    "sum.chinchon.you": "You made CHINCHÓN!",
    "sum.chinchon.cpu": "{who} made CHINCHÓN!",
    "sum.points": "Round points: {list}.",
    "sum.chinchonWord": "Chinchón",
    "notice.out": "Out (over {limit}): {names}.",
    "notice.reentered": "Re-entered at {score}: {names}.",
    "notice.tieBreak": "Tied for the lowest total ({score}): {names}. One more round decides.",
    "win.you": "You win",
    "win.cpu": "{who} wins",
    "reason.chinchon": "Chinchón!",
    "reason.allOut": "everyone went over the limit, lowest total wins",
    "reason.lastStanding": "last player standing",
    "reason.roundLimit": "lowest total after the last round",

    // ---- Confirmation bars ----
    "confirm.deck": "Switch to the {n}-card deck? This starts a new game.",
    "confirm.rules": "Change this rule? This starts a new game.",
    "confirm.cpus.one": "Play against {n} CPU? This starts a new game.",
    "confirm.cpus.other": "Play against {n} CPUs? This starts a new game.",
    "confirm.yes": "Start new game",
    "confirm.no": "Keep playing",
    "reentry.text.one": "You are out of the game. Re-enter with {n} point?",
    "reentry.text.other": "You are out of the game. Re-enter with {n} points?",
    "reentry.left": "(Re-entries left: {n}.)",

    // ---- Hints panel ----
    "hint.title": "Your hand analysis",
    "hint.melds": "Melds",
    "hint.unmatched": "Unmatched",
    "hint.canClose": "Can close",
    "hint.none": "none",
    "hint.no": "No",
    "hint.notPlaying": "You are not playing this round.",
    "hint.yes": "Yes (would score {n})",
    "hint.yesChinchon": "Yes: CHINCHÓN!",
    "hint.yesDiscard": "Yes: discard {discard} (would score {n})",
    "hint.yesDiscardChinchon": "Yes: discard {discard} for CHINCHÓN!",

    // ---- Round results panel ----
    "res.title": "Round {n}: {headline}",
    "res.head.stalemate": "Stalemate: nobody closed",
    "res.head.closed.you": "You closed the round",
    "res.head.closed.cpu": "{who} closed the round",
    "res.head.chinchon.you": "You made CHINCHÓN!",
    "res.head.chinchon.cpu": "{who} made CHINCHÓN!",
    "res.badgeClosed": "closed",
    "res.badgeOut": "out",
    "res.total": "total {n}",
    "res.chinchon": "Chinchón!",
    "res.leftover": "Left over: {n} pts",
    "res.noticeWin.you": "You win the game!",
    "res.noticeWin.cpu": "{who} wins the game!",
  },

  es: {
    "app.title": "Chinchón",
    "lang.label": "Idioma",

    // ---- Buttons ----
    "btn.sort": "Ordenar mano",
    "btn.close": "Cerrar ronda",
    "btn.closeCancel": "Cancelar cierre",
    "btn.next": "Siguiente ronda",
    "btn.results": "Resultados de la ronda",
    "btn.hints": "Pistas",
    "btn.hintsOn": "Pistas: activadas",
    "btn.settings": "Configuración",
    "btn.newGame": "Nueva partida",
    "btn.reenter": "Volver a entrar",
    "btn.stayOut": "Seguir fuera",
    "btn.hide": "Ocultar",

    // ---- Settings panel ----
    "set.sortBy": "Ordenar por",
    "set.sort.number": "Número",
    "set.sort.suit": "Palo",
    "set.cpus": "CPU",
    "set.level": "Dificultad",
    "set.speed": "Velocidad de la CPU",
    "set.speed.slow": "Lenta",
    "set.speed.normal": "Normal",
    "set.speed.fast": "Rápida",
    "set.deck": "Baraja",
    "set.deck.40": "40 cartas",
    "set.deck.48": "48 cartas (con 8 y 9)",
    "set.reshuffles": "Barajadas por ronda",   // TODO review
    "set.rounds": "Rondas por partida",   // TODO review
    "set.reentries": "Reenganches por jugador",   // TODO review
    "set.noLimit": "Sin límite",   // TODO review
    "level.easy": "Fácil",
    "level.medium": "Medio",
    "level.hard": "Difícil",
    "level.mixed": "Mixto",

    // ---- Table ----
    "player.you": "Tú",
    "player.cpu": "CPU {n}",
    "pile.draw": "Mazo ({n})",
    "pile.discard": "Descartes ({n})",
    "pile.reshuffles": "Barajadas restantes: {n}",   // TODO review
    "pile.endsRound": "Robar aquí termina la ronda",   // TODO review
    "seat.you": "Tú (Jugador 1)",
    "seat.cpu": "{name} ({level})",
    "seat.score": "{name} · {n} pts",
    "seat.out": " · ELIMINADO",

    // ---- Cards ----
    "suit.oros": "oros",
    "suit.copas": "copas",
    "suit.espadas": "espadas",
    "suit.bastos": "bastos",
    "card.fig.10": "Sota",
    "card.fig.11": "Caballo",
    "card.fig.12": "Rey",
    "card.title": "{value} de {suit}{fig}",
    "card.closeChinchon": " - cerrar con CHINCHÓN",
    "card.closeScore": " - cerrar y anotar {n}",
    "meld.run": "Escalera",
    "meld.group": "Grupo",

    // ---- Scoreboard ----
    "board.round": "Ronda {n} (eliminado al superar {limit} puntos)",
    "board.roundOf": "Ronda {n} de {max} (eliminado al superar {limit} puntos)",   // TODO review
    "board.tieBreak": "Ronda {n}: desempate (eliminado al superar {limit} puntos)",   // TODO review
    "board.player": "Jugador",
    "board.total": "Total",
    "board.last": "Última ronda",
    "board.status": "Estado",
    "board.in": "en juego",
    "board.out": "ELIMINADO",

    // ---- Status line ----
    "msg.yourTurn": "Tu turno: haz clic en el mazo o en la carta superior de los descartes para coger una carta.",
    "msg.yourTurnDeckDone": "Tu turno: el mazo se agotó. Coge la carta superior de los descartes para seguir, o haz clic en el mazo vacío para terminar la ronda (cada uno anota su mano).",   // TODO review
    "msg.playing": "{who} está jugando...",
    "msg.tookDiscard": "{who} tomó {card} de los descartes...",
    "msg.drewDeck": "{who} tomó una carta del mazo...",
    "msg.pickDiscard": "Haz clic en una carta de tu mano para descartarla, o presiona Cerrar ronda si puedes.",
    "msg.closing": "Cerrando: haz clic en la carta resaltada que quieres descartar. (Presiona el botón otra vez para cancelar.)",
    "msg.mayReenter": "Puedes volver a entrar más abajo.",
    "msg.pressNext": "Presiona Siguiente ronda.",
    "msg.gameOver": "¡Fin de la partida! {winner} ({reason}).",

    // ---- How a round ended ----
    "sum.stalemate": "Ronda bloqueada: el mazo se agotó demasiadas veces y nadie cerró.",
    "sum.closed.you": "Cerraste la ronda.",
    "sum.closed.cpu": "{who} cerró la ronda.",
    "sum.chinchon.you": "¡Hiciste CHINCHÓN!",
    "sum.chinchon.cpu": "¡{who} hizo CHINCHÓN!",
    "sum.points": "Puntos de la ronda: {list}.",
    "sum.chinchonWord": "Chinchón",
    "notice.out": "Eliminados (más de {limit}): {names}.",
    "notice.reentered": "Volvieron a entrar con {score}: {names}.",
    "notice.tieBreak": "Empate en el total más bajo ({score}): {names}. Una ronda más decide.",   // TODO review
    "win.you": "Ganaste",
    "win.cpu": "{who} ganó",
    "reason.chinchon": "¡Chinchón!",
    "reason.allOut": "todos superaron el límite; gana el total más bajo",
    "reason.lastStanding": "último jugador en pie",
    "reason.roundLimit": "total más bajo tras la última ronda",   // TODO review

    // ---- Confirmation bars ----
    "confirm.deck": "¿Cambiar a la baraja de {n} cartas? Esto inicia una nueva partida.",
    "confirm.rules": "¿Cambiar esta regla? Esto inicia una nueva partida.",   // TODO review
    "confirm.cpus.one": "¿Jugar contra {n} CPU? Esto inicia una nueva partida.",
    "confirm.cpus.other": "¿Jugar contra {n} CPU? Esto inicia una nueva partida.",
    "confirm.yes": "Iniciar nueva partida",
    "confirm.no": "Seguir jugando",
    "reentry.text.one": "Estás eliminado. ¿Volver a entrar con {n} punto?",
    "reentry.text.other": "Estás eliminado. ¿Volver a entrar con {n} puntos?",
    "reentry.left": "(Reenganches restantes: {n}.)",   // TODO review

    // ---- Hints panel ----
    "hint.title": "Análisis de tu mano",
    "hint.melds": "Combinaciones",
    "hint.unmatched": "Sueltas",
    "hint.canClose": "Puedes cerrar",
    "hint.none": "ninguna",
    "hint.no": "No",
    "hint.notPlaying": "No juegas esta ronda.",
    "hint.yes": "Sí (anotarías {n})",
    "hint.yesChinchon": "Sí: ¡CHINCHÓN!",
    "hint.yesDiscard": "Sí: descarta {discard} (anotarías {n})",
    "hint.yesDiscardChinchon": "Sí: descarta {discard} para hacer ¡CHINCHÓN!",

    // ---- Round results panel ----
    "res.title": "Ronda {n}: {headline}",
    "res.head.stalemate": "Ronda bloqueada: nadie cerró",
    "res.head.closed.you": "Cerraste la ronda",
    "res.head.closed.cpu": "{who} cerró la ronda",
    "res.head.chinchon.you": "¡Hiciste CHINCHÓN!",
    "res.head.chinchon.cpu": "¡{who} hizo CHINCHÓN!",
    "res.badgeClosed": "cerró",
    "res.badgeOut": "eliminado",
    "res.total": "total {n}",
    "res.chinchon": "¡Chinchón!",
    "res.leftover": "Sueltas: {n} pts",
    "res.noticeWin.you": "¡Ganaste la partida!",
    "res.noticeWin.cpu": "¡{who} ganó la partida!",
  },
};

const LANGUAGES  = Object.keys(STRINGS);   // ["en", "es"]
const LANG_STORAGE_KEY = "chinchon-lang";  // where the choice is remembered (localStorage)

/* ---------------------------------------------------------
   2. THE CURRENT LANGUAGE
   --------------------------------------------------------- */

// Saved choice first, else the browser's language, else English.
// localStorage can throw (private windows, blocked site data, file:// in some
// browsers) and does not exist in Node, so every use sits inside try/catch.
function detectLanguage() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch (err) { /* no storage: fall through */ }
  const browser = (typeof navigator !== "undefined" && navigator.language) || "en";
  const code = browser.slice(0, 2).toLowerCase();    // "es-MX" -> "es"
  return LANGUAGES.includes(code) ? code : "en";
}

let currentLang = detectLanguage();

// Switch language, remember it, and redraw. render() (ui.js) also updates the
// static HTML text and <html lang>, so this function never touches the page itself.
function setLanguage(code) {
  if (!LANGUAGES.includes(code)) return;
  currentLang = code;
  try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch (err) { /* not remembered; fine */ }
  render();
}

/* ---------------------------------------------------------
   3. LOOKING TEXT UP
   --------------------------------------------------------- */

// Some placeholders hold DATA (a player number, a card) rather than text. Their
// NAME says how to turn them into words, so state can keep the data.
const FORMATTERS = {
  who:    p => playerName(p),                               // player number -> "You" / "CPU 2"
  names:  ps => ps.map(playerName).join(", "),              // [1, 3] -> "CPU 1, CPU 3"
  card:   c => `${c.value}${SUIT_SYMBOL[c.suit]}`,          // {value, suit} -> "12🪙"
  suit:   s => t(`suit.${s}`),
  fig:    v => FIGURE_VALUES.includes(v) ? ` (${t(`card.fig.${v}`)})` : "",   // 12 -> " (Rey)", 5 -> ""
  level:  l => t(`level.${l}`),
  winner: p => t(whoKey("win", p), { who: p }),             // 0 -> "You win", 2 -> "CPU 2 wins"
  reason: key => t(key),                                    // a "reason.*" key
  // The round's points as "You: 5 | CPU 1: Chinchón": [{ p, pts, chinchon }, ...]
  list:   rows => rows.map(r =>
            `${playerName(r.p)}: ${r.chinchon ? t("sum.chinchonWord") : r.pts}`).join(" | "),
};
const FIGURE_VALUES = [10, 11, 12];   // the cards that show a figure and have a name

// Text for `key` in the current language, with {placeholders} filled from `vars`
// (a plain object). Falls back to English, then to the key itself, so a missing
// translation shows up as something visible instead of crashing the page.
function t(key, vars = {}) {
  const template = STRINGS[currentLang][key] ?? STRINGS.en[key];
  if (template === undefined) {
    console.warn("Missing text key:", key);
    return key;
  }
  // Each {name} is replaced by vars.name (through its formatter, if it has one).
  return template.replace(/\{(\w+)\}/g, (whole, name) => {
    if (!(name in vars)) return whole;                      // leave it visible: a bug to notice
    const format = FORMATTERS[name];
    return String(format ? format(vars[name]) : vars[name]);
  });
}

// Text that depends on a count. Looks up key.one or key.other (chosen by the
// language's own plural rules, which Intl.PluralRules knows) and fills in {n}.
// Languages with more forms (Polish, Arabic...) would just add key.few and so on.
function plural(key, n, vars = {}) {
  const form = new Intl.PluralRules(currentLang).select(n);   // "one" or "other"
  const known = `${key}.${form}` in STRINGS[currentLang];
  return t(`${key}.${known ? form : "other"}`, { n, ...vars });
}

/* ---------------------------------------------------------
   4. MESSAGES KEPT IN STATE
   ---------------------------------------------------------
   A message is { key, vars }: which sentence, and its data. game.js stores these
   (state.status, state.summary, state.notice) instead of finished sentences.
   --------------------------------------------------------- */
const msg = (key, vars = {}) => ({ key, vars });
const tm  = m => t(m.key, m.vars);                          // one message -> text
const tms = ms => ms.map(tm).join(" ");                     // several messages -> one line of text

// "You" and "CPU 1" need different verbs ("You win" / "CPU 1 wins", "Ganaste" / "CPU 1 ganó"),
// so those messages come in two versions, key.you and key.cpu.
const whoKey = (key, p) => `${key}.${p === 0 ? "you" : "cpu"}`;

// Display name of a player: seat 0 is the human, the others are CPU 1, 2, 3
const playerName = p => p === 0 ? t("player.you") : t("player.cpu", { n: p });
