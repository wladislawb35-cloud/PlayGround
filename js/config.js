// Game-wide constants, building definitions and the objective chain.

export const TILE = 32;
export const MAP_W = 28;
export const MAP_H = 20;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const SAVE_KEY = 'timberhold.save.v3';
export const SETTINGS_KEY = 'timberhold.settings.v1';

export const BASE_POP_CAP = 3;
export const BASE_STORAGE = 50;
export const STORAGE_PER_HOUSE = 0; // houses grow population, storehouses grow storage
export const STORAGE_PER_STOREHOUSE = 150;
export const STORAGE_PER_TOWNHALL = 100;

export const T_GRASS = 0;
export const T_DIRT = 1;
export const T_WATER = 2;
export const T_SAND = 3;
export const T_DARK = 4;

export const C = {
  ink: '#241609',
  ink2: '#3a2513',
  paper: '#f2dcaa',
  paperDark: '#dfbf83',
  gold: '#f2c14e',
  goldDark: '#c8922c',
  red: '#c9503c',
  redDark: '#8f2f25',
  green: '#6fae4a',
  greenDark: '#3f6e2c',
  blue: '#4b7fae',
  cream: '#fff1cb',

  grass: '#5d9141',
  grassDark: '#4a7a34',
  grassLight: '#74a94e',
  grassDeep: '#37602a',
  dirt: '#a98254',
  dirtDark: '#8a653c',
  dirtLight: '#c19a68',
  water: '#3d6f9e',
  waterDark: '#2d5680',
  waterLight: '#5e94c2',
  sand: '#d9c18a',
  dark: '#22351f',
  dark2: '#182716',

  trunk: '#684730',
  trunkDark: '#4a3020',
  leafDeep: '#24512f',
  leaf: '#2f7038',
  leafMid: '#3f8a44',
  leafLight: '#5aa956',
  leafBright: '#7cc266',

  stone: '#8e9099',
  stoneLight: '#b6b8c0',
  stoneDark: '#63656e',
  stoneDeep: '#464851',

  wall: '#d9b982',
  wallDark: '#b7955e',
  wallLight: '#efd6a6',
  timber: '#6b4527',
  timberDark: '#4a2f18',
  roofRed: '#b4472f',
  roofRedLight: '#d36545',
  roofRedDark: '#83301f',
  roofGreen: '#4f7a44',
  roofGreenLight: '#6b9a58',
  roofGreenDark: '#355430',
  roofBlue: '#4a6f95',
  roofBlueLight: '#6b92b8',
  roofBlueDark: '#314e6c',
  roofBrown: '#8a5b34',
  roofBrownLight: '#a97845',
  roofBrownDark: '#623e22',
  smoke: '#c9c3b3',
  skin: '#e6b38a',
  skinDark: '#c08a62',
};

// Terrain palettes used by the renderer.
export const TERRAIN_COLORS = {
  [T_GRASS]: [C.grass, C.grassDark, C.grassLight, C.grassDeep],
  [T_DIRT]: [C.dirt, C.dirtDark, C.dirtLight],
  [T_WATER]: [C.water, C.waterDark, C.waterLight],
  [T_SAND]: [C.sand, '#c6ac74', '#e8d3a0'],
  [T_DARK]: [C.dark, C.dark2, '#2e4527'],
};

export const BUILDINGS = {
  lumberjack: {
    id: 'lumberjack',
    name: 'Lumberjack Hut',
    short: 'Lumberjack',
    w: 2,
    h: 2,
    cost: { wood: 20 },
    buildTime: 4,
    workers: 1,
    range: 4.6,
    produces: 'wood',
    carry: 3,
    harvestTime: 2.1,
    desc: 'Fells nearby pines and hauls the logs home.',
    hint: 'Place it near trees. The dashed ring is its working range.',
    hotkey: '1',
  },
  quarry: {
    id: 'quarry',
    name: 'Stone Quarry',
    short: 'Quarry',
    w: 2,
    h: 2,
    cost: { wood: 20, stone: 10 },
    buildTime: 5,
    workers: 1,
    range: 4.6,
    produces: 'stone',
    carry: 2,
    harvestTime: 2.4,
    desc: 'Chips stone from gray outcrops and carries it back.',
    hint: 'Needs a rock outcrop inside the ring. Rocks run dry — be ready to expand.',
    hotkey: '2',
  },
  house: {
    id: 'house',
    name: 'Cottage',
    short: 'Cottage',
    w: 2,
    h: 2,
    cost: { wood: 25, stone: 10 },
    buildTime: 6,
    workers: 0,
    desc: 'A warm home. Raises the population cap by 2.',
    hint: 'New settlers arrive on their own once there is room.',
    popCap: 2,
    hotkey: '3',
  },
  storehouse: {
    id: 'storehouse',
    name: 'Storehouse',
    short: 'Storehouse',
    w: 2,
    h: 2,
    cost: { wood: 30, stone: 15 },
    buildTime: 5,
    workers: 0,
    desc: 'Adds 150 storage for wood and stone. Workers deliver here.',
    hint: 'More storage lets your gatherers keep working instead of idling.',
    storage: 150,
    hotkey: '4',
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    short: 'Workshop',
    w: 2,
    h: 2,
    cost: { wood: 40, stone: 25 },
    buildTime: 7,
    workers: 0,
    max: 3,
    desc: 'Sharpens tools: all gatherers work 25% faster. Stacks up to 3.',
    hint: 'A strong investment once your first few buildings are running.',
    hotkey: '5',
  },
  townhall: {
    id: 'townhall',
    name: 'Town Hall',
    short: 'Town Hall',
    w: 3,
    h: 3,
    cost: { wood: 150, stone: 100 },
    buildTime: 12,
    workers: 0,
    unique: true,
    requires: { pop: 10, houses: 2 },
    desc: 'The heart of a real settlement. Finish it to complete your town.',
    hint: 'Requires 10 settlers and at least 2 cottages.',
    storage: 100,
    hotkey: '6',
  },
};

export const BUILD_ORDER = ['lumberjack', 'quarry', 'house', 'storehouse', 'workshop', 'townhall'];

export const RESOURCES = {
  wood: { name: 'Wood', color: C.wood || '#b98143', icon: 'wood' },
  stone: { name: 'Stone', color: '#a9abb2', icon: 'stone' },
};

// Objective chain. `check(game)` runs on a short timer and also on state changes.
export const QUESTS = [
  {
    id: 'hut',
    title: 'Raise a Lumberjack Hut',
    desc: 'Place it beside the pines. The dashed ring shows where it can work.',
    reward: { wood: 20 },
    check: (g) => g.buildingCount('lumberjack') >= 1,
  },
  {
    id: 'quarry',
    title: 'Open a Stone Quarry',
    desc: 'Put it near a gray outcrop. Stone unlocks sturdier buildings.',
    reward: { wood: 15, stone: 10 },
    check: (g) => g.buildingCount('quarry') >= 1,
  },
  {
    id: 'house',
    title: 'Build a Cottage',
    desc: 'Cottages lift the population cap by 2. Settlers arrive on their own.',
    reward: { wood: 20 },
    check: (g) => g.buildingCount('house') >= 1,
  },
  {
    id: 'storage',
    title: 'Expand the Storehouse',
    desc: 'One storehouse holds 200 goods. A second adds another 150 of each.',
    reward: { wood: 25, stone: 15 },
    check: (g) => g.buildingCount('storehouse') >= 2,
  },
  {
    id: 'workshop',
    title: 'Raise a Workshop',
    desc: 'Each workshop makes every gatherer 25% faster. Up to three stack.',
    reward: { stone: 30 },
    check: (g) => g.buildingCount('workshop') >= 1,
  },
  {
    id: 'pop',
    title: 'Grow to 10 Settlers',
    desc: 'Build more cottages, then give the newcomers time to arrive.',
    reward: { wood: 60, stone: 30 },
    check: (g) => g.settlers.length >= 10,
    progress: (g) => ({ value: g.settlers.length, max: 10 }),
  },
  {
    id: 'townhall',
    title: 'Raise the Town Hall',
    desc: 'The heart of your settlement. Needs 10 settlers and 2 cottages.',
    reward: null,
    check: (g) => g.buildingCount('townhall', true) >= 1,
    progress: (g) => ({
      value: Math.min(g.settlers.length, 10) + Math.min(g.buildingCount('house'), 2) * 0,
      max: 10,
    }),
  },
];

export const SPEEDS = [0, 1, 2, 3];
export const POP_GROWTH_TIME = 10; // seconds per new settler when there is room
export const HARVEST_TICK = 0.45; // particle / sound cadence while gathering
export const MAX_WORKSHOP_BONUS = 0.75; // 3 workshops x 25%
