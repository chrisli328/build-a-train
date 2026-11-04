// One-shot effects in world space: particles, cartoon explosions, damage numbers,
// ground decals, beams and lightning, plus screen shake.
import { sprite, text, art } from './art.27597f9460.js';

// ---------- generated effect sprites (light keyed off black, plus solid props) ----------
// colour -> [hue 0-360, saturation 0-1, lightness 0-1]
function hsl(c) {
  let r, gg, b;
  if (c[0] === '#') { r = parseInt(c.slice(1, 3), 16); gg = parseInt(c.slice(3, 5), 16); b = parseInt(c.slice(5, 7), 16); }
  else { const m = c.match(/[\d.]+/g) || [255, 255, 255]; [r, gg, b] = m.map(Number); }
  r /= 255; gg /= 255; b /= 255;
  const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
const hueCache = new Map();
const hue = (c) => { if (!hueCache.has(c)) hueCache.set(c, hsl(c)); return hueCache.get(c); };
// recoloured copy of a sprite, cached per colour
const tints = new Map();
export function tinted(name, color, k = 0.7) {
  const key = name + color + k;
  if (tints.has(key)) return tints.get(key);
  const a = art[name];
  if (!a) return null;
  const c = document.createElement('canvas'); c.width = a.w; c.height = a.h;
  const q = c.getContext('2d');
  q.drawImage(a.img, 0, 0);
  q.globalCompositeOperation = 'source-atop'; q.globalAlpha = k; q.fillStyle = color; q.fillRect(0, 0, a.w, a.h);
  const o = { img: c, w: a.w, h: a.h };
  tints.set(key, o);
  return o;
}
// draw sprite (or tinted copy) centred at x, y, w wide and h tall (h defaults to keeping its shape)
export function fxs(g, name, x, y, w, o = {}) {
  const a = o.img || art[name];
  if (!a) return false;
  const h = o.h || w * a.h / a.w;
  g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot);
  if (o.alpha !== undefined) g.globalAlpha *= Math.max(0, o.alpha);
  g.drawImage(a.img, -w * (o.ax ?? 0.5), -h / 2, w, h);
  g.restore();
  return true;
}
const starFor = (c) => { const [h, s, l] = hue(c); if (s < 0.25 || l > 0.9) return l > 0.86 && h > 170 && h < 230 ? 'fx-flake' : 'fx-hit'; if (h >= 245 && h < 320) return 'fx-star-purple'; if (h >= 150 && h < 195) return 'fx-star-teal'; if (h >= 195 && h < 245) return 'fx-flake'; return 'fx-star-gold'; };
const ringFor = (c) => { const [h, s, l] = hue(c); if (s > 0.5 && h >= 35 && h < 65) return ['fx-ring-gold']; if (s > 0.5 && h >= 200 && h < 235 && l < 0.8) return ['fx-ring-shock']; if (s < 0.3 || (h >= 185 && h < 235)) return ['fx-ring-ice']; return ['fx-ring-ice', c]; };
const smokeFor = (c) => { const [h, s, l] = hue(c); if (l > 0.72) return 'fx-smoke-white'; if (s > 0.5 && h < 60) return 'fx-flame-orange'; return 'fx-smoke-dark'; };

const DOT_ART = {
  '#7ddc4a': ['fx-goo-drop', 'fx-goo-drop-2'], '#c6ff8f': ['fx-goo-drop-2', 'fx-goo-drop'],
  '#ffffff': ['fx-snow-clump', 'fx-snow-bit'],
  '#b07a45': ['fx-wood-chip', 'fx-wood-chip'], '#7c5230': ['fx-wood-chunk', 'fx-wood-chunk'],
  '#ff4058': ['cf-red', 'cf-pink', 3.6], '#ffd23f': ['cf-yellow', 'cf-star', 3.6], '#3d8bff': ['cf-blue', 'cf-purple', 3.6], '#5cd636': ['cf-green', 'cf-orange', 3.6],
};
const MAXP = 900, MAXN = 70, MAXD = 90;
const rand = (a, b) => a + Math.random() * (b - a);

export class Fx {
  constructor() { this.p = []; this.n = []; this.d = []; this.lines = []; this.trauma = 0; this.sx = 0; this.sy = 0; this.time = 0; }
  clear() { this.p.length = 0; this.n.length = 0; this.d.length = 0; this.lines.length = 0; this.trauma = 0; }

  add(o) { if (this.p.length >= MAXP) this.p.splice(0, 40); o.t = 0; this.p.push(o); return o; }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  // the camera turned with the line by da, so the ground (and everything left on it) turns the other way round the view
  turn(c, s, da) {
    const R = (o, X, Y) => { const x = o[X], y = o[Y]; if (typeof x !== 'number' || typeof y !== 'number') return; o[X] = x * c + y * s; o[Y] = -x * s + y * c; };
    for (const o of this.p) { R(o, 'x', 'y'); if (o.k === 'puff' || o.k === 'dot' || o.k === 'spark' || o.k === 'spr' || o.k === 'fire') R(o, 'vx', 'vy'); if (o.k === 'spr') o.rot -= da; }
    for (const o of this.n) R(o, 'x', 'y');
    for (const o of this.d) { R(o, 'x', 'y'); if (typeof o.rot === 'number') o.rot -= da; }
    for (const o of this.lines) { R(o, 'x0', 'y0'); R(o, 'x1', 'y1'); if (o.pts) for (const q of o.pts) { const x = q[0], y = q[1]; q[0] = x * c + y * s; q[1] = -x * s + y * c; } }
  }

  // --- building blocks ---
  puff(x, y, r, color = '#ffffff', life = 0.6, o = {}) { return this.add({ k: 'puff', x, y, vx: o.vx || 0, vy: o.vy || 0, r, color, life, grow: o.grow ?? 1.6, drag: o.drag ?? 2, ink: o.ink ?? 'rgba(29,36,64,.35)', alpha: o.alpha ?? 1 }); }
  dot(x, y, vx, vy, r, color, life, o = {}) { return this.add({ k: 'dot', x, y, vx, vy, r, color, life, z: o.z || 0, vz: o.vz || 0, g: o.g ?? 0, drag: o.drag ?? 1.5, ink: o.ink }); }
  spark(x, y, a, sp, len, color = '#ffe066', life = 0.22, w = 2.5) { return this.add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, len, color, life, w, drag: 4 }); }
  ring(x, y, r0, r1, color = '#ffffff', life = 0.4, w = 5) { return this.add({ k: 'ring', x, y, r0, r1, color, life, w }); }
  flash(x, y, r, color = '#fff7c2', life = 0.09) { return this.add({ k: 'flash', x, y, r, color, life }); }
  icon(x, y, name, size, o = {}) { return this.add({ k: 'icon', x, y, name, size, vx: o.vx || 0, vy: o.vy ?? -40, life: o.life || 0.9, rot: o.rot || 0, vr: o.vr || 0, wob: o.wob ?? 1, z: o.z || 0, vz: o.vz || 0, g: o.g || 0 }); }
  label(x, y, s, size, color, life = 1.1, o = {}) { return this.add({ k: 'label', x, y, s, size, color, life, vy: o.vy ?? -30, ink: o.ink }); }
  beam(x0, y0, x1, y1, color, w, life = 0.14, glow) { this.lines.push({ k: 'beam', x0, y0, x1, y1, color, w, life, t: 0, glow }); }
  bolt(pts, color = '#bff8ff', life = 0.14, glow) { this.lines.push({ k: 'bolt', pts, color, life, t: 0, glow }); }
  // four-point sparkle for hits (sniper, engineer, gunner)
  star(x, y, r, color = '#ffffff', life = 0.22) { return this.add({ k: 'star', x, y, r, color, life, rot: rand(0, 0.8) }); }
  // one generated effect sprite: muzzle flashes, hit bursts, splashes
  spr(x, y, name, size, o = {}) { return this.add({ k: 'spr', x, y, name, size, rot: o.rot || 0, vr: o.vr || 0, vx: o.vx || 0, vy: o.vy || 0, drag: o.drag ?? 0, life: o.life || 0.12, grow: o.grow ?? 1.15, ax: o.ax ?? 0.5, sy: o.sy || 1, img: o.img }); }
  // gold chevron that floats up over a crew member the captain is boosting
  chev(x, y, color = '#ffd23f') { return this.add({ k: 'chev', x, y, vx: 0, vy: -26, color, life: 0.7 }); }

  // flat cartoon explosion: white core, orange/yellow fire blobs, spikes, smoke, shock ring
  boom(x, y, r, o = {}) {
    this.flash(x, y, r * 1.5, '#fff6c8', 0.08);
    this.ring(x, y, r * 0.3, r * 1.45, 'rgba(255,255,255,.95)', 0.32, r * 0.12);
    if (o.shock) { this.ring(x, y + r * 0.2, r * 0.4, r * 1.9, o.shock, 0.45, r * 0.1); this.ring(x, y + r * 0.2, r * 0.2, r * 1.3, '#ffffff', 0.3, r * 0.05); }
    const n = 6 + Math.round(r / 12);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), d = rand(0.1, 0.55) * r;
      this.add({ k: 'fire', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, vx: Math.cos(a) * r * 1.4, vy: Math.sin(a) * r * 1.1 - r * 0.3, r: r * rand(0.35, 0.6), life: rand(0.32, 0.5), drag: 6 });
    }
    for (let i = 0; i < 8; i++) { const a = rand(0, Math.PI * 2); this.spark(x, y, a, rand(r * 5, r * 9), r * 0.5, i % 2 ? '#ffd23f' : '#ffffff', 0.25, Math.max(2, r * 0.06)); }
    for (let i = 0; i < 5; i++) { const a = rand(0, Math.PI * 2); this.puff(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.3, r * rand(0.25, 0.4), '#d8dde6', rand(0.7, 1.0), { vx: Math.cos(a) * r * 0.8, vy: -r * 0.9, grow: 1.8 }); }
    if (!o.noDecal) this.decal(x, y, r * 0.75, 'scorch');
  }

  // green goo splash + pink skull spirit for a zombie pop
  pop(x, y, size, o = {}) {
    const n = o.big ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 170) * (o.big ? 1.5 : 1);
      this.dot(x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.7, rand(2.5, 5) * (o.big ? 1.4 : 1), i % 3 ? '#7ddc4a' : '#c6ff8f', rand(0.35, 0.6), { vz: rand(80, 200), g: 520, ink: '#1d2440' });
    }
    this.puff(x, y - size * 0.3, size * 0.45, '#ffffff', 0.35, { grow: 1.9 });
    this.ring(x, y - size * 0.2, size * 0.2, size * 0.8, 'rgba(255,255,255,.9)', 0.25, 3);
    this.icon(x, y - size * 0.6, 'skull', o.big ? 30 : 18, { vy: -55, life: 0.8, wob: 1 });
    this.decal(x, y, size * 0.45, 'goo');
  }

  decal(x, y, r, kind, rot) {
    if (this.d.length >= MAXD) this.d.shift();
    const blobs = [];
    const n = kind === 'goo' ? 5 : kind === 'burn' ? 4 : 3;
    for (let i = 0; i < n; i++) blobs.push([rand(-0.6, 0.6) * r, rand(-0.4, 0.4) * r, r * rand(0.35, 0.7)]);
    this.d.push({ x, y, r, kind, blobs, rot, t: 0, life: kind === 'goo' ? 7 : kind === 'burn' ? 3.5 : kind === 'laser' ? 2.4 : kind === 'glow' ? 0.28 : 9, seed: Math.random() * 10 });
  }

  num(x, y, v, o = {}) {
    if (this.n.length >= MAXN) this.n.shift();
    this.n.push({ x: x + rand(-6, 6), y, s: String(v), t: 0, life: o.crit ? 0.85 : 0.6, crit: !!o.crit, color: o.color || (o.crit ? '#ffd23f' : '#ffffff'), size: o.size || (o.crit ? 22 : 15), vx: rand(-20, 20) });
  }

  update(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 14;
    this.sx = s * (Math.random() * 2 - 1); this.sy = s * (Math.random() * 2 - 1);
    for (let i = this.p.length - 1; i >= 0; i--) {
      const o = this.p[i];
      o.t += dt;
      if (o.t >= o.life) { this.p.splice(i, 1); continue; }
      if (o.drag) { const k = Math.max(0, 1 - o.drag * dt); o.vx *= k; o.vy *= k; }
      o.x += (o.vx || 0) * dt; o.y += (o.vy || 0) * dt;
      if (o.g) { o.vz -= o.g * dt; o.z += o.vz * dt; if (o.z < 0) { o.z = 0; o.vz = Math.abs(o.vz) * 0.3; o.vx *= 0.6; o.vy *= 0.6; } }
      if (o.vr) o.rot += o.vr * dt;
    }
    for (let i = this.n.length - 1; i >= 0; i--) { const o = this.n[i]; o.t += dt; o.x += o.vx * dt; if (o.t >= o.life) this.n.splice(i, 1); }
    for (let i = this.lines.length - 1; i >= 0; i--) { const o = this.lines[i]; o.t += dt; if (o.t >= o.life) this.lines.splice(i, 1); }
    for (let i = this.d.length - 1; i >= 0; i--) { const o = this.d[i]; o.t += dt; if (o.t >= o.life) this.d.splice(i, 1); }
  }

  drawDecals(g) {
    for (const o of this.d) {
      if (o.kind === 'glow') {
        if (art['fx-flash']) { g.globalAlpha = 1 - o.t / o.life; fxs(g, 'fx-flash', o.x, o.y, o.r * 2 * (1 + o.t * 1.2), { h: o.r * (1 + o.t * 1.2) }); }
        continue;
      }
      if (o.kind === 'crater' && art['fx-crater']) {
        g.globalAlpha = Math.min(1, (o.life - o.t) / 1.5);
        fxs(g, 'fx-crater', o.x, o.y, o.r * 2.6, { rot: (o.seed % 1) * 6.3, h: o.r * 2.0 });
        continue;
      }
      if (o.kind === 'laser' && art['fx-scorch-line']) {
        // glowing melt line that cools down
        const k = o.t / o.life;
        g.globalAlpha = Math.min(1, (o.life - o.t) / 0.8) * 0.9;
        fxs(g, 'fx-scorch-line', o.x, o.y, o.r * 3, { rot: o.rot || 0 });
        if (k < 0.35 && art['fx-ember']) { g.globalAlpha = (0.35 - k) * 2; fxs(g, 'fx-ember', o.x, o.y, o.r * 1.3); }
        continue;
      }
      if (o.kind !== 'goo' && art['fx-scorch']) {
        g.globalAlpha = Math.min(1, (o.life - o.t) / 1.2) * (o.kind === 'burn' ? 0.95 : 0.75);
        fxs(g, 'fx-scorch', o.x, o.y, o.r * 2.6, { rot: (o.seed % 1) * 0.6 - 0.3 });
        if (o.kind === 'burn' && art['fx-ember']) for (let i = 0; i < 2; i++) { const [bx, by] = o.blobs[i], fl = 0.5 + 0.5 * Math.sin(this.time * 9 + o.seed + i * 2); fxs(g, 'fx-ember', o.x + bx * 0.6, o.y + by * 0.6, o.r * (0.7 + fl * 0.5)); }
        continue;
      }
      if (o.kind === 'goo' && art['fx-goo-1']) {
        g.globalAlpha = Math.min(1, (o.life - o.t) / 1.5) * 0.9;
        fxs(g, o.seed > 5 ? 'fx-goo-2' : 'fx-goo-1', o.x, o.y, o.r * 2.4, { rot: (o.seed % 1) * 6.3 });
        continue;
      }
      const a = Math.min(1, (o.life - o.t) / 1.5) * (o.kind === 'goo' ? 0.85 : 0.5);
      g.globalAlpha = a;
      g.fillStyle = o.kind === 'goo' ? '#8fd85c' : o.kind === 'burn' ? '#2b2f3a' : '#4a4f5c';
      if (o.kind === 'burn') g.globalAlpha = Math.min(1, (o.life - o.t) / 1.2) * 0.8;
      for (const [bx, by, br] of o.blobs) { g.beginPath(); g.ellipse(o.x + bx, o.y + by, br, br * 0.7, 0, 0, Math.PI * 2); g.fill(); }
      if (o.kind === 'burn') {
        // little embers glowing in the burnt puddle
        for (let i = 0; i < o.blobs.length; i++) {
          const [bx, by, br] = o.blobs[i], fl = 0.5 + 0.5 * Math.sin(this.time * 9 + o.seed + i * 2);
          g.fillStyle = fl > 0.5 ? '#ffb21c' : '#ff6a2e'; g.beginPath(); g.arc(o.x + bx * 0.8, o.y + by * 0.8, br * 0.22 * (0.6 + fl * 0.5), 0, Math.PI * 2); g.fill();
        }
      }
      if (o.kind === 'goo') { g.fillStyle = '#b8f08a'; g.beginPath(); g.ellipse(o.x, o.y, o.r * 0.35, o.r * 0.22, 0, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
  }

  // under = ground-level bits (goo dots); the rest draws above everything
  draw(g) {
    for (const o of this.lines) {
      const k = 1 - o.t / o.life;
      g.globalAlpha = k;
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (o.k === 'beam' && art['fx-beam-purple']) {
        const L = Math.hypot(o.x1 - o.x0, o.y1 - o.y0), a = Math.atan2(o.y1 - o.y0, o.x1 - o.x0);
        fxs(g, 'fx-beam-purple', o.x0, o.y0, L, { rot: a, h: o.w * 4.2 * (0.55 + k * 0.6), ax: 0 });
      } else if (o.k === 'bolt' && art['fx-bolt-teal']) {
        for (let i = 1; i < o.pts.length; i++) {
          const [x0, y0] = o.pts[i - 1], [x1, y1] = o.pts[i], L = Math.hypot(x1 - x0, y1 - y0);
          fxs(g, 'fx-bolt-teal', x0, y0, L * 1.15, { rot: Math.atan2(y1 - y0, x1 - x0), h: 22 * (0.6 + k * 0.5), ax: 0.04 });
        }
      } else if (o.k === 'beam') {
        if (o.glow) { g.strokeStyle = o.glow; g.lineWidth = o.w * 2.4 * (0.5 + k); g.beginPath(); g.moveTo(o.x0, o.y0); g.lineTo(o.x1, o.y1); g.stroke(); }
        g.strokeStyle = o.color; g.lineWidth = o.w * (0.5 + k);
        g.beginPath(); g.moveTo(o.x0, o.y0); g.lineTo(o.x1, o.y1); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = o.w * 0.35 * (0.5 + k);
        g.beginPath(); g.moveTo(o.x0, o.y0); g.lineTo(o.x1, o.y1); g.stroke();
      } else {
        for (const [col, w] of [[o.glow || 'rgba(0,0,0,0)', 13], [o.color, 7], ['#ffffff', 2.5]]) {
          g.strokeStyle = col; g.lineWidth = w;
          g.beginPath(); g.moveTo(o.pts[0][0], o.pts[0][1]);
          for (let i = 1; i < o.pts.length; i++) g.lineTo(o.pts[i][0], o.pts[i][1]);
          g.stroke();
        }
      }
    }
    g.globalAlpha = 1;
    for (const o of this.p) {
      const k = o.t / o.life;
      switch (o.k) {
        case 'spr': {
          const e = 1 + (o.grow - 1) * k, w = o.size * e;
          fxs(g, o.name, o.x, o.y, w, { rot: o.rot, alpha: k < 0.6 ? 1 : (1 - k) / 0.4, ax: o.ax, img: o.img, h: o.sy !== 1 && (o.img || art[o.name]) ? w * (o.img || art[o.name]).h / (o.img || art[o.name]).w * o.sy : undefined });
          break;
        }
        case 'dot': {
          if (o.color === '#e0b13a' && art['fx-casing']) { fxs(g, 'fx-casing', o.x, o.y - o.z, 8, { rot: o.t * 18 }); break; }
          if (o.color === '#e6f8ff' && art['fx-flake']) { fxs(g, 'fx-flake', o.x, o.y - o.z, 12 * (1 - k * 0.6), { rot: o.t * 6, alpha: 1 - k }); break; }
          { // generated bits: goo drops, snow lumps, wood chips and paper confetti instead of drawn dots
            const bit = o.color === '#ffffff' && !o.ink ? ['cf-star', 'cf-yellow', 3.6] : DOT_ART[o.color], n = bit && bit[(o.seed ??= Math.random()) < 0.5 ? 0 : 1];
            if (n && art[n]) { fxs(g, n, o.x, o.y - o.z, o.r * (bit[2] || 2.8) * (o.ink ? 1 - k * 0.4 : 1), { rot: (o.seed * 6.3) + o.t * (o.ink ? 4 : 9), alpha: k > 0.7 ? (1 - k) / 0.3 : 1 }); break; }
          }
          const r = o.r * (1 - k * k);
          if (o.ink) { g.fillStyle = o.ink; g.beginPath(); g.arc(o.x, o.y - o.z, r + 1.2, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = o.color; g.beginPath(); g.arc(o.x, o.y - o.z, r, 0, Math.PI * 2); g.fill();
          break;
        }
        case 'puff': {
          const r = o.r * (1 + (o.grow - 1) * Math.sqrt(k));
          const sn = smokeFor(o.color);
          if (art[sn]) { if (o.rot === undefined) o.rot = Math.random() * 6.3; fxs(g, sn, o.x, o.y, r * 2.5, { rot: o.rot, alpha: o.alpha * (1 - k) ** 1.2 }); break; }
          g.globalAlpha = o.alpha * (1 - k) ** 1.5;
          g.fillStyle = o.ink; g.beginPath(); g.arc(o.x, o.y + r * 0.08, r * 1.04, 0, Math.PI * 2); g.fill();
          g.fillStyle = o.color; g.beginPath(); g.arc(o.x, o.y, r, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          break;
        }
        case 'fire': {
          const r = o.r * (0.6 + 0.8 * Math.sqrt(k)) * (1 - k * 0.5);
          if (art['fx-fireball']) { if (o.rot === undefined) o.rot = Math.random() * 6.3; fxs(g, k < 0.55 ? 'fx-fireball' : 'fx-flame-orange', o.x, o.y, r * 2.6, { rot: o.rot, alpha: k > 0.7 ? (1 - k) / 0.3 : 1 }); break; }
          const col = k < 0.25 ? '#fff3b0' : k < 0.5 ? '#ffd23f' : k < 0.75 ? '#ff8a1f' : '#e8532e';
          g.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
          g.fillStyle = '#1d2440'; g.beginPath(); g.arc(o.x, o.y, r + 2, 0, Math.PI * 2); g.fill();
          g.fillStyle = col; g.beginPath(); g.arc(o.x, o.y, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(o.x - r * 0.25, o.y - r * 0.3, r * 0.35, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          break;
        }
        case 'spark': {
          const sp = Math.hypot(o.vx, o.vy) || 1, l = o.len * (1 - k);
          if (art['fx-pellet-yellow']) { fxs(g, 'fx-pellet-yellow', o.x, o.y, l * 1.8 + 4, { rot: Math.atan2(o.vy, o.vx), h: Math.max(6, o.w * 3.2), ax: 0.85, alpha: 1 - k }); break; }
          g.strokeStyle = o.color; g.lineWidth = o.w; g.lineCap = 'round'; g.globalAlpha = 1 - k;
          g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x - o.vx / sp * l, o.y - o.vy / sp * l); g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'ring': {
          const e = 1 - (1 - k) ** 3;
          const [rn, rc] = ringFor(o.color);
          if (art[rn]) { const R = o.r0 + (o.r1 - o.r0) * e; fxs(g, rn, o.x, o.y, R * 2.3, { h: R * 2.3 * 0.8, alpha: 1 - k, img: rc ? tinted(rn, rc) : undefined }); break; }
          g.strokeStyle = o.color; g.globalAlpha = 1 - k; g.lineWidth = o.w * (1 - k * 0.7);
          g.beginPath(); g.ellipse(o.x, o.y, o.r0 + (o.r1 - o.r0) * e, (o.r0 + (o.r1 - o.r0) * e) * 0.8, 0, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'star': {
          const e = k < 0.3 ? k / 0.3 : 1, r = o.r * (0.5 + e * 0.7) * (1 - Math.max(0, k - 0.6) * 1.5);
          const sn = starFor(o.color);
          if (art[sn]) { fxs(g, sn, o.x, o.y, r * 3.4, { rot: o.rot }); break; }
          g.save(); g.translate(o.x, o.y); g.rotate(o.rot);
          for (const [col, f] of [[o.color, 1], ['#ffffff', 0.5]]) {
            g.fillStyle = col; g.beginPath();
            for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = (i % 2 ? 0.28 : 1) * r * f; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(rr, 0); }
            g.closePath(); g.fill();
          }
          g.restore();
          break;
        }
        case 'chev': {
          if (art['fx-chev-gold']) { fxs(g, 'fx-chev-gold', o.x, o.y, 20, { alpha: k < 0.2 ? k / 0.2 : (1 - k) / 0.8 }); break; }
          g.globalAlpha = k < 0.2 ? k / 0.2 : (1 - k) / 0.8;
          g.lineCap = 'round'; g.lineJoin = 'round';
          for (const [col, w] of [['#6b4a12', 5], [o.color, 2.8]]) {
            g.strokeStyle = col; g.lineWidth = w;
            for (const dy of [0, 6]) { g.beginPath(); g.moveTo(o.x - 6, o.y + dy + 4); g.lineTo(o.x, o.y + dy - 1); g.lineTo(o.x + 6, o.y + dy + 4); g.stroke(); }
          }
          g.globalAlpha = 1;
          break;
        }
        case 'flash': {
          if (art['fx-halo']) { const [h, s] = hue(o.color); fxs(g, 'fx-halo', o.x, o.y, o.r * 2.8 * (0.7 + k * 0.5), { alpha: 1 - k, img: s > 0.3 && h > 15 && h < 60 ? undefined : tinted('fx-halo', o.color, 0.8) }); break; }
          g.globalAlpha = 1 - k; g.fillStyle = o.color;
          g.beginPath(); g.arc(o.x, o.y, o.r * (0.7 + k * 0.5), 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
          break;
        }
        case 'icon': {
          const pop = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : 1.2 - Math.min(0.2, (k - 0.15));
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          sprite(g, o.name, o.x + Math.sin(o.t * 9) * 4 * o.wob, o.y - o.z, o.size * pop, { anchor: 'center', rot: o.rot });
          g.globalAlpha = 1;
          break;
        }
        case 'label': {
          const pop = k < 0.12 ? 0.5 + (k / 0.12) * 0.75 : 1.25 - Math.min(0.25, (k - 0.12) * 2);
          text(g, o.s, o.x, o.y, o.size * pop, o.color, { alpha: k > 0.7 ? (1 - k) / 0.3 : 1, ink: o.ink });
          break;
        }
      }
    }
    for (const o of this.n) {
      const k = o.t / o.life;
      const pop = k < 0.18 ? 0.6 + (k / 0.18) * (o.crit ? 0.9 : 0.6) : (o.crit ? 1.5 : 1.2) - Math.min(o.crit ? 0.5 : 0.2, (k - 0.18) * 1.5);
      text(g, o.crit ? o.s + '!' : o.s, o.x, o.y - k * 34 - (k < 0.18 ? 0 : 6), o.size * pop, o.color, { alpha: k > 0.65 ? (1 - k) / 0.35 : 1, stroke: 0.26 });
    }
  }
}
