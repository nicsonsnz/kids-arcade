// juice.js — 粒子、飘字、confetti、屏震（对象池，热路径零分配）
const TAU = Math.PI * 2;

function makeParticle() {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 3, cr: 255, cg: 255, cb: 255, drag: 0.9, active: false };
}
function makeText() {
  return { x: 0, y: 0, vy: -40, life: 0, max: 1, text: '', color: '#fff', size: 22, active: false };
}
function makeConfetti() {
  return { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, w: 8, h: 12, color: '#fff', life: 0, max: 2, active: false };
}

export const Juice = {
  particles: [],
  texts: [],
  confettis: [],
  shakeMag: 0,
  shakeTime: 0,
  shakeX: 0,
  shakeY: 0,
  _pi: 0,
  _ti: 0,
  _ci: 0,

  init() {
    for (let i = 0; i < 400; i++) this.particles.push(makeParticle());
    for (let i = 0; i < 40; i++) this.texts.push(makeText());
    for (let i = 0; i < 160; i++) this.confettis.push(makeConfetti());
  },

  _nextParticle() {
    // 环形复用
    for (let n = 0; n < this.particles.length; n++) {
      this._pi = (this._pi + 1) % this.particles.length;
      if (!this.particles[this._pi].active) return this.particles[this._pi];
    }
    return this.particles[this._pi];
  },
  _nextText() {
    for (let n = 0; n < this.texts.length; n++) {
      this._ti = (this._ti + 1) % this.texts.length;
      if (!this.texts[this._ti].active) return this.texts[this._ti];
    }
    return this.texts[this._ti];
  },
  _nextConfetti() {
    for (let n = 0; n < this.confettis.length; n++) {
      this._ci = (this._ci + 1) % this.confettis.length;
      if (!this.confettis[this._ci].active) return this.confettis[this._ci];
    }
    return this.confettis[this._ci];
  },

  spark(x, y, angle, speed, r, g, b, size) {
    const p = this._nextParticle();
    const spread = (Math.random() - 0.5) * 0.9;
    const a = angle + spread;
    const s = speed * (0.5 + Math.random() * 0.8);
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = 0;
    p.max = 0.4 + Math.random() * 0.4;
    p.r = size || 3;
    p.cr = r; p.cg = g; p.cb = b;
    p.drag = 0.86;
    p.active = true;
  },

  burst(x, y, count, r, g, b, power) {
    for (let i = 0; i < count; i++) {
      const p = this._nextParticle();
      const a = Math.random() * TAU;
      const s = (power || 160) * (0.3 + Math.random());
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = 0;
      p.max = 0.5 + Math.random() * 0.6;
      p.r = 3 + Math.random() * 4;
      p.cr = r; p.cg = g; p.cb = b;
      p.drag = 0.9;
      p.active = true;
    }
  },

  text(x, y, str, color, size) {
    const t = this._nextText();
    t.x = x; t.y = y;
    t.vy = -46;
    t.life = 0;
    t.max = 1.2;
    t.text = str;
    t.color = color || '#fff';
    t.size = size || 22;
    t.active = true;
  },

  confetti(cx, cy, spreadW, spreadH) {
    const palette = ['#ff5e8a', '#ffd166', '#5be0b3', '#5b8cff', '#c78bff', '#ff9d5c'];
    for (let i = 0; i < 90; i++) {
      const c = this._nextConfetti();
      c.x = cx + (Math.random() - 0.5) * spreadW;
      c.y = cy - spreadH * 0.5 + (Math.random() - 0.5) * 40;
      c.vx = (Math.random() - 0.5) * 220;
      c.vy = 60 + Math.random() * 260;
      c.rot = Math.random() * TAU;
      c.vr = (Math.random() - 0.5) * 12;
      c.w = 6 + Math.random() * 7;
      c.h = 9 + Math.random() * 9;
      c.color = palette[(Math.random() * palette.length) | 0];
      c.life = 0;
      c.max = 1.6 + Math.random() * 1.2;
      c.active = true;
    }
  },

  shake(mag) {
    if (mag > this.shakeMag) {
      this.shakeMag = mag;
      this.shakeTime = 0.35;
    }
  },

  update(dt) {
    const ps = this.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.max) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
    }
    const ts = this.texts;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (!t.active) continue;
      t.life += dt;
      if (t.life >= t.max) { t.active = false; continue; }
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.9, dt * 60);
    }
    const cs = this.confettis;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.active) continue;
      c.life += dt;
      if (c.life >= c.max) { c.active = false; continue; }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 220 * dt; // 重力
      c.vx *= Math.pow(0.96, dt * 60);
      c.rot += c.vr * dt;
    }
    // 屏震
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = Math.max(0, this.shakeTime / 0.35);
      const m = this.shakeMag * k;
      this.shakeX = (Math.random() - 0.5) * 2 * m;
      this.shakeY = (Math.random() - 0.5) * 2 * m;
      if (this.shakeTime <= 0) { this.shakeMag = 0; this.shakeX = 0; this.shakeY = 0; }
    }
  },

  reset() {
    for (let i = 0; i < this.particles.length; i++) this.particles[i].active = false;
    for (let i = 0; i < this.texts.length; i++) this.texts[i].active = false;
    for (let i = 0; i < this.confettis.length; i++) this.confettis[i].active = false;
    this.shakeMag = 0; this.shakeTime = 0; this.shakeX = 0; this.shakeY = 0;
  },
};
