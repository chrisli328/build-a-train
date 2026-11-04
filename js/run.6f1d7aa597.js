// One run: the train rolls up the screen through a snowy route while its roof crew
// shoot the zombies that rush it. World units: the screen is 400 wide at zoom 1.
// The route is a line in world space with real turns and a loop round the boss at the end.
// The game itself runs in a frame turned with the camera (th), so the train always heads up
// the screen: at a turn the frame turns and everything on the ground turns with it (turnFrame).
import { CREW, ZOMBIES, CARDS, ROUTES, STAGE, XP_NEED } from './data.6a0c6c4d8b.js';
import { art, sprite, has, CAP, makeGroundTile, zombieStandIn, crewStandIn, carStandIn, propStandIn, text, roundRect, hpBar } from './art.27597f9460.js';
import { Fx, fxs, tinted } from './fx.0af622b1de.js';
import { sfx, buzz } from './audio.a7f44784ac.js';

// Yeti boss rig. Joints are fractions of the torso piece (x across, y down); pivots are fractions of each
// part. unit = world units per source pixel, shared by every part so the generated sizes fit together.
// what the swarm during the yeti fight is made of: mostly quick small zombies
const BOSS_MIX = [['runner', 5], ['walker', 5], ['hardhat', 1.5]];
const YETI = {
  unit: 0.16, caps: false,
  // hunched like the old yeti picture: the head sits low between the shoulders, the arms hang from the shoulder tops
  f: { torso: 'z-yeti-torso-f', head: 'z-yeti-head-f', roar: 'z-yeti-roar-f', arm: ['z-yeti-arm-l', 'z-yeti-arm-r'], leg: 'z-yeti-leg-f',
       neck: [0.5, 0.4], neckPx: 0.5, neckPivot: 0.93, headS: 0.8, sh: [[0.12, 0.24], [0.88, 0.24]], armPivot: 0.12, armS: 0.95,
       hips: [[0.33, 0.84], [0.67, 0.84]], legPx: 0.5, legPivot: 0.1, legS: 0.6, hipY: 0.84 },
  s: { torso: 'z-yeti-torso-s', head: 'z-yeti-head-s', roar: 'z-yeti-roar-s', arm: ['z-yeti-arm-l', 'z-yeti-arm-r'], leg: 'z-yeti-leg-s',
       neck: [0.7, 0.42], neckPx: 0.53, neckPivot: 0.93, headS: 0.8, sh: [[0.29, 0.43], [0.62, 0.3]], armPivot: 0.12, armS: 0.95,
       hips: [[0.42, 0.84], [0.6, 0.84]], legPx: 0.4, legPivot: 0.1, legS: 0.75, hipY: 0.84 },
  b: { torso: 'z-yeti-torso-b', head: 'z-yeti-head-b', roar: 'z-yeti-head-b', arm: ['z-yeti-arm-r', 'z-yeti-arm-l'], leg: 'z-yeti-leg-f',
       neck: [0.5, 0.35], neckPx: 0.5, neckPivot: 0.93, headS: 0.8, sh: [[0.1, 0.3], [0.9, 0.3]], armPivot: 0.12, armS: 0.95,
       hips: [[0.33, 0.84], [0.67, 0.84]], legPx: 0.5, legPivot: 0.1, legS: 0.6, hipY: 0.84 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// generated world pieces: the rail tile is 9 sleepers long, cut into TILE_SLEEPERS track steps; signs list which way the art points
const TILE_SLEEPERS = 18, TRACK_W = 84;
const WORLD_SIGN = { repair: ['w-sign-green', -1], horde: ['w-sign-red', 1], supply: ['w-sign-yellow', -1], armory: ['w-sign-purple', 1] };
const SHOT_ART = { bullet: 'fx-tracer-orange', pellet: 'fx-pellet-yellow', rocket: 'fx-rocket', ice: 'fx-shard', flame: 'fx-flame-orange' };
const SHARD_ROT = 0.55; // the shard art points up and to the right
const GAP = -7, TRACK = 200, BRANCH = 96;   // negative gap: the couplers overlap

// Engine straight into gun wagons, no tender or caboose.
// w = body width, sw = sprite width (the engine art has a pennant sticking out on the left, dx re-centres the body),
// seats = [along the car from its middle (+ = front), across the car (+ = right)] as fractions of length and width.
const CARS = {
  // the engine and wagon the owner picked back (2026-11-04): a slim real-looking engine with the
  // captain on the cab roof, wagons with the two hatches one behind the other so crew read clearly
  loco:  { spr: 'car-loco', w: 86, sw: 86, dx: 0, l: 173, seats: [[-0.33, 0]], hp: 480 },
  wagon: { spr: 'car-wagon-1', tiers: ['car-wagon-1', 'car-wagon-2', 'car-wagon-3'], w: 86, sw: 86, dx: 0, l: 180, seats: [[0.28, 0], [-0.16, 0]], hp: 220 },
};
const PROPS = [
  ['tree-big', 92, 3], ['tree-small', 66, 3.2], ['rock-big', 72, 1.3], ['rock-small', 58, 2], ['cabin', 124, 0.35],
  ['campfire', 56, 0.35], ['crates', 62, 0.6], ['barrels', 46, 0.6], ['car-wreck', 86, 0.35], ['barricade', 66, 0.45], ['snowman', 46, 0.3],
];
const PROP_W = Object.fromEntries(PROPS.map(([n, w]) => [n, w]));
PROP_W.signal = 30;

function seeded(s) { return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export class Run {
  constructor(canvas, hooks, opts = {}) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.hooks = hooks; this.opts = opts;
    this.fx = new Fx();
    this.ground = art.ground ? art.ground.img : makeGroundTile();   // generated seamless snow tile; the drawn one only if it is missing
    this.flakes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: rand(1, 2.8), s: rand(0.6, 1.4), ph: rand(0, 6) }));
    this.chunks = new Map();
    this.reset();
  }

  reset() {
    this.buildPath(); this.th = 0; this.thC = 1; this.thS = 0; this.ab = 0; this.lean = 0; this.lastD = 0; this.fol = { fy: 0.4, zoom: 1 };
    this.t = 0; this.D = 0; this.speed = 0; this.base = 50;
    this.state = this.opts.showcase ? 'showcase' : 'intro'; this.introT = 0;
    this.cars = [];
    this.addCar('loco', true);
    for (let i = 0; i < (this.opts.wagons || 1); i++) this.addCar('wagon', true);
    // starting line-up fills seats front to back: engine roof first, then each wagon
    const seats = this.cars.flatMap((c) => c.seats);
    (this.opts.lineup || ['captain']).forEach((t, i) => { if (t && seats[i]) this.putCrew(t, seats[i], true); });
    this.zs = []; this.shots = []; this.drops = []; this.crates = []; this.signs = []; this.ui = [];
    this.lv = 1; this.xp = 0; this.coins = 0; this.kills = 0; this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.mods = { rate: 1, dmg: 1, plow: 1, crit: 0.06, magnet: 1, xp: 1 };
    this.crewLv = {};
    this.od = 0; this.odT = 0;
    this.pending = 0; this.pause = new Set(); this.slow = 1; this.slowT = 0; this.hitstop = 0;
    this.spawnAcc = 0; this.evI = 0;
    this.junctions = STAGE.junctions.map((j) => ({ ...j, choice: 0, shown: false, entered: false, done: false, lever: 0 }));
    this.nodes = STAGE.nodes.map((d) => ({ d, done: false }));
    this.boss = null; this.bossWarned = false; this.endT = 0; this.result = null;
    this.cam = { x: TRACK, y: 0, zoom: 1, fy: 0.4 };
    this.hudT = 0; this.smokeT = 0; this.sprayT = 0;
    this.fx.clear(); this.chunks.clear();
    this.layout(0);
  }

  get paused() { return this.pause.size > 0; }

  // ---------- train ----------
  addCar(type, instant = false) {
    const def = CARS[type];
    const hpMul = this.opts.hpMul || 1;
    const c = { type, ...def, hp: def.hp * hpMul, max: def.hp * hpMul, hitT: 0, join: instant ? 0 : 1, seats: [] };
    // wagon look follows the train's armour level: wood, then steel, then spiked
    if (def.tiers) { c.tier = this.opts.armorLv >= 6 ? 2 : this.opts.armorLv >= 3 ? 1 : 0; c.spr = def.tiers[c.tier]; }
    const a = art[c.spr];
    if (a) c.l = c.sw * a.h / a.w;
    c.seats = def.seats.map(([f, q]) => ({ f, q, crew: null, car: c, x: 0, y: 0 }));
    this.cars.push(c);
    return c;
  }
  trainLen() { return this.cars.reduce((s, c) => s + c.l + GAP, -GAP); }
  putCrew(type, seat, instant = false) {
    const d = CREW[type];
    // idle aim: side seats look out to their side, the engine roof looks back at the camera
    const idle = seat.q < 0 ? Math.PI * 0.86 : seat.q > 0 ? Math.PI * 0.14 : -Math.PI * 0.15;
    seat.crew = { type, ...d, cd: rand(0, 0.4), flip: false, recoil: 0, drop: instant ? 0 : 1, aim: null, bob: rand(0, 6), aimA: idle, idle };
  }
  emptySeats() { return this.cars.flatMap((c) => c.seats).filter((s) => !s.crew); }
  crewList() { return this.cars.flatMap((c) => c.seats).filter((s) => s.crew); }

  // ---------- the route ----------
  // straights joined by real turns, then a loop that runs round the boss for as long as the fight lasts
  buildPath() {
    const segs = [], R = STAGE.turnR || 240;
    let d = -3000, x = TRACK, y = 3000, a = 0;
    const push = (len, k) => { const q = { d0: d, len, x, y, a, k }; segs.push(q); const e = this.segAt(q, len); x = e.x; y = e.y; a = e.a; d += len; };
    for (const t of STAGE.turns || []) { const r = t.r || R, ang = t.deg * Math.PI / 180; push(t.d - d, 0); push(Math.abs(ang) * r, Math.sign(ang) / r); }
    push(STAGE.length - d, 0);
    const k = (STAGE.loopDir || -1) / STAGE.loopR;
    segs.push({ d0: d, len: Infinity, x, y, a, k });
    this.segs = segs;
    this.loopD = d; this.loopA = a; this.loopLen = Math.PI * 2 * STAGE.loopR;
    this.loopC = { x: x + Math.cos(a) / k, y: y + Math.sin(a) / k };
  }
  // heading a: 0 = up the world, + = turning right; forward = (sin a, -cos a), right = (cos a, sin a)
  segAt(q, u) {
    if (!q.k) return { x: q.x + Math.sin(q.a) * u, y: q.y - Math.cos(q.a) * u, a: q.a };
    const a = q.a + q.k * u;
    return { x: q.x + (Math.cos(q.a) - Math.cos(a)) / q.k, y: q.y + (Math.sin(q.a) - Math.sin(a)) / q.k, a };
  }
  pathAt(d) {
    let q = this.segs[0];
    for (const o of this.segs) { if (d >= o.d0) q = o; else break; }
    return this.segAt(q, d - q.d0);
  }
  // sideways offset of a branch through a junction (+ = right of the line); side 0 = the main line
  branchOff(d, side = null) {
    for (const j of this.junctions) {
      if (d > j.d0 && d < j.d1) {
        const t = (d - j.d0) / (j.d1 - j.d0), s = side ?? (j.choice || -1);
        return s * BRANCH * sstep(0, 0.3, t) * (1 - sstep(0.7, 1, t));
      }
    }
    return 0;
  }
  // a world point on the rails (the chosen branch at a junction unless side is given), lat = extra sideways
  wpt(d, side = null, lat = 0) {
    const p = this.pathAt(d), o = this.branchOff(d, side);
    const a = o ? p.a + Math.atan((this.branchOff(d + 4, side) - this.branchOff(d - 4, side)) / 8) : p.a;
    return { x: p.x + Math.cos(p.a) * (o + lat), y: p.y + Math.sin(p.a) * (o + lat), a };
  }
  // world <-> the turned frame the game runs in
  toF(x, y) { return { x: x * this.thC + y * this.thS, y: -x * this.thS + y * this.thC }; }
  toW(x, y) { return { x: x * this.thC - y * this.thS, y: x * this.thS + y * this.thC }; }
  fpt(d, lat = 0, side = 0) { const p = this.wpt(d, side, lat); return this.toF(p.x, p.y); }
  // the camera turns with the line: through a real turn the whole world swings round the train
  turnStep(dt) {
    const want = this.pathAt(Math.min(this.D - clamp(this.trainLen() * 0.15, 50, 120), this.loopD)).a;
    let da = want - this.th; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(this.D - this.lastD) < 150) da *= Math.min(1, dt * 2.2); // a test jump snaps straight there
    this.lastD = this.D;
    if (Math.abs(da) > 1e-6) this.turnFrame(da);
  }
  turnFrame(da) {
    this.th += da; this.thC = Math.cos(this.th); this.thS = Math.sin(this.th);
    const c = Math.cos(da), s = Math.sin(da);
    const R = (o, X = 'x', Y = 'y') => { const x = o[X], y = o[Y]; if (x === undefined || y === undefined) return; o[X] = x * c + y * s; o[Y] = -x * s + y * c; };
    for (const z of this.zs) { R(z); R(z, 'vx', 'vy'); R(z, 'kx', 'ky'); if (z.tele) R(z.tele); }
    for (const o of this.drops) { R(o); R(o, 'vx', 'vy'); }
    for (const o of this.crates) R(o);
    for (const o of this.signs) R(o);
    for (const o of this.shots) { R(o); R(o, 'vx', 'vy'); R(o, 'x0', 'y0'); R(o, 'tx', 'ty'); R(o, 'mx', 'my'); R(o, 'ex', 'ey'); for (const k of ['a', 'a0', 'a1', 'ang']) if (typeof o[k] === 'number') o[k] -= da; }
    for (const q of this.crewList()) q.crew.aimA -= da;
    this.fx.turn(c, s, da);
  }

  layout(dt) {
    let d = this.D;
    for (const c of this.cars) {
      c.d = d - c.l / 2;
      // a car rides on its two bogies, so on a bend it cuts the corner like a real carriage
      const b = c.l * 0.3, f = this.wpt(c.d + b), r = this.wpt(c.d - b);
      const p = this.toF((f.x + r.x) / 2, (f.y + r.y) / 2);
      c.x = p.x; c.y = p.y;
      c.a = Math.atan2(f.x - r.x, r.y - f.y) - this.th;
      c.fx = Math.sin(c.a); c.fy = -Math.cos(c.a);
      if (c.join > 0) c.join = Math.max(0, c.join - dt * 1.8);
      c.hitT = Math.max(0, c.hitT - dt);
      for (const s of c.seats) { s.x = c.x + c.fx * s.f * c.l - c.fy * s.q * c.w; s.y = c.y + c.fy * s.f * c.l + c.fx * s.q * c.w; }
      d -= c.l + GAP;
    }
  }

  // ---------- main step ----------
  step(dtReal) {
    const dt0 = Math.min(dtReal, 1 / 30);
    this.fx.update(dt0 * (this.paused ? 0 : 1));
    if (this.paused) { this.render(); return; }
    if (this.hitstop > 0) { this.hitstop -= dt0; this.render(); return; }
    if (this.slowT > 0) { this.slowT -= dt0; if (this.slowT <= 0) this.slow = 1; }
    const dt = dt0 * this.slow;
    this.t += dt;
    this.update(dt);
    this.render();
  }

  update(dt) {
    // speed: ramp out of the depot, overdrive doubles it; at the end the line runs on round the boss loop
    if (this.state === 'showcase') { this.speed = 0; this.layout(dt); this.crewStep(dt); this.trainFx(dt); this.camera(dt); return; }
    let target = this.base * (this.odT > 0 ? 2 : 1);
    if (this.state === 'intro') { this.introT += dt; target = this.introT > 1.2 ? this.base : 0; if (this.introT > 1.2) { this.state = 'run'; this.hooks.onGo && this.hooks.onGo(); } }
    if (this.state === 'win') target = this.base * 1.2;
    if (this.state === 'lose') target = 0;
    const blocked = this.zs.some((z) => z.plowBlock);
    if (blocked) target *= 0.3;
    this.speed += (target - this.speed) * Math.min(1, dt * (target < this.speed ? 3 : 1.6));
    this.D += this.speed * dt;
    this.turnStep(dt);
    this.layout(dt);
    if (this.odT > 0) this.odT -= dt;
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;

    if (this.state === 'run' || this.state === 'boss') {
      this.director(dt);
      this.events();
      this.junctionStep();
      this.nodeStep();
      this.bossStep(dt);
    }
    this.crewStep(dt);
    this.zombieStep(dt);
    this.shotStep(dt);
    this.dropStep(dt);
    this.crateStep();
    this.trainFx(dt);
    this.camera(dt);
    this.endStep(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.08; this.hooks.onHud && this.hooks.onHud(this.hud()); }
  }

  hud() {
    return {
      lv: this.lv, xp: this.xp, need: XP_NEED(this.lv), coins: this.coins, kills: this.kills,
      prog: clamp(this.D / STAGE.length, 0, 1), nodes: this.nodes.map((n) => ({ at: n.d / STAGE.length, done: n.done })),
      od: this.od, odT: this.odT, combo: this.combo,
      boss: this.boss && !this.boss.dead ? this.boss.hp / this.boss.max : null,
      cars: this.cars.map((c) => c.hp / c.max), xpx: this.mods.xp,
    };
  }

  // ---------- view ----------
  view() {
    const cw = this.cv.clientWidth, ch = this.cv.clientHeight;
    const Wv = 400 / this.cam.zoom, Hv = Wv * ch / cw;
    const top = this.cam.y - this.cam.fy * Hv;
    return { cw, ch, Wv, Hv, top, bot: top + Hv, left: this.cam.x - Wv / 2, right: this.cam.x + Wv / 2, k: cw / Wv };
  }
  camera(dt) {
    const cw = this.cv.clientWidth || 1, ch = this.cv.clientHeight || 1;
    const Hv0 = 400 * ch / cw;
    // a long train moves the engine up the screen so the last wagon stays in view
    const L = this.trainLen() + 10, fit = clamp(0.93 - L * 0.66 / Hv0, 0.24, 0.38);
    const sc = this.opts.showcase, f = this.fol;
    f.fy += ((sc ? sc.fy : fit) - f.fy) * Math.min(1, dt * 1.5);
    // through a turn the train bends into an L: centre the camera on all of it and pull back to fit it in
    let x0 = Infinity, x1 = -Infinity;
    for (const c of this.cars) { const e = Math.abs(c.fx) * c.l / 2 + Math.abs(c.fy) * c.w / 2; x0 = Math.min(x0, c.x - e); x1 = Math.max(x1, c.x + e); }
    const want = sc ? (sc.span ? clamp(sc.span * Hv0 / (this.trainLen() + 10), 0.6, sc.max || 2) : sc.zoom) : clamp(Math.min((1 - f.fy - 0.07) * Hv0 / L, 400 / (x1 - x0 + 90)), 0.5, 1);
    f.zoom += (want - f.zoom) * Math.min(1, dt * 2);
    // follow the engine's nose for height; sideways, the middle of the train (this also leans into a branch)
    const n = this.wpt(this.D, 0), A = this.toF(n.x, n.y);
    this.lean += ((x0 + x1) / 2 - A.x - this.lean) * Math.min(1, dt * 3);
    A.x += this.lean;
    // boss arena: as the train nears the loop the camera pulls back over the whole ring, the yeti in the middle
    this.ab += ((this.bossWarned && this.D > this.loopD - 420 ? 1 : 0) - this.ab) * Math.min(1, dt * 0.8);
    const b = sstep(0, 1, this.ab), C = this.toF(this.loopC.x, this.loopC.y), W = 2 * (STAGE.loopR + 80);
    const za = Math.min(400 / W, 400 * ch / (cw * W));
    this.cam.x = A.x + (C.x - A.x) * b; this.cam.y = A.y + (C.y - A.y) * b;
    this.cam.fy = f.fy + (0.5 - f.fy) * b; this.cam.zoom = f.zoom + (za - f.zoom) * b;
  }
  toScreen(x, y) {
    const v = this.view();
    return { x: (x - this.cam.x) * v.k + v.cw / 2, y: (y - this.cam.y) * v.k + v.ch * this.cam.fy };
  }

  // ---------- spawning ----------
  leg() { return STAGE.legs.find((l) => this.D < l.to) || STAGE.legs[STAGE.legs.length - 1]; }
  director(dt) {
    const bossOn = this.boss && !this.boss.dead;
    // the yeti fight is a swarm: small zombies pour in the whole time, more with a bigger crew
    if (bossOn) this.spawnAcc += dt * (2.2 + 0.22 * this.crewList().length);
    else if (this.D > STAGE.length - 380 && !(this.boss && this.boss.dead)) { this.spawnAcc += dt * 1.1; }
    else {
      const L = this.leg(), i = STAGE.legs.indexOf(L), from = i ? STAGE.legs[i - 1].to : 0;
      const k = clamp((this.D - from) / (L.to - from), 0, 1);
      let rate = L.rate[0] + (L.rate[1] - L.rate[0]) * k;
      if (this.mods.xp > 1) rate *= 1.7;
      // a bigger train with more crew draws a bigger horde, so every seat keeps shooting;
      // a train with only one or two guns (the start of a run) gets a much thinner trickle
      const n = this.crewList().length;
      rate *= Math.min(0.75 + 0.08 * n, 0.3 + 0.2 * n);
      this.spawnAcc += rate * dt;
    }
    if (this.boss && this.boss.dead) return;
    const v = this.view();
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const mix = bossOn ? BOSS_MIX : this.leg().mix;
      let tot = mix.reduce((s, m) => s + m[1], 0), r = Math.random() * tot, type = mix[0][0];
      for (const [n, w] of mix) { if ((r -= w) < 0) { type = n; break; } }
      const roll = Math.random();
      // most of the horde comes in from the two sides, level with the car it wants
      if (roll < 0.12) this.spawn(type, rand(v.left + 14, v.right - 14), v.top - rand(25, 90));
      else if (roll < 0.84) { const li = STAGE.legs.indexOf(this.leg()), z = this.flank(type, v); for (let k = Math.random() < 0.25 + 0.15 * li ? 1 + Math.floor(rand(0, 1 + li)) : 0; k > 0; k--) { const q = this.spawn(type, z.x + Math.sign(z.x - this.cam.x) * rand(10, 50), z.y + rand(-40, 40)); q.pref = z.pref; q.rush = true; } }
      else if (roll < 0.95) this.burrow(type); else this.chaser(v);
    }
  }
  // a flanker comes in from one side, level with one car of the train, and sprints at it, so
  // every wagon's own crew gets work
  flank(type, v, side = 0, car = null) {
    const cars = this.cars.filter((c) => !c.broken && c.join === 0);
    const c = car || this.pickCar(cars.length ? cars : this.cars);
    const s = side || (Math.random() < 0.5 ? -1 : 1);
    const x = s < 0 ? v.left - 24 : v.right + 24;
    const z = this.spawn(type, x + s * rand(0, 30), clamp(c.y + rand(-50, 50), v.top + 20, v.bot - 40));
    z.pref = c; z.rush = true;
    return z;
  }
  // attackers go where the guns are: a wagon's share grows with the crew on it (cars further back a
  // little more), an empty wagon only gets a trickle, the engine (plow and captain) half a share
  pickCar(cars) {
    const w = cars.map((c, i) => i === 0 ? 0.5 : (0.25 + c.seats.filter((s) => s.crew).length) * (1 + 0.5 * i / Math.max(1, cars.length - 1)));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cars.length; i++) if ((r -= w[i]) < 0) return cars[i];
    return cars[cars.length - 1];
  }
  // bursts out of a snowbank close beside a rear wagon, so the short-range crew back there get work
  burrow(type) {
    const cars = this.cars.filter((c, i) => i > 0 && !c.broken && c.join === 0 && c.seats.some((s) => s.crew)).slice(-2);
    if (!cars.length) return null;
    const c = pick(cars), sd = Math.random() < 0.5 ? -1 : 1;
    const L = sd * rand(115, 160), F = rand(20, 70), x = c.x - c.fy * L + c.fx * F, y = c.y + c.fx * L + c.fy * F; // beside the car, a little ahead
    const z = this.spawn(type, x, y); z.pref = c; z.rush = true;
    if (has('fx-snow-splash')) this.fx.spr(x, y - 6, 'fx-snow-splash', 46, { life: 0.35, grow: 1.5 });
    for (let i = 0; i < 7; i++) this.fx.dot(x, y, rand(-110, 110), rand(-80, 40), rand(2.5, 4.5), '#ffffff', 0.55, { vz: rand(120, 240), g: 520, ink: '#9fb3cc' });
    return z;
  }
  chaser(v) {
    // runs up behind the last wagon that has crew on it (an empty tail wagon is not its target)
    const manned = this.cars.filter((c, i) => i > 0 && c.seats.some((s) => s.crew)), last = manned[manned.length - 1] || this.cars[this.cars.length - 1];
    const z = this.spawn('runner', last.x + (Math.random() < 0.5 ? -1 : 1) * rand(50, 140), v.bot + rand(10, 40));
    z.pref = last; z.spd *= 1.15;
    return z;
  }
  spawn(type, x, y, o = {}) {
    const d = ZOMBIES[type];
    const z = { type, ...d, x, y, hp: d.hp * (o.hpMul || 1), max: d.hp * (o.hpMul || 1), vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, slowT: 0, burnT: 0, air: 0, h: 0, vh: 0, rot: 0, att: null, dead: false, dying: 0, ph: rand(0, 6), flip: Math.random() < 0.5, idle: !!o.idle, numT: 0, acc: 0, spd: d.speed * rand(0.85, 1.15) };
    this.zs.push(z);
    return z;
  }
  events() {
    const evs = STAGE.events;
    while (this.evI < evs.length && this.D >= evs[this.evI].d) {
      const e0 = evs[this.evI++], v = this.view();
      // hordes and ambushes come smaller while the train has only one or two guns
      const e = { ...e0, n: e0.type === 'brute' ? e0.n : Math.max(3, Math.round(e0.n * Math.min(1, 0.35 + 0.22 * this.crewList().length))) };
      if (e.type === 'horde') {
        const cx = this.cam.x + rand(-70, 70);
        for (let i = 0; i < e.n; i++) { const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 110; this.spawn(pick(e.mix), cx + Math.cos(a) * r * 1.4, v.top - 60 - 110 + Math.sin(a) * r); }
        if (!e.quiet) { this.hooks.onBanner && this.hooks.onBanner('HORDE AHEAD!', 'red'); sfx.warn(); }
      } else if (e.type === 'ambush') {
        const x = e.side < 0 ? v.left - 30 : v.right + 30;
        for (let i = 0; i < e.n; i++) { const z = this.flank(pick(e.mix), v, e.side, this.cars[i % this.cars.length]); z.x = x + e.side * rand(0, 80); }
        this.hooks.onBanner && this.hooks.onBanner(e.side < 0 ? '◀ AMBUSH LEFT' : 'AMBUSH RIGHT ▶', 'orange');
        sfx.warn();
      } else if (e.type === 'brute') {
        for (let i = 0; i < e.n; i++) { const z = this.spawn('brute', this.cam.x + (e.n > 1 ? (i ? 60 : -60) : rand(-20, 20)), v.top - 70 - i * 40); z.mini = true; }
        this.hooks.onBanner && this.hooks.onBanner(e.n > 1 ? 'TWO BRUTES!' : 'BRUTE INCOMING!', 'purple');
        sfx.warn();
      }
    }
  }

  // ---------- junctions: pick a branch, each has its own reward ----------
  junctionStep() {
    for (const j of this.junctions) {
      if (!j.shown && this.D > j.d0 - 600) {
        j.shown = true;
        this.buildBranches(j);
        this.hooks.onJunction && this.hooks.onJunction(j);
      }
      if (j.shown && !j.choice && this.D >= j.d0 - 25) this.choose(j, -1, true);
      j.lever += ((j.choice || 0) - j.lever) * 0.2;
      const front = this.D;
      if (j.choice && !j.entered && front >= j.d0 + 60) { j.entered = true; this.enterRoute(j); }
      if (j.entered && !j.mid && front >= (j.d0 + j.d1) / 2) { j.mid = true; this.midRoute(j); }
      if (j.entered && !j.done && front >= j.d1 + 40) { j.done = true; this.mods.xp = 1; this.hooks.onRouteEnd && this.hooks.onRouteEnd(j); }
    }
  }
  choose(j, side, auto = false) {
    if (j.choice) return;
    j.choice = side; sfx.switch(); buzz(15);
    const key = j.opts[side < 0 ? 0 : 1];
    const p = this.fpt(j.d0 - 10, side * 70);
    this.fx.ring(p.x, p.y, 10, 70, '#ffffff', 0.4, 5);
    this.hooks.onChosen && this.hooks.onChosen(j, side, key, auto);
  }
  branchPoint(j, side, t, lat = 0) { const d = j.d0 + (j.d1 - j.d0) * t, p = this.wpt(d, side, lat), f = this.toF(p.x, p.y); return { x: f.x, y: f.y, d }; }
  buildBranches(j) {
    j.opts.forEach((key, i) => {
      const side = i ? 1 : -1;
      const p = this.branchPoint(j, side, 0.12), sg = this.fpt(p.d + 30, side * 132);
      this.signs.push({ x: sg.x, y: sg.y, key, side, j });
      if (key === 'supply') for (let k = 0; k < 7; k++) { const q = this.branchPoint(j, side, 0.3 + k * 0.06, rand(-6, 6)); this.crates.push({ x: q.x, y: q.y, d: q.d, kind: 'crates', j, side, hp: 1 }); }
      if (key === 'armory') { const q = this.branchPoint(j, side, 0.5); this.crates.push({ x: q.x, y: q.y, d: q.d, kind: 'armory', j, side, hp: 1 }); }
      if (key === 'repair') { const q = this.branchPoint(j, side, 0.5, side * 78); this.crates.push({ x: q.x, y: q.y, d: q.d, kind: 'repair', j, side, hp: 1, deco: true }); }
      if (key === 'horde') for (let k = 0; k < 20; k++) { const q = this.branchPoint(j, side, rand(0.25, 0.85), rand(-80, 80)); this.spawn(pick(['walker', 'walker', 'hardhat', 'runner']), q.x, q.y, { idle: true }); }
    });
  }
  enterRoute(j) {
    const key = j.opts[j.choice < 0 ? 0 : 1];
    if (key === 'horde') { this.mods.xp = 2; this.hooks.onBanner && this.hooks.onBanner('DOUBLE XP!', 'red'); }
  }
  midRoute(j) {
    const key = j.opts[j.choice < 0 ? 0 : 1];
    if (key === 'repair') {
      for (const c of this.cars) {
        c.hp = Math.min(c.max, c.hp + c.max * 0.4); c.broken = false;
        for (let i = 0; i < 6; i++) this.fx.icon(c.x + rand(-30, 30), c.y + rand(-50, 50), 'wrench', 22, { vy: -70, life: 0.9 });
        this.fx.label(c.x, c.y - 20, '+HP', 24, '#7dff6a', 1.2);
      }
      sfx.upgrade(); this.hooks.onBanner && this.hooks.onBanner('TRAIN REPAIRED!', 'green');
    }
  }

  nodeStep() {
    for (const n of this.nodes) {
      if (!n.done && this.D >= n.d) {
        n.done = true;
        for (let i = 0; i < 26; i++) { const a = rand(-Math.PI, 0), q = this.fpt(n.d, rand(-80, 80)); this.fx.dot(q.x, q.y, Math.cos(a) * rand(40, 160), Math.sin(a) * rand(60, 200), rand(3, 5), pick(['#ff4058', '#ffd23f', '#3d8bff', '#5cd636', '#ffffff']), 1.2, { g: 0, drag: 1.2 }); }
        sfx.chest(); buzz([20, 40, 20]);
        this.hooks.onChest && this.hooks.onChest(this.nodes.indexOf(n));
      }
    }
  }

  // ---------- boss: the yeti charges the train with a pack of small zombies and stomps the rails just ahead of the engine ----------
  bossStep(dt) {
    if (!this.bossWarned && this.D > this.loopD - 560) {
      this.bossWarned = true;
      const H = this.toF(this.loopC.x, this.loopC.y);
      const z = this.spawn('yeti', H.x, H.y);
      z.boss = true; z.atkT = 1.6; z.roarT = 3; z.cracks = 0; this.boss = z;
      this.fx.ring(H.x, H.y, 20, 220, '#d9f3ff', 0.6, 10); this.fx.shake(0.4);
      // it brings a pack with it
      for (let i = 0; i < 14; i++) { const a = rand(0, Math.PI * 2), d = rand(60, 170); this.spawn(i % 3 ? 'runner' : 'walker', H.x + Math.cos(a) * d, H.y + Math.sin(a) * d); }
      this.hooks.onBoss && this.hooks.onBoss();
      sfx.warn(); this.state = 'boss';
    }
    const b = this.boss;
    if (!b || b.dead) return;
    // cracked: staggers for a moment, no stomps
    if (b.stagger > 0) { b.stagger -= dt; if (b.tele) b.tele = null; return; }
    const loco = this.cars[0];
    // stomps as soon as the engine is in reach, whether or not the train is on the loop yet
    if (this.state === 'boss' && (b.tele || Math.hypot(loco.x - b.x, loco.y - b.y) < 300)) {
      b.atkT -= dt;
      if (b.atkT < 1.1 && !b.tele) { const p = this.fpt(loco.d + this.speed * 1.1); b.tele = { x: p.x, y: p.y, t: 0 }; }
      if (b.tele) b.tele.t += dt;
      if (b.atkT <= 0 && b.tele) {
        b.atkT = 2.9; const tx = b.tele.x, ty = b.tele.y; b.tele = null; b.slam = 0.35;
        this.fx.boom(tx, ty, 60, { noDecal: false }); this.fx.ring(tx, ty, 20, 170, '#d9f3ff', 0.5, 9);
        for (let i = 0; i < 16; i++) { const a = rand(0, Math.PI * 2); this.fx.dot(tx, ty, Math.cos(a) * 200, Math.sin(a) * 160, rand(4, 7), '#ffffff', 0.7, { vz: rand(100, 260), g: 600, ink: '#9fb4cc' }); }
        let hit = false;
        for (const c of this.cars) {
          const f = clamp((tx - c.x) * c.fx + (ty - c.y) * c.fy, -c.l / 2, c.l / 2);
          if (Math.hypot(tx - c.x - c.fx * f, ty - c.y - c.fy * f) < 84) { this.hurtCar(c, c === loco ? 46 : 40); hit = true; }
        }
        this.fx.shake(hit ? 0.75 : 0.4); sfx.boom(true); if (hit) buzz([30, 30, 60]);
        for (const z of this.zs) if (!z.boss && !z.dead && Math.hypot(z.x - tx, z.y - ty) < 140) this.damage(z, 40, { kx: (z.x - tx) * 4, ky: (z.y - ty) * 4 });
      }
    }
    b.roarT -= dt;
    if (b.roarT <= 0) {
      b.roarT = 6;
      // each roar calls a ring of small zombies out of the snow round it
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + rand(-0.2, 0.2), d = rand(70, 130); this.spawn(i % 3 ? 'runner' : 'walker', b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.8); }
      this.fx.label(b.x, b.y - 150, 'ROAR!', 30, '#ffffff', 1); this.fx.shake(0.35); sfx.boom(); b.roarA = 1;
    }
  }

  // ---------- crew ----------
  rateMul(c) {
    const cap = this.crewList().some((s) => s.crew.type === 'captain') ? 1.2 : 1;
    return this.mods.rate * cap * (this.odT > 0 ? 1.5 : 1);
  }
  // depot levels give +30% each; a level-up card in the run gives +50%, since there are fewer of them
  lvMul(type) { const inRun = (this.crewLv[type] || 1) - 1, depot = ((this.opts.crewLv || {})[type] || 1) - 1; return 1 + 0.3 * depot + 0.5 * inRun; }
  crewStep(dt) {
    const cap = this.crewList().find((s) => s.crew.type === 'captain' && !s.crew.drop);
    if (cap && this.state !== 'win' && this.state !== 'lose') {
      this.auraT = (this.auraT || 0) - dt;
      if (this.auraT <= 0) {
        this.auraT = 1.6;
        this.fx.ring(cap.x, cap.y + 4, 12, 70, 'rgba(255,210,63,.9)', 0.6, 5);
        for (const s of this.crewList()) if (s !== cap && !s.crew.drop) this.fx.chev(s.x, s.y - 34);
      }
    }
    for (const s of this.crewList()) {
      const c = s.crew;
      if (c.drop > 0) { c.drop = Math.max(0, c.drop - dt * 2.4); if (c.drop === 0) { this.fx.ring(s.x, s.y + 8, 6, 34, '#ffffff', 0.35, 4); this.fx.label(s.x, s.y - 34, 'NEW CREW!', 17, '#ffe066', 1.1); sfx.plow(); } continue; }
      c.recoil = Math.max(0, c.recoil - dt * 8);
      if (s.car.broken || this.state === 'win') continue;
      c.cd -= dt * this.rateMul(c);
      const tgt = this.target(s, c.range);
      if (tgt) c.flip = tgt.x > s.x + 4;
      const want = tgt ? Math.atan2(tgt.y - (s.y - 12), tgt.x - s.x) : c.idle + s.car.a;
      let da = want - c.aimA; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (c.sweepT > 0) c.sweepT -= dt; // the laser shot steers the arm while it sweeps
      else c.aimA += da * Math.min(1, dt * (tgt ? 14 : 4));
      if (c.cd <= 0) {
        if (tgt && !(c.sweepT > 0)) { const n0 = this.shots.length; this.src = s; this.fire(s, c, tgt); for (let k = n0; k < this.shots.length; k++) this.shots[k].src = s; c.cd += 1 / c.rate; if (c.cd < 0) c.cd = 0; }
        else c.cd = 0;
      }
    }
  }
  target(s, range) {
    let best = null, bd = Infinity;
    const R2 = range * range, near2 = R2 * 0.42; // other cars' attackers only inside ~65% of range
    for (const z of this.zs) {
      if (z.dead || z.air > 0 || z.idle && z.y < this.view().top) continue;
      const raw = (z.x - s.x) ** 2 + (z.y - s.y) ** 2;
      if (raw > R2) continue;
      // anything biting the train first, then a mild lean to zombies coming for this car; zombies
      // headed for another car only when they are close, so the crews further back keep their share
      // of the fight (a strong lean pulled the front crew off the engine and it got eaten)
      let d = raw;
      if (z.att) d *= z.att.car === s.car || z.att.car === this.cars[0] ? 0.25 : 0.45; // anything biting the train comes first, the engine most (it ends the run)
      else if (z.pref === s.car) d *= 0.7;
      else if (z.pref && !z.att) { if (raw > near2) continue; d *= 2.2; }
      if (z.boss) d *= 0.7;
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }
  // the gun tip of the paper-doll arm (see drawCrew)
  muzzle(s, c) {
    const r = this.rig(s, c), m = r.arm && r.arm.tip;
    if (!m) { const flip = c.flip ? 1 : -1; return { x: s.x + flip * 11, y: s.y - 22 }; }
    const lx = (m[0] - r.arm.piv[0]) * r.A, ly = (m[1] - r.arm.piv[1]) * r.Ah * (r.ca < 0 ? -1 : 1);
    return { x: r.px + lx * r.ca - ly * r.sa, y: r.py + lx * r.sa + ly * r.ca };
  }
  // paper-doll rig: torso view picked from the aim, arm + gun turns around the shoulder
  rig(s, c) {
    const T = 40, a = c.aimA, ca = Math.cos(a), sa = Math.sin(a);
    const view = sa > 0.5 ? 'f' : sa < -0.5 ? 'b' : 's';
    const body = art[`crew-${c.type}-${view}`], arm = art[`crew-${c.type}-arm`];
    const th = body ? T * body.h / body.w : T * 1.4;
    const A = T * 1.5, Ah = arm ? A * arm.h / arm.w : 0;
    const foot = s.y + 9;
    const px = s.x + (view === 's' ? ca * T * 0.06 : ca * T * 0.2), py = foot - th * 0.36;
    return { T, a, ca, sa, view, body, arm, th, A, Ah, foot, px, py };
  }
  fire(s, c, z) {
    const m = this.muzzle(s, c);
    const a = Math.atan2(z.y - m.y, z.x - m.x);
    const dmg = c.dmg * this.mods.dmg * this.lvMul(c.type);
    c.recoil = 1;
    sfx.shot(c.kind);
    if (c.kind === 'bullet') {
      const n = c.type === 'gunner' && (this.crewLv.gunner || 1) >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const aa = a + rand(-c.spread, c.spread) + (n > 1 ? (i - 0.5) * 0.12 : 0);
        this.shots.push({ kind: 'bullet', x: m.x, y: m.y, vx: Math.cos(aa) * c.speed, vy: Math.sin(aa) * c.speed, dmg, r: 4, life: c.range / c.speed + 0.15, t: 0, color: c.vfx, by: c.type });
      }
      if (has('fx-muzzle-orange')) { this.fx.spr(m.x, m.y, 'fx-muzzle-orange', c.type === 'captain' ? 26 : 30, { rot: a, ax: 0.12, life: 0.06, img: c.type === 'captain' ? tinted('fx-muzzle-orange', '#ffd23f', 0.45) : undefined }); }
      else { this.fx.flash(m.x + Math.cos(a) * 6, m.y + Math.sin(a) * 6, 11, c.vfx, 0.06); this.fx.star(m.x + Math.cos(a) * 5, m.y + Math.sin(a) * 5, 8, '#fff3a0', 0.07); }
      // brass casings fly out sideways
      if (c.type === 'gunner') this.fx.dot(s.x, s.y, -Math.sin(a) * rand(50, 100) * (Math.random() < 0.5 ? 1 : -1), Math.cos(a) * rand(40, 90), 2, '#e0b13a', 0.55, { vz: 90, g: 420, ink: '#6b4a12' });
    } else if (c.kind === 'pellet') {
      for (let i = 0; i < c.pellets; i++) { const aa = a + rand(-c.spread / 2, c.spread / 2), sp = c.speed * rand(0.85, 1.1); this.shots.push({ kind: 'pellet', x: m.x, y: m.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, dmg, r: 4, life: c.range / sp, t: 0, color: c.vfx, knock: c.knock, by: c.type }); }
      if (has('fx-muzzle-yellow')) this.fx.spr(m.x, m.y, 'fx-muzzle-yellow', 44, { rot: a, ax: 0.1, life: 0.08 });
      else this.fx.flash(m.x + Math.cos(a) * 8, m.y + Math.sin(a) * 8, 18, '#fff3a0', 0.07);
      for (let i = 0; i < 3; i++) this.fx.puff(m.x + Math.cos(a) * (12 + i * 6), m.y + Math.sin(a) * (12 + i * 6), 6 + i * 2, '#ffffff', 0.45, { vx: Math.cos(a) * 50 + rand(-15, 15), vy: Math.sin(a) * 50 + rand(-15, 15), grow: 1.9 });
    } else if (c.kind === 'rocket') {
      this.shots.push({ kind: 'rocket', x: m.x, y: m.y, vx: Math.cos(a) * c.speed * 0.5, vy: Math.sin(a) * c.speed * 0.5, sp: c.speed, dmg, r: 8, aoe: c.aoe, life: 1.6, t: 0, tgt: z, trail: 0, shock: c.vfx });
      this.fx.puff(m.x, m.y, 10, '#ffffff', 0.45);
      if (has('fx-muzzle-orange')) this.fx.spr(m.x, m.y, 'fx-muzzle-orange', 26, { rot: a, ax: 0.12, life: 0.07 });
      this.fx.puff(m.x - Math.cos(a) * 16, m.y - Math.sin(a) * 16, 8, '#ffffff', 0.4, { vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60 });
    } else if (c.kind === 'rail') {
      const ex = m.x + Math.cos(a) * c.range, ey = m.y + Math.sin(a) * c.range;
      const hits = [];
      for (const q of this.zs) {
        if (q.dead || q.air > 0) continue;
        const px = q.x - m.x, py = (q.y - 12) - m.y, along = px * Math.cos(a) + py * Math.sin(a);
        if (along < 0 || along > c.range) continue;
        const perp = Math.abs(-px * Math.sin(a) + py * Math.cos(a));
        if (perp < q.r + 6) hits.push([along, q]);
      }
      hits.sort((p, q) => p[0] - q[0]);
      hits.slice(0, c.pierce).forEach(([, q], i) => { this.damage(q, dmg * (1 - i * 0.12), { kx: Math.cos(a) * 160, ky: Math.sin(a) * 160, color: '#e0c3ff' }); this.fx.star(q.x, q.y - 14, 15, c.vfx, 0.26); });
      this.fx.beam(m.x, m.y, ex, ey, c.vfx, 6, 0.18, 'rgba(155,92,246,.35)');
      this.fx.flash(m.x, m.y, 14, '#e8d6ff', 0.08);
      this.fx.star(m.x, m.y, 10, c.vfx, 0.12);
    } else if (c.kind === 'flame') {
      for (let i = 0; i < 2; i++) { const aa = a + rand(-0.25, 0.25), sp = rand(240, 300); this.shots.push({ kind: 'flame', x: m.x, y: m.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, dmg, r: 6, life: c.range / sp, t: 0, hit: new Set(), burn: c.burn, ph: rand(0, 6) }); }
    } else if (c.kind === 'zap') {
      const pts = [[m.x, m.y]], hit = new Set();
      let cur = z, d = dmg;
      for (let i = 0; i < c.chain && cur; i++) {
        hit.add(cur);
        const last = pts[pts.length - 1], tx = cur.x, ty = cur.y - 14;
        for (let k = 1; k <= 3; k++) pts.push([last[0] + (tx - last[0]) * k / 4 + rand(-10, 10), last[1] + (ty - last[1]) * k / 4 + rand(-10, 10)]);
        pts.push([tx, ty]);
        this.damage(cur, d, { color: '#bff8ff' });
        this.fx.flash(tx, ty, 16, '#e6fdff', 0.1);
        this.fx.star(tx, ty, 13, c.vfx, 0.22);
        d *= 0.85;
        let nb = null, nd = 95 * 95;
        for (const q of this.zs) { if (q.dead || hit.has(q)) continue; const dd = (q.x - cur.x) ** 2 + (q.y - cur.y) ** 2; if (dd < nd) { nd = dd; nb = q; } }
        cur = nb;
      }
      this.fx.bolt(pts, c.vfx, 0.16, 'rgba(42,212,200,.35)');
      if (has('fx-muzzle-teal')) this.fx.spr(m.x, m.y, 'fx-muzzle-teal', 30, { rot: a, ax: 0.12, life: 0.09 });
      else this.fx.flash(m.x, m.y, 12, '#d6fffa', 0.08);
    } else if (c.kind === 'saw') {
      // a spinning blade that cuts through the crowd and bounces on to the next zombie
      this.shots.push({ kind: 'saw', x: m.x, y: m.y, vx: Math.cos(a) * c.speed, vy: Math.sin(a) * c.speed, sp: c.speed, dmg, r: 11, life: 0.9, t: 0, hit: new Set(), bounce: c.bounce, by: c.type });
      if (has('fx-sparks')) this.fx.spr(m.x, m.y, 'fx-sparks', 34, { rot: a, ax: 0.05, life: 0.1 });
      this.fx.shake(0.03);
    } else if (c.kind === 'mortar') {
      // lobbed high: lands where the target will be when the bomb comes down
      const T = 0.75 + Math.hypot(z.x - m.x, z.y - m.y) / 700;
      const ac = z.att && z.att.car, tx = z.x + (ac ? ac.fx * this.speed * T : (z.kx || 0) * 0.1), ty = z.y + (ac ? ac.fy * this.speed * T : 0);
      this.shots.push({ kind: 'mortar', x0: m.x, y0: m.y, x: m.x, y: m.y, tx, ty, T, t: 0, life: T, dmg, aoe: c.aoe, H: 70 + Math.hypot(tx - m.x, ty - m.y) * 0.35, trail: 0 });
      if (has('fx-muzzle-orange')) this.fx.spr(m.x, m.y, 'fx-muzzle-orange', 36, { rot: a, ax: 0.12, life: 0.09 });
      if (has('fx-puff')) for (let i = 0; i < 3; i++) this.fx.spr(m.x + rand(-6, 6), m.y + rand(-6, 6), 'fx-puff', rand(16, 24), { vx: Math.cos(a) * 40 + rand(-20, 20), vy: Math.sin(a) * 40 - 20, drag: 2, life: 0.7, grow: 1.8 });
      this.fx.shake(0.06);
    } else if (c.kind === 'laser') {
      // a beam that sweeps across the target, melting a line in the snow
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.shots.push({ kind: 'laser', seat: s, a0: a - dir * 0.34, a1: a + dir * 0.34, ang: a - dir * 0.34, t: 0, life: c.sweep, dmg, tick: 0, range: c.range, mx: m.x, my: m.y, ex: m.x, ey: m.y, mark: 0 });
      c.sweepT = c.sweep;
    } else if (c.kind === 'harpoon') {
      // skewers the first few zombies in a row and drags them away from the train
      this.shots.push({ kind: 'harpoon', seat: s, x: m.x, y: m.y, vx: Math.cos(a) * c.speed, vy: Math.sin(a) * c.speed, a, dmg, r: 9, t: 0, life: c.range / c.speed, pierce: c.pierce, held: [], phase: 0, pt: 0 });
      if (has('fx-muzzle-yellow')) this.fx.spr(m.x, m.y, 'fx-muzzle-yellow', 30, { rot: a, ax: 0.1, life: 0.07 });
      this.fx.shake(0.05);
    } else if (c.kind === 'ice') {
      this.shots.push({ kind: 'ice', x: m.x, y: m.y, vx: Math.cos(a) * c.speed, vy: Math.sin(a) * c.speed, dmg, r: 6, life: c.range / c.speed + 0.1, t: 0, slow: c.slow, a });
      if (has('fx-muzzle-ice')) this.fx.spr(m.x, m.y, 'fx-muzzle-ice', 30, { rot: a, ax: 0.12, life: 0.09 });
      for (let i = 0; i < 3; i++) this.fx.dot(m.x, m.y, Math.cos(a + rand(-0.5, 0.5)) * rand(60, 120), Math.sin(a + rand(-0.5, 0.5)) * rand(60, 120), 2, '#ffffff', 0.3, { ink: '#7fc8ee' });
    }
  }

  // ---------- zombies ----------
  zombieStep(dt) {
    const v = this.view(); this.src = null;
    const loco = this.cars[0];
    const pfx = loco.x + loco.fx * loco.l / 2, pfy = loco.y + loco.fy * loco.l / 2;
    const plowW = 46 * (1 + 0.25 * (this.mods.plow - 1)) * (this.odT > 0 ? 1.4 : 1);
    const plowD = 30 * this.mods.plow * (this.odT > 0 ? 3 : 1);
    // spatial grid for separation
    const grid = new Map(), C = 40;
    for (const z of this.zs) { if (z.dead || z.air > 0) continue; const key = Math.floor(z.x / C) + ',' + Math.floor(z.y / C); let b = grid.get(key); if (!b) grid.set(key, (b = [])); b.push(z); }
    this.grid = grid;
    for (let i = this.zs.length - 1; i >= 0; i--) {
      const z = this.zs[i];
      if (z.dead) { z.dying += dt; if (z.dying > (z.boss && z.rig ? 1.6 : 0.24)) this.zs.splice(i, 1); continue; }
      z.flash = Math.max(0, z.flash - dt);
      z.ph += dt * (z.type === 'runner' || (z.rush && z.pref && !z.att) ? 14 : 8);
      if (z.slowT > 0) z.slowT -= dt;
      if (z.burnT > 0) { z.burnT -= dt; z.acc += dt; if (z.acc > 0.25) { z.acc = 0; this.src = z.burnBy || null; this.damage(z, 6 * this.mods.dmg, { color: '#ffb35c', small: true }); if (Math.random() < 0.6) this.fx.puff(z.x + rand(-6, 6), z.y - 18, 5, '#ff9a3c', 0.35, { vy: -40, ink: 'rgba(0,0,0,0)' }); } if (z.dead) continue; }
      if (z.held) continue; // riding a harpoon
      // launched by the plow
      if (z.air > 0) {
        z.air -= dt; z.x += z.vx * dt; z.y += z.vy * dt; z.vh -= 900 * dt; z.h = Math.max(0, z.h + z.vh * dt); z.rot += z.vr * dt;
        if (z.air <= 0) { z.h = 0; z.rot = 0; z.vx = z.vy = 0; this.fx.puff(z.x, z.y, 10, '#ffffff', 0.4); }
        continue;
      }
      if (z.idle) { if (z.y > v.top - 40) { z.idle = false; this.fx.label(z.x, z.y - 40, '!', 22, '#ff4058', 0.6); } else continue; }
      const rushing = z.rush && z.pref && !z.att;
      const sp = (rushing ? Math.max(z.spd, this.speed * (z.heavy ? 1.25 : 1.5)) : z.spd) * (z.slowT > 0 ? 0.45 : 1);
      if (z.att) {
        const c = z.att.car;
        if (!this.cars.includes(c)) { z.att = null; continue; }
        z.x = c.x + c.fx * z.att.f - c.fy * z.att.s; z.y = c.y + c.fy * z.att.f + c.fx * z.att.s;
        z.bite = (z.bite || 0) + dt;
        if (z.bite > 0.5) { z.bite = 0; this.hurtCar(c, z.dps * 0.5); }
        continue;
      }
      if (z.boss) {
        // comes straight at the train as soon as it shows up: walks to a spot beside the engine, lunges in
        // for each stomp, and stays inside the arena round the loop
        const H = this.toF(this.loopC.x, this.loopC.y), loco = this.cars[0];
        let T, v;
        if (z.stagger > 0) { T = z; v = 0; }
        else if (z.tele) { const ex = z.tele.x - z.x, ey = z.tele.y - z.y, ed = Math.hypot(ex, ey) || 1, k = Math.max(0, ed - 55) / ed; T = { x: z.x + ex * k, y: z.y + ey * k }; v = 190; }
        else {
          // keeps to the open snow on the loop side of the engine, so trees and the train do not hide it
          const ox = H.x - loco.x, oy = H.y - loco.y, od = Math.hypot(ox, oy) || 1, off = Math.min(140, od * 0.8);
          T = { x: loco.x + ox / od * off, y: loco.y + oy / od * off };
          v = Math.hypot(z.x - loco.x, z.y - loco.y) > 320 ? 120 : 85;
        }
        const ox = T.x - H.x, oy = T.y - H.y, od = Math.hypot(ox, oy), lim = STAGE.loopR + 260;
        if (od > lim) T = { x: H.x + ox / od * lim, y: H.y + oy / od * lim };
        const dx = T.x - z.x, dy = T.y - z.y, d = Math.hypot(dx, dy);
        const mv = d > 2 ? Math.min(d, v * dt) : 0;
        if (mv) { z.x += dx / d * mv; z.y += dy / d * mv; }
        z.flip = (z.tele ? z.tele.x : this.cars[0].x) > z.x;
        this.bossRigStep(z, dt, mv / Math.max(dt, 1e-4));
        continue;
      }
      // walk to the chosen car's side (flankers) or the nearest car's side, aiming where it will be
      let best = null, bd = 1e9, bf = 0, bs = 0;
      if (z.pref && (!this.cars.includes(z.pref) || z.pref.broken || (z.x - z.pref.x) * z.pref.fx + (z.y - z.pref.y) * z.pref.fy < -(z.pref.l / 2 + 60))) z.pref = null;
      for (const c of (z.pref ? [z.pref] : this.cars)) {
        const px = z.x - c.x, py = z.y - c.y;
        const f = clamp(px * c.fx + py * c.fy, -c.l / 2 + 10, c.l / 2 - 10);
        const s = -px * c.fy + py * c.fx;
        const qx = c.x + c.fx * f, qy = c.y + c.fy * f;
        const d = (z.x - qx) ** 2 + (z.y - qy) ** 2;
        if (d < bd) { bd = d; best = c; bf = f; bs = s; }
      }
      const side = bs >= 0 ? 1 : -1;
      const want = side * (best.w / 2 + z.r * 0.6);
      const tx = best.x + best.fx * bf - best.fy * want, ty = best.y + best.fy * bf + best.fx * want;
      const dist = Math.hypot(tx - z.x, ty - z.y);
      // aim where the car will be when they get there: an exact intercept when faster than the
      // train (side rushers), otherwise a rough lead (walkers are slower than the train)
      // (the car moves along its own heading, which is not up the screen on a bend or round the loop)
      const ex = tx - z.x, ey = ty - z.y, S = this.speed;
      let lt = clamp(Math.abs(ex * best.fy - ey * best.fx) / sp, 0, 8);
      if (sp > S * 1.05) {
        const ev = (ex * best.fx + ey * best.fy) * S, A = sp * sp - S * S;
        lt = clamp((ev + Math.sqrt(ev * ev + A * (ex * ex + ey * ey))) / A, 0, 8);
      }
      let dx = ex + best.fx * S * lt, dy = ey + best.fy * S * lt; const dl = Math.hypot(dx, dy);
      // the plow: anything right in front of the engine gets smashed aside
      const ox = z.x - pfx, oy = z.y - pfy;
      const ahead = ox * loco.fx + oy * loco.fy, lat = -ox * loco.fy + oy * loco.fx;
      z.plowBlock = false;
      if (ahead > -14 && ahead < 26 && Math.abs(lat) < plowW && this.speed > 8) {
        if (z.heavy) {
          z.plowBlock = true; z.pt = (z.pt || 0) + dt;
          if (z.pt > 0.3) { z.pt = 0; this.damage(z, plowD * 1.2, { color: '#ffffff' }); this.fx.shake(0.15); sfx.plow(); for (let k = 0; k < 4; k++) { const o = rand(-20, 20); this.fx.spark(pfx - loco.fy * o, pfy + loco.fx * o, rand(-2.6, -0.5) + loco.a, rand(200, 400), 12, '#ffd23f'); } }
          z.x = pfx + loco.fx * 14 - loco.fy * lat; z.y = pfy + loco.fy * 14 + loco.fx * lat;
          continue;
        }
        this.damage(z, plowD, { color: '#ffffff' });
        if (!z.dead) { const s = lat >= 0 ? 1 : -1, out = s * rand(220, 320), fw = this.speed + rand(40, 120); z.air = 0.5; z.vx = -loco.fy * out + loco.fx * fw; z.vy = loco.fx * out + loco.fy * fw; z.vh = 300; z.vr = s * rand(8, 14); }
        else { z.air = 0; }
        this.fx.shake(0.08); sfx.plow();
        this.fx.puff(z.x, z.y, 12, '#ffffff', 0.4);
        continue;
      }
      if (dist < 9) {
        z.att = { car: best, f: bf + rand(-6, 6), s: want + rand(-3, 3) * side };
        this.fx.puff(z.x, z.y - 8, 7, '#ffffff', 0.3);
        continue;
      }
      dx /= dl || 1; dy /= dl || 1;
      // separation
      let sx = 0, sy = 0;
      const gx = Math.floor(z.x / C), gy = Math.floor(z.y / C);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const cell = grid.get((gx + a) + ',' + (gy + b));
        if (!cell) continue;
        for (const o of cell) { if (o === z) continue; const ex = z.x - o.x, ey = z.y - o.y, dd = ex * ex + ey * ey, rr = (z.r + o.r) * 0.9; if (dd < rr * rr && dd > 0.01) { const d = Math.sqrt(dd); sx += ex / d * (rr - d); sy += ey / d * (rr - d); } }
      }
      z.kx *= Math.max(0, 1 - dt * 7); z.ky *= Math.max(0, 1 - dt * 7);
      z.x += (dx * sp + z.kx) * dt + sx * 0.25; z.y += (dy * sp + z.ky) * dt + sy * 0.25;
      z.side = Math.abs(dx) > Math.abs(dy) * 1.1 ? true : Math.abs(dy) > Math.abs(dx) * 1.4 ? false : z.side;
      if (Math.abs(dx) > 0.2) z.flip = dx > 0;
      // fell behind the train: gone
      if (z.y > v.bot + 120) this.zs.splice(i, 1);
    }
  }
  hurtCar(c, dmg) {
    if (this.state === 'win' || this.state === 'lose') return;
    c.hp = Math.max(0, c.hp - dmg);
    // blink, do not glow: under a steady bite the wagon flashes every 0.4 s instead of staying white
    if (this.t - (c.hitAt ?? -9) > 0.55) { c.hitT = 0.12; c.hitAt = this.t; }
    sfx.hurt();
    if (c.hp <= 0) {
      if (c === this.cars[0]) this.lose();
      else if (!c.broken) { c.broken = true; this.fx.boom(c.x, c.y, 50); this.fx.shake(0.5); sfx.boom(true); this.fx.label(c.x, c.y - 30, 'WAGON DOWN!', 20, '#ff4058', 1.3); }
    }
  }

  damage(z, dmg, o = {}) {
    if (z.dead || (z.boss && this.state === 'lose')) return; // a wrecked train cannot still win
    let crit = false;
    if (!o.small && Math.random() < this.mods.crit) { dmg *= 2; crit = true; }
    // test hook: damage dealt per seat (only when a test switched it on)
    if (this.dps) { const S = this.src, key = S && S.car ? this.cars.indexOf(S.car) + '-' + S.crew.type : 'other'; this.dps[key] = (this.dps[key] || 0) + Math.max(0, Math.min(dmg, z.hp)); }
    z.hp -= dmg;
    // big targets get hit by the whole train at once: blink at most every 0.3 s (a faint one on the boss)
    // instead of staying lit white the whole fight
    if (z.boss || z.heavy) { if (this.t - (z.flashAt ?? -9) > 0.3) { z.flash = 0.09; z.flashAt = this.t; } }
    else z.flash = 0.09;
    if (z.boss) this.bossHit(z, dmg, crit);
    if (!z.heavy && o.kx !== undefined) { z.kx += o.kx; z.ky += o.ky; }
    // beam ticks add up into one number per zombie instead of a stream of small ones
    if (o.acc) { z.acc = (z.acc || 0) + dmg; if (this.t - z.numT > 0.35 || z.hp <= 0) { z.numT = this.t; this.fx.num(z.x, z.y - 30 * (z.scale || 1) - (z.boss ? 90 : 0), Math.round(z.acc), { color: o.color }); z.acc = 0; } }
    else if (crit || this.t - z.numT > (o.small ? 0.4 : 0.11) || dmg >= 30) {
      if (crit && dmg >= 40) this.hitstop = Math.max(this.hitstop || 0, 0.02); z.numT = this.t; this.fx.num(z.x, z.y - 30 * (z.scale || 1) - (z.boss ? 90 : 0), Math.round(dmg), { crit, color: crit ? '#ffd23f' : o.color }); }
    sfx.hit();
    if (z.hp <= 0) this.kill(z);
  }
  // the yeti feels each hit: a punch that squashes it and shoves it away from the shooter, sparks with fur and
  // ice chips flying off the side that was hit, and a stagger each time it loses another quarter of its health
  bossHit(z, dmg, crit) {
    z.hitK = Math.min(1, (z.hitK || 0) + dmg / 90);
    if (dmg >= 30 || crit) z.recoil = Math.min(1, (z.recoil || 0) + 0.5);
    z.punch = Math.min(1, (z.punch || 0) + 0.3 + dmg / 100);
    const S = this.src && this.src.car ? this.src.car : this.cars[0];
    const bodyY = z.y - z.h - 62, ex = z.x - S.x, ey = bodyY - S.y, ed = Math.hypot(ex, ey) || 1;
    z.kickX = ex / ed; z.kickY = ey / ed;
    if (this.t - (z.fxAt ?? -9) > 0.05) {
      z.fxAt = this.t;
      const hx = z.x - z.kickX * 32 + rand(-12, 12), hy = bodyY - z.kickY * 22 + rand(-24, 20), back = Math.atan2(-z.kickY, -z.kickX);
      this.fx.spr(hx, hy, 'fx-hit', 38 + Math.min(30, dmg * 0.8), { life: 0.11, rot: rand(0, 6.3), grow: 1.35 });
      for (let i = 0; i < 3; i++) { const a = back + rand(-1, 1), sp = rand(90, 190); this.fx.dot(hx, hy, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, rand(3.6, 5.2), '#ffffff', rand(0.4, 0.6), { z: 4, vz: rand(60, 140), g: 420, ink: 'rgba(0,0,0,0)' }); }
      if (Math.random() < 0.5 || dmg >= 30 || crit) { const a = back + rand(-0.8, 0.8), sp = rand(150, 240); this.fx.spr(hx, hy, 'fx-shard', rand(16, 24), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: a, vr: rand(-12, 12), life: 0.42, grow: 0.7, drag: 2 }); }
    }
    // cracks at 3/4, 1/2 and 1/4 health
    const cracks = Math.min(3, Math.floor((1 - Math.max(0, z.hp) / z.max) * 4));
    if (z.hp > 0 && cracks > (z.cracks || 0)) {
      z.cracks = cracks; z.stagger = 1.2; z.tele = null; z.slam = 0; z.atkT = Math.max(z.atkT || 0, 1.4);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + rand(-0.2, 0.2), sp = rand(170, 280); this.fx.spr(z.x, bodyY, 'fx-shard', rand(16, 24), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, rot: a, vr: rand(-10, 10), life: 0.6, grow: 0.7, drag: 1.6 }); }
      this.fx.ring(z.x, bodyY, 20, 120, '#d9f3ff', 0.4, 6);
      this.fx.label(z.x, bodyY - 70, 'CRACK!', 26, '#bfe9ff', 1.0, { ink: '#1d3a66' });
      this.fx.shake(0.35); this.hitstop = Math.max(this.hitstop || 0, 0.07); sfx.boom(false); buzz(30);
    }
  }
  kill(z) {
    z.dead = true; z.dying = 0; z.att = null; z.plowBlock = false;
    if (z.boss) { this.bossDown(z); return; }
    this.kills++; this.combo++; this.comboT = 1.6; this.bestCombo = Math.max(this.bestCombo, this.combo);
    // several kills at once (a bomb, a laser sweep) get a callout where they happened
    this.kq = (this.kq || []).filter((t) => this.t - t < 0.25); this.kq.push(this.t);
    if (this.kq.length >= 5 && this.t - (this.multiT ?? -9) > 0.9) { this.multiT = this.t; this.fx.label(z.x, z.y - 46, `MULTI KILL x${this.kq.length}!`, 20, '#ffd23f', 1.0, { ink: '#7a3a00' }); this.fx.shake(0.08); }
    this.od = Math.min(1, this.od + (z.heavy ? 0.12 : 1 / 40));
    sfx.pop(this.combo);
    const sz = 30 * (z.scale || 1);
    this.fx.pop(z.x, z.y, sz, { big: z.heavy });
    if (z.heavy) { this.fx.shake(0.3); this.hitstop = 0.05; buzz(25); }
    const xp = z.xp * this.mods.xp;
    for (let i = 0; i < Math.min(4, Math.ceil(xp / 3)); i++) this.drop('xp', z.x, z.y, xp / Math.min(4, Math.ceil(xp / 3)));
    if (Math.random() < z.coin) for (let i = 0; i < (z.heavy ? 6 : 1); i++) this.drop('coin', z.x, z.y, 1);
    if (z.boom) {
      this.fx.boom(z.x, z.y, z.boom.r * 0.6); sfx.boom(); this.fx.shake(0.25);
      for (const q of this.zs) if (!q.dead && q !== z && Math.hypot(q.x - z.x, q.y - z.y) < z.boom.r) this.damage(q, z.boom.dmg, { kx: (q.x - z.x) * 5, ky: (q.y - z.y) * 5, color: '#ffb35c' });
      for (const c of this.cars) if (Math.hypot(c.x - z.x, c.y - z.y) < c.l / 2 + z.boom.r * 0.6) this.hurtCar(c, 14);
    }
  }
  bossDown(z) {
    this.kills++;
    this.slow = 0.25; this.slowT = 1.1;
    this.fx.shake(1); sfx.boom(true); buzz([40, 40, 80]);
    for (let i = 0; i < 7; i++) setTimeout(() => { this.fx.boom(z.x + rand(-70, 70), z.y - rand(0, 120), rand(40, 70)); sfx.boom(i % 2 === 0); }, i * 140);
    this.fx.pop(z.x, z.y, 90, { big: true });
    for (let i = 0; i < 24; i++) this.drop('coin', z.x + rand(-30, 30), z.y - rand(0, 60), 1);
    this.hooks.onBossDown && this.hooks.onBossDown();
    this.state = 'win'; this.endT = 0;
  }
  lose() {
    if (this.state === 'lose') return;
    this.state = 'lose'; this.endT = 0;
    const c = this.cars[0];
    this.slow = 0.3; this.slowT = 1.2;
    this.fx.boom(c.x, c.y, 80); this.fx.shake(1); sfx.boom(true); buzz([60, 40, 120]);
    for (let i = 0; i < 4; i++) setTimeout(() => this.fx.boom(c.x + rand(-40, 40), c.y + rand(-80, 80), 50), 200 + i * 160);
  }
  revive() {
    for (const c of this.cars) { c.hp = c.max * 0.6; c.broken = false; }
    for (const z of this.zs) if (!z.boss && !z.dead && Math.hypot(z.x - this.cars[0].x, z.y - this.cars[0].y) < 400) this.damage(z, 9999, {});
    this.fx.ring(this.cars[0].x, this.cars[0].y, 30, 420, '#ffffff', 0.6, 12);
    this.state = this.boss && !this.boss.dead ? 'boss' : 'run'; this.result = null;
  }
  endStep(dt) {
    if (this.state !== 'win' && this.state !== 'lose') return;
    this.endT += dt / Math.max(0.25, this.slow);
    if (!this.result && this.endT > (this.state === 'win' ? 3.4 : 2.2)) {
      const hp = this.cars[0].hp / this.cars[0].max;
      this.result = { win: this.state === 'win', kills: this.kills, coins: this.coins, lv: this.lv, time: this.t, stars: this.state === 'win' ? (hp > 0.66 ? 3 : hp > 0.33 ? 2 : 1) : 0, prog: clamp(this.D / STAGE.length, 0, 1), bestCombo: this.bestCombo };
      this.hooks.onEnd && this.hooks.onEnd(this.result);
    }
  }

  // ---------- shots ----------
  shotStep(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      this.src = s.src || null;
      s.t += dt;
      if (s.kind === 'mortar' || s.kind === 'laser' || s.kind === 'harpoon') { if (this.specialStep(s, dt)) this.shots.splice(i, 1); continue; }
      if (s.kind === 'saw') {
        s.spin = (s.spin || 0) + dt * 28;
        if (Math.random() < 0.5) this.fx.dot(s.x, s.y, rand(-60, 60), rand(-60, 60), 1.6, '#ffd23f', 0.2);
      }
      if (s.kind === 'rocket') {
        if (s.tgt && !s.tgt.dead) { const a = Math.atan2(s.tgt.y - 12 - s.y, s.tgt.x - s.x), cur = Math.atan2(s.vy, s.vx); let da = a - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; const na = cur + clamp(da, -6 * dt, 6 * dt), sp = Math.min(s.sp, Math.hypot(s.vx, s.vy) + 900 * dt); s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp; }
        s.trail -= dt; if (s.trail <= 0) { s.trail = 0.025; this.fx.puff(s.x, s.y, 5, '#f4f6fa', 0.45, { grow: 2.2 }); }
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      let dead = s.t >= s.life;
      const hitR = s.r + (s.kind === 'flame' ? s.t * 30 : 0);
      if (!dead) {
        for (const z of this.near(s.x, s.y + 12)) {
          if (z.dead || z.air > 0 || (s.hit && s.hit.has(z))) continue;
          const dx = z.x - s.x, dy = (z.y - 12 * (z.scale || 1)) - s.y, rr = z.r * (z.boss ? 2.2 : 1) + hitR;
          if (dx * dx + dy * dy > rr * rr) continue;
          if (s.kind === 'flame') { s.hit.add(z); this.damage(z, s.dmg, { color: '#ffb35c', small: true }); z.burnT = 2; z.burnBy = s.src; continue; }
          if (s.kind === 'saw') { this.sawHit(s, z); break; }
          const sp = Math.hypot(s.vx, s.vy) || 1;
          if (s.kind === 'rocket') { dead = true; break; }
          this.damage(z, s.dmg, { kx: s.vx / sp * (s.knock || 30), ky: s.vy / sp * (s.knock || 30), color: s.kind === 'ice' ? '#bfeaff' : undefined });
          if (s.kind === 'ice') {
            z.slowT = 2.2;
            for (let k = 0; k < 5; k++) this.fx.dot(s.x, s.y, rand(-90, 90), rand(-90, 90), 2.6, '#e6f8ff', 0.4, { ink: '#5fb6e6' });
            this.fx.ring(z.x, z.y, 6, 30, 'rgba(191,234,255,.95)', 0.45, 3.5);
            this.fx.star(s.x, s.y, 10, '#e6f8ff', 0.25);
            if (has('fx-snow-splash')) this.fx.spr(z.x, z.y - 10, 'fx-snow-splash', 30, { life: 0.3, grow: 1.4 });
          } else {
            this.fx.spark(s.x, s.y, Math.atan2(s.vy, s.vx) + Math.PI + rand(-0.6, 0.6), rand(80, 160), 6, s.color || '#fff3a0', 0.12, 2);
            if (s.kind === 'bullet' || Math.random() < 0.4) this.fx.star(s.x, s.y, s.kind === 'bullet' ? 9 : 7, s.color || '#fff3a0', 0.12);
          }
          dead = true; break;
        }
      }
      if (dead) {
        if (s.kind === 'rocket') {
          this.fx.boom(s.x, s.y, s.aoe * 0.62, { shock: s.shock }); sfx.boom(); this.fx.shake(0.12);
          for (const z of this.zs) if (!z.dead && Math.hypot(z.x - s.x, z.y - 10 - s.y) < s.aoe + z.r) this.damage(z, s.dmg, { kx: (z.x - s.x) * 4, ky: (z.y - s.y) * 4, color: '#ffd23f' });
        }
        // the flamer leaves short-lived burning puddles behind
        if (s.kind === 'flame' && Math.random() < 0.08) this.fx.decal(s.x, s.y + 10, rand(9, 14), 'burn');
        this.shots.splice(i, 1);
      }
    }
  }
  // saw blade: cut, then bounce to the closest zombie it has not cut yet
  sawHit(s, z) {
    s.hit.add(z);
    this.damage(z, s.dmg, { kx: s.vx / s.sp * 40, ky: s.vy / s.sp * 40, color: '#ffb84a' });
    if (has('fx-sparks')) for (let k = 0; k < 2; k++) this.fx.spr(z.x, z.y - 12, 'fx-sparks', rand(26, 36), { rot: Math.atan2(s.vy, s.vx) + Math.PI + rand(-0.9, 0.9), ax: 0.05, life: 0.14, grow: 1.3 });
    for (let k = 0; k < 4; k++) this.fx.spark(z.x, z.y - 12, rand(0, Math.PI * 2), rand(120, 220), 7, '#ffd23f', 0.16, 2);
    sfx.shot('saw');
    let best = null, bd = 170;
    for (const q of this.near(z.x, z.y)) { if (q.dead || q.air > 0 || s.hit.has(q)) continue; const d = Math.hypot(q.x - z.x, q.y - z.y); if (d < bd) { bd = d; best = q; } }
    if (best && s.bounce > 0) {
      s.bounce--; s.life = s.t + 0.6;
      const a = Math.atan2(best.y - 12 - s.y, best.x - s.x); s.vx = Math.cos(a) * s.sp; s.vy = Math.sin(a) * s.sp;
    } else if (s.bounce <= 0) s.life = s.t + 0.12;
  }
  // mortar bomb, laser sweep and harpoon: return true when the shot is finished
  specialStep(s, dt) {
    if (s.kind === 'mortar') {
      const k = Math.min(1, s.t / s.T), h = 4 * s.H * k * (1 - k);
      s.x = s.x0 + (s.tx - s.x0) * k; s.y = s.y0 + (s.ty - s.y0) * k;
      s.trail -= dt;
      if (s.trail <= 0) { s.trail = 0.04; if (has('fx-fuse')) this.fx.spr(s.x, s.y - h, 'fx-fuse', 14, { rot: rand(0, 6.3), life: 0.22, grow: 0.5 }); this.fx.puff(s.x, s.y - h, 4, '#d8dde6', 0.5, { grow: 2.4 }); }
      if (k < 1) return false;
      const x = s.tx, y = s.ty, R = s.aoe;
      this.fx.decal(x, y, R * 1.3, 'glow'); // ground light: drawn under the train so it never washes the wagons out
      if (has('fx-blast')) this.fx.spr(x, y - 8, 'fx-blast', R * 1.7, { life: 0.26, grow: 1.4 });
      this.fx.boom(x, y, R * 0.55, { shock: 'rgba(255,210,63,.9)', noDecal: true });
      if (has('fx-shrapnel')) for (let i = 0; i < 6; i++) { const a = rand(0, Math.PI * 2), sp = rand(160, 300); this.fx.spr(x, y, 'fx-shrapnel', rand(12, 18), { rot: a, vr: rand(-12, 12), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, drag: 4, life: 0.5, grow: 0.8 }); }
      if (has('fx-puff')) for (let i = 0; i < 4; i++) { const a = rand(0, Math.PI * 2); this.fx.spr(x + Math.cos(a) * R * 0.3, y + Math.sin(a) * R * 0.2, 'fx-puff', R * rand(0.45, 0.65), { vx: Math.cos(a) * 50, vy: -40, drag: 1.5, life: rand(0.9, 1.3), grow: 1.7 }); }
      for (let i = 0; i < 8; i++) this.fx.dot(x, y, rand(-220, 220), rand(-160, 160), rand(2.5, 4.5), '#ffffff', 0.6, { vz: rand(120, 260), g: 520, ink: '#9fb3cc' });
      this.fx.decal(x, y, R * 0.55, 'crater');
      for (const z of this.zs) {
        if (z.dead || z.air > 0) continue;
        const d = Math.hypot(z.x - x, z.y - 10 - y);
        if (d < R + z.r) this.damage(z, s.dmg * (d < R * 0.5 ? 1 : 0.7), { kx: (z.x - x) / (d || 1) * 120, ky: (z.y - y) / (d || 1) * 120, color: '#ffd23f' });
      }
      sfx.boom(true); this.fx.shake(0.32); this.hitstop = Math.max(this.hitstop || 0, 0.035); buzz(20);
      return true;
    }
    if (s.kind === 'laser') {
      const seat = s.seat, c = seat.crew;
      if (!c || c !== seat.crew) return true;
      const k = Math.min(1, s.t / s.life), e = k * k * (3 - 2 * k);
      s.ang = s.a0 + (s.a1 - s.a0) * e; c.aimA = s.ang;
      const m = this.muzzle(seat, c); s.mx = m.x; s.my = m.y;
      // the beam stops at the first heavy zombie or the boss, everything lighter gets cut through
      let L = s.range;
      const ux = Math.cos(s.ang), uy = Math.sin(s.ang);
      const inBeam = [];
      for (const z of this.zs) {
        if (z.dead || z.air > 0) continue;
        const px = z.x - m.x, py = z.y - 12 - m.y, along = px * ux + py * uy;
        if (along < 0 || along > L) continue;
        const R = z.r * (z.boss ? 2.2 : 1) + 6;
        if (Math.abs(px * uy - py * ux) < R) { inBeam.push([along, z]); if (z.heavy || z.boss) L = Math.min(L, along); }
      }
      s.ex = m.x + ux * L; s.ey = m.y + uy * L;
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.06;
        for (const [along, z] of inBeam) if (along <= L + 1) {
          this.damage(z, s.dmg, { kx: ux * 6, ky: uy * 6, color: '#ff8ad8', small: true, acc: true });
          if (has('fx-laser-hit') && Math.random() < 0.5) this.fx.spr(z.x, z.y - 12, 'fx-laser-hit', 26, { rot: rand(0, 6.3), life: 0.1 });
        }
        if (Math.random() < 0.6) this.fx.dot(s.ex, s.ey, rand(-90, 90), rand(-90, 90), 2, '#ff8ad8', 0.25);
        sfx.shot('laser');
      }
      s.mark -= dt;
      if (s.mark <= 0) { s.mark = 0.05; this.fx.decal(s.ex, s.ey + 6, 9, 'laser', s.ang + Math.PI / 2); }
      return s.t >= s.life;
    }
    if (s.kind === 'harpoon') {
      const seat = s.seat;
      if (s.phase === 0) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        for (const z of this.near(s.x, s.y + 12)) {
          if (z.dead || z.air > 0 || z.held || s.held.includes(z)) continue;
          if (Math.hypot(z.x - s.x, z.y - 12 - s.y) > z.r * (z.boss ? 2.2 : 1) + s.r) continue;
          this.damage(z, s.dmg, { color: '#ffe14a' });
          this.fx.spark(s.x, s.y, s.a + Math.PI + rand(-0.6, 0.6), rand(100, 180), 7, '#ffe14a', 0.14, 2);
          if (has('fx-hit')) this.fx.spr(s.x, s.y, 'fx-hit', 26, { life: 0.1 });
          if (z.heavy || z.boss || s.held.length >= s.pierce) { s.phase = 1; s.pt = 0; this.fx.shake(0.08); break; }
          if (!z.dead) { z.held = s; s.held.push(z); }
        }
        if (s.t >= s.life) { s.phase = 1; s.pt = 0; }
        // skewered zombies ride just behind the tip
        s.held.forEach((z, i) => { if (z.dead) return; z.x = s.x - Math.cos(s.a) * (8 + i * 12); z.y = s.y + 12 - Math.sin(s.a) * (8 + i * 12); });
        return false;
      }
      if (s.phase === 1) {
        // the yank: the rope snaps tight and throws the catch outward
        s.phase = 2; s.pt = 0;
        for (const z of s.held) {
          z.held = null; if (z.dead) continue;
          this.damage(z, s.dmg * 0.6, { kx: Math.cos(s.a) * 260, ky: Math.sin(s.a) * 260, color: '#ffe14a' });
          this.fx.puff(z.x, z.y, 10, '#f4f6fa', 0.5, { grow: 2 });
        }
        if (s.held.length) { this.fx.shake(0.1); sfx.shot('harpoon'); }
        s.held = [];
        return false;
      }
      // reel back to the gun
      s.pt += dt;
      const m = this.muzzle(seat, seat.crew || {});
      const k = Math.min(1, s.pt / 0.25);
      s.x += (m.x - s.x) * k; s.y += (m.y - s.y) * k;
      return k >= 1 || !seat.crew;
    }
    return true;
  }
  near(x, y) {
    const C = 40, out = [];
    const gx = Math.floor(x / C), gy = Math.floor(y / C);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const cell = this.grid && this.grid.get((gx + a) + ',' + (gy + b)); if (cell) for (const z of cell) out.push(z); }
    if (this.boss && !this.boss.dead && !out.includes(this.boss)) out.push(this.boss);
    return out;
  }

  // ---------- drops ----------
  drop(kind, x, y, val) {
    const a = rand(0, Math.PI * 2), sp = rand(30, 110);
    this.drops.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0, vz: rand(120, 220), val, t: 0, fly: false, sp: 0 });
  }
  dropStep(dt) {
    const R = 150 * this.mods.magnet;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      if (!d.fly) {
        d.vz -= 700 * dt; d.z = Math.max(0, d.z + d.vz * dt); if (d.z === 0) d.vz = Math.abs(d.vz) * 0.35;
        d.vx *= Math.max(0, 1 - dt * 3); d.vy *= Math.max(0, 1 - dt * 3);
        d.x += d.vx * dt; d.y += d.vy * dt;
      }
      // nearest car
      let best = this.cars[0], bd = 1e9;
      for (const c of this.cars) { const dd = (c.x - d.x) ** 2 + (c.y - d.y) ** 2; if (dd < bd) { bd = dd; best = c; } }
      if (!d.fly && d.t > 0.35 && (bd < R * R || d.t > 1.4)) d.fly = true;
      if (d.fly) {
        d.sp += 1600 * dt;
        const dx = best.x - d.x, dy = best.y - d.y, dist = Math.hypot(dx, dy);
        const step = (d.sp + this.speed) * dt;
        if (dist < 20 || step >= dist) { this.collect(d, best); this.drops.splice(i, 1); continue; }
        d.x += dx / dist * step; d.y += dy / dist * step; d.z *= 0.9;
      }
    }
  }
  collect(d, car) {
    if (d.kind === 'xp') { sfx.xp(); this.addXp(d.val); this.fx.flash(car.x, car.y, 20, 'rgba(160,255,140,.6)', 0.1); }
    else { sfx.coin(); this.coins += d.val; const p = this.toScreen(car.x, car.y); this.hooks.onCoinFly && this.hooks.onCoinFly(p.x, p.y); }
  }
  addXp(v) {
    this.xp += v;
    while (this.xp >= XP_NEED(this.lv)) { this.xp -= XP_NEED(this.lv); this.lv++; this.pending++; }
    if (this.pending > 0 && !this.pause.has('card') && this.state !== 'win' && this.state !== 'lose') this.levelUp();
  }
  levelUp(rare = false, title = 'LEVEL UP!') {
    if (!rare) this.pending--;
    this.pause.add('card');
    sfx.levelup(); buzz([15, 30, 15]);
    for (const c of this.cars) this.fx.ring(c.x, c.y, 20, 140, '#a6ff7d', 0.5, 6);
    this.hooks.onLevelUp(this.choices(rare), rare, title, (card) => {
      this.apply(card, rare);
      this.pause.delete('card');
      if (this.pending > 0) setTimeout(() => { if (!this.pause.has('card')) this.levelUp(); }, 350);
    });
  }
  choices(rare) {
    const pool = [];
    const empty = this.emptySeats().length;
    const present = new Set(this.crewList().map((s) => s.crew.type));
    if (empty) for (const c of CARDS.filter((c) => c.kind === 'crew')) pool.push([c, present.has(c.crew) ? 0.6 : ['saw', 'mortar', 'laser', 'harpoon'].includes(c.crew) ? 3.4 : 2.2]);
    for (const t of present) { const lv = this.crewLv[t] || 1; if (lv < 5) pool.push([{ id: 'lv-' + t, kind: 'lv', crew: t, title: CREW[t].name, text: `Level ${lv} → ${lv + 1}\n` + (t === 'gunner' && lv === 2 ? 'Twin barrels!' : '+50% damage'), lv }, 1.6]); }
    for (const c of CARDS.filter((c) => c.kind === 'up')) pool.push([c, 1]);
    if (this.cars.length < 4) pool.push([CARDS.find((c) => c.id === 'u-wagon'), empty ? 0.5 : 3]);
    for (const c of CARDS.filter((c) => c.kind === 'train' && c.id !== 'u-wagon')) pool.push([c, 1]);
    const group = (c) => (c.kind === 'crew' || c.kind === 'lv' ? 'g' : c.kind === 'train' ? 'o' : 'b');
    const out = [];
    for (const want of ['g', 'b', 'o']) {
      const sub = pool.filter((p) => group(p[0]) === want);
      if (!sub.length) continue;
      const tot = sub.reduce((s, p) => s + p[1], 0); let r = Math.random() * tot, i = 0;
      for (; i < sub.length; i++) if ((r -= sub[i][1]) < 0) break;
      const pk = sub[Math.min(i, sub.length - 1)];
      out.push(pk[0]); pool.splice(pool.indexOf(pk), 1);
    }
    while (out.length < 3 && pool.length) {
      const tot = pool.reduce((s, p) => s + p[1], 0); let r = Math.random() * tot, i = 0;
      for (; i < pool.length; i++) if ((r -= pool[i][1]) < 0) break;
      const [c] = pool.splice(Math.min(i, pool.length - 1), 1)[0];
      if (!out.some((o) => o.kind === 'crew' && c.kind === 'crew' && out.filter((x) => x.kind === 'crew').length >= empty)) out.push(c);
    }
    return out.sort((a, b) => 'gbo'.indexOf(group(a)) - 'gbo'.indexOf(group(b)));
  }
  apply(card, rare = false) {
    const boost = rare ? 1.5 : 1;
    sfx.pick();
    if (card.kind === 'crew') {
      const seat = this.emptySeats()[0];
      if (seat) this.putCrew(card.crew, seat);
    } else if (card.kind === 'lv') {
      this.crewLv[card.crew] = (this.crewLv[card.crew] || 1) + (rare ? 2 : 1);
      for (const s of this.crewList()) if (s.crew.type === card.crew) { this.fx.ring(s.x, s.y, 6, 40, '#ffe066', 0.4, 4); this.fx.label(s.x, s.y - 36, 'LV UP!', 16, '#ffe066'); }
    } else if (card.id === 'u-wagon') {
      const c = this.addCar('wagon'); this.layout(0); sfx.horn(); this.fx.shake(0.2);
      this.hooks.onBanner && this.hooks.onBanner('NEW WAGON!', 'green');
      void c;
    } else {
      if (card.id === 'u-rate') this.mods.rate *= 1 + 0.4 * boost;
      if (card.id === 'u-dmg') this.mods.dmg *= 1 + 0.5 * boost;
      if (card.id === 'u-plow') this.mods.plow += 1 * boost;
      if (card.id === 'u-magnet') this.mods.magnet *= 1 + 0.5 * boost;
      if (card.id === 'u-crit') this.mods.crit += 0.15 * boost;
      if (card.id === 'u-armor') for (const c of this.cars) {
        c.max *= 1 + 0.6 * boost; c.hp = Math.min(c.max, c.hp + c.max * 0.6 * boost); c.broken = false;
        // armour plates bolt on: each wagon steps up one look (wood, steel, spiked)
        if (c.tiers && c.tier < 2) { c.tier++; c.spr = c.tiers[c.tier]; this.fx.puff(c.x, c.y, 30, '#ffffff', 0.5); for (let k = 0; k < 6; k++) this.fx.spark(c.x, c.y, rand(0, 6.3), rand(120, 220), 10, '#ffd23f'); }
      }
      for (const c of this.cars) this.fx.ring(c.x, c.y, 20, 110, '#ffe066', 0.45, 5);
    }
  }

  useOverdrive() {
    if (this.od < 1 || this.paused || this.state !== 'run' && this.state !== 'boss') return false;
    this.od = 0; this.odT = 5;
    sfx.horn(); sfx.overdrive(); this.fx.shake(0.4); buzz([20, 20, 40]);
    const c = this.cars[0];
    this.fx.ring(c.x, c.y - c.l / 2, 20, 260, '#ffb21c', 0.6, 10);
    for (const z of this.zs) if (!z.dead && !z.boss && Math.hypot(z.x - c.x, z.y - c.y) < 220) this.damage(z, 30, { kx: (z.x - c.x) * 6, ky: (z.y - c.y) * 6 });
    return true;
  }

  crateStep() {
    const loco = this.cars[0];
    const pfx = loco.x + loco.fx * loco.l / 2, pfy = loco.y + loco.fy * loco.l / 2;
    for (const c of this.crates) {
      if (c.hp <= 0 || c.deco) continue;
      const ox = c.x - pfx, oy = c.y - pfy, ah = ox * loco.fx + oy * loco.fy;
      if (Math.abs(-ox * loco.fy + oy * loco.fx) < 40 && ah < 12 && ah > -30) {
        c.hp = 0;
        this.fx.shake(0.18); sfx.plow();
        for (let i = 0; i < 9; i++) { const a = rand(0, Math.PI * 2); this.fx.dot(c.x, c.y, Math.cos(a) * rand(80, 200), Math.sin(a) * rand(60, 160), rand(3, 6), i % 2 ? '#b07a45' : '#7c5230', 0.7, { vz: rand(100, 250), g: 600, ink: '#1d2440' }); }
        this.fx.puff(c.x, c.y, 18, '#ffffff', 0.4);
        if (c.kind === 'crates') { for (let i = 0; i < 4; i++) this.drop('coin', c.x, c.y, 1); this.fx.label(c.x, c.y - 30, '+4', 20, '#ffd23f'); }
        if (c.kind === 'armory') { this.fx.ring(c.x, c.y, 10, 120, '#c69bff', 0.5, 8); setTimeout(() => this.levelUp(true, 'ARMORY CRATE!'), 250); }
      }
    }
  }

  trainFx(dt) {
    const loco = this.cars[0];
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.state !== 'lose') {
      this.smokeT = this.speed > 30 ? 0.07 : 0.16;
      const cx = loco.x + loco.fx * loco.l * 0.25, cy = loco.y + loco.fy * loco.l * 0.25;
      this.fx.puff(cx + rand(-3, 3), cy, rand(5, 8), '#f2f4f8', 0.75, { vx: rand(-18, 18), vy: rand(-10, 10), grow: 2.2, drag: 1 });
    }
    this.sprayT -= dt;
    if (this.sprayT <= 0 && this.speed > 20) {
      this.sprayT = 0.03;
      const px = loco.x + loco.fx * (loco.l / 2 - 6), py = loco.y + loco.fy * (loco.l / 2 - 6), rx = -loco.fy, ry = loco.fx;
      for (const s of [-1, 1]) { const o = s * rand(80, 170), b = rand(-40, 20); this.fx.dot(px + rx * s * 30, py + ry * s * 30, rx * o + loco.fx * b, ry * o + loco.fy * b, rand(2, 4), '#ffffff', 0.4, { vz: rand(40, 120), g: 400, ink: 'rgba(150,170,200,.6)' }); }
    }
    for (const c of this.cars) if (c.broken && Math.random() < 0.3) this.fx.puff(c.x + rand(-20, 20), c.y + rand(-30, 30), rand(6, 10), '#59606e', 0.9, { vy: -20, grow: 2, ink: 'rgba(0,0,0,.2)' });
  }

  // ---------- drawing ----------
  render() {
    const g = this.g, cv = this.cv, dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); this.vig = null; }
    const v = this.view();
    const k = v.k;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#eaf1f8'; g.fillRect(0, 0, cw, ch);
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cw / 2 - this.cam.x * k + this.fx.sx), dpr * (ch * this.cam.fy - this.cam.y * k + this.fx.sy));
    // ground
    // ground: tiles fixed to the world, so through a turn the snow visibly swings round the train
    const T = art.ground ? 520 : 400;
    {
      const q = [this.toW(v.left, v.top), this.toW(v.right, v.top), this.toW(v.left, v.bot), this.toW(v.right, v.bot)];
      const x0 = Math.min(...q.map((p) => p.x)), x1 = Math.max(...q.map((p) => p.x)), y0 = Math.min(...q.map((p) => p.y)), y1 = Math.max(...q.map((p) => p.y));
      g.save(); g.rotate(-this.th);
      for (let ty = Math.floor(y0 / T) * T; ty < y1; ty += T) for (let tx = Math.floor(x0 / T) * T; tx < x1; tx += T) g.drawImage(this.ground, tx, ty, T + 0.5, T + 0.5);
      g.restore();
    }
    this.fx.drawDecals(g);
    this.drawTrack(g, v);
    // ground drops
    for (const d of this.drops) {
      g.fillStyle = 'rgba(40,60,100,.18)'; g.beginPath(); g.ellipse(d.x, d.y, 7, 3.5, 0, 0, Math.PI * 2); g.fill();
      const bob = d.fly ? 0 : Math.sin(this.t * 6 + d.x) * 2;
      sprite(g, d.kind === 'xp' ? 'xp' : 'coin', d.x, d.y - d.z - 2 + bob, d.kind === 'xp' ? 11 : 14);
    }
    // ground marks for shots in the air: mortar shadow and landing ring
    for (const s of this.shots) if (s.kind === 'mortar') this.drawShot(g, s, true);
    // (no code-drawn box shadow under the cars: the car art carries its own shading)
    // train
    for (let i = this.cars.length - 1; i >= 0; i--) this.drawCar(g, this.cars[i], i);
    // y-sorted world things
    const list = [];
    for (const p of this.propsInView(v)) list.push([p.y, 0, p]);
    for (const c of this.crates) if (c.y > v.top - 80 && c.y < v.bot + 80 && (c.hp > 0 || c.deco)) list.push([c.y, 1, c]);
    for (const s of this.signs) if (s.y > v.top - 120 && s.y < v.bot + 60) list.push([s.y, 2, s]);
    // zombies thrown by the plow fly over the roof, so they draw after the crew
    const flying = [];
    for (const z of this.zs) if (z.y > v.top - 160 && z.y < v.bot + 60) { if (z.air > 0 || z.held) flying.push(z); else list.push([z.y, 3, z]); }
    // crew stand on the roof: a ground thing has to be ROOF px nearer the camera to cover them
    const ROOF = 30;
    for (const s of this.crewList()) list.push([s.y + 9 + ROOF, 4, s]);
    list.sort((a, b) => a[0] - b[0]);
    for (const [, kind, o] of list) {
      if (kind === 0) this.drawProp(g, o);
      else if (kind === 1) this.drawCrate(g, o);
      else if (kind === 2) this.drawSign(g, o);
      else if (kind === 4) this.drawCrew(g, o);
      else this.drawZombie(g, o);
    }
    flying.sort((a, b) => a.y - b.y);
    for (const z of flying) this.drawZombie(g, z);
    if (this.boss && this.boss.tele) { const b = this.boss.tele, kk = Math.min(1, b.t); g.strokeStyle = `rgba(255,64,88,${0.5 + 0.5 * Math.sin(this.t * 20)})`; g.lineWidth = 4; g.fillStyle = 'rgba(255,64,88,.18)'; g.beginPath(); g.ellipse(b.x, b.y, 84 * kk, 62 * kk, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    this.drawCarBars(g);
    // shots
    for (const s of this.shots) this.drawShot(g, s);
    this.fx.draw(g);
    // screen space: snow, speed lines, vignette
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawWeather(g, cw, ch, k);
    this.drawVignette(g, cw, ch);
  }

  drawTrack(g, v) {
    const step = 22, span = v.Hv + v.Wv;
    const lo = Math.max(-3000, this.D - this.trainLen() - span * 0.7), hi = this.D + span * 0.9;
    const top = this.loopD + this.loopLen, wrap = (d) => d > top ? this.loopD + ((d - this.loopD) % this.loopLen) : d;
    const ds = new Set(), add = (a, b) => { for (let d = Math.floor(a / step) * step; d <= b; d += step) ds.add(Math.round(wrap(d) / step) * step); };
    add(lo, hi);
    if (hi > this.loopD - 300) add(this.loopD - 900, top); // the whole ring is in view during the boss fight
    const order = [...ds].sort((a, b) => a - b);
    const inView = (p) => p.x > v.left - 60 && p.x < v.right + 60 && p.y > v.top - 60 && p.y < v.bot + 60;
    const pt = (d, side) => { const w = this.wpt(d, side), f = this.toF(w.x, w.y); return inView(f) ? [f.x, f.y, w.a - this.th, d] : null; };
    const all = [];
    const shown = this.junctions.filter((j) => j.shown);
    all.push({ j: null, pts: order.map((d) => shown.some((q) => d > q.d0 && d < q.d1) ? null : pt(d, 0)) });
    for (const j of shown) for (const side of [-1, 1]) {
      const pts = order.filter((d) => d > j.d0 - step && d < j.d1 + step).map((d) => pt(d, side));
      if (pts.length) all.push({ j, s: side, pts });
    }
    const tile = art['w-track-v'];
    if (tile) {
      // one tile = TILE_SLEEPERS sleepers; each sample point draws one sleeper-long slice, turned to the curve
      // (on a bend the slice is stretched so the outside edge has no gaps)
      const per = step * TILE_SLEEPERS, sh = tile.h / TILE_SLEEPERS;
      for (const o of all) {
        const faded = o.j && o.j.choice && o.j.choice !== o.s && this.D > o.j.d0;
        g.globalAlpha = faded ? 0.5 : 1;
        for (const p of o.pts) {
          if (!p) continue;
          const k = Math.round((((-p[3]) % per + per) % per) / step) % TILE_SLEEPERS;
          const h = step * (1 + this.curvAt(p[3]) * TRACK_W / 2);
          g.save(); g.translate(p[0], p[1]); g.rotate(p[2]);
          g.drawImage(tile.img, 0, k * sh, tile.w, sh, -TRACK_W / 2, -h / 2 - 0.6, TRACK_W, h + 1.2);
          g.restore();
        }
        g.globalAlpha = 1;
      }
    }
    // bed
    if (!tile) for (const o of all) {
      const faded = o.j && o.j.choice && o.j.choice !== o.s && this.D > o.j.d0;
      g.globalAlpha = faded ? 0.55 : 1;
      g.strokeStyle = '#cfd8e2'; g.lineWidth = 64; g.lineCap = 'round'; g.lineJoin = 'round';
      this.path(g, o.pts); g.stroke();
      g.strokeStyle = '#bcc7d3'; g.lineWidth = 50; this.path(g, o.pts); g.stroke();
      for (const p of o.pts) {
        if (!p) continue;
        g.save(); g.translate(p[0], p[1]); g.rotate(p[2]);
        g.fillStyle = '#1d2440'; g.fillRect(-31, -5.5, 62, 11);
        g.fillStyle = '#9a6a43'; g.fillRect(-29.5, -4, 59, 8);
        g.fillStyle = '#b8845a'; g.fillRect(-29.5, -4, 59, 2.5);
        g.restore();
      }
      for (const off of [-17, 17]) {
        const pts = o.pts.map((p) => p && [p[0] + Math.cos(p[2]) * off, p[1] + Math.sin(p[2]) * off]);
        g.strokeStyle = '#1d2440'; g.lineWidth = 6.5; this.path(g, pts); g.stroke();
        g.strokeStyle = '#8693a3'; g.lineWidth = 4; this.path(g, pts); g.stroke();
      }
      g.globalAlpha = 1;
    }
    const near = (p, m = 60) => p.x > v.left - m && p.x < v.right + m && p.y > v.top - m && p.y < v.bot + m;
    // switch lever and route arrows at each split
    for (const j of shown) {
      const L = this.fpt(j.d0 - 22, 50);
      if (!near(L)) continue;
      if (has('w-lever')) { sprite(g, 'w-lever', L.x, L.y, 40, { flip: j.lever > 0.05, rot: j.lever * 0.25 }); continue; }
      g.save(); this.trackFrame(g, j.d0 - 10); g.translate(TRACK + 44, -j.d0 + 10);
      g.fillStyle = '#1d2440'; roundRect(g, -10, -6, 20, 12, 4); g.fill();
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(j.lever * 16, -20); g.stroke();
      g.restore();
      if (!j.choice) for (const s of [-1, 1]) {
        const p = this.branchPoint(j, s, 0.22), pulse = 1 + Math.sin(this.t * 8) * 0.12;
        g.save(); g.translate(p.x, p.y); g.rotate(s * 0.5 + this.pathAt(p.d).a - this.th); g.scale(pulse, pulse);
        g.fillStyle = '#ffffff'; g.strokeStyle = '#1d2440'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, -18); g.lineTo(14, 2); g.lineTo(5, 2); g.lineTo(5, 16); g.lineTo(-5, 16); g.lineTo(-5, 2); g.lineTo(-14, 2); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
    }
    // checkpoint flags across the track
    for (const n of this.nodes) {
      const p = this.fpt(n.d - 6);
      if (!near(p) || n.done) continue;
      if (has('w-flags')) { sprite(g, 'w-flags', p.x, p.y, 200); continue; }
      g.save(); this.trackFrame(g, n.d);
      const y = -n.d, cols = ['#ff4058', '#ffd23f', '#3d8bff', '#5cd636'];
      g.strokeStyle = '#1d2440'; g.lineWidth = 2;
      for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9, x = 118 + 164 * t, yy = y - 40 + 18 * 4 * t * (1 - t); g.fillStyle = cols[i % 4]; g.beginPath(); g.moveTo(x - 7, yy); g.lineTo(x + 7, yy); g.lineTo(x, yy + 14); g.closePath(); g.fill(); g.stroke(); }
      g.restore();
    }
  }
  // how sharply the main line bends at d (1 / radius)
  curvAt(d) { let q = this.segs[0]; for (const o of this.segs) { if (d >= o.d0) q = o; else break; } return Math.abs(q.k); }
  // draw in the old straight-line coordinates (x = TRACK on the rails, y = -d) at a point of the route
  trackFrame(g, d) { const w = this.wpt(d, 0), f = this.toF(w.x, w.y); g.translate(f.x, f.y); g.rotate(w.a - this.th); g.translate(-TRACK, d); }
  path(g, pts) {
    g.beginPath(); let pen = false;
    for (const p of pts) { if (!p) { pen = false; continue; } if (!pen) { g.moveTo(p[0], p[1]); pen = true; } else g.lineTo(p[0], p[1]); }
  }
  drawCar(g, c, i) {
    g.save();
    g.translate(c.x, c.y + c.join * 140);
    g.rotate(c.a);
    if (c.join > 0) g.globalAlpha = 1 - c.join * 0.6;
    const shake = c.hitT > 0 ? Math.sin(this.t * 90) * 1.5 : 0;
    const drawn = sprite(g, c.spr, shake + c.dx * c.sw, 0, c.sw, { anchor: 'center', flash: c.hitT > 0 ? c.hitT * 2.5 : 0 });
    if (!drawn) carStandIn(g, c.type, c.w * 0.82, c.l);
    if (c.broken) { g.fillStyle = 'rgba(30,30,40,.35)'; roundRect(g, -c.w * 0.4, -c.l / 2, c.w * 0.8, c.l, 10); g.fill(); }
    if (i === 0 && this.state !== 'lose' && has('fx-headlight')) {
      g.globalAlpha = 0.75 + 0.15 * Math.sin(this.t * 10);
      fxs(g, 'fx-headlight', 0, -c.l / 2 - 96, 124); // art: lamp at the bottom, beam going up
      g.globalAlpha = 1;
    } else if (i === 0 && this.state !== 'lose') {
      // headlight cone
      g.globalAlpha = 0.18 + 0.05 * Math.sin(this.t * 10);
      const gr = g.createLinearGradient(0, -c.l / 2, 0, -c.l / 2 - 120);
      gr.addColorStop(0, '#fff6c8'); gr.addColorStop(1, 'rgba(255,246,200,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-14, -c.l / 2 + 8); g.lineTo(14, -c.l / 2 + 8); g.lineTo(60, -c.l / 2 - 120); g.lineTo(-60, -c.l / 2 - 120); g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    if (this.odT > 0 && has('fx-halo')) { g.globalAlpha = 0.55 + 0.25 * Math.sin(this.t * 30); fxs(g, 'fx-halo', 0, 0, c.w * 2.2, { h: c.l * 1.35 }); g.globalAlpha = 1; }
    else if (this.odT > 0 && i === 0) { g.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 30); g.strokeStyle = '#ffb21c'; g.lineWidth = 6; roundRect(g, -c.w / 2 + 4, -c.l / 2 - 4, c.w - 8, c.l + 8, 18); g.stroke(); g.globalAlpha = 1; }
    g.restore();
  }
  drawCarBars(g) {
    for (const c of this.cars) {
      if (c.join > 0 || c.hp >= c.max) continue;
      const h = c.l * 0.62, x = -c.w / 2 - 12, y = -h / 2;
      const k = c.hp / c.max;
      g.save(); g.translate(c.x, c.y); g.rotate(c.a);
      if (hpBar(g, x + 0.5, y + h / 2, h + 4, 12, k, k > 0.5 ? 'ui-fill-green' : k > 0.25 ? 'ui-fill-yellow' : 'ui-fill-red', true)) { g.restore(); continue; }
      g.fillStyle = '#1d2440'; roundRect(g, x - 4, y - 2, 9, h + 4, 4.5); g.fill();
      g.fillStyle = '#3a4466'; roundRect(g, x - 2.5, y, 6, h, 3); g.fill();
      const col = k > 0.5 ? '#7ee04a' : k > 0.25 ? '#ffc23a' : '#ff4058';
      g.fillStyle = col; roundRect(g, x - 2.5, y + h * (1 - k), 6, Math.max(3, h * k), 3); g.fill();
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x - 1.5, y + h * (1 - k) + 2, 1.5, Math.max(0, h * k - 4));
      g.restore();
    }
  }
  drawCrew(g, s) {
    const c = s.crew;
    const r = this.rig(s, c);
    if (r.body && r.arm) {
      const drop = c.drop > 0 ? c.drop : 0, lift = drop * 220;
      const bob = Math.sin(this.t * 7 + c.bob) * 0.8;
      g.fillStyle = 'rgba(29,36,64,.28)'; g.beginPath(); g.ellipse(s.x, r.foot, 14 * (1 - drop * 0.5), 5, 0, 0, Math.PI * 2); g.fill();
      const kick = c.recoil * 4;
      const drawArm = () => {
        g.save();
        g.translate(r.px - r.ca * kick, r.py + bob - lift - r.sa * kick);
        g.rotate(r.a);
        if (r.ca < 0) g.scale(1, -1);
        g.drawImage(r.arm.img, -r.arm.piv[0] * r.A, -r.arm.piv[1] * r.Ah, r.A, r.Ah);
        g.restore();
      };
      // aiming away from the camera: the arm goes behind the back
      if (r.view === 'b') drawArm();
      const sq = drop > 0 ? 1 : 1 + c.recoil * 0.04;
      sprite(g, `crew-${c.type}-${r.view}`, s.x, r.foot + bob - lift, r.T, { flip: r.view === 's' && r.ca < 0, sx: sq, sy: 1 / sq });
      if (r.view !== 'b') drawArm();
      return;
    }
    const size = 40;
    const drop = c.drop > 0 ? c.drop : 0;
    const bob = Math.sin(this.t * 7 + c.bob) * 0.8;
    const rx = c.recoil * (c.flip ? -2.5 : 2.5), ry = c.recoil * 2.5;
    g.fillStyle = 'rgba(29,36,64,.25)'; g.beginPath(); g.ellipse(s.x, s.y + 14, 13 * (1 - drop * 0.5), 5, 0, 0, Math.PI * 2); g.fill();
    const sq = drop > 0 ? 1 : 1 + c.recoil * 0.05;
    const ok = sprite(g, CREW[c.type].icon, s.x + rx, s.y + 16 + bob + ry - drop * 220, size, { flip: c.flip, sy: 1 / sq, sx: sq });
    if (!ok) crewStandIn(g, CREW[c.type].color, s.x, s.y - drop * 220, size);
  }
  // ---------- boss paper doll: generated yeti parts layered and turned at the neck, shoulders and hips ----------
  bossRigStep(z, dt, speed) {
    if (!has('z-yeti-torso-f')) return;
    const r = z.rig || (z.rig = { view: 'f', want: 'f', hold: 0, walk: 0, mv: 0 });
    // face the stomp target, else the engine; front / side / back by where it is, held 0.2 s so it does not flicker
    const tg = z.tele || this.cars[0];
    const dx = tg.x - z.x, dy = tg.y - z.y;
    const want = Math.abs(dx) > Math.abs(dy) * 0.9 ? 's' : dy > 0 ? 'f' : 'b';
    if (want !== r.want) { r.want = want; r.hold = 0; }
    r.hold += dt;
    if (r.want !== r.view && r.hold > 0.2) { r.view = r.want; r.turn = 0.18; }
    r.side = dx > 0 ? 1 : -1;
    if (r.turn > 0) r.turn -= dt;
    r.mv += (Math.min(1, speed / 60) - r.mv) * Math.min(1, dt * 8);
    r.walk += dt * (3 + 9 * r.mv);
    z.hitK = Math.max(0, (z.hitK || 0) - dt * 3);
    z.recoil = Math.max(0, (z.recoil || 0) - dt * 5);
    z.punch = Math.max(0, (z.punch || 0) - dt * 7);
    if (z.slam > 0) z.slam = Math.max(0, z.slam - dt);
    if (z.roarA > 0) z.roarA = Math.max(0, z.roarA - dt * 0.9);
  }
  drawBoss(g, z) {
    const r = z.rig, P = YETI[r.view];
    const k = z.dead ? clamp(z.dying / 1.6, 0, 1) : 0;
    const t = this.t, U = YETI.unit; // world units per source pixel
    const flash = z.dead ? 0 : z.flash > 0 ? 0.2 * z.flash / 0.09 : 0, ice = z.slowT > 0;
    const part = (n, x, y, rot, o = {}) => { const a = art[n]; if (!a) return; sprite(g, n, x, y, a.srcH * U * (o.s || 1), { byH: true, px: o.px ?? 0.5, py: o.py ?? 0.5, rot, flip: o.flip, sx: o.sx, sy: o.sy, flash, ice }); };
    // poses, 0..1 each
    // (a dead boss drops whatever pose it was in)
    const live = z.dead ? 0 : 1;
    const tele = z.tele ? clamp(z.tele.t / 1.1, 0, 1) * live : 0;   // arms up before the stomp
    const slam = z.slam > 0 ? z.slam / 0.35 * live : 0;             // arms down, body squashed
    const roar = z.roarA > 0 ? Math.min(1, z.roarA * 3) * Math.min(1, z.roarA * 1.4) * live : 0;
    const ease = (v) => v * v * (3 - 2 * v);
    const stg = z.stagger > 0 ? Math.min(1, (1.2 - z.stagger) / 0.12) * Math.min(1, z.stagger / 0.35) * live : 0; // reels back, sags
    const pun = (z.punch || 0) * live;
    const up = ease(tele) * (1 - slam);
    const breath = Math.sin(t * 2.4), step = Math.sin(r.walk);
    const flip = r.view === 's' && r.side < 0;
    const fs = flip ? -1 : 1;
    // body sway: walking bob, hit wobble, recoil lean, roar shake
    const wob = Math.sin(t * 55) * z.hitK * 2.2 * live + (roar ? Math.sin(t * 70) * 1.6 * roar : 0) + Math.sin(t * 32) * 3 * stg;
    const lean = -0.06 * up + 0.1 * slam * fs - 0.05 * (z.recoil || 0) * live * fs + (r.view === 's' ? 0.04 * r.mv * fs : 0) - 0.16 * stg * fs;
    const sq = 1 + 0.1 * slam - 0.03 * up + 0.08 * pun + 0.06 * stg, sqy = 1 / sq * (1 + 0.012 * breath);
    const gx = z.x + (z.kickX || 0) * pun * 5, gy = z.y - z.h + (z.kickY || 0) * pun * 3;
    const lg = art[P.leg], legH = (1 - P.legPivot) * lg.srcH * P.legS * U;
    const bob = -Math.abs(step) * 3 * r.mv + 4 * slam + 9 * stg;
    // shadow
    if (!z.dead || k < 0.6) { g.fillStyle = `rgba(40,60,100,${0.22 * (1 - k)})`; g.beginPath(); g.ellipse(gx, gy + 2, 52 + 10 * slam, 17, 0, 0, Math.PI * 2); g.fill(); }
    g.save();
    if (z.dead) g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    // death: the parts come apart (head pops off, arms drop, body sinks)
    const fall = z.dead ? ease(Math.min(1, k * 1.6)) : 0;
    const tw = art[P.torso], Tw = tw.srcW * U, Th = tw.srcH * U;
    const hipY = gy - legH * 0.97 + bob + fall * legH * 0.7;
    const cx = gx + wob;
    // joints follow the torso's lean (it turns round the hips)
    const lc = Math.cos(lean), ls = Math.sin(lean), hy = hipY + fall * 8;
    const J = (j) => { const lx = (j[0] - 0.5) * Tw * fs * sq, ly = (j[1] - P.hipY) * Th * sqy; return { x: cx + lx * lc - ly * ls, y: hy + lx * ls + ly * lc }; };
    // legs
    const legs = P.hips.map((h, i) => {
      const j = J(h), ph = i ? Math.PI : 0, s1 = Math.sin(r.walk + ph);
      const lift = Math.max(0, s1) * 7 * r.mv + (r.turn > 0 ? Math.sin(r.turn / 0.18 * Math.PI) * 6 * (i ? 1 : 0.4) : 0);
      return () => part(P.leg, j.x + (r.view === 's' ? s1 * 6 * r.mv * fs : 0), j.y - lift + fall * 10, (r.view === 's' ? s1 * 0.35 * r.mv : s1 * 0.08 * r.mv) * fs + (i ? -1 : 1) * fall * 0.6, { s: P.legS, px: P.legPx, py: P.legPivot, flip: r.view === 's' ? flip : i === 1 });
    });
    // arms: 0 = hanging; positive swings the hand out to the left of the picture
    const armA = (i) => {
      const out = i === 0 ? 1 : -1;
      let a = out * (0.1 + 0.05 * breath) + step * 0.18 * r.mv * (i ? 1 : -1);
      a += out * up * 2.55 + out * roar * 1.1;               // overhead for the stomp, spread wide to roar
      a -= out * slam * 0.4;
      a += out * stg * (0.6 + 0.15 * Math.sin(t * 20 + i));         // arms flung out while it reels
      if (r.view === 's') a = (i ? -1 : 1) * step * 0.3 * r.mv - up * 2.6 * fs + slam * 0.9 * fs + roar * -1.2 * fs + stg * (i ? 0.9 : -0.5) * fs;
      return a + out * fall * 1.4;
    };
    const arms = P.sh.map((h, i) => {
      const j = J(h), a = armA(i), af = r.view === 's' ? flip : false, cap = P.arm[i].replace('arm', 'cap');
      // the arm turns under a shoulder cap that only leans a little, so the joint stays covered
      return () => {
        part(P.arm[i], j.x, j.y + fall * 26, a, { s: P.armS, px: 0.5, py: P.armPivot, flip: af });
        if (YETI.caps && (!z.dead || fall < 0.3)) part(cap, j.x, j.y + fall * 26, a * 0.18 + lean, { s: P.armS, px: 0.5, py: P.armPivot / CAP, flip: af });
      };
    });
    const head = () => {
      const j = J(P.neck), hn = (roar > 0.25 || tele > 0.45) ? P.roar : P.head;
      const tilt = -0.08 * up * fs - 0.12 * roar + Math.sin(t * 1.7) * 0.03 + (z.recoil || 0) * -0.08 * fs - 0.2 * stg * fs;
      part(hn, j.x + Math.sin(t * 2.4 + 0.6) * 0.8, j.y + breath * 0.8 - fall * 60 + fall * fall * 80, tilt + fall * 1.8 * fs, { s: P.headS, px: P.neckPx, py: P.neckPivot, flip });
    };
    const torso = () => part(P.torso, cx, hipY + fall * 8, lean, { px: 0.5, py: P.hipY, flip, sx: sq, sy: sqy });
    if (r.view === 's') { arms[1](); legs[1](); legs[0](); torso(); head(); arms[0](); }
    else if (r.view === 'b') { legs.forEach((f) => f()); torso(); head(); arms.forEach((f) => f()); }
    else { legs.forEach((f) => f()); torso(); arms.forEach((f) => f()); head(); }
    if (this.dbgRig) { g.globalAlpha = 1; for (const j of [P.neck, ...P.sh, ...P.hips]) { const q = J(j); g.fillStyle = '#ff2040'; g.beginPath(); g.arc(q.x, q.y, 2.2, 0, 7); g.fill(); } }
    g.restore();
  }
  drawZombie(g, z) {
    if (z.boss && z.rig) { this.drawBoss(g, z); return; }
    const H = 44 * (z.scale || 1) * (z.boss ? 3.1 : 1), sz = H * 0.78;
    const side = (z.att || z.side) && has(z.sprite + '-s');
    const k = z.dead ? z.dying / 0.24 : 0;
    const walk = z.att ? Math.sin(this.t * 22 + z.ph) * 0.12 : Math.sin(z.ph) * 0.09;
    const sx = z.dead ? 1 + k * 0.6 : 1 + Math.abs(Math.sin(z.ph)) * 0.04, sy = z.dead ? 1 - k * 0.7 : 1 - Math.abs(Math.sin(z.ph)) * 0.04;
    if (!z.dead) { g.fillStyle = 'rgba(40,60,100,.2)'; g.beginPath(); g.ellipse(z.x, z.y + 1, sz * 0.32, sz * 0.12, 0, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = z.dead ? 1 - k : 1;
    // new art faces right, so mirror when walking left
    const o = { flip: !z.flip, rot: z.rot + walk, sx, sy, flash: z.dead ? 1 : z.flash > 0 ? 1 : 0, ice: z.slowT > 0, byH: true };
    if (z.boss && z.slam > 0) { z.slam -= 1 / 60; o.sy *= 0.85; o.sx *= 1.12; }
    // hit squash: a quick wide-and-short wobble on every hit so each shot visibly lands
    if (!z.dead && z.flash > 0) { const q = z.flash / 0.09; o.sx *= 1 + 0.16 * q; o.sy *= 1 - 0.13 * q; }
    if (!sprite(g, side ? z.sprite + '-s' : z.sprite, z.x, z.y - z.h, H, o)) zombieStandIn(g, z.sprite, z.x, z.y - z.h, sz, o);
    g.globalAlpha = 1;
    if ((z.mini || z.heavy && z.type !== 'shield') && !z.dead && !z.boss && z.hp < z.max) {
      const w = 40, y = z.y - H * 1.05;
      if (!hpBar(g, z.x, y + 2.5, w + 4, 10, z.hp / z.max, 'ui-fill-red')) {
        g.fillStyle = '#1d2440'; roundRect(g, z.x - w / 2 - 2, y - 2, w + 4, 9, 4); g.fill();
        g.fillStyle = '#ff4058'; roundRect(g, z.x - w / 2, y, w * Math.max(0, z.hp / z.max), 5, 2.5); g.fill();
      }
    }
    if (z.burnT > 0 && !z.dead && has('fx-flame-orange')) fxs(g, 'fx-flame-orange', z.x + Math.sin(this.t * 20) * 3, z.y - H * 0.75, 16 + Math.sin(this.t * 17) * 3, { rot: this.t * 3 });
    else if (z.burnT > 0 && !z.dead) { g.globalAlpha = 0.8; g.fillStyle = '#ff8a1f'; g.beginPath(); g.arc(z.x + Math.sin(this.t * 20) * 3, z.y - H * 0.75, 5, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  }
  drawShot(g, s, ground = false) {
    if (s.kind === 'saw' && has('fx-saw')) {
      const a = Math.atan2(s.vy, s.vx);
      g.globalAlpha = 0.3; fxs(g, 'fx-saw', s.x - Math.cos(a) * 9, s.y - Math.sin(a) * 9, 22, { rot: s.spin - 0.6 }); g.globalAlpha = 1;
      fxs(g, 'fx-saw', s.x, s.y, 24, { rot: s.spin });
      return;
    }
    if (s.kind === 'mortar') {
      const k = s.t / s.T, h = 4 * s.H * k * (1 - k);
      if (ground) {
        // the shadow on the ground grows as the bomb comes down
        g.fillStyle = `rgba(29,36,64,${0.12 + 0.25 * k})`; g.beginPath(); g.ellipse(s.x, s.y, 7 + 8 * k, 3 + 3.5 * k, 0, 0, Math.PI * 2); g.fill();
        if (k > 0.45 && has('fx-ring-gold')) { g.globalAlpha = Math.min(0.85, (k - 0.45) * 2); fxs(g, 'fx-ring-gold', s.tx, s.ty, s.aoe * (1.9 - k * 0.6), { h: s.aoe * (1.9 - k * 0.6) * 0.5, rot: 0 }); g.globalAlpha = 1; }
        return;
      }
      const vy = (s.ty - s.y0) / s.T - 4 * s.H * (1 - 2 * k) / s.T, vx = (s.tx - s.x0) / s.T;
      fxs(g, 'fx-bomb', s.x, s.y - h, 22 * (1 + h / 260), { rot: Math.atan2(vy, vx) });
      return;
    }
    if (s.kind === 'laser') {
      const L = Math.hypot(s.ex - s.mx, s.ey - s.my), fl = 1 + Math.sin(this.t * 60) * 0.12;
      g.globalAlpha = 0.45; fxs(g, 'fx-laser', s.mx, s.my, L, { rot: s.ang, ax: 0, h: 30 * fl }); g.globalAlpha = 1;
      fxs(g, 'fx-laser', s.mx, s.my, L, { rot: s.ang, ax: 0, h: 15 * fl });
      fxs(g, 'fx-muzzle-pink', s.mx, s.my, 26 * fl, { rot: s.ang, ax: 0.1 });
      fxs(g, 'fx-laser-hit', s.ex, s.ey, 34 * fl, { rot: this.t * 9 });
      return;
    }
    if (s.kind === 'harpoon') {
      const m = this.muzzle(s.seat, s.seat.crew), a = s.a;
      const tx = s.x - Math.cos(a) * 15, ty = s.y - Math.sin(a) * 15, L = Math.hypot(tx - m.x, ty - m.y);
      if (L > 4) fxs(g, 'fx-rope', m.x, m.y, L, { rot: Math.atan2(ty - m.y, tx - m.x), ax: 0, h: s.phase === 1 ? 6 : 5 });
      fxs(g, 'fx-harpoon', s.x, s.y, 36, { rot: s.phase === 2 ? a : a, ax: 0.72 });
      return;
    }
    const a = Math.atan2(s.vy, s.vx);
    const art1 = SHOT_ART[s.kind];
    if (art1 && has(art1)) {
      if (s.kind === 'bullet' || s.kind === 'pellet') {
        const L = s.kind === 'pellet' ? 18 : s.by === 'captain' ? 30 : 26;
        fxs(g, art1, s.x, s.y, L, { rot: a, ax: 0.9, h: s.kind === 'pellet' ? 8 : 11, img: s.by === 'captain' ? tinted(art1, '#ffd23f', 0.45) : undefined });
      } else if (s.kind === 'rocket') fxs(g, art1, s.x, s.y, 30, { rot: a, ax: 0.62 });
      else if (s.kind === 'ice') fxs(g, art1, s.x, s.y, 24, { rot: a + SHARD_ROT });
      else if (s.kind === 'flame') {
        const k = s.t / s.life, r = 6 + k * 16, wob = Math.sin(this.t * 30 + s.ph) * 2;
        const n = k < 0.3 ? 'fx-flame-green' : k < 0.75 ? 'fx-flame-orange' : 'fx-smoke-dark';
        fxs(g, n, s.x, s.y + wob, r * 2.6, { rot: s.ph, alpha: k < 0.75 ? 1 : (1 - k) / 0.25 * 0.8 });
      }
      return;
    }
    if (s.kind === 'bullet' || s.kind === 'pellet') {
      // tracer: soft glow, colour streak, white-hot head
      const L = s.kind === 'pellet' ? 11 : s.by === 'captain' ? 20 : 16, ex = s.x - Math.cos(a) * L, ey = s.y - Math.sin(a) * L;
      g.lineCap = 'round';
      g.globalAlpha = 0.35; g.strokeStyle = s.color; g.lineWidth = 9;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(ex, ey); g.stroke();
      g.globalAlpha = 1; g.strokeStyle = s.color; g.lineWidth = 4;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = '#fffbe6'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - Math.cos(a) * L * 0.45, s.y - Math.sin(a) * L * 0.45); g.stroke();
    } else if (s.kind === 'rocket') {
      g.save(); g.translate(s.x, s.y); g.rotate(a);
      g.fillStyle = '#ff9a2e'; g.beginPath(); g.arc(-13, 0, 5 + Math.random() * 2.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(-12, 0, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1d2440'; roundRect(g, -11, -5, 22, 10, 5); g.fill();
      g.fillStyle = '#e8edf5'; roundRect(g, -9, -3.5, 15, 7, 3.5); g.fill();
      g.fillStyle = '#ff8a1f'; g.fillRect(-4, -3.5, 3, 7);
      g.fillStyle = '#ff4058'; g.beginPath(); g.moveTo(5, -3.5); g.lineTo(12, 0); g.lineTo(5, 3.5); g.fill();
      g.fillStyle = s.shock || '#5aa8ff'; g.beginPath(); g.moveTo(-10, -3.5); g.lineTo(-14, -7); g.lineTo(-6, -3.5); g.moveTo(-10, 3.5); g.lineTo(-14, 7); g.lineTo(-6, 3.5); g.fill();
      g.restore();
    } else if (s.kind === 'flame') {
      // green at the nozzle, yellow-orange in the middle, dark smoke at the tip
      const k = s.t / s.life, r = 6 + k * 16, wob = Math.sin(this.t * 30 + s.ph) * 2;
      const [out, mid, core] = k < 0.28 ? ['#3fb82a', '#7be040', '#e9ff9a'] : k < 0.7 ? ['#ff6a1f', '#ffb21c', '#fff3b0'] : ['#3a3340', '#ff6a1f', '#ffb21c'];
      g.globalAlpha = k < 0.7 ? 0.95 : (1 - k) / 0.3 * 0.9;
      g.fillStyle = out; g.beginPath(); g.arc(s.x, s.y + wob, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = mid; g.beginPath(); g.arc(s.x - 1, s.y - 1 + wob, r * 0.7, 0, Math.PI * 2); g.fill();
      g.fillStyle = core; g.beginPath(); g.arc(s.x - 1.5, s.y - 1.5 + wob, r * 0.38, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    } else if (s.kind === 'ice') {
      g.save(); g.translate(s.x, s.y); g.rotate(a);
      g.globalAlpha = 0.4; g.fillStyle = '#bfeaff'; g.beginPath(); g.moveTo(-6, -3); g.lineTo(-22, 0); g.lineTo(-6, 3); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#1d2440'; g.beginPath(); g.moveTo(13, 0); g.lineTo(2, -7); g.lineTo(-11, 0); g.lineTo(2, 7); g.closePath(); g.fill();
      g.fillStyle = '#bfeaff'; g.beginPath(); g.moveTo(10.5, 0); g.lineTo(2, -5); g.lineTo(-8.5, 0); g.lineTo(2, 5); g.closePath(); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(8, -0.5); g.lineTo(2, -3.4); g.lineTo(-2, -0.5); g.closePath(); g.fill();
      g.restore();
    }
  }
  drawCrate(g, c) {
    if (c.kind === 'crates') { sprite(g, 'crates', c.x, c.y + 10, 40); return; }
    if (c.kind === 'armory') {
      const p = 1 + Math.sin(this.t * 6) * 0.06;
      if (has('fx-halo')) fxs(g, 'fx-halo', c.x, c.y, 96, { h: 56, alpha: 0.55 + 0.25 * Math.sin(this.t * 6), img: tinted('fx-halo', '#b98cff', 0.8) });
      else { g.globalAlpha = 0.35 + 0.2 * Math.sin(this.t * 6); g.fillStyle = '#b98cff'; g.beginPath(); g.ellipse(c.x, c.y, 40, 22, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      sprite(g, 'chest-gold', c.x, c.y + 10, 46 * p);
      return;
    }
    if (c.kind === 'repair') {
      sprite(g, 'cabin', c.x, c.y + 30, 96);
      sprite(g, 'wrench', c.x, c.y - 74 + Math.sin(this.t * 4) * 4, 34);
    }
  }
  // small arrow sign on a post beside each branch; the big readable signs are in the HUD
  drawSign(g, s) {
    const r = ROUTES[s.key];
    const chosen = s.j.choice === s.side, other = s.j.choice && !chosen;
    const pulse = !s.j.choice ? 1 + Math.sin(this.t * 6) * 0.05 : chosen ? 1.1 : 0.9;
    const ws = WORLD_SIGN[s.key];
    if (ws && has(ws[0])) {
      g.save(); if (other) g.globalAlpha = 0.45;
      sprite(g, ws[0], s.x, s.y + 30, 74 * pulse, { flip: ws[1] !== s.side });
      g.restore();
      return;
    }
    g.save(); g.translate(s.x, s.y); g.scale(pulse, pulse);
    if (other) g.globalAlpha = 0.45;
    g.fillStyle = 'rgba(40,60,100,.2)'; g.beginPath(); g.ellipse(0, 30, 14, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d2440'; g.fillRect(-4, -14, 8, 44);
    g.fillStyle = '#a7b0c4'; g.fillRect(-2.2, -14, 4.4, 44);
    const d = s.side, W = 30, H = 20, tip = 13;
    const arrow = (k) => { g.beginPath(); g.moveTo(-d * W * k, -H * k - 22); g.lineTo(d * W * k, -H * k - 22); g.lineTo(d * (W + tip) * k, -22); g.lineTo(d * W * k, H * k - 22); g.lineTo(-d * W * k, H * k - 22); g.closePath(); };
    g.fillStyle = '#1d2440'; arrow(1.12); g.fill();
    g.fillStyle = r.color; arrow(1); g.fill();
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-W, -H - 22, W * 2, H * 0.7);
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-d * 8, -H - 23, 16, 4.5, 0, 0, Math.PI * 2); g.fill();
    sprite(g, r.icon, 0, -22, 28, { anchor: 'center' });
    if (chosen) { g.strokeStyle = '#ffffff'; g.lineWidth = 3; arrow(1.25); g.stroke(); }
    g.restore();
  }

  propsInView(v) {
    const S = 260, out = [], arena = this.D > this.loopD - 900;
    const a = arena ? this.loopD - 1300 : this.D - 1300, b = arena ? this.loopD + this.loopLen : Math.min(this.D + 1100, this.loopD + this.loopLen);
    const c0 = Math.floor(a / S), c1 = Math.floor(b / S), keys = [];
    for (let c = c0; c <= c1; c++) keys.push(c);
    if (arena) keys.push('arena');
    for (const c of keys) {
      if (!this.chunks.has(c)) this.chunks.set(c, c === 'arena' ? this.arenaChunk() : this.makeChunk(c, S));
      for (const p of this.chunks.get(c)) {
        const f = this.toF(p.wx, p.wy); p.x = f.x; p.y = f.y;
        if (p.y > v.top - 140 && p.y < v.bot + 60 && p.x > v.left - 80 && p.x < v.right + 80) out.push(p);
      }
    }
    if (this.chunks.size > 40) for (const key of this.chunks.keys()) if (typeof key === 'number' && (key < c0 - 4 || key > c1 + 4)) this.chunks.delete(key);
    return out;
  }
  // true when nothing of the route passes within `clear` of world point (x, y) (checked along d0 +- 900)
  offTrack(x, y, d0, clear) {
    for (let d = Math.max(-3000, d0 - 900); d <= Math.min(d0 + 900, this.loopD + this.loopLen); d += 24) { const p = this.pathAt(d); if (Math.hypot(p.x - x, p.y - y) < clear) return false; }
    return true;
  }
  // the inside of the boss ring stays clear, and nothing stands on the ring itself
  offRing(x, y, w) { return Math.hypot(x - this.loopC.x, y - this.loopC.y) > STAGE.loopR + 70 + w / 2; }
  makeChunk(c, S) {
    const r = seeded(Math.abs(c * 7919 + 1013) + 1), out = []; // positive seed: chunks behind the start (c < 0) were all big trees on the track
    const tot = PROPS.reduce((s, p) => s + p[2], 0);
    for (let i = 0; i < 7; i++) {
      const d = c * S + r() * S;
      let q = r() * tot, name = PROPS[0][0];
      for (const [nm, , w] of PROPS) { if ((q -= w) < 0) { name = nm; break; } }
      const side = r() < 0.5 ? -1 : 1;
      const rx = r(), w = PROP_W[name] * (0.85 + r() * 0.3), flip = r() < 0.5;
      if (d > this.loopD + this.loopLen) continue;
      // keep the whole sprite (half width) off the rails and the cars (half width 43) on every track
      let rail = 0;
      for (const j of this.junctions) if (d > j.d0 - 160 && d < j.d1 + 120) rail = BRANCH;
      const clear = rail + 43 + 22 + w / 2;
      const p = this.wpt(d, 0, side * (clear + rx * 230));
      if (this.offTrack(p.x, p.y, d, clear - 2) && this.offRing(p.x, p.y, w)) out.push({ name, wx: p.x, wy: p.y, x: 0, y: 0, w, flip });
    }
    return out;
  }
  // a wood all round the boss ring
  arenaChunk() {
    const r = seeded(4242), out = [], tot = PROPS.reduce((s, p) => s + p[2], 0), R = STAGE.loopR;
    for (let i = 0; i < 70; i++) {
      let q = r() * tot, name = PROPS[0][0];
      for (const [nm, , w] of PROPS) { if ((q -= w) < 0) { name = nm; break; } }
      const a = r() * Math.PI * 2, dist = R + 90 + r() * 620, w = PROP_W[name] * (0.85 + r() * 0.3), flip = r() < 0.5;
      const x = this.loopC.x + Math.cos(a) * dist, y = this.loopC.y + Math.sin(a) * dist;
      if (this.offRing(x, y, w) && this.offTrack(x, y, this.loopD - 300, 65 + w / 2) && this.offTrack(x, y, this.loopD - 1200, 65 + w / 2)) out.push({ name, wx: x, wy: y, x: 0, y: 0, w, flip });
    }
    return out;
  }
  drawProp(g, p) {
    g.fillStyle = 'rgba(40,60,100,.14)'; g.beginPath(); g.ellipse(p.x + 4, p.y, p.w * 0.42, p.w * 0.14, 0, 0, Math.PI * 2); g.fill();
    if (!sprite(g, p.name, p.x, p.y + p.w * 0.06, p.w, { flip: p.flip })) propStandIn(g, p.name, p.x, p.y, p.w);
    if (p.name === 'campfire') { g.globalAlpha = 0.25 + 0.1 * Math.sin(this.t * 13 + p.x); g.fillStyle = '#ffb21c'; g.beginPath(); g.ellipse(p.x, p.y - p.w * 0.3, p.w * 0.9, p.w * 0.6, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  }

  drawWeather(g, cw, ch, k) {
    const sp = (this.speed * k) / ch;
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (const f of this.flakes) {
      if (!this.paused) { f.y += (0.03 * f.s + sp * 0.9) / 60; f.x += Math.sin(this.t * 1.5 + f.ph) * 0.0006; }
      if (f.y > 1.05) { f.y = -0.05; f.x = Math.random(); }
      g.beginPath(); g.arc(f.x * cw, f.y * ch, f.r * (cw / 400), 0, Math.PI * 2); g.fill();
    }
    if (this.odT > 0) {
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2.5;
      for (let i = 0; i < 14; i++) { const x = (i < 7 ? i * 0.03 : 1 - (i - 7) * 0.03) * cw, y = ((this.t * 3 + i * 0.37) % 1) * ch; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 80); g.stroke(); }
    }
  }
  drawVignette(g, cw, ch) {
    if (!this.vig || this.vig.w !== cw || this.vig.h !== ch) {
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const q = c.getContext('2d');
      const gr = q.createRadialGradient(cw / 2, ch * 0.45, Math.min(cw, ch) * 0.45, cw / 2, ch * 0.45, Math.max(cw, ch) * 0.75);
      gr.addColorStop(0, 'rgba(40,60,110,0)'); gr.addColorStop(1, 'rgba(40,60,110,.28)');
      q.fillStyle = gr; q.fillRect(0, 0, cw, ch);
      this.vig = { c, w: cw, h: ch };
    }
    g.drawImage(this.vig.c, 0, 0);
    const hp = this.cars[0].hp / this.cars[0].max;
    if (hp < 0.35 && this.state !== 'win') {
      g.globalAlpha = (0.35 - hp) * 1.6 * (0.6 + 0.4 * Math.sin(this.t * 8));
      const gr = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
      gr.addColorStop(0, 'rgba(255,40,60,0)'); gr.addColorStop(1, 'rgba(255,40,60,.85)');
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch); g.globalAlpha = 1;
    }
    if (this.odT > 0) { g.globalAlpha = 0.18; g.fillStyle = '#ff9a1f'; g.fillRect(0, 0, cw, ch); g.globalAlpha = 1; }
  }
}
