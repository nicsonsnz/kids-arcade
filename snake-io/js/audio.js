// audio.js — WebAudio 合成音效 + 轻量 BGM，无音频文件
import { Storage } from './storage.js';

let ctx = null;
let master = null;
let bgmGain = null;
let sfxGain = null;
let muted = false;
let unlocked = false;

// 加速气流声（低通噪声 loop）
let boostSrc = null;
let boostGain = null;
let boostFilter = null;
let noiseBuffer = null;

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.1;
    bgmGain.connect(master);
    // 预生成噪声 buffer
    const len = Math.floor(ctx.sampleRate * 1.5);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

// 一个基础音符
function tone(freq, t0, dur, type, gain, glideTo) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(sfxGain);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(t0, dur, gain, freq, q) {
  if (!ctx || !noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq || 900, t0);
  f.Q.value = q || 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfxGain);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export const Audio = {
  init() {
    muted = Storage.isMuted();
  },
  // 首次 pointerdown 解锁
  unlock() {
    ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      ctx.resume().catch(() => {});
    }
    if (!unlocked) {
      // 播 1 帧静音 buffer 解锁 iOS
      try {
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      } catch (e) {}
      unlocked = true;
    }
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
  isMuted() {
    return muted;
  },
  setMuted(m) {
    muted = m;
    Storage.setMuted(m);
    if (master) master.gain.value = m ? 0 : 1;
  },
  toggleMuted() {
    this.setMuted(!muted);
    return muted;
  },

  // === 音效 ===
  eat(combo) {
    if (!ctx) return;
    const t = now();
    const base = 520 + Math.min(combo, 12) * 34;
    tone(base, t, 0.09, 'triangle', 0.22);
    tone(base * 1.5, t + 0.02, 0.08, 'sine', 0.14);
  },
  bigOrb() {
    if (!ctx) return;
    const t = now();
    tone(660, t, 0.16, 'sine', 0.24);
    tone(990, t + 0.05, 0.18, 'sine', 0.18);
  },
  butterfly() {
    if (!ctx) return;
    const t = now();
    tone(720, t, 0.12, 'triangle', 0.24);
    tone(1080, t + 0.09, 0.16, 'triangle', 0.2);
  },
  kill() {
    if (!ctx) return;
    const t = now();
    noiseBurst(t, 0.28, 0.4, 700, 0.7);
    tone(380, t, 0.22, 'sawtooth', 0.22, 90);
    // 短琶音
    const arp = [523, 659, 784];
    for (let i = 0; i < arp.length; i++) tone(arp[i], t + 0.08 + i * 0.05, 0.14, 'triangle', 0.16);
  },
  death() {
    if (!ctx) return;
    const t = now();
    tone(440, t, 0.7, 'sawtooth', 0.28, 70);
    tone(220, t + 0.02, 0.7, 'sine', 0.2, 55);
  },
  milestone() {
    if (!ctx) return;
    const t = now();
    const arp = [523, 659, 784, 1046, 1318];
    for (let i = 0; i < arp.length; i++) tone(arp[i], t + i * 0.07, 0.25, 'triangle', 0.2);
  },
  button() {
    if (!ctx) return;
    const t = now();
    tone(680, t, 0.07, 'sine', 0.2, 900);
  },

  // === 加速气流循环 ===
  boostOn() {
    if (!ctx || !noiseBuffer) return;
    if (boostSrc) return;
    boostSrc = ctx.createBufferSource();
    boostSrc.buffer = noiseBuffer;
    boostSrc.loop = true;
    boostFilter = ctx.createBiquadFilter();
    boostFilter.type = 'lowpass';
    boostFilter.frequency.value = 700;
    boostGain = ctx.createGain();
    boostGain.gain.setValueAtTime(0.0001, now());
    boostGain.gain.exponentialRampToValueAtTime(0.12, now() + 0.15);
    boostSrc.connect(boostFilter);
    boostFilter.connect(boostGain);
    boostGain.connect(sfxGain);
    boostSrc.start(0);
  },
  boostOff() {
    if (!boostSrc) return;
    const s = boostSrc, g = boostGain;
    const t = now();
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      s.stop(t + 0.16);
    } catch (e) {}
    boostSrc = null;
    boostGain = null;
    boostFilter = null;
  },

  // === BGM：太空感 3 声部慢琶音循环 ===
  _bgmTimer: null,
  _bgmNext: 0,
  _bgmStep: 0,
  startBgm() {
    if (!ctx) return;
    if (this._bgmTimer) return;
    this._bgmNext = now() + 0.1;
    this._bgmStep = 0;
    // 小调式琶音音阶（A 小调气氛）
    const scale = [220, 261.63, 329.63, 392, 440, 523.25];
    const self = this;
    this._bgmTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const ahead = now() + 0.1;
      while (self._bgmNext < ahead) {
        const t = self._bgmNext;
        const step = self._bgmStep;
        const root = scale[step % scale.length];
        // 3 声部
        bgmNote(root * 0.5, t, 1.6, 'sine', 0.09);
        bgmNote(root, t, 1.2, 'triangle', 0.07);
        if (step % 2 === 0) bgmNote(root * 1.5, t + 0.4, 0.8, 'sine', 0.05);
        self._bgmNext += 0.8;
        self._bgmStep++;
      }
    }, 25);
  },
  stopBgm() {
    if (this._bgmTimer) {
      clearInterval(this._bgmTimer);
      this._bgmTimer = null;
    }
  },
};

function bgmNote(freq, t0, dur, type, gain) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(bgmGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
