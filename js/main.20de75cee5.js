// Screens and flow: loading, the depot lobby (train idling in the yard), crew and
// train upgrade pages, the run with its HUD, level-up cards, routes and results.
import { loadArt, art } from './art.27597f9460.js';
import { Run } from './run.6f1d7aa597.js';
import { CREW, ROUTES, STAGE } from './data.6a0c6c4d8b.js';
import { save, persist, tickFuel, MAX_FUEL, FUEL_COST, FUEL_MS, today, fmt, upCost } from './save.ce36348db2.js';
import { sfx, buzz, unlockAudio, applySettings, duckMusic } from './audio.a7f44784ac.js';
import { $, $$, el, tap, ICON, UI, POR, openModal, closeAllModals, toast, flyIcons, rectIn, bump, confetti, countUp, fakeAd, curtain, wait, cq } from './ui.ddb8ef444b.js';
const portrait = (id) => `<img class="por" src="${POR(id)}" alt="">`;

const cv = $('#game');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let run = null, mode = 'loading', last = performance.now(), tab = 'home';
let routeJ = null, routeT = 0, rerolls = 1, cardCb = null;
const SEATS = (w) => 1 + 2 * w;                   // engine seat + 2 per wagon
const MAX_WAGONS = 3;

// ---------- boot ----------
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('pointerup', () => { unlockAudio(); applySettings(); }, { capture: true });

(async function boot() {
  const bar = $('#loadBar'), pct = $('#loadPct');
  let shown = 0;
  await Promise.all([
    document.fonts.load('20px Lilita').catch(() => {}),
    document.fonts.load('italic 800 20px Heavy').catch(() => {}),
    document.fonts.load('italic 600 20px Heavy').catch(() => {}),
    loadArt((p) => { shown = Math.max(shown, p); bar.style.width = shown * 100 + '%'; pct.textContent = Math.round(shown * 100) + '%'; }),
  ]);
  bar.style.width = '100%'; pct.textContent = '100%';
  // keep the key art up long enough to read the logo, even on a warm cache
  await wait(Math.max(300, 1100 - performance.now()));
  tickFuel();
  showLobby(true);
  $('#loading').style.opacity = 0;
  setTimeout(() => $('#loading').classList.add('hidden'), 400);
  requestAnimationFrame(loop);
})();

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (run) run.step(dt);
  if (mode === 'run') routeTick(dt);
  requestAnimationFrame(loop);
}

// ---------- lobby ----------
function lineup() {
  const seats = SEATS(save.train.wagons);
  // only the captain rides until the player picks more riders on the crew page; the rest come from cards in the run
  const list = (save.lineup || ['captain']).filter((t) => save.crew[t] && save.crew[t].owned);
  if (!list.length) list.push('captain');
  return list.slice(0, seats);
}
function crewLv() { return Object.fromEntries(Object.entries(save.crew).map(([t, c]) => [t, c.lv])); }

// lobby camera: the train fills the middle of the home screen, and sits above the panel on the Train tab
const SHOW = { home: { fy: 0.25, span: 0.41, max: 1.9 }, train: { fy: 0.14, span: 0.29, max: 1.6 } };
function showcase(rebuild = true) {
  const sc = { ...SHOW[tab === 'train' ? 'train' : 'home'] };
  if (!rebuild && run && run.opts.showcase) { run.opts.showcase = sc; return; }
  run = new Run(cv, {}, { showcase: sc, wagons: save.train.wagons, lineup: lineup(), armorLv: save.train.armor });
}

function showLobby(first = false) {
  mode = 'lobby';
  $('#hud').classList.add('hidden'); $('#cards').classList.add('hidden'); $('#result').classList.add('hidden');
  $('#lobby').classList.remove('hidden');
  showcase();
  setTab('home', true);
  refreshTop();
  refreshHome();
  if (first && save.runs === 0) setTimeout(() => toast('Tap START to roll out!'), 600);
}

function refreshTop() {
  tickFuel();
  $('#fuelTxt').textContent = `${save.fuel}/${MAX_FUEL}`;
  const sub = $('#fuelSub');
  if (save.fuel >= MAX_FUEL) sub.textContent = 'FULL';
  else { const left = FUEL_MS - (Date.now() - save.fuelT); sub.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`; }
  $('#coinTxt').textContent = fmt(save.coins);
  $('#gemTxt').textContent = fmt(save.gems);
  $('#dailyDot').classList.toggle('hidden', save.daily.last === today());
  $('#patrolBadge').textContent = fmt(depotAmount());
  $('#crewDot').classList.toggle('hidden', !Object.entries(save.crew).some(([, c]) => c.owned && save.coins >= upCost(c.lv)));
}
setInterval(() => { if (mode === 'lobby') refreshTop(); }, 1000);

function refreshHome() {
  $('#chapTxt').textContent = `CHAPTER ${STAGE.chapter}`;
  $('#stageName').textContent = STAGE.name.toUpperCase();
  const stars = save.stars || 0;
  $('#stageStars').innerHTML = [0, 1, 2].map((i) => `<img src="${UI(i < stars ? 'i-star' : 'i-star-empty')}" alt="">`).join('');
  const lu = lineup();
  $('#lineup').innerHTML = `<div class="pill lbl t t-thin">Line-up ${lu.length}/${SEATS(save.train.wagons)}</div><div class="slots">${
    Array.from({ length: SEATS(save.train.wagons) }, (_, i) => lu[i]
      ? `<button class="btn slot" data-crew="${lu[i]}" style="--c:${CREW[lu[i]].color}">${portrait(lu[i])}<b class="t t-thin">${save.crew[lu[i]].lv}</b></button>`
      : `<button class="btn slot empty" data-empty><img src="${UI('i-plus')}" alt=""></button>`).join('')}</div>`; // an open seat, not a locked one
  $$('#lineup .slot').forEach((b) => tap(b, () => setTab('crew')));
}

// the depot keeps earning coins while you are away (Survivor.io's patrol idea)
const DEPOT_RATE = 40, DEPOT_CAP_H = 8;
function depotAmount() {
  if (!save.depotT) { save.depotT = Date.now() - 45 * 60000; persist(); }
  const h = Math.min(DEPOT_CAP_H, (Date.now() - save.depotT) / 3600000);
  return Math.floor(h * DEPOT_RATE * (1 + 0.25 * (save.stars ? 1 : 0)));
}

tap($('#playBtn'), () => startRun());
tap($('#stagePrev'), () => toast('Chapter 1 is the first one'));
tap($('#stageNext'), () => toast('Clear Frost Line to open Chapter 2'));
tap($('#gearBtn'), settings);
tap($('#coinPill'), () => setTab('shop'));
tap($('#gemPill'), () => setTab('shop'));
tap($('#fuelPill'), fuelPopup);
tap($('#patrolBtn'), depotPopup);
tap($('#dailyBtn'), dailyPopup);
tap($('#passBtn'), passPopup);
tap($('#eventBtn'), () => setTab('rails'));
$$('.nav .tab').forEach((b) => tap(b, () => setTab(b.dataset.tab)));

function setTab(t, quiet = false) {
  tab = t;
  $$('.nav .tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $('#homePage').classList.toggle('hidden', t !== 'home');
  for (const p of ['crew', 'train', 'shop', 'rails']) $(`#${p}Page`).classList.toggle('hidden', t !== p);
  if (t === 'crew') crewPage();
  if (t === 'train') trainPage();
  if (t === 'shop') shopPage();
  if (t === 'rails') railsPage();
  if (t === 'home') refreshHome();
  if (mode === 'lobby') showcase(false);
  if (!quiet) sfx.whoosh();
}

// ---------- crew page: collect crew, level them, pick who rides ----------
function crewPage() {
  const lu = lineup();
  const page = $('#crewPage');
  page.innerHTML = `<div class="head t">CREW</div>
    <div class="hint t t-thin">Tap a crew member to level up. Riders start every run on the roof.</div>
    <div class="grid">${Object.entries(CREW).map(([t, d]) => {
      const c = save.crew[t];
      const on = lu.includes(t);
      return `<button class="btn ccard ${c.owned ? '' : 'locked'} ${on ? 'riding' : ''}" data-t="${t}" style="--c:${d.color}">
        <span class="art">${portrait(t)}</span>
        <span class="nm t t-thin">${d.name}</span>
        ${c.owned ? `<span class="lvl t t-thin">Lv ${c.lv}</span>` : `<span class="lvl t t-thin"><img src="${UI('i-lock')}" alt="">Find in runs</span>`}
        ${on ? '<span class="tag t t-thin">RIDING</span>' : ''}
      </button>`;
    }).join('')}</div>`;
  $$('.ccard', page).forEach((b) => tap(b, () => crewPopup(b.dataset.t)));
}

function crewPopup(t) {
  const d = CREW[t], c = save.crew[t];
  const cost = upCost(c.lv);
  const lu = lineup();
  const on = lu.includes(t);
  const stat = (k, v, n) => `<div class="stat"><span class="k t t-thin">${k}</span><span class="v t t-thin">${v}${n ? `<em> ${n}</em>` : ''}</span></div>`;
  const dmg = Math.round(d.dmg * (1 + 0.3 * (c.lv - 1)) * 10) / 10, dmgN = Math.round(d.dmg * (1 + 0.3 * c.lv) * 10) / 10;
  const m = openModal({
    title: d.name.toUpperCase(), ribbon: 'blue', cls: 'crewpop',
    body: `<div class="hero" style="--c:${d.color}">${portrait(t)}</div>
      <div class="desc t t-thin">${d.desc}</div>
      ${stat('Damage', dmg, c.owned ? `→ ${dmgN}` : '')}${stat('Range', d.range)}${stat('Shots / sec', d.rate)}`,
    buttons: c.owned
      ? `<button class="btn btn-green t up" ${save.coins < cost ? 'disabled' : ''}><img src="${UI('i-coin')}" alt="">${fmt(cost)}<small>LEVEL UP</small></button>
         <button class="btn ${on ? 'btn-red' : 'btn-blue'} t ride">${on ? 'Bench' : 'Ride'}</button>`
      : `<div class="locknote t t-thin">Pick this crew from a level-up card in a run to recruit them.</div>`,
  });
  tap($('.up', m.el), () => {
    if (save.coins < cost) { toast('Not enough coins'); return; }
    save.coins -= cost; c.lv++; persist();
    sfx.upgrade(); buzz(20); confetti(24);
    m.close(); crewPage(); refreshTop(); crewPopup(t);
  });
  tap($('.ride', m.el), () => {
    let list = lineup();
    if (on) { if (list.length <= 1) { toast('Someone has to ride!'); return; } list = list.filter((x) => x !== t); }
    else { if (list.length >= SEATS(save.train.wagons)) list.pop(); list.push(t); }
    save.lineup = list; persist();
    m.close(); crewPage(); showcase();
  });
}

// ---------- train page: plow, armour, wagons ----------
const TRAIN_UP = [
  { k: 'wagons', name: 'Wagons', icon: 'train', text: (lv) => `${lv} wagon${lv > 1 ? 's' : ''}, ${SEATS(lv)} crew seats`, max: MAX_WAGONS, cost: (lv) => [0, 600, 1800][lv] || 0 },
  { k: 'plow', name: 'Snow Plow', icon: 'wrench', text: (lv) => `Plow damage x${lv}`, max: 8, cost: (lv) => upCost(lv + 1) },
  { k: 'armor', name: 'Armor', icon: 'shield', text: (lv) => `Train HP +${(lv - 1) * 15}%`, max: 8, cost: (lv) => upCost(lv + 1) },
];
function trainPage() {
  const page = $('#trainPage');
  page.innerHTML = `<div class="tpanel"><div class="plate t">TRAIN</div>
    <div class="hint t t-thin">A bigger train holds more crew. Each wagon is a target too.</div>
    <div class="rows">${TRAIN_UP.map((u) => {
      const lv = save.train[u.k], maxed = lv >= u.max, cost = u.cost(lv);
      return `<div class="urow"><span class="ic"><img src="${ICON(u.icon)}" alt=""></span>
        <span class="tx"><b class="t t-thin">${u.name} <em>Lv ${lv}</em></b><small class="t-thin">${u.text(lv)}</small></span>
        ${maxed ? '<span class="max t t-thin">MAX</span>' : `<button class="btn btn-green t t-thin buy" data-k="${u.k}" ${save.coins < cost ? 'disabled' : ''}><img src="${UI('i-coin')}" alt="">${fmt(cost)}</button>`}
      </div>`;
    }).join('')}</div></div>`;
  $$('.buy', page).forEach((b) => tap(b, () => {
    const u = TRAIN_UP.find((x) => x.k === b.dataset.k), cost = u.cost(save.train[u.k]);
    if (save.coins < cost) { toast('Not enough coins'); return; }
    save.coins -= cost; save.train[u.k]++; persist();
    sfx.upgrade(); buzz(20);
    if (u.k === 'wagons') { sfx.horn(); confetti(40); }
    trainPage(); refreshTop(); showcase();
  }));
}

// ---------- shop (mock offers, no real payments) ----------
function shopPage() {
  const page = $('#shopPage');
  const offers = [
    { n: 'Starter Crate', i: 'chest-gold', d: 'Rocketeer + 2,000 coins', p: '$3.99', hot: true },
    { n: 'Coin Sack', i: 'coin', d: '5,000 coins', p: '120', gem: true },
    { n: 'Fuel Can', i: 'fuel', d: 'Refill fuel to full', p: '40', gem: true },
    { n: 'Free Crate', i: 'chest-wood', d: 'Watch an ad', p: 'FREE', ad: true },
  ];
  page.innerHTML = `<div class="head t">SHOP</div><div class="hint t t-thin">Mock shop: prices are placeholders, nothing is sold.</div>
    <div class="offers">${offers.map((o, i) => `<button class="btn offer ${o.hot ? 'hot' : ''}" data-i="${i}"><img src="${ICON(o.i)}" alt=""><b class="t t-thin">${o.n}</b><small class="t-thin">${o.d}</small>
      <span class="price t t-thin ${o.ad ? 'ad' : ''}">${o.gem ? `<img src="${UI('i-gem')}" alt="">` : ''}${o.p}</span>${o.hot ? '<i class="ribbon t t-thin">BEST</i>' : ''}</button>`).join('')}</div>`;
  $$('.offer', page).forEach((b) => tap(b, async () => {
    const o = offers[b.dataset.i];
    if (o.ad) { await fakeAd(3); gain(150, rectIn(b)); return; }
    if (o.gem) {
      const p = +o.p;
      if (save.gems < p) { toast('Not enough gems'); return; }
      save.gems -= p;
      if (o.i === 'fuel') save.fuel = MAX_FUEL; else gain(5000, rectIn(b));
      persist(); refreshTop(); sfx.upgrade(); return;
    }
    toast('Mock build: no real purchases');
  }));
}

// ---------- rails: one clear route, numbered stations, friends pinned where they are ----------
// Layout follows the Candy Crush map (one road up the screen, numbered pins, scenery pushed to the edges)
// and Train Attack's chapter chests. World units are cqw; the world is 217cqw tall and sits on the page bottom.
const RW = 217;
const RSTATIONS = ['FROST LINE', 'PINE WOODS', 'ICE BRIDGE', 'FROZEN LAKE', 'COAL MINE', 'SNOW TUNNEL'];
const RFRIENDS = [ // sample players (fixed), placed beside the station they have reached
  { n: 'Ava', at: 2, icon: 'crew-captain', c: '#3d8bff', side: -1 },
  { n: 'Leo', at: 4, icon: 'crew-gunner', c: '#ff8a1f', side: -1 },
  { n: 'Maya', at: 5, icon: 'crew-rocket', c: '#9b5cf6', side: 1 },
];
const RSTAR_CHESTS = [[6, 'chest-wood'], [12, 'chest-silver'], [21, 'chest-gold']];
const ROAD = 15;                                                   // half width of the cleared snow road
const railX = (y) => 50 + 5.5 * Math.sin((RW - y - 40) / 16);      // y = cqw from the world top
function railsLayout(cur) {
  // stations from the bottom; the gap under the current station leaves room for your train
  const out = []; let yb = 54;
  for (let i = 1; i <= RSTATIONS.length; i++) { if (i === cur) yb += 17; out.push({ i, y: RW - yb }); yb += 16.5; }
  out.forEach((s) => { s.x = railX(s.y); });
  return { pins: out, boss: { x: railX(RW - yb - 1), y: RW - yb - 1 } };
}
function railsTrees(skip) {
  const r = (() => { let s = 4242; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const kinds = [['tree-big', 17, 5, 1.37], ['tree-small', 12, 4, 1.34], ['rock-big', 11, 1.2, 0.98], ['rock-small', 8, 1.4, 0.89], ['snowman', 8, 0.25, 1.26]]; // name, width, weight, height/width
  const tot = kinds.reduce((a, k) => a + k[2], 0), out = [];
  for (let gy = 8; gy < RW + 6; gy += 8.5) for (let gx = -2; gx < 104; gx += 9.5) {
    const x = gx + (r() - 0.5) * 6, y = gy + (r() - 0.5) * 5;
    let q = r() * tot, k = kinds[0]; for (const kk of kinds) if ((q -= kk[2]) < 0) { k = kk; break; }
    const w = k[1] * (0.85 + r() * 0.3), h = w * k[3];
    // the whole sprite, from its base up to its top, must stay outside the road (so never on the rails)
    let ok = true;
    for (let t = 0; t <= 1; t += 0.25) if (Math.abs(x - railX(y - h * t)) < ROAD + w / 2 + 1.5) ok = false;
    if (ok && skip.some(([x0, y0, x1, y1]) => x + w / 2 > x0 && x - w / 2 < x1 && y > y0 && y - h < y1)) ok = false;
    if (ok) out.push({ k: k[0], x, y, w });
  }
  return out.sort((a, b) => a.y - b.y);
}
// lay the generated vertical rail tile along a centre line given in cqw (x across, y down the world)
function paintRailTrack(cv, pts) {
  const t = art['w-track-v']; if (!t) return;
  const u = cq(1), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(100 * u * dpr); cv.height = Math.round(RW * u * dpr);
  const g = cv.getContext('2d'); g.scale(u * dpr, u * dpr);
  const TW = 8.6, N = 18, sh = t.h / N, step = sh * TW / t.w;
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0); segs.push([x0, y0, x1, y1, L, total]); total += L; }
  for (let d = 0, n = 0, j = 0; d < total; d += step, n++) {
    while (j < segs.length - 1 && d > segs[j][5] + segs[j][4]) j++;
    const [x0, y0, x1, y1, L, at] = segs[j], f = (d - at) / L;
    g.save(); g.translate(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f); g.rotate(Math.atan2(-(x1 - x0), y1 - y0));
    g.drawImage(t.img, 0, (n % N) * sh, t.w, sh, -TW / 2, -step / 2 - 0.05, TW, step + 0.1);
    g.restore();
  }
}
function railsPage() {
  const page = $('#railsPage');
  const cleared = save.wins > 0 ? 1 : 0, cur = cleared + 1;        // the mock has one stage, so one win opens station 2
  const stars = save.stars || 0, starTot = 21;
  const L = railsLayout(cur);
  const now = L.pins[cur - 1];
  const cabin = { x: 12, y: L.pins[3].y + 4, w: 24 };         // left of station 4, clear of Leo's pin
  const fx = (f) => L.pins[f.at - 1].x + f.side * (f.at === cur ? 15.5 : 12.5); // sit further out beside the big current pin
  const trees = railsTrees([[cabin.x - 15, cabin.y - 30, cabin.x + 15, cabin.y + 2], [79, 58, 100, 84], [now.x + 6, now.y - 5, now.x + 42, now.y + 5],
    ...RFRIENDS.map((f) => [fx(f) - 7, L.pins[f.at - 1].y - 6, fx(f) + 7, L.pins[f.at - 1].y + 8])]);
  // track: the generated rail tile laid along the centre line, one sleeper slice at a time
  const pts = []; for (let y = -6; y <= RW + 6; y += 1.5) pts.push([railX(y), y]);
  const sprite = (p) => `<img class="rprop" src="${ICON(p.k)}" style="left:${p.x}cqw;top:${p.y}cqw;width:${p.w}cqw" alt="">`;
  const pin = (s) => {
    const st = s.i < cur ? 'done' : s.i === cur ? 'now' : 'lock';
    const got = s.i === 1 ? stars : 0;
    return `<button class="btn rpin ${st}" data-i="${s.i}" style="left:${s.x}cqw;top:${s.y}cqw"><b class="t">${s.i}</b>
      ${st === 'done' ? `<span class="pst">${[0, 1, 2].map((k) => `<img src="${UI('i-star')}" class="${k < got ? 'on' : ''}" alt="">`).join('')}</span>` : ''}
      ${st === 'lock' ? `<img class="plock" src="${UI('i-lock')}" alt="">` : ''}</button>`;
  };
  const friend = (f) => { const s = L.pins[f.at - 1]; return `<div class="rfriend ${f.side < 0 ? 'l' : 'r'}" style="left:${fx(f)}cqw;top:${s.y}cqw;--c:${f.c}">
      <span class="av"><img src="${ICON(f.icon)}" alt=""></span><span class="nm pill t t-thin">${f.n}</span></div>`; };
  page.innerHTML = `<div class="rscroll"><div class="world">
      <canvas class="rtrack"></canvas>
      <img class="rprop" src="${ICON('cabin')}" style="left:${cabin.x}cqw;top:${cabin.y}cqw;width:${cabin.w}cqw" alt="">
      ${trees.map(sprite).join('')}
      <button class="btn rboss" style="left:${L.boss.x}cqw;top:${L.boss.y}cqw"><span class="gate"><img src="${ICON('z-yeti')}" alt=""></span><span class="tag t t-thin">BOSS</span></button>
      ${L.pins.map(pin).join('')}
      <div class="rname pill t t-thin" style="left:${now.x + 7.5}cqw;top:${now.y}cqw">${RSTATIONS[cur - 1]}</div>
      <div class="ryou" style="left:${now.x}cqw;top:${now.y + 15.5}cqw"><img src="${ICON('car-loco')}" alt=""><span class="t t-thin">YOU</span></div>
      ${RFRIENDS.map(friend).join('')}
    </div></div>
    <div class="rhead plate"><span class="st t"><img src="${UI('i-star')}" alt="">${stars}/${starTot}</span>
      <span class="bar"><i style="width:${(stars / starTot) * 100}%"></i>
        ${RSTAR_CHESTS.map(([n, c]) => `<button class="btn ch ${stars >= n ? 'open' : ''}" data-n="${n}" style="left:${(n / starTot) * 100}%"><img src="${ICON(c)}" alt=""></button>`).join('')}</span></div>
    <button class="btn sbtn rconvoy" id="convoyBtn"><span class="disc"><img src="${ICON('z-yeti')}" alt=""></span><span class="badge t-thin">2d 4h</span><span class="lbl t t-thin">Convoy</span></button>
    <button class="btn btn-yellow t" id="railPlay"><span>PLAY</span><small class="cost t t-thin"><img src="${UI('i-fuel')}" alt="">${FUEL_COST}</small></button>`;
  paintRailTrack($('.rtrack', page), pts);
  const sc = $('.rscroll', page);
  requestAnimationFrame(() => { sc.scrollTop = now.y * (sc.clientWidth / 100) - sc.clientHeight * 0.55; }); // short screens scroll; open on your station
  tap($('#convoyBtn', page), () => toast('Convoy: link up with 3 trains to beat the Yeti King. A design idea, not in this mock'));
  tap($('#railPlay', page), () => startRun());                    // the mock has one stage; every open station plays it
  $$('.rpin', page).forEach((b) => tap(b, () => {
    const i = +b.dataset.i;
    if (i > cur) toast(`Clear station ${i - 1} first`);
    else startRun();
  }));
  tap($('.rboss', page), () => toast('Yeti King waits after station 6'));
  $$('.rhead .ch', page).forEach((b) => tap(b, () => toast(`${b.dataset.n} stars opens this chest`)));
}

// ---------- popups ----------
function gain(n, from) {
  save.coins += n; persist();
  const k = Math.min(12, 3 + Math.floor(n / 50));
  flyIcons(UI('i-coin'), from, $('#coinPill'), k, { onEach: () => { sfx.coin(); bump($('#coinPill')); } }).then(refreshTop);
}
function depotPopup() {
  const n = depotAmount();
  const m = openModal({
    title: 'DEPOT', ribbon: 'green',
    body: `<img class="bigicon" src="${ICON('chest-silver')}" alt=""><div class="t t-thin">Your yard crew earns coins while you are away.</div><div class="amount t"><img src="${UI('i-coin')}" alt="">${fmt(n)}</div><div class="t t-thin small">Fills for up to ${DEPOT_CAP_H} hours</div>`,
    buttons: `<button class="btn btn-green t claim">Collect</button><button class="btn btn-blue t t-thin x2"><img src="${UI('i-ad')}" alt="">x2</button>`,
  });
  const claim = (mult) => { save.depotT = Date.now(); gain(n * mult, rectIn($('.bigicon', m.el))); m.close(); };
  tap($('.claim', m.el), () => claim(1));
  tap($('.x2', m.el), async () => { await fakeAd(3); claim(2); });
}
function dailyPopup() {
  const done = save.daily.last === today();
  const day = (save.daily.n || 0) % 7;
  const rewards = [100, 150, 'gem', 250, 300, 'gem', 'chest-gold'];
  const m = openModal({
    title: 'DAILY', ribbon: 'orange',
    body: `<div class="days">${rewards.map((r, i) => `<div class="day ${i < day || (done && i === day - 1) ? 'got' : ''} ${i === day && !done ? 'now' : ''}"><span class="t t-thin">Day ${i + 1}</span><img src="${typeof r === 'number' ? UI('i-coin') : r === 'gem' ? UI('i-gem') : ICON(r)}" alt=""><b class="t t-thin">${typeof r === 'number' ? r : r === 'gem' ? '20' : 'Crate'}</b></div>`).join('')}</div>`,
    buttons: done ? '<div class="t t-thin">Come back tomorrow!</div>' : '<button class="btn btn-green t claim">Claim</button>',
  });
  tap($('.claim', m.el), () => {
    const r = rewards[day];
    save.daily.last = today(); save.daily.n = (save.daily.n || 0) + 1;
    if (typeof r === 'number') gain(r, rectIn($('.day.now', m.el)));
    else if (r === 'gem') { save.gems += 20; sfx.upgrade(); }
    else gain(800, rectIn($('.day.now', m.el)));
    persist(); m.close(); refreshTop();
  });
}
function passPopup() {
  openModal({
    title: 'TRAIN PASS', ribbon: 'purple',
    body: `<div class="t t-thin">Season pass: free and premium reward tracks, filled by daily jobs.</div><div class="t t-thin small">Design note: Survivor.io sells its pass at $19.99 with a free tier. Not built in this mock.</div>`,
    buttons: '<button class="btn btn-blue t" data-close>OK</button>',
  });
}
function fuelPopup() {
  const m = openModal({
    title: 'FUEL', ribbon: 'orange',
    body: `<img class="bigicon" src="${UI('i-fuel')}" alt=""><div class="t t-thin">Each run burns ${FUEL_COST} fuel. One comes back every ${FUEL_MS / 60000} minutes.</div>`,
    buttons: `<button class="btn btn-blue t t-thin ad"><img src="${UI('i-ad')}" alt="">+${FUEL_COST}</button>`,
  });
  tap($('.ad', m.el), async () => { await fakeAd(3); save.fuel = Math.min(MAX_FUEL, save.fuel + FUEL_COST); persist(); refreshTop(); m.close(); });
}
function settings() {
  const row = (k, n) => `<button class="btn setrow t t-thin" data-k="${k}"><span>${n}</span><i class="sw ${save.settings[k] ? 'on' : ''}"></i></button>`;
  const m = openModal({ title: 'SETTINGS', ribbon: 'blue', body: row('music', 'Music') + row('sound', 'Sound') + row('vibe', 'Vibration') + '<div class="t t-thin small">Mock build. Progress is saved on this device only.</div>' });
  $$('.setrow', m.el).forEach((b) => tap(b, () => { const k = b.dataset.k; save.settings[k] = !save.settings[k]; persist(); applySettings(); $('.sw', b).classList.toggle('on', save.settings[k]); }));
}

// ---------- run ----------
async function startRun() {
  tickFuel();
  if (save.fuel < FUEL_COST) { fuelPopup(); return; }
  save.fuel -= FUEL_COST; if (!save.fuelT) save.fuelT = Date.now(); persist();
  refreshTop();
  bump($('#fuelPill'));
  sfx.horn(); buzz(30);
  await curtain(async () => {
    closeAllModals();
    $('#lobby').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    mode = 'run'; rerolls = 1; routeJ = null;
    $('#routes').classList.add('hidden'); $('#bossBar').classList.add('hidden');
    const armor = 1 + 0.15 * (save.train.armor - 1);
    run = new Run(cv, hooks, { wagons: save.train.wagons, lineup: lineup(), crewLv: crewLv(), hpMul: armor, armorLv: save.train.armor });
    run.mods.plow = save.train.plow;
    buildNodes();
  });
  banner('ROLL OUT!', 'green');
}

function buildNodes() {
  const host = $('#progNodes');
  host.innerHTML = STAGE.nodes.map((d, i) => `<img class="node" data-i="${i}" src="${UI('i-chest')}" style="left:${(d / STAGE.length) * 100}%" alt="">`).join('');
}

const hooks = {
  onGo() {},
  onHud(h) {
    $('#progFill').style.width = h.prog * 100 + '%';
    $('#progEngine').style.left = h.prog * 100 + '%';
    $$('#progNodes .node').forEach((n, i) => n.classList.toggle('done', h.nodes[i].done));
    $('#lvTxt').textContent = h.lv;
    $('#xpFill').style.width = Math.min(1, h.xp / h.need) * 100 + '%';
    $('#xpFill').parentElement.classList.toggle('x2', h.xpx > 1);
    $('#runCoinTxt').textContent = fmt(h.coins);
    $('#killTxt').textContent = fmt(h.kills);
    $('#odBtn').style.setProperty('--p', Math.max(0, Math.min(1, h.odT > 0 ? h.odT / 5 : h.od)).toFixed(3));
    $('#odBtn').classList.toggle('ready', h.od >= 1 && h.odT <= 0);
    $('#odBtn').classList.toggle('active', h.odT > 0);
    const cb = $('#combo');
    if (h.combo >= 10) { cb.classList.remove('hidden'); if (cb.dataset.n !== String(h.combo)) { cb.dataset.n = h.combo; cb.textContent = `x${h.combo} COMBO`; bump(cb); } }
    else cb.classList.add('hidden');
    if (h.boss !== null) {
      const bb = $('#bossBar'), w = h.boss * 100 + '%';
      bb.classList.remove('hidden');
      if (bb.dataset.v && h.boss < +bb.dataset.v - 0.001 && performance.now() - (+bb.dataset.at || 0) > 140) { bb.dataset.at = performance.now(); bb.classList.remove('hit'); void bb.offsetWidth; bb.classList.add('hit'); }
      // the yellow trail eases down after the red, so each burst of damage shows as a yellow chunk
      const now = performance.now(), dt = Math.min(0.1, (now - (+bb.dataset.tt || now)) / 1000);
      let tr = Math.max(h.boss, bb.dataset.tr ? +bb.dataset.tr : h.boss);
      tr -= (tr - h.boss) * (1 - Math.exp(-dt * 2.5));
      bb.dataset.tt = now; bb.dataset.tr = tr; bb.dataset.v = h.boss;
      $('#bossFill').style.width = w; $('#bossTrail').style.width = tr * 100 + '%';
    } else { const bb = $('#bossBar'); bb.classList.add('hidden'); delete bb.dataset.v; delete bb.dataset.tr; delete bb.dataset.tt; }
  },
  onBanner: (s, c) => banner(s, c),
  onLevelUp(choices, rare, title, cb) { showCards(choices, rare, title, cb); },
  onJunction(j) { routeJ = j; routeT = 0; showRoutes(j); },
  onChosen(j, side, key, auto) {
    if (routeJ === j) { $('#routes').classList.add('hidden'); routeJ = null; }
    const r = ROUTES[key];
    banner(r.title, key === 'horde' ? 'red' : key === 'armory' ? 'purple' : key === 'supply' ? 'orange' : 'green');
    if (auto) toast('Auto-picked the left track');
  },
  onRouteEnd() {},
  onChest(i) {
    const n = $(`#progNodes .node[data-i="${i}"]`);
    bump(n, 'pop');
    run.pause.add('chest');
    setTimeout(() => chestOpen(i), 450);
  },
  onBoss() { $('#bossBar').classList.remove('hidden'); bigWarn(); duckMusic(true); },
  onBossDown() { $('#bossBar').classList.add('hidden'); duckMusic(false); banner('BOSS DOWN!', 'green'); confetti(60); },
  onCoinFly(x, y) {
    flyIcons(UI('i-coin'), { x, y }, $('#runCoins'), 1, { size: 6, spread: 6, onEach: () => bump($('#runCoins')) });
  },
  onEnd(r) { r.win ? winScreen(r) : loseScreen(r); },
};

function banner(s, color = 'blue') {
  const b = $('#banner');
  b.textContent = s; b.className = `t show ${color}`;
  clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), 1500);
}
function bigWarn() {
  const w = el(`<div class="bosswarn"><div class="t txt">BOSS INCOMING</div><div class="t t-thin sub">YETI KING</div></div>`);
  $('#overlayHost').appendChild(w);
  setTimeout(() => w.remove(), 2400);
}

// junction: a warning sign with a countdown clock, and one arrow sign per track at the sides of the train
function showRoutes(j) {
  const box = $('#routes');
  j.opts.forEach((key, i) => {
    const r = ROUTES[key], b = $(i ? '.route.r' : '.route.l', box);
    b.style.setProperty('--c', r.color);
    b.innerHTML = `<img class="face" src="${UI('ui-sign-' + r.sign)}" alt=""><span class="body"><img src="${UI(r.ui)}" alt=""><span class="txt"><b class="t">${r.title}</b><small class="t t-thin">${r.sub}</small></span></span>`;
  });
  box.classList.remove('hidden');
  bump(box, 'in');
  sfx.warn();
  routeTick();
}
$$('#routes .route').forEach((b) => tap(b, () => { if (routeJ && run) run.choose(routeJ, +b.dataset.side); }, { sound: false }));
function routeTick() {
  if (!routeJ || !run) return;
  const left = Math.max(0, routeJ.d0 - 25 - run.D), secs = Math.ceil(left / Math.max(run.speed, 20));
  $('#routeClock').style.setProperty('--p', Math.min(1, left / 575).toFixed(3));
  const sec = $('#routeSec');
  if (sec.textContent !== String(secs)) { sec.textContent = secs; if (secs <= 3) bump(sec); }
  $('#routeClock').classList.toggle('hurry', secs <= 3);
}
// tapping the left or right half of the screen also throws the switch
cv.addEventListener('pointerdown', (e) => {
  if (mode !== 'run' || !run || !routeJ || run.paused) return;
  const r = cv.getBoundingClientRect();
  run.choose(routeJ, e.clientX - r.left < r.width / 2 ? -1 : 1);
});

tap($('#odBtn'), () => { if (run && run.useOverdrive()) { banner('FULL STEAM!', 'orange'); bump($('#odBtn')); } }, { sound: false });
tap($('#pauseBtn'), pauseMenu);

// level-up cards
// one colour per kind: crew green, upgrade blue, train orange (frames and art discs are generated pictures)
const KIND = { crew: ['CREW', '#3ccf4e', 'green'], lv: ['CREW', '#3ccf4e', 'green'], up: ['UPGRADE', '#3d8bff', 'blue'], train: ['TRAIN', '#ff8a1f', 'orange'] };
function cardHtml(c, rare) {
  const [tag, col, frame] = KIND[c.kind] || KIND.up;
  let badge = '';
  const key = c.kind === 'crew' || c.kind === 'lv' ? 'cp-' + c.crew : c.art;
  if (c.kind === 'crew' || c.kind === 'lv') badge = c.kind === 'crew' ? 'NEW' : `LV ${c.lv + (rare ? 2 : 1)}`;
  const art = `<img src="${UI(key)}" alt="">`;
  const [l1, l2] = c.text.split('\n');
  return `<button class="btn kard ${rare ? 'rare' : ''} k-${c.kind}" style="--c:${col}">
    <img class="frame" src="${UI(rare ? 'card-gold' : 'card-' + frame)}" alt="">
    <span class="tag t t-thin">${tag}</span>
    ${badge ? `<i class="lvtag t t-thin">${badge}</i>` : ''}
    <span class="art">${art}</span>
    <b class="t">${c.title}</b>
    <small class="t t-thin">${l1}<br>${l2 || ''}</small>
    ${rare ? '<i class="rare t t-thin">x1.5</i>' : ''}
  </button>`;
}
function showCards(choices, rare, title, cb) {
  cardCb = cb;
  const box = $('#cards');
  $('#cardsTitle').textContent = title;
  $('#cardsSub').textContent = rare ? 'Rare pick: stronger than usual' : 'Pick one';
  box.classList.toggle('rare', !!rare);
  const row = $('#cardRow');
  row.innerHTML = choices.map((c) => cardHtml(c, rare)).join('');
  $('#rerollBtn').classList.toggle('hidden', rerolls <= 0);
  box.classList.remove('hidden');
  $$('.kard', row).forEach((b, i) => {
    b.style.animationDelay = i * 0.08 + 's';
    tap(b, () => pickCard(b, choices[i]), { sound: false });
  });
  setTimeout(() => sfx.card(), 80);
}
async function pickCard(b, c) {
  if (!cardCb) return;
  const cb = cardCb; cardCb = null;
  b.classList.add('picked');
  $$('#cardRow .kard').forEach((x) => { if (x !== b) x.classList.add('gone'); });
  buzz(20);
  await wait(380);
  $('#cards').classList.add('hidden');
  cb(c);
}
tap($('#rerollBtn'), async () => {
  if (!cardCb || rerolls <= 0) return;
  await fakeAd(2);
  rerolls--;
  const rare = $('#cards').classList.contains('rare');
  const choices = run.choices(rare);
  const cb = cardCb;
  showCards(choices, rare, $('#cardsTitle').textContent, cb);
});

// chest node on the progress bar: open it, take coins, then a rare card
function chestOpen(i) {
  const gold = i > 0, coins = gold ? 60 : 30;
  const m = openModal({
    title: gold ? 'GOLD CHEST!' : 'CHECKPOINT!', ribbon: gold ? 'orange' : 'blue', close: false, cls: 'chestpop',
    body: `<div class="chestwrap"><div class="rays"></div><img class="chest shake" src="${ICON(gold ? 'chest-gold' : 'chest-silver')}" alt=""></div><div class="t t-thin">Tap to open</div>`,
  });
  const chest = $('.chest', m.el);
  let opened = false;
  tap(m.panel, async () => {
    if (opened) return; opened = true;
    chest.classList.remove('shake'); chest.classList.add('open');
    sfx.chest(); buzz([20, 30, 40]); confetti(40);
    await wait(500);
    run.coins += coins;
    flyIcons(UI('i-coin'), rectIn(chest), $('#runCoins'), 8, { onEach: () => { sfx.coin(); bump($('#runCoins')); } });
    await wait(900);
    m.close();
    run.pause.delete('chest');
    if (gold) run.levelUp(true, 'GOLD CHEST!');
  }, { sound: false });
}

function pauseMenu() {
  if (!run || mode !== 'run') return;
  run.pause.add('menu');
  const m = openModal({
    title: 'PAUSED', ribbon: 'blue', onClose: () => run && run.pause.delete('menu'),
    body: `<div class="crewlist">${run.crewList().map((s) => `<span class="mini">${portrait(s.crew.type)}<b class="t t-thin">${(run.crewLv[s.crew.type] || 1)}</b></span>`).join('')}</div>`,
    buttons: `<button class="btn btn-green t" data-close>Resume</button><button class="btn btn-red t t-thin quit">Quit run</button>`,
  });
  tap($('.quit', m.el), () => { m.onClose = null; m.close(); run.pause.delete('menu'); run.result = { win: false, kills: run.kills, coins: run.coins, lv: run.lv, time: run.t, stars: 0, prog: run.D / STAGE.length, quit: true }; endRun(run.result); });
}

// ---------- end of run ----------
function loseScreen(r) {
  if (r.quit) return endRun(r);
  const m = openModal({
    title: 'TRAIN WRECKED!', ribbon: 'red', close: false, cls: 'revive',
    body: `<img class="bigicon" src="${ICON('heart')}" alt=""><div class="t t-thin">Fix the engine and keep going?</div><div class="ringtimer t" id="revT">5</div>`,
    buttons: `<button class="btn btn-green t t-thin ad"><img src="${UI('i-ad')}" alt="">Revive</button><button class="btn btn-gray t t-thin no">No thanks</button>`,
  });
  let s = 5;
  const iv = setInterval(() => { s--; const n = $('#revT'); if (n) n.textContent = s; if (s <= 0) { clearInterval(iv); if (m.el.isConnected) { m.close(); endRun(r); } } }, 1000);
  tap($('.ad', m.el), async () => { clearInterval(iv); m.close(); await fakeAd(3); run.revive(); banner('BACK ON TRACK!', 'green'); });
  tap($('.no', m.el), () => { clearInterval(iv); m.close(); endRun(r); });
}
function winScreen(r) { endRun(r); }

async function endRun(r) {
  mode = 'result';
  sfx[r.win ? 'win' : 'fail']();
  save.runs++;
  if (r.win) { save.wins++; save.stars = Math.max(save.stars || 0, r.stars); }
  save.best = Math.max(save.best || 0, r.prog);
  persist();
  const box = $('#result');
  const pctDone = Math.round(r.prog * 100);
  box.className = `screen ${r.win ? 'win' : 'lose'}`;
  box.innerHTML = `<div class="panel">
    <div class="ribbon ${r.win ? 'orange' : 'red'} t">${r.win ? 'VICTORY!' : 'RUN OVER'}</div>
    ${r.win ? `<div class="stars"><img class="spark" src="${UI('ui-spark-l')}" alt="">${[0, 1, 2].map((i) => `<img src="${UI('i-star')}" class="s${i}" alt="">`).join('')}<img class="spark" src="${UI('ui-spark-r')}" alt=""></div>` : `<div class="dist t">${pctDone}%<small class="t-thin">of Frost Line</small></div>`}
    <div class="stats">
      <div class="st"><img src="${UI('i-skull-pink')}" alt=""><b class="t t-thin" id="rKills">0</b><small class="t-thin">Zombies</small></div>
      <div class="st"><img src="${UI('i-emerald')}" alt=""><b class="t t-thin">${r.lv}</b><small class="t-thin">Level</small></div>
      <div class="st"><img src="${UI('i-star')}" alt=""><b class="t t-thin">${r.bestCombo || 0}</b><small class="t-thin">Best combo</small></div>
    </div>
    <div class="loot"><img class="spark" src="${UI('ui-spark-l')}" alt=""><img src="${UI('i-coin')}" alt=""><b class="t" id="rCoins">0</b><img class="spark" src="${UI('ui-spark-r')}" alt=""></div>
    <div class="btns">
      <button class="btn btn-blue t t-thin x2"><img src="${UI('i-ad')}" alt="">Coins x2</button>
      <button class="btn btn-orange t claim">${r.win ? 'Continue' : 'Back to depot'}</button>
    </div>
  </div>`;
  box.classList.remove('hidden');
  if (r.win) {
    confetti(90);
    $$('.stars img:not(.spark)', box).forEach((s, i) => setTimeout(() => { if (i < r.stars) { s.classList.add('on'); sfx.star(i); buzz(15); } else s.classList.add('off'); }, 500 + i * 380));
  }
  countUp($('#rKills'), 0, r.kills, 900, fmt);
  const total = r.coins + (r.win ? 150 : 0);
  countUp($('#rCoins'), 0, total, 1100, fmt);
  let mult = 1;
  const finish = async () => {
    const from = rectIn($('.loot', box));
    box.classList.add('hidden');
    await curtain(async () => { run = null; showLobby(); });
    gain(total * mult, from);
  };
  tap($('.x2', box), async () => { await fakeAd(3); mult = 2; $('#rCoins').textContent = fmt(total * 2); bump($('.loot', box)); $('.x2', box).disabled = true; });
  tap($('.claim', box), finish);
}

// debug hooks for the headless checks
window.__mock = { get run() { return run; }, save, setTab, startRun, showLobby };
