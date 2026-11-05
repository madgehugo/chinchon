/* =========================================================
   sound.js: short sound effects, made in code
   ---------------------------------------------------------
   No audio files: every sound is built on the spot with the Web Audio API,
   the browser's built-in synthesiser. A card sound is a very short burst of
   noise through a filter (like paper snapping); the jingles are a few
   notes from an oscillator (a tone generator).

   Browsers only allow sound after the player has touched the page, so the
   audio engine (an AudioContext) is created by unlockAudio(), which ui.js
   calls on the first tap, click or key press. Until then playSound() does
   nothing. Only ui.js calls into this file; the game logic never makes sounds,
   which keeps it runnable in Node (tools/harness.js does not load this file).
   ========================================================= */

"use strict";

const SOUND_VOLUME = 0.35;    // overall loudness, 0 to 1

let soundOn = true;           // the Sound setting (saved with the other settings in ui.js)
let audio = null;             // the AudioContext, once unlocked
let noiseBuffer = null;       // one second of random noise, reused by every card sound

function setSoundOn(on) { soundOn = on; }

// Create (or wake up) the audio engine. Safe to call many times.
function unlockAudio() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;   // older Safari uses the webkit name
    if (!Ctx) return;                                                 // no Web Audio: stay silent
    audio = new Ctx();
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (audio.state === "suspended") audio.resume();
}

// Sounds are built from nodes connected in a chain, ending at audio.destination (the
// speakers). An "envelope" shapes the loudness over time: a near-instant rise to `peak`,
// then a fade to silence over `length` seconds. (Exponential ramps cannot start from 0,
// hence 0.0001.)
function envelope(start, peak, length) {
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak * SOUND_VOLUME, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  gain.connect(audio.destination);
  return gain;
}

// A card snap: a slice of noise through a band-pass filter (which keeps only the
// frequencies around `pitch`; higher sounds lighter)
function snap(start, pitch, length = 0.05, peak = 0.9) {
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = pitch;
  filter.Q.value = 0.9;
  source.connect(filter).connect(envelope(start, peak, length));   // connect() returns its target, so calls chain
  source.start(start, Math.random() * 0.5, length + 0.02);         // a random slice, so no two snaps are identical
}

// A musical note of `freq` hertz
function note(start, freq, length = 0.25, peak = 0.35, type = "triangle") {
  const osc = audio.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(envelope(start, peak, length));
  osc.start(start);
  osc.stop(start + length + 0.05);
}

// Note frequencies (hertz) for the jingles
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G4 = 392;

// Each sound is a function of the start time (in the AudioContext's clock, seconds)
const SOUNDS = {
  deal(t)     { for (let i = 0; i < 6; i++) snap(t + i * 0.06, 2600 - i * 80, 0.04, 0.6); },
  draw(t)     { snap(t, 2200, 0.06); },
  discard(t)  { snap(t, 1500, 0.07); note(t, 140, 0.08, 0.25, "sine"); },   // a snap with a soft thud
  turn(t)     { note(t, 880, 0.12, 0.12, "sine"); note(t + 0.08, 1320, 0.14, 0.1, "sine"); },
  close(t)    { [C5, E5, G5].forEach((f, i) => note(t + i * 0.09, f, 0.3)); },
  chinchon(t) { [C5, E5, G5, C6, E6].forEach((f, i) => note(t + i * 0.08, f, 0.45)); },
  // played as the game ends with your win, just after the round's close sound
  win(t)      { [G4, C5, E5, G5, C6].forEach((f, i) => note(t + 0.35 + i * 0.11, f, 0.6, 0.4)); },
};

// Play one of SOUNDS by name, if sound is on and the player has unlocked it
function playSound(name) {
  if (!soundOn || !audio || audio.state !== "running") return;
  SOUNDS[name](audio.currentTime + 0.01);
}
