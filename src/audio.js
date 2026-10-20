// WebAudio SFX + remote BGM/sheep audio. All sources are remote URLs from data.js;
// no local file loading (this is a static GitHub Pages site).
import { S } from './state.js';
import { $ } from './util.js';
import { BGM_SRC, SHEEP_SRC } from './data.js';
import { zoomFx } from './fx.js';

let bgm = null;      // HTMLAudioElement, loops during battle
let sheepAud = null; // HTMLAudioElement for the beep button
let sheepTO = null;

export function log(s) { $('#log').textContent = s; }

// Must be called from a user gesture (autoplay policy).
export function audioStart() {
  if (S.muted) return;
  try {
    if (!S.actx) S.actx = new (window.AudioContext || window.webkitAudioContext)();
    S.actx.resume();
    if (!S.bgmOn) {
      S.bgmOn = true;
      if (bgm && !S.muted) bgm.play().catch(() => {});
    }
  } catch (e) {}
}

export function tone(f, d = .12, type = 'square', v = .03, slide = 0) {
  if (S.muted || !S.actx) return;
  const o = S.actx.createOscillator(), g = S.actx.createGain();
  o.type = type; o.frequency.value = f;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), S.actx.currentTime + d);
  g.gain.setValueAtTime(v, S.actx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001, S.actx.currentTime + d);
  o.connect(g); g.connect(S.actx.destination);
  o.start(); o.stop(S.actx.currentTime + d);
}

export function sfx(a) {
  if (S.muted) return;
  if (a === 'hit') { tone(160, .15, 'sawtooth', .06, -90); tone(90, .2, 'square', .03, -40); }
  if (a === 'heal') [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .15, 'sine', .04), i * 80));
  if (a === 'coin') tone(900, .12, 'square', .04, 350);
  if (a === 'hurt') tone(180, .25, 'sawtooth', .06, -120);
  if (a === 'win') [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .22, 'square', .035), i * 110));
}

export function bgmPause() { if (bgm) bgm.pause(); }
export function bgmMuted(m) { if (bgm) { bgm.muted = m; if (!m) bgm.play().catch(() => {}); } }

// Try each URL in order until one can play; call ok(audio, label).
function tryList(list, ok) {
  let i = 0;
  (function nx() {
    if (i >= list.length) return;
    const a = new Audio();
    a.preload = 'auto';
    a.oncanplaythrough = () => { a.oncanplaythrough = null; ok(a, list[i - 1]); };
    a.onerror = () => nx();
    a.src = list[i++];
  })();
}

function setBgm(a) {
  if (bgm) bgm.pause();
  bgm = a; a.loop = true; a.volume = .6; a.muted = S.muted;
  if (S.mode === 'battle' || S.mode === 'dodge') a.play().catch(() => {});
}

function setSheep(a) { sheepAud = a; a.volume = 1; }

export function loadRemoteAudio() {
  tryList(BGM_SRC, setBgm);
  tryList(SHEEP_SRC, setSheep);
}

// Beep button: works even when muted (visual hop + gentle punch); speech-synth fallback.
export function sheepBeep() {
  S.sheepSay = 2200;
  zoomFx(0);
  if (S.muted) return;
  audioStart();
  if (sheepAud) {
    sheepAud.currentTime = 0;
    sheepAud.play().catch(() => {});
    clearTimeout(sheepTO);
    sheepTO = setTimeout(() => sheepAud.pause(), 2300);
    return;
  }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('beep beep, I’m a sheep');
    u.pitch = 2; u.rate = 1.4;
    speechSynthesis.speak(u);
  } catch (e) {}
}
