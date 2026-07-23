// meta-fx.js — 养成覆盖层一次性特效：confettiBurst / countUp / 光爆。
// 全部自包含（临时 canvas / rAF），用完自动清理；绝不进游戏热循环。
const TAU = Math.PI * 2;

// 紧凑数字格式（128.34K 式，<1000 显示精确整数，SPEC §3.1 / §5）。
export function compactNumber(n) {
  n = Math.round(n);
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1000) return sign + n;
  const units = ['K', 'M', 'B', 'T'];
  let u = -1, v = n;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  let str = v.toFixed(2).replace(/\.?0+$/, '');
  return sign + str + units[u];
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// 数字上滚计数（rAF + easeOutCubic）。返回 Promise；可用 finishCountUp(el) 立即跳到终值（结算跳过）。
export function countUp(el, from, to, opts) {
  opts = opts || {};
  const dur = opts.durMs || 900;
  const fmt = opts.fmt || compactNumber;
  if (el.__cuRaf) { cancelAnimationFrame(el.__cuRaf); el.__cuRaf = 0; }
  return new Promise((resolve) => {
    const start = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (el.__cuRaf) { cancelAnimationFrame(el.__cuRaf); el.__cuRaf = 0; }
      el.textContent = fmt(to);
      el.__cuFinish = null;
      resolve();
    };
    el.__cuFinish = finish;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const v = from + (to - from) * easeOutCubic(t);
      el.textContent = fmt(v);
      if (t >= 1) { finish(); return; }
      el.__cuRaf = requestAnimationFrame(tick);
    };
    el.__cuRaf = requestAnimationFrame(tick);
  });
}

export function finishCountUp(el) {
  if (el && el.__cuFinish) el.__cuFinish();
}

// ---------- 临时全屏 canvas 工具 ----------
function makeFxCanvas() {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000;';
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  document.body.appendChild(c);
  return { c, ctx, w, h };
}

const CONFETTI_COLORS = ['#ff5d5d', '#ffcf3d', '#5dd3ff', '#8bff5d', '#c98bff', '#ff8a3d', '#ff7fd0'];
const GOLD_COLORS = ['#ffd24a', '#ffcf3d', '#ffe89a', '#ffb300', '#fff3c4', '#ffdf6b'];

// 全屏彩带爆发（自包含 canvas 粒子，自动清理）。opts:{count,origin:{x,y},gold}
export function confettiBurst(opts) {
  opts = opts || {};
  const gold = !!opts.gold;
  const count = opts.count || (gold ? 180 : 130);
  const origin = opts.origin || null;
  const { c, ctx, w, h } = makeFxCanvas();
  const colors = gold ? GOLD_COLORS : CONFETTI_COLORS;
  const P = [];
  for (let i = 0; i < count; i++) {
    let x, y, vx, vy;
    if (origin) {
      x = origin.x; y = origin.y;
      const a = Math.random() * TAU;
      const sp = 120 + Math.random() * 420;
      vx = Math.cos(a) * sp;
      vy = Math.sin(a) * sp - 120;
    } else {
      x = Math.random() * w;
      y = -20 - Math.random() * h * 0.4;
      vx = (Math.random() - 0.5) * 260;
      vy = 80 + Math.random() * 220;
    }
    P.push({
      x, y, vx, vy,
      rot: Math.random() * TAU, vrot: (Math.random() - 0.5) * 14,
      w: 6 + Math.random() * 7, h: 9 + Math.random() * 9,
      color: colors[(Math.random() * colors.length) | 0],
      life: 1.7 + Math.random() * 1.6,
    });
  }
  let last = performance.now();
  let raf = 0;
  const step = (now) => {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of P) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += 520 * dt;
      p.vx *= (1 - 0.7 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.y > h + 40) { p.life = 0; continue; }
      alive++;
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (alive > 0) { raf = requestAnimationFrame(step); }
    else { cancelAnimationFrame(raf); c.remove(); }
  };
  raf = requestAnimationFrame(step);
  // 兜底清理：最长 6s 后移除，绝不残留
  setTimeout(() => { try { cancelAnimationFrame(raf); c.remove(); } catch (e) {} }, 6000);
}

// 白光爆（径向渐变一次性闪光，自动清理）。opts:{x,y,color,r}
export function lightBurst(opts) {
  opts = opts || {};
  const { c, ctx, w, h } = makeFxCanvas();
  const x = opts.x != null ? opts.x : w / 2;
  const y = opts.y != null ? opts.y : h / 2;
  const maxR = opts.r || Math.max(w, h) * 0.6;
  const color = opts.color || '#ffffff';
  const start = performance.now();
  const dur = 520;
  let raf = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    ctx.clearRect(0, 0, w, h);
    const r = maxR * easeOutCubic(t);
    const alpha = (1 - t) * 0.9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    g.addColorStop(0, hexA(color, alpha));
    g.addColorStop(0.6, hexA(color, alpha * 0.5));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (t < 1) { raf = requestAnimationFrame(step); }
    else { cancelAnimationFrame(raf); c.remove(); }
  };
  raf = requestAnimationFrame(step);
  setTimeout(() => { try { cancelAnimationFrame(raf); c.remove(); } catch (e) {} }, 1500);
}

function hexA(hex, a) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

export const MetaFX = { confettiBurst, countUp, finishCountUp, compactNumber, lightBurst };
