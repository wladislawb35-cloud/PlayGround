// DOM interface: HUD, build menu, objectives, panels, toasts and overlays.

import { BUILDINGS, BUILD_ORDER, QUESTS, SAVE_KEY } from './config.js';
import { iconURL } from './art.js';
import { formatTime } from './util.js';

const KIND_LABEL = {
  lumberjack: 'PRODUCTION',
  quarry: 'PRODUCTION',
  house: 'HOUSING',
  storehouse: 'STORAGE',
  workshop: 'CRAFT',
  townhall: 'MONUMENT',
};

export class UI {
  constructor(game, renderer, sfx, hooks) {
    this.game = game;
    this.renderer = renderer;
    this.sfx = sfx;
    this.hooks = hooks;
    this.cache = {};
    this.toastTimers = new Set();
    this.objCollapsed = window.matchMedia('(max-width: 760px)').matches;
    this.narrow = window.matchMedia('(max-width: 760px)').matches;
    this.demolishArm = null;
    this.demolishTimer = 0;
    this.modalOpen = false;
    this.modalWasPaused = false;
    this.winVisible = false;
    this.lastSpeed = 1;
    this.hintWarnTimer = 0;
    this.refreshTimer = 0;

    this.el = {
      hud: document.getElementById('hud'),
      topbar: document.getElementById('topbar'),
      resWood: document.getElementById('res-wood'),
      resStone: document.getElementById('res-stone'),
      resPop: document.getElementById('res-pop'),
      resIdle: document.getElementById('res-idle'),
      capWood: document.getElementById('cap-wood'),
      capStone: document.getElementById('cap-stone'),
      capPop: document.getElementById('cap-pop'),
      chipWood: document.getElementById('chip-wood'),
      chipStone: document.getElementById('chip-stone'),
      chipPop: document.getElementById('chip-pop'),
      chipIdle: document.getElementById('chip-idle'),
      sound: document.getElementById('btn-sound'),
      menu: document.getElementById('btn-menu'),
      speedBtns: [...document.querySelectorAll('.speed-btn')],
      objective: document.getElementById('objective-panel'),
      objCount: document.getElementById('obj-count'),
      objTitle: document.getElementById('obj-title'),
      objDesc: document.getElementById('obj-desc'),
      objFill: document.getElementById('obj-fill'),
      objReward: document.getElementById('obj-reward'),
      objToggle: document.getElementById('obj-toggle'),
      selection: document.getElementById('selection-panel'),
      selIcon: document.getElementById('sel-icon'),
      selName: document.getElementById('sel-name'),
      selKind: document.getElementById('sel-kind'),
      selStatus: document.getElementById('sel-status'),
      selStats: document.getElementById('sel-stats'),
      selClose: document.getElementById('btn-sel-close'),
      demolish: document.getElementById('btn-demolish'),
      toasts: document.getElementById('toasts'),
      hint: document.getElementById('hint-bar'),
      hintText: document.getElementById('hint-text'),
      buildList: document.getElementById('build-list'),
      start: document.getElementById('start-screen'),
      btnPlay: document.getElementById('btn-play'),
      btnNew: document.getElementById('btn-new'),
      btnHow: document.getElementById('btn-how'),
      win: document.getElementById('win-screen'),
      winStats: document.getElementById('win-stats'),
      btnKeep: document.getElementById('btn-keep'),
      btnAgain: document.getElementById('btn-again'),
      modal: document.getElementById('modal'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      modalClose: document.getElementById('modal-close'),
    };

    this.populateIcons();
    this.buildCards();
    this.bind();
    this.applyCrt(localStorage.getItem('timberhold.crt') !== 'off');
    this.updateSoundButton();
    this.updateStartNote();
    this.updateObjToggle();
    this.syncAll();
    this.game.on((event) => this.onGameEvent(event));
    window.addEventListener('resize', () => {
      this.narrow = window.matchMedia('(max-width: 760px)').matches;
      this.updateObjToggle();
    });
  }

  // ------------------------------------------------------------- setup

  populateIcons(root = document) {
    for (const img of root.querySelectorAll('img[data-icon]')) {
      const name = img.dataset.icon;
      if (!img.src) img.src = iconURL(name);
    }
  }

  buildCards() {
    this.el.buildList.replaceChildren();
    this.cards = {};
    for (const type of BUILD_ORDER) {
      const def = BUILDINGS[type];
      const card = document.createElement('button');
      card.className = 'build-card';
      card.dataset.type = type;
      card.setAttribute('aria-label', `${def.name}. ${def.desc}`);
      card.title = `${def.name}\n${def.desc}`;
      const costParts = ['wood', 'stone']
        .filter((k) => def.cost[k])
        .map(
          (k) =>
            `<span class="cost" data-res="${k}"><img src="${iconURL(k)}" alt="${k}">${def.cost[k]}</span>`
        )
        .join('');
      card.innerHTML = `
        <span class="key">${def.hotkey}</span>
        <img class="bicon" src="${iconURL(type)}" alt="">
        <span class="bname">${def.short.toUpperCase()}</span>
        <span class="bcost">${costParts || '<span class="cost">free</span>'}</span>
        <span class="lock-note"></span>
      `;
      card.addEventListener('click', () => this.selectBuild(type));
      this.el.buildList.appendChild(card);
      this.cards[type] = {
        el: card,
        lock: card.querySelector('.lock-note'),
        costs: [...card.querySelectorAll('.cost[data-res]')],
      };
    }
  }

  bind() {
    this.el.btnPlay.addEventListener('click', () => {
      this.sfx.unlock();
      this.hooks.start(Boolean(this.game.constructor.hasSave()));
    });
    this.el.btnNew.addEventListener('click', () => {
      if (this.game.constructor.hasSave()) {
        this.confirmNewGame();
      } else {
        this.sfx.unlock();
        this.hooks.newGame();
      }
    });
    this.el.btnHow.addEventListener('click', () => this.showHowTo());
    this.el.menu.addEventListener('click', () => this.openMenu());
    this.el.sound.addEventListener('click', () => this.toggleSound());
    this.el.objToggle.addEventListener('click', () => {
      this.objCollapsed = !this.objCollapsed;
      this.el.objective.classList.toggle('collapsed', this.objCollapsed);
      this.updateObjToggle();
      this.sfx.play('click');
    });
    for (const btn of this.el.speedBtns) {
      btn.addEventListener('click', () => this.setSpeed(Number(btn.dataset.speed)));
    }
    this.el.selClose.addEventListener('click', () => this.clearSelection());
    this.el.demolish.addEventListener('click', () => this.tryDemolish());
    this.el.modalClose.addEventListener('click', () => this.closeModal());
    this.el.modal.addEventListener('click', (e) => {
      if (e.target === this.el.modal) this.closeModal();
    });
    this.el.btnKeep.addEventListener('click', () => {
      this.hideWin();
      this.game.paused = false;
      this.sfx.play('click');
    });
    this.el.btnAgain.addEventListener('click', () => {
      this.hideWin();
      this.hooks.newGame();
    });
  }

  // ------------------------------------------------------------- start

  updateStartNote() {
    const existing = this.el.start.querySelector('.save-note');
    if (existing) existing.remove();
    const note = document.createElement('div');
    note.className = 'save-note';
    if (this.game.constructor.hasSave()) {
      note.textContent = 'SAVE FOUND · PLAY CONTINUES YOUR TOWN';
    } else {
      note.textContent = 'A FRESH VALLEY · PLAY STARTS A NEW TOWN';
    }
    note.style.cssText =
      'margin-top:16px;font-family:var(--font-pixel);font-size:6px;letter-spacing:.08em;color:#9fbf76;text-shadow:1px 1px 0 #000;line-height:1.8;';
    this.el.start.querySelector('.start-card').insertBefore(note, this.el.start.querySelector('.start-controls'));
  }

  hideStart() {
    this.el.start.classList.add('hidden');
    this.sfx.unlock();
  }

  showStart() {
    this.el.start.classList.remove('hidden');
    this.updateStartNote();
  }

  startMessage() {
    const hasSave = this.game.constructor.hasSave();
    if (hasSave) this.addToast('Welcome back to Timberhold.', 'good', 2600);
    else this.addToast('Welcome to Timberhold. Pick a spot by the pines.', 'info', 3400);
  }

  // ------------------------------------------------------------- HUD

  setText(el, value) {
    if (!el) return;
    if (el.textContent !== String(value)) el.textContent = String(value);
  }

  updateHUD() {
    const g = this.game;
    const cap = g.storageCap();
    this.setText(this.el.resWood, Math.floor(g.resources.wood));
    this.setText(this.el.resStone, Math.floor(g.resources.stone));
    this.setText(this.el.capWood, `/${cap}`);
    this.setText(this.el.capStone, `/${cap}`);
    this.setText(this.el.resPop, g.settlers.length);
    this.setText(this.el.capPop, `/${g.popCap()}`);
    this.setText(this.el.resIdle, g.idleSettlers().length);
    this.el.chipWood.classList.toggle('full', g.resources.wood >= cap);
    this.el.chipStone.classList.toggle('full', g.resources.stone >= cap);
    this.el.chipPop.classList.toggle('full', g.settlers.length >= g.popCap());
    const paused = g.paused || g.speed === 0;
    for (const btn of this.el.speedBtns) {
      btn.classList.toggle('active', paused ? btn.dataset.speed === '0' : Number(btn.dataset.speed) === g.speed);
    }
  }

  updateBuildCards() {
    const g = this.game;
    for (const type of BUILD_ORDER) {
      const def = BUILDINGS[type];
      const entry = this.cards[type];
      if (!entry) continue;
      const reason = this.hardLock(type);
      entry.el.classList.toggle('locked', Boolean(reason));
      entry.el.classList.toggle('selected', g.placement === type);
      entry.lock.textContent = reason || '';
      for (const costEl of entry.costs) {
        const key = costEl.dataset.res;
        const lack = g.resources[key] < (def.cost[key] || 0);
        costEl.classList.toggle('lack', lack);
      }
    }
  }

  hardLock(type) {
    const def = BUILDINGS[type];
    const g = this.game;
    if (def.unique && g.buildingCount(type) >= 1) return 'ALREADY BUILT';
    if (def.max && g.buildingCount(type, true) >= def.max) return 'MAX 3';
    if (def.requires) {
      if (def.requires.pop && g.settlers.length < def.requires.pop) return `NEEDS ${def.requires.pop} POP`;
      if (def.requires.houses && g.houses() < def.requires.houses) return `NEEDS ${def.requires.houses} HOMES`;
    }
    return '';
  }

  // ------------------------------------------------------------- objective

  updateObjective() {
    const g = this.game;
    const total = QUESTS.length;
    if (g.questIndex >= total) {
      this.setText(this.el.objCount, `${total} / ${total}`);
      this.setText(this.el.objTitle, 'All objectives complete!');
      this.setText(this.el.objDesc, 'Your settlement is finished. Keep building, or start a new valley.');
      this.el.objFill.style.width = '100%';
      this.el.objReward.replaceChildren();
      return;
    }
    const quest = QUESTS[g.questIndex];
    this.setText(this.el.objCount, `${g.questIndex + 1} / ${total}`);
    this.setText(this.el.objTitle, quest.title);
    this.setText(this.el.objDesc, quest.desc);
    const progress = g.questProgress();
    const pct = Math.max(0, Math.min(100, (progress.value / Math.max(1, progress.max)) * 100));
    this.el.objFill.style.width = `${pct}%`;
    if (quest.reward) {
      const chips = [];
      for (const [key, amount] of Object.entries(quest.reward)) {
        chips.push(
          `<span class="reward-chip"><img src="${iconURL(key)}" alt="${key}">+${amount}</span>`
        );
      }
      const html = `<span class="reward-label">REWARD</span>${chips.join('')}`;
      if (this.el.objReward.dataset.html !== html) {
        this.el.objReward.dataset.html = html;
        this.el.objReward.innerHTML = html;
      }
    } else {
      if (this.el.objReward.dataset.html !== 'final') {
        this.el.objReward.dataset.html = 'final';
        this.el.objReward.innerHTML = '<span class="reward-label">THE HEART OF YOUR TOWN</span>';
      }
    }
  }

  updateObjToggle() {
    this.el.objective.classList.toggle('collapsed', this.objCollapsed);
    this.el.objToggle.textContent = this.objCollapsed ? '+' : '−';
  }

  // ------------------------------------------------------------- selection

  selectBuilding(id) {
    if (!id) {
      this.clearSelection();
      return;
    }
    if (this.game.placement) this.cancelPlacement(true);
    this.game.selectedId = id;
    this.demolishArm = null;
    this.sfx.play('select');
    this.updateSelection(true);
  }

  clearSelection() {
    this.game.selectedId = null;
    this.el.selection.classList.add('hidden');
    this.demolishArm = null;
    this.sfx.play('click');
  }

  updateSelection(force = false) {
    const g = this.game;
    const bld = g.selectedId ? g.getBuilding(g.selectedId) : null;
    if (!bld) {
      this.el.selection.classList.add('hidden');
      return;
    }
    this.el.selection.classList.remove('hidden');
    const def = BUILDINGS[bld.type];
    const key = `${bld.id}:${bld.built}:${Math.round(bld.progress * 100)}:${g.statusFor(bld)}`;
    if (force || this.cache.selKey !== key) {
      this.cache.selKey = key;
      this.el.selIcon.src = iconURL(bld.type);
      this.setText(this.el.selName, def.name.toUpperCase());
      this.setText(this.el.selKind, KIND_LABEL[bld.type] || 'BUILDING');
      this.setText(this.el.selStatus, g.statusFor(bld));
      const stats = g.detailStats(bld);
      const html = stats
        .map(
          (s) => `<div class="sel-stat"><span>${s.label}</span><b>${s.value}</b></div>`
        )
        .join('');
      if (this.el.selStats.dataset.html !== html) {
        this.el.selStats.dataset.html = html;
        this.el.selStats.innerHTML = html;
      }
      if (bld.type === 'townhall') {
        this.el.demolish.classList.add('hidden');
      } else {
        this.el.demolish.classList.remove('hidden');
        const refund = ['wood', 'stone']
          .filter((k) => def.cost[k])
          .map((k) => `+${Math.floor((def.cost[k] || 0) * 0.5)}${k === 'wood' ? 'W' : 'S'}`)
          .join(' ');
        this.el.demolish.textContent =
          this.demolishArm === bld.id ? 'CONFIRM DEMOLISH?' : `DEMOLISH  ${refund}`;
      }
    }
    if (this.demolishArm && this.demolishArm !== bld.id) {
      this.demolishArm = null;
      this.updateSelection(true);
    }
  }

  tryDemolish() {
    const g = this.game;
    const bld = g.selectedId ? g.getBuilding(g.selectedId) : null;
    if (!bld) return;
    if (this.demolishArm !== bld.id) {
      this.demolishArm = bld.id;
      this.el.demolish.textContent = 'CONFIRM DEMOLISH?';
      this.sfx.play('click');
      clearTimeout(this.demolishTimer);
      this.demolishTimer = setTimeout(() => {
        this.demolishArm = null;
        if (this.game.selectedId === bld.id) this.updateSelection(true);
      }, 3500);
      return;
    }
    clearTimeout(this.demolishTimer);
    this.demolishArm = null;
    const result = g.demolish(bld.id);
    if (!result.ok) {
      this.addToast(result.reason, 'warn');
      this.sfx.play('error');
    } else {
      this.el.selection.classList.add('hidden');
      this.updateBuildCards();
      this.updateObjective();
    }
  }

  // ------------------------------------------------------------- placement

  selectBuild(type) {
    const g = this.game;
    if (!g.running) return;
    if (g.placement === type) {
      this.cancelPlacement();
      return;
    }
    const def = BUILDINGS[type];
    const lock = this.hardLock(type);
    if (lock) {
      this.addToast(`${def.name}: ${lock.toLowerCase().replace(/^needs/, 'needs')}.`, 'warn');
      this.sfx.play('error');
      return;
    }
    for (const key of ['wood', 'stone']) {
      if ((def.cost[key] || 0) > g.resources[key]) {
        this.addToast(`Not enough ${key} for a ${def.name}.`, 'warn');
        this.sfx.play('error');
        return;
      }
    }
    g.placement = type;
    g.selectedId = null;
    this.el.selection.classList.add('hidden');
    this.demolishArm = null;
    this.sfx.play('click');
    if (!this.renderer.pointer.inside) {
      this.renderer.pointer.inside = true;
      this.renderer.pointer.x = this.renderer.vw / 2;
      this.renderer.pointer.y = this.renderer.vh * 0.52;
    }
    this.setHint(`${def.hint}  ${this.narrow ? 'Tap a spot to build.' : 'Click a spot to build. Right-click or Esc to cancel.'}`);
    this.updateBuildCards();
  }

  cancelPlacement(quiet = false) {
    if (!this.game.placement) return false;
    this.game.placement = null;
    this.setHint('Pick a building below, then choose a spot on the map.');
    if (!quiet) this.sfx.play('click');
    this.updateBuildCards();
    return true;
  }

  afterPlace() {
    this.cancelPlacement(true);
    this.setHint('Pick a building below, then choose a spot on the map.');
    this.updateBuildCards();
    this.updateObjective();
  }

  placementError(reason) {
    this.addToast(reason, 'warn');
    this.sfx.play('error');
    this.setHint(reason, true);
    this.hintWarnTimer = 2.4;
  }

  setHint(text, warn = false) {
    this.setText(this.el.hintText, text);
    this.el.hint.classList.toggle('warn', warn);
  }

  // ------------------------------------------------------------- speed / sound

  setSpeed(speed) {
    if (!this.game.running) return;
    if (speed === 0) {
      if (!this.game.paused) this.lastSpeed = this.game.speed || 1;
      this.game.paused = true;
    } else {
      this.game.paused = false;
      this.game.speed = speed;
      this.lastSpeed = speed;
    }
    this.sfx.play('speed');
    this.updateHUD();
  }

  togglePause() {
    if (this.game.paused) {
      this.game.paused = false;
      this.game.speed = this.lastSpeed || 1;
    } else {
      this.lastSpeed = this.game.speed || 1;
      this.game.paused = true;
    }
    this.sfx.play('speed');
    this.updateHUD();
  }

  toggleSound() {
    const muted = this.sfx.toggle();
    this.updateSoundButton();
    if (!muted) this.sfx.play('click');
    this.addToast(muted ? 'Sound off.' : 'Sound on.', 'info', 1500);
  }

  updateSoundButton() {
    this.el.sound.textContent = this.sfx.muted ? 'OFF' : 'SND';
    this.el.sound.title = this.sfx.muted ? 'Sound is off' : 'Sound is on';
  }

  // ------------------------------------------------------------- toasts

  addToast(text, tone = 'info', duration = 3200) {
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = tone === 'quest' ? '*' : tone === 'warn' ? '!' : tone === 'good' ? '+' : '>';
    const body = document.createElement('span');
    body.textContent = text;
    el.append(icon, body);
    while (this.el.toasts.children.length >= 4) this.el.toasts.firstElementChild?.remove();
    this.el.toasts.appendChild(el);
    const timer = setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => {
        el.remove();
        this.toastTimers.delete(timer);
      }, 260);
    }, duration);
    this.toastTimers.add(timer);
  }

  // ------------------------------------------------------------- events

  onGameEvent(event) {
    if (event.type === 'toast') {
      this.addToast(event.text, event.tone, event.duration);
    } else if (event.type === 'reset') {
      this.syncAll();
    } else if (event.type === 'win') {
      this.showWin(event.stats);
    } else if (event.type === 'quest') {
      this.updateObjective();
    }
  }

  showWin(stats) {
    this.winVisible = true;
    const rows = [
      ['TIME', formatTime(stats.time)],
      ['SETTLERS', stats.pop],
      ['BUILDINGS', stats.buildings],
      ['WOOD GATHERED', stats.wood],
      ['STONE GATHERED', stats.stone],
      ['TOWN HALL', 'STANDING'],
    ];
    this.el.winStats.innerHTML = rows
      .map(([label, value]) => `<div class="win-stat"><b>${label}</b>${value}</div>`)
      .join('');
    this.el.win.classList.remove('hidden');
    this.game.paused = true;
    this.updateHUD();
  }

  hideWin() {
    this.winVisible = false;
    this.el.win.classList.add('hidden');
  }

  // ------------------------------------------------------------- modal

  openModal(title, content, { keepPaused = false } = {}) {
    if (this.modalOpen) return;
    this.modalOpen = true;
    this.modalWasPaused = this.game.running && !this.game.paused;
    if (this.modalWasPaused && !keepPaused) this.game.paused = true;
    this.el.modalTitle.textContent = title;
    this.el.modalBody.replaceChildren(content);
    this.el.modal.classList.remove('hidden');
    this.updateHUD();
  }

  closeModal() {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    this.el.modal.classList.add('hidden');
    if (this.modalWasPaused) this.game.paused = false;
    this.modalWasPaused = false;
    this.sfx.play('click');
    this.updateHUD();
  }

  makeButton(label, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (extraClass) btn.className = extraClass;
    btn.addEventListener('click', () => {
      this.sfx.play('click');
      onClick();
    });
    return btn;
  }

  openMenu() {
    if (this.game.placement) this.cancelPlacement(true);
    const wrap = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'menu-list';
    list.append(
      this.makeButton('RESUME', () => this.closeModal()),
      this.makeButton('SAVE NOW', () => {
        const ok = this.game.save();
        this.addToast(ok ? 'Game saved.' : 'Could not save (storage blocked).', ok ? 'good' : 'warn');
      }),
      this.makeButton('HOW TO PLAY', () => this.showHowTo()),
      this.makeButton('CENTRE CAMERA', () => {
        this.renderer.resetCamera();
        this.closeModal();
      }),
      this.makeButton(this.sfx.muted ? 'SOUND: OFF' : 'SOUND: ON', () => {
        this.toggleSound();
        this.closeModal();
        this.openMenu();
      }),
      this.makeButton(this.crtOn ? 'SCANLINES: ON' : 'SCANLINES: OFF', () => {
        this.applyCrt(!this.crtOn);
        this.closeModal();
        this.openMenu();
      }),
      this.makeButton('NEW SETTLEMENT', () => this.confirmNewGame(), 'danger')
    );
    const note = document.createElement('div');
    note.className = 'menu-note';
    note.textContent = `SEED ${this.game.seed} · ${this.game.won ? 'SETTLEMENT COMPLETE' : 'IN PROGRESS'} · AUTOSAVE ON`;
    wrap.append(list, note);
    this.openModal('MENU', wrap);
  }

  confirmNewGame() {
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = 'Start a new settlement? The current town will be lost.';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;';
    row.append(
      this.makeButton('START OVER', () => {
        this.closeModal();
        this.hideWin();
        this.hooks.newGame();
      }, 'danger'),
      this.makeButton('CANCEL', () => this.closeModal())
    );
    wrap.append(p, row);
    this.openModal('NEW SETTLEMENT?', wrap);
  }

  showHowTo() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <p>You are the keeper of a tiny forest settlement. Place buildings, let your workers gather, and grow the town until it can raise a Town Hall.</p>
      <div class="how-grid">
        <img src="${iconURL('lumberjack')}" alt="">
        <div><b>LUMBERJACK HUT</b><span>Sends a worker to nearby pines. Each trip brings wood home.</span></div>
        <img src="${iconURL('quarry')}" alt="">
        <div><b>STONE QUARRY</b><span>Mines gray outcrops inside its ring. Rocks run dry, so expand outward.</span></div>
        <img src="${iconURL('house')}" alt="">
        <div><b>COTTAGE</b><span>Raises the population cap by 2. Settlers arrive on their own.</span></div>
        <img src="${iconURL('storehouse')}" alt="">
        <div><b>STOREHOUSE</b><span>Adds 150 storage. Workers deliver wood and stone here.</span></div>
        <img src="${iconURL('workshop')}" alt="">
        <div><b>WORKSHOP</b><span>Each one makes every gatherer 25% faster. Up to three stack.</span></div>
        <img src="${iconURL('townhall')}" alt="">
        <div><b>TOWN HALL</b><span>Requires 10 settlers and 2 cottages. Finish it to complete the town.</span></div>
      </div>
      <div class="how-section-title">THE LOOP</div>
      <p>Workers are assigned automatically to new production buildings. If storage fills up, build another storehouse — production pauses until there is room.</p>
      <div class="how-section-title">CONTROLS</div>
      <div class="key-row">
        <span class="key-cap"><b>1–6</b> build</span>
        <span class="key-cap"><b>ESC</b> cancel</span>
        <span class="key-cap"><b>SPACE</b> pause</span>
        <span class="key-cap"><b>WHEEL</b> zoom</span>
        <span class="key-cap"><b>DRAG</b> pan</span>
        <span class="key-cap"><b>M</b> mute</span>
      </div>
      <p>On touch screens, drag to pan, pinch to zoom, and tap a building to inspect it.</p>
    `;
    this.openModal('HOW TO PLAY', wrap);
  }

  applyCrt(on) {
    this.crtOn = on;
    document.body.classList.toggle('crt-off', !on);
    try {
      localStorage.setItem('timberhold.crt', on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------- loop

  syncAll() {
    this.cache = {};
    this.demolishArm = null;
    this.el.selection.classList.add('hidden');
    this.game.placement = null;
    this.setHint('Pick a building below, then choose a spot on the map.');
    this.el.toasts.replaceChildren();
    this.updateHUD();
    this.updateBuildCards();
    this.updateObjective();
    this.updateSelection(true);
    this.updateSoundButton();
    this.updateStartNote();
  }

  update(dt) {
    this.updateHUD();
    if (this.hintWarnTimer > 0) {
      this.hintWarnTimer -= dt;
      if (this.hintWarnTimer <= 0) {
        if (this.game.placement) {
          const def = BUILDINGS[this.game.placement];
          this.setHint(`${def.hint}  ${this.narrow ? 'Tap a spot to build.' : 'Click a spot to build. Right-click or Esc to cancel.'}`);
        } else {
          this.setHint('Pick a building below, then choose a spot on the map.');
        }
      }
    }
    this.cache.uiTimer = (this.cache.uiTimer || 0) + dt;
    if (this.cache.uiTimer > 0.22) {
      this.cache.uiTimer = 0;
      this.updateBuildCards();
      this.updateObjective();
      this.updateSelection();
    }
  }

  handleKey(e) {
    const tag = e.target?.tagName;
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.key !== 'Escape') return false;
    if (e.key === 'Escape') {
      if (this.modalOpen) {
        this.closeModal();
        return true;
      }
      if (this.winVisible) {
        this.hideWin();
        this.game.paused = false;
        return true;
      }
      if (this.game.placement) {
        this.cancelPlacement();
        return true;
      }
      if (this.game.selectedId) {
        this.clearSelection();
        return true;
      }
      return false;
    }
    if (this.el.start.classList.contains('hidden') === false) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.el.btnPlay.click();
        return true;
      }
      return false;
    }
    if (this.modalOpen || this.winVisible) return false;
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return false;
    if (e.key === ' ') {
      e.preventDefault();
      this.togglePause();
      return true;
    }
    if (e.key >= '1' && e.key <= '6') {
      const type = BUILD_ORDER[Number(e.key) - 1];
      if (type) this.selectBuild(type);
      return true;
    }
    if (e.key === 'm' || e.key === 'M') {
      this.toggleSound();
      return true;
    }
    if (e.key === 'c' || e.key === 'C') {
      this.renderer.resetCamera();
      return true;
    }
    if (e.key === '+' || e.key === '=') {
      this.setSpeed(Math.min(3, (this.game.paused ? 0 : this.game.speed) + 1));
      return true;
    }
    if (e.key === '-' || e.key === '_') {
      this.setSpeed(Math.max(1, (this.game.paused ? this.lastSpeed : this.game.speed) - 1));
      return true;
    }
    return false;
  }
}
