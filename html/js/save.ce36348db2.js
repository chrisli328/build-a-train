// Player progress for the mock, kept in localStorage on this device.
const KEY = 'trainmock.v2';   // v2: a new player starts with one wagon and only the captain riding
export const MAX_FUEL = 30;
export const FUEL_COST = 5;
export const FUEL_MS = 6 * 60 * 1000;   // one fuel back every 6 minutes

const fresh = () => ({
  coins: 420, gems: 60, fuel: MAX_FUEL, fuelT: 0,
  stage: 1, best: 0, runs: 0, wins: 0,
  chestKeys: 0,
  crew: {
    gunner: { lv: 3, owned: true }, captain: { lv: 1, owned: true }, rocket: { lv: 1, owned: true },
    flamer: { lv: 1, owned: false }, sniper: { lv: 1, owned: false }, shotgun: { lv: 1, owned: false },
    tesla: { lv: 1, owned: false }, frost: { lv: 1, owned: false },
    saw: { lv: 1, owned: false }, mortar: { lv: 1, owned: false }, laser: { lv: 1, owned: false }, harpoon: { lv: 1, owned: false },
  },
  train: { plow: 1, armor: 1, wagons: 1 },  // engine and one wagon to start; crew and wagons come from cards in the run
  daily: { last: '' },
  settings: { music: true, sound: true, vibe: true },
});

export const save = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.crew) {
      const base = fresh();
      return { ...base, ...raw, crew: { ...base.crew, ...raw.crew }, train: { ...base.train, ...raw.train, wagons: Math.max(1, (raw.train && raw.train.wagons) || 1) }, settings: { ...base.settings, ...raw.settings } };
    }
  } catch (e) { /* fall through to a fresh save */ }
  return fresh();
}

export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }

export function resetSave() {
  const f = fresh();
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, f);
  persist();
}

export function tickFuel(now = Date.now()) {
  if (save.fuel >= MAX_FUEL) { save.fuelT = 0; return; }
  if (!save.fuelT) save.fuelT = now;
  const n = Math.floor((now - save.fuelT) / FUEL_MS);
  if (n > 0) {
    save.fuel = Math.min(MAX_FUEL, save.fuel + n);
    save.fuelT = save.fuel >= MAX_FUEL ? 0 : save.fuelT + n * FUEL_MS;
    persist();
  }
}

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : n.toLocaleString('en-US');
export const upCost = (lv) => Math.round(60 * Math.pow(1.45, lv - 1) / 10) * 10;
