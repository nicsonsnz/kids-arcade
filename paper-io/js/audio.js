// audio.js — WebAudio 合成音效 + 轻量 BGM。无任何音频文件。
import { Storage } from './storage.js';

let ctx = null;
let master = null;
let sfxGain = null;
let bgmGain = null;
let unlocked = false;
let muted = Storage.getMuted();
let bgmOff = Storage.getBgmOff();

// ---- BGM 调度器状态 ----
let bgmTimer = null;
let nextNoteTime = 0;
let bgmStep = 0;
// 大调五声音阶（C D E G A），木琴感
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0];
const BGM_SEQ = [0, 2, 4, 3]; // §9 轻快 4 音循环（C D E G，大调五声）
const BGM_INTERVAL = 0.24; // 秒/步

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 1.0;
    sfxGain.connect(master);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.12;
    bgmGain.connect(master);
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

export const Audio = {
  unlock() {
    ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      ctx.resume().catch(() => {});
    }
    if (!unlocked) {
      try {
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) {}
      unlocked = true;
    }
    this.applyMute();
    if (!bgmOff && !muted) this.startBgm();
  },

  resume() {
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      ctx.resume().catch(() => {});
    }
  },

  suspend() {
    if (!ctx) return;
    try { ctx.suspend(); } catch (e) {}
  },

  isMuted() { return muted; },
  isBgmOff() { return bgmOff; },

  setMuted(v) {
    muted = !!v;
    Storage.setMuted(muted);
    this.applyMute();
    if (muted) this.stopBgm();
    else if (!bgmOff) this.startBgm();
  },

  toggleMute() { this.setMuted(!muted); return muted; },

  setBgmOff(v) {
    bgmOff = !!v;
    Storage.setBgmOff(bgmOff);
    if (bgmOff) this.stopBgm();
    else if (!muted) this.startBgm();
  },

  toggleBgm() { this.setBgmOff(!bgmOff); return bgmOff; },

  applyMute() {
    if (!master) return;
    master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
  },

  // ---- 基础音块 ----
  _env(node, gainNode, t, attack, dur, peak) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.start(t);
    node.stop(t + dur + 0.02);
  },

  _tone(freq, t, dur, type = 'triangle', peak = 0.3, target = sfxGain) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(g); g.connect(target || sfxGain);
    this._env(o, g, t, 0.006, dur, peak);
  },

  _slide(f0, f1, t, dur, type, peak) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(g); g.connect(sfxGain);
    this._env(o, g, t, 0.006, dur, peak);
  },

  _noise(t, dur, peak, filterFreq, sweepTo) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(50, sweepTo), t + dur);
    filt.Q.value = 0.8;
    const g = ctx.createGain();
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t);
    src.stop(t + dur + 0.02);
  },

  // ---- 具体音效 ----
  eatBlip(combo = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = 620 + Math.min(combo, 8) * 55;
    this._tone(base, t, 0.08, 'square', 0.18);
    this._tone(base * 1.5, t + 0.04, 0.09, 'square', 0.14);
  },

  leave() {
    if (!ctx) return;
    const t = ctx.currentTime;
    this._noise(t, 0.18, 0.14, 900, 2600);
  },

  claim(deltaPct = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const steps = Math.min(6, 3 + Math.floor(deltaPct));
    const scale = [0, 2, 4, 7, 9, 12, 16];
    for (let i = 0; i < steps; i++) {
      const semis = scale[i];
      const f = 523.25 * Math.pow(2, semis / 12);
      this._tone(f, t + i * 0.06, 0.16, 'triangle', 0.22);
    }
  },

  kill() {
    if (!ctx) return;
    const t = ctx.currentTime;
    this._noise(t, 0.25, 0.3, 1800, 200);
    this._slide(400, 80, t, 0.28, 'sawtooth', 0.24);
  },

  death() {
    if (!ctx) return;
    const t = ctx.currentTime;
    this._slide(660, 90, t, 0.7, 'sawtooth', 0.28);
    this._noise(t, 0.4, 0.18, 700, 120);
  },

  reviveBlink() {
    if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(880, t, 0.1, 'triangle', 0.2);
    this._tone(1320, t + 0.09, 0.12, 'triangle', 0.2);
  },

  victory() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (let i = 0; i < chord.length; i++) {
      this._tone(chord[i], t + i * 0.08, 0.6, 'triangle', 0.24);
    }
  },

  click() {
    if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(880, t, 0.06, 'square', 0.16);
  },

  // ---- BGM lookahead 调度 ----
  startBgm() {
    if (!ctx || bgmOff || muted || bgmTimer) return;
    nextNoteTime = ctx.currentTime + 0.08;
    bgmStep = 0;
    bgmTimer = setInterval(() => this._bgmSchedule(), 25);
  },

  stopBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  },

  _bgmSchedule() {
    if (!ctx) return;
    const ahead = 0.1;
    while (nextNoteTime < ctx.currentTime + ahead) {
      const idx = BGM_SEQ[bgmStep % BGM_SEQ.length];
      const freq = PENTA[idx];
      // 木琴感三角波
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, nextNoteTime);
      o.connect(g); g.connect(bgmGain);
      g.gain.setValueAtTime(0.0001, nextNoteTime);
      g.gain.exponentialRampToValueAtTime(0.5, nextNoteTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, nextNoteTime + 0.22);
      o.start(nextNoteTime);
      o.stop(nextNoteTime + 0.25);
      // 每 4 步加一个低八度点缀
      if (bgmStep % 4 === 0) {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(freq / 2, nextNoteTime);
        o2.connect(g2); g2.connect(bgmGain);
        g2.gain.setValueAtTime(0.0001, nextNoteTime);
        g2.gain.exponentialRampToValueAtTime(0.35, nextNoteTime + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.0001, nextNoteTime + 0.3);
        o2.start(nextNoteTime);
        o2.stop(nextNoteTime + 0.33);
      }
      nextNoteTime += BGM_INTERVAL;
      bgmStep++;
    }
  },
};
