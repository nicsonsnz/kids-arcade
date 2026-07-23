// render.js — 分层渲染：纸纹背景 → 领地 → 轨迹 → 角色 → 粒子/飘字。
import { TUNING, lerpAngle } from './game.js';
import { Juice } from './juice.js';

const N = TUNING.worldCells;
const CELL = TUNING.cell;
const WORLD = TUNING.world;
const TAU = Math.PI * 2;

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function darken(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return 'rgb(' + Math.round(r * (1 - f)) + ',' + Math.round(g * (1 - f)) + ',' + Math.round(b * (1 - f)) + ')';
}

// 预计算并缓存派生阴影色，避免热路径每帧 darken()/hexToRgb() 字符串分配（PLATFORM §4）。
// 仅当实体颜色变化（换身份/复活）时重算一次。
function ensureShades(e) {
  if (e._shadeFor === e.color) return;
  e._shadeFor = e.color;
  e.colDark15 = darken(e.color, 0.15); // 领地厚度底
  e.colDark25 = darken(e.color, 0.25); // 领地描边
  e.colDark35 = darken(e.color, 0.35); // 角色描边/名字
}

// ---- 几何工具 ----
function simplifyCollinear(pts) {
  if (pts.length < 3) return pts;
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  return out.length >= 3 ? out : pts;
}

function chaikinClosed(pts, iters) {
  let cur = pts;
  for (let it = 0; it < iters; it++) {
    if (cur.length < 3) break;
    const next = [];
    const n = cur.length;
    for (let i = 0; i < n; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % n];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    cur = next;
  }
  return cur;
}

function chaikinOpen(pts, iters) {
  let cur = pts;
  for (let it = 0; it < iters; it++) {
    if (cur.length < 3) break;
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

// marching-squares / 边界追踪：从 owner 掩码提取平滑 Path2D
function buildTerritoryPath(game, id) {
  const grid = game.grid;
  const NP = N + 1;
  const edges = new Map(); // startKey -> [endKey...]
  const addEdge = (s, e) => {
    let a = edges.get(s);
    if (!a) { a = []; edges.set(s, a); }
    a.push(e);
  };
  const key = (gx, gy) => gy * NP + gx;
  const owns = (cx, cy) => (cx >= 0 && cy >= 0 && cx < N && cy < N && grid[cy * N + cx] === id);

  for (let cy = 0; cy < N; cy++) {
    const row = cy * N;
    for (let cx = 0; cx < N; cx++) {
      if (grid[row + cx] !== id) continue;
      const A = key(cx, cy), B = key(cx + 1, cy), C = key(cx + 1, cy + 1), D = key(cx, cy + 1);
      if (!owns(cx, cy - 1)) addEdge(A, B); // top
      if (!owns(cx + 1, cy)) addEdge(B, C); // right
      if (!owns(cx, cy + 1)) addEdge(C, D); // bottom
      if (!owns(cx - 1, cy)) addEdge(D, A); // left
    }
  }
  if (edges.size === 0) return null;

  const path = new Path2D();
  const toPt = (k) => ({ x: (k % NP) * CELL, y: ((k / NP) | 0) * CELL });

  for (const [startKey, arr] of edges) {
    while (arr.length) {
      const loopKeys = [startKey];
      let cur = startKey;
      let guard = 0;
      while (guard++ < 400000) {
        const list = edges.get(cur);
        if (!list || list.length === 0) break;
        const nxt = list.pop();
        loopKeys.push(nxt);
        cur = nxt;
        if (cur === startKey) break;
      }
      if (loopKeys.length < 4) continue;
      let pts = loopKeys.map(toPt);
      // 闭合环：去掉重复末点
      if (pts.length > 1) pts.pop();
      pts = simplifyCollinear(pts);
      pts = chaikinClosed(pts, 2);
      if (pts.length < 3) continue;
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
      path.closePath();
    }
  }
  return path;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = 0; this.cssH = 0;
    this.camX = WORLD / 2; this.camY = WORLD / 2;
    this.zoom = 1.15;
    this.targetZoom = 1.15;
    this.patternCanvas = null;
    this.pattern = null;
    this._shake = { x: 0, y: 0 };
    this._tmpCen = { x: 0, y: 0 };
    this._miniColors = {}; // 小地图颜色查表，复用避免每次 drawMinimap 新建对象
    this.buildPattern();
    this.resize();
  }

  buildPattern() {
    const s = 32;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f2e9';
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(120,110,90,0.10)';
    g.beginPath(); g.arc(8, 8, 1.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(24, 24, 1.6, 0, TAU); g.fill();
    this.patternCanvas = c;
    this.pattern = this.ctx.createPattern(c, 'repeat');
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = this.cssW + 'px';
    this.canvas.style.height = this.cssH + 'px';
    this.pattern = this.ctx.createPattern(this.patternCanvas, 'repeat');
  }

  updateCamera(game, dt) {
    const p = game.player;
    if (!p) return;
    let tx, ty;
    if (p.alive) { tx = p.x; ty = p.y; }
    else { tx = this.camX; ty = this.camY; }
    const share = Math.max(game.percent(p.id) / 100, 0.0066);
    this.targetZoom = Math.min(1.15, Math.max(0.5, 1.15 * Math.pow(0.0066 / share, 0.18)));
    const kPos = 1 - Math.exp(-TUNING.cameraK * dt);
    const kZoom = 1 - Math.exp(-TUNING.zoomK * dt);
    this.camX += (tx - this.camX) * kPos;
    this.camY += (ty - this.camY) * kPos;
    this.zoom += (this.targetZoom - this.zoom) * kZoom;
  }

  render(game, alpha, dt) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    Juice.getShake(this._shake);
    const zoom = this.zoom;
    const cx = this.cssW / 2 + this._shake.x;
    const cy = this.cssH / 2 + this._shake.y;

    // 可视世界矩形（含少量外扩）
    const halfW = (this.cssW / 2) / zoom;
    const halfH = (this.cssH / 2) / zoom;
    const viewL = this.camX - halfW, viewR = this.camX + halfW;
    const viewT = this.camY - halfH, viewB = this.camY + halfH;

    // 地图外深色背景
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.camX, -this.camY);

    // 世界纸纹背景（仅地图区域）
    ctx.save();
    ctx.beginPath();
    this.roundRectPath(ctx, 0, 0, WORLD, WORLD, 28);
    ctx.clip();
    ctx.fillStyle = this.pattern;
    ctx.fillRect(Math.max(0, viewL - 40), Math.max(0, viewT - 40),
      Math.min(WORLD, viewR + 40) - Math.max(0, viewL - 40),
      Math.min(WORLD, viewB + 40) - Math.max(0, viewT - 40));
    ctx.restore();
    // 边界描边
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(90,80,60,0.5)';
    this.roundRectPath(ctx, 0, 0, WORLD, WORLD, 28);
    ctx.stroke();

    // 领地层
    for (let id = 1; id <= 8; id++) {
      const e = game.entities[id];
      if (!e) continue;
      if (!e.alive && !e.fading) continue;
      if (game.counts[id] <= 0) continue;
      if (e.territoryDirty || !e.territoryPath) {
        e.territoryPath = buildTerritoryPath(game, id);
        e.territoryDirty = false;
      }
      const path = e.territoryPath;
      if (!path) continue;
      ensureShades(e);
      let alphaV = 1;
      if (e.fading) alphaV = Math.max(0, e.fadeTimer / 0.8);
      ctx.globalAlpha = alphaV;
      // 厚度底（同色深 15%，y+6，对齐 §6）
      ctx.save();
      ctx.translate(0, 6);
      ctx.fillStyle = e.colDark15;
      ctx.fill(path);
      ctx.restore();
      // 本色
      ctx.fillStyle = e.color;
      ctx.fill(path);
      // 描边
      ctx.lineWidth = 2;
      ctx.strokeStyle = e.colDark25;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }

    // 轨迹层
    for (let id = 1; id <= 8; id++) {
      const e = game.entities[id];
      if (!e || !e.alive || !e.trailActive) continue;
      const pts = e.trailPoints;
      if (pts.length < 2) continue;
      // 视野剔除：轨迹包围盒（addTrailPoint 增量维护）完全在视野外则跳过整段
      const cm = TUNING.trailWidth + 20;
      if (e._trailMaxX < viewL - cm || e._trailMinX > viewR + cm ||
          e._trailMaxY < viewT - cm || e._trailMinY > viewB + cm) continue;
      // 平滑结果缓存：仅当轨迹点数变化时才重算，避免每帧新建数组/点对象（PLATFORM §4）
      let sm = e._trailSmooth;
      if (!sm || e._trailSmoothLen !== pts.length) {
        sm = chaikinOpen(pts, 1);
        e._trailSmooth = sm;
        e._trailSmoothLen = pts.length;
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = TUNING.trailWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sm[0].x, sm[0].y);
      for (let i = 1; i < sm.length; i++) ctx.lineTo(sm[i].x, sm[i].y);
      // 连到当前头部
      const ix = e.prevX + (e.x - e.prevX) * alpha;
      const iy = e.prevY + (e.y - e.prevY) * alpha;
      ctx.lineTo(ix, iy);
      ctx.stroke();
      // 头端收口点
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(ix, iy, TUNING.trailWidth * 0.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // #1 判定（用于皇冠）
    let leaderId = 0, leaderPct = -1;
    for (let id = 1; id <= 8; id++) {
      const e = game.entities[id];
      if (!e || !e.alive) continue;
      const pct = game.percent(id);
      if (pct > leaderPct) { leaderPct = pct; leaderId = id; }
    }

    // 角色层
    for (let id = 1; id <= 8; id++) {
      const e = game.entities[id];
      if (!e || !e.alive) continue;
      const ix = e.prevX + (e.x - e.prevX) * alpha;
      const iy = e.prevY + (e.y - e.prevY) * alpha;
      // 视野剔除
      if (ix < viewL - 60 || ix > viewR + 60 || iy < viewT - 60 || iy > viewB + 60) continue;
      const ang = lerpAngle(e.prevAngle, e.angle, alpha);
      this.drawCharacter(ctx, e, ix, iy, ang, id === leaderId);
    }

    // 粒子 + 飘字（世界空间）
    Juice.renderWorld(ctx);

    ctx.restore();

    // confetti（屏幕空间）
    Juice.renderScreen(ctx);
  }

  drawCharacter(ctx, e, x, y, ang, isLeader) {
    ensureShades(e);
    const size = 34;
    const half = size / 2;
    // 阴影椭圆
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + half + 3, half + 2, half * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 过弯外倾
    const bank = Math.max(-0.14, Math.min(0.14, e._bank || 0));
    // squash&stretch
    const sq = e.leaveSquash > 0 ? e.leaveSquash / 0.18 : 0;
    const sx = 1 + sq * 0.18;
    const sy = 1 - sq * 0.14;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + bank);
    ctx.scale(sx, sy);
    // 车身圆角方
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.colDark35;
    ctx.lineWidth = 2.5;
    this.roundRectPath(ctx, -half, -half, size, size, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // emoji（保持正立）
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.font = '22px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.emoji, 0, 1);
    ctx.restore();

    // 名字标签
    const label = e.isPlayer ? (e.name + ' ' + e.skinName) : e.name;
    ctx.font = '700 11px -apple-system, sans-serif';
    const tw = ctx.measureText(label).width;
    const padX = 6, lh = 16;
    const lx = x - tw / 2 - padX, ly = y - half - 22;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    this.roundRectPath(ctx, lx, ly, tw + padX * 2, lh, 7);
    ctx.fill();
    ctx.fillStyle = e.colDark35;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, ly + lh / 2 + 0.5);

    // 皇冠
    if (isLeader) {
      const cwY = ly - 8;
      ctx.fillStyle = '#ffcf3d';
      ctx.strokeStyle = '#c98b00';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 9, cwY + 6);
      ctx.lineTo(x - 9, cwY);
      ctx.lineTo(x - 4.5, cwY + 4);
      ctx.lineTo(x, cwY - 3);
      ctx.lineTo(x + 4.5, cwY + 4);
      ctx.lineTo(x + 9, cwY);
      ctx.lineTo(x + 9, cwY + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff5d5d';
      ctx.beginPath(); ctx.arc(x, cwY - 3, 1.6, 0, TAU); ctx.fill();
    }

    // 无敌闪烁光圈
    if (e._invulnBlink) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 70);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, half + 6, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  drawJoystick(input) {
    const j = input.joystick;
    if (!j.active) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 底盘
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(j.cx, j.cy, 56, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ff8a3d';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(j.cx, j.cy, 56, 0, TAU); ctx.stroke();
    // 杆头（限幅在底盘内）
    let hx = j.hx - j.cx, hy = j.hy - j.cy;
    const m = Math.hypot(hx, hy);
    if (m > 56) { hx = hx / m * 56; hy = hy / m * 56; }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.arc(j.cx + hx, j.cy + hy, 24, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 小地图（独立 canvas，5Hz）
  drawMinimap(mctx, size, game) {
    mctx.clearRect(0, 0, size, size);
    // 背景
    mctx.fillStyle = '#efe8da';
    mctx.fillRect(0, 0, size, size);
    const scale = size / N; // px per cell
    const grid = game.grid;
    // 采样绘制：按 3 格/px
    const stepCells = 3;
    const colorCache = this._miniColors;
    for (let id = 1; id <= 8; id++) {
      const e = game.entities[id];
      colorCache[id] = e ? e.color : '#ccc';
    }
    for (let cy = 0; cy < N; cy += stepCells) {
      for (let cx = 0; cx < N; cx += stepCells) {
        const o = grid[cy * N + cx];
        if (o === 0) continue;
        mctx.fillStyle = colorCache[o] || '#ccc';
        mctx.fillRect(cx * scale, cy * scale, stepCells * scale + 0.6, stepCells * scale + 0.6);
      }
    }
    // 玩家白点脉冲
    const p = game.player;
    if (p && p.alive) {
      const pulse = 2 + Math.abs(Math.sin(performance.now() / 300)) * 2;
      mctx.fillStyle = '#fff';
      mctx.strokeStyle = '#000';
      mctx.lineWidth = 1;
      mctx.beginPath();
      mctx.arc((p.x / CELL) * scale, (p.y / CELL) * scale, pulse, 0, TAU);
      mctx.fill(); mctx.stroke();
    }
    // 视野框
    mctx.strokeStyle = 'rgba(0,0,0,0.4)';
    mctx.lineWidth = 1;
    const halfW = (this.cssW / 2) / this.zoom, halfH = (this.cssH / 2) / this.zoom;
    const vx = ((this.camX - halfW) / CELL) * scale;
    const vy = ((this.camY - halfH) / CELL) * scale;
    const vw = (halfW * 2 / CELL) * scale, vh = (halfH * 2 / CELL) * scale;
    mctx.strokeRect(vx, vy, vw, vh);
  }
}
