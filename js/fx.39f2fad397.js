// One-shot effects in world space: particles, cartoon explosions, damage numbers,
// ground decals, beams and lightning, plus screen shake.
import { sprite, text } from './art.edf81c8392.js';

const MAXP = 900, MAXN = 70, MAXD = 90;
const rand = (a, b) => a + Math.random() * (b - a);

export class Fx {
  constructor() { this.p = []; this.n = []; this.d = []; this.lines = []; this.trauma = 0; this.sx = 0; this.sy = 0; this.time = 0; }
  clear() { this.p.length = 0; this.n.length = 0; this.d.length = 0; this.lines.length = 0; this.trauma = 0; }

  add(o) { if (this.p.length >= MAXP) this.p.splice(0, 40); o.t = 0; this.p.push(o); return o; }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }

  // --- building blocks ---
  puff(x, y, r, color = '#ffffff', life = 0.6, o = {}) { return this.add({ k: 'puff', x, y, vx: o.vx || 0, vy: o.vy || 0, r, color, life, grow: o.grow ?? 1.6, drag: o.drag ?? 2, ink: o.ink ?? 'rgba(29,36,64,.35)', alpha: o.alpha ?? 1 }); }
  dot(x, y, vx, vy, r, color, life, o = {}) { return this.add({ k: 'dot', x, y, vx, vy, r, color, life, z: o.z || 0, vz: o.vz || 0, g: o.g ?? 0, drag: o.drag ?? 1.5, ink: o.ink }); }
  spark(x, y, a, sp, len, color = '#ffe066', life = 0.22, w = 2.5) { return this.add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, len, color, life, w, drag: 4 }); }
  ring(x, y, r0, r1, color = '#ffffff', life = 0.4, w = 5) { return this.add({ k: 'ring', x, y, r0, r1, color, life, w }); }
  flash(x, y, r, color = '#fff7c2', life = 0.09) { return this.add({ k: 'flash', x, y, r, color, life }); }
  icon(x, y, name, size, o = {}) { return this.add({ k: 'icon', x, y, name, size, vx: o.vx || 0, vy: o.vy ?? -40, life: o.life || 0.9, rot: o.rot || 0, vr: o.vr || 0, wob: o.wob ?? 1, z: o.z || 0, vz: o.vz || 0, g: o.g || 0 }); }
  label(x, y, s, size, color, life = 1.1, o = {}) { return this.add({ k: 'label', x, y, s, size, color, life, vy: o.vy ?? -30, ink: o.ink }); }
  beam(x0, y0, x1, y1, color, w, life = 0.14) { this.lines.push({ k: 'beam', x0, y0, x1, y1, color, w, life, t: 0 }); }
  bolt(pts, color = '#bff8ff', life = 0.14) { this.lines.push({ k: 'bolt', pts, color, life, t: 0 }); }

  // flat cartoon explosion: white core, orange/yellow fire blobs, spikes, smoke, shock ring
  boom(x, y, r, o = {}) {
    this.flash(x, y, r * 1.5, '#fff6c8', 0.08);
    this.ring(x, y, r * 0.3, r * 1.45, 'rgba(255,255,255,.95)', 0.32, r * 0.12);
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

  decal(x, y, r, kind) {
    if (this.d.length >= MAXD) this.d.shift();
    const blobs = [];
    const n = kind === 'goo' ? 5 : 3;
    for (let i = 0; i < n; i++) blobs.push([rand(-0.6, 0.6) * r, rand(-0.4, 0.4) * r, r * rand(0.35, 0.7)]);
    this.d.push({ x, y, r, kind, blobs, t: 0, life: kind === 'goo' ? 7 : 9 });
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
      const a = Math.min(1, (o.life - o.t) / 1.5) * (o.kind === 'goo' ? 0.85 : 0.5);
      g.globalAlpha = a;
      g.fillStyle = o.kind === 'goo' ? '#8fd85c' : '#4a4f5c';
      for (const [bx, by, br] of o.blobs) { g.beginPath(); g.ellipse(o.x + bx, o.y + by, br, br * 0.7, 0, 0, Math.PI * 2); g.fill(); }
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
      if (o.k === 'beam') {
        g.strokeStyle = o.color; g.lineWidth = o.w * (0.5 + k);
        g.beginPath(); g.moveTo(o.x0, o.y0); g.lineTo(o.x1, o.y1); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = o.w * 0.35 * (0.5 + k);
        g.beginPath(); g.moveTo(o.x0, o.y0); g.lineTo(o.x1, o.y1); g.stroke();
      } else {
        for (const [col, w] of [[o.color, 7], ['#ffffff', 2.5]]) {
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
        case 'dot': {
          const r = o.r * (1 - k * k);
          if (o.ink) { g.fillStyle = o.ink; g.beginPath(); g.arc(o.x, o.y - o.z, r + 1.2, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = o.color; g.beginPath(); g.arc(o.x, o.y - o.z, r, 0, Math.PI * 2); g.fill();
          break;
        }
        case 'puff': {
          const r = o.r * (1 + (o.grow - 1) * Math.sqrt(k));
          g.globalAlpha = o.alpha * (1 - k) ** 1.5;
          g.fillStyle = o.ink; g.beginPath(); g.arc(o.x, o.y + r * 0.08, r * 1.04, 0, Math.PI * 2); g.fill();
          g.fillStyle = o.color; g.beginPath(); g.arc(o.x, o.y, r, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          break;
        }
        case 'fire': {
          const r = o.r * (0.6 + 0.8 * Math.sqrt(k)) * (1 - k * 0.5);
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
          g.strokeStyle = o.color; g.lineWidth = o.w; g.lineCap = 'round'; g.globalAlpha = 1 - k;
          g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x - o.vx / sp * l, o.y - o.vy / sp * l); g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'ring': {
          const e = 1 - (1 - k) ** 3;
          g.strokeStyle = o.color; g.globalAlpha = 1 - k; g.lineWidth = o.w * (1 - k * 0.7);
          g.beginPath(); g.ellipse(o.x, o.y, o.r0 + (o.r1 - o.r0) * e, (o.r0 + (o.r1 - o.r0) * e) * 0.8, 0, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'flash': {
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
