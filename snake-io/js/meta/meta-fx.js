// meta-fx.js — 一次性覆盖层特效（彩带、计数上滚、光爆/光芒）。
// 全部自包含临时元素，自动清理；不进游戏热循环。
const TAU = Math.PI * 2;

// 紧凑数字格式：128.34K 式；<1000 显示精确整数
let _compactFmt = null;
try {
  _compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
} catch (e) { _compactFmt = null; }

export function compactNum(n) {
  const v = Math.round(n || 0);
  if (v < 1000) return String(v);
  if (_compactFmt) return _compactFmt.format(v);
  // 兜底
  if (v < 1e6) return (v / 1e3).toFixed(2).replace(/\.?0+$/, '') + 'K';
  return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
}

export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// 数字计数上滚：rAF + easeOutCubic + 紧凑格式。返回 Promise。
// opts: { dur(ms), fmt(fn), shouldSkip(fn)->bool }
export function countUp(el, from, to, opts) {
  opts = opts || {};
  const dur = opts.dur || 800;
  const fmt = opts.fmt || compactNum;
  const shouldSkip = opts.shouldSkip || (() => false);
  return new Promise((resolve) => {
    if (!el || from === to) { if (el) el.textContent = fmt(to); resolve(); return; }
    const t0 = performance.now();
    function step(now) {
      if (shouldSkip()) { el.textContent = fmt(to); resolve(); return; }
      let p = (now - t0) / dur;
      if (p >= 1) { el.textContent = fmt(to); resolve(); return; }
      const v = from + (to - from) * easeOutCubic(p);
      el.textContent = fmt(v);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

// 全屏临时 canvas 彩带爆发（自带物理，自动清理）。gold=true 时金色更多。
// opts: { count, origin:{x,y}, gold:false, duration(ms) }
export function confettiBurst(opts) {
  opts = opts || {};
  const count = opts.count || 90;
  const gold = !!opts.gold;
  const duration = opts.duration || 2600;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  const ox = opts.origin ? opts.origin.x : W / 2;
  const oy = opts.origin ? opts.origin.y : H * 0.4;

  const cvs = document.createElement('canvas');
  cvs.width = Math.floor(W * dpr);
  cvs.height = Math.floor(H * dpr);
  cvs.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60;';
  document.body.appendChild(cvs);
  const ctx = cvs.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const palette = gold
    ? ['#ffd166', '#ffe9a0', '#ffb300', '#fff3c0', '#ff9d5c', '#ffcf40']
    : ['#ff5e8a', '#ffd166', '#5be0b3', '#5b8cff', '#c78bff', '#ff9d5c'];

  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const sp = 120 + Math.random() * 360;
    parts.push({
      x: ox + (Math.random() - 0.5) * 60,
      y: oy + (Math.random() - 0.5) * 40,
      vx: Math.cos(a) * sp * (0.4 + Math.random()),
      vy: Math.sin(a) * sp - 120 - Math.random() * 160,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 9,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 14,
      color: palette[(Math.random() * palette.length) | 0],
      life: 0,
      max: (duration / 1000) * (0.7 + Math.random() * 0.5),
    });
  }

  let last = performance.now();
  let done = false;
  function frame(now) {
    if (done) return;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.life >= p.max) continue;
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 620 * dt;         // 重力
      p.vx *= Math.pow(0.98, dt * 60);
      p.rot += p.vr * dt;
      const a = p.life > p.max - 0.5 ? Math.max(0, (p.max - p.life) / 0.5) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      alive++;
    }
    if (alive > 0) requestAnimationFrame(frame);
    else cleanup();
  }
  function cleanup() {
    if (done) return;
    done = true;
    if (cvs.parentNode) cvs.parentNode.removeChild(cvs);
  }
  requestAnimationFrame(frame);
  // 兜底清理
  setTimeout(cleanup, duration + 1200);
}

// 白光爆：一次性 CSS 径向闪光，自动移除
export function lightBurst(origin, opts) {
  opts = opts || {};
  const size = opts.size || 320;
  const color = opts.color || 'rgba(255,255,255,0.9)';
  const x = origin ? origin.x : window.innerWidth / 2;
  const y = origin ? origin.y : window.innerHeight / 2;
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:' + (x - size / 2) + 'px;top:' + (y - size / 2) + 'px;' +
    'width:' + size + 'px;height:' + size + 'px;border-radius:50%;pointer-events:none;z-index:59;' +
    'background:radial-gradient(circle,' + color + ' 0%,rgba(255,255,255,0) 68%);' +
    'transform:scale(0.2);opacity:0.95;transition:transform .5s cubic-bezier(.2,.8,.3,1),opacity .5s ease;';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'scale(1.6)'; el.style.opacity = '0'; });
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 650);
}

// 旋转 conic 光芒（传说/晋升背后）；返回一个 remove() 句柄
export function rays(parent, opts) {
  opts = opts || {};
  const size = opts.size || 360;
  const color = opts.color || 'rgba(255,220,120,0.5)';
  const el = document.createElement('div');
  el.className = 'meta-rays';
  el.style.cssText =
    'position:absolute;left:50%;top:50%;width:' + size + 'px;height:' + size + 'px;' +
    'margin-left:' + (-size / 2) + 'px;margin-top:' + (-size / 2) + 'px;pointer-events:none;z-index:0;' +
    'background:conic-gradient(' + color + ' 0deg,rgba(255,255,255,0) 20deg,' + color + ' 40deg,' +
    'rgba(255,255,255,0) 60deg,' + color + ' 80deg,rgba(255,255,255,0) 100deg,' + color + ' 120deg,' +
    'rgba(255,255,255,0) 140deg,' + color + ' 160deg,rgba(255,255,255,0) 180deg,' + color + ' 200deg,' +
    'rgba(255,255,255,0) 220deg,' + color + ' 240deg,rgba(255,255,255,0) 260deg,' + color + ' 280deg,' +
    'rgba(255,255,255,0) 300deg,' + color + ' 320deg,rgba(255,255,255,0) 340deg,' + color + ' 360deg);' +
    'border-radius:50%;animation:meta-spin 8s linear infinite;opacity:0.6;';
  if (parent) parent.appendChild(el);
  return { el, remove() { if (el.parentNode) el.parentNode.removeChild(el); } };
}
