// DOM helpers shared by every screen: popups, toasts, flying icons, confetti,
// count-ups, the fake rewarded-ad screen and the wipe between screens.
import { sfx, duckMusic } from './audio.548be9c6d4.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const app = () => $('#app');
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const ICON = (n) => `img/sprites/${n}.webp`;
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

// tap handler with click sound; works for mouse and touch
export function tap(node, fn, { sound = true } = {}) {
  if (!node) return;
  node.addEventListener('click', (e) => { e.stopPropagation(); if (sound) sfx.click(); fn(e); });
}

// ---------- popups ----------
let stack = [];
export function openModal({ title, ribbon = '', body = '', buttons = '', close = true, cls = '', onClose } = {}) {
  const wrap = el(`<div class="modal ${cls}"><div class="panel">
      <div class="ribbon ${ribbon} t">${title}</div>
      ${close ? '<button class="btn x" data-close></button>' : ''}
      <div class="body">${body}</div>
      ${buttons ? `<div class="btns">${buttons}</div>` : ''}
    </div></div>`);
  $('#modalHost').appendChild(wrap);
  const m = { el: wrap, panel: $('.panel', wrap), close: () => closeModal(m), onClose };
  stack.push(m);
  $$('[data-close]', wrap).forEach((b) => tap(b, () => m.close()));
  return m;
}
export function closeModal(m) {
  if (!m || !m.el.isConnected) return;
  m.el.classList.add('out');
  setTimeout(() => m.el.remove(), 160);
  stack = stack.filter((x) => x !== m);
  m.onClose && m.onClose();
}
export function closeAllModals() { for (const m of [...stack]) { m.onClose = null; closeModal(m); } }
export const modalOpen = () => stack.length > 0;

// ---------- toast ----------
let toastT = 0;
export function toast(text, ms = 1800) {
  $('#toast') && $('#toast').remove();
  const t = el(`<div id="toast" class="t t-thin">${text}</div>`);
  $('#overlayHost').appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), ms);
}

// ---------- screen space helpers ----------
export function rectIn(node) {
  const a = app().getBoundingClientRect(), r = node.getBoundingClientRect();
  return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2, w: r.width, h: r.height };
}
export const cq = (v) => app().clientWidth * v / 100;

// icons that pop out at `from`, then fly to a target element; onEach runs per arrival
export function flyIcons(src, from, target, n, { onEach, size = 9, spread = 12, delay = 55 } = {}) {
  const to = rectIn(target);
  const layer = $('#fx');
  return new Promise((done) => {
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      const f = el(`<img class="flyer" src="${src}" alt="">`);
      f.style.width = cq(size) + 'px';
      const sx = from.x + (Math.random() - 0.5) * cq(spread), sy = from.y + (Math.random() - 0.5) * cq(spread);
      f.style.left = sx - cq(size) / 2 + 'px'; f.style.top = sy - cq(size) / 2 + 'px';
      f.style.transform = 'scale(0)';
      layer.appendChild(f);
      setTimeout(() => {
        f.style.transition = 'transform .18s cubic-bezier(.3,1.8,.5,1)';
        f.style.transform = 'scale(1)';
        setTimeout(() => {
          f.style.transition = 'transform .55s cubic-bezier(.55,-0.25,.6,1)';
          f.style.transform = `translate(${to.x - sx}px, ${to.y - sy}px) scale(.75)`;
          setTimeout(() => { f.remove(); arrived++; onEach && onEach(arrived); if (arrived === n) done(); }, 560);
        }, 200 + i * delay);
      }, i * 20);
    }
    if (n === 0) done();
  });
}

// a target bumps when something lands in it
export function bump(node, cls = 'bump') { if (!node) return; node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

export function confetti(n = 70) {
  const layer = $('#fx');
  const cols = ['#ff4058', '#ffd23f', '#5cd636', '#3d8bff', '#ff7eb6', '#b892ff', '#ff9a2e'];
  for (let i = 0; i < n; i++) {
    const c = el('<i class="confetti"></i>');
    c.style.left = Math.random() * 100 + '%';
    c.style.background = cols[i % cols.length];
    c.style.setProperty('--dx', (Math.random() - 0.5) * 40 + 'cqw');
    c.style.setProperty('--r', (Math.random() * 1080 - 540) + 'deg');
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.animationDuration = 2 + Math.random() * 1.4 + 's';
    layer.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

export function countUp(node, from, to, ms = 600, fmt = (v) => v) {
  const t0 = performance.now();
  return new Promise((done) => {
    const tick = () => {
      const e = Math.min(1, (performance.now() - t0) / ms);
      node.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - e) ** 3)));
      if (e < 1) requestAnimationFrame(tick); else done();
    };
    tick();
  });
}

// ---------- fake rewarded ad ----------
export function fakeAd(seconds = 3) {
  return new Promise((done) => {
    duckMusic(true);
    const ad = el(`<div id="ad"><div class="cd t">${seconds}</div><div class="box t t-thin">Ad plays here</div><div class="t t-thin note">Mock build: no real ads</div></div>`);
    $('#overlayHost').appendChild(ad);
    let s = seconds;
    const iv = setInterval(() => {
      s--; $('.cd', ad).textContent = Math.max(0, s);
      if (s <= 0) { clearInterval(iv); ad.remove(); duckMusic(false); done(true); }
    }, 1000);
  });
}

// ---------- wipe between screens ----------
export async function curtain(mid) {
  const c = $('#curtain');
  sfx.whoosh();
  c.classList.add('on');
  await wait(420);
  await mid();
  await wait(100);
  c.classList.remove('on');
  await wait(400);
}
