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
    "btn.closeBest": "Close round ({n} pts)",
    "btn.closeChinchon": "Close: CHINCHÓN!",
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
    "set.deckTip": "With 4 players the 40-card deck runs out quickly. The 48-card deck means fewer reshuffles.",
    "set.deckTipBtn": "Use 48 cards",
    "set.keys": "Keys: 1-8 discard · D draw pile · T take discard · C close · S sort · Enter next round · H help",
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
    // .touch: the same prompts for touch screens ("tap" instead of "click"; see statusText in ui.js)
    "msg.yourTurn.touch": "Your turn: tap the draw pile or the top discard to take a card.",
    "msg.yourTurnDeckDone.touch": "Your turn: the draw pile is used up. Take the top discard to play on, or tap the empty pile to end the round (everyone scores their hand).",
    "msg.pickDiscard.touch": "Tap a card in your hand to discard it, or press Close round if you can.",
    "msg.closing.touch": "Closing: tap the highlighted card you want to discard. (Press the button again to cancel.)",
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
    "hint.notYet": "Not yet (everyone plays one turn first)",
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
    "res.gameOver": "Game over",
    "res.standings": "Final standings",

    // ---- Help panel (the ? button) ----
    "btn.help": "Help",
    "btn.closeHelp": "Close",
    "help.title": "How to play",
    "help.aim.h": "The aim",
    "help.aim.p": "Chinchón is played in rounds. In each round you try to arrange your cards into melds and get rid of the cards that do not fit. When a round ends, every player adds the points of their unmatched cards to their total. Go over 100 points and you are out. The last player still in wins (or, with a round limit, the lowest total).",
    "help.cards.h": "The cards",
    "help.cards.p1": "The Spanish deck has four suits: oros (coins), copas (cups), espadas (swords) and bastos (clubs). Each suit has the numbers 1-7 and the figures 10 (sota), 11 (caballo) and 12 (rey): 40 cards. The 48-card deck adds the 8s and 9s.",
    "help.cards.p2": "Points: a card counts its number, and the figures count 10. Low points are good.",
    "help.turn.h": "Your turn",
    "help.turn.li1": "Take one card: the top of the draw pile (face down) or the top of the discard pile (face up). The pile you can take from pulses.",
    "help.turn.li2": "Then discard one card by tapping or clicking it, or close the round (see Closing).",
    "help.turn.li3": "Drag a card to move it within your hand. Sort hand orders the hand by number or by suit.",
    "help.turn.li4": "Each player starts with seven cards. The CPUs play in turn after you: watch what they take and what they throw away.",
    "help.melds.h": "Melds",
    "help.melds.li1": "Group: 3 or 4 cards of the same number, such as three 5s.",
    "help.melds.li2": "Run: 3 or more cards in a row of one suit, such as 4-5-6 of copas. Runs follow the deck: with 40 cards, 7-10-11 is a run (there are no 8s or 9s); with 48 cards, 7-8-9 is. The 12 does not connect back to the 1.",
    "help.melds.li3": "A card can be part of only one meld. There are no jokers.",
    "help.close.h": "Closing",
    "help.close.p": "Instead of a normal discard you may close the round, if the cards you keep have at least one meld and no more than 7 points in unmatched cards.",
    "help.close.li1": "Press Close round, then choose the highlighted card to discard. Press the button again to cancel.",
    "help.close.li2": "Nobody may close in the first lap of a round: every player still in must have played one turn first.",
    "help.close.li3": "When someone closes, every player scores the points of their unmatched cards, the closer too.",
    "help.close.li4": "Close with no unmatched cards at all and you score -10 for the round.",
    "help.chinchon.h": "Chinchón",
    "help.chinchon.p": "A Chinchón is all seven of your cards in one run of a single suit, such as 1 to 7 of oros. Closing with a Chinchón wins the whole game at once.",
    "help.scores.h": "Scores, elimination and re-entry",
    "help.scores.li1": "Totals carry over from round to round. A player whose total goes over 100 is out.",
    "help.scores.li2": "A player who is out may re-enter with the highest total among the players still in. The re-entries setting limits how often.",
    "help.scores.li3": "The game ends with a Chinchón, when only one player is left in, or after the last round when there is a round limit (the lowest total wins; a tie means one more round).",
    "help.deck.h": "When the draw pile runs out",
    "help.deck.p": "The discard pile, all but its top card, is shuffled into a new draw pile. The reshuffles setting limits how often this can happen in a round, and the number left is shown under the pile. Once none are left, drawing from the empty pile ends the round with no closer and everyone scores their unmatched cards. Taking the top discard instead keeps the round going.",
    "help.settings.h": "Settings (the ⚙ button)",
    "help.settings.li1": "Sort by: whether Sort hand orders your cards by number or by suit.",
    "help.settings.li2": "CPUs: play against 1, 2 or 3 CPU players. Starts a new game.",
    "help.settings.li3": "CPU level: Easy makes many mistakes, Medium a few, Hard none. Mixed gives one CPU of each level. Takes effect straight away.",
    "help.settings.li4": "CPU speed: how long the CPUs pause on each move, so you can follow what they do.",
    "help.settings.li5": "Deck: 40 cards, or 48 with the 8s and 9s (handy with more players). Starts a new game.",
    "help.settings.li6": "Reshuffles per round: how many times the draw pile may be refilled in a round. Starts a new game.",
    "help.settings.li7": "Re-entries per player: how many times each player may come back after going out. Starts a new game.",
    "help.settings.li8": "Rounds per game: with no limit you play until one player is left; otherwise the lowest total after the last round wins. Starts a new game.",
    "help.settings.p": "Your settings and language are remembered on this device.",
    "help.screen.h": "Hints, results and other help",
    "help.screen.li1": "Hints: shows the melds in your hand, your unmatched points and whether you can close (and with which discard). Your melds get coloured bars and the Close button shows your best score. Leave it off for the full challenge.",
    "help.screen.li2": "Round results: after each round, every hand is shown split into melds and leftover cards. Hide it to look at the table; the Round results button opens it again.",
    "help.screen.li3": "Turn cues: the player whose turn it is has a gold name, and dots show while a CPU is thinking. The card you just drew has a small gold dot.",
    "help.screen.li4": "New game, at the bottom of the Settings panel, starts over at any time. When you are out, a bar under the table asks whether you want to re-enter.",
    "help.keys": "Keyboard: 1-8 discard that card · D draw pile · T take the discard · C close · S sort · Enter next round · H help · Escape close this panel.",
  },

  es: {
    "app.title": "Chinchón",
    "lang.label": "Idioma",

    // ---- Buttons ----
    "btn.sort": "Ordenar mano",
    "btn.close": "Cerrar ronda",
    "btn.closeCancel": "Cancelar cierre",
    "btn.closeBest": "Cerrar ronda ({n} pts)",   // TODO review
    "btn.closeChinchon": "Cerrar: ¡CHINCHÓN!",   // TODO review
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
    "set.deckTip": "Con 4 jugadores la baraja de 40 cartas se agota enseguida. Con la de 48 hay que barajar menos veces.",   // TODO review
    "set.deckTipBtn": "Usar 48 cartas",   // TODO review
    "set.keys": "Teclado: 1-8 descartar · D mazo · T coger descarte · C cerrar · S ordenar · Intro siguiente ronda · H ayuda",   // TODO review
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
    // .touch: the same prompts for touch screens ("tap" instead of "click"; see statusText in ui.js)
    "msg.yourTurn.touch": "Tu turno: toca el mazo o la carta superior de los descartes para coger una carta.",   // TODO review
    "msg.yourTurnDeckDone.touch": "Tu turno: el mazo se agotó. Coge la carta superior de los descartes para seguir, o toca el mazo vacío para terminar la ronda (cada uno anota su mano).",   // TODO review
    "msg.pickDiscard.touch": "Toca una carta de tu mano para descartarla, o pulsa Cerrar ronda si puedes.",   // TODO review
    "msg.closing.touch": "Cerrando: toca la carta resaltada que quieres descartar. (Pulsa el botón otra vez para cancelar.)",   // TODO review
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
    "hint.notYet": "Todavía no (primero todos juegan un turno)",   // TODO review
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
    "res.gameOver": "Partida terminada",   // TODO review
    "res.standings": "Clasificación final",   // TODO review

    // ---- Help panel (the ? button) ----
    "btn.help": "Ayuda",   // TODO review
    "btn.closeHelp": "Cerrar",   // TODO review
    "help.title": "Cómo se juega",   // TODO review
    "help.aim.h": "El objetivo",   // TODO review
    "help.aim.p": "El Chinchón se juega por rondas. En cada ronda intentas combinar tus cartas y deshacerte de las que no encajan. Al terminar la ronda, cada jugador suma a su total los puntos de sus cartas sueltas. Quien supera los 100 puntos queda eliminado. Gana el último jugador que sigue en juego (o, con un límite de rondas, el total más bajo).",   // TODO review
    "help.cards.h": "Las cartas",   // TODO review
    "help.cards.p1": "La baraja española tiene cuatro palos: oros, copas, espadas y bastos. Cada palo tiene los números del 1 al 7 y las figuras 10 (sota), 11 (caballo) y 12 (rey): 40 cartas. La baraja de 48 cartas añade los 8 y los 9.",   // TODO review
    "help.cards.p2": "Puntos: cada carta vale su número y las figuras valen 10. Cuantos menos puntos, mejor.",   // TODO review
    "help.turn.h": "Tu turno",   // TODO review
    "help.turn.li1": "Coge una carta: la de arriba del mazo (boca abajo) o la de arriba de los descartes (boca arriba). El montón del que puedes coger se ilumina.",   // TODO review
    "help.turn.li2": "Después descarta una carta tocándola o haciendo clic en ella, o cierra la ronda (ver Cerrar).",   // TODO review
    "help.turn.li3": "Arrastra una carta para moverla dentro de tu mano. Ordenar mano ordena las cartas por número o por palo.",   // TODO review
    "help.turn.li4": "Cada jugador empieza con siete cartas. Las CPU juegan por turnos después de ti: fíjate en lo que cogen y en lo que descartan.",   // TODO review
    "help.melds.h": "Combinaciones",   // TODO review
    "help.melds.li1": "Grupo: 3 o 4 cartas del mismo número, por ejemplo tres 5.",   // TODO review
    "help.melds.li2": "Escalera: 3 o más cartas seguidas del mismo palo, por ejemplo 4-5-6 de copas. Las escaleras siguen la baraja: con 40 cartas, 7-10-11 es escalera (no hay 8 ni 9); con 48 cartas, lo es 7-8-9. El 12 no enlaza con el 1.",   // TODO review
    "help.melds.li3": "Cada carta solo puede formar parte de una combinación. No hay comodines.",   // TODO review
    "help.close.h": "Cerrar",   // TODO review
    "help.close.p": "En lugar de un descarte normal puedes cerrar la ronda, si las cartas que te quedan tienen al menos una combinación y no más de 7 puntos en cartas sueltas.",   // TODO review
    "help.close.li1": "Pulsa Cerrar ronda y elige la carta resaltada que quieres descartar. Pulsa el botón otra vez para cancelar.",   // TODO review
    "help.close.li2": "Nadie puede cerrar en la primera vuelta de una ronda: todos los jugadores en juego deben haber jugado un turno antes.",   // TODO review
    "help.close.li3": "Cuando alguien cierra, cada jugador anota los puntos de sus cartas sueltas, también quien cierra.",   // TODO review
    "help.close.li4": "Si cierras sin ninguna carta suelta, anotas -10 en esa ronda.",   // TODO review
    "help.chinchon.h": "Chinchón",   // TODO review
    "help.chinchon.p": "Un Chinchón son tus siete cartas en una sola escalera del mismo palo, por ejemplo del 1 al 7 de oros. Cerrar con Chinchón gana la partida entera de golpe.",   // TODO review
    "help.scores.h": "Puntuación, eliminación y reenganche",   // TODO review
    "help.scores.li1": "Los totales se acumulan de una ronda a otra. Quien supera los 100 puntos queda eliminado.",   // TODO review
    "help.scores.li2": "Un jugador eliminado puede volver a entrar con el total más alto de los jugadores que siguen en juego. La opción de reenganches limita cuántas veces.",   // TODO review
    "help.scores.li3": "La partida termina con un Chinchón, cuando solo queda un jugador en juego o, si hay límite de rondas, tras la última ronda (gana el total más bajo; si hay empate, se juega una ronda más).",   // TODO review
    "help.deck.h": "Cuando se acaba el mazo",   // TODO review
    "help.deck.p": "Los descartes, menos la carta de arriba, se barajan para formar un mazo nuevo. La opción de barajadas limita cuántas veces puede pasar en una ronda, y las que quedan se muestran bajo el mazo. Cuando no quedan, robar del mazo vacío termina la ronda sin que nadie cierre y cada uno anota sus cartas sueltas. Coger la carta de arriba de los descartes mantiene la ronda en marcha.",   // TODO review
    "help.settings.h": "Configuración (el botón ⚙)",   // TODO review
    "help.settings.li1": "Ordenar por: si Ordenar mano ordena tus cartas por número o por palo.",   // TODO review
    "help.settings.li2": "CPU: juega contra 1, 2 o 3 jugadores de la CPU. Empieza una partida nueva.",   // TODO review
    "help.settings.li3": "Dificultad: Fácil comete muchos errores, Medio algunos y Difícil ninguno. Mixto pone una CPU de cada nivel. Se aplica al momento.",   // TODO review
    "help.settings.li4": "Velocidad de la CPU: cuánto se detienen las CPU en cada jugada, para que puedas seguir lo que hacen.",   // TODO review
    "help.settings.li5": "Baraja: 40 cartas, o 48 con los 8 y los 9 (útil con más jugadores). Empieza una partida nueva.",   // TODO review
    "help.settings.li6": "Barajadas por ronda: cuántas veces se puede rehacer el mazo en una ronda. Empieza una partida nueva.",   // TODO review
    "help.settings.li7": "Reenganches por jugador: cuántas veces puede volver cada jugador tras ser eliminado. Empieza una partida nueva.",   // TODO review
    "help.settings.li8": "Rondas por partida: sin límite se juega hasta que queda un solo jugador; si no, gana el total más bajo tras la última ronda. Empieza una partida nueva.",   // TODO review
    "help.settings.p": "Tu configuración y tu idioma se guardan en este dispositivo.",   // TODO review
    "help.screen.h": "Pistas, resultados y otras ayudas",   // TODO review
    "help.screen.li1": "Pistas: muestra las combinaciones de tu mano, tus puntos sueltos y si puedes cerrar (y con qué descarte). Tus combinaciones llevan barras de color y el botón Cerrar muestra tu mejor puntuación. Déjalo apagado para el reto completo.",   // TODO review
    "help.screen.li2": "Resultados de la ronda: tras cada ronda se muestra cada mano separada en combinaciones y cartas sueltas. Ocúltalos para ver la mesa; el botón Resultados de la ronda los vuelve a abrir.",   // TODO review
    "help.screen.li3": "Avisos de turno: el jugador al que le toca tiene el nombre en dorado, y unos puntos aparecen mientras una CPU piensa. La carta que acabas de robar lleva un puntito dorado.",   // TODO review
    "help.screen.li4": "Nueva partida, al final del panel de Configuración, empieza de nuevo en cualquier momento. Cuando estás eliminado, una barra bajo la mesa te pregunta si quieres volver a entrar.",   // TODO review
    "help.keys": "Teclado: 1-8 descartar esa carta · D mazo · T coger descarte · C cerrar · S ordenar · Intro siguiente ronda · H ayuda · Esc cerrar este panel.",   // TODO review
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
