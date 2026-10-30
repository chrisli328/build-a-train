// One run: the train rolls up the screen through a snowy route while its roof crew
// shoot the zombies that rush it. World units: the screen is 400 wide at zoom 1,
// world y = -distance, so the train moves up the screen.
import { CREW, ZOMBIES, CARDS, ROUTES, STAGE, XP_NEED } from './data.972bde881f.js';
import { sprite, has, makeGroundTile, zombieStandIn, crewStandIn, carStandIn, propStandIn, text, roundRect } from './art.edf81c8392.js';
import { Fx } from './fx.39f2fad397.js';
import { sfx, buzz } from './audio.548be9c6d4.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const GAP = 7, TRACK = 200, BRANCH = 96;

const CARS = {
  loco:   { spr: 'car-loco',   w: 86, l: 173, seats: [-0.36], hp: 420 },
  wagon2: { spr: 'car-wagon2', w: 86, l: 154, seats: [0.23, -0.22], hp: 220 },
  wagon1: { spr: 'car-wagon1', w: 86, l: 155, seats: [0.01], hp: 240 },
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
    this.ground = makeGroundTile();
    this.flakes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: rand(1, 2.8), s: rand(0.6, 1.4), ph: rand(0, 6) }));
    this.chunks = new Map();
    this.reset();
  }

  reset() {
    this.t = 0; this.D = 0; this.speed = 0; this.base = 50;
    this.state = this.opts.showcase ? 'showcase' : 'intro'; this.introT = 0;
    this.cars = [];
    this.addCar('loco', true);
    for (let i = 0; i < (this.opts.wagons || 1); i++) this.addCar('wagon2', true);
    // starting line-up fills seats front to back: engine roof first, then each wagon
    const seats = this.cars.flatMap((c) => c.seats);
    (this.opts.lineup || ['captain', 'gunner']).forEach((t, i) => { if (t && seats[i]) this.putCrew(t, seats[i], true); });
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
    c.seats = def.seats.map((f) => ({ f, crew: null, car: c, x: 0, y: 0 }));
    this.cars.push(c);
    return c;
  }
  trainLen() { return this.cars.reduce((s, c) => s + c.l + GAP, -GAP); }
  putCrew(type, seat, instant = false) {
    const d = CREW[type];
    seat.crew = { type, ...d, cd: rand(0, 0.4), flip: false, recoil: 0, drop: instant ? 0 : 1, aim: null, bob: rand(0, 6) };
  }
  emptySeats() { return this.cars.flatMap((c) => c.seats).filter((s) => !s.crew); }
  crewList() { return this.cars.flatMap((c) => c.seats).filter((s) => s.crew); }

  trackX(d, side = null) {
    for (const j of this.junctions) {
      if (d > j.d0 && d < j.d1) {
        const t = (d - j.d0) / (j.d1 - j.d0);
        const s = side ?? (j.choice || -1);
        return TRACK + s * BRANCH * sstep(0, 0.3, t) * (1 - sstep(0.7, 1, t));
      }
    }
    return TRACK;
  }

  layout(dt) {
    let d = this.D;
    for (const c of this.cars) {
      c.d = d - c.l / 2;
      c.x = this.trackX(c.d); c.y = -c.d;
      const dx = (this.trackX(c.d + 6) - this.trackX(c.d - 6)) / 12;
      c.a = Math.atan(dx);
      c.fx = Math.sin(c.a); c.fy = -Math.cos(c.a);
      if (c.join > 0) c.join = Math.max(0, c.join - dt * 1.8);
      c.hitT = Math.max(0, c.hitT - dt);
      for (const s of c.seats) { s.x = c.x + c.fx * s.f * c.l; s.y = c.y + c.fy * s.f * c.l; }
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
    // speed: ramp out of the depot, overdrive doubles it, ease to a stop at the station
    if (this.state === 'showcase') { this.speed = 0; this.layout(dt); this.crewStep(dt); this.trainFx(dt); this.camera(dt); return; }
    let target = this.base * (this.odT > 0 ? 2 : 1);
    if (this.state === 'intro') { this.introT += dt; target = this.introT > 1.2 ? this.base : 0; if (this.introT > 1.2) { this.state = 'run'; this.hooks.onGo && this.hooks.onGo(); } }
    const stopAt = STAGE.length;
    if (this.D > stopAt - 320) target = Math.min(target, Math.max(0, (stopAt - this.D) * 0.35));
    if (this.state === 'win') target = this.base * 1.2;
    if (this.state === 'lose') target = 0;
    const blocked = this.zs.some((z) => z.plowBlock);
    if (blocked) target *= 0.3;
    this.speed += (target - this.speed) * Math.min(1, dt * (target < this.speed ? 3 : 1.6));
    this.D += this.speed * dt;
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
    const fy = this.opts.showcase ? this.opts.showcase.fy : this.boss && !this.boss.dead ? 0.6 : 0.38;
    this.cam.fy += (fy - this.cam.fy) * Math.min(1, dt * 1.5);
    const sc = this.opts.showcase;
    const want = sc ? (sc.span ? clamp(sc.span * Hv0 / (this.trainLen() + 10), 0.6, sc.max || 2) : sc.zoom) : clamp((1 - this.cam.fy - 0.07) * Hv0 / (this.trainLen() + 10), 0.66, 1);
    this.cam.zoom += (want - this.cam.zoom) * Math.min(1, dt * 2);
    this.cam.y = -this.D;
    this.cam.x += ((TRACK + (this.cars[0].x - TRACK) * 0.55) - this.cam.x) * Math.min(1, dt * 3);
  }
  toScreen(x, y) {
    const v = this.view();
    return { x: (x - this.cam.x) * v.k + v.cw / 2, y: (y - this.cam.y) * v.k + v.ch * this.cam.fy };
  }

  // ---------- spawning ----------
  leg() { return STAGE.legs.find((l) => this.D < l.to) || STAGE.legs[STAGE.legs.length - 1]; }
  director(dt) {
    if (this.D > STAGE.length - 380 && !(this.boss && this.boss.dead)) { this.spawnAcc += dt * 1.1; }
    else {
      const L = this.leg(), i = STAGE.legs.indexOf(L), from = i ? STAGE.legs[i - 1].to : 0;
      const k = clamp((this.D - from) / (L.to - from), 0, 1);
      let rate = L.rate[0] + (L.rate[1] - L.rate[0]) * k;
      if (this.mods.xp > 1) rate *= 1.7;
      this.spawnAcc += rate * dt;
    }
    if (this.boss && this.boss.dead) return;
    const v = this.view();
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const mix = this.leg().mix;
      let tot = mix.reduce((s, m) => s + m[1], 0), r = Math.random() * tot, type = mix[0][0];
      for (const [n, w] of mix) { if ((r -= w) < 0) { type = n; break; } }
      if (Math.random() < 0.68) this.spawn(type, rand(v.left + 14, v.right - 14), v.top - rand(25, 90));
      else { const s = Math.random() < 0.5 ? -1 : 1; this.spawn(type, s < 0 ? v.left - 24 : v.right + 24, rand(v.top + v.Hv * 0.05, v.top + v.Hv * 0.5)); }
    }
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
      const e = evs[this.evI++], v = this.view();
      if (e.type === 'horde') {
        const cx = TRACK + rand(-70, 70);
        for (let i = 0; i < e.n; i++) { const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 110; this.spawn(pick(e.mix), cx + Math.cos(a) * r * 1.4, v.top - 60 - 110 + Math.sin(a) * r); }
        if (!e.quiet) { this.hooks.onBanner && this.hooks.onBanner('HORDE AHEAD!', 'red'); sfx.warn(); }
      } else if (e.type === 'ambush') {
        const x = e.side < 0 ? v.left - 30 : v.right + 30;
        for (let i = 0; i < e.n; i++) this.spawn(pick(e.mix), x + e.side * rand(0, 80), v.top + v.Hv * rand(0.15, 0.55));
        this.hooks.onBanner && this.hooks.onBanner(e.side < 0 ? '◀ AMBUSH LEFT' : 'AMBUSH RIGHT ▶', 'orange');
        sfx.warn();
      } else if (e.type === 'brute') {
        for (let i = 0; i < e.n; i++) { const z = this.spawn('brute', TRACK + (e.n > 1 ? (i ? 60 : -60) : rand(-20, 20)), v.top - 70 - i * 40); z.mini = true; }
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
    const x = TRACK + side * 70, y = -(j.d0 - 10);
    this.fx.ring(x, y, 10, 70, '#ffffff', 0.4, 5);
    this.hooks.onChosen && this.hooks.onChosen(j, side, key, auto);
  }
  branchPoint(j, side, t) { const d = j.d0 + (j.d1 - j.d0) * t; return { x: this.trackX(d, side), y: -d, d }; }
  buildBranches(j) {
    j.opts.forEach((key, i) => {
      const side = i ? 1 : -1;
      const p = this.branchPoint(j, side, 0.12);
      this.signs.push({ x: TRACK + side * 132, y: p.y - 30, key, side, j });
      if (key === 'supply') for (let k = 0; k < 7; k++) { const q = this.branchPoint(j, side, 0.3 + k * 0.06); this.crates.push({ x: q.x + rand(-6, 6), y: q.y, d: q.d, kind: 'crates', j, side, hp: 1 }); }
      if (key === 'armory') { const q = this.branchPoint(j, side, 0.5); this.crates.push({ x: q.x, y: q.y, d: q.d, kind: 'armory', j, side, hp: 1 }); }
      if (key === 'repair') { const q = this.branchPoint(j, side, 0.5); this.crates.push({ x: q.x + side * 78, y: q.y, d: q.d, kind: 'repair', j, side, hp: 1, deco: true }); }
      if (key === 'horde') for (let k = 0; k < 20; k++) { const q = this.branchPoint(j, side, rand(0.25, 0.85)); this.spawn(pick(['walker', 'walker', 'hardhat', 'runner']), q.x + rand(-80, 80), q.y, { idle: true }); }
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
        const y = -n.d;
        for (let i = 0; i < 26; i++) { const a = rand(-Math.PI, 0); this.fx.dot(rand(120, 280), y, Math.cos(a) * rand(40, 160), Math.sin(a) * rand(60, 200), rand(3, 5), pick(['#ff4058', '#ffd23f', '#3d8bff', '#5cd636', '#ffffff']), 1.2, { g: 0, drag: 1.2 }); }
        sfx.chest(); buzz([20, 40, 20]);
        this.hooks.onChest && this.hooks.onChest(this.nodes.indexOf(n));
      }
    }
  }

  // ---------- boss ----------
  bossStep(dt) {
    if (!this.bossWarned && this.D > STAGE.length - 560) {
      this.bossWarned = true;
      const z = this.spawn('yeti', TRACK, -(STAGE.length + 330));
      z.boss = true; z.atkT = 2.5; z.roarT = 5; this.boss = z;
      this.hooks.onBoss && this.hooks.onBoss();
      sfx.warn(); this.state = 'boss';
    }
    const b = this.boss;
    if (!b || b.dead) return;
    const loco = this.cars[0];
    const fx = loco.x + loco.fx * loco.l / 2, fy = loco.y + loco.fy * loco.l / 2;
    const dist = Math.hypot(b.x - fx, b.y - fy);
    if (dist < 120) {
      b.atkT -= dt;
      if (b.atkT < 1 && !b.tele) { b.tele = { x: fx, y: fy - 20, t: 0 }; }
      if (b.tele) b.tele.t += dt;
      if (b.atkT <= 0) {
        b.atkT = 3.2; const tx = b.tele ? b.tele.x : fx, ty = b.tele ? b.tele.y : fy; b.tele = null; b.slam = 0.35;
        this.fx.boom(tx, ty, 60, { noDecal: false }); this.fx.ring(tx, ty, 20, 170, '#d9f3ff', 0.5, 9);
        for (let i = 0; i < 16; i++) { const a = rand(0, Math.PI * 2); this.fx.dot(tx, ty, Math.cos(a) * 200, Math.sin(a) * 160, rand(4, 7), '#ffffff', 0.7, { vz: rand(100, 260), g: 600, ink: '#9fb4cc' }); }
        this.hurtCar(loco, 46); this.fx.shake(0.75); sfx.boom(true); buzz([30, 30, 60]);
        for (const z of this.zs) if (!z.boss && !z.dead && Math.hypot(z.x - tx, z.y - ty) < 140) this.damage(z, 40, { kx: (z.x - tx) * 4, ky: (z.y - ty) * 4 });
      }
    }
    b.roarT -= dt;
    if (b.roarT <= 0) {
      b.roarT = 6.5;
      for (let i = 0; i < 5; i++) this.spawn('runner', b.x + rand(-90, 90), b.y - rand(10, 60));
      this.fx.label(b.x, b.y - 150, 'ROAR!', 30, '#ffffff', 1); this.fx.shake(0.35); sfx.boom();
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
    for (const s of this.crewList()) {
      const c = s.crew;
      if (c.drop > 0) { c.drop = Math.max(0, c.drop - dt * 2.4); if (c.drop === 0) { this.fx.ring(s.x, s.y + 8, 6, 34, '#ffffff', 0.35, 4); this.fx.label(s.x, s.y - 34, 'NEW CREW!', 17, '#ffe066', 1.1); sfx.plow(); } continue; }
      c.recoil = Math.max(0, c.recoil - dt * 8);
      if (s.car.broken || this.state === 'win') continue;
      c.cd -= dt * this.rateMul(c);
      const tgt = this.target(s, c.range);
      if (tgt) c.flip = tgt.x > s.x + 4;
      if (c.cd <= 0) {
        if (tgt) { this.fire(s, c, tgt); c.cd += 1 / c.rate; if (c.cd < 0) c.cd = 0; }
        else c.cd = 0;
      }
    }
  }
  target(s, range) {
    let best = null, bd = range * range;
    for (const z of this.zs) {
      if (z.dead || z.air > 0 || z.idle && z.y < this.view().top) continue;
      let d = (z.x - s.x) ** 2 + (z.y - s.y) ** 2;
      if (z.att && z.att.car === s.car) d *= 0.4;
      if (z.boss) d *= 0.7;
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }
  muzzle(s, c) {
    const flip = c.flip ? 1 : -1;
    return { x: s.x + flip * 11, y: s.y - 22 };
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
        this.shots.push({ kind: 'bullet', x: m.x, y: m.y, vx: Math.cos(aa) * c.speed, vy: Math.sin(aa) * c.speed, dmg, r: 4, life: c.range / c.speed + 0.15, t: 0, color: c.type === 'captain' ? '#9fd0ff' : '#ffe066' });
      }
      this.fx.flash(m.x + Math.cos(a) * 6, m.y + Math.sin(a) * 6, 9, '#fff3a0', 0.06);
      this.fx.dot(s.x, s.y, -Math.sin(a) * rand(40, 90) * (Math.random() < 0.5 ? 1 : -1), Math.cos(a) * rand(40, 90), 1.8, '#e0b13a', 0.5, { vz: 80, g: 400 });
    } else if (c.kind === 'pellet') {
      for (let i = 0; i < c.pellets; i++) { const aa = a + rand(-c.spread / 2, c.spread / 2), sp = c.speed * rand(0.85, 1.1); this.shots.push({ kind: 'pellet', x: m.x, y: m.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, dmg, r: 4, life: c.range / sp, t: 0, color: '#ffd23f', knock: c.knock }); }
      this.fx.flash(m.x + Math.cos(a) * 8, m.y + Math.sin(a) * 8, 16, '#fff3a0', 0.07);
      this.fx.puff(m.x + Math.cos(a) * 14, m.y + Math.sin(a) * 14, 7, '#ffffff', 0.35, { vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 });
    } else if (c.kind === 'rocket') {
      this.shots.push({ kind: 'rocket', x: m.x, y: m.y, vx: Math.cos(a) * c.speed * 0.5, vy: Math.sin(a) * c.speed * 0.5, sp: c.speed, dmg, r: 8, aoe: c.aoe, life: 1.6, t: 0, tgt: z, trail: 0 });
      this.fx.puff(m.x, m.y, 9, '#ffffff', 0.4);
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
      hits.slice(0, c.pierce).forEach(([, q], i) => this.damage(q, dmg * (1 - i * 0.12), { kx: Math.cos(a) * 160, ky: Math.sin(a) * 160, color: '#e0c3ff' }));
      this.fx.beam(m.x, m.y, ex, ey, '#b98cff', 6, 0.16);
      this.fx.flash(m.x, m.y, 14, '#e8d6ff', 0.08);
    } else if (c.kind === 'flame') {
      for (let i = 0; i < 2; i++) { const aa = a + rand(-0.25, 0.25), sp = rand(240, 300); this.shots.push({ kind: 'flame', x: m.x, y: m.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, dmg, r: 6, life: c.range / sp, t: 0, hit: new Set(), burn: c.burn }); }
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
        d *= 0.85;
        let nb = null, nd = 95 * 95;
        for (const q of this.zs) { if (q.dead || hit.has(q)) continue; const dd = (q.x - cur.x) ** 2 + (q.y - cur.y) ** 2; if (dd < nd) { nd = dd; nb = q; } }
        cur = nb;
      }
      this.fx.bolt(pts, '#5ee8ff', 0.15);
    } else if (c.kind === 'ice') {
      this.shots.push({ kind: 'ice', x: m.x, y: m.y, vx: Math.cos(a) * c.speed, vy: Math.sin(a) * c.speed, dmg, r: 6, life: c.range / c.speed + 0.1, t: 0, slow: c.slow, a });
    }
  }

  // ---------- zombies ----------
  zombieStep(dt) {
    const v = this.view();
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
      if (z.dead) { z.dying += dt; if (z.dying > 0.24) this.zs.splice(i, 1); continue; }
      z.flash = Math.max(0, z.flash - dt);
      z.ph += dt * (z.type === 'runner' ? 14 : 8);
      if (z.slowT > 0) z.slowT -= dt;
      if (z.burnT > 0) { z.burnT -= dt; z.acc += dt; if (z.acc > 0.25) { z.acc = 0; this.damage(z, 6 * this.mods.dmg, { color: '#ffb35c', small: true }); if (Math.random() < 0.6) this.fx.puff(z.x + rand(-6, 6), z.y - 18, 5, '#ff9a3c', 0.35, { vy: -40, ink: 'rgba(0,0,0,0)' }); } if (z.dead) continue; }
      // launched by the plow
      if (z.air > 0) {
        z.air -= dt; z.x += z.vx * dt; z.y += z.vy * dt; z.vh -= 900 * dt; z.h = Math.max(0, z.h + z.vh * dt); z.rot += z.vr * dt;
        if (z.air <= 0) { z.h = 0; z.rot = 0; z.vx = z.vy = 0; this.fx.puff(z.x, z.y, 10, '#ffffff', 0.4); }
        continue;
      }
      if (z.idle) { if (z.y > v.top - 40) { z.idle = false; this.fx.label(z.x, z.y - 40, '!', 22, '#ff4058', 0.6); } else continue; }
      const sp = z.spd * (z.slowT > 0 ? 0.45 : 1);
      if (z.att) {
        const c = z.att.car;
        if (!this.cars.includes(c)) { z.att = null; continue; }
        z.x = c.x + c.fx * z.att.f - c.fy * z.att.s; z.y = c.y + c.fy * z.att.f + c.fx * z.att.s;
        z.bite = (z.bite || 0) + dt;
        if (z.bite > 0.5) { z.bite = 0; this.hurtCar(c, z.dps * 0.5); }
        continue;
      }
      if (z.boss) {
        const tx = pfx, ty = pfy - 70;
        const dx = tx - z.x, dy = ty - z.y, d = Math.hypot(dx, dy);
        if (d > 4) { z.x += dx / d * Math.min(d, sp * dt); z.y += dy / d * Math.min(d, sp * dt); }
        z.flip = dx > 0;
        continue;
      }
      // walk to the nearest car's side
      let best = null, bd = 1e9, bf = 0, bs = 0;
      for (const c of this.cars) {
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
      let dx = tx - z.x, dy = ty - z.y; const dist = Math.hypot(dx, dy);
      // the plow: anything right in front of the engine gets smashed aside
      const ox = z.x - pfx, oy = z.y - pfy;
      const ahead = ox * loco.fx + oy * loco.fy, lat = -ox * loco.fy + oy * loco.fx;
      z.plowBlock = false;
      if (ahead > -14 && ahead < 26 && Math.abs(lat) < plowW && this.speed > 8) {
        if (z.heavy) {
          z.plowBlock = true; z.pt = (z.pt || 0) + dt;
          if (z.pt > 0.3) { z.pt = 0; this.damage(z, plowD * 1.2, { color: '#ffffff' }); this.fx.shake(0.15); sfx.plow(); for (let k = 0; k < 4; k++) this.fx.spark(pfx + rand(-20, 20), pfy, rand(-2.6, -0.5), rand(200, 400), 12, '#ffd23f'); }
          z.y = pfy - 14 + loco.fy * 0; z.x += (pfx + lat - z.x) * 0.2;
          continue;
        }
        this.damage(z, plowD, { color: '#ffffff' });
        if (!z.dead) { const s = lat >= 0 ? 1 : -1; z.air = 0.5; z.vx = s * rand(220, 320); z.vy = -this.speed - rand(40, 120); z.vh = 300; z.vr = s * rand(8, 14); }
        else { z.air = 0; }
        this.fx.shake(0.08); sfx.plow();
        this.fx.puff(z.x, z.y, 12, '#ffffff', 0.4);
        continue;
      }
      if (dist < 5) {
        z.att = { car: best, f: bf + rand(-6, 6), s: want + rand(-3, 3) * side };
        this.fx.puff(z.x, z.y - 8, 7, '#ffffff', 0.3);
        continue;
      }
      dx /= dist || 1; dy /= dist || 1;
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
      if (Math.abs(dx) > 0.2) z.flip = dx > 0;
      // fell behind the train: gone
      if (z.y > v.bot + 120) this.zs.splice(i, 1);
    }
  }
  hurtCar(c, dmg) {
    if (this.state === 'win' || this.state === 'lose') return;
    c.hp = Math.max(0, c.hp - dmg); c.hitT = 0.15;
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
    z.hp -= dmg; z.flash = 0.09;
    if (!z.heavy && o.kx !== undefined) { z.kx += o.kx; z.ky += o.ky; }
    if (crit || this.t - z.numT > 0.11 || dmg >= 30) { z.numT = this.t; this.fx.num(z.x, z.y - 30 * (z.scale || 1) - (z.boss ? 90 : 0), Math.round(dmg), { crit, color: crit ? '#ffd23f' : o.color }); }
    sfx.hit();
    if (z.hp <= 0) this.kill(z);
  }
  kill(z) {
    z.dead = true; z.dying = 0; z.att = null; z.plowBlock = false;
    if (z.boss) { this.bossDown(z); return; }
    this.kills++; this.combo++; this.comboT = 1.6; this.bestCombo = Math.max(this.bestCombo, this.combo);
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
      s.t += dt;
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
          if (s.kind === 'flame') { s.hit.add(z); this.damage(z, s.dmg, { color: '#ffb35c', small: true }); z.burnT = 2; continue; }
          const sp = Math.hypot(s.vx, s.vy) || 1;
          if (s.kind === 'rocket') { dead = true; break; }
          this.damage(z, s.dmg, { kx: s.vx / sp * (s.knock || 30), ky: s.vy / sp * (s.knock || 30), color: s.kind === 'ice' ? '#bfeaff' : undefined });
          if (s.kind === 'ice') { z.slowT = 2.2; for (let k = 0; k < 4; k++) this.fx.dot(s.x, s.y, rand(-80, 80), rand(-80, 80), 2.5, '#d9f6ff', 0.35, { ink: '#5fb6e6' }); }
          else this.fx.spark(s.x, s.y, Math.atan2(s.vy, s.vx) + Math.PI + rand(-0.6, 0.6), rand(80, 160), 6, '#fff3a0', 0.12, 2);
          dead = true; break;
        }
      }
      if (dead) {
        if (s.kind === 'rocket') {
          this.fx.boom(s.x, s.y, s.aoe * 0.62); sfx.boom(); this.fx.shake(0.12);
          for (const z of this.zs) if (!z.dead && Math.hypot(z.x - s.x, z.y - 10 - s.y) < s.aoe + z.r) this.damage(z, s.dmg, { kx: (z.x - s.x) * 4, ky: (z.y - s.y) * 4, color: '#ffd23f' });
        }
        this.shots.splice(i, 1);
      }
    }
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
    if (empty) for (const c of CARDS.filter((c) => c.kind === 'crew')) pool.push([c, present.has(c.crew) ? 0.6 : 2.2]);
    for (const t of present) { const lv = this.crewLv[t] || 1; if (lv < 5) pool.push([{ id: 'lv-' + t, kind: 'lv', crew: t, title: CREW[t].name, text: `Level ${lv} → ${lv + 1}\n` + (t === 'gunner' && lv === 2 ? 'Twin barrels!' : '+50% damage'), lv }, 1.6]); }
    for (const c of CARDS.filter((c) => c.kind === 'up')) pool.push([c, 1]);
    if (this.cars.length < 4) pool.push([CARDS.find((c) => c.id === 'u-wagon'), empty ? 0.5 : 3]);
    const out = [];
    while (out.length < 3 && pool.length) {
      const tot = pool.reduce((s, p) => s + p[1], 0); let r = Math.random() * tot, i = 0;
      for (; i < pool.length; i++) if ((r -= pool[i][1]) < 0) break;
      const [c] = pool.splice(Math.min(i, pool.length - 1), 1)[0];
      if (!out.some((o) => o.kind === 'crew' && c.kind === 'crew' && out.filter((x) => x.kind === 'crew').length >= empty)) out.push(c);
    }
    return out;
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
      const c = this.addCar('wagon2'); this.layout(0); sfx.horn(); this.fx.shake(0.2);
      this.hooks.onBanner && this.hooks.onBanner('NEW WAGON!', 'green');
      void c;
    } else {
      if (card.id === 'u-rate') this.mods.rate *= 1 + 0.4 * boost;
      if (card.id === 'u-dmg') this.mods.dmg *= 1 + 0.5 * boost;
      if (card.id === 'u-plow') this.mods.plow += 1 * boost;
      if (card.id === 'u-magnet') this.mods.magnet *= 1 + 0.5 * boost;
      if (card.id === 'u-crit') this.mods.crit += 0.15 * boost;
      if (card.id === 'u-armor') for (const c of this.cars) { c.max *= 1 + 0.6 * boost; c.hp = Math.min(c.max, c.hp + c.max * 0.6 * boost); c.broken = false; }
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
      if (Math.abs(c.x - pfx) < 40 && c.y > pfy - 12 && c.y < pfy + 30) {
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
      const cx = loco.x + loco.fx * loco.l * 0.07, cy = loco.y + loco.fy * loco.l * 0.07;
      this.fx.puff(cx + rand(-3, 3), cy, rand(7, 11), '#f2f4f8', 1.1, { vx: rand(-15, 15), vy: rand(-10, 10), grow: 2.4, drag: 1 });
    }
    this.sprayT -= dt;
    if (this.sprayT <= 0 && this.speed > 20) {
      this.sprayT = 0.03;
      const px = loco.x + loco.fx * loco.l / 2, py = loco.y + loco.fy * loco.l / 2 + 6;
      for (const s of [-1, 1]) this.fx.dot(px + s * 30, py, s * rand(80, 170), rand(-20, 40), rand(2, 4), '#ffffff', 0.4, { vz: rand(40, 120), g: 400, ink: 'rgba(150,170,200,.6)' });
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
    const T = 400;
    for (let ty = Math.floor(v.top / T) * T; ty < v.bot; ty += T) for (let tx = Math.floor(v.left / T) * T; tx < v.right; tx += T) g.drawImage(this.ground, tx, ty, T, T);
    this.fx.drawDecals(g);
    this.drawTrack(g, v);
    this.drawStation(g, v);
    // ground drops
    for (const d of this.drops) {
      g.fillStyle = 'rgba(40,60,100,.18)'; g.beginPath(); g.ellipse(d.x, d.y, 7, 3.5, 0, 0, Math.PI * 2); g.fill();
      const bob = d.fly ? 0 : Math.sin(this.t * 6 + d.x) * 2;
      sprite(g, d.kind === 'xp' ? 'xp' : 'coin', d.x, d.y - d.z - 2 + bob, d.kind === 'xp' ? 11 : 14);
    }
    // shadows
    g.fillStyle = 'rgba(40,60,100,.16)';
    for (const c of this.cars) { g.save(); g.translate(c.x + 6, c.y + 8 + c.join * 140); g.rotate(c.a); roundRect(g, -c.w / 2, -c.l / 2, c.w, c.l, 14); g.fill(); g.restore(); }
    // train
    for (let i = this.cars.length - 1; i >= 0; i--) this.drawCar(g, this.cars[i], i);
    // y-sorted world things
    const list = [];
    for (const p of this.propsInView(v)) list.push([p.y, 0, p]);
    for (const c of this.crates) if (c.y > v.top - 80 && c.y < v.bot + 80 && (c.hp > 0 || c.deco)) list.push([c.y, 1, c]);
    for (const s of this.signs) if (s.y > v.top - 120 && s.y < v.bot + 60) list.push([s.y, 2, s]);
    for (const z of this.zs) if (z.y > v.top - 160 && z.y < v.bot + 60) list.push([z.y + (z.att ? 0 : 0), 3, z]);
    list.sort((a, b) => a[0] - b[0]);
    for (const [, kind, o] of list) {
      if (kind === 0) this.drawProp(g, o);
      else if (kind === 1) this.drawCrate(g, o);
      else if (kind === 2) this.drawSign(g, o);
      else this.drawZombie(g, o);
    }
    if (this.boss && this.boss.tele) { const b = this.boss.tele, kk = Math.min(1, b.t); g.strokeStyle = `rgba(255,64,88,${0.5 + 0.5 * Math.sin(this.t * 20)})`; g.lineWidth = 4; g.fillStyle = 'rgba(255,64,88,.18)'; g.beginPath(); g.ellipse(b.x, b.y, 80 * kk, 56 * kk, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    // crew on the roof
    for (const s of this.crewList()) this.drawCrew(g, s);
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
    const step = 22;
    const segs = [[null]];
    for (const j of this.junctions) if (j.shown) segs.push([j, -1], [j, 1]);
    const d0 = -v.bot - 40, d1 = -v.top + 40;
    const lines = (j, side) => {
      const pts = [];
      const a = j ? Math.max(d0, j.d0) : d0, b = j ? Math.min(d1, j.d1) : d1;
      if (a >= b) return null;
      for (let d = Math.floor(a / step) * step; d <= b + step; d += step) {
        if (!j && this.junctions.some((q) => q.shown && d > q.d0 && d < q.d1)) { pts.push(null); continue; }
        const x = j ? this.trackX(d, side) : TRACK;
        const dx = j ? (this.trackX(d + 4, side) - this.trackX(d - 4, side)) / 8 : 0;
        pts.push([x, -d, Math.atan(dx), d]);
      }
      return pts;
    };
    const all = segs.map(([j, s]) => ({ j, s, pts: lines(j, s) })).filter((o) => o.pts);
    // bed
    for (const o of all) {
      const faded = o.j && o.j.choice && o.j.choice !== o.s && this.D > o.j.d0;
      g.globalAlpha = faded ? 0.55 : 1;
      g.strokeStyle = '#cfd8e2'; g.lineWidth = 64; g.lineCap = 'round'; g.lineJoin = 'round';
      this.path(g, o.pts); g.stroke();
      g.strokeStyle = '#bcc7d3'; g.lineWidth = 50; this.path(g, o.pts); g.stroke();
      // sleepers
      for (const p of o.pts) {
        if (!p) continue;
        g.save(); g.translate(p[0], p[1]); g.rotate(p[2]);
        g.fillStyle = '#1d2440'; g.fillRect(-31, -5.5, 62, 11);
        g.fillStyle = '#9a6a43'; g.fillRect(-29.5, -4, 59, 8);
        g.fillStyle = '#b8845a'; g.fillRect(-29.5, -4, 59, 2.5);
        if ((Math.abs(p[3]) / step) % 5 < 1) { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-14, 0, 8, 3, 0, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
      // rails
      for (const off of [-17, 17]) {
        const pts = o.pts.map((p) => p && [p[0] + Math.cos(p[2]) * off, p[1] + Math.sin(p[2]) * off]);
        g.strokeStyle = '#1d2440'; g.lineWidth = 6.5; this.path(g, pts); g.stroke();
        g.strokeStyle = '#8693a3'; g.lineWidth = 4; this.path(g, pts); g.stroke();
        g.strokeStyle = '#dfe7f0'; g.lineWidth = 1.4; this.path(g, pts); g.stroke();
      }
      g.globalAlpha = 1;
    }
    // switch lever and route arrows at each split
    for (const j of this.junctions) {
      if (!j.shown) continue;
      const y = -j.d0 + 10;
      if (y < v.top - 60 || y > v.bot + 60) continue;
      g.save(); g.translate(TRACK + 44, y);
      g.fillStyle = '#1d2440'; roundRect(g, -10, -6, 20, 12, 4); g.fill();
      g.strokeStyle = '#1d2440'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(j.lever * 16, -20); g.stroke();
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(j.lever * 16, -20); g.stroke();
      g.fillStyle = '#ff4058'; g.beginPath(); g.arc(j.lever * 16, -20, 5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#1d2440'; g.lineWidth = 2; g.stroke();
      g.restore();
      if (!j.choice) for (const s of [-1, 1]) {
        const p = this.branchPoint(j, s, 0.22), pulse = 1 + Math.sin(this.t * 8) * 0.12;
        g.save(); g.translate(p.x, p.y); g.rotate(s * 0.5); g.scale(pulse, pulse);
        g.fillStyle = '#ffffff'; g.strokeStyle = '#1d2440'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, -18); g.lineTo(14, 2); g.lineTo(5, 2); g.lineTo(5, 16); g.lineTo(-5, 16); g.lineTo(-5, 2); g.lineTo(-14, 2); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
    }
    // checkpoint flags across the track
    for (const n of this.nodes) {
      const y = -n.d;
      if (y < v.top - 60 || y > v.bot + 60) continue;
      g.strokeStyle = '#1d2440'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(118, y - 40); g.quadraticCurveTo(200, y - 22, 282, y - 40); g.stroke();
      const cols = ['#ff4058', '#ffd23f', '#3d8bff', '#5cd636'];
      for (let i = 0; i < 9; i++) {
        if (n.done) break;
        const t = (i + 0.5) / 9, x = 118 + 164 * t, yy = y - 40 + 18 * 4 * t * (1 - t) * 1.0;
        g.fillStyle = cols[i % 4]; g.beginPath(); g.moveTo(x - 7, yy); g.lineTo(x + 7, yy); g.lineTo(x, yy + 14); g.closePath(); g.fill(); g.stroke();
      }
      sprite(g, 'signal', 112, y, 24); sprite(g, 'signal', 288, y, 24, { flip: true });
    }
  }
  path(g, pts) {
    g.beginPath(); let pen = false;
    for (const p of pts) { if (!p) { pen = false; continue; } if (!pen) { g.moveTo(p[0], p[1]); pen = true; } else g.lineTo(p[0], p[1]); }
  }
  drawStation(g, v) {
    const y = -(STAGE.length + 90);
    if (y < v.top - 200 || y > v.bot + 100) return;
    // platform and arch sign across the line
    g.fillStyle = '#1d2440'; roundRect(g, 252, y - 60, 92, 230, 10); g.fill();
    g.fillStyle = '#c9a06b'; roundRect(g, 255, y - 57, 86, 224, 8); g.fill();
    g.fillStyle = '#ffd23f'; g.fillRect(255, y - 57, 8, 224);
    sprite(g, 'crates', 300, y + 40, 52); sprite(g, 'barrels', 316, y + 130, 36);
    const open = this.state === 'win' ? Math.min(1, this.endT * 1.5) : 0;
    for (const s of [-1, 1]) {
      g.save(); g.translate(TRACK + s * 52, y); g.rotate(s * open * 1.3);
      g.fillStyle = '#1d2440'; roundRect(g, s < 0 ? -4 : -48, -6, 52, 12, 5); g.fill();
      g.fillStyle = '#ff4058'; roundRect(g, s < 0 ? -2 : -46, -4, 48, 8, 4); g.fill();
      g.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) g.fillRect((s < 0 ? -2 : -46) + 6 + i * 12, -4, 5, 8);
      g.restore();
    }
    g.fillStyle = '#1d2440'; roundRect(g, 120, y - 120, 160, 48, 12); g.fill();
    g.fillStyle = '#2f6fe0'; roundRect(g, 123, y - 117, 154, 42, 10); g.fill();
    text(g, 'PINE JUNCTION', 200, y - 96, 19, '#ffffff');
    g.fillStyle = '#1d2440'; g.fillRect(126, y - 74, 6, 70); g.fillRect(268, y - 74, 6, 70);
  }
  drawCar(g, c, i) {
    g.save();
    g.translate(c.x, c.y + c.join * 140);
    g.rotate(c.a);
    if (c.join > 0) g.globalAlpha = 1 - c.join * 0.6;
    const shake = c.hitT > 0 ? Math.sin(this.t * 90) * 1.5 : 0;
    const drawn = sprite(g, c.spr, shake, 0, c.w, { anchor: 'center', flash: c.hitT > 0 ? c.hitT * 4 : 0 });
    if (!drawn) carStandIn(g, c.type, c.w * 0.82, c.l);
    if (c.broken) { g.fillStyle = 'rgba(30,30,40,.35)'; roundRect(g, -c.w * 0.4, -c.l / 2, c.w * 0.8, c.l, 10); g.fill(); }
    if (i === 0 && this.state !== 'lose') {
      // headlight cone
      g.globalAlpha = 0.18 + 0.05 * Math.sin(this.t * 10);
      const gr = g.createLinearGradient(0, -c.l / 2, 0, -c.l / 2 - 120);
      gr.addColorStop(0, '#fff6c8'); gr.addColorStop(1, 'rgba(255,246,200,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-14, -c.l / 2 + 8); g.lineTo(14, -c.l / 2 + 8); g.lineTo(60, -c.l / 2 - 120); g.lineTo(-60, -c.l / 2 - 120); g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    if (this.odT > 0 && i === 0) { g.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 30); g.strokeStyle = '#ffb21c'; g.lineWidth = 6; roundRect(g, -c.w / 2 + 4, -c.l / 2 - 4, c.w - 8, c.l + 8, 18); g.stroke(); g.globalAlpha = 1; }
    g.restore();
  }
  drawCarBars(g) {
    for (const c of this.cars) {
      if (c.join > 0) continue;
      const h = c.l * 0.62, x = c.x - c.w / 2 - 12, y = c.y - h / 2;
      const k = c.hp / c.max;
      g.fillStyle = '#1d2440'; roundRect(g, x - 4, y - 2, 9, h + 4, 4.5); g.fill();
      g.fillStyle = '#3a4466'; roundRect(g, x - 2.5, y, 6, h, 3); g.fill();
      const col = k > 0.5 ? '#7ee04a' : k > 0.25 ? '#ffc23a' : '#ff4058';
      g.fillStyle = col; roundRect(g, x - 2.5, y + h * (1 - k), 6, Math.max(3, h * k), 3); g.fill();
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x - 1.5, y + h * (1 - k) + 2, 1.5, Math.max(0, h * k - 4));
    }
  }
  drawCrew(g, s) {
    const c = s.crew;
    const size = 40;
    const drop = c.drop > 0 ? c.drop : 0;
    const bob = Math.sin(this.t * 7 + c.bob) * 0.8;
    const rx = c.recoil * (c.flip ? -2.5 : 2.5), ry = c.recoil * 2.5;
    g.fillStyle = 'rgba(29,36,64,.25)'; g.beginPath(); g.ellipse(s.x, s.y + 14, 13 * (1 - drop * 0.5), 5, 0, 0, Math.PI * 2); g.fill();
    const sq = drop > 0 ? 1 : 1 + c.recoil * 0.05;
    const ok = sprite(g, CREW[c.type].icon, s.x + rx, s.y + 16 + bob + ry - drop * 220, size, { flip: c.flip, sy: 1 / sq, sx: sq });
    if (!ok) crewStandIn(g, CREW[c.type].color, s.x, s.y - drop * 220, size);
  }
  drawZombie(g, z) {
    const sz = 36 * (z.scale || 1) * (z.boss ? 3.1 : 1);
    const k = z.dead ? z.dying / 0.24 : 0;
    const walk = z.att ? Math.sin(this.t * 22 + z.ph) * 0.12 : Math.sin(z.ph) * 0.09;
    const sx = z.dead ? 1 + k * 0.6 : 1 + Math.abs(Math.sin(z.ph)) * 0.04, sy = z.dead ? 1 - k * 0.7 : 1 - Math.abs(Math.sin(z.ph)) * 0.04;
    if (!z.dead) { g.fillStyle = 'rgba(40,60,100,.2)'; g.beginPath(); g.ellipse(z.x, z.y + 1, sz * 0.32, sz * 0.12, 0, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = z.dead ? 1 - k : 1;
    const o = { flip: z.flip, rot: z.rot + walk, sx, sy, flash: z.dead ? 1 : z.flash > 0 ? 1 : 0, ice: z.slowT > 0 };
    if (z.boss && z.slam > 0) { z.slam -= 1 / 60; o.sy *= 0.85; o.sx *= 1.12; }
    if (!sprite(g, z.sprite, z.x, z.y - z.h, sz, o)) zombieStandIn(g, z.sprite, z.x, z.y - z.h, sz, o);
    g.globalAlpha = 1;
    if ((z.mini || z.heavy && z.type !== 'shield') && !z.dead && !z.boss && z.hp < z.max) {
      const w = 40, y = z.y - sz * 1.25;
      g.fillStyle = '#1d2440'; roundRect(g, z.x - w / 2 - 2, y - 2, w + 4, 9, 4); g.fill();
      g.fillStyle = '#ff4058'; roundRect(g, z.x - w / 2, y, w * Math.max(0, z.hp / z.max), 5, 2.5); g.fill();
    }
    if (z.burnT > 0 && !z.dead) { g.globalAlpha = 0.8; g.fillStyle = '#ff8a1f'; g.beginPath(); g.arc(z.x + Math.sin(this.t * 20) * 3, z.y - sz * 0.9, 5, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  }
  drawShot(g, s) {
    const a = Math.atan2(s.vy, s.vx);
    if (s.kind === 'bullet' || s.kind === 'pellet') {
      g.strokeStyle = '#1d2440'; g.lineWidth = 5.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - Math.cos(a) * 14, s.y - Math.sin(a) * 14); g.stroke();
      g.strokeStyle = s.color; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - Math.cos(a) * 14, s.y - Math.sin(a) * 14); g.stroke();
    } else if (s.kind === 'rocket') {
      g.save(); g.translate(s.x, s.y); g.rotate(a);
      g.fillStyle = '#1d2440'; roundRect(g, -11, -5, 22, 10, 5); g.fill();
      g.fillStyle = '#5a8f3c'; roundRect(g, -9, -3.5, 14, 7, 3.5); g.fill();
      g.fillStyle = '#ff4058'; g.beginPath(); g.moveTo(5, -3.5); g.lineTo(12, 0); g.lineTo(5, 3.5); g.fill();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(-12, 0, 4 + Math.random() * 2, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (s.kind === 'flame') {
      const k = s.t / s.life, r = 6 + k * 16;
      g.globalAlpha = 1 - k * 0.8;
      g.fillStyle = k < 0.3 ? '#fff3b0' : k < 0.6 ? '#ffb21c' : '#ff5a2e';
      g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    } else if (s.kind === 'ice') {
      g.save(); g.translate(s.x, s.y); g.rotate(a);
      g.fillStyle = '#1d2440'; g.beginPath(); g.moveTo(12, 0); g.lineTo(0, -6.5); g.lineTo(-10, 0); g.lineTo(0, 6.5); g.closePath(); g.fill();
      g.fillStyle = '#bfeaff'; g.beginPath(); g.moveTo(9.5, 0); g.lineTo(0, -4.5); g.lineTo(-7.5, 0); g.lineTo(0, 4.5); g.closePath(); g.fill();
      g.restore();
    }
  }
  drawCrate(g, c) {
    if (c.kind === 'crates') { sprite(g, 'crates', c.x, c.y + 10, 40); return; }
    if (c.kind === 'armory') {
      const p = 1 + Math.sin(this.t * 6) * 0.06;
      g.globalAlpha = 0.35 + 0.2 * Math.sin(this.t * 6); g.fillStyle = '#b98cff'; g.beginPath(); g.ellipse(c.x, c.y, 40, 22, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      sprite(g, 'chest-gold', c.x, c.y + 10, 46 * p);
      return;
    }
    if (c.kind === 'repair') {
      sprite(g, 'cabin', c.x, c.y + 30, 96);
      sprite(g, 'wrench', c.x, c.y - 74 + Math.sin(this.t * 4) * 4, 34);
    }
  }
  drawSign(g, s) {
    const r = ROUTES[s.key];
    const chosen = s.j.choice === s.side, other = s.j.choice && !chosen;
    const pulse = !s.j.choice ? 1 + Math.sin(this.t * 6) * 0.04 : chosen ? 1.08 : 0.9;
    g.save(); g.translate(s.x, s.y); g.scale(pulse, pulse);
    if (other) g.globalAlpha = 0.5;
    g.fillStyle = '#1d2440'; g.fillRect(-4, -10, 8, 40);
    g.fillStyle = '#8a5a3a'; g.fillRect(-2.5, -10, 5, 40);
    g.fillStyle = '#1d2440'; roundRect(g, -62, -74, 124, 70, 14); g.fill();
    g.fillStyle = r.color; roundRect(g, -59, -71, 118, 64, 12); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; roundRect(g, -55, -68, 110, 24, 9); g.fill();
    sprite(g, r.icon, -36, -26, 34);
    text(g, r.title.split(' ')[0], 12, -54, 15, '#ffffff');
    text(g, r.title.split(' ')[1] || '', 12, -37, 15, '#ffffff');
    text(g, r.sub.length > 16 ? r.sub.slice(0, 15) + '…' : r.sub, 0, -18, 10.5, '#ffffff', { stroke: 0.3 });
    if (chosen) { g.strokeStyle = '#ffffff'; g.lineWidth = 4; roundRect(g, -64, -76, 128, 74, 16); g.stroke(); }
    g.restore();
  }

  propsInView(v) {
    const S = 260, out = [];
    const c0 = Math.floor(-v.bot / S) - 1, c1 = Math.floor(-v.top / S) + 1;
    for (let c = c0; c <= c1; c++) {
      if (!this.chunks.has(c)) this.chunks.set(c, this.makeChunk(c, S));
      for (const p of this.chunks.get(c)) if (p.y > v.top - 140 && p.y < v.bot + 40 && p.x > v.left - 80 && p.x < v.right + 80) out.push(p);
    }
    if (this.chunks.size > 40) for (const key of this.chunks.keys()) if (key < c0 - 4 || key > c1 + 4) this.chunks.delete(key);
    return out;
  }
  makeChunk(c, S) {
    const r = seeded(Math.abs(c * 7919 + 1013) + 1), out = []; // positive seed: chunks behind the start (c < 0) were all big trees on the track
    const tot = PROPS.reduce((s, p) => s + p[2], 0);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const d = c * S + r() * S;
      let q = r() * tot, name = PROPS[0][0];
      for (const [nm, , w] of PROPS) { if ((q -= w) < 0) { name = nm; break; } }
      const side = r() < 0.5 ? -1 : 1;
      const rx = r(), w = PROP_W[name] * (0.85 + r() * 0.3);
      // keep the whole sprite (half width) off the rails and the cars (half width 43) on every track
      let rail = 0;
      for (const j of this.junctions) if (d > j.d0 - 160 && d < j.d1 + 120) rail = BRANCH;
      let clear = rail + 43 + 22 + w / 2;
      if (d > STAGE.length - 200 && d < STAGE.length + 400) clear = Math.max(clear, 150 + w / 2);
      const x = TRACK + side * (clear + rx * 230);
      out.push({ name, x, y: -d, w, flip: r() < 0.5 });
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
