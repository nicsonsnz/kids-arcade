// juice.js — 粒子 / 飘字 / confetti / 屏震，全部对象池，热路径零分配。
const TAU = Math.PI * 2;

// ---------- 粒子池 ----------
const MAX_PARTICLES = 600;
const px = new Float32Array(MAX_PARTICLES);
const py = new Float32Array(MAX_PARTICLES);
const pvx = new Float32Array(MAX_PARTICLES);
const pvy = new Float32Array(MAX_PARTICLES);
const plife = new Float32Array(MAX_PARTICLES);
const pmax = new Float32Array(MAX_PARTICLES);
const psize = new Float32Array(MAX_PARTICLES);
const pr = new Uint8Array(MAX_PARTICLES);
const pg = new Uint8Array(MAX_PARTICLES);
const pb = new Uint8Array(MAX_PARTICLES);
const pgrav = new Float32Array(MAX_PARTICLES);
const palive = new Uint8Array(MAX_PARTICLES);
let pHead = 0;

// ---------- 飘字池 ----------
const MAX_TEXTS = 48;
const texts = [];
for (let i = 0; i < MAX_TEXTS; i++) {
  texts.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, max: 0, str: '', color: '#fff', size: 20 });
}

// ---------- confetti 池（屏幕空间）----------
const MAX_CONFETTI = 260;
const confetti = [];
for (let i = 0; i < MAX_CONFETTI; i++) {
  confetti.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0, life: 0, max: 0, w: 0, h: 0, color: '#fff' });
}

// ---------- 屏震 ----------
let shakeAmt = 0;
let shakeTime = 0;
let shakeDur = 0;

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const Juice = {
  reset() {
    palive.fill(0);
    for (const t of texts) t.alive = false;
    for (const c of confetti) c.alive = false;
    shakeAmt = 0; shakeTime = 0; shakeDur = 0;
  },

  spawnParticle(x, y, vx, vy, life, size, r, g, b, grav) {
    let i = -1;
    for (let k = 0; k < MAX_PARTICLES; k++) {
      const idx = (pHead + k) % MAX_PARTICLES;
      if (!palive[idx]) { i = idx; break; }
    }
    if (i < 0) { i = pHead; }
    pHead = (i + 1) % MAX_PARTICLES;
    px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy;
    plife[i] = life; pmax[i] = life; psize[i] = size;
    pr[i] = r; pg[i] = g; pb[i] = b; pgrav[i] = grav; palive[i] = 1;
  },

  burst(x, y, color, count, speed, size, grav) {
    const [r, g, b] = hexToRgb(color);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        0.5 + Math.random() * 0.5, size * (0.6 + Math.random() * 0.7),
        r, g, b, grav);
    }
  },

  // 死亡爆裂：更大更多
  explode(x, y, color) {
    const [r, g, b] = hexToRgb(color);
    for (let k = 0; k < 34; k++) {
      const a = Math.random() * TAU;
      const s = 160 * (0.4 + Math.random() * 0.9);
      this.spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        0.6 + Math.random() * 0.6, 5 + Math.random() * 7,
        r, g, b, 180);
    }
  },

  floatText(x, y, str, color, size) {
    for (const t of texts) {
      if (!t.alive) {
        t.alive = true; t.x = x; t.y = y; t.vy = -46;
        t.life = 1.1; t.max = 1.1; t.str = str; t.color = color; t.size = size || 22;
        return;
      }
    }
  },

  confettiBurst(cx, cy, w, h, big) {
    const colors = ['#ff5d5d', '#ffcf3d', '#5dd3ff', '#8bff5d', '#c98bff', '#ff8a3d', '#ff7fd0'];
    const n = big ? 220 : 60;
    for (let k = 0; k < n; k++) {
      let placed = false;
      for (const c of confetti) {
        if (!c.alive) {
          c.alive = true;
          c.x = big ? Math.random() * w : cx + (Math.random() - 0.5) * 80;
          c.y = big ? -20 - Math.random() * h * 0.4 : cy;
          c.vx = (Math.random() - 0.5) * 240;
          c.vy = big ? 60 + Math.random() * 160 : -160 - Math.random() * 160;
          c.rot = Math.random() * TAU;
          c.vrot = (Math.random() - 0.5) * 12;
          c.life = 1.6 + Math.random() * 1.4; c.max = c.life;
          c.w = 6 + Math.random() * 6; c.h = 9 + Math.random() * 8;
          c.color = colors[(Math.random() * colors.length) | 0];
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
  },

  shake(amount, dur) {
    if (amount > shakeAmt) { shakeAmt = amount; shakeDur = dur; shakeTime = dur; }
    else { shakeTime = Math.max(shakeTime, dur); shakeDur = Math.max(shakeDur, dur); }
  },

  getShake(out) {
    if (shakeTime <= 0 || shakeDur <= 0) { out.x = 0; out.y = 0; return; }
    const f = shakeTime / shakeDur;
    const a = shakeAmt * f * f;
    out.x = (Math.random() - 0.5) * 2 * a;
    out.y = (Math.random() - 0.5) * 2 * a;
  },

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!palive[i]) continue;
      plife[i] -= dt;
      if (plife[i] <= 0) { palive[i] = 0; continue; }
      pvy[i] += pgrav[i] * dt;
      px[i] += pvx[i] * dt;
      py[i] += pvy[i] * dt;
      pvx[i] *= (1 - 1.6 * dt);
    }
    for (const t of texts) {
      if (!t.alive) continue;
      t.life -= dt;
      if (t.life <= 0) { t.alive = false; continue; }
      t.y += t.vy * dt;
      t.vy *= (1 - 1.2 * dt);
    }
    for (const c of confetti) {
      if (!c.alive) continue;
      c.life -= dt;
      if (c.life <= 0) { c.alive = false; continue; }
      c.vy += 220 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vrot * dt;
      c.vx *= (1 - 0.8 * dt);
    }
    if (shakeTime > 0) shakeTime -= dt;
  },

  // 世界空间层：粒子 + 飘字（在相机变换内绘制）
  renderWorld(ctx) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!palive[i]) continue;
      const a = Math.max(0, plife[i] / pmax[i]);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgb(' + pr[i] + ',' + pg[i] + ',' + pb[i] + ')';
      const s = psize[i] * (0.4 + 0.6 * a);
      ctx.beginPath();
      ctx.arc(px[i], py[i], s * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of texts) {
      if (!t.alive) continue;
      const a = Math.min(1, t.life / t.max * 1.4);
      ctx.globalAlpha = a;
      ctx.font = '900 ' + t.size + 'px -apple-system, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },

  // 屏幕空间层：confetti（在相机变换外绘制）
  renderScreen(ctx) {
    for (const c of confetti) {
      if (!c.alive) continue;
      const a = Math.min(1, c.life / c.max * 1.6);
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w * 0.5, -c.h * 0.5, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};
