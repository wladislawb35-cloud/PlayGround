// Tiny procedural sound engine — no audio files needed.

import { SETTINGS_KEY } from './config.js';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.last = {};
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.muted = Boolean(JSON.parse(raw).muted);
    } catch {
      /* ignore */
    }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.22;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted }));
    } catch {
      /* ignore */
    }
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  tone(freq, dur, { type = 'square', gain = 0.12, delay = 0, slide = 0, attack = 0.005 } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, { gain = 0.08, delay = 0, freq = 900, q = 1, type = 'bandpass' } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if ((name === 'chop' || name === 'mine') && now - (this.last[name] || 0) < 110) return;
    this.last[name] = now;
    switch (name) {
      case 'click':
        this.tone(520, 0.05, { gain: 0.05, type: 'square', slide: -120 });
        break;
      case 'place':
        this.tone(180, 0.12, { gain: 0.11, type: 'square', slide: -60 });
        this.noise(0.12, { gain: 0.07, freq: 500 });
        break;
      case 'complete':
        this.tone(392, 0.09, { gain: 0.08, type: 'square' });
        this.tone(523, 0.09, { gain: 0.08, type: 'square', delay: 0.09 });
        this.tone(659, 0.14, { gain: 0.08, type: 'square', delay: 0.18 });
        break;
      case 'chop':
        this.noise(0.07, { gain: 0.06, freq: 1800, q: 0.8, type: 'highpass' });
        this.tone(140, 0.05, { gain: 0.04, type: 'triangle', slide: -40 });
        break;
      case 'mine':
        this.noise(0.09, { gain: 0.055, freq: 1100, q: 1.4 });
        this.tone(110, 0.06, { gain: 0.05, type: 'triangle', slide: -30 });
        break;
      case 'deposit':
        this.tone(660, 0.05, { gain: 0.06, type: 'square' });
        this.tone(880, 0.08, { gain: 0.05, type: 'square', delay: 0.05 });
        break;
      case 'settler':
        this.tone(523, 0.07, { gain: 0.06, type: 'square' });
        this.tone(659, 0.07, { gain: 0.06, type: 'square', delay: 0.07 });
        this.tone(784, 0.12, { gain: 0.06, type: 'square', delay: 0.14 });
        break;
      case 'quest':
        this.tone(523, 0.1, { gain: 0.08 });
        this.tone(659, 0.1, { gain: 0.08, delay: 0.1 });
        this.tone(784, 0.1, { gain: 0.08, delay: 0.2 });
        this.tone(1047, 0.24, { gain: 0.08, delay: 0.3 });
        break;
      case 'win':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
          this.tone(f, i === 6 ? 0.5 : 0.14, { gain: 0.09, delay: i * 0.14, type: 'square' });
        });
        this.noise(0.4, { gain: 0.03, freq: 4000, type: 'highpass', delay: 0.8 });
        break;
      case 'error':
        this.tone(140, 0.1, { gain: 0.07, type: 'sawtooth', slide: -40 });
        break;
      case 'demolish':
        this.noise(0.22, { gain: 0.08, freq: 700 });
        this.tone(200, 0.18, { gain: 0.05, type: 'triangle', slide: -100 });
        break;
      case 'speed':
        this.tone(440, 0.04, { gain: 0.04 });
        break;
      case 'select':
        this.tone(700, 0.04, { gain: 0.035, type: 'triangle' });
        break;
      default:
        break;
    }
  }
}
