/* =========================================================
   effects.js: card animations, score pop-ups and the Chinchón fireworks
   ---------------------------------------------------------
   Moved out of ui.js to keep that file shorter; it shares ui.js's global scope
   (constants such as MOVE_MS and POP_MS come from there). render() in ui.js
   calls animateChanges() at its end; everything else here starts from that.
   Nothing here changes `state`.
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   Card animations. render() rebuilds every card from scratch, so a card that
   "moves" is really a new element. To make it look like it travelled, we compare
   this render with the previous one (animSeen), and slide the NEW card in from
   where it came from: the draw pile, the discard pile, or the hand it was played from.
   The sliding uses the Web Animations API: element.animate(keyframes, options).
   Nothing here changes `state`, and nothing runs when the player's system asks
   for reduced motion.
   --------------------------------------------------------- */
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");  // live: .matches follows the OS setting
let animSeen = { deals: 0, drawLen: 0, discardLen: 0, handLen: [],      // what the previous render looked like
                 phase: null, current: null, gameOver: false };
let discardFrom = null;       // where the card you just tapped was (set by the tap, used once)

// Slide a card element from `from` (a rectangle) to where it now is.
// matchSize: also start at the size of `from` (a pile card is bigger than a hand card).
function slideFrom(el, from, matchSize, delay = 0) {
  const to = el.getBoundingClientRect();
  const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
  const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
  const scale = matchSize ? from.width / to.width : 1;
  el.style.zIndex = 30;                                   // fly above the other cards
  const anim = el.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "none" }],
    { duration: MOVE_MS, delay, easing: "ease-out", fill: "backwards" });   // backwards: wait at the start spot during the delay
  const done = () => { el.style.zIndex = ""; };
  anim.onfinish = done;
  anim.oncancel = done;
}

const rectOf = id => document.getElementById(id).getBoundingClientRect();

// The cards of a new round fly out of the draw pile one at a time, round the table
function animateDeal() {
  const from = rectOf("draw-slot");
  let n = 0;
  for (let r = 0; r < CARDS_PER_HAND; r++) {
    for (let p = 0; p < state.numPlayers; p++) {
      const card = document.querySelectorAll(`#hand-${p} .card`)[r];
      if (card) slideFrom(card, from, true, (n++) * DEAL_STAGGER_MS);
    }
  }
}

// Called at the end of every render(): compare with the previous render and play what
// changed, as card slides (unless reduced motion is on) and sounds (unless Sound is off).
function animateChanges(rebuilt) {
  const prev = animSeen;
  const now = { deals: state.deals, drawLen: state.drawPile.length,
                discardLen: state.discardPile.length, handLen: prev.handLen.slice(),
                phase: state.phase, current: state.currentPlayer, gameOver: state.gameOver };
  state.hands.forEach((hand, p) => { if (rebuilt[p]) now.handLen[p] = hand.length; });
  const motion = !REDUCED_MOTION.matches;

  if (now.deals !== prev.deals) {
    stopFireworks();                                  // a new round or game: the Chinchón party is over
    if (motion) animateDeal();
    playSound("deal");
  } else {
    for (let p = 0; p < state.numPlayers; p++) {
      if (!rebuilt[p]) continue;
      const before = prev.handLen[p] || 0, after = now.handLen[p];
      if (after === before + 1) {
        // A card was drawn. It came from the discard pile if that shrank and the draw pile did not.
        const fromDiscard = now.discardLen === prev.discardLen - 1 && now.drawLen === prev.drawLen;
        const cards = document.querySelectorAll(`#hand-${p} .card`);
        if (motion) slideFrom(cards[cards.length - 1], rectOf(fromDiscard ? "discard-slot" : "draw-slot"), true);
        playSound("draw");
      } else if (after === before - 1 && now.discardLen === prev.discardLen + 1) {
        // A card was discarded: slide the new top of the discard pile in from the hand
        const top = document.querySelector("#discard-slot .card");
        const from = (p === 0 && discardFrom) ? discardFrom : rectOf(`hand-${p}`);
        if (top && motion) slideFrom(top, from, p === 0 && discardFrom !== null);
        playSound("discard");
      }
    }
  }

  // The round just ended (a close or a stalemate), the game just ended with your win,
  // or your turn just began
  if (now.phase === "roundOver" && prev.phase !== "roundOver") {
    const chinchon = Boolean(state.roundResult && state.roundResult.chinchon);
    playSound(chinchon ? "chinchon" : "close");
    if (chinchon) launchFireworks();                   // the easter egg (not with reduced motion)
  }
  if (now.gameOver && !prev.gameOver && state.winner === 0) playSound("win");
  if (now.phase === "draw" && now.current === 0 && now.deals === prev.deals &&
      (prev.current !== 0 || prev.phase !== "draw")) {
    playSound("turn");
    // Online, with the game in the background (friends were playing while you looked at
    // something else): a short buzz too, where the phone allows it (renderTitle marks the tab)
    if (online.playing && document.hidden && navigator.vibrate) navigator.vibrate(TURN_BUZZ_MS);
  }

  queueScorePops(now.deals !== prev.deals && state.round === 1);   // true when a new game was dealt
  animSeen = now;
  discardFrom = null;
}

// ---- Score pop-ups ----
// When a round has been scored, each seat shows what it scored ("+12", "-10") floating up
// from its name. The results panel opens over the table at that moment, so the pop-ups
// wait until it is out of the way (hidden, or the next round has started).
// (Keyed by state.deals, which goes up with every deal, unlike the round number.)
let scorePops = { deal: 0, points: null };    // the deal already queued, and points waiting to be shown
function queueScorePops(newGame) {
  if (newGame) scorePops.points = null;                          // an old game's points are not shown
  // A round result we have not queued yet (and not while lay-offs can still change the points)
  if (state.roundDetail && !state.layoff && scorePops.deal !== state.deals) {
    scorePops = { deal: state.deals, points: state.roundDetail.map(d => d && d.points) };
  }
  if (!scorePops.points || state.showResults) return;
  if (!REDUCED_MOTION.matches) {
    scorePops.points.forEach((pts, p) => {
      if (pts === null || pts === undefined || pts === 0 || p >= state.numPlayers) return;
      showScorePop(p, pts);
    });
  }
  scorePops.points = null;
}
function showScorePop(p, pts) {
  const pop = document.createElement("span");
  pop.className = "score-pop" + (pts < 0 ? " good" : "");
  pop.textContent = pts > 0 ? `+${pts}` : `\u2212${-pts}`;   // \u2212 is a real minus sign
  // Starting over the top edge of the seat's name chip: offsetTop is the chip's distance
  // from the top of the seat (the seat is the positioned box the pop-up is placed in)
  const seat = document.getElementById(`seat-${p}`);
  seat.appendChild(pop);
  pop.style.top = `${seat.querySelector(".seat-name").offsetTop - pop.offsetHeight / 2}px`;
  const anim = pop.animate(
    [{ opacity: 0, transform: "translate(-50%, 6px) scale(.8)" },
     { opacity: 1, transform: "translate(-50%, -10px) scale(1.1)", offset: 0.2 },
     { opacity: 0, transform: "translate(-50%, -24px) scale(1)" }],
    { duration: POP_MS, easing: "ease-out" });
  anim.onfinish = () => pop.remove();
}

/* ---------------------------------------------------------
   CHINCHÓN FIREWORKS: an easter egg for the rarest hand in the game.
   When anyone makes a Chinchón, fireworks and emojis fill the whole screen for a
   few seconds. They are painted on a <canvas>, a bitmap that the script draws on
   (rather like a plotting device in R), laid over everything. pointer-events: none
   (style.css) lets taps go through it to the results panel underneath.
   The show is a simple particle system: every frame, each particle moves by its
   velocity, gravity pulls it down, and it fades as its life runs out. Rockets fly
   up and burst into sparks or into a handful of emojis, and emojis rain from the top.
   Skipped with reduced motion. Nothing here changes `state`.
   --------------------------------------------------------- */
const FIREWORKS_MS      = 6500;   // how long the whole show lasts
const ROCKETS_UNTIL_MS  = 4500;   // no new rockets after this, so the last bursts fade in time
const ROCKET_EVERY_MS   = 260;    // a new rocket this often
const RAIN_UNTIL_MS     = 3000;   // emojis keep raining from the top until this
const RAIN_EVERY_MS     = 90;     // a new falling emoji this often
const SPARKS_PER_BURST  = 70;     // sparks in one burst
const EMOJIS_PER_BURST  = 9;      // emojis in one emoji burst (every third burst)
const GRAVITY           = 0.06;   // pixels per frame per frame, pulling sparks and emojis down
const ROCKET_GRAVITY    = 0.25;   // stronger for the rockets, so they shoot up fast and burst within about a second
const FIREWORK_COLOURS  = ["#f5c84c", "#ff5d73", "#5fd88a", "#5ec8f0", "#c77dff", "#ffffff"];
const FIREWORK_EMOJIS   = ["🎉", "🎆", "🎇", "✨", "🥳", "🍾", "🏆", "🌟", "👑", "🃏", "💰", "🤩"];
const EMOJI_FONT        = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

let fireworks = null;     // the show in progress (null = none)

// A random number between lo and hi, and a random item of a list
const between = (lo, hi) => lo + Math.random() * (hi - lo);
const pickOne = list => list[Math.floor(Math.random() * list.length)];

function launchFireworks() {
  if (fireworks || REDUCED_MOTION.matches) return;
  const canvas = document.createElement("canvas");
  canvas.id = "fireworks";
  canvas.setAttribute("aria-hidden", "true");          // decoration only: screen readers skip it
  document.body.appendChild(canvas);
  const now = performance.now();                       // milliseconds, like Date.now() but smoother
  fireworks = { canvas, ctx: canvas.getContext("2d"), start: now, last: now,
                nextRocket: 0, nextRain: 0, bursts: 0, rockets: [], particles: [] };
  // requestAnimationFrame(f) calls f just before the browser paints the next frame
  // (about 60 times a second), passing it the current time
  requestAnimationFrame(fireworksFrame);
}

function stopFireworks() {
  if (!fireworks) return;
  fireworks.canvas.remove();
  fireworks = null;
}

// A rocket from the bottom edge, fast enough to burst somewhere in the top half.
// (Thrown upwards at speed v, it climbs v² / 2g before it stops: so v = √(2 g height).)
function addRocket(w, h) {
  const climb = h * between(0.5, 0.8);
  fireworks.rockets.push({ x: between(w * 0.1, w * 0.9), y: h, vx: between(-1, 1),
                           vy: -Math.sqrt(2 * ROCKET_GRAVITY * climb), colour: pickOne(FIREWORK_COLOURS) });
}

// A rocket at the top of its climb bursts: into sparks of its colour, or every third time into emojis
function burst(rocket) {
  const emojis = ++fireworks.bursts % 3 === 0;
  const count = emojis ? EMOJIS_PER_BURST : SPARKS_PER_BURST;
  for (let i = 0; i < count; i++) {
    const angle = between(0, 2 * Math.PI);
    const speed = emojis ? between(1.5, 3.5) : between(1, 4.5);
    const life = between(55, 90);                      // in frames
    fireworks.particles.push({
      x: rocket.x, y: rocket.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life, maxLife: life, gravity: GRAVITY,
      colour: emojis ? null : pickOne([rocket.colour, rocket.colour, "#ffffff"]),
      emoji: emojis ? pickOne(FIREWORK_EMOJIS) : null, size: between(22, 36),
      rot: 0, spin: between(-0.08, 0.08),
    });
  }
  playSound("firework");
}

// An emoji falling from the top edge, swaying a little and spinning slowly
function addRain(w) {
  fireworks.particles.push({
    x: between(0, w), y: -30, vx: between(-0.6, 0.6), vy: between(1.5, 3.5),
    life: 400, maxLife: 400, gravity: 0.01,
    colour: null, emoji: pickOne(FIREWORK_EMOJIS), size: between(24, 44),
    rot: between(-0.5, 0.5), spin: between(-0.04, 0.04),
  });
}

// One frame of the show: add rockets and rain while it is their time, move everything, draw it
function fireworksFrame(now) {
  const fw = fireworks;
  if (!fw) return;                                     // stopped since the last frame
  const t = now - fw.start;
  if (t > FIREWORKS_MS) { stopFireworks(); return; }

  // Keep the canvas as big as the window, in real screen pixels (devicePixelRatio is 2 or 3
  // on most phones), and draw in CSS pixels: setTransform scales everything for us
  const w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
  if (fw.canvas.width !== Math.round(w * dpr) || fw.canvas.height !== Math.round(h * dpr)) {
    fw.canvas.width = Math.round(w * dpr);
    fw.canvas.height = Math.round(h * dpr);
  }
  const ctx = fw.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // dt: how many 60-per-second frames have passed, so the speed is the same on any screen
  // (capped, so a pause in a background tab does not make everything jump)
  const dt = Math.min(3, (now - fw.last) / (1000 / 60));
  fw.last = now;

  while (t < ROCKETS_UNTIL_MS && t >= fw.nextRocket) { addRocket(w, h); fw.nextRocket += ROCKET_EVERY_MS; }
  while (t < RAIN_UNTIL_MS && t >= fw.nextRain) { addRain(w); fw.nextRain += RAIN_EVERY_MS; }

  // Rockets: a short bright streak going up; they burst once they stop climbing
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  fw.rockets = fw.rockets.filter(r => {
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.vy += ROCKET_GRAVITY * dt;
    if (r.vy >= 0) { burst(r); return false; }         // false = drop it from the list
    ctx.strokeStyle = r.colour;
    ctx.beginPath();
    ctx.moveTo(r.x - r.vx * 2, r.y - r.vy * 2);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
    return true;
  });

  // Sparks and emojis: fade out over their life (globalAlpha is the see-through-ness of what is drawn next)
  ctx.font = `30px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fw.particles = fw.particles.filter(p => {
    p.vx *= 0.985;                                     // a little air resistance
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.rot += p.spin * dt;
    p.life -= dt;
    if (p.life <= 0 || p.y > h + 50) return false;
    ctx.globalAlpha = Math.min(1, p.life / p.maxLife * 1.5);
    if (p.emoji) {
      ctx.save();                                      // save/restore: the move and turn apply to this emoji only
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.font = `${p.size}px ${EMOJI_FONT}`;
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    } else {
      ctx.strokeStyle = p.colour;                      // a spark: a short line along its path
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    return true;
  });
  ctx.globalAlpha = 1;

  requestAnimationFrame(fireworksFrame);
}
