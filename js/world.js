// Terrain generation, occupancy, and grid pathfinding.

import {
  MAP_W,
  MAP_H,
  TILE,
  T_GRASS,
  T_DIRT,
  T_WATER,
  T_SAND,
  T_DARK,
} from './config.js';
import { mulberry32, hash2, dist, clamp } from './util.js';

const idx = (x, y) => y * MAP_W + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

export const SPAWN_X = 13;
export const SPAWN_Y = 9;

export function generateWorld(seed) {
  const rng = mulberry32(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H).fill(T_GRASS);
  const nodes = [];
  const decor = [];
  let nodeId = 1;

  const cx = SPAWN_X + 1;
  const cy = SPAWN_Y + 1;

  // Border of deep forest.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) tiles[idx(x, y)] = T_DARK;
    }
  }

  const isGrass = (x, y) => inside(x, y) && tiles[idx(x, y)] === T_GRASS;
  const nearSpawn = (x, y, r = 4.9) => dist(x + 0.5, y + 0.5, cx, cy) < r;

  // Dirt plaza and a little road leading south.
  for (let y = 7; y <= 12; y++) {
    for (let x = 10; x <= 17; x++) {
      if (tiles[idx(x, y)] === T_GRASS) tiles[idx(x, y)] = T_DIRT;
    }
  }
  for (let y = 5; y <= 7; y++) {
    for (let x = 13; x <= 14; x++) tiles[idx(x, y)] = T_DIRT;
  }
  for (let y = 13; y <= 18; y++) {
    for (let x = 13; x <= 14; x++) tiles[idx(x, y)] = T_DIRT;
  }
  for (let x = 5; x <= 10; x++) {
    for (let y = 10; y <= 11; y++) tiles[idx(x, y)] = T_DIRT;
  }
  for (let x = 17; x <= 22; x++) {
    for (let y = 10; y <= 11; y++) tiles[idx(x, y)] = T_DIRT;
  }

  // A pond in one corner.
  const pondSpots = [
    [4, 4],
    [23, 4],
    [4, 15],
    [23, 14],
  ];
  const pond = pondSpots[Math.floor(rng() * pondSpots.length)];
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = pond[0] + dx;
      const y = pond[1] + dy;
      if (!inside(x, y) || nearSpawn(x, y, 7)) continue;
      const d = Math.hypot(dx * 0.85, dy) + (rng() - 0.5) * 0.8;
      if (d < 2.9) tiles[idx(x, y)] = T_WATER;
    }
  }
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (tiles[idx(x, y)] !== T_WATER) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (inside(nx, ny) && tiles[idx(nx, ny)] === T_GRASS) tiles[idx(nx, ny)] = T_SAND;
        }
      }
    }
  }

  const occupied = new Set();
  const addNode = (kind, x, y) => {
    if (!inside(x, y) || tiles[idx(x, y)] !== T_GRASS) return false;
    if (occupied.has(idx(x, y))) return false;
    const variant = Math.floor(rng() * 3);
    nodes.push({
      id: nodeId++,
      kind,
      x,
      y,
      variant,
      qty: kind === 'tree' ? 6 : 24,
      max: kind === 'tree' ? 6 : 24,
      regrow: 0,
      reservedBy: null,
    });
    occupied.add(idx(x, y));
    return true;
  };

  // Forest clusters. The first is a reliable starter wood.
  const forestSpots = [
    [20, 5],
    [7, 5],
    [21, 14],
    [6, 14],
    [13, 17],
    [9, 8],
    [18, 7],
  ];
  const chosenForests = [];
  for (const spot of forestSpots) {
    if (chosenForests.length >= 4) break;
    if (dist(spot[0], spot[1], pond[0], pond[1]) < 4.5) continue;
    if (nearSpawn(spot[0], spot[1], 5.5)) continue;
    if (chosenForests.some((s) => dist(s[0], s[1], spot[0], spot[1]) < 3.5)) continue;
    chosenForests.push(spot);
  }
  for (const [fx, fy] of chosenForests) {
    let placed = 0;
    for (let attempt = 0; attempt < 40 && placed < 11; attempt++) {
      const x = Math.round(fx + (rng() - 0.5) * 5.4);
      const y = Math.round(fy + (rng() - 0.5) * 4.6);
      if (!isGrass(x, y) || nearSpawn(x, y, 4.8)) continue;
      if (addNode('tree', x, y)) placed++;
    }
  }
  // A few lone trees make the map feel less regular.
  for (let i = 0; i < 16; i++) {
    const x = 2 + Math.floor(rng() * (MAP_W - 4));
    const y = 2 + Math.floor(rng() * (MAP_H - 4));
    if (!isGrass(x, y) || nearSpawn(x, y, 5.2)) continue;
    addNode('tree', x, y);
  }

  // Rock outcrops — guaranteed ones near the settlement.
  const rockSpots = [
    [21, 14],
    [6, 15],
    [21, 5],
    [7, 4],
    [15, 4],
  ];
  const chosenRocks = [];
  for (const spot of rockSpots) {
    if (chosenRocks.length >= 3) break;
    if (dist(spot[0], spot[1], pond[0], pond[1]) < 4) continue;
    if (nearSpawn(spot[0], spot[1], 5.5)) continue;
    if (chosenRocks.some((s) => dist(s[0], s[1], spot[0], spot[1]) < 5)) continue;
    chosenRocks.push(spot);
  }
  for (const [rx, ry] of chosenRocks) {
    let placed = 0;
    for (let attempt = 0; attempt < 30 && placed < 6; attempt++) {
      const x = Math.round(rx + (rng() - 0.5) * 3.6);
      const y = Math.round(ry + (rng() - 0.5) * 3.2);
      if (!isGrass(x, y) || nearSpawn(x, y, 5)) continue;
      if (addNode('rock', x, y)) placed++;
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(rng() * (MAP_W - 4));
    const y = 2 + Math.floor(rng() * (MAP_H - 4));
    if (!isGrass(x, y) || nearSpawn(x, y, 5.4)) continue;
    addNode('rock', x, y);
  }

  // Decorative pines along the border (on blocked dark tiles only).
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (tiles[idx(x, y)] !== T_DARK) continue;
      if (hash2(x, y, 7) > 0.62) continue;
      decor.push({
        kind: 'pine',
        x,
        y,
        variant: Math.floor(hash2(x, y, 11) * 3),
        scale: 0.82 + hash2(x, y, 13) * 0.42,
      });
    }
  }

  return {
    seed,
    tiles,
    nodes,
    decor,
    pond,
  };
}

export function rebuildBlocked(state) {
  const b = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = state.tiles[idx(x, y)];
      if (t === T_WATER || t === T_DARK) b[idx(x, y)] = 1;
    }
  }
  for (const node of state.nodes) {
    if (node.qty > 0) b[idx(node.x, node.y)] = 1;
  }
  for (const bld of state.buildings) {
    for (let y = bld.y; y < bld.y + bld.h; y++) {
      for (let x = bld.x; x < bld.x + bld.w; x++) {
        if (inside(x, y)) b[idx(x, y)] = 1;
      }
    }
  }
  state.blocked = b;
  state.waterTiles = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (state.tiles[idx(x, y)] === T_WATER) state.waterTiles.push({ x, y });
    }
  }
  return b;
}

export function isBlocked(state, x, y) {
  if (!inside(x, y)) return true;
  return state.blocked[idx(x, y)] === 1;
}

export function isTerrainBuildable(state, x, y) {
  if (!inside(x, y)) return false;
  const t = state.tiles[idx(x, y)];
  return t === T_GRASS || t === T_DIRT;
}

export function canOccupy(state, x, y, w, h) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (!isTerrainBuildable(state, xx, yy)) return false;
      if (state.blocked[idx(xx, yy)]) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- pathfinding

class MinHeap {
  constructor() {
    this.items = [];
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    if (a.length === 0) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

const NEIGHBORS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function findPath(state, sx, sy, tx, ty) {
  if (!inside(sx, sy) || !inside(tx, ty)) return null;
  if (state.blocked[idx(tx, ty)]) return null;
  if (sx === tx && sy === ty) return [];
  const size = MAP_W * MAP_H;
  const gScore = new Float32Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new MinHeap();
  const start = idx(sx, sy);
  const goal = idx(tx, ty);
  gScore[start] = 0;
  open.push({ i: start, f: 0 });

  while (open.size) {
    const cur = open.pop();
    if (closed[cur.i]) continue;
    if (cur.i === goal) {
      const path = [];
      let n = cur.i;
      while (n !== start && n !== -1) {
        path.push({ x: n % MAP_W, y: Math.floor(n / MAP_W) });
        n = came[n];
      }
      path.reverse();
      return path;
    }
    closed[cur.i] = 1;
    const cx = cur.i % MAP_W;
    const cy = Math.floor(cur.i / MAP_W);
    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inside(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (closed[ni] || state.blocked[ni]) continue;
      if (dx !== 0 && dy !== 0) {
        // Do not cut corners through blocked tiles.
        if (state.blocked[idx(cx + dx, cy)] || state.blocked[idx(cx, cy + dy)]) continue;
      }
      const tentative = gScore[cur.i] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = cur.i;
        const gx = Math.abs(nx - tx);
        const gy = Math.abs(ny - ty);
        const h = (gx + gy) + (Math.SQRT2 - 2) * Math.min(gx, gy);
        open.push({ i: ni, f: tentative + h });
      }
    }
  }
  return null;
}

function perimeterTiles(bld) {
  const out = [];
  for (let x = bld.x; x < bld.x + bld.w; x++) {
    out.push({ x, y: bld.y + bld.h });
    out.push({ x, y: bld.y - 1 });
  }
  for (let y = bld.y; y < bld.y + bld.h; y++) {
    out.push({ x: bld.x - 1, y });
    out.push({ x: bld.x + bld.w, y });
  }
  return out;
}

export function pathToBuilding(state, sx, sy, bld) {
  const options = perimeterTiles(bld)
    .filter((t) => !isBlocked(state, t.x, t.y) && isTerrainBuildable(state, t.x, t.y))
    .sort((a, b) => dist(a.x, a.y, sx, sy) - dist(b.x, b.y, sx, sy));
  for (const t of options) {
    const path = findPath(state, sx, sy, t.x, t.y);
    if (path) return { path, end: t };
  }
  return null;
}

export function pathToNode(state, sx, sy, node) {
  const options = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = node.x + dx;
      const y = node.y + dy;
      if (isBlocked(state, x, y)) continue;
      if (!isTerrainBuildable(state, x, y)) continue;
      options.push({ x, y });
    }
  }
  options.sort((a, b) => dist(a.x, a.y, sx, sy) - dist(b.x, b.y, sx, sy));
  for (const t of options) {
    const path = findPath(state, sx, sy, t.x, t.y);
    if (path) return { path, end: t };
  }
  return null;
}

export function nodesInRange(state, kind, cx, cy, range, requireQty = true) {
  const out = [];
  for (const node of state.nodes) {
    if (node.kind !== kind) continue;
    if (requireQty && node.qty <= 0) continue;
    if (dist(node.x + 0.5, node.y + 0.5, cx, cy) > range) continue;
    out.push(node);
  }
  out.sort((a, b) => dist(a.x, a.y, cx, cy) - dist(b.x, b.y, cx, cy));
  return out;
}

export function buildingCenter(bld) {
  return { x: bld.x + bld.w / 2, y: bld.y + bld.h / 2 };
}

export function tileOf(px) {
  return Math.floor(px / TILE);
}

export function tileCenter(x, y) {
  return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
}

export function walkableNear(state, x, y, maxRadius = 4) {
  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!isBlocked(state, nx, ny) && isTerrainBuildable(state, nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

export function clampTile(x, y) {
  return { x: clamp(x, 0, MAP_W - 1), y: clamp(y, 0, MAP_H - 1) };
}
