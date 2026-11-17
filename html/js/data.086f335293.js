// Game data for the mock: crew, zombies, cards, junction options and the stage script.
// Every number here is a mock tuning value, not a researched figure.

export const CREW = {
  gunner:  { name: 'Gunner',     icon: 'crew-gunner',  color: '#ff8a1f', vfx: '#ff9a2e', range: 310, rate: 6.5, dmg: 6,  kind: 'bullet', speed: 950, spread: 0.07, desc: 'Fast mini-gun' },
  rocket:  { name: 'Rocketeer',  icon: 'crew-rocket',  color: '#3d8bff', vfx: '#5aa8ff', range: 330, rate: 0.75, dmg: 34, kind: 'rocket', speed: 430, aoe: 58, desc: 'Big splash rockets' },
  flamer:  { name: 'Flamer',     icon: 'crew-flamer',  color: '#5cd636', vfx: '#7be040', range: 260, rate: 14, dmg: 2.2, kind: 'flame', burn: 6, desc: 'Burns the crowd' },
  sniper:  { name: 'Sniper',     icon: 'crew-sniper',  color: '#9b5cf6', vfx: '#b98cff', range: 520, rate: 0.8, dmg: 75, kind: 'rail', pierce: 4, desc: 'Pierces 4 zombies' },
  shotgun: { name: 'Shotgunner', icon: 'crew-shotgun', color: '#ffcf2e', vfx: '#ffe14a', range: 285, rate: 1.3, dmg: 8,  kind: 'pellet', pellets: 6, speed: 760, spread: 0.55, knock: 60, desc: 'Knocks them back' },
  tesla:   { name: 'Engineer',   icon: 'crew-tesla',   color: '#2ad4c8', vfx: '#3ff0d8', range: 285, rate: 1.1, dmg: 16, kind: 'zap', chain: 4, desc: 'Chain lightning' },
  frost:   { name: 'Frost',      icon: 'crew-frost',   color: '#7fd8ff', vfx: '#bfeaff', range: 295, rate: 1.6, dmg: 11, kind: 'ice', speed: 620, slow: 0.5, desc: 'Slows and freezes' },
  saw:     { name: 'Sawyer',     icon: 'crew-saw',     color: '#ff8a1f', vfx: '#ffb84a', range: 305, rate: 0.95, dmg: 15, kind: 'saw', speed: 400, bounce: 4, desc: 'Bouncing saw blades' },
  mortar:  { name: 'Bomber',     icon: 'crew-mortar',  color: '#7a9a3a', vfx: '#ffb21c', range: 340, rate: 0.42, dmg: 46, kind: 'mortar', aoe: 78, desc: 'Lobs big bombs' },
  laser:   { name: 'Laser',      icon: 'crew-laser',   color: '#ff3fa8', vfx: '#ff4fc0', range: 320, rate: 0.6, dmg: 7, kind: 'laser', sweep: 0.8, desc: 'Sweeping laser' },
  harpoon: { name: 'Harpooner',  icon: 'crew-harpoon', color: '#e8b21c', vfx: '#ffe14a', range: 320, rate: 0.7, dmg: 30, kind: 'harpoon', speed: 620, pierce: 3, desc: 'Skewers and drags' },
  captain: { name: 'Captain',    icon: 'crew-captain', color: '#1f3a8a', vfx: '#ffd23f', range: 290, rate: 2.2, dmg: 8,  kind: 'bullet', speed: 900, spread: 0.04, aura: 0.2, desc: '+20% crew fire rate' },
};

export const ZOMBIES = {
  walker:  { hp: 20,   speed: 34, r: 12, dps: 6,  xp: 1, coin: 0.10, sprite: 'z-walker', scale: 1 },
  hardhat: { hp: 42,   speed: 31, r: 12, dps: 7,  xp: 2, coin: 0.14, sprite: 'z-hardhat', scale: 1.02 },
  pot:     { hp: 70,   speed: 28, r: 13, dps: 8,  xp: 2, coin: 0.16, sprite: 'z-pot', scale: 1.04 },
  runner:  { hp: 14,   speed: 74, r: 10, dps: 5,  xp: 1, coin: 0.10, sprite: 'z-runner', scale: 0.8,
             // comes in packs, weaves while it sprints, then crouches and pounces onto a wagon from close range
             pack: [2, 4], weave: 0.85, pounce: { r: 92, crouch: 0.3, T: 0.42, H: 34, bite: 6 } },
  bloater: { hp: 45,   speed: 24, r: 16, dps: 4,  xp: 3, coin: 0.25, sprite: 'z-bloater', scale: 1.12, boom: { r: 78, dmg: 45 } },
  brute:   { hp: 400,  speed: 22, r: 22, dps: 22, xp: 12, coin: 1, sprite: 'z-brute', heavy: true, scale: 1.32 },
  shield:  { hp: 105,  speed: 26, r: 14, dps: 7,  xp: 3, coin: 0.2, sprite: 'z-shield', heavy: true, scale: 1.1 },
  yeti:    { hp: 10350, speed: 20, r: 62, dps: 0,  xp: 0, coin: 0, sprite: 'z-yeti', heavy: true, boss: true, scale: 1 },
};

// Level-up cards. kind: crew (new crew member), up (upgrade), train (train-wide).
export const CARDS = [
  { id: 'c-gunner',  kind: 'crew', crew: 'gunner',  title: 'Gunner',       text: 'Fast mini-gun' },
  { id: 'c-rocket',  kind: 'crew', crew: 'rocket',  title: 'Rocketeer',    text: 'Big splash rockets' },
  { id: 'c-flamer',  kind: 'crew', crew: 'flamer',  title: 'Flamer',       text: 'Burns the crowd' },
  { id: 'c-sniper',  kind: 'crew', crew: 'sniper',  title: 'Sniper',       text: 'Pierces 4 zombies' },
  { id: 'c-saw',     kind: 'crew', crew: 'saw',     title: 'Sawyer',       text: 'Bouncing saw blades' },
  { id: 'c-mortar',  kind: 'crew', crew: 'mortar',  title: 'Bomber',       text: 'Lobs big bombs' },
  { id: 'c-laser',   kind: 'crew', crew: 'laser',   title: 'Laser',        text: 'Sweeping laser' },
  { id: 'c-harpoon', kind: 'crew', crew: 'harpoon', title: 'Harpooner',    text: 'Skewers and drags' },
  { id: 'c-shotgun', kind: 'crew', crew: 'shotgun', title: 'Shotgunner',   text: 'Knocks them back' },
  { id: 'c-tesla',   kind: 'crew', crew: 'tesla',   title: 'Engineer',     text: 'Chain lightning' },
  { id: 'c-frost',   kind: 'crew', crew: 'frost',   title: 'Frost',        text: 'Slows and freezes' },
  { id: 'u-rate',    kind: 'up', title: 'Rapid Fire',    text: 'All crew fire\n40% faster', icon: 'bolt', art: 'ca-rate' },
  { id: 'u-dmg',     kind: 'up', title: 'Heavy Rounds',  text: 'All crew deal\n50% more damage', icon: 'star', art: 'ca-dmg' },
  { id: 'u-plow',    kind: 'train', title: 'Spiked Plow',   text: 'Plow damage x2\nand wider', icon: 'wrench', art: 'ca-plow' },
  { id: 'u-armor',   kind: 'train', title: 'Armor Plates',  text: '+60% train HP\nand repair it', icon: 'shield', art: 'ca-armor' },
  { id: 'u-wagon',   kind: 'train', title: 'New Wagon',  text: 'Adds a wagon\nwith 2 crew seats', icon: 'train', art: 'ca-wagon' },
  { id: 'u-magnet',  kind: 'up', title: 'Scrap Magnet',  text: 'Pick up drops\nfrom further away', icon: 'gem', art: 'ca-magnet' },
  { id: 'u-crit',    kind: 'up', title: 'Lucky Shots',   text: '+15% chance\nof critical hits', icon: 'crown', art: 'ca-crit' },
];

// Junction options. Each shows on a sign beside its branch; the sign reads only the short effect.
export const ROUTES = {
  repair: { title: 'REPAIR YARD', sub: '+40% train HP', short: '+40% HP', icon: 'wrench', color: '#3ccf4e', sign: 'green', ui: 'i-wrench' },
  supply: { title: 'SUPPLY DUMP', sub: 'Crates full of coins', short: '+Coins', icon: 'chest-wood', color: '#ffb21c', sign: 'yellow', ui: 'i-chest' },
  horde:  { title: 'HORDE ROAD', sub: 'Double XP, more zombies', short: 'x2 XP', icon: 'skull', color: '#ff4058', sign: 'red', ui: 'i-skull' },
  armory: { title: 'ARMORY', sub: 'Free rare card', short: 'Rare card', icon: 'chest-gold', color: '#9b5cf6', sign: 'purple', ui: 'i-star' },
};

// One stage = three legs. Distances are in world units along the track.
export const STAGE = {
  name: 'Frost Line',
  chapter: 1,
  length: 4300,
  // real turns along the line (deg: + right, - left); the camera turns with the train through each one
  turns: [{ d: 1200, deg: 90, r: 200 }, { d: 2960, deg: -90 }, { d: 3500, deg: -90 }],
  turnR: 240,
  // after the last stretch the line runs into a loop round the boss (loopDir -1: the loop turns left)
  loopR: 210, loopDir: -1,
  nodes: [1590, 2900],          // chest nodes on the top bar
  junctions: [
    { d0: 720,  d1: 1180, opts: ['repair', 'horde'] },
    { d0: 2250, d1: 2710, opts: ['supply', 'armory'] },
  ],
  // spawn mix per leg: [type, weight]
  legs: [
    { to: 1450, rate: [1.2, 3.6], mix: [['walker', 8], ['runner', 1.1], ['hardhat', 2]] },
    { to: 2900, rate: [2.6, 4.6], mix: [['walker', 6], ['runner', 1.1], ['hardhat', 3], ['pot', 2], ['bloater', 1.5], ['shield', 0.8]] },
    { to: 4300, rate: [3.6, 6.0], mix: [['walker', 5], ['runner', 1.5], ['hardhat', 3], ['pot', 3], ['bloater', 2], ['shield', 1.4]] },
  ],
  // scripted moments: a horde from the front, an ambush from one side, mini-bosses
  events: [
    { d: 40,   type: 'horde', quiet: true, n: 10, mix: ['walker', 'walker', 'hardhat'] },
    { d: 380,  type: 'horde', n: 16, mix: ['walker', 'walker', 'runner'] },
    { d: 1250, type: 'brute', n: 1 },
    { d: 1700, type: 'ambush', side: -1, n: 12, mix: ['runner', 'walker'] },
    { d: 2000, type: 'horde', n: 22, mix: ['walker', 'hardhat', 'bloater'] },
    { d: 2700, type: 'brute', n: 2 },
    { d: 3150, type: 'ambush', side: 1, n: 16, mix: ['runner', 'pot', 'walker'] },
    { d: 3550, type: 'horde', n: 30, mix: ['walker', 'hardhat', 'bloater', 'shield', 'runner'] },
  ],
};

// about one level-up every 12-15 s: the first comes early, then the bar gets long
// the first few levels come fast: the run starts with only the captain, and the early cards fill the seats
export const XP_NEED = (lv) => [0, 3, 8, 16, 32, 60, 100][lv] || 100 + lv * 10;
