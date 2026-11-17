// Sprites cut from the generated sheets, with simple drawn stand-ins while an
// image is missing, plus the snow ground tile and canvas text helpers.

export const art = {};          // name -> { img, w, h, white, ice }
let manifest = {};

export async function loadArt(onProgress) {
  try { manifest = await (await fetch('img/sprites/manifest.json', { cache: 'no-cache' })).json(); } catch (e) { manifest = {}; }
  const names = Object.keys(manifest);
  let done = 0;
  await Promise.all(names.map((n) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { art[n] = { img, w: img.naturalWidth, h: img.naturalHeight, ...manifest[n] }; done++; onProgress && onProgress(done / names.length); res(); };
    img.onerror = () => { done++; res(); };
    img.src = 'img/sprites/' + manifest[n].file;
  })));
  // yeti shoulder caps: the fur top of each arm picture, faded out at the bottom, drawn over the turning arm
  // so the shoulder joint never shows a gap
  for (const sd of ['l', 'r']) { const a = art['z-yeti-arm-' + sd]; if (a) art['z-yeti-cap-' + sd] = capOf(a, CAP); }
  for (const n of Object.keys(art)) if (n !== 'ground') { art[n].white = tint(art[n], '#ffffff'); }
  for (const n of Object.keys(art)) if (n.startsWith('z-')) art[n].ice = tint(art[n], 'rgba(120,210,255,.55)', true);
}

export const CAP = 0.32; // share of the arm picture's height kept for the shoulder cap
function capOf(a, k) {
  const c = document.createElement('canvas'), h = Math.round(a.h * k);
  c.width = a.w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(a.img, 0, 0, a.w, h, 0, 0, a.w, h);
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000'); gr.addColorStop(0.68, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, a.w, h);
  return { img: c, w: a.w, h, srcW: a.srcW, srcH: (a.srcH || a.h) * k };
}

// silhouette copy for hit flashes (full) or a colour wash over the sprite (keep = true)
function tint(a, color, keep = false) {
  const c = document.createElement('canvas');
  c.width = a.w; c.height = a.h;
  const g = c.getContext('2d');
  g.drawImage(a.img, 0, 0);
  g.globalCompositeOperation = keep ? 'source-atop' : 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, a.w, a.h);
  return c;
}

export const has = (n) => !!art[n];

// generated UI bar pieces (dark track pill and coloured fills) for the health bars drawn in the world
const uiImgs = {};
function uiImg(n) {
  let im = uiImgs[n];
  if (!im) { im = uiImgs[n] = new Image(); im.src = 'img/ui/' + n + '.webp'; }
  return im.complete && im.naturalWidth ? im : null;
}
['ui-pill', 'ui-fill-green', 'ui-fill-yellow', 'ui-fill-red'].forEach(uiImg);
// three-slice a pill image: the round caps keep their shape, the middle stretches
function pill3(g, im, x, y, w, h) {
  const W = im.naturalWidth, H = im.naturalHeight, c = H / 2, dc = Math.min(h / 2, w / 2);
  g.drawImage(im, 0, 0, c, H, x, y, dc, h);
  if (w > 2 * dc) g.drawImage(im, c, 0, W - 2 * c, H, x + dc, y, w - 2 * dc, h);
  g.drawImage(im, W - c, 0, c, H, x + w - dc, y, dc, h);
}
// health bar centred on x,y; a vertical bar fills from the bottom
export function hpBar(g, x, y, len, thick, k, fill, vertical = false) {
  const track = uiImg('ui-pill'), f = uiImg(fill);
  if (!track || !f) return false;
  g.save(); g.translate(x, y); if (vertical) g.rotate(-Math.PI / 2);
  pill3(g, track, -len / 2, -thick / 2, len, thick);
  const pad = thick * 0.16, fh = thick - pad * 2, inner = len - pad * 2;
  if (k > 0) pill3(g, f, -len / 2 + pad, -fh / 2, Math.max(fh, inner * Math.min(1, k)), fh);
  g.restore();
  return true;
}

// Draw sprite n so it is `size` world units wide (or tall with o.byH), anchored
// at its bottom centre (o.anchor = 'bottom', default) or its centre.
export function sprite(g, n, x, y, size, o = {}) {
  const a = art[n];
  if (!a) return false;
  const w = o.byH ? size * a.w / a.h : size;
  const h = w * a.h / a.w;
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  const sx = (o.flip ? -1 : 1) * (o.sx || 1), sy = o.sy || 1;
  if (sx !== 1 || sy !== 1) g.scale(sx, sy);
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  // o.px / o.py: pivot as a fraction of the sprite (paper-doll joints); default bottom centre
  const ox = -w * (o.px ?? 0.5), oy = o.py !== undefined ? -h * o.py : o.anchor === 'center' ? -h / 2 : -h;
  g.drawImage(a.img, ox, oy, w, h);
  if (o.ice) g.drawImage(a.ice, ox, oy, w, h);
  if (o.flash) { g.globalAlpha *= Math.min(1, o.flash); g.drawImage(a.white, ox, oy, w, h); }
  g.restore();
  return true;
}

// ---------- the snow ground: one 400 x 400 world-unit tile, drawn at 2 px per unit ----------
export function makeGroundTile() {
  const S = 2, W = 400, c = document.createElement('canvas');
  c.width = W * S; c.height = W * S;
  const g = c.getContext('2d');
  g.scale(S, S);
  g.fillStyle = '#eaf1f8'; g.fillRect(0, 0, W, W);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const wrap = (fn) => { for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } };
  // soft blue-grey drifts
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * W, rx = 30 + rnd() * 70, ry = rx * (0.35 + rnd() * 0.3), a = rnd() * Math.PI;
    const col = rnd() < 0.5 ? 'rgba(196,212,230,0.55)' : 'rgba(255,255,255,0.8)';
    wrap(() => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill(); });
  }
  // small dents and sparkles
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W, y = rnd() * W, r = 1 + rnd() * 3;
    const col = rnd() < 0.6 ? 'rgba(170,190,215,0.5)' : 'rgba(255,255,255,0.95)';
    wrap(() => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2); g.fill(); });
  }
  return c;
}

// ---------- drawn stand-ins (used only until the sprite sheets are cut) ----------
const OUT = '#1d2440';
function blob(g, x, y, r, fill) { g.fillStyle = fill; g.strokeStyle = OUT; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
const HAT = { 'z-walker': '#3d6fd6', 'z-hardhat': '#ffcf2e', 'z-pot': '#9aa7b8', 'z-runner': '#9b5cf6', 'z-bloater': '#ff8a1f', 'z-brute': '#333a4a', 'z-shield': '#8a5a3a', 'z-yeti': '#ffffff' };
export function zombieStandIn(g, n, x, y, h, o = {}) {
  const r = h * 0.32;
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  blob(g, 0, -r, r, o.flash ? '#fff' : (n === 'z-yeti' ? '#e8fff4' : '#8fe36a'));
  blob(g, 0, -r * 2.1, r * 0.75, o.flash ? '#fff' : '#a6ef7f');
  g.fillStyle = HAT[n] || '#ccc'; g.fillRect(-r * 0.6, -r * 2.9, r * 1.2, r * 0.45);
  g.restore();
}
export function crewStandIn(g, color, x, y, s) { blob(g, x, y, s * 0.36, color); blob(g, x, y - s * 0.1, s * 0.22, '#ffd9b0'); }
export function carStandIn(g, type, w, l) {
  g.fillStyle = type === 'loco' ? '#e23b3b' : '#c93434'; g.strokeStyle = OUT; g.lineWidth = 3;
  roundRect(g, -w / 2, -l / 2, w, l, 12); g.fill(); g.stroke();
  g.fillStyle = '#7b8794'; roundRect(g, -w / 2 + 8, -l / 2 + 8, w - 16, l - 16, 8); g.fill();
  if (type === 'loco') { g.fillStyle = '#ffe066'; g.beginPath(); g.arc(0, -l / 2 + 6, 8, 0, Math.PI * 2); g.fill(); g.stroke(); }
}
export function propStandIn(g, n, x, y, s) {
  if (n.startsWith('tree')) {
    g.fillStyle = '#2f6e4a'; g.strokeStyle = OUT; g.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { const w = s * (0.5 - i * 0.12), yy = y - s * (0.25 + i * 0.25); g.beginPath(); g.moveTo(x - w, yy + s * 0.15); g.lineTo(x, yy - s * 0.3); g.lineTo(x + w, yy + s * 0.15); g.closePath(); g.fill(); g.stroke(); }
  } else { g.fillStyle = '#6f7f99'; g.strokeStyle = OUT; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y - s * 0.25, s * 0.5, s * 0.32, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// chunky outlined game text
export function text(g, s, x, y, size, fill = '#fff', o = {}) {
  g.save();
  g.font = `italic 800 ${size}px Heavy, Lilita, sans-serif`;
  g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * (o.stroke || 0.22);
  g.strokeStyle = o.ink || OUT;
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  g.strokeText(s, x, y + size * 0.07);
  g.strokeText(s, x, y);
  g.fillStyle = fill; g.fillText(s, x, y);
  g.restore();
}
