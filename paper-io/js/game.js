// game.js — 世界数据模型、移动、碰撞、占领核心算法。
import { Audio } from './audio.js';
import { Juice } from './juice.js';
import { Bots } from './bots.js';

export const TUNING = {
  worldCells: 400,        // grid 400x400
  cell: 8,                // 每格 8 世界单位
  get world() { return this.worldCells * this.cell; }, // 3200
  totalCells: 400 * 400,  // 160000
  speed: 150,             // u/s 恒速
  turnRate: 3.8,          // rad/s 转向上限
  headR: 11,              // 头部半径（碰撞用）
  startRadius: 18,        // 出生领地半径（格）
  botCount: 7,
  botRespawnMin: 3.0,
  botRespawnMax: 5.0,
  reviveOnce: true,
  reviveInvuln: 2.0,      // 复活无敌秒
  cameraK: 8,
  zoomK: 3,
  trailWidth: 17,
  aiHz: 20,
  aggressionRamp: 0.05,
  selfSafeSteps: 4,       // 自碰安全步差
  playerId: 1,
};

const N = TUNING.worldCells;
const CELL = TUNING.cell;
const TOTAL = TUNING.totalCells;
const TAU = Math.PI * 2;

// pastel 色池
const PASTELS = ['#7ec8ff', '#ff9ec8', '#a6e37b', '#c39bff', '#ffd166',
  '#5fe0c0', '#ff8f6b', '#8bd3ff', '#ffa3e0', '#b8e986', '#f6a5c0', '#7bd1a8'];
// bot 名字 + emoji 池
const BOT_IDENTITIES = [
  ['果冻鸭', '🦆'], ['甜圈猫', '🐱'], ['汽水熊', '🐻'], ['泡泡龙', '🐲'],
  ['棉花糖', '🐰'], ['布丁狗', '🐶'], ['奶盖鲸', '🐳'], ['波波熊', '🐨'],
  ['果酱狐', '🦊'], ['蜜瓜猪', '🐷'], ['芒果象', '🐘'], ['草莓兔', '🐇'],
  ['蓝莓鼠', '🐭'], ['柠檬鸟', '🐦'], ['椰子猴', '🐵'], ['樱桃鹿', '🦌'],
  ['抹茶蛙', '🐸'], ['焦糖獾', '🦡'], ['蜜桃羊', '🐑'], ['西瓜企鹅', '🐧'],
  ['荔枝喵', '🐈'], ['蛋挞鸭', '🦉'],
];

function clampCell(v) { return v < 0 ? 0 : (v >= N ? N - 1 : v); }
function randRange(a, b) { return a + Math.random() * (b - a); }
function normAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

// 最短弧插值角度
export function lerpAngle(a, b, t) {
  return a + normAngle(b - a) * t;
}

export class Game {
  constructor() {
    this.grid = new Uint8Array(TOTAL);
    this.trailOwner = new Uint8Array(TOTAL);
    this.trailStep = new Uint16Array(TOTAL);
    this.counts = new Int32Array(9);
    this.sumX = new Float64Array(9);
    this.sumY = new Float64Array(9);
    this.entities = new Array(9).fill(null);

    // 洪水填充复用缓冲
    this.fillMark = new Uint8Array(TOTAL);
    this.fillGen = 0;
    this.stack = new Int32Array(TOTAL);
    this.pathCells = new Int32Array(4096);

    this.time = 0;
    this.stepCount = 0;
    this.lastRampTime = 0;
    this.lastRampPercent = 0;
    this.reviveUsed = false;
    this.over = false;
    this.won = false;
    this.playerKills = 0;
    this.startWallTime = 0;
    this.aliveTime = 0;

    this.deaths = [];
    this.callbacks = {
      onKill: () => {}, onPlayerDeath: () => {}, onVictory: () => {},
      onCapture: () => {},
    };
  }

  idx(cx, cy) { return cy * N + cx; }

  makeEntity(id, isPlayer) {
    return {
      id, isPlayer,
      alive: false, dead: false, _deathApplied: false,
      x: 0, y: 0, prevX: 0, prevY: 0,
      angle: 0, prevAngle: 0, targetAngle: 0,
      color: isPlayer ? '#ff8a3d' : PASTELS[0],
      emoji: '🍦', name: isPlayer ? '你' : 'bot', skinName: '冰棒',
      inTerritory: true,
      trailActive: false,
      stepCounter: 0,
      trailPoints: [],
      _trailMinX: 0, _trailMaxX: 0, _trailMinY: 0, _trailMaxY: 0,
      _trailSmooth: null, _trailSmoothLen: -1,
      kills: 0,
      territoryDirty: true,
      territoryPath: null,
      leaveSquash: 0,
      invulnUntil: 0,
      fading: false, fadeTimer: 0,
      respawnTimer: 0,
      // bot ai
      ai: null,
    };
  }

  reset() {
    this.grid.fill(0);
    this.trailOwner.fill(0);
    this.trailStep.fill(0);
    this.counts.fill(0);
    this.sumX.fill(0);
    this.sumY.fill(0);
    this.time = 0; this.stepCount = 0;
    this.lastRampTime = 0; this.lastRampPercent = 0;
    this.reviveUsed = false; this.over = false; this.won = false;
    this.playerKills = 0; this.aliveTime = 0;
    this.deaths.length = 0;
    for (let i = 0; i < 9; i++) this.entities[i] = null;
    Juice.reset();
  }

  newGame(skin) {
    this.reset();
    // 玩家
    const p = this.makeEntity(TUNING.playerId, true);
    p.emoji = skin.emoji; p.skinName = skin.name; p.name = '你';
    p.color = '#ff8a3d';
    const cx = N / 2 + ((Math.random() * 8 - 4) | 0);
    const cy = N / 2 + ((Math.random() * 8 - 4) | 0);
    this.spawnEntity(p, cx, cy);
    this.entities[p.id] = p;
    this.player = p;

    // bots
    const used = new Set();
    for (let b = 0; b < TUNING.botCount; b++) {
      const id = 2 + b;
      const e = this.makeEntity(id, false);
      this.assignIdentity(e, used);
      const spot = this.findSpawnSpot();
      this.spawnEntity(e, spot.cx, spot.cy);
      e.ai = Bots.makeBrain();
      this.entities[id] = e;
    }
    this.startWallTime = performance.now();
  }

  assignIdentity(e, used) {
    let tries = 0, pick;
    do { pick = (Math.random() * BOT_IDENTITIES.length) | 0; tries++; }
    while (used.has(pick) && tries < 40);
    used.add(pick);
    e.name = BOT_IDENTITIES[pick][0];
    e.emoji = BOT_IDENTITIES[pick][1];
    e.color = PASTELS[(Math.random() * PASTELS.length) | 0];
  }

  spawnEntity(e, cx, cy) {
    e.alive = true; e.dead = false; e._deathApplied = false;
    e.x = cx * CELL + CELL / 2;
    e.y = cy * CELL + CELL / 2;
    e.prevX = e.x; e.prevY = e.y;
    e.angle = Math.random() * TAU;
    e.prevAngle = e.angle; e.targetAngle = e.angle;
    e.inTerritory = true; e.trailActive = false; e.stepCounter = 0;
    e.trailPoints.length = 0;
    e.fading = false; e.fadeTimer = 0; e.leaveSquash = 0;
    e.territoryDirty = true;
    // 出生圆
    const r = TUNING.startRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const gx = clampCell(cx + dx), gy = clampCell(cy + dy);
          const gi = this.idx(gx, gy);
          // 只在中立格盖章：出生圆绝不覆盖任何已有领地（玩家或其它 bot）。
          if (this.grid[gi] === 0) this.setOwner(gi, e.id);
        }
      }
    }
  }

  findSpawnSpot() {
    const minDist = 40; // 格
    const step = 8;
    let bestCand = null, bestScore = -1;
    for (let t = 0; t < 200; t++) {
      const cx = 20 + ((Math.random() * (N - 40)) | 0);
      const cy = 20 + ((Math.random() * (N - 40)) | 0);
      // 该点周围一圈需为中立且远离任何领地
      let ok = true;
      let neutral = 0;
      for (let dy = -minDist; dy <= minDist; dy += step) {
        for (let dx = -minDist; dx <= minDist; dx += step) {
          const gx = clampCell(cx + dx), gy = clampCell(cy + dy);
          if (this.grid[this.idx(gx, gy)] === 0) neutral++;
          else ok = false;
        }
      }
      if (ok) return { cx, cy };
      // 记录最空旷的候选，供兜底使用
      if (neutral > bestScore) { bestScore = neutral; bestCand = { cx, cy }; }
    }
    // 兜底：返回最空旷的候选（而非纯随机），尽量避免压到他人领地上。
    // 配合 spawnEntity 只在中立格盖章，出生绝不吞噬现有领地（§5 永不出生在玩家领地）。
    return bestCand || { cx: 20 + ((Math.random() * (N - 40)) | 0), cy: 20 + ((Math.random() * (N - 40)) | 0) };
  }

  setOwner(index, newOwner) {
    const old = this.grid[index];
    if (old === newOwner) return;
    const cx = index % N, cy = (index / N) | 0;
    if (old !== 0) {
      this.counts[old]--;
      this.sumX[old] -= cx; this.sumY[old] -= cy;
      const eo = this.entities[old]; if (eo) eo.territoryDirty = true;
    }
    this.grid[index] = newOwner;
    if (newOwner !== 0) {
      this.counts[newOwner]++;
      this.sumX[newOwner] += cx; this.sumY[newOwner] += cy;
      const en = this.entities[newOwner]; if (en) en.territoryDirty = true;
    }
  }

  percent(id) { return this.counts[id] / TOTAL * 100; }

  centroid(id, out) {
    const c = this.counts[id];
    if (c <= 0) { out.x = TUNING.world / 2; out.y = TUNING.world / 2; return; }
    out.x = (this.sumX[id] / c + 0.5) * CELL;
    out.y = (this.sumY[id] / c + 0.5) * CELL;
  }

  // ---- Amanatides & Woo 体素遍历，防隧穿 ----
  cellsBetween(x0, y0, x1, y1) {
    const out = this.pathCells;
    let cx = clampCell(Math.floor(x0 / CELL));
    let cy = clampCell(Math.floor(y0 / CELL));
    const ecx = clampCell(Math.floor(x1 / CELL));
    const ecy = clampCell(Math.floor(y1 / CELL));
    const dx = x1 - x0, dy = y1 - y0;
    const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    let n = 0;
    out[n++] = cy * N + cx;
    let tMaxX, tMaxY, tDeltaX, tDeltaY;
    if (stepX !== 0) { const nx = (cx + (stepX > 0 ? 1 : 0)) * CELL; tMaxX = (nx - x0) / dx; tDeltaX = Math.abs(CELL / dx); }
    else { tMaxX = Infinity; tDeltaX = Infinity; }
    if (stepY !== 0) { const ny = (cy + (stepY > 0 ? 1 : 0)) * CELL; tMaxY = (ny - y0) / dy; tDeltaY = Math.abs(CELL / dy); }
    else { tMaxY = Infinity; tDeltaY = Infinity; }
    let guard = 0;
    while ((cx !== ecx || cy !== ecy) && guard++ < 3000) {
      if (tMaxX < tMaxY) { tMaxX += tDeltaX; cx += stepX; }
      else { tMaxY += tDeltaY; cy += stepY; }
      cx = clampCell(cx); cy = clampCell(cy);
      out[n++] = cy * N + cx;
      if (n >= out.length - 1) break;
    }
    return n;
  }

  startTrail(e) {
    e.trailActive = true;
    e.stepCounter = 0;
    e.trailPoints.length = 0;
    e.trailPoints.push({ x: e.x, y: e.y });
    e._trailMinX = e._trailMaxX = e.x;
    e._trailMinY = e._trailMaxY = e.y;
    e._trailSmooth = null; e._trailSmoothLen = -1;
    e.leaveSquash = 0.18;
    if (e.isPlayer) Audio.leave();
  }

  addTrailPoint(e, index) {
    const cx = index % N, cy = (index / N) | 0;
    const wx = cx * CELL + CELL / 2, wy = cy * CELL + CELL / 2;
    const pts = e.trailPoints;
    const last = pts[pts.length - 1];
    if (!last || (last.x - wx) * (last.x - wx) + (last.y - wy) * (last.y - wy) >= 64) {
      pts.push({ x: wx, y: wy });
      if (wx < e._trailMinX) e._trailMinX = wx;
      if (wx > e._trailMaxX) e._trailMaxX = wx;
      if (wy < e._trailMinY) e._trailMinY = wy;
      if (wy > e._trailMaxY) e._trailMaxY = wy;
    }
  }

  clearTrail(e) {
    // 清除该 owner 的所有轨迹格（本次出行）
    for (let i = 0; i < e.trailPoints.length; i++) { /* trailPoints 仅渲染 */ }
    // trailOwner 扫描清理：只清属于 e 的
    const to = this.trailOwner;
    // 用 bbox 优化不易（trip 分散），直接扫描一次可接受（死亡/占领频率低）
    for (let i = 0; i < TOTAL; i++) {
      if (to[i] === e.id) to[i] = 0;
    }
    e.trailActive = false;
    e.trailPoints.length = 0;
    e.stepCounter = 0;
  }

  // ---- 占领算法 ----
  doCapture(e) {
    const id = e.id;
    const to = this.trailOwner;
    const grid = this.grid;
    // 1. bbox = (己领地 ∪ 轨迹) 外扩 1
    let minX = N, minY = N, maxX = -1, maxY = -1;
    // 己领地 bbox 通过扫描 counts 区域较贵；改为扫描 grid+trail 一次得 bbox
    for (let i = 0; i < TOTAL; i++) {
      if (grid[i] === id || to[i] === id) {
        const cx = i % N, cy = (i / N) | 0;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      }
    }
    if (maxX < 0) { e.trailActive = false; e.trailPoints.length = 0; return; }
    minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1);
    maxX = Math.min(N - 1, maxX + 1); maxY = Math.min(N - 1, maxY + 1);

    // 2. 从 bbox 边框洪水填充 reachable（open = 非己领地 且 非己轨迹）
    this.fillGen++;
    const gen = this.fillGen;
    const mark = this.fillMark;
    const stack = this.stack;
    let sp = 0;
    const push = (cx, cy) => {
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) return;
      const ix = cy * N + cx;
      if (mark[ix] === gen) return;
      if (grid[ix] === id || to[ix] === id) return; // 非 open
      mark[ix] = gen;
      stack[sp++] = ix;
    };
    for (let cx = minX; cx <= maxX; cx++) { push(cx, minY); push(cx, maxY); }
    for (let cy = minY; cy <= maxY; cy++) { push(minX, cy); push(maxX, cy); }
    while (sp > 0) {
      const ix = stack[--sp];
      const cx = ix % N, cy = (ix / N) | 0;
      push(cx - 1, cy); push(cx + 1, cy); push(cx, cy - 1); push(cx, cy + 1);
    }

    // 3. bbox 内 open 且 !reachable -> 占领
    const before = this.counts[id];
    const victims = new Set();
    for (let cy = minY; cy <= maxY; cy++) {
      const row = cy * N;
      for (let cx = minX; cx <= maxX; cx++) {
        const ix = row + cx;
        const isOwn = grid[ix] === id;
        const isTrail = to[ix] === id;
        if (isOwn) continue;
        if (isTrail) continue;
        if (mark[ix] !== gen) {
          // enclosed -> capture
          const prev = grid[ix];
          if (prev !== 0) victims.add(prev);
          this.setOwner(ix, id);
          // 被包住的格子若残留他人轨迹标记，必须清除，
          // 否则会在己方领地内留下“幽灵轨迹格”（误判割线击杀 / 撑大他人 bbox）。
          if (to[ix] !== 0) to[ix] = 0;
        }
      }
    }
    // 4. 轨迹格 -> 占领并清轨迹
    for (let cy = minY; cy <= maxY; cy++) {
      const row = cy * N;
      for (let cx = minX; cx <= maxX; cx++) {
        const ix = row + cx;
        if (to[ix] === id) {
          const prev = grid[ix];
          if (prev !== 0 && prev !== id) victims.add(prev);
          this.setOwner(ix, id);
          to[ix] = 0;
        }
      }
    }
    e.trailActive = false;
    e.trailPoints.length = 0;

    const gained = this.counts[id] - before;
    const deltaPct = gained / TOTAL * 100;

    // 5. 受害者领地清零则死亡
    victims.forEach((vid) => {
      if (vid === id) return;
      const v = this.entities[vid];
      if (v && v.alive && !v.dead && this.counts[vid] === 0) {
        this.markDeath(v, e);
      }
    });

    if (gained > 0) {
      Audio.claim(deltaPct);
      this.callbacks.onCapture(e, deltaPct);
      // 飘字
      Juice.floatText(e.x, e.y - 26, '+' + deltaPct.toFixed(1) + '%', e.color, e.isPlayer ? 30 : 22);
      if (deltaPct >= 3) {
        Juice.confettiBurst(e.x, e.y, 0, 0, false);
        if (e.isPlayer) Juice.shake(6, 0.35);
      }
      // 胜利判定
      if (e.isPlayer && this.percent(id) >= 100) {
        this.won = true;
        this.callbacks.onVictory(e);
      }
    }
  }

  markDeath(e, killer) {
    if (e.dead) return;
    e.dead = true;
    this.deaths.push({ e, killerId: killer ? killer.id : 0 });
  }

  applyDeaths() {
    for (let d = 0; d < this.deaths.length; d++) {
      const { e, killerId } = this.deaths[d];
      if (e._deathApplied) continue;
      e._deathApplied = true;
      e.alive = false;
      // 效果
      Juice.explode(e.x, e.y, e.color);
      this.clearTrail(e);
      // 击杀归属
      if (killerId && killerId !== e.id) {
        const k = this.entities[killerId];
        if (k) {
          k.kills++;
          if (k.isPlayer) this.playerKills++;
          this.callbacks.onKill(k, e);
          Audio.kill();
        }
      }
      Audio.death();
      if (e.isPlayer) {
        Juice.shake(8, 0.5);
        this.callbacks.onPlayerDeath(e);
      } else {
        Juice.shake(3, 0.25);
        // 领地淡出后清为中立
        e.fading = true; e.fadeTimer = 0.8;
        e.respawnTimer = randRange(TUNING.botRespawnMin, TUNING.botRespawnMax);
      }
    }
    this.deaths.length = 0;
  }

  clearTerritory(id) {
    const grid = this.grid;
    for (let i = 0; i < TOTAL; i++) {
      if (grid[i] === id) this.setOwner(i, 0);
    }
    // setOwner 已更新 counts/sum；确保归零
    this.counts[id] = 0; this.sumX[id] = 0; this.sumY[id] = 0;
  }

  respawnBot(e) {
    // 换身份重生（排除在场其他 bot 已占用的名字，避免重名）
    const used = new Set();
    for (let id = 2; id <= 8; id++) {
      const o = this.entities[id];
      if (!o || o === e) continue;
      for (let k = 0; k < BOT_IDENTITIES.length; k++) {
        if (BOT_IDENTITIES[k][0] === o.name) { used.add(k); break; }
      }
    }
    this.assignIdentity(e, used);
    const spot = this.findSpawnSpot();
    e.kills = e.kills; // 保留击杀无意义，重置身份即可
    e.kills = 0;
    this.spawnEntity(e, spot.cx, spot.cy);
    e.ai = Bots.makeBrain();
  }

  // 玩家复活（保留领地），返回是否成功
  revivePlayer() {
    if (this.reviveUsed) return false;
    this.reviveUsed = true;
    const p = this.player;
    const c = { x: 0, y: 0 };
    // 若领地已空，落到地图中心
    if (this.counts[p.id] > 0) this.centroid(p.id, c);
    else { c.x = TUNING.world / 2; c.y = TUNING.world / 2; }
    const cx = clampCell(Math.floor(c.x / CELL));
    const cy = clampCell(Math.floor(c.y / CELL));
    // 若质心不在自己领地，确保有一小块出生地
    if (this.grid[this.idx(cx, cy)] !== p.id) {
      const r = 6;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx * dx + dy * dy <= r * r)
            this.setOwner(this.idx(clampCell(cx + dx), clampCell(cy + dy)), p.id);
    }
    p.alive = true; p.dead = false; p._deathApplied = false;
    p.x = cx * CELL + CELL / 2; p.y = cy * CELL + CELL / 2;
    p.prevX = p.x; p.prevY = p.y;
    p.inTerritory = true; p.trailActive = false; p.stepCounter = 0;
    p.trailPoints.length = 0;
    p.invulnUntil = this.time + TUNING.reviveInvuln;
    Audio.reviveBlink();
    return true;
  }

  // ---- 固定步逻辑 ----
  step(dt) {
    this.time += dt;
    this.stepCount++;
    const player = this.player;
    if (player && player.alive) this.aliveTime += dt;

    // 难度升温
    if (this.time - this.lastRampTime >= 60) {
      this.lastRampTime += 60;
      this.rampAggression();
    }
    const pp = player ? this.percent(player.id) : 0;
    if (pp - this.lastRampPercent >= 10) {
      this.lastRampPercent += 10;
      this.rampAggression();
    }

    // AI 决策 20Hz（每 3 步）
    const doAI = (this.stepCount % 3) === 0;

    for (let id = 2; id <= 8; id++) {
      const e = this.entities[id];
      if (!e) continue;
      if (e.fading) {
        e.fadeTimer -= dt;
        if (e.fadeTimer <= 0) { e.fading = false; this.clearTerritory(id); }
      }
      if (!e.alive) {
        if (e.respawnTimer > 0) {
          e.respawnTimer -= dt;
          if (e.respawnTimer <= 0 && !e.fading) this.respawnBot(e);
        }
        continue;
      }
      if (doAI) Bots.decide(e, this, dt * 3);
    }

    // 移动 + 处理（玩家优先，然后 bot）
    for (let id = 1; id <= 8; id++) {
      const e = this.entities[id];
      if (!e || !e.alive || e.dead) continue;
      this.advance(e, dt);
    }
    // 处理格子（碰撞/轨迹/占领）
    for (let id = 1; id <= 8; id++) {
      const e = this.entities[id];
      if (!e || !e.alive || e.dead) continue;
      this.processCells(e);
    }
    // 头对头碰撞
    this.headCollisions();
    // 应用死亡
    this.applyDeaths();

    // squash 衰减
    for (let id = 1; id <= 8; id++) {
      const e = this.entities[id];
      if (e && e.leaveSquash > 0) e.leaveSquash = Math.max(0, e.leaveSquash - dt);
    }
  }

  rampAggression() {
    for (let id = 2; id <= 8; id++) {
      const e = this.entities[id];
      if (e && e.ai) e.ai.aggression = Math.min(0.9, e.ai.aggression + TUNING.aggressionRamp);
    }
  }

  advance(e, dt) {
    e.prevX = e.x; e.prevY = e.y; e.prevAngle = e.angle;
    // 平滑转向（限速）
    let diff = normAngle(e.targetAngle - e.angle);
    const maxTurn = TUNING.turnRate * dt;
    if (diff > maxTurn) diff = maxTurn;
    else if (diff < -maxTurn) diff = -maxTurn;
    e.angle = normAngle(e.angle + diff);
    // 过弯外倾（供渲染）
    const targetBank = Math.max(-1, Math.min(1, diff / (maxTurn || 1))) * 0.14;
    e._bank = (e._bank || 0) + (targetBank - (e._bank || 0)) * 0.25;
    e._invulnBlink = e.invulnUntil > this.time;
    let nx = e.x + Math.cos(e.angle) * TUNING.speed * dt;
    let ny = e.y + Math.sin(e.angle) * TUNING.speed * dt;
    // 边界滑墙：钳制头部
    const r = TUNING.headR;
    const w = TUNING.world;
    if (nx < r) nx = r; else if (nx > w - r) nx = w - r;
    if (ny < r) ny = r; else if (ny > w - r) ny = w - r;
    e.x = nx; e.y = ny;
  }

  processCells(e) {
    const n = this.cellsBetween(e.prevX, e.prevY, e.x, e.y);
    const grid = this.grid;
    const to = this.trailOwner;
    const ts = this.trailStep;
    const invuln = e.invulnUntil > this.time;
    for (let k = 1; k < n; k++) {
      if (e.dead) break;
      const ix = this.pathCells[k];
      const owner = grid[ix];
      const tOwn = to[ix];
      // 轨迹碰撞
      if (tOwn !== 0) {
        if (tOwn === e.id) {
          if (e.trailActive && (e.stepCounter - ts[ix]) > TUNING.selfSafeSteps) {
            if (!invuln) { this.markDeath(e, null); break; }
          }
        } else {
          const victim = this.entities[tOwn];
          // 受害者处于复活无敌窗口时不可被割线击杀（对齐 §4 复活 2s 无敌）。
          if (victim && victim.alive && !victim.dead && !(victim.invulnUntil > this.time)) {
            this.markDeath(victim, e);
          }
        }
      }
      if (e.dead) break;
      // 领地 / 轨迹
      if (owner === e.id) {
        if (e.trailActive) { this.doCapture(e); }
        e.inTerritory = true;
      } else {
        e.inTerritory = false;
        if (!e.trailActive) this.startTrail(e);
        to[ix] = e.id;
        ts[ix] = e.stepCounter++;
        this.addTrailPoint(e, ix);
      }
    }
  }

  headCollisions() {
    const r2 = (TUNING.headR * 2) * (TUNING.headR * 2);
    for (let i = 1; i <= 8; i++) {
      const A = this.entities[i];
      if (!A || !A.alive || A.dead) continue;
      for (let j = i + 1; j <= 8; j++) {
        const B = this.entities[j];
        if (!B || !B.alive || B.dead) continue;
        const dx = A.x - B.x, dy = A.y - B.y;
        if (dx * dx + dy * dy >= r2) continue;
        const aInv = A.invulnUntil > this.time;
        const bInv = B.invulnUntil > this.time;
        const aSafe = A.inTerritory || aInv;
        const bSafe = B.inTerritory || bInv;
        if (aSafe && bSafe) continue;
        if (aSafe && !bSafe) { this.markDeath(B, A); }
        else if (bSafe && !aSafe) { this.markDeath(A, B); }
        else { this.markDeath(A, null); this.markDeath(B, null); }
      }
    }
  }

  // 排行榜数据（复用数组，2Hz 由 UI 调）
  leaderboard() {
    const arr = [];
    for (let id = 1; id <= 8; id++) {
      const e = this.entities[id];
      if (!e) continue;
      if (!e.alive && !e.isPlayer) continue; // 死亡待重生的 bot 不上榜
      arr.push({ id, name: e.name, color: e.color, pct: this.percent(id), alive: e.alive, isPlayer: e.isPlayer, emoji: e.emoji });
    }
    arr.sort((a, b) => b.pct - a.pct);
    return arr;
  }
}
