// Entry point: wiring, camera input, game loop, persistence.

import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';

const canvas = document.getElementById('game-canvas');
const game = new Game();
const renderer = new Renderer(canvas, game);
const sfx = new Sfx();

let ui;
let started = false;
let starting = false;
let saveClock = 0;

const hooks = {
  start(useSave) {
    if (starting) return;
    starting = true;
    let loaded = false;
    if (useSave) loaded = game.load();
    if (!loaded) game.reset();
    game.running = true;
    game.paused = false;
    game.speed = 1;
    started = true;
    saveClock = 0;
    renderer.resetCamera();
    renderer.pointer.inside = false;
    ui.hideStart();
    ui.syncAll();
    ui.startMessage();
    game.save();
    starting = false;
  },
  newGame() {
    game.clearSave();
    game.reset();
    game.running = true;
    game.paused = false;
    game.speed = 1;
    started = true;
    saveClock = 0;
    renderer.resetCamera();
    renderer.pointer.inside = false;
    ui.hideStart();
    ui.hideWin();
    ui.syncAll();
    ui.startMessage();
    game.save();
  },
};

ui = new UI(game, renderer, sfx, hooks);
game.autoSave = () => {
  if (started) game.save();
};

// ------------------------------------------------------------- pointer input

const pointers = new Map();
let drag = null;
let pinch = null;

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function setPointer(p) {
  renderer.pointer.x = p.x;
  renderer.pointer.y = p.y;
  renderer.pointer.inside = true;
}

function beginDrag(id, p) {
  drag = {
    id,
    startX: p.x,
    startY: p.y,
    lastX: p.x,
    lastY: p.y,
    moved: false,
  };
}

function handleTap(x, y) {
  if (!game.running) return;
  renderer.pointer.x = x;
  renderer.pointer.y = y;
  renderer.pointer.inside = true;
  if (game.placement) {
    const tile = renderer.tileUnderPointer(game.placement);
    if (!tile) return;
    const result = game.placeBuilding(game.placement, tile.x, tile.y);
    if (result.ok) {
      ui.afterPlace();
      game.save();
    } else {
      ui.placementError(result.reason);
    }
    return;
  }
  const world = renderer.screenToWorld(x, y);
  const bld = renderer.buildingAt(world.x, world.y);
  if (bld) ui.selectBuilding(bld.id);
  else ui.clearSelection();
}

canvas.addEventListener('pointerdown', (e) => {
  if (!game.running) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (ui.modalOpen || ui.winVisible) return;
  const p = canvasPoint(e);
  setPointer(p);
  pointers.set(e.pointerId, p);
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  if (pointers.size === 1) {
    beginDrag(e.pointerId, p);
    pinch = null;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
    drag = null;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = canvasPoint(e);
  setPointer(p);
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, p);
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinch.dist > 4 && dist > 4) {
      renderer.zoomAt(mid.x, mid.y, dist / pinch.dist);
    }
    renderer.pan(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
    pinch = { dist, mid };
    return;
  }
  if (drag && drag.id === e.pointerId) {
    const dx = p.x - drag.lastX;
    const dy = p.y - drag.lastY;
    if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > 5) drag.moved = true;
    if (drag.moved) renderer.pan(dx, dy);
    drag.lastX = p.x;
    drag.lastY = p.y;
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (drag && drag.id === e.pointerId) {
    const wasDrag = drag.moved;
    drag = null;
    if (!wasDrag && p) handleTap(p.x, p.y);
  }
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 1) {
    const [id, pos] = [...pointers.entries()][0];
    beginDrag(id, pos);
  }
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => {
  if (pointers.size === 0) renderer.pointer.inside = false;
});
canvas.addEventListener('pointerenter', (e) => {
  setPointer(canvasPoint(e));
});
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!game.running) return;
    e.preventDefault();
    const p = canvasPoint(e);
    const factor = Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0016);
    renderer.zoomAt(p.x, p.y, factor);
  },
  { passive: false }
);
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (game.placement) ui.cancelPlacement();
  else if (game.selectedId) ui.clearSelection();
});

// ------------------------------------------------------------- keyboard

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (ui.handleKey(e)) e.preventDefault();
});

document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------- loop

let last = performance.now();
function frame(now) {
  const realDt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (game.running && !game.paused && game.speed > 0) {
    game.update(realDt * game.speed);
  }
  renderer.draw(realDt);
  ui.update(realDt);
  if (started) {
    saveClock += realDt;
    if (saveClock > 12) {
      saveClock = 0;
      game.save();
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------- lifecycle

let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderer.resize(), 60);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
window.visualViewport?.addEventListener('resize', onResize);

window.addEventListener('beforeunload', () => {
  if (started) game.save();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && started) game.save();
});

// Expose a tiny handle for debugging and automated checks.
window.__timberhold = { game, renderer, ui, sfx };
