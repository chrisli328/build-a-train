// Game data for the mock: crew, zombies, cards, junction options and the stage script.
// Every number here is a mock tuning value, not a researched figure.

export const CREW = {
  gunner:  { name: 'Gunner',     icon: 'crew-gunner',  color: '#ff8a1f', range: 250, rate: 6.5, dmg: 6,  kind: 'bullet', speed: 950, spread: 0.07, desc: 'Fast mini-gun' },
  rocket:  { name: 'Rocketeer',  icon: 'crew-rocket',  color: '#3d8bff', range: 330, rate: 0.75, dmg: 34, kind: 'rocket', speed: 430, aoe: 58, desc: 'Big splash rockets' },
  flamer:  { name: 'Flamer',     icon: 'crew-flamer',  color: '#5cd636', range: 125, rate: 14, dmg: 2.2, kind: 'flame', burn: 6, desc: 'Burns the crowd' },
  sniper:  { name: 'Sniper',     icon: 'crew-sniper',  color: '#9b5cf6', range: 520, rate: 0.8, dmg: 75, kind: 'rail', pierce: 4, desc: 'Pierces 4 zombies' },
  shotgun: { name: 'Shotgunner', icon: 'crew-shotgun', color: '#ffcf2e', range: 175, rate: 1.3, dmg: 8,  kind: 'pellet', pellets: 6, speed: 760, spread: 0.55, knock: 60, desc: 'Knocks them back' },
  tesla:   { name: 'Engineer',   icon: 'crew-tesla',   color: '#2ad4c8', range: 215, rate: 1.1, dmg: 16, kind: 'zap', chain: 4, desc: 'Chain lightning' },
  frost:   { name: 'Frost',      icon: 'crew-frost',   color: '#7fd8ff', range: 250, rate: 1.6, dmg: 11, kind: 'ice', speed: 620, slow: 0.5, desc: 'Slows and freezes' },
  captain: { name: 'Captain',    icon: 'crew-captain', color: '#1f3a8a', range: 230, rate: 2.2, dmg: 8,  kind: 'bullet', speed: 900, spread: 0.04, aura: 0.2, desc: '+20% crew fire rate' },
};

export const ZOMBIES = {
  walker:  { hp: 20,   speed: 34, r: 12, dps: 6,  xp: 1, coin: 0.10, sprite: 'z-walker' },
  hardhat: { hp: 42,   speed: 31, r: 12, dps: 7,  xp: 2, coin: 0.14, sprite: 'z-hardhat' },
  pot:     { hp: 70,   speed: 28, r: 13, dps: 8,  xp: 2, coin: 0.16, sprite: 'z-pot' },
  runner:  { hp: 14,   speed: 74, r: 10, dps: 5,  xp: 1, coin: 0.10, sprite: 'z-runner' },
  bloater: { hp: 45,   speed: 24, r: 16, dps: 4,  xp: 3, coin: 0.25, sprite: 'z-bloater', boom: { r: 78, dmg: 45 } },
  brute:   { hp: 400,  speed: 22, r: 22, dps: 22, xp: 12, coin: 1, sprite: 'z-brute', heavy: true, scale: 1.25 },
  shield:  { hp: 105,  speed: 26, r: 14, dps: 7,  xp: 3, coin: 0.2, sprite: 'z-shield', heavy: true },
  yeti:    { hp: 2600, speed: 20, r: 48, dps: 0,  xp: 0, coin: 0, sprite: 'z-yeti', heavy: true, boss: true, scale: 1 },
};

// Level-up cards. kind: crew (new crew member), up (upgrade), train (train-wide).
export const CARDS = [
  { id: 'c-gunner',  kind: 'crew', crew: 'gunner',  title: 'Gunner',       text: 'New crew member\nFast mini-gun' },
  { id: 'c-rocket',  kind: 'crew', crew: 'rocket',  title: 'Rocketeer',    text: 'New crew member\nBig splash rockets' },
  { id: 'c-flamer',  kind: 'crew', crew: 'flamer',  title: 'Flamer',       text: 'New crew member\nBurns the crowd' },
  { id: 'c-sniper',  kind: 'crew', crew: 'sniper',  title: 'Sniper',       text: 'New crew member\nPierces 4 zombies' },
  { id: 'c-shotgun', kind: 'crew', crew: 'shotgun', title: 'Shotgunner',   text: 'New crew member\nKnocks them back' },
  { id: 'c-tesla',   kind: 'crew', crew: 'tesla',   title: 'Engineer',     text: 'New crew member\nChain lightning' },
  { id: 'c-frost',   kind: 'crew', crew: 'frost',   title: 'Frost',        text: 'New crew member\nSlows and freezes' },
  { id: 'u-rate',    kind: 'up', title: 'Rapid Fire',    text: 'All crew fire\n40% faster', icon: 'bolt' },
  { id: 'u-dmg',     kind: 'up', title: 'Heavy Rounds',  text: 'All crew deal\n50% more damage', icon: 'star' },
  { id: 'u-plow',    kind: 'up', title: 'Spiked Plow',   text: 'Plow damage x2\nand wider', icon: 'wrench' },
  { id: 'u-armor',   kind: 'up', title: 'Armor Plates',  text: '+60% train HP\nand repair it', icon: 'shield' },
  { id: 'u-wagon',   kind: 'train', title: 'New Wagon',  text: 'Adds a wagon\nwith 2 crew seats', icon: 'train' },
  { id: 'u-magnet',  kind: 'up', title: 'Scrap Magnet',  text: 'Pick up drops\nfrom further away', icon: 'gem' },
  { id: 'u-crit',    kind: 'up', title: 'Lucky Shots',   text: '+15% chance\nof critical hits', icon: 'crown' },
];

// Junction options. Each shows on a sign beside its branch.
export const ROUTES = {
  repair: { title: 'REPAIR YARD', sub: '+40% train HP', icon: 'wrench', color: '#3ccf4e' },
  supply: { title: 'SUPPLY DUMP', sub: 'Crates full of coins', icon: 'chest-wood', color: '#ffb21c' },
  horde:  { title: 'HORDE ROAD', sub: 'Double XP, more zombies', icon: 'skull', color: '#ff4058' },
  armory: { title: 'ARMORY', sub: 'Free rare card', icon: 'chest-gold', color: '#9b5cf6' },
};

// One stage = three legs. Distances are in world units along the track.
export const STAGE = {
  name: 'Frost Line',
  chapter: 1,
  length: 4300,
  nodes: [1450, 2900],          // chest nodes on the top bar
  junctions: [
    { d0: 720,  d1: 1180, opts: ['repair', 'horde'] },
    { d0: 2150, d1: 2610, opts: ['supply', 'armory'] },
  ],
  // spawn mix per leg: [type, weight]
  legs: [
    { to: 1450, rate: [2.6, 3.6], mix: [['walker', 8], ['runner', 3], ['hardhat', 2]] },
    { to: 2900, rate: [2.6, 4.6], mix: [['walker', 6], ['runner', 3], ['hardhat', 3], ['pot', 2], ['bloater', 1.5], ['shield', 0.8]] },
    { to: 4300, rate: [3.6, 6.0], mix: [['walker', 5], ['runner', 4], ['hardhat', 3], ['pot', 3], ['bloater', 2], ['shield', 1.4]] },
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
export const XP_NEED = (lv) => (lv === 1 ? 30 : 100 + lv * 10);
