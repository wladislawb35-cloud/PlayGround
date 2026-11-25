// Canvas renderer: pre-rendered terrain, sorted entities, particles, camera.

import {
  TILE,
  WORLD_W,
  WORLD_H,
  MAP_W,
  MAP_H,
  T_GRASS,
  T_DIRT,
  T_WATER,
  T_SAND,
  T_DARK,
  TERRAIN_COLORS,
  BUILDINGS,
  C,
} from './config.js';
import { getSprites, iconCanvas } from './art.js';
import { hash2, clamp, dist } from './util.js';

const SMOKE_TYPES = new Set(['house', 'lumberjack', 'workshop', 'storehouse', 'townhall']);

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.sprites = getSprites();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    this.fit = 1;
    this.minZoom = 0.3;
    this.maxZoom = 3;
    this.vw = 1;
    this.vh = 1;
    this.pointer = { x: 0, y: 0, inside: false };
    this.particles = [];
    this.floats = [];
    this.animTime = 0;
    this.smokeTimers = new Map();
    this.initialized = false;
    this.terrain = null;
    this.bgGradient = null;
    this.lastFrame = 0;
    this.resize();
    game.on((event) => this.onEvent(event));
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.vw = Math.max(1, rect.width);
    this.vh = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    const narrow = this.vw < 720;
    const topInset = narrow ? 58 : 64;
    const bottomInset = narrow ? 118 : 146;
    this.viewY = topInset + Math.max(120, this.vh - topInset - bottomInset) / 2;
    this.fit = Math.min((this.vw - (narrow ? 20 : 48)) / WORLD_W, (this.vh - topInset - bottomInset) / WORLD_H);
    this.fit = Math.max(0.24, this.fit);
    this.minZoom = Math.max(0.22, this.fit * 0.85);
    this.maxZoom = Math.max(3.2, this.fit * 4.2);
    if (!this.initialized || !this.userZoomed) {
      const def = narrow ? Math.max(this.fit * 1.75, 0.72) : Math.min(this.fit * 1.04, 2);
      this.cam.zoom = clamp(def, this.minZoom, this.maxZoom);
      this.cam.x = WORLD_W / 2;
      this.cam.y = WORLD_H / 2;
      this.initialized = true;
    } else {
      this.cam.zoom = clamp(this.cam.zoom, this.minZoom, this.maxZoom);
    }
    this.clampCamera();
    this.bgGradient = null;
  }

  resetCamera() {
    this.userZoomed = false;
    this.cam.x = WORLD_W / 2;
    this.cam.y = WORLD_H / 2;
    const narrow = this.vw < 720;
    this.cam.zoom = clamp(narrow ? Math.max(this.fit * 1.75, 0.72) : Math.min(this.fit * 1.04, 2), this.minZoom, this.maxZoom);
    this.clampCamera();
  }

  defaultTile() {
    return this.tileUnderPointer(this.game.placement) || {
      x: Math.floor(this.cam.x / TILE) - 1,
      y: Math.floor(this.cam.y / TILE) - 1,
    };
  }

  clampCamera() {
    const halfW = this.vw / 2 / this.cam.zoom;
    const halfH = this.vh / 2 / this.cam.zoom;
    if (halfW * 2 >= WORLD_W) this.cam.x = WORLD_W / 2;
    else this.cam.x = clamp(this.cam.x, halfW - 8, WORLD_W - halfW + 8);
    if (halfH * 2 >= WORLD_H) this.cam.y = WORLD_H / 2;
    else this.cam.y = clamp(this.cam.y, halfH - 8, WORLD_H - halfH + 8);
  }

  pan(dx, dy) {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.clampCamera();
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = clamp(this.cam.zoom * factor, this.minZoom, this.maxZoom);
    this.userZoomed = true;
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCamera();
  }

  centerOn(x, y) {
    this.cam.x = x;
    this.cam.y = y;
    this.clampCamera();
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.vw / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.vh / 2) / this.cam.zoom + this.cam.y,
    };
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.cam.x) * this.cam.zoom + this.vw / 2,
      y: (y - this.cam.y) * this.cam.zoom + this.vh / 2,
    };
  }

  tileUnderPointer(type) {
    if (!this.pointer.inside) return null;
    const def = type ? BUILDINGS[type] : null;
    const world = this.screenToWorld(this.pointer.x, this.pointer.y);
    const wx = world.x / TILE;
    const wy = world.y / TILE;
    if (!def) return { x: Math.floor(wx), y: Math.floor(wy) };
    return { x: Math.round(wx - def.w / 2), y: Math.round(wy - def.h / 2) };
  }

  buildingAt(wx, wy) {
    const list = [...this.game.buildings].sort((a, b) => b.y + b.h - (a.y + a.h));
    for (const bld of list) {
      const top = bld.y * TILE - (bld.type === 'townhall' ? 62 : 30);
      const left = bld.x * TILE - 7;
      const right = (bld.x + bld.w) * TILE + 7;
      const bottom = (bld.y + bld.h) * TILE + 8;
      if (wx >= left && wx <= right && wy >= top && wy <= bottom) return bld;
    }
    return null;
  }

  // ------------------------------------------------------------- terrain

  renderTerrain() {
    const { canvas, ctx } = this.makeOffscreen(WORLD_W, WORLD_H);
    const tiles = this.game.tiles;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const type = tiles[y * MAP_W + x];
        this.drawTerrainTile(ctx, x, y, type);
      }
    }
    // Soften dirt edges with scattered pixels of the neighbouring tone.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const type = tiles[y * MAP_W + x];
        if (type !== T_DIRT) continue;
        ctx.fillStyle = 'rgba(90,120,55,.45)';
        for (let i = 0; i < 5; i++) {
          const px = x * TILE + Math.floor(hash2(x, y, 30 + i) * TILE);
          const py = y * TILE + Math.floor(hash2(x, y, 40 + i) * TILE);
          if (px % TILE < 4 || px % TILE > TILE - 4 || py % TILE < 4 || py % TILE > TILE - 4) {
            ctx.fillRect(px, py, 2, 1);
          }
        }
      }
    }
    return canvas;
  }

  drawTerrainTile(ctx, x, y, type) {
    const px = x * TILE;
    const py = y * TILE;
    const h = (salt) => hash2(x, y, salt);
    const colors = TERRAIN_COLORS[type] || TERRAIN_COLORS[T_GRASS];
    ctx.fillStyle = colors[0];
    ctx.fillRect(px, py, TILE, TILE);

    if (type === T_GRASS) {
      for (let i = 0; i < 7; i++) {
        const bx = Math.floor(h(i + 1) * 7) * 4;
        const by = Math.floor(h(i + 11) * 7) * 4;
        const shade = h(i + 21);
        ctx.fillStyle = shade > 0.66 ? colors[2] : shade > 0.33 ? colors[1] : colors[3];
        ctx.fillRect(px + bx, py + by, 4, 4);
      }
      for (let i = 0; i < 4; i++) {
        const bx = Math.floor(h(i + 31) * 30);
        const by = Math.floor(h(i + 41) * 30);
        ctx.fillStyle = colors[1];
        ctx.fillRect(px + bx, py + by, 1, 3);
        ctx.fillRect(px + bx + 1, py + by + 1, 1, 2);
        ctx.fillStyle = colors[2];
        ctx.fillRect(px + bx, py + by, 1, 1);
      }
      const flower = h(51);
      if (flower > 0.9) {
        const fx = px + 6 + Math.floor(h(52) * 18);
        const fy = py + 6 + Math.floor(h(53) * 18);
        ctx.fillStyle = flower > 0.96 ? '#f0d264' : flower > 0.93 ? '#f4f0df' : '#e26b6b';
        ctx.fillRect(fx, fy, 2, 2);
        ctx.fillStyle = '#3e6d2c';
        ctx.fillRect(fx, fy + 2, 1, 2);
      } else if (flower < 0.035) {
        ctx.fillStyle = '#8a8f7a';
        const fx = px + 10 + Math.floor(h(54) * 12);
        const fy = py + 10 + Math.floor(h(55) * 12);
        ctx.fillRect(fx, fy, 3, 2);
        ctx.fillStyle = '#b6b8a6';
        ctx.fillRect(fx, fy, 2, 1);
      }
    } else if (type === T_DIRT) {
      for (let i = 0; i < 8; i++) {
        const bx = Math.floor(h(i + 2) * 8) * 4;
        const by = Math.floor(h(i + 12) * 8) * 4;
        ctx.fillStyle = h(i + 22) > 0.5 ? colors[1] : colors[2];
        ctx.fillRect(px + bx, py + by, 3, 2);
      }
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#6f5a3c';
        ctx.fillRect(px + Math.floor(h(i + 32) * 28), py + Math.floor(h(i + 42) * 28), 2, 1);
      }
    } else if (type === T_SAND) {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = h(i + 3) > 0.5 ? colors[1] : colors[2];
        ctx.fillRect(px + Math.floor(h(i + 13) * 30), py + Math.floor(h(i + 23) * 30), 2, 1);
      }
    } else if (type === T_WATER) {
      ctx.fillStyle = colors[1];
      ctx.fillRect(px, py, TILE, 6);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = 'rgba(120,175,215,.14)';
        ctx.fillRect(px + Math.floor(h(i + 5) * 24), py + 8 + Math.floor(h(i + 15) * 18), 6, 2);
      }
      // shoreline
      const neighbors = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const nt = this.game.tiles[ny * MAP_W + nx];
        if (nt === T_WATER) continue;
        ctx.fillStyle = 'rgba(235,240,225,.28)';
        if (dy === -1) ctx.fillRect(px, py, TILE, 2);
        if (dy === 1) ctx.fillRect(px, py + TILE - 2, TILE, 2);
        if (dx === -1) ctx.fillRect(px, py, 2, TILE);
        if (dx === 1) ctx.fillRect(px + TILE - 2, py, 2, TILE);
      }
    } else if (type === T_DARK) {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = h(i + 4) > 0.5 ? colors[1] : colors[2];
        ctx.fillRect(px + Math.floor(h(i + 14) * 7) * 4, py + Math.floor(h(i + 24) * 7) * 4, 4, 4);
      }
      if (h(60) > 0.7) {
        ctx.fillStyle = '#35502b';
        ctx.fillRect(px + 6, py + 22, 2, 4);
        ctx.fillRect(px + 20, py + 10, 2, 5);
      }
    }
  }

  makeOffscreen(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  // ------------------------------------------------------------- events

  onEvent(event) {
    if (event.type === 'fx') this.spawnFx(event);
    else if (event.type === 'float') this.spawnFloat(event);
    else if (event.type === 'reset') {
      this.terrain = null;
      this.particles = [];
      this.floats = [];
      this.smokeTimers.clear();
    } else if (event.type === 'win') {
      this.confetti();
    }
  }

  spawnFx(event) {
    const { x, y, kind } = event;
    const push = (n, opts) => {
      for (let i = 0; i < n; i++) {
        if (this.particles.length > 320) break;
        const a = Math.random() * Math.PI * 2;
        const sp = (opts.speed || 20) * (0.4 + Math.random());
        this.particles.push({
          x: x + (Math.random() - 0.5) * (opts.spread || 10),
          y: y + (Math.random() - 0.5) * (opts.spread || 10),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (opts.up || 10),
          g: opts.g ?? 60,
          life: opts.life ?? 0.8,
          maxLife: opts.life ?? 0.8,
          size: opts.size ?? 2,
          color: opts.colors[Math.floor(Math.random() * opts.colors.length)],
          kind: opts.kind || 'chip',
          grow: opts.grow || 0,
          sway: opts.sway || 0,
        });
      }
    };
    if (kind === 'chop') {
      push(4, { colors: ['#5aa956', '#3f8a44', '#2f7038'], speed: 26, up: 20, life: 0.7, size: 2, kind: 'leaf' });
      push(3, { colors: ['#c9a26b', '#a98254', '#6b4527'], speed: 20, up: 12, life: 0.5, size: 2 });
    } else if (kind === 'mine') {
      push(5, { colors: ['#b6b8c0', '#8e9099', '#63656e'], speed: 24, up: 16, life: 0.6, size: 2 });
      push(2, { colors: ['#d8dae0'], speed: 14, up: 22, life: 0.4, size: 1 });
    } else if (kind === 'leaves') {
      push(10, { colors: ['#5aa956', '#7cc266', '#3f8a44'], speed: 30, up: 26, life: 1.1, size: 2, kind: 'leaf', sway: 8 });
    } else if (kind === 'mineBurst') {
      push(14, { colors: ['#b6b8c0', '#8e9099', '#63656e', '#464851'], speed: 42, up: 24, life: 0.9, size: 2, spread: 16 });
      push(5, { colors: ['#d8dae0'], speed: 20, up: 40, life: 0.6, size: 1 });
    } else if (kind === 'dust') {
      push(14, { colors: ['#c19a68', '#a98254', '#d9c18a', '#8a653c'], speed: 26, up: 8, life: 0.9, size: 3, kind: 'dust', grow: 4 });
    } else if (kind === 'sparkle') {
      push(event.small ? 3 : 6, { colors: ['#f2c14e', '#fff1cb', '#e0a93c'], speed: 16, up: 24, life: 0.6, size: 1, g: 20 });
    }
  }

  spawnFloat(event) {
    this.floats.push({
      x: event.x,
      y: event.y,
      text: event.text,
      kind: event.kind || 'wood',
      life: 1.35,
      maxLife: 1.35,
    });
    if (this.floats.length > 30) this.floats.shift();
  }

  confetti() {
    const colors = ['#f2c14e', '#c9503c', '#6fae4a', '#4b7fae', '#fff1cb', '#e28a63'];
    for (let i = 0; i < 120; i++) {
      this.particles.push({
        x: this.cam.x + (Math.random() - 0.5) * (this.vw / this.cam.zoom) * 1.1,
        y: this.cam.y - this.vh / this.cam.zoom / 2 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 40,
        vy: 10 + Math.random() * 30,
        g: 40,
        life: 2.4 + Math.random() * 1.6,
        maxLife: 4,
        size: 2 + Math.floor(Math.random() * 2),
        color: colors[Math.floor(Math.random() * colors.length)],
        kind: 'confetti',
        sway: 18,
      });
    }
  }

  // ------------------------------------------------------------- frame

  draw(dt) {
    this.animTime += dt;
    const game = this.game;
    if (!this.terrain) this.terrain = this.renderTerrain();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (!this.bgGradient) {
      const g = ctx.createLinearGradient(0, 0, 0, this.vh);
      g.addColorStop(0, '#1d2f1c');
      g.addColorStop(0.55, '#182716');
      g.addColorStop(1, '#101a10');
      this.bgGradient = g;
    }
    ctx.fillStyle = this.bgGradient;
    ctx.fillRect(0, 0, this.vw, this.vh);

    ctx.save();
    ctx.translate(this.vw / 2, this.vh / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    ctx.drawImage(this.terrain, 0, 0);
    this.drawWater();
    this.drawGroundOverlays();

    const entities = [];
    for (const deco of game.decor) {
      entities.push({ y: deco.y * TILE + 34, draw: () => this.drawBorderPine(deco) });
    }
    for (const node of game.nodes) {
      if (node.kind === 'rock' && node.qty <= 0) continue;
      entities.push({ y: node.y * TILE + 34, draw: () => this.drawNode(node) });
    }
    for (const bld of game.buildings) {
      entities.push({ y: (bld.y + bld.h) * TILE, draw: () => this.drawBuilding(bld, dt) });
    }
    for (const s of game.settlers) {
      entities.push({ y: s.y, draw: () => this.drawSettler(s) });
    }
    entities.sort((a, b) => a.y - b.y);
    for (const e of entities) e.draw();

    this.updateParticles(dt);
    this.drawParticles();

    ctx.restore();

    this.drawNight();
    this.drawFloats(dt);
  }

  drawWater() {
    const game = this.game;
    if (!game.waterTiles) return;
    const ctx = this.ctx;
    for (const tile of game.waterTiles) {
      const t = this.animTime * 1.4 + hash2(tile.x, tile.y, 5) * 9;
      const ox = Math.sin(t) * 3;
      const oy = Math.cos(t * 0.7) * 2;
      const a = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 1.7));
      ctx.fillStyle = `rgba(190,225,245,${a.toFixed(3)})`;
      ctx.fillRect(tile.x * TILE + 6 + ox, tile.y * TILE + 12 + oy, 7, 1);
      ctx.fillRect(tile.x * TILE + 18 + ox, tile.y * TILE + 22 + oy, 5, 1);
      if (hash2(tile.x, tile.y, 8) > 0.6) {
        ctx.fillStyle = `rgba(255,255,255,${(a * 0.8).toFixed(3)})`;
        ctx.fillRect(tile.x * TILE + 10 + ox * 1.4, tile.y * TILE + 18 + oy, 2, 1);
      }
    }
  }

  drawGroundOverlays() {
    const game = this.game;
    const ctx = this.ctx;
    const lw = 2 / this.cam.zoom;

    // Hover tile
    if (this.pointer.inside && !game.placement) {
      const t = this.tileUnderPointer(null);
      if (t && t.x >= 0 && t.y >= 0 && t.x < MAP_W && t.y < MAP_H) {
        ctx.strokeStyle = 'rgba(242,193,78,.35)';
        ctx.lineWidth = 1 / this.cam.zoom;
        ctx.strokeRect(t.x * TILE + 0.5, t.y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }

    if (game.placement) {
      const def = BUILDINGS[game.placement];
      const tile = this.tileUnderPointer(game.placement);
      if (tile) {
        const check = game.canPlace(game.placement, tile.x, tile.y);
        const valid = check.ok;
        ctx.fillStyle = valid ? 'rgba(111,174,74,.26)' : 'rgba(201,80,60,.28)';
        for (let y = tile.y; y < tile.y + def.h; y++) {
          for (let x = tile.x; x < tile.x + def.w; x++) {
            ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
          }
        }
        ctx.strokeStyle = valid ? 'rgba(160,235,120,.9)' : 'rgba(255,120,95,.9)';
        ctx.lineWidth = lw;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(tile.x * TILE + 1, tile.y * TILE + 1, def.w * TILE - 2, def.h * TILE - 2);
        ctx.setLineDash([]);
        if (def.range) {
          const cx = (tile.x + def.w / 2) * TILE;
          const cy = (tile.y + def.h / 2) * TILE;
          this.dashedCircle(cx, cy, def.range * TILE, valid ? 'rgba(242,193,78,.85)' : 'rgba(255,130,105,.85)', lw);
        }
        const meta = this.sprites.buildings[game.placement];
        ctx.globalAlpha = 0.62;
        ctx.drawImage(meta.canvas, tile.x * TILE + meta.ox, tile.y * TILE + meta.oy);
        ctx.globalAlpha = 1;
        // footprint corners
        this.cornerBrackets(tile.x * TILE, tile.y * TILE, def.w * TILE, def.h * TILE, valid ? '#d8f5a8' : '#ff9c86', lw);
      }
    }

    const selected = game.selectedId ? game.getBuilding(game.selectedId) : null;
    if (selected) {
      const def = BUILDINGS[selected.type];
      this.cornerBrackets(
        selected.x * TILE,
        selected.y * TILE,
        selected.w * TILE,
        selected.h * TILE,
        '#f2c14e',
        lw
      );
      if (def.range && selected.built) {
        const cx = (selected.x + selected.w / 2) * TILE;
        const cy = (selected.y + selected.h / 2) * TILE;
        this.dashedCircle(cx, cy, def.range * TILE, 'rgba(242,193,78,.7)', lw);
      }
    }
  }

  dashedCircle(cx, cy, r, color, lw) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = -this.animTime * 8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  cornerBrackets(x, y, w, h, color, lw) {
    const ctx = this.ctx;
    const len = Math.min(12, w / 3, h / 3);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y + len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.moveTo(x + w - len, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + len);
    ctx.moveTo(x + w, y + h - len);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w - len, y + h);
    ctx.moveTo(x + len, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + h - len);
    ctx.stroke();
  }

  drawBorderPine(deco) {
    const sprite = this.sprites.borderPines[deco.variant % this.sprites.borderPines.length];
    const ctx = this.ctx;
    const scale = deco.scale;
    const dw = sprite.width * scale;
    const dh = sprite.height * scale;
    const bx = deco.x * TILE + TILE / 2;
    const by = deco.y * TILE + TILE / 2 + 18;
    const sway = Math.sin(this.animTime * 0.9 + deco.x * 0.7 + deco.y) * 0.7;
    ctx.drawImage(sprite, Math.round(bx - dw / 2 + sway), Math.round(by - dh), Math.round(dw), Math.round(dh));
  }

  drawNode(node) {
    const ctx = this.ctx;
    let sprite;
    let x;
    let y;
    if (node.kind === 'tree') {
      const stage = node.qty <= 0 ? 2 : node.qty < node.max * 0.55 ? 1 : 0;
      sprite = this.sprites.trees[node.variant % this.sprites.trees.length][stage];
      const sway = stage === 2 ? 0 : Math.sin(this.animTime * 1.1 + node.x * 0.9 + node.y * 1.7) * 0.8;
      const working = this.game.settlers.some(
        (s) => s.state === 'harvest' && s.targetNode && s.targetNode.id === node.id
      );
      const shake = working ? Math.sin(this.animTime * 30) * 1.2 : 0;
      x = node.x * TILE + TILE / 2 - 28 + sway + shake;
      y = node.y * TILE + TILE / 2 + 18 - sprite.height;
      ctx.drawImage(sprite, Math.round(x), Math.round(y));
      if (stage === 0 && hash2(node.x, node.y, 3) > 0.72) {
        ctx.fillStyle = '#e26b6b';
        ctx.fillRect(Math.round(x + 14), Math.round(y + 30), 2, 2);
        ctx.fillStyle = '#f0d264';
        ctx.fillRect(Math.round(x + 38), Math.round(y + 38), 2, 2);
      }
    } else {
      if (node.qty <= 0) return;
      sprite = this.sprites.rocks[node.variant % this.sprites.rocks.length];
      const working = this.game.settlers.some(
        (s) => s.state === 'harvest' && s.targetNode && s.targetNode.id === node.id
      );
      const shake = working ? Math.sin(this.animTime * 34) * 1.4 : 0;
      x = node.x * TILE + TILE / 2 - 26 + shake;
      y = node.y * TILE + TILE / 2 + 18 - sprite.height;
      ctx.drawImage(sprite, Math.round(x), Math.round(y));
    }
  }

  drawBuilding(bld, dt) {
    const game = this.game;
    const def = BUILDINGS[bld.type];
    const meta = this.sprites.buildings[bld.type];
    const ctx = this.ctx;
    const x = bld.x * TILE + meta.ox;
    const y = bld.y * TILE + meta.oy;
    if (bld.built) {
      ctx.drawImage(meta.canvas, Math.round(x), Math.round(y));
    } else {
      ctx.globalAlpha = 0.24;
      ctx.drawImage(meta.canvas, Math.round(x), Math.round(y));
      ctx.globalAlpha = 1;
      this.drawScaffold(bld);
    }

    // status bubble
    if (bld.built) {
      const warn = this.needsAttention(bld);
      if (warn) {
        const cx = (bld.x + bld.w / 2) * TILE;
        const cy = bld.y * TILE - 16 + Math.sin(this.animTime * 3 + bld.x) * 2;
        ctx.fillStyle = C.ink;
        ctx.fillRect(cx - 8, cy - 8, 16, 16);
        ctx.fillStyle = C.paper;
        ctx.fillRect(cx - 6, cy - 6, 12, 12);
        ctx.fillStyle = C.redDark;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, cy + 1);
      }
      if (SMOKE_TYPES.has(bld.type)) this.emitSmoke(bld, dt);
    }

    // progress bar
    if (!bld.built) {
      const cx = (bld.x + bld.w / 2) * TILE;
      const cy = bld.y * TILE - 18;
      ctx.fillStyle = C.ink;
      ctx.fillRect(cx - 23, cy, 46, 8);
      ctx.fillStyle = C.paperDark;
      ctx.fillRect(cx - 21, cy + 2, 42, 4);
      ctx.fillStyle = C.gold;
      ctx.fillRect(cx - 21, cy + 2, Math.round(42 * bld.progress), 4);
      ctx.fillStyle = C.cream;
      ctx.fillRect(cx - 21, cy + 2, Math.round(42 * bld.progress), 1);
    }
  }

  needsAttention(bld) {
    const def = BUILDINGS[bld.type];
    if (!def.workers) return false;
    const worker = this.game.workerFor(bld);
    if (!worker) return true;
    return (
      worker.status === 'No trees in range' ||
      worker.status === 'No stone in range' ||
      worker.status === 'Storage full' ||
      worker.status === 'No clear path'
    );
  }

  drawScaffold(bld) {
    const ctx = this.ctx;
    const x = bld.x * TILE + 4;
    const y = bld.y * TILE + 4;
    const w = bld.w * TILE - 8;
    const h = bld.h * TILE - 8;
    ctx.fillStyle = 'rgba(40,30,18,.18)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.timber;
    ctx.fillRect(x, y, 4, h);
    ctx.fillRect(x + w - 4, y, 4, h);
    ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = C.timberDark;
    ctx.fillRect(x + 2, y, 2, h);
    ctx.save();
    ctx.translate(x + 2, y + h - 2);
    ctx.rotate(-0.62);
    ctx.fillStyle = C.timber;
    ctx.fillRect(0, -2, Math.hypot(w, h) - 10, 4);
    ctx.restore();
    ctx.fillStyle = '#b98a54';
    ctx.fillRect(x + 6, y + h - 8, 12, 3);
    ctx.fillRect(x + 8, y + h - 11, 12, 3);
  }

  emitSmoke(bld, dt) {
    let timer = this.smokeTimers.get(bld.id);
    if (timer == null) timer = Math.random() * 0.6;
    timer -= dt;
    if (timer > 0) {
      this.smokeTimers.set(bld.id, timer);
      return;
    }
    this.smokeTimers.set(bld.id, 0.7 + Math.random() * 0.8);
    const cx = bld.x * TILE + bld.w * TILE * 0.74;
    const cy = bld.y * TILE + (bld.type === 'townhall' ? -44 : -12);
    if (this.particles.length > 300) return;
    this.particles.push({
      x: cx + (Math.random() - 0.5) * 4,
      y: cy,
      vx: 2 + Math.random() * 3,
      vy: -8 - Math.random() * 6,
      g: -2,
      life: 2.4,
      maxLife: 2.4,
      size: 3,
      color: 'rgba(205,200,185,0.5)',
      kind: 'smoke',
      grow: 6,
      sway: 4,
    });
  }

  drawSettler(s) {
    const ctx = this.ctx;
    const frame = s.moving ? Math.floor(s.anim * 4) % 2 : 0;
    const sprite = this.sprites.workers[s.variant % this.sprites.workers.length][frame];
    const bob = s.moving ? Math.abs(Math.sin(s.anim * 2)) * 1.2 : Math.sin(s.anim * 1.5) * 0.5;
    const x = s.x;
    const y = s.y - 1 - bob;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (s.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(sprite, -9, -23);
    ctx.restore();
    if (s.carry > 0 && s.carryKind) {
      const icon = iconCanvas(s.carryKind);
      const cx = Math.round(x - 6);
      const cy = Math.round(y - 35 + Math.sin(this.animTime * 6) * 1);
      ctx.fillStyle = 'rgba(25,18,10,.35)';
      ctx.fillRect(cx + 1, cy + 11, 12, 2);
      ctx.drawImage(icon, cx, cy, 12, 12);
    }
  }

  updateParticles(dt) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      if (p.sway) p.vx += Math.sin(this.animTime * 4 + p.y * 0.1) * p.sway * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke' || p.kind === 'dust') p.size += p.grow * dt;
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.55 : Math.min(1, a * 1.4);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.size), Math.round(p.size));
    }
    ctx.globalAlpha = 1;
  }

  drawNight() {
    const ctx = this.ctx;
    const phase = (this.game.time % 240) / 240;
    const daylight = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
    const darkness = (1 - daylight) * 0.36;
    if (darkness < 0.015) return;
    ctx.fillStyle = `rgba(18,30,58,${darkness.toFixed(3)})`;
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (darkness < 0.1) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bld of this.game.buildings) {
      if (!bld.built) continue;
      if (!['house', 'lumberjack', 'workshop', 'storehouse', 'townhall'].includes(bld.type)) continue;
      const wx = (bld.x + bld.w / 2) * TILE;
      const wy = (bld.y + bld.h * 0.72) * TILE;
      const p = this.worldToScreen(wx, wy);
      const r = (bld.type === 'townhall' ? 52 : 30) * this.cam.zoom;
      if (p.x < -r || p.y < -r || p.x > this.vw + r || p.y > this.vh + r) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(255,196,92,${(0.22 * darkness * 2.4).toFixed(3)})`);
      g.addColorStop(0.55, `rgba(255,170,70,${(0.09 * darkness * 2.4).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFloats(dt) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      f.y -= dt * 16;
      const p = this.worldToScreen(f.x, f.y);
      const a = clamp(f.life / 0.5, 0, 1);
      ctx.globalAlpha = a;
      const icon = iconCanvas(f.kind);
      const label = f.text;
      ctx.font = '8px "Press Start 2P", monospace';
      const tw = ctx.measureText(label).width;
      const total = tw + 12;
      ctx.drawImage(icon, Math.round(p.x - total / 2), Math.round(p.y - 11), 10, 10);
      ctx.fillStyle = C.ink;
      ctx.fillText(label, Math.round(p.x - total / 2 + 16) + 1, Math.round(p.y) + 1);
      ctx.fillStyle = f.kind === 'stone' ? '#e8eaf0' : C.gold;
      ctx.fillText(label, Math.round(p.x - total / 2 + 16), Math.round(p.y));
    }
    ctx.globalAlpha = 1;
  }
}
