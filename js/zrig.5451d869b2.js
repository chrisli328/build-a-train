// Jointed zombies (round 17, the owner picked option B on 2026-11-04): every walker-type zombie
// shares one set of arms and legs and swaps only its head and torso; the runner keeps its own limbs.
// The parts are generated pictures in img/zparts/ (cut by gen/r17/zombie/buildparts.py); this code
// only moves, turns, stretches and tints them. drawZRig() returns false while a type's parts are
// missing, so the caller keeps drawing the old single picture.

const BASE = globalThis.ZPARTS_BASE || 'img/zparts/';
const KG = 0.55, KH = 0.9;            // screen squash of ground depth and of height (high three-quarter camera)
const ICE = 'rgba(120,210,255,.55)';  // same wash as the single pictures when slowed
const P = {};                         // part name -> its spot on the parts sheet { x, y, w, h }
let ATLAS = null, ATLAS_W = null, ATLAS_I = null;   // the parts sheet, a white copy (hit flash) and an ice copy (slowed)
const ready = {};                     // type -> every part loaded
let D = null;                         // zparts.json
const GOO = 'fx-goo-1';
const RS = 0.9;                       // the front reaching arm is drawn this much shorter (it points at the camera)               // goo splat (an existing generated picture) over the stump of a lost limb

function tint(img, col, keep) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = keep ? 'source-atop' : 'source-in';
  g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return c;
}

async function load() {
  try { D = await (await fetch(BASE + 'zparts.json', { cache: 'no-cache' })).json(); } catch (e) { D = null; return; }
  const need = {};
  const names = new Set();
  for (const [t, T] of Object.entries(D.types)) {
    const L = D.limbs[T.limbs], list = [];
    for (const v of ['f', 's', 'b']) {
      list.push(T[v].head.img, T[v].torso.img);
      for (const p of ['arm', 'leg']) if (L && L[v]) list.push(L[v][p].u.img, L[v][p].l.img);
    }
    if (L && L.reach) list.push(L.reach.img);
    if (T.prop) list.push(T.prop.img);
    need[t] = list; list.forEach((n) => names.add(n));
  }
  const imgs = {};
  const src = (n) => (n === GOO ? BASE + '../sprites/' + n : BASE + n) + '.webp';
  await Promise.all([...names, GOO].map((n) => new Promise((res) => {
    const i = new Image();
    i.onload = () => { imgs[n] = i; res(); };
    i.onerror = res;
    i.src = src(n);
  })));
  // pack every part into one sheet (plus a white and an ice copy): one source picture for all the
  // zombies keeps the browser from switching pictures ~10 times per zombie
  const list = Object.keys(imgs).sort((a, b) => imgs[b].naturalHeight - imgs[a].naturalHeight);
  const AW = 1024, PAD = 3;
  let x = PAD, y = PAD, rowH = 0;
  for (const n of list) {
    const i = imgs[n], w = i.naturalWidth, h = i.naturalHeight;
    if (x + w + PAD > AW) { x = PAD; y += rowH + PAD; rowH = 0; }
    P[n] = { x, y, w, h }; x += w + PAD; rowH = Math.max(rowH, h);
  }
  const A = document.createElement('canvas');
  A.width = AW; A.height = y + rowH + PAD;
  const ag = A.getContext('2d');
  for (const n of list) ag.drawImage(imgs[n], P[n].x, P[n].y);
  ATLAS = A; ATLAS_W = tint(A, '#ffffff'); ATLAS_I = tint(A, ICE, true);
  for (const [t, list2] of Object.entries(need)) ready[t] = list2.every((n) => P[n]);
}
export const zready = load();

// how each body type moves (angles in radians, bob and sway as a share of the figure height)
//   legA leg swing, knee bend while the foot travels, limp drags one leg, lean forward tilt,
//   armR arms raised forward, armBob / pump arm swing (pump = opposite to the legs), elbow bend,
//   spread arms out to the sides, bob up-down, sway head, roll side-to-side waddle
const GAIT = {
  walker: { legA: 0.5, knee: 0.7, limp: 0.45, lean: 0.2, armR: 1.05, armBob: 0.16, pump: 0, elbow: 0.25, spread: 0.1, bob: 0.03, sway: 0.12, roll: 0 },
  runner: { legA: 0.8, knee: 1.15, limp: 0, lean: 0.42, armR: 0.3, armBob: 0, pump: 0.95, elbow: 1.35, spread: 0.06, bob: 0.05, sway: 0.04, roll: 0 },
  brute: { legA: 0.34, knee: 0.45, limp: 0, lean: 0.26, armR: 0.35, armBob: 0.12, pump: 0.4, elbow: 0.35, spread: 0.22, bob: 0.03, sway: 0.06, roll: 0.05 },
  bloater: { legA: 0.3, knee: 0.4, limp: 0, lean: -0.04, armR: 0.95, armBob: 0.16, pump: 0, elbow: 0.3, spread: 0.32, bob: 0.025, sway: 0.1, roll: 0.08 },
  shield: { legA: 0.36, knee: 0.5, limp: 0, lean: 0.1, armR: 0, armBob: 0, pump: 0, elbow: 0, spread: 0, bob: 0.025, sway: 0.05, roll: 0.03 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// facing: an angle that turns at a limited speed (0 = facing the camera, +pi/2 = facing right), and
// the picture set (front / side / back) switches with some slack so it never flickers.
// Round 18 (owner 2026-11-04): side pictures unless it is really moving up or down the screen
// (within about 24 degrees of straight up / down), and no paper flip when the set changes
const FB = 0.42, BB = Math.PI - 0.42, HY = 0.1;
function face(z, t) {
  const dt = clamp(t - (z.zt ?? t), 0, 0.1); z.zt = t;
  let dx = 0, dy = 0;
  if (z.att) { const c = z.att.car; dx = c.x + c.fx * z.att.f - z.x; dy = c.y + c.fy * z.att.f - z.y; }
  else if (z.leap || z.leapTo) {
    const L = z.leap || z.leapTo, c = L.car;
    dx = c.x + c.fx * L.f - c.fy * L.s - (z.leap ? L.x0 : z.x); dy = c.y + c.fy * L.f + c.fx * L.s - (z.leap ? L.y0 : z.y);
  } else if (!(z.held || z.air > 0 || z.dead || z.idle) && z.mvx !== undefined) { dx = z.mvx; dy = z.mvy; }
  if (z.yaw === undefined) { z.yaw = dx || dy ? Math.atan2(dx, dy) : 0; z.zv = null; }
  if (dx || dy) { const mx = 9 * dt; z.yaw = wrap(z.yaw + clamp(wrap(Math.atan2(dx, dy) - z.yaw), -mx, mx)); }
  const a = Math.abs(z.yaw);
  let v = z.zv || (a < FB ? 'f' : a > BB ? 'b' : 's');
  if (v === 'f' && a > FB + HY) v = 's'; else if (v === 's' && a < FB - HY) v = 'f';
  else if (v === 's' && a > BB + HY) v = 'b'; else if (v === 'b' && a < BB - HY) v = 's';
  if (v === 'f' && a > BB) v = 'b'; if (v === 'b' && a < FB) v = 'f';
  z.zv = v; z.zm = z.yaw < 0;
}

// pose for the current state: leg swing la / knee lb, arm raise aa / elbow ab / spread as, plus body lean,
// bob, roll, head tilt and a whole-body tilt rot
const PS = { la: [0, 0], lb: [0, 0], aa: [0, 0], ab: [0, 0], as: [0, 0], fs: 0, lean: 0, bob: 0, roll: 0, head: 0, rot: 0 };
function pose(z, t, G) {
  const ph = z.ph || 0;
  for (let i = 0; i < 2; i++) {
    const p = ph + i * Math.PI, sp = Math.sin(p);
    PS.la[i] = G.legA * sp * (G.limp && i === 0 && sp > 0 ? 1 - G.limp * 0.6 : 1);
    PS.lb[i] = G.knee * Math.max(0, Math.cos(p));
    PS.aa[i] = G.armR + G.armBob * sp - G.pump * sp;
    PS.ab[i] = G.elbow; PS.as[i] = G.spread;
  }
  PS.lean = G.lean + Math.sin(ph * 2) * 0.03; PS.bob = Math.abs(Math.cos(ph)) * G.bob; PS.roll = Math.sin(ph) * G.roll;
  PS.head = Math.sin(ph) * G.sway; PS.rot = 0; PS.fs = G.fs ?? 0.4; PS.reach = 1; PS.lift = 0;
  if (z.idle) {
    const s = Math.sin(t * 2.2 + ph);
    for (let i = 0; i < 2; i++) { PS.la[i] = (i ? -0.06 : 0.06); PS.lb[i] = 0.06; PS.aa[i] = G.armR * 0.8 + s * 0.08; }
    PS.bob = 0; PS.roll = s * 0.03; PS.head = s * 0.1;
  } else if (z.att) {
    PS.reach = 0;
    // latched on a wagon (round 18): hangs off it by the claws, feet off the snow, legs dangling and
    // kicking loose as it is dragged along, clawing at the wagon in turns
    const w = t * 14 + ph;
    for (let i = 0; i < 2; i++) {
      const s = Math.sin(w + i * Math.PI);
      const kb = z.zv === 's' ? 1 : 0.4;   // seen from the front or back a bent knee reads like kneeling
      PS.la[i] = (-0.2 + 0.32 * Math.sin(t * 6.5 + ph + i * 2.1)) * kb;
      PS.lb[i] = (0.3 + 0.35 * Math.max(0, Math.sin(t * 9 + ph + i * 1.7))) * kb;
      if (G.armR || G.pump) { PS.aa[i] = 2.25 + 0.35 * s; PS.ab[i] = 0.2 + 0.3 * Math.max(0, -s); PS.as[i] = 0.22; }
    }
    PS.lean = 0.32 + 0.06 * Math.sin(w * 2); PS.bob = 0; PS.head = Math.sin(w) * 0.12; PS.roll = Math.sin(t * 5 + ph) * 0.05; PS.fs = 0.2;
    PS.lift = 0.26 + 0.02 * Math.sin(w);
  } else if (z.crouch > 0) {
    PS.reach = 0;
    // runner pounce tell: squat low, arms swung back, shivering
    const k = clamp(1 - z.crouch / ((z.leapTo && z.leapTo.cfg && z.leapTo.cfg.crouch) || 0.3), 0, 1), q = Math.min(1, k * 3);
    for (let i = 0; i < 2; i++) { PS.la[i] = (0.95 + (i ? -0.15 : 0.1)) * q; PS.lb[i] = 1.9 * q; PS.aa[i] = -0.6 * q + 0.2; PS.ab[i] = 0.5; }
    PS.lean = 0.42 + 0.4 * q; PS.bob = 0; PS.roll = 0; PS.rot = Math.sin(t * 70) * 0.025; PS.head = -0.1 * q;
  } else if (z.leap) {
    PS.reach = 0;
    // in the air: arms thrown forward, legs tucked, opening up to land
    const k = clamp(z.leap.t / z.leap.cfg.T, 0, 1);
    for (let i = 0; i < 2; i++) { PS.la[i] = (i ? 0.55 : 0.95) - 0.6 * k; PS.lb[i] = (i ? 1.3 : 1.6) * (1 - k) + 0.25; PS.aa[i] = 1.8 - 0.35 * k + (i ? 0.15 : 0); PS.ab[i] = 0.1; PS.as[i] = 0.12; }
    PS.lean = 0.7 - 0.35 * k; PS.bob = 0; PS.roll = 0; PS.head = 0.1;
  } else if (z.held) {
    PS.reach = 0;
    // skewered on a harpoon: limp legs swinging, arms flailing
    for (let i = 0; i < 2; i++) { const s = Math.sin(t * 16 + i * Math.PI); PS.la[i] = 0.35 * Math.sin(t * 9 + i * 2); PS.lb[i] = 0.4; PS.aa[i] = 2.5 + 0.5 * s; PS.ab[i] = 0.5; PS.as[i] = 0.4; }
    PS.lean = -0.15; PS.bob = 0; PS.roll = 0; PS.rot = Math.sin(t * 7) * 0.3; PS.head = Math.sin(t * 11) * 0.2;
  } else if (z.air > 0) {
    PS.reach = 0;
    // thrown by the plow: tumbling with arms and legs out
    for (let i = 0; i < 2; i++) { const s = Math.sin(t * 20 + i * 2); PS.la[i] = i ? -0.5 : 0.6; PS.lb[i] = 0.7; PS.aa[i] = 2.7 + 0.4 * s; PS.ab[i] = 0.4; PS.as[i] = 0.5; }
    PS.lean = 0; PS.bob = 0; PS.roll = 0; PS.head = 0.2;
  }
  if (!G.armR && !G.pump && !z.held && !z.air) for (let i = 0; i < 2; i++) PS.aa[i] = 0;
  // lost a leg: hops along on the other one, leaning over toward the missing side
  if ((z.lost & 3) && !z.idle && !z.att && !z.crouch && !z.leap && !z.held && !(z.air > 0) && !z.dead) {
    const hop = Math.abs(Math.sin(ph));
    for (let i = 0; i < 2; i++) { PS.la[i] = 0.14 * Math.cos(ph); PS.lb[i] = 0.7 * (1 - hop); }
    PS.bob = hop * 0.09; PS.lean += 0.1; PS.roll = (z.lost & 1 ? -1 : 1) * 0.08;
  }
  return PS;
}

// ---------- drawing with one transform per part ----------
let Ma, Mb, Mc, Md, Me, Mf;          // the zombie's base transform (feet at the origin, rig px)
let FLASH = 0, ICY = false;
function put(g, name, x, y, rot, sx, sy, px, py) {
  const p = P[name];
  const c = Math.cos(rot), s = Math.sin(rot);
  const a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
  const e = x - a * px - cc * py, f = y - b * px - d * py;
  g.setTransform(Ma * a + Mc * b, Mb * a + Md * b, Ma * cc + Mc * d, Mb * cc + Md * d, Ma * e + Mc * f + Me, Mb * e + Md * f + Mf);
  const X = p.x, Y = p.y, W = p.w, H = p.h;
  if (FLASH >= 1) { g.drawImage(ATLAS_W, X, Y, W, H, 0, 0, W, H); return; }
  g.drawImage(ICY ? ATLAS_I : ATLAS, X, Y, W, H, 0, 0, W, H);
  if (FLASH > 0) { const ga = g.globalAlpha; g.globalAlpha = ga * FLASH; g.drawImage(ATLAS_W, X, Y, W, H, 0, 0, W, H); g.globalAlpha = ga; }
}

// limb scratch: per limb its joint, the two segment rotations and lengths, depth and mirror
const LB = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, r1: 0, s1: 1, r2: 0, s2: 1, ex: 0, ey: 0, z: 0, mir: false, top2: false, arm: false, on: true, reach: false }));
const DI = Array.from({ length: 12 }, () => ({ k: 0, kind: 0, li: 0 }));   // draw list: 0 torso, 1 head, 2 upper limb, 3 lower limb, 4 stump goo, 5 prop

export function zrigHas(type) { return !!(D && ready[type]); }
// whether a type has arms that can come off (the shield zombie's hands are painted on its door)
export function zrigArms(type) { return !!(D && D.types[type] && !(D.types[type].opt || {}).noArms); }

// draws zombie z with its feet at (z.x, z.y - z.h), figure height H (world px); o = the caller's sprite
// options (only flash and ice are used). Returns false when this type has no parts.
export function drawZRig(g, z, t, H, o = {}) {
  if (!D || z.boss || !ready[z.type] || globalThis.ZRIG_OFF) return false;   // ZRIG_OFF: test switch back to the single pictures
  const T = D.types[z.type], G = GAIT[T.gait] || GAIT.walker, L = D.limbs[T.limbs], opt = T.opt || {};
  face(z, t);
  const v = z.zv, V = T[v], LV = L[v] || L.f;
  const mirror = v === 's' && z.zm;
  const base = v === 'f' ? 0 : v === 'b' ? Math.PI : (mirror ? -Math.PI / 2 : Math.PI / 2), rel = wrap(z.yaw - base);
  // the side pictures now cover a wide range of headings: limbs move as seen side-on, turned only a little
  const yaw = v === 's' ? base + rel * 0.3 : z.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const fl = 1;
  const F = T.fig, k = H / F;
  const S = pose(z, t, G);

  // base transform: feet at (x, y - h); death squash, hit squash and tumbling act on the whole figure
  let gsx = 1, gsy = 1, grot = S.rot;
  if (z.dead) { const q = clamp(z.dying / 0.24, 0, 1); gsx = 1 + q * 0.6; gsy = 1 - q * 0.7; }
  else if (z.flash > 0) { const q = z.flash / 0.09; gsx = 1 + 0.16 * q; gsy = 1 - 0.13 * q; }
  if (z.air > 0 || (z.dead && z.rot)) grot += z.rot || 0;
  const M = g.getTransform();
  Ma = M.a; Mb = M.b; Mc = M.c; Md = M.d; Me = M.e; Mf = M.f;
  Me += Ma * z.x + Mc * (z.y - z.h); Mf += Mb * z.x + Md * (z.y - z.h);
  // off the canvas (zombies walking in from the sides): nothing to draw, and no fallback picture either
  const mg = Math.abs(H * Md) * 1.3 + 8, cv = g.canvas;
  if (cv && (Me < -mg || Me > cv.width + mg || Mf < -mg || Mf > cv.height + mg * 2)) return true;
  if (grot) {
    const piv = -F * 0.45 * k, c = Math.cos(grot), s = Math.sin(grot);
    Me += Mc * piv; Mf += Md * piv;
    const a = Ma * c + Mc * s, b = Mb * c + Md * s, cc = -Ma * s + Mc * c, d = -Mb * s + Md * c;
    Ma = a; Mb = b; Mc = cc; Md = d;
    Me -= Mc * piv; Mf -= Md * piv;
  }
  Ma *= gsx * k; Mb *= gsx * k; Mc *= gsy * k; Md *= gsy * k;
  FLASH = o.flash || 0; ICY = !!o.ice;

  // legs: the planted foot stays on the ground
  const legs = LV.leg, arms = LV.arm, thigh = legs.u.len, shin = legs.l.len;
  let drop = 0;
  for (let i = 0; i < 2; i++) if (!(z.lost & (1 << i))) drop = Math.max(drop, thigh * Math.cos(S.la[i]) + shin * Math.cos(S.la[i] - S.lb[i]));
  if (!drop) drop = thigh + shin;
  const hipY = -drop - S.bob * F - S.lift * F, hipX = v === 's' ? 0 : Math.sin(rel) * 0.04 * F;

  // torso: leans toward where it is going; seen end-on the lean mostly shortens it
  const tor = V.torso;
  const upX = Math.sin(S.lean) * sy, upY = Math.sin(S.lean) * cy * KG - Math.cos(S.lean) * KH;
  let tRot = Math.atan2(upX, -upY);
  if (v !== 's') tRot *= 0.35;
  tRot += S.roll;
  const tSy = v === 's' ? 1 : clamp(-upY / KH, 0.82, 1);
  const tsx = (v === 's' ? 1 : 0.86 + 0.14 * Math.abs(Math.cos(rel))) * fl * (mirror ? -1 : 1);
  const tc = Math.cos(tRot), ts = Math.sin(tRot);
  const wx = (px, py) => { const ux = (px - tor.hip[0]) * tsx, uy = (py - tor.hip[1]) * tSy; return hipX + ux * tc - uy * ts; };
  const wy = (px, py) => { const ux = (px - tor.hip[0]) * tsx, uy = (py - tor.hip[1]) * tSy; return hipY + ux * ts + uy * tc; };

  // joints: front and back pictures have two shoulders and two hips; the side picture has one of
  // each, and the far limb sits a little higher and behind (inside the body outline)
  // front and back views narrow the sideways swing only, so a limb pointing up stays pointing up
  const damp = v === 's' ? 1 : 0.6;
  let n = 0;
  for (let li = 0; li < 4; li++) {
    const arm = li >= 2, i = li & 1, B = LB[li];
    B.arm = arm; B.on = !(arm && opt.noArms); B.reach = false;
    if (!B.on) continue;
    const gone = z.lost & (1 << li);
    // body side of this limb: limb 1 is always on the right of the picture, which is the body's other side in the back view
    const sgn = (i ? 1 : -1) * (v === 'b' ? -1 : 1);
    // near / far: depth of this side of the body
    const dep = -sgn * sy;                                   // +1 = toward the camera
    let jx, jy;
    if (v === 's') {
      const p = arm ? tor.sh : tor.hip, far = dep < 0;
      const ox = far ? (arm ? -3 : -4) : 0, oy = far ? (arm ? -3 : -5) : 0;
      jx = wx(p[0] + ox, p[1] + oy); jy = wy(p[0] + ox, p[1] + oy);
    } else {
      const p = (arm ? tor.shs : tor.hips)[i];
      jx = wx(p[0], p[1]); jy = wy(p[0], p[1]);
    }
    // a lost limb: only a goo splat over the stump (hidden behind the body when it is the far side)
    if (gone) {
      B.on = false; B.x = jx; B.y = jy;
      if (!(v === 's' && dep < 0)) { DI[n].k = 0.2 + (arm ? 0.6 : 0) + dep * 0.1; DI[n].kind = 4; DI[n++].li = li; }
      continue;
    }
    // seen from the front while walking, reaching arms use the generated foreshortened "reaching" piece
    // (round 18) instead of two bent segments pointing at the camera
    if (arm && v === 'f' && L.reach && S.reach > 0.5 && G.armR >= 0.9) {
      const R = L.reach, sw = Math.sin((z.ph || 0) + i * Math.PI) * 0.1;
      B.reach = true; B.x = jx; B.y = jy; B.mir = i === 1;
      // round 19: out from the shoulder corners and down past the coat, as in the original pictures
      B.r1 = -sgn * (0.26 + S.as[i] * 0.6) + sw; B.p1 = 1.04 + 0.04 * Math.cos((z.ph || 0) + i * Math.PI);
      B.ex = jx - Math.sin(B.r1) * R.len * RS * 0.8 * B.p1; B.ey = jy + Math.cos(B.r1) * R.len * RS * 0.8 * B.p1;   // hand (grip)
      B.k1 = B.k2 = 1.2 + dep * 0.3;
      DI[n].k = B.k1; DI[n].kind = 2; DI[n++].li = li;
      continue;
    }
    // 3D direction of the upper and lower segment in the body frame (x right, y up, z forward)
    // arms open outward when seen from the front or back, so reaching hands read clearly on either side
    // walking away from the camera the reaching arms would point into the screen and vanish, so they hang lower
    const a1 = arm ? S.aa[i] * (1 - 0.75 * S.reach * Math.max(0, -cy)) : S.la[i], a2 = arm ? a1 + S.ab[i] : a1 - S.lb[i];
    const vx = sgn * (arm ? S.as[i] + (v === 's' ? 0 : S.fs * Math.abs(cy)) : 0.04), nn = 1 / Math.sqrt(1 + vx * vx);
    const seg = arm ? arms : legs;
    let X = (vx * cy + Math.sin(a1) * sy) * nn, Y = (-vx * sy + Math.sin(a1) * cy) * nn;
    let dx = X / KH, dyy = (Y * KG + Math.cos(a1) * KH * nn) / KH;
    B.r1 = Math.atan2(-dx * damp, dyy); B.s1 = clamp(Math.hypot(dx, dyy), 0.45, 1.1);
    const zy1 = Y;
    B.x = jx; B.y = jy;
    B.ex = jx - Math.sin(B.r1) * seg.u.len * B.s1 * (1 + 0.12 * Math.max(0, Y)); B.ey = jy + Math.cos(B.r1) * seg.u.len * B.s1 * (1 + 0.12 * Math.max(0, Y));
    X = (vx * cy + Math.sin(a2) * sy) * nn; Y = (-vx * sy + Math.sin(a2) * cy) * nn;
    dx = X / KH; dyy = (Y * KG + Math.cos(a2) * KH * nn) / KH;
    B.r2 = Math.atan2(-dx * damp, dyy); B.s2 = clamp(Math.hypot(dx, dyy), 0.45, 1.1);
    B.top2 = Y > zy1 + 0.05;                                 // the lower segment comes toward the camera: draw it on top
    B.p1 = 1 + 0.12 * Math.max(0, zy1); B.p2 = 1 + 0.3 * Math.max(0, Y);   // nearer the camera = a little bigger (hands reaching at you)
    B.mir = v === 's' ? mirror : i === 1;
    // draw order: legs under the torso; the upper arm covers its shoulder socket (over the torso)
    // except the far arm in the side view; a forearm reaching away from the camera goes behind the torso
    const o2 = B.top2 ? 0.01 : -0.01;
    if (!arm) { B.k1 = -10 + dep * 0.5; B.k2 = B.k1 + o2; }
    else if (v === 's' && dep < 0) { B.k1 = -5; B.k2 = -5 + o2; }
    else { B.k1 = 1 + dep * 0.3; B.k2 = v !== 's' && Y < -0.3 ? -1 + dep * 0.3 : B.k1 + o2; }
    DI[n].k = B.k1; DI[n].kind = 2; DI[n++].li = li;
    DI[n].k = B.k2; DI[n].kind = 3; DI[n++].li = li;
  }
  // the hard hat's club and the pot zombie's ladle (round 18): held up in the hand of the near arm
  // (the right-hand arm of the picture from the front or back), under the hand
  let pl = -1;
  if (T.prop) {
    pl = v === 's' && sy > 0 ? 2 : 3;   // side view: limb 2 is the near arm when facing right
    if (!LB[pl].on) pl = -1;
    else { DI[n].k = (LB[pl].reach ? LB[pl].k1 : LB[pl].k2) - 0.005; DI[n].kind = 5; DI[n++].li = pl; }
  }
  const headUnder = opt.headUnder && opt.headUnder.includes(v);
  DI[n].k = 0; DI[n++].kind = 0;
  DI[n].k = headUnder ? -0.5 : v === 'b' ? 3 : 0.5; DI[n++].kind = 1;
  // back to front (tiny insertion sort over at most 10 items, no allocations)
  for (let a = 1; a < n; a++) { const x = DI[a]; let b = a - 1; while (b >= 0 && DI[b].k > x.k) { DI[b + 1] = DI[b]; b--; } DI[b + 1] = x; }

  const head = V.head;
  const nx = wx(tor.neck[0], tor.neck[1]) + (v === 's' ? 0 : Math.sin(rel) * 0.02 * F), ny = wy(tor.neck[0], tor.neck[1]);
  const hRot = tRot * 0.5 + S.head * (v === 's' ? 0.5 : 1) * (mirror ? -1 : 1);
  for (let a = 0; a < n; a++) {
    const d = DI[a];
    if (d.kind === 0) put(g, tor.img, hipX, hipY, tRot, tsx, tSy, tor.hip[0], tor.hip[1]);
    else if (d.kind === 1) put(g, head.img, nx, ny, hRot, fl * (mirror ? -1 : 1), 1, head.px, head.py);
    else if (d.kind === 5) {
      const B = LB[d.li], pr = T.prop;
      let hx, hy;
      if (B.reach) { hx = B.ex; hy = B.ey; }
      else { const ln = arms.l.len * B.s2 * B.p2 * 0.8; hx = B.ex - Math.sin(B.r2) * ln; hy = B.ey + Math.cos(B.r2) * ln; }
      const tilt = v === 's' ? (mirror ? -1 : 1) * (0.35 + 0.12 * Math.sin(z.ph || 0)) : 0.22 + 0.06 * Math.sin(z.ph || 0);
      put(g, pr.img, hx, hy, tilt, v === 's' && mirror ? -1 : 1, 1, pr.px, pr.py);
    }
    else if (d.kind === 4) { const B = LB[d.li], gp = P[GOO]; if (gp) { const sc = F * 0.2 / gp.h; put(g, GOO, B.x, B.y, (d.li * 1.3) % 6.3, sc, sc, gp.w / 2, gp.h / 2); } }
    else {
      const B = LB[d.li], seg = B.arm ? arms : legs, m = (B.mir ? -1 : 1) * fl * (T.lw || 1);
      if (B.reach) { const R = L.reach; put(g, R.img, B.x, B.y, B.r1, m * B.p1 * 1.06, B.p1 * RS, R.px, R.py); }
      else if (d.kind === 2) put(g, seg.u.img, B.x, B.y, B.r1, m * B.p1, B.s1 * B.p1, seg.u.px, seg.u.py);
      else put(g, seg.l.img, B.ex, B.ey, B.r2, m * B.p2, B.s2 * B.p2, seg.l.px, seg.l.py);
    }
  }
  if (globalThis.ZRIG_DEBUG) marks(g, arms, legs, nx, ny, hipX, hipY);
  g.setTransform(M);
  return true;
}

// a limb knocked off a zombie (round 18): b = { type, v, mir, arm, x, y, h, rot, H } in world px;
// both segments drawn straight, centred on (x, y - h), turned by rot
export function drawZBit(g, b) {
  if (!D || !ready[b.type]) return false;
  const T = D.types[b.type], L = D.limbs[T.limbs], LV = L[b.v] || L.f, seg = b.arm ? LV.arm : LV.leg;
  const k = b.H / T.fig, M = g.getTransform(), c = Math.cos(b.rot), s = Math.sin(b.rot);
  Ma = (M.a * c + M.c * s) * k; Mb = (M.b * c + M.d * s) * k; Mc = (-M.a * s + M.c * c) * k; Md = (-M.b * s + M.d * c) * k;
  Me = M.a * b.x + M.c * (b.y - b.h) + M.e; Mf = M.b * b.x + M.d * (b.y - b.h) + M.f;
  FLASH = 0; ICY = false;
  const tot = seg.u.len + seg.l.len, m = b.mir ? -1 : 1;
  put(g, seg.u.img, 0, -tot / 2, 0, m, 1, seg.u.px, seg.u.py);
  put(g, seg.l.img, 0, -tot / 2 + seg.u.len, 0, m, 1, seg.l.px, seg.l.py);
  const gp = P[GOO];
  if (gp) { const sc = T.fig * 0.16 / gp.h; put(g, GOO, 0, -tot / 2, 0, sc, sc, gp.w / 2, gp.h / 2); }
  g.setTransform(M);
  return true;
}

// joint markers for the visual joint check (only when globalThis.ZRIG_DEBUG is set)
function marks(g, arms, legs, nx, ny, hipX, hipY) {
  g.setTransform(Ma, Mb, Mc, Md, Me, Mf);
  const sc = 1 / Math.hypot(Ma, Mb);
  const dot = (x, y, col, r = 3.4) => { r *= sc; g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 0.6 * sc; g.stroke(); };
  for (let i = 0; i < 4; i++) {
    const B = LB[i], seg = B.arm ? arms : legs;
    if (!B.on || B.reach) continue;
    const fx = B.ex - Math.sin(B.r2) * seg.l.len * B.s2, fy = B.ey + Math.cos(B.r2) * seg.l.len * B.s2;
    g.strokeStyle = B.arm ? '#ff7a00' : '#0a5cff'; g.lineWidth = sc;
    g.beginPath(); g.moveTo(B.x, B.y); g.lineTo(B.ex, B.ey); g.lineTo(fx, fy); g.stroke();
    dot(B.x, B.y, B.arm ? '#ff7a00' : '#0a5cff'); dot(B.ex, B.ey, '#ffe000', 2.6); dot(fx, fy, '#fff', 2.2);
  }
  dot(nx, ny, '#ff00ff'); dot(hipX, hipY, '#00b000');
  g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = sc; g.beginPath(); g.moveTo(-30, 0); g.lineTo(30, 0); g.stroke();
}

// joint positions of the last drawn pose, in rig px (for the visual joint check)
export function zrigJoints() { return LB.map((B) => ({ on: B.on, arm: B.arm, x: B.x, y: B.y, ex: B.ex, ey: B.ey })); }
