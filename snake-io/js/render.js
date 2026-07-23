// render.js — 全部 Canvas 2D 绘制。层序：背景 → 边界 → 食物 → 蛇 → 头/眼 → 粒子飘字
import { TUNING, TAU, CANDY, clamp, lerp, angLerp, SKINS } from './game.js';
import { Juice } from './juice.js';

function lighten(rgb, f) {
  return [Math.min(255, rgb[0] + (255 - rgb[0]) * f), Math.min(255, rgb[1] + (255 - rgb[1]) * f), Math.min(255, rgb[2] + (255 - rgb[2]) * f)];
}
function rgbStr(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
function hexToRgb(hex) {
  let h = String(hex || '#888888').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (!isFinite(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbLerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function rgbToHue(rgb) {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return h;
}

export const Renderer = {
  canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
  cam: { x: 0, y: 0, zoom: 1 }, camInit: false,
  glow: [], gold: null, softWhite: null,
  hexTile: null, starFar: null, starNear: null,
  boundaryGrad: null,
  mmCanvas: null, mmCtx: null,
  // 预烘焙颜色查表（热路径零字符串分配）——按皮肤索引
  segLUT: null, skinBase: null, skinHi: null, skinPatLight: null, skinPatDark: null,
  candyWing: null, boostAura: null,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._prebake();
  },

  initMinimap(canvas) {
    this.mmCanvas = canvas;
    this.mmCtx = canvas.getContext('2d');
  },

  resize(cssW, cssH, dpr) {
    this.w = cssW; this.h = cssH; this.dpr = dpr;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  resetCam(game) {
    const p = game.player;
    this.cam.x = p.x; this.cam.y = p.y;
    this.cam.zoom = this._tz(p);
    this.camInit = true;
  },

  _tz(s) { return clamp(1.05 * Math.pow(14 / s.r, 0.55), 0.5, 1.1); },

  _prebake() {
    // 彩色发光 sprite（每个糖果色一枚）
    for (let ci = 0; ci < CANDY.length; ci++) {
      this.glow.push(this._makeGlow(CANDY[ci]));
    }
    this.gold = this._makeGlow([255, 210, 90]);
    this.softWhite = this._makeGlow([255, 255, 255]);

    // 六边形网格 tile
    this.hexTile = this._makeHexTile();
    // 星点两层
    this.starFar = this._makeStarTile(28, 0.35, 1.4);
    this.starNear = this._makeStarTile(18, 0.6, 2.2);

    // 边界渐变（世界坐标，创建一次）
    const g = this.ctx.createRadialGradient(0, 0, TUNING.worldR - 70, 0, 0, TUNING.worldR + 60);
    g.addColorStop(0, 'rgba(255,60,90,0)');
    g.addColorStop(0.55, 'rgba(255,70,100,0.28)');
    g.addColorStop(0.8, 'rgba(255,60,90,0.55)');
    g.addColorStop(1, 'rgba(255,40,70,0.05)');
    this.boundaryGrad = g;

    // 逐皮肤颜色预烘焙（数据驱动 base/accent/style）：运行时只做数组索引，热路径零字符串分配。
    const LUTN = 512; // >= 最大段数 420
    const N = SKINS.length;
    this.segLUT = new Array(N).fill(null);   // 仅 rainbow/gradient 皮肤有逐段 LUT
    this.skinBase = new Array(N);
    this.skinHi = new Array(N);
    this.skinPatLight = new Array(N);
    this.skinPatDark = new Array(N);
    for (let si = 0; si < N; si++) {
      const sk = SKINS[si];
      const baseRgb = hexToRgb(sk.base);
      const accRgb = hexToRgb(sk.accent);
      this.skinBase[si] = sk.base;
      this.skinHi[si] = sk.accent;
      this.skinPatLight[si] = sk.accent;
      this.skinPatDark[si] = rgbStr(rgbLerp(baseRgb, [0, 0, 0], 0.42));
      if (sk.style === 'rainbow' || sk.style === 'gradient') {
        const lut = new Array(LUTN);
        const baseHue = rgbToHue(baseRgb);
        for (let i = 0; i < LUTN; i++) {
          if (sk.style === 'rainbow') {
            lut[i] = 'hsl(' + (((baseHue + i * 12) % 360 + 360) % 360) + ',85%,60%)';
          } else {
            const t = (Math.sin(i * 0.15) + 1) / 2;
            lut[i] = rgbStr(rgbLerp(baseRgb, accRgb, t));
          }
        }
        this.segLUT[si] = lut;
      }
    }
    // 星蝶翅膀色（alpha 0.95）与加速外圈光晕色（每皮肤，提亮糖果色，预烘焙）
    this.candyWing = CANDY.map((c) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.95)');
    this.boostAura = CANDY.map((c) => {
      const a = lighten(c, 0.35);
      return 'rgba(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ',0.18)';
    });
  },

  _makeGlow(rgb) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',1)');
    g.addColorStop(0.35, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.7)');
    g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
  },

  _makeHexTile() {
    const s = 96;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(120,110,200,0.06)';
    x.lineWidth = 1.5;
    const r = 26;
    const drawHex = (cx, cy) => {
      x.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.closePath(); x.stroke();
    };
    const hh = r * Math.sqrt(3);
    drawHex(0, 0); drawHex(s, 0); drawHex(0, s); drawHex(s, s);
    drawHex(s / 2, hh / 2); drawHex(s / 2, s + hh / 2);
    return c;
  },

  _makeStarTile(count, alpha, maxr) {
    const s = 420;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const x = c.getContext('2d');
    for (let i = 0; i < count; i++) {
      const px = Math.random() * s, py = Math.random() * s;
      const r = 0.6 + Math.random() * maxr;
      const a = alpha * (0.4 + Math.random() * 0.6);
      x.fillStyle = 'rgba(255,255,255,' + a + ')';
      x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    }
    return c;
  },

  draw(game, alpha, dt) {
    const ctx = this.ctx, p = game.player;
    const hx = lerp(p.px, p.x, alpha), hy = lerp(p.py, p.y, alpha);

    if (!this.camInit) this.resetCam(game);
    if (game.state === 'play') {
      const kx = 1 - Math.exp(-TUNING.camK * dt);
      this.cam.x += (hx - this.cam.x) * kx;
      this.cam.y += (hy - this.cam.y) * kx;
      const kz = 1 - Math.exp(-TUNING.zoomK * dt);
      this.cam.zoom += (this._tz(p) - this.cam.zoom) * kz;
    }

    const zoom = this.cam.zoom;
    const camX = this.cam.x + Juice.shakeX / zoom;
    const camY = this.cam.y + Juice.shakeY / zoom;

    ctx.clearRect(0, 0, this.w, this.h);
    // 背景底色
    ctx.fillStyle = '#151030';
    ctx.fillRect(0, 0, this.w, this.h);

    this._drawBackground(camX, camY, zoom);

    // 世界变换
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 视野边界
    const halfW = (this.w / 2) / zoom, halfH = (this.h / 2) / zoom;
    const view = { l: camX - halfW, r: camX + halfW, t: camY - halfH, b: camY + halfH };

    this._drawBoundary(ctx);
    this._drawFood(ctx, game, view);

    // #1 蛇（由逻辑步 O(n) 预计算，渲染不再每帧排序/分配）
    const kingId = game.kingId;

    // 先画非玩家蛇，再画玩家（玩家在上）
    for (let i = 0; i < game.snakes.length; i++) {
      const s = game.snakes[i];
      if (!s.alive || s.isPlayer) continue;
      this._drawSnake(ctx, game, s, alpha, view, kingId);
    }
    if (p.alive) this._drawSnake(ctx, game, p, alpha, view, kingId);

    this._drawParticles(ctx);
    this._drawTexts(ctx);

    ctx.restore();

    this._drawConfetti(ctx);
  },

  _drawBackground(camX, camY, zoom) {
    const ctx = this.ctx;
    // 远层星（0.5×）
    this._tileLayer(this.starFar, camX * 0.5, camY * 0.5);
    // 六边网格（跟随 0.9×，带一点缩放感）
    this._tileLayer(this.hexTile, camX * 0.9, camY * 0.9);
    // 近层星（0.8×）
    this._tileLayer(this.starNear, camX * 0.8, camY * 0.8);
  },

  _tileLayer(tile, ox, oy) {
    const ctx = this.ctx, tw = tile.width, th = tile.height;
    let sx = -(((ox % tw) + tw) % tw);
    let sy = -(((oy % th) + th) % th);
    for (let y = sy; y < this.h; y += th) {
      for (let x = sx; x < this.w; x += tw) {
        ctx.drawImage(tile, x, y);
      }
    }
  },

  _drawBoundary(ctx) {
    ctx.save();
    ctx.lineWidth = 90;
    ctx.strokeStyle = this.boundaryGrad;
    ctx.beginPath();
    ctx.arc(0, 0, TUNING.worldR, 0, TAU);
    ctx.stroke();
    // 内圈亮线
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,120,150,0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, TUNING.worldR, 0, TAU);
    ctx.stroke();
    ctx.restore();
  },

  _drawFood(ctx, game, view) {
    const food = game.food;
    const pad = 30;
    ctx.globalCompositeOperation = 'lighter';
    const t = game.time;
    for (let i = 0; i < food.length; i++) {
      const f = food[i];
      if (!f.active) continue;
      if (f.x < view.l - pad || f.x > view.r + pad || f.y < view.t - pad || f.y > view.b + pad) continue;

      if (f.kind === 'butterfly') {
        ctx.globalAlpha = 1;
        this._drawButterfly(ctx, f, t);
        ctx.globalCompositeOperation = 'lighter';
        continue;
      }

      const pulse = 1 + Math.sin(t * 3 + f.phase) * 0.18;
      let sprite = this.glow[f.ci % this.glow.length];
      let size = f.r * 3.2 * pulse;
      let alpha = 1;
      if (f.kind === 'pearl') {
        sprite = this.gold; size = f.r * 3.6 * pulse;
        // 闪烁消失
        if (f.life > 10) alpha = 0.4 + 0.6 * Math.abs(Math.sin(f.life * 6));
      } else if (f.kind === 'orb') {
        size = f.r * 4.2 * pulse;
      } else if (f.life > 0 && !f.baseline) {
        if (f.life > 15) alpha = 0.4 + 0.6 * Math.abs(Math.sin(f.life * 6));
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, f.x - size / 2, f.y - size / 2, size, size);
      if (f.kind === 'orb' || f.kind === 'pearl') {
        // 双层光晕
        ctx.drawImage(sprite, f.x - size * 0.32, f.y - size * 0.32, size * 0.64, size * 0.64);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  _drawButterfly(ctx, f, t) {
    ctx.globalCompositeOperation = 'lighter';
    const glow = this.glow[f.ci % this.glow.length];
    const gs = 44;
    ctx.drawImage(glow, f.x - gs / 2, f.y - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    const ang = Math.atan2(f.vy, f.vx);
    const flap = Math.abs(Math.sin(f.wing)) * 0.9 + 0.2;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(ang);
    ctx.fillStyle = this.candyWing[f.ci % this.candyWing.length];
    // 两枚三角翅膀
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      ctx.save();
      ctx.scale(1, sgn);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, 12 * flap + 4);
      ctx.lineTo(10, 14 * flap + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // 身体
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  },

  _drawSnake(ctx, game, s, alpha, view, kingId) {
    const seg = s.seg;
    if (seg.length < 2) return;
    // 包围盒粗剔除
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (let j = 0; j < seg.length; j += 4) {
      const p = seg[j];
      if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
    }
    const r = s.r;
    if (maxx + r < view.l || minx - r > view.r || maxy + r < view.t || miny - r > view.b) return;

    const si = (s.skin >= 0 && s.skin < SKINS.length) ? s.skin : 0;
    const skin = SKINS[si];
    const perSeg = (skin.style === 'rainbow' || skin.style === 'gradient');

    // 加速外光
    if (s.boosting) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.lineWidth = 2 * r + 10;
      ctx.strokeStyle = this.boostAura[s.skin % this.boostAura.length];
      ctx.beginPath();
      ctx.moveTo(seg[0].x, seg[0].y);
      for (let j = 1; j < seg.length; j++) ctx.lineTo(seg[j].x, seg[j].y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    if (perSeg) {
      // 逐段上色
      for (let j = seg.length - 1; j >= 1; j--) {
        const a = seg[j], b = seg[j - 1];
        // 段剔除
        if ((a.x < view.l - r && b.x < view.l - r) || (a.x > view.r + r && b.x > view.r + r) ||
          (a.y < view.t - r && b.y < view.t - r) || (a.y > view.b + r && b.y > view.b + r)) continue;
        const lut = this.segLUT[si];
        ctx.strokeStyle = lut[j < lut.length ? j : lut.length - 1];
        ctx.lineWidth = 2 * r;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    } else {
      // 单次描边底色（直接在 ctx 上构建 polyline，避免每帧 new Path2D 分配）
      ctx.beginPath();
      ctx.moveTo(seg[0].x, seg[0].y);
      for (let j = 1; j < seg.length; j++) ctx.lineTo(seg[j].x, seg[j].y);
      ctx.strokeStyle = this.skinBase[si];
      ctx.lineWidth = 2 * r;
      ctx.stroke();
      // 高光（上移 2u；路径已烘焙进上一次描边，需重建一遍以应用偏移）
      ctx.save();
      ctx.translate(0, -2);
      ctx.beginPath();
      ctx.moveTo(seg[0].x, seg[0].y);
      for (let j = 1; j < seg.length; j++) ctx.lineTo(seg[j].x, seg[j].y);
      ctx.strokeStyle = this.skinHi[si];
      ctx.lineWidth = 0.55 * r;
      ctx.stroke();
      ctx.restore();
      // 花纹圆斑（每 4 段）
      this._drawPattern(ctx, seg, r, view, this.skinPatLight[si], this.skinPatDark[si]);
    }

    this._drawHead(ctx, game, s, alpha, kingId);
  },

  _drawPattern(ctx, seg, r, view, light, dark) {
    for (let j = 2; j < seg.length; j += 4) {
      const p = seg[j];
      if (p.x + r < view.l || p.x - r > view.r || p.y + r < view.t || p.y - r > view.b) continue;
      ctx.fillStyle = ((j >> 2) & 1) ? light : dark;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.42, 0, TAU);
      ctx.fill();
    }
  },

  _drawHead(ctx, game, s, alpha, kingId) {
    const hx = lerp(s.px, s.x, alpha), hy = lerp(s.py, s.y, alpha);
    const ang = angLerp(s.pheading, s.heading, alpha);
    const r = s.r * 1.08;
    const si = (s.skin >= 0 && s.skin < SKINS.length) ? s.skin : 0;

    // 头
    ctx.fillStyle = this.skinBase[si];
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, TAU);
    ctx.fill();

    // 眼睛
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const perpx = -ey, perpy = ex;
    const eyeDist = r * 0.5, eyeFwd = r * 0.45, eyeR = r * 0.42;
    const tang = s.targetHeading;
    const look = 0.3;
    const lookx = Math.cos(tang), looky = Math.sin(tang);
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      const ox = hx + ex * eyeFwd + perpx * eyeDist * sgn;
      const oy = hy + ey * eyeFwd + perpy * eyeDist * sgn;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ox, oy, eyeR, 0, TAU); ctx.fill();
      const px = ox + lookx * eyeR * look, py = oy + looky * eyeR * look;
      ctx.fillStyle = '#1a1030';
      ctx.beginPath(); ctx.arc(px, py, eyeR * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(px - eyeR * 0.15, py - eyeR * 0.15, eyeR * 0.18, 0, TAU); ctx.fill();
    }

    // 张嘴
    if (s.mouthOpen) {
      ctx.fillStyle = 'rgba(30,15,40,0.85)';
      ctx.beginPath();
      ctx.arc(hx + ex * r * 0.7, hy + ey * r * 0.7, r * 0.35, ang - 0.6, ang + 0.6);
      ctx.lineTo(hx + ex * r * 0.7, hy + ey * r * 0.7);
      ctx.closePath();
      ctx.fill();
    }

    // 名牌
    ctx.font = 'bold ' + Math.max(11, Math.round(r * 0.9)) + 'px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const ny = hy - r - 22; // 名牌浮于头上约 22u（§6）
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.fillStyle = '#ffffff'; // 名牌白字（§6）
    ctx.strokeText(s.name, hx, ny);
    ctx.fillText(s.name, hx, ny);
    if (s.id === kingId) {
      ctx.font = Math.round(r * 1.1) + 'px sans-serif';
      ctx.fillText('👑', hx, ny - Math.max(12, r * 0.9));
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  },

  _drawParticles(ctx) {
    const ps = Juice.particles;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active) continue;
      const a = 1 - p.life / p.max;
      ctx.fillStyle = 'rgba(' + (p.cr | 0) + ',' + (p.cg | 0) + ',' + (p.cb | 0) + ',' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  _drawTexts(ctx) {
    const ts = Juice.texts;
    ctx.textAlign = 'center';
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (!t.active) continue;
      const a = 1 - t.life / t.max;
      ctx.globalAlpha = a;
      ctx.font = 'bold ' + t.size + 'px -apple-system, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  },

  _drawConfetti(ctx) {
    const cs = Juice.confettis;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.active) continue;
      const a = c.life > c.max - 0.5 ? (c.max - c.life) / 0.5 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // 小地图（3Hz）
  drawMinimap(game) {
    const ctx = this.mmCtx;
    if (!ctx) return;
    const size = this.mmCanvas.width;
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, R = size / 2 - 3;
    // 暗底
    ctx.fillStyle = 'rgba(20,14,44,0.72)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,150,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    const scale = R / game.worldR;
    for (let i = 0; i < game.snakes.length; i++) {
      const s = game.snakes[i];
      if (!s.alive) continue;
      const x = cx + s.x * scale, y = cy + s.y * scale;
      if (s.isPlayer) continue;
      const rad = clamp(s.r * 0.12, 2, 4);
      ctx.fillStyle = rgbStr(CANDY[s.skin % CANDY.length]);
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    // 玩家白点脉冲
    const p = game.player;
    if (p.alive) {
      const x = cx + p.x * scale, y = cy + p.y * scale;
      const pulse = 3 + Math.abs(Math.sin(game.time * 4)) * 2.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, pulse, 0, TAU); ctx.fill();
    }
  },
};
