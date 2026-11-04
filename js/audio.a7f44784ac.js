// Synthesized sound kit (no audio files) plus a light march loop.
import { save } from './save.ce36348db2.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let musicOn = false, nextNote = 0, step = 0, timer = 0;
const last = {};

// A phone only lets sound start after the first finger lift.
export function unlockAudio() {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.75; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6; comp.connect(master);
  sfxBus = ctx.createGain(); sfxBus.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.13; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applySettings();
}
export function audioState() { return ctx ? ctx.state : 'none'; }
export function applySettings() {
  if (!ctx) return;
  sfxBus.gain.value = save.settings.sound ? 1 : 0;
  if (save.settings.music && !musicOn) startMusic();
  if (!save.settings.music && musicOn) stopMusic();
}

function tone(freq, t, dur, { type = 'sine', vol = 0.3, slide = 0, attack = 0.004, bus = sfxBus } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(t, dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', to = 0 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + 0.02);
}
// throttle so a wall of guns does not turn into white noise
function ok(k, gap) { const t = ctx.currentTime; if (t - (last[k] || 0) < gap) return false; last[k] = t; return true; }
const PENTA = [0, 2, 4, 7, 9];

export const sfx = {
  shot(kind = 'bullet') {
    if (!ctx || !ok('shot' + kind, kind === 'bullet' ? 0.05 : kind === 'laser' ? 0.06 : 0.08)) return;
    const t = ctx.currentTime;
    if (kind === 'bullet') { noise(t, 0.05, { vol: 0.09, freq: 2600, q: 1.2 }); tone(180, t, 0.05, { type: 'square', vol: 0.03, slide: 0.5 }); }
    else if (kind === 'pellet') { noise(t, 0.16, { vol: 0.22, freq: 900, q: 0.7, to: 300 }); }
    else if (kind === 'rocket') { noise(t, 0.35, { vol: 0.12, freq: 500, to: 2400, q: 0.8 }); }
    else if (kind === 'rail') { tone(1400, t, 0.18, { type: 'sawtooth', vol: 0.06, slide: 0.3 }); noise(t, 0.08, { vol: 0.12, freq: 4000 }); }
    else if (kind === 'zap') { tone(90, t, 0.18, { type: 'sawtooth', vol: 0.08, slide: 3 }); noise(t, 0.12, { vol: 0.08, freq: 6000, q: 3 }); }
    else if (kind === 'ice') { tone(1800, t, 0.1, { type: 'triangle', vol: 0.06, slide: 0.6 }); }
    else if (kind === 'saw') { tone(900, t, 0.09, { type: 'sawtooth', vol: 0.035, slide: 1.6 }); noise(t, 0.06, { vol: 0.07, freq: 5000, q: 2 }); }
    else if (kind === 'laser') { tone(1250 + Math.random() * 120, t, 0.07, { type: 'square', vol: 0.02, slide: 0.94 }); }
    else if (kind === 'harpoon') { noise(t, 0.12, { vol: 0.12, freq: 1300, q: 1.4, to: 400 }); tone(220, t, 0.1, { type: 'triangle', vol: 0.06, slide: 0.6 }); }
    else if (kind === 'mortar') { tone(110, t, 0.22, { type: 'sine', vol: 0.16, slide: 0.45 }); noise(t, 0.18, { vol: 0.14, freq: 420, q: 0.6 }); }
    else if (kind === 'flame') { noise(t, 0.12, { vol: 0.05, freq: 700, q: 0.5, type: 'lowpass' }); }
  },
  hit() { if (!ctx || !ok('hit', 0.04)) return; noise(ctx.currentTime, 0.04, { vol: 0.07, freq: 1500, q: 2 }); },
  pop(combo = 1) {
    if (!ctx || !ok('pop', 0.035)) return;
    const t = ctx.currentTime;
    const s = Math.max(0, Math.min(combo, 15) - 1);
    const f = 330 * Math.pow(2, (PENTA[s % 5] + 12 * Math.floor(s / 5)) / 12) * (1 + (Math.random() - 0.5) * 0.04);
    tone(f, t, 0.1, { type: 'triangle', vol: 0.13, slide: 1.5 });
    noise(t, 0.06, { vol: 0.1, freq: 900, q: 1 });
  },
  boom(big = false) {
    if (!ctx || !ok('boom', 0.06)) return;
    const t = ctx.currentTime;
    noise(t, big ? 0.9 : 0.5, { vol: big ? 0.5 : 0.32, freq: big ? 900 : 1400, to: 120, q: 0.6, type: 'lowpass' });
    tone(big ? 90 : 120, t, big ? 0.6 : 0.3, { type: 'sine', vol: big ? 0.5 : 0.3, slide: 0.4 });
  },
  plow() { if (!ctx || !ok('plow', 0.06)) return; const t = ctx.currentTime; tone(140, t, 0.12, { type: 'square', vol: 0.12, slide: 0.5 }); noise(t, 0.1, { vol: 0.18, freq: 600, q: 0.8 }); },
  hurt() { if (!ctx || !ok('hurt', 0.25)) return; const t = ctx.currentTime; tone(110, t, 0.2, { type: 'sawtooth', vol: 0.1, slide: 0.6 }); noise(t, 0.15, { vol: 0.12, freq: 300 }); },
  coin() { if (!ctx || !ok('coin', 0.05)) return; const t = ctx.currentTime; tone(1568, t, 0.06, { type: 'square', vol: 0.05 }); tone(2093, t + 0.05, 0.13, { type: 'square', vol: 0.05 }); },
  xp() { if (!ctx || !ok('xp', 0.03)) return; tone(1200 + Math.random() * 500, ctx.currentTime, 0.07, { type: 'sine', vol: 0.06 }); },
  levelup() {
    if (!ctx) return; const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.06, 0.2, { type: 'square', vol: 0.08 }));
    [523, 659, 784, 1047].forEach((f) => tone(f, t + 0.26, 0.6, { type: 'triangle', vol: 0.09 }));
    noise(t, 0.5, { vol: 0.12, freq: 600, to: 6000, q: 0.8 });
  },
  card() { if (!ctx) return; const t = ctx.currentTime; tone(660, t, 0.08, { type: 'triangle', vol: 0.15 }); tone(990, t + 0.06, 0.16, { type: 'triangle', vol: 0.15 }); },
  pick() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.3, { vol: 0.15, freq: 500, to: 5000 }); tone(784, t, 0.3, { type: 'sine', vol: 0.2 }); tone(1175, t + 0.08, 0.4, { type: 'sine', vol: 0.15 }); },
  click() { if (!ctx) return; tone(900, ctx.currentTime, 0.05, { type: 'triangle', vol: 0.16, slide: 0.7 }); },
  horn() { if (!ctx) return; const t = ctx.currentTime; tone(233, t, 0.9, { type: 'sawtooth', vol: 0.09, attack: 0.04 }); tone(294, t, 0.9, { type: 'sawtooth', vol: 0.08, attack: 0.04 }); tone(349, t, 0.9, { type: 'square', vol: 0.04, attack: 0.04 }); },
  overdrive() { if (!ctx) return; const t = ctx.currentTime; tone(200, t, 0.6, { type: 'sawtooth', vol: 0.1, slide: 4 }); noise(t, 0.6, { vol: 0.15, freq: 400, to: 5000 }); },
  switch() { if (!ctx) return; const t = ctx.currentTime; tone(300, t, 0.05, { type: 'square', vol: 0.12 }); noise(t + 0.04, 0.08, { vol: 0.2, freq: 2000, q: 3 }); tone(500, t + 0.08, 0.08, { type: 'square', vol: 0.1 }); },
  warn() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) { tone(440, t + i * 0.36, 0.16, { type: 'square', vol: 0.09 }); tone(330, t + i * 0.36 + 0.17, 0.16, { type: 'square', vol: 0.09 }); } },
  chest() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.6, { vol: 0.2, freq: 300, to: 6000, q: 0.6 }); [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + 0.3 + i * 0.06, 0.4, { type: 'sine', vol: 0.15 })); },
  win() { if (!ctx) return; const t = ctx.currentTime; [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, i === 5 ? 0.6 : 0.16, { type: 'square', vol: 0.1 })); },
  fail() { if (!ctx) return; const t = ctx.currentTime; [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.16, 0.3, { type: 'triangle', vol: 0.2 })); },
  star(i = 0) { if (!ctx) return; const t = ctx.currentTime; const f = [784, 988, 1175][i] || 1175; tone(f, t, 0.5, { type: 'sine', vol: 0.25 }); tone(f * 2, t, 0.3, { type: 'sine', vol: 0.08 }); },
  upgrade() { if (!ctx) return; const t = ctx.currentTime; [659, 880, 1319].forEach((f, i) => tone(f, t + i * 0.05, 0.25, { type: 'triangle', vol: 0.14 })); noise(t, 0.25, { vol: 0.08, freq: 3000, q: 1 }); },
  whoosh() { if (!ctx) return; noise(ctx.currentTime, 0.35, { vol: 0.15, freq: 400, to: 3000, q: 0.7 }); },
};

export function buzz(ms = 12) {
  if (!save.settings.vibe || !navigator.vibrate) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
}

// --- music: a short bouncy march scheduled ahead of time ---
const BPM = 124;
const MEL = [69, 0, 72, 76, 0, 74, 72, 0, 69, 0, 71, 72, 0, 74, 76, 0, 77, 0, 76, 74, 0, 72, 71, 0, 69, 0, 71, 72, 0, 64, 69, 0];
const BASS = [45, 45, 52, 52, 41, 41, 48, 48, 43, 43, 50, 50, 40, 40, 47, 47];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function startMusic() { musicOn = true; nextNote = ctx.currentTime + 0.1; step = 0; clearInterval(timer); timer = setInterval(schedule, 60); }
function stopMusic() { musicOn = false; clearInterval(timer); }
function schedule() {
  if (!ctx || !musicOn) return;
  const s16 = 60 / BPM / 2;
  while (nextNote < ctx.currentTime + 0.25) {
    const m = MEL[step % MEL.length];
    if (m) tone(midi(m), nextNote, s16 * 0.85, { type: 'triangle', vol: 0.45, bus: musicBus });
    if (step % 2 === 0) tone(midi(BASS[(step / 2) % BASS.length]), nextNote, s16 * 1.5, { type: 'sine', vol: 0.7, bus: musicBus });
    if (step % 2 === 1) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(0.18, nextNote); g.gain.exponentialRampToValueAtTime(0.0001, nextNote + 0.04); s.connect(f); f.connect(g); g.connect(musicBus); s.start(nextNote); s.stop(nextNote + 0.05); }
    nextNote += s16; step++;
  }
}
export function duckMusic(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.04 : 0.13, ctx.currentTime, 0.2); }
