// Simulation: buildings, settlers, jobs, economy, objectives, persistence.

import {
  BASE_POP_CAP,
  BASE_STORAGE,
  STORAGE_PER_STOREHOUSE,
  STORAGE_PER_TOWNHALL,
  BUILDINGS,
  QUESTS,
  POP_GROWTH_TIME,
  HARVEST_TICK,
  TILE,
  MAX_WORKSHOP_BONUS,
  SAVE_KEY,
} from './config.js';
import {
  generateWorld,
  rebuildBlocked,
  canOccupy,
  nodesInRange,
  pathToNode,
  pathToBuilding,
  buildingCenter,
  walkableNear,
  isBlocked,
  findPath,
  SPAWN_X,
  SPAWN_Y,
} from './world.js';
import { clamp, dist, mulberry32 } from './util.js';

const WORK_SPEED = 38;

export class Game {
  constructor(seed) {
    this.listeners = new Set();
    this.reset(seed);
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    for (const fn of this.listeners) fn(event);
  }

  reset(seed = (Math.random() * 0xffffffff) >>> 0) {
    this.seed = seed >>> 0;
    const world = generateWorld(this.seed);
    this.tiles = world.tiles;
    this.nodes = world.nodes;
    this.decor = world.decor;
    this.pond = world.pond;
    this.buildings = [];
    this.settlers = [];
    this.resources = { wood: 60, stone: 25 };
    this.stats = { wood: 0, stone: 0, built: 0, trips: 0 };
    this.time = 0;
    this.speed = 1;
    this.paused = false;
    this.running = false;
    this.won = false;
    this.questIndex = 0;
    this.growthTimer = 0;
    this.questTimer = 0;
    this.nextBuildingId = 1;
    this.nextSettlerId = 1;
    this.selectedId = null;
    this.placement = null;
    this.rand = mulberry32(this.seed ^ 0x9e3779b9);
    this.lastStorageWarn = { wood: -99, stone: -99 };

    this.buildings.push(this.createBuilding('storehouse', SPAWN_X, SPAWN_Y, true));
    this.rebuild();
    for (let i = 0; i < 3; i++) this.spawnSettler(true);
    this.emit({ type: 'reset' });
    this.checkQuests();
  }

  // ---------------------------------------------------------------- helpers

  rebuild() {
    rebuildBlocked(this);
  }

  createBuilding(type, x, y, built = false) {
    const def = BUILDINGS[type];
    return {
      id: `b${this.nextBuildingId++}`,
      type,
      x,
      y,
      w: def.w,
      h: def.h,
      built,
      progress: built ? 1 : 0,
      workerId: null,
      smokeSeed: this.rand ? this.rand() * 100 : Math.random() * 100,
    };
  }

  buildingCount(type, completedOnly = false) {
    return this.buildings.filter((b) => b.type === type && (!completedOnly || b.built)).length;
  }

  getBuilding(id) {
    return this.buildings.find((b) => b.id === id) || null;
  }

  workerFor(bld) {
    return bld?.workerId ? this.settlers.find((s) => s.id === bld.workerId) || null : null;
  }

  storageCap() {
    let cap = BASE_STORAGE;
    for (const b of this.buildings) {
      if (!b.built) continue;
      if (b.type === 'storehouse') cap += STORAGE_PER_STOREHOUSE;
      if (b.type === 'townhall') cap += STORAGE_PER_TOWNHALL;
    }
    return cap;
  }

  popCap() {
    let cap = BASE_POP_CAP;
    for (const b of this.buildings) {
      if (!b.built) continue;
      if (b.type === 'house') cap += BUILDINGS.house.popCap;
      if (b.type === 'townhall') cap += 2;
    }
    return cap;
  }

  workshopBonus() {
    return Math.min(MAX_WORKSHOP_BONUS, this.buildingCount('workshop', true) * 0.25);
  }

  gatherMultiplier() {
    return 1 + this.workshopBonus();
  }

  houses() {
    return this.buildingCount('house', true);
  }

  storehouses() {
    return this.buildings.filter((b) => b.type === 'storehouse' && b.built);
  }

  idleSettlers() {
    return this.settlers.filter((s) => !s.job);
  }

  doorOf(bld) {
    return { x: bld.x + Math.floor(bld.w / 2), y: bld.y + bld.h };
  }

  centerOf(bld) {
    return buildingCenter(bld);
  }

  treesInRange(bld) {
    const c = this.centerOf(bld);
    return nodesInRange(this, 'tree', c.x, c.y, BUILDINGS.lumberjack.range).length;
  }

  rocksInRange(bld) {
    const c = this.centerOf(bld);
    return nodesInRange(this, 'rock', c.x, c.y, BUILDINGS.quarry.range).length;
  }

  // ---------------------------------------------------------------- placement

  canPlace(type, x, y) {
    const def = BUILDINGS[type];
    if (!def) return { ok: false, reason: 'Unknown building' };
    if (x == null || y == null) return { ok: false, reason: 'Pick a spot' };
    if (def.unique && this.buildingCount(type) >= 1) {
      return { ok: false, reason: 'You can only raise one Town Hall.' };
    }
    if (def.max && this.buildingCount(type, true) >= def.max) {
      return { ok: false, reason: `Maximum of ${def.max} workshops.` };
    }
    if (def.requires) {
      if (def.requires.pop && this.settlers.length < def.requires.pop) {
        return { ok: false, reason: `Requires ${def.requires.pop} settlers (${this.settlers.length}/${def.requires.pop}).` };
      }
      if (def.requires.houses && this.houses() < def.requires.houses) {
        return { ok: false, reason: `Requires ${def.requires.houses} cottages (${this.houses()}/${def.requires.houses}).` };
      }
    }
    for (const key of ['wood', 'stone']) {
      const need = def.cost[key] || 0;
      if (need && this.resources[key] < need) {
        return { ok: false, reason: `Not enough ${key}.` };
      }
    }
    if (!canOccupy(this, x, y, def.w, def.h)) {
      return { ok: false, reason: 'That ground is blocked. Pick clear grass or dirt.' };
    }
    if (type === 'lumberjack') {
      const c = { x: x + def.w / 2, y: y + def.h / 2 };
      if (!nodesInRange(this, 'tree', c.x, c.y, def.range).length) {
        return { ok: false, reason: 'No trees in range. Move closer to the pines.' };
      }
    }
    if (type === 'quarry') {
      const c = { x: x + def.w / 2, y: y + def.h / 2 };
      if (!nodesInRange(this, 'rock', c.x, c.y, def.range).length) {
        return { ok: false, reason: 'No rocks in range. Move closer to an outcrop.' };
      }
    }
    return { ok: true };
  }

  placeBuilding(type, x, y) {
    const check = this.canPlace(type, x, y);
    if (!check.ok) return check;
    const def = BUILDINGS[type];
    for (const key of ['wood', 'stone']) this.resources[key] -= def.cost[key] || 0;
    const bld = this.createBuilding(type, x, y, false);
    this.buildings.push(bld);
    this.rebuild();
    this.emit({ type: 'sfx', name: 'place' });
    this.emit({
      type: 'fx',
      kind: 'dust',
      x: (bld.x + bld.w / 2) * TILE,
      y: (bld.y + bld.h / 2) * TILE,
    });
    this.checkQuests();
    return { ok: true, building: bld };
  }

  demolish(id) {
    const bld = this.getBuilding(id);
    if (!bld) return { ok: false, reason: 'Building not found.' };
    if (bld.type === 'townhall') return { ok: false, reason: 'The Town Hall is the heart of your settlement.' };
    if (bld.type === 'storehouse' && this.buildingCount('storehouse') <= 1) {
      return { ok: false, reason: 'You need at least one storehouse.' };
    }
    const worker = this.workerFor(bld);
    if (worker) {
      worker.job = null;
      worker.state = 'idle';
      worker.status = 'Idle';
      worker.path = [];
      worker.pathIndex = 0;
      worker.carry = 0;
      worker.carryKind = null;
      worker.idleTimer = 0;
      this.releaseTarget(worker);
    }
    const def = BUILDINGS[bld.type];
    const refund = {};
    for (const key of ['wood', 'stone']) {
      const amount = Math.floor((def.cost[key] || 0) * 0.5);
      if (amount > 0) {
        refund[key] = amount;
        this.resources[key] = Math.min(this.storageCap(), this.resources[key] + amount);
      }
    }
    this.buildings = this.buildings.filter((b) => b.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.rebuild();
    const cap = this.storageCap();
    this.resources.wood = Math.min(this.resources.wood, cap);
    this.resources.stone = Math.min(this.resources.stone, cap);
    this.emit({ type: 'sfx', name: 'demolish' });
    this.emit({
      type: 'fx',
      kind: 'dust',
      x: (bld.x + bld.w / 2) * TILE,
      y: (bld.y + bld.h / 2) * TILE,
    });
    const parts = Object.entries(refund)
      .map(([k, v]) => `+${v} ${k}`)
      .join(', ');
    this.toast(parts ? `Demolished. Recovered ${parts}.` : 'Building demolished.', 'info');
    return { ok: true, refund };
  }

  // ---------------------------------------------------------------- workers

  spawnSettler(silent = false) {
    if (this.settlers.length >= this.popCap()) return null;
    let home = { x: SPAWN_X + 1, y: SPAWN_Y + 2 };
    const store = this.storehouses()[0];
    if (store) home = this.doorOf(store);
    const spot = walkableNear(this, home.x, home.y, 3) || home;
    const s = {
      id: `s${this.nextSettlerId++}`,
      x: spot.x * TILE + TILE / 2 + (this.rand() - 0.5) * 8,
      y: spot.y * TILE + TILE / 2 + (this.rand() - 0.5) * 8,
      home: { x: spot.x, y: spot.y },
      variant: Math.floor(this.rand() * 4),
      job: null,
      state: 'idle',
      path: [],
      pathIndex: 0,
      dir: 1,
      anim: this.rand() * 6,
      idleTimer: 1 + this.rand() * 4,
      retry: 0,
      targetNode: null,
      carry: 0,
      carryKind: null,
      workTimer: 0,
      harvestTick: 0,
      waitTimer: 0,
      status: 'Idle',
      storeId: null,
    };
    this.settlers.push(s);
    if (!silent) {
      this.toast(`A new settler arrived! (${this.settlers.length}/${this.popCap()})`, 'good');
      this.emit({ type: 'sfx', name: 'settler' });
      this.emit({ type: 'fx', kind: 'sparkle', x: s.x, y: s.y });
    }
    this.assignWorkers();
    return s;
  }

  assignWorkers() {
    for (const bld of this.buildings) {
      if (!bld.built || !BUILDINGS[bld.type].workers) continue;
      if (bld.workerId) continue;
      const free = this.settlers.find((s) => !s.job);
      if (!free) return;
      free.job = bld.id;
      bld.workerId = free.id;
      free.state = 'seek';
      free.retry = 0;
      free.path = [];
      free.pathIndex = 0;
      free.status = 'Heading to work';
      free.idleTimer = 0;
    }
  }

  releaseTarget(s) {
    if (s.targetNode && s.targetNode.reservedBy === s.id) s.targetNode.reservedBy = null;
    s.targetNode = null;
  }

  nearestStorehouse(s, kind) {
    const cap = this.storageCap();
    if (this.resources[kind] >= cap) return null;
    const px = Math.floor(s.x / TILE);
    const py = Math.floor(s.y / TILE);
    const candidates = this.buildings
      .filter((b) => b.built && (b.type === 'storehouse' || b.type === 'townhall'))
      .sort((a, b) => dist(a.x, a.y, px, py) - dist(b.x, b.y, px, py));
    for (const b of candidates) {
      const res = pathToBuilding(this, px, py, b);
      if (res) return { building: b, ...res };
    }
    return null;
  }

  beginTrip(s, bld) {
    const def = BUILDINGS[bld.type];
    const kind = def.produces;
    if (!kind) return;
    if (s.carry > 0) {
      const store = this.nearestStorehouse(s, s.carryKind);
      if (store) {
        s.storeId = store.building.id;
        s.path = store.path;
        s.pathIndex = 0;
        s.state = 'toStore';
        s.status = s.carryKind === 'wood' ? 'Hauling wood home' : 'Hauling stone home';
      } else {
        s.state = 'wait';
        s.status = 'Storage full';
        s.waitTimer = 2.5;
      }
      return;
    }
    if (this.resources[kind] >= this.storageCap()) {
      s.state = 'wait';
      s.status = 'Storage full';
      s.waitTimer = 2.5;
      return;
    }
    const c = this.centerOf(bld);
    const list = nodesInRange(this, kind === 'wood' ? 'tree' : 'rock', c.x, c.y, def.range).filter(
      (n) => !n.reservedBy || n.reservedBy === s.id
    );
    if (!list.length) {
      s.state = 'wait';
      s.status = kind === 'wood' ? 'No trees in range' : 'No stone in range';
      s.waitTimer = 3;
      return;
    }
    const px = Math.floor(s.x / TILE);
    const py = Math.floor(s.y / TILE);
    for (const node of list) {
      const res = pathToNode(this, px, py, node);
      if (!res) continue;
      this.releaseTarget(s);
      s.targetNode = node;
      node.reservedBy = s.id;
      s.path = res.path;
      s.pathIndex = 0;
      s.state = 'toNode';
      s.status = kind === 'wood' ? 'Walking to the pines' : 'Walking to the outcrop';
      return;
    }
    s.state = 'wait';
    s.status = 'No clear path';
    s.waitTimer = 3;
  }

  updateWorker(s, bld, dt) {
    const def = BUILDINGS[bld.type];
    const kind = def.produces;
    if (!kind) return;
    switch (s.state) {
      case 'seek': {
        s.retry -= dt;
        if (s.retry <= 0) {
          s.retry = 0.25;
          this.beginTrip(s, bld);
        }
        break;
      }
      case 'toNode': {
        const node = s.targetNode;
        if (!node || node.qty <= 0) {
          this.releaseTarget(s);
          s.state = 'seek';
          s.retry = 0;
          break;
        }
        s.status = kind === 'wood' ? 'Walking to the pines' : 'Walking to the outcrop';
        if (this.followPath(s, dt, WORK_SPEED)) {
          s.state = 'harvest';
          const bonus = this.gatherMultiplier();
          s.workTimer = def.harvestTime / bonus;
          s.harvestTick = 0.1;
          s.dir = node.x * TILE + TILE / 2 > s.x ? 1 : -1;
        }
        break;
      }
      case 'harvest': {
        const node = s.targetNode;
        if (!node || node.qty <= 0) {
          this.releaseTarget(s);
          s.state = 'seek';
          s.retry = 0;
          break;
        }
        s.status = node.kind === 'tree' ? 'Chopping wood' : 'Mining stone';
        s.workTimer -= dt;
        s.harvestTick -= dt;
        if (s.harvestTick <= 0) {
          s.harvestTick = HARVEST_TICK;
          this.emit({
            type: 'fx',
            kind: node.kind === 'tree' ? 'chop' : 'mine',
            x: node.x * TILE + TILE / 2,
            y: node.y * TILE + TILE / 2,
          });
          this.emit({ type: 'sfx', name: node.kind === 'tree' ? 'chop' : 'mine' });
        }
        if (s.workTimer <= 0) {
          const take = Math.min(def.carry, node.qty);
          node.qty -= take;
          s.carry = take;
          s.carryKind = kind;
          s.status = 'Hauling the load';
          this.releaseTarget(s);
          if (node.qty <= 0) {
            if (node.kind === 'tree') {
              node.regrow = 38 + this.rand() * 14;
              this.emit({
                type: 'fx',
                kind: 'leaves',
                x: node.x * TILE + TILE / 2,
                y: node.y * TILE + TILE / 2,
              });
            } else {
              node.qty = 0;
              node.regrow = 0;
              this.emit({
                type: 'fx',
                kind: 'mineBurst',
                x: node.x * TILE + TILE / 2,
                y: node.y * TILE + TILE / 2,
              });
            }
            this.rebuild();
          }
          const store = this.nearestStorehouse(s, kind);
          if (store) {
            s.storeId = store.building.id;
            s.path = store.path;
            s.pathIndex = 0;
            s.state = 'toStore';
            s.status = kind === 'wood' ? 'Hauling wood home' : 'Hauling stone home';
          } else {
            s.state = 'wait';
            s.waitTimer = 2;
            s.status = 'Storage full';
          }
        }
        break;
      }
      case 'toStore': {
        s.status = s.carryKind === 'wood' ? 'Hauling wood home' : 'Hauling stone home';
        if (this.followPath(s, dt, WORK_SPEED)) {
          this.deposit(s);
        }
        break;
      }
      case 'wait': {
        s.waitTimer -= dt;
        if (s.waitTimer <= 0) {
          s.state = 'seek';
          s.retry = 0;
        }
        break;
      }
      default: {
        s.state = 'seek';
        s.retry = 0;
      }
    }
  }

  deposit(s) {
    if (!s.carry || !s.carryKind) {
      s.state = 'seek';
      s.retry = 0;
      return;
    }
    const cap = this.storageCap();
    const room = Math.max(0, cap - this.resources[s.carryKind]);
    const add = Math.min(s.carry, room);
    if (add > 0) {
      this.resources[s.carryKind] = Math.min(cap, this.resources[s.carryKind] + add);
      this.stats[s.carryKind] = (this.stats[s.carryKind] || 0) + add;
      this.stats.trips++;
      s.carry -= add;
      this.emit({
        type: 'float',
        x: s.x,
        y: s.y - 22,
        text: `+${add}`,
        kind: s.carryKind,
      });
      this.emit({ type: 'sfx', name: 'deposit' });
      this.emit({
        type: 'fx',
        kind: 'sparkle',
        x: s.x,
        y: s.y - 10,
        small: true,
      });
    }
    if (s.carry > 0) {
      s.state = 'wait';
      s.waitTimer = 2.5;
      s.status = 'Storage full';
    } else {
      s.carry = 0;
      s.carryKind = null;
      s.state = 'seek';
      s.retry = 0;
      s.path = [];
      s.pathIndex = 0;
    }
  }

  followPath(s, dt, speed) {
    if (!s.path || s.pathIndex >= s.path.length) {
      s.path = [];
      s.pathIndex = 0;
      return true;
    }
    let remaining = speed * dt;
    while (remaining > 0 && s.pathIndex < s.path.length) {
      const tile = s.path[s.pathIndex];
      const tx = tile.x * TILE + TILE / 2;
      const ty = tile.y * TILE + TILE / 2;
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.hypot(dx, dy);
      if (d <= remaining) {
        s.x = tx;
        s.y = ty;
        remaining -= d;
        s.pathIndex++;
      } else {
        s.x += (dx / d) * remaining;
        s.y += (dy / d) * remaining;
        if (Math.abs(dx) > 0.4) s.dir = dx > 0 ? 1 : -1;
        s.anim += dt * 10;
        s.moving = true;
        return false;
      }
      if (Math.abs(dx) > 0.4) s.dir = dx > 0 ? 1 : -1;
    }
    s.path = [];
    s.pathIndex = 0;
    s.moving = false;
    return true;
  }

  updateIdle(s, dt) {
    s.status = 'Idle';
    if (s.state === 'walk') {
      if (this.followPath(s, dt, 23)) {
        s.state = 'idle';
        s.idleTimer = 2.5 + this.rand() * 5;
      }
      return;
    }
    s.idleTimer -= dt;
    if (s.idleTimer > 0) return;
    s.idleTimer = 3 + this.rand() * 6;
    const home = walkableNear(this, s.home.x, s.home.y, 1) || s.home;
    for (let i = 0; i < 8; i++) {
      const tx = home.x + Math.floor((this.rand() - 0.5) * 7);
      const ty = home.y + Math.floor((this.rand() - 0.5) * 7);
      if (isBlocked(this, tx, ty)) continue;
      const px = Math.floor(s.x / TILE);
      const py = Math.floor(s.y / TILE);
      const path = findPath(this, px, py, tx, ty);
      if (path) {
        s.path = path;
        s.pathIndex = 0;
        s.state = 'walk';
        return;
      }
    }
  }

  updateSettlers(dt) {
    for (const s of this.settlers) {
      s.moving = false;
      if (s.job) {
        const bld = this.getBuilding(s.job);
        if (!bld || !bld.built) {
          s.job = null;
          s.state = 'idle';
          s.status = 'Idle';
          this.releaseTarget(s);
          continue;
        }
        this.updateWorker(s, bld, dt);
      } else {
        this.updateIdle(s, dt);
      }
      if (s.state !== 'walk' && s.state !== 'toNode' && s.state !== 'toStore' && s.state !== 'harvest') {
        // gentle idle bob
        s.anim += dt * 2;
      }
    }
  }

  // ---------------------------------------------------------------- updates

  updatePopulation(dt) {
    const cap = this.popCap();
    if (this.settlers.length < cap) {
      this.growthTimer += dt;
      if (this.growthTimer >= POP_GROWTH_TIME) {
        this.growthTimer -= POP_GROWTH_TIME;
        this.spawnSettler();
      }
    } else {
      this.growthTimer = 0;
    }
  }

  updateBuildings(dt) {
    for (const bld of this.buildings) {
      if (bld.built) continue;
      const def = BUILDINGS[bld.type];
      bld.progress = clamp(bld.progress + dt / def.buildTime, 0, 1);
      if (bld.progress >= 1) this.finishBuilding(bld);
    }
  }

  finishBuilding(bld) {
    const def = BUILDINGS[bld.type];
    bld.built = true;
    bld.progress = 1;
    this.stats.built++;
    this.emit({ type: 'sfx', name: 'complete' });
    this.emit({
      type: 'fx',
      kind: 'dust',
      x: (bld.x + bld.w / 2) * TILE,
      y: (bld.y + bld.h / 2) * TILE,
    });
    if (bld.type === 'house') {
      this.toast(`Cottage finished! Population cap is now ${this.popCap()}.`, 'good');
    } else if (bld.type === 'storehouse') {
      this.toast(`Storehouse finished! Storage capacity is now ${this.storageCap()}.`, 'good');
    } else if (bld.type === 'townhall') {
      this.toast('The Town Hall is complete!', 'quest');
      this.win();
    } else if (bld.type === 'workshop') {
      const bonus = Math.round(this.workshopBonus() * 100);
      this.toast(`Workshop finished! Gather speed +${bonus}%.`, 'good');
    } else {
      this.toast(`${def.name} finished.`, 'good');
    }
    this.assignWorkers();
    this.checkQuests();
    this.autoSave?.();
  }

  updateNodes(dt) {
    let changed = false;
    for (const node of this.nodes) {
      if (node.kind !== 'tree' || node.qty > 0 || node.regrow <= 0) continue;
      node.regrow -= dt;
      if (node.regrow <= 0) {
        node.regrow = 0;
        node.qty = node.max;
        changed = true;
      }
    }
    if (changed) this.rebuild();
  }

  update(dt) {
    if (!this.running || this.paused) return;
    this.time += dt;
    this.updateBuildings(dt);
    this.updateNodes(dt);
    this.updatePopulation(dt);
    this.updateSettlers(dt);
    this.questTimer -= dt;
    if (this.questTimer <= 0) {
      this.questTimer = 0.5;
      this.checkQuests();
      this.warnStorage();
    }
  }

  warnStorage() {
    const cap = this.storageCap();
    for (const key of ['wood', 'stone']) {
      if (this.resources[key] >= cap && this.time - this.lastStorageWarn[key] > 20) {
        this.lastStorageWarn[key] = this.time;
        this.toast(`Storage full on ${key}. Build another storehouse!`, 'warn');
      }
    }
  }

  // ---------------------------------------------------------------- objectives

  questProgress() {
    const quest = QUESTS[this.questIndex];
    if (!quest) return { value: 1, max: 1 };
    if (quest.progress) return quest.progress(this);
    return { value: quest.check(this) ? 1 : 0, max: 1 };
  }

  checkQuests() {
    let guard = 0;
    while (this.questIndex < QUESTS.length && guard++ < QUESTS.length + 1) {
      const quest = QUESTS[this.questIndex];
      if (!quest.check(this)) break;
      this.completeQuest(quest);
    }
  }

  completeQuest(quest) {
    this.questIndex++;
    let rewardText = '';
    if (quest.reward) {
      const cap = this.storageCap();
      const parts = [];
      for (const [key, amount] of Object.entries(quest.reward)) {
        const before = this.resources[key];
        this.resources[key] = Math.min(cap, this.resources[key] + amount);
        const gained = Math.floor(this.resources[key] - before);
        if (gained > 0) parts.push(`+${gained} ${key}`);
      }
      rewardText = parts.join('  ');
    }
    const isLast = quest.id === 'townhall';
    if (!isLast) {
      this.toast(`Objective complete: ${quest.title}!${rewardText ? `  ${rewardText}` : ''}`, 'quest', 4200);
      this.emit({ type: 'sfx', name: 'quest' });
    }
    this.emit({ type: 'quest', quest, reward: quest.reward, index: this.questIndex });
    if (quest.id === 'townhall') this.win();
    this.autoSave?.();
  }

  win() {
    if (this.won) return;
    this.won = true;
    this.emit({ type: 'sfx', name: 'win' });
    this.emit({
      type: 'win',
      stats: {
        time: this.time,
        pop: this.settlers.length,
        buildings: this.buildings.filter((b) => b.built).length,
        wood: Math.floor(this.stats.wood),
        stone: Math.floor(this.stats.stone),
      },
    });
    this.save();
  }

  // ---------------------------------------------------------------- input-ish

  toast(text, tone = 'info', duration = 3000) {
    this.emit({ type: 'toast', text, tone, duration });
  }

  select(id) {
    this.selectedId = id;
  }

  setSpeed(speed) {
    this.speed = speed;
    if (speed > 0) this.paused = false;
  }

  statusFor(bld) {
    if (!bld.built) {
      return `Under construction — ${Math.round(bld.progress * 100)}%`;
    }
    const def = BUILDINGS[bld.type];
    if (bld.type === 'house') return 'A cozy home for your settlers.';
    if (bld.type === 'storehouse') {
      return `Deposit point. Storage capacity ${this.storageCap()}.`;
    }
    if (bld.type === 'workshop') {
      return `Gather speed +${Math.round(this.workshopBonus() * 100)}% (${this.buildingCount('workshop', true)}/3 built).`;
    }
    if (bld.type === 'townhall') return 'The proud heart of Timberhold.';
    const worker = this.workerFor(bld);
    if (!worker) return 'Needs a worker — build a cottage for more settlers.';
    if (worker.status === 'No trees in range') return 'No trees in range. Place another hut closer to the forest.';
    if (worker.status === 'No stone in range') return 'No stone in range. The outcrop here may be exhausted.';
    if (worker.status === 'Storage full') return 'Storage is full. Build another storehouse.';
    return worker.status;
  }

  detailStats(bld) {
    const def = BUILDINGS[bld.type];
    const out = [];
    if (def.produces) {
      out.push({ label: 'Produces', value: def.produces === 'wood' ? 'Wood' : 'Stone' });
      out.push({ label: 'Per trip', value: `${def.carry}` });
      const mult = this.gatherMultiplier();
      out.push({ label: 'Gather time', value: `${(def.harvestTime / mult).toFixed(1)}s` });
      if (bld.built) {
        out.push({
          label: bld.type === 'lumberjack' ? 'Trees in range' : 'Rocks in range',
          value: `${bld.type === 'lumberjack' ? this.treesInRange(bld) : this.rocksInRange(bld)}`,
        });
      }
    }
    if (def.popCap) out.push({ label: 'Population cap', value: `+${def.popCap}` });
    if (def.storage) out.push({ label: 'Storage', value: `+${def.storage}` });
    if (bld.type === 'workshop') out.push({ label: 'Gather bonus', value: '+25% each' });
    if (def.workers) {
      const w = this.workerFor(bld);
      out.push({ label: 'Worker', value: w ? 'Assigned' : 'None' });
    }
    return out;
  }

  // ---------------------------------------------------------------- persistence

  save() {
    try {
      const data = {
        v: 3,
        seed: this.seed,
        savedAt: Date.now(),
        time: this.time,
        resources: { ...this.resources },
        questIndex: this.questIndex,
        won: this.won,
        growthTimer: this.growthTimer,
        stats: { ...this.stats },
        buildings: this.buildings.map((b) => ({
          type: b.type,
          x: b.x,
          y: b.y,
          built: b.built,
          progress: b.progress,
          worker: Boolean(b.workerId),
        })),
        nodes: this.nodes.map((n) => ({ id: n.id, qty: n.qty, regrow: n.regrow })),
        pop: this.settlers.length,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  static hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data && data.v === 3 && Array.isArray(data.buildings);
    } catch {
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.v !== 3 || !data.seed || !Array.isArray(data.buildings)) return false;
      if (!data.buildings.length) return false;
      return this.loadData(data);
    } catch {
      return false;
    }
  }

  loadData(data) {
    const world = generateWorld(data.seed);
    this.seed = data.seed;
    this.tiles = world.tiles;
    this.nodes = world.nodes;
    this.decor = world.decor;
    this.pond = world.pond;
    this.buildings = [];
    this.settlers = [];
    this.nextBuildingId = 1;
    this.nextSettlerId = 1;
    this.rand = mulberry32((data.seed ^ 0x9e3779b9) >>> 0);
    this.time = data.time || 0;
    this.resources = { wood: 0, stone: 0, ...(data.resources || {}) };
    this.questIndex = clamp(data.questIndex || 0, 0, QUESTS.length);
    this.won = Boolean(data.won);
    this.growthTimer = data.growthTimer || 0;
    this.stats = { wood: 0, stone: 0, built: 0, trips: 0, ...(data.stats || {}) };
    this.speed = 1;
    this.paused = false;
    this.running = false;
    this.selectedId = null;
    this.placement = null;
    this.questTimer = 0;
    this.lastStorageWarn = { wood: -99, stone: -99 };

    for (const item of data.buildings) {
      if (!BUILDINGS[item.type]) continue;
      const bld = this.createBuilding(item.type, item.x, item.y, Boolean(item.built));
      bld.progress = item.built ? 1 : clamp(item.progress || 0, 0, 1);
      this.buildings.push(bld);
    }
    if (!this.buildings.some((b) => b.type === 'storehouse')) {
      this.buildings.push(this.createBuilding('storehouse', SPAWN_X, SPAWN_Y, true));
    }

    for (const saved of data.nodes || []) {
      const node = this.nodes.find((n) => n.id === saved.id);
      if (!node) continue;
      node.qty = clamp(saved.qty ?? node.qty, 0, node.max);
      node.regrow = saved.regrow || 0;
    }
    this.rebuild();

    const pop = clamp(data.pop || 3, 1, 60);
    for (let i = 0; i < data.buildings.length; i++) {
      const saved = data.buildings[i];
      const bld = this.buildings[i];
      if (!saved || !bld || !saved.worker) continue;
      if (!bld.built || !BUILDINGS[bld.type].workers) continue;
      if (this.settlers.length >= pop) break;
      const door = this.doorOf(bld);
      const spot = walkableNear(this, door.x, door.y, 2) || door;
      const s = this.makeSettlerAt(spot.x, spot.y);
      s.job = bld.id;
      bld.workerId = s.id;
      s.state = 'seek';
      this.settlers.push(s);
    }
    while (this.settlers.length < pop) {
      const store = this.storehouses()[0];
      const door = store ? this.doorOf(store) : { x: SPAWN_X + 1, y: SPAWN_Y + 2 };
      const spot = walkableNear(this, door.x, door.y, 3) || door;
      this.settlers.push(this.makeSettlerAt(spot.x, spot.y));
    }
    const cap = this.storageCap();
    this.resources.wood = clamp(this.resources.wood, 0, cap);
    this.resources.stone = clamp(this.resources.stone, 0, cap);
    this.emit({ type: 'reset' });
    this.assignWorkers();
    return true;
  }

  makeSettlerAt(tx, ty) {
    return {
      id: `s${this.nextSettlerId++}`,
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      home: { x: tx, y: ty },
      variant: Math.floor(this.rand() * 4),
      job: null,
      state: 'idle',
      path: [],
      pathIndex: 0,
      dir: 1,
      anim: this.rand() * 6,
      idleTimer: 1 + this.rand() * 4,
      retry: 0,
      targetNode: null,
      carry: 0,
      carryKind: null,
      workTimer: 0,
      harvestTick: 0,
      waitTimer: 0,
      status: 'Idle',
      storeId: null,
    };
  }

  clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }
}

