// game.js — 世界、蛇模型、食物、碰撞与死亡、主逻辑步（固定步长）
import { Juice } from './juice.js';
import { Audio } from './audio.js';
import { Storage } from './storage.js';
import { Meta } from './meta/meta.js';
import { SKIN_CATALOG } from './meta/meta-config.js';
import { STREAK_BONUS, STREAK_NAME, STREAK_WINDOW } from './meta/meta-config.js';
import { botThink, spawnBotConfig, BOT_NAMES } from './bots.js';
import { I18N } from './i18n.js';

export const TAU = Math.PI * 2;

// === 常量集中（便于调参） ===
export const TUNING = {
  worldR: 2300,
  foodCount: 420,
  hashCell: 176,
  baseSpeed: 168,
  boostSpeed: 336,
  turnBase: 3.5,
  boostDrain: 14,        // mass/s
  minBoostMass: 18,
  botCount: 13,
  aiHz: 20,
  segSpacing: 10,
  trailStep: 2,
  camK: 9,
  zoomK: 2.5,
  eatMagnet: 3.2,        // × r
  collideMargin: -4,
  startMass: 10,
  butterflyCount: 4,     // 3–5 只
  butterflyValue: 40,
  orbValue: 15,
  boostBeanValue: 2,
};

// 皮肤目录改由元系统数据驱动（{id,name,rarity,base,accent,style}）。渲染只读 base/accent/style。
// SKINS 为数组，索引即渲染索引（s.skin 存索引），与 Meta 目录同一份。
export const SKINS = SKIN_CATALOG;

const MILESTONES = [500, 1000, 2500, 5000, 8000, 12000, 15000, 20000, 30000, 50000];

// === 数学 ===
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
export function angLerp(a, b, t) { return a + angDiff(a, b) * t; }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return (a + Math.random() * (b - a + 1)) | 0; }

// 空间哈希整数键（避免每步字符串拼接分配）。cx/cy 量级 ±~14，偏移后恒正且无跨列碰撞。
export function cellKey(cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); }

// 糖果色板（食物 & 粒子）
export const CANDY = [
  [255, 122, 162], [255, 209, 102], [107, 224, 179], [91, 140, 255],
  [199, 139, 255], [255, 157, 92], [126, 231, 255], [255, 240, 150],
];

// === 食物 ===
function makeFood() {
  return { x: 0, y: 0, vx: 0, vy: 0, r: 5, value: 1, kind: 'small', baseline: true,
    ci: 0, phase: 0, wing: 0, life: 0, active: false };
}

// === 蛇 ===
function makeSnake() {
  return {
    id: 0, isPlayer: false, alive: false,
    name: '', skin: 0,
    x: 0, y: 0, px: 0, py: 0,
    heading: 0, pheading: 0, targetHeading: 0,
    boosting: false,
    mass: TUNING.startMass,
    r: 11, segs: 18,
    trail: [], seg: [],
    boostDropTimer: 0,
    spawnGrace: 0,
    kills: 0,
    mouthOpen: false,
    // combo（玩家）
    combo: 0, comboTimer: 0,
    // bot 状态
    ai: null,
  };
}

// 段点复用
function setSeg(seg, i, x, y) {
  if (seg[i]) { seg[i].x = x; seg[i].y = y; }
  else seg[i] = { x, y };
}

function recompute(s) {
  s.segs = Math.min(18 + Math.floor(s.mass / 2.2), 420);
  s.r = 11 + 17 * (1 - 1 / (1 + s.mass / 600));
}

function pushTrail(s) {
  const trail = s.trail;
  const step = TUNING.trailStep;
  if (trail.length === 0) { trail.unshift({ x: s.x, y: s.y }); return; }
  let head = trail[0];
  let dx = s.x - head.x, dy = s.y - head.y;
  let d = Math.hypot(dx, dy);
  let guard = 0;
  while (d >= step && guard < 8) {
    const t = step / d;
    const nx = head.x + dx * t, ny = head.y + dy * t;
    trail.unshift({ x: nx, y: ny });
    head = trail[0];
    dx = s.x - head.x; dy = s.y - head.y; d = Math.hypot(dx, dy);
    guard++;
  }
}

function trimTrail(s) {
  const need = s.segs * TUNING.segSpacing + TUNING.segSpacing * 2;
  const trail = s.trail;
  let acc = 0, prevX = s.x, prevY = s.y, i = 0;
  for (; i < trail.length; i++) {
    acc += Math.hypot(trail[i].x - prevX, trail[i].y - prevY);
    prevX = trail[i].x; prevY = trail[i].y;
    if (acc >= need) break;
  }
  if (i + 1 < trail.length) trail.length = i + 1;
}

function rebuildSegments(s) {
  const trail = s.trail, spacing = TUNING.segSpacing, need = s.segs, seg = s.seg;
  let out = 0;
  setSeg(seg, out++, s.x, s.y);
  if (trail.length === 0) {
    while (out < need) setSeg(seg, out++, s.x, s.y);
    seg.length = need; return;
  }
  let px = s.x, py = s.y, ti = 0;
  let distToNext = Math.hypot(trail[0].x - px, trail[0].y - py);
  let remaining = spacing;
  let guard = 0;
  while (out < need && guard < need * 4 + 16) {
    guard++;
    if (distToNext >= remaining) {
      const t = remaining / (distToNext || 1e-6);
      const nx = px + (trail[ti].x - px) * t;
      const ny = py + (trail[ti].y - py) * t;
      setSeg(seg, out++, nx, ny);
      px = nx; py = ny;
      distToNext -= remaining;
      remaining = spacing;
    } else {
      remaining -= distToNext;
      px = trail[ti].x; py = trail[ti].y;
      ti++;
      if (ti >= trail.length) {
        while (out < need) setSeg(seg, out++, px, py);
        break;
      }
      distToNext = Math.hypot(trail[ti].x - px, trail[ti].y - py);
    }
  }
  while (out < need) setSeg(seg, out++, px, py);
  seg.length = need;
}

export class Game {
  constructor() {
    this.worldR = TUNING.worldR;
    this.snakes = [];
    this.player = null;
    this.food = [];
    this.foodPool = 900;
    for (let i = 0; i < this.foodPool; i++) this.food.push(makeFood());
    this._nextFood = 0;
    this._snakeId = 1;

    this.respawnTimers = [];
    this.aiStep = 0;
    this.state = 'menu'; // menu | play | dead
    this.time = 0;

    this.killToasts = []; // {text, life}
    this.botCount = TUNING.botCount;        // 本局 bot 目标数（隐形难度可下调）
    this.diff = { botDelta: 0, aggressionMul: 1 };
    // 连杀（玩家）：短窗口内连续击杀升级弹窗 + 额外金币
    this.killStreak = 0;
    this.killStreakTimer = 0;
    this.streakBonus = 0;                   // 本局累计连杀奖励金币
    this.streakPops = [];                   // {text, level} 供 main 消费成 DOM 弹窗
    this.rank = 1;
    this.kingId = -1;     // 当前 #1（渲染金冠用，逻辑步内 O(n) 更新，避免渲染每帧排序分配）
    this.bestRank = 999;
    this.milestoneIdx = 0;
    this.stats = null;

    // 碰撞用 typed 数组（复用）
    this.cap = 12000;
    this.segX = new Float32Array(this.cap);
    this.segY = new Float32Array(this.cap);
    this.segR = new Float32Array(this.cap);
    this.segOwner = new Int32Array(this.cap);
    this.segCount = 0;
    this.hash = new Map();           // 整数键 -> bucket 数组（bucket 跨步复用）
    this._bucketPool = [];           // 复用的 bucket 数组池（热路径零分配）
    this._poolIdx = 0;

    this.camReady = false;
    this.cam = { x: 0, y: 0, zoom: 1 };
  }

  // 开一局
  start(skinId) {
    this.snakes.length = 0;
    for (let i = 0; i < this.food.length; i++) this.food[i].active = false;
    this._nextFood = 0;
    this.respawnTimers.length = 0;
    this.killToasts.length = 0;
    this.aiStep = 0;
    this.time = 0;
    this.rank = 1;
    this.bestRank = 999;
    this.milestoneIdx = 0;
    this.stats = null;
    this.killStreak = 0;
    this.killStreakTimer = 0;
    this.streakBonus = 0;
    this.streakPops.length = 0;
    Juice.reset();

    // 隐形照顾难度（连败 → 悄悄降 bot 数量/激进度；绝不提示）
    this.diff = Meta.difficulty();
    this.botCount = clamp(TUNING.botCount + this.diff.botDelta, 6, TUNING.botCount);

    // 玩家
    const p = makeSnake();
    p.id = this._snakeId++;
    p.isPlayer = true;
    p.alive = true;
    p.name = Meta.playerName();   // 'Leon'（生日当天带 🎂）
    p.skin = skinId;
    p.mass = TUNING.startMass;
    const a0 = Math.random() * TAU;
    const rad0 = this.worldR * 0.35 * Math.random();
    p.x = Math.cos(a0) * rad0; p.y = Math.sin(a0) * rad0;
    p.px = p.x; p.py = p.y;
    p.heading = Math.random() * TAU - Math.PI;
    p.pheading = p.heading;
    p.targetHeading = p.heading;
    p.spawnGrace = 2.5;
    recompute(p);
    this._seedTrail(p);
    this.snakes.push(p);
    this.player = p;

    // bots
    for (let i = 0; i < this.botCount; i++) this._spawnBot();

    // 食物填充（bail-out：池若耗尽则停止，避免 _acquireFood 返回 null 时空转）
    while (this._countBaseline() < TUNING.foodCount) { if (!this._spawnBaselineFood()) break; }
    for (let i = 0; i < TUNING.butterflyCount; i++) { if (!this._spawnButterfly()) break; }

    // 相机立即定位
    this.cam.x = p.x; this.cam.y = p.y;
    this.cam.zoom = this._targetZoom(p);
    this.camReady = true;
    this.state = 'play';
  }

  _seedTrail(s) {
    s.trail.length = 0;
    s.seg.length = 0;
    // 沿反方向铺一条初始尾巴
    const need = s.segs * TUNING.segSpacing + 20;
    const dx = -Math.cos(s.heading), dy = -Math.sin(s.heading);
    const n = Math.ceil(need / TUNING.trailStep);
    for (let i = 1; i <= n; i++) {
      s.trail.push({ x: s.x + dx * i * TUNING.trailStep, y: s.y + dy * i * TUNING.trailStep });
    }
    rebuildSegments(s);
  }

  _spawnBot() {
    const s = makeSnake();
    s.id = this._snakeId++;
    s.alive = true;
    const cfg = spawnBotConfig();
    s.name = cfg.name;
    s.skin = cfg.skin;
    s.mass = cfg.mass;
    s.ai = cfg.ai;
    // 隐形难度：连败时悄悄降低 bot 激进度
    s.ai.aggression *= this.diff.aggressionMul;
    // 出生点：远离玩家一点
    let bx = 0, by = 0, tries = 0;
    do {
      const a = Math.random() * TAU;
      const rr = this.worldR * 0.9 * Math.sqrt(Math.random());
      bx = Math.cos(a) * rr; by = Math.sin(a) * rr;
      tries++;
    } while (this.player && Math.hypot(bx - this.player.x, by - this.player.y) < 500 && tries < 8);
    s.x = bx; s.y = by; s.px = bx; s.py = by;
    s.heading = Math.random() * TAU - Math.PI;
    s.pheading = s.heading;
    s.targetHeading = s.heading;
    s.spawnGrace = 1.5;
    recompute(s);
    this._seedTrail(s);
    this.snakes.push(s);
    return s;
  }

  _countBaseline() {
    let c = 0;
    for (let i = 0; i < this.food.length; i++) {
      const f = this.food[i];
      if (f.active && f.baseline) c++;
    }
    return c;
  }
  _countKind(kind) {
    let c = 0;
    for (let i = 0; i < this.food.length; i++) {
      if (this.food[i].active && this.food[i].kind === kind) c++;
    }
    return c;
  }

  _acquireFood() {
    for (let n = 0; n < this.food.length; n++) {
      this._nextFood = (this._nextFood + 1) % this.food.length;
      const f = this.food[this._nextFood];
      if (!f.active) return f;
    }
    return null;
  }

  _randPoint(bias) {
    const a = Math.random() * TAU;
    // bias<1 集中中心
    const rr = this.worldR * 0.97 * Math.pow(Math.random(), bias || 0.62);
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
  }

  _spawnBaselineFood() {
    const f = this._acquireFood();
    if (!f) return false;
    const p = this._randPoint(0.62);
    f.x = p.x; f.y = p.y; f.vx = 0; f.vy = 0;
    f.baseline = true;
    f.phase = Math.random() * TAU;
    f.life = 0;
    if (Math.random() < 0.04) {
      f.kind = 'orb'; f.value = TUNING.orbValue; f.r = 10;
    } else {
      f.kind = 'small';
      f.value = randInt(1, 3);
      f.r = 4 + (f.value - 1); // value 1–3 -> 半径 4–6（符合 §3）
    }
    f.ci = randInt(0, CANDY.length - 1);
    f.active = true;
    return true;
  }

  _spawnButterfly() {
    const f = this._acquireFood();
    if (!f) return false;
    const p = this._randPoint(0.8);
    f.x = p.x; f.y = p.y;
    const a = Math.random() * TAU;
    f.vx = Math.cos(a) * 40; f.vy = Math.sin(a) * 40;
    f.kind = 'butterfly'; f.value = TUNING.butterflyValue; f.r = 10;
    f.baseline = false; f.ci = randInt(0, CANDY.length - 1);
    f.phase = Math.random() * TAU; f.wing = 0; f.life = 0;
    f.active = true;
    return true;
  }

  _dropBoostBean(s) {
    const f = this._acquireFood();
    if (!f) return;
    const tail = s.seg[s.seg.length - 1] || s;
    f.x = tail.x + rand(-6, 6); f.y = tail.y + rand(-6, 6);
    f.vx = rand(-30, 30); f.vy = rand(-30, 30);
    f.kind = 'small'; f.value = TUNING.boostBeanValue; f.r = 5;
    f.baseline = false; f.ci = s.skin % CANDY.length;
    f.phase = Math.random() * TAU; f.life = 0.0001; // 非 0 => 有寿命淡出
    f.active = true;
  }

  _dropPearls(victim) {
    const seg = victim.seg;
    const n = Math.max(1, Math.floor(seg.length / 3));
    const count = Math.min(n, 80);
    const value = clamp(victim.mass * 0.55 / Math.max(1, count), 4, 30);
    for (let i = 0; i < count; i++) {
      const idx = Math.min(seg.length - 1, i * 3);
      const sp = seg[idx];
      const f = this._acquireFood();
      if (!f) return;
      f.x = sp.x + rand(-8, 8); f.y = sp.y + rand(-8, 8);
      f.vx = rand(-40, 40); f.vy = rand(-40, 40);
      f.kind = 'pearl'; f.value = value; f.r = 8;
      f.baseline = false; f.ci = victim.skin % CANDY.length;
      f.phase = Math.random() * TAU; f.life = 0.0001;
      f.active = true;
    }
  }

  _targetZoom(s) {
    return clamp(1.05 * Math.pow(14 / s.r, 0.55), 0.5, 1.1);
  }

  // === 逻辑步 ===
  step(dt) {
    if (this.state !== 'play') return;
    this.time += dt;
    const player = this.player;

    // AI 决策 20Hz（每 3 步）
    const doAI = (this.aiStep % 3) === 0;
    this.aiStep++;

    // 移动全部存活蛇
    for (let i = 0; i < this.snakes.length; i++) {
      const s = this.snakes[i];
      if (!s.alive) continue;
      if (!s.isPlayer && doAI) botThink(s, this, dt * 3);
      this._stepSnake(s, dt);
    }

    // 构建身体空间哈希
    this._buildHash();

    // 碰撞
    this._collide();

    // 食物
    this._foodUpdate(dt);

    // combo 计时（玩家）
    if (player.alive) {
      player.comboTimer -= dt;
      if (player.comboTimer <= 0) { player.combo = 0; player.comboTimer = 0; }
    }

    // 连杀窗口计时
    if (this.killStreakTimer > 0) {
      this.killStreakTimer -= dt;
      if (this.killStreakTimer <= 0) { this.killStreak = 0; this.killStreakTimer = 0; }
    }

    // 排名
    this._updateRank();

    // #1 王者（O(n)，供渲染画金冠；避免渲染每帧调用 leaderboard() 排序+分配）
    let kingId = -1, kingMass = -1;
    for (let i = 0; i < this.snakes.length; i++) {
      const s = this.snakes[i];
      if (s.alive && s.mass > kingMass) { kingMass = s.mass; kingId = s.id; }
    }
    this.kingId = kingId;

    // 里程碑
    if (player.alive) this._checkMilestone();

    // bot 补充
    for (let i = this.respawnTimers.length - 1; i >= 0; i--) {
      this.respawnTimers[i] -= dt;
      if (this.respawnTimers[i] <= 0) {
        this.respawnTimers.splice(i, 1);
        if (this._aliveBots() < this.botCount) this._spawnBot();
      }
    }

    // 食物维持（两条循环都必须在池耗尽/达标时退出，防止 _acquireFood 返回 null 时死循环冻结主线程）
    let guard = 0;
    while (this._countBaseline() < TUNING.foodCount && guard < 40) { if (!this._spawnBaselineFood()) break; guard++; }
    let bguard = 0;
    while (this._countKind('butterfly') < TUNING.butterflyCount && bguard < TUNING.butterflyCount) {
      if (!this._spawnButterfly()) break;
      bguard++;
    }

    // toast 计时
    for (let i = this.killToasts.length - 1; i >= 0; i--) {
      this.killToasts[i].life -= dt;
      if (this.killToasts[i].life <= 0) this.killToasts.splice(i, 1);
    }
  }

  _aliveBots() {
    let c = 0;
    for (let i = 0; i < this.snakes.length; i++) {
      const s = this.snakes[i];
      if (s.alive && !s.isPlayer) c++;
    }
    return c;
  }

  _stepSnake(s, dt) {
    s.px = s.x; s.py = s.y; s.pheading = s.heading;

    let tr = TUNING.turnBase * (0.35 + 0.65 * Math.pow(11 / s.r, 1.2));
    const boosting = s.boosting && s.mass > TUNING.minBoostMass;
    if (boosting) tr *= 0.65;

    const diff = angDiff(s.heading, s.targetHeading);
    const maxTurn = tr * dt;
    const turn = clamp(diff, -maxTurn, maxTurn);
    s.heading += turn;
    if (s.heading > Math.PI) s.heading -= TAU; else if (s.heading < -Math.PI) s.heading += TAU;

    const speed = boosting ? TUNING.boostSpeed : TUNING.baseSpeed;
    s.x += Math.cos(s.heading) * speed * dt;
    s.y += Math.sin(s.heading) * speed * dt;

    if (boosting) {
      s.mass -= TUNING.boostDrain * dt;
      s.boostDropTimer -= dt;
      if (s.boostDropTimer <= 0) { s.boostDropTimer += 0.22; this._dropBoostBean(s); }
      // 尾部火花
      if (Math.random() < 0.6) {
        const tail = s.seg[s.seg.length - 1] || s;
        const c = CANDY[s.skin % CANDY.length];
        Juice.spark(tail.x, tail.y, s.heading + Math.PI, 120, c[0], c[1], c[2], 3);
      }
      if (s.mass <= TUNING.minBoostMass) { s.mass = TUNING.minBoostMass; s.boosting = false; }
    } else {
      s.boostDropTimer = 0;
    }

    recompute(s);
    pushTrail(s);
    trimTrail(s);
    rebuildSegments(s);
    if (s.spawnGrace > 0) s.spawnGrace = Math.max(0, s.spawnGrace - dt);
  }

  _buildHash() {
    this.hash.clear();
    this._poolIdx = 0; // bucket 数组从池头开始复用（不新建）
    let count = 0;
    const cell = TUNING.hashCell;
    const pool = this._bucketPool;
    for (let i = 0; i < this.snakes.length; i++) {
      const s = this.snakes[i];
      if (!s.alive) continue;
      const seg = s.seg;
      // 跳过 index 0（头，另行处理头对头）
      for (let j = 1; j < seg.length; j++) {
        if (count >= this.cap) break;
        const p = seg[j];
        this.segX[count] = p.x; this.segY[count] = p.y;
        this.segR[count] = s.r; this.segOwner[count] = s.id;
        const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
        const key = cellKey(cx, cy);
        let b = this.hash.get(key);
        if (!b) {
          b = pool[this._poolIdx] || (pool[this._poolIdx] = []);
          b.length = 0;
          this._poolIdx++;
          this.hash.set(key, b);
        }
        b.push(count);
        count++;
      }
    }
    this.segCount = count;
  }

  _collide() {
    const snakes = this.snakes;
    const deaths = []; // {victim, killer}
    const dead = new Set();

    // 头对头（双亡）
    for (let i = 0; i < snakes.length; i++) {
      const a = snakes[i];
      if (!a.alive || dead.has(a.id)) continue;
      for (let j = i + 1; j < snakes.length; j++) {
        const b = snakes[j];
        if (!b.alive || dead.has(b.id)) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < a.r + b.r) {
          if (a.spawnGrace <= 0 && b.spawnGrace <= 0) {
            dead.add(a.id); dead.add(b.id);
            deaths.push({ victim: a, killer: null });
            deaths.push({ victim: b, killer: null });
          }
        }
      }
    }

    // 出界
    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i];
      if (!s.alive || dead.has(s.id)) continue;
      if (Math.hypot(s.x, s.y) > this.worldR) {
        dead.add(s.id);
        deaths.push({ victim: s, killer: null });
      }
    }

    // 头 vs 外蛇身体
    const cell = TUNING.hashCell;
    const maxR = 30;
    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i];
      if (!s.alive || dead.has(s.id) || s.spawnGrace > 0) continue;
      const qr = s.r + maxR;
      const minCx = Math.floor((s.x - qr) / cell), maxCx = Math.floor((s.x + qr) / cell);
      const minCy = Math.floor((s.y - qr) / cell), maxCy = Math.floor((s.y + qr) / cell);
      let hitOwner = -1;
      outer:
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const b = this.hash.get(cellKey(cx, cy));
          if (!b) continue;
          for (let k = 0; k < b.length; k++) {
            const idx = b[k];
            if (this.segOwner[idx] === s.id) continue;
            const dx = this.segX[idx] - s.x, dy = this.segY[idx] - s.y;
            const rr = s.r + this.segR[idx] + TUNING.collideMargin;
            if (dx * dx + dy * dy < rr * rr) { hitOwner = this.segOwner[idx]; break outer; }
          }
        }
      }
      if (hitOwner >= 0) {
        dead.add(s.id);
        let killer = null;
        for (let m = 0; m < snakes.length; m++) if (snakes[m].id === hitOwner) { killer = snakes[m]; break; }
        deaths.push({ victim: s, killer });
      }
    }

    for (let i = 0; i < deaths.length; i++) this._kill(deaths[i].victim, deaths[i].killer);
  }

  _kill(victim, killer) {
    if (!victim.alive) return;
    victim.alive = false;

    // 遗珠 + 粒子
    this._dropPearls(victim);
    const ci = victim.skin % CANDY.length;
    const c = CANDY[ci];
    const nb = Math.min(30, 8 + Math.floor(victim.mass / 30));
    for (let i = 0; i < nb; i++) {
      const sp = victim.seg[(Math.random() * victim.seg.length) | 0] || victim;
      Juice.burst(sp.x, sp.y, 3, c[0], c[1], c[2], 120 + victim.mass * 0.2);
    }

    // 屏震（按体型 + 距玩家远近）
    const p = this.player;
    const dtoP = Math.hypot(victim.x - p.x, victim.y - p.y);
    const near = clamp(1 - dtoP / 900, 0, 1);
    const mag = clamp(4 + victim.r * 0.6, 4, 24) * near;
    if (mag > 0.5) Juice.shake(mag);

    // 音效
    if (near > 0.05 || victim.isPlayer || (killer && killer.isPlayer)) Audio.kill();

    // 击杀归属
    if (killer && killer.alive) {
      killer.kills++;
      killer.mass += Math.min(30, victim.mass * 0.12);
      recompute(killer);
      if (killer.isPlayer) {
        this.killToasts.unshift({ text: I18N.t('feed.kill', { name: victim.name }), life: 2.6 });
        if (this.killToasts.length > 4) this.killToasts.length = 4;
        Juice.text(p.x, p.y - p.r - 30, I18N.t('feed.plusKill'), '#ffd166', 22);
        this._registerStreak();
      }
    }

    if (victim.isPlayer) {
      this._playerDied();
    } else {
      // bot 2–4s 后重生
      this.respawnTimers.push(rand(2, 4));
    }
  }

  // 连杀登记（玩家击杀时调用）
  _registerStreak() {
    this.killStreak++;
    this.killStreakTimer = STREAK_WINDOW;
    const lvl = this.killStreak;
    if (lvl >= 2) {
      const key = lvl >= 4 ? 4 : lvl; // 4+ = 超神
      const bonus = STREAK_BONUS[key] || 0;
      this.streakBonus += bonus;
      const p = this.player;
      const streakText = I18N.t('streak.' + key);
      Juice.text(p.x, p.y - p.r - 60, streakText, '#ff5ecb', 34);
      Audio.milestone();
      this.streakPops.push({ text: streakText, level: key });
      if (this.streakPops.length > 3) this.streakPops.shift();
    }
  }

  consumeStreak() {
    return this.streakPops.length ? this.streakPops.shift() : null;
  }

  _playerDied() {
    Audio.death();
    Audio.boostOff();
    const p = this.player;
    const len = Math.floor(p.mass);
    const best = Storage.getBest();
    const newBest = len > best;
    if (newBest) Storage.setBest(len);
    Storage.addKills(p.kills);
    Storage.addGame();
    Juice.shake(20);
    const bestRank = this.bestRank === 999 ? this.rank : this.bestRank;
    this.stats = {
      length: len,
      kills: p.kills,
      bestRank,
      best: Math.max(best, len),
      newBest,
      top3: bestRank <= 3,                 // snake 名次定义：最高名次 ≤3 视为 top3
      totalPlayers: this.botCount + 1,
      bonusCoins: this.streakBonus,        // 连杀奖励金币（计入本局金币）
    };
    this.state = 'dead';
  }

  _updateRank() {
    const p = this.player;
    if (!p.alive) return;
    let rank = 1;
    for (let i = 0; i < this.snakes.length; i++) {
      const s = this.snakes[i];
      if (s.alive && s !== p && s.mass > p.mass) rank++;
    }
    this.rank = rank;
    if (rank < this.bestRank) this.bestRank = rank;
  }

  _checkMilestone() {
    const len = Math.floor(this.player.mass);
    while (this.milestoneIdx < MILESTONES.length && len >= MILESTONES[this.milestoneIdx]) {
      const m = MILESTONES[this.milestoneIdx];
      this.milestoneIdx++;
      Audio.milestone();
      const best = Storage.getBest();
      const msg = len > best ? I18N.t('milestone.newRecord') : I18N.t('milestone.passed', { n: m });
      Juice.text(this.player.x, this.player.y - this.player.r - 46, msg, '#ffe08a', 30);
      this._pendingConfetti = true;
    }
  }

  _foodUpdate(dt) {
    const food = this.food;
    const snakes = this.snakes;
    for (let i = 0; i < food.length; i++) {
      const f = food[i];
      if (!f.active) continue;

      // 寿命（boost 豆 / 遗珠）
      if (f.kind === 'pearl') {
        f.life += dt;
        if (f.life >= 15) { f.active = false; continue; }
      } else if (f.life > 0 && f.kind === 'small' && !f.baseline) {
        f.life += dt;
        if (f.life >= 20) { f.active = false; continue; }
      }

      // 找最近蛇头
      let nearest = null, nd = 1e9;
      for (let j = 0; j < snakes.length; j++) {
        const s = snakes[j];
        if (!s.alive) continue;
        const dx = s.x - f.x, dy = s.y - f.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nd) { nd = d2; nearest = s; }
      }
      const nDist = Math.sqrt(nd);

      // 星蝶逃逸
      if (f.kind === 'butterfly') {
        f.wing += dt * 14;
        if (nearest && nDist < 140) {
          const ax = f.x - nearest.x, ay = f.y - nearest.y;
          const inv = 1 / (Math.hypot(ax, ay) || 1);
          f.vx = ax * inv * 200; f.vy = ay * inv * 200;
        } else {
          // 缓慢漂移
          f.vx += rand(-30, 30) * dt;
          f.vy += rand(-30, 30) * dt;
          const sp = Math.hypot(f.vx, f.vy);
          if (sp > 60) { f.vx *= 60 / sp; f.vy *= 60 / sp; }
        }
        f.x += f.vx * dt; f.y += f.vy * dt;
        // 撞边界反弹
        const dc = Math.hypot(f.x, f.y);
        if (dc > this.worldR - 30) {
          const nx = f.x / dc, ny = f.y / dc;
          f.x = nx * (this.worldR - 30); f.y = ny * (this.worldR - 30);
          f.vx = -f.vx * 0.6; f.vy = -f.vy * 0.6;
        }
      }

      // 磁吸
      if (nearest) {
        const range = nearest.r * TUNING.eatMagnet;
        if (nDist < range) {
          const dx = nearest.x - f.x, dy = nearest.y - f.y;
          const inv = 1 / (nDist || 1);
          const pull = f.kind === 'butterfly' ? 200 : 240;
          f.vx = dx * inv * pull; f.vy = dy * inv * pull;
          f.x += f.vx * dt; f.y += f.vy * dt;
          // 吃到
          if (nDist < nearest.r + f.r) {
            this._eat(nearest, f);
            f.active = false;
            continue;
          }
        } else if (f.kind !== 'butterfly') {
          // 小豆的微弱漂移衰减
          if (f.vx || f.vy) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9; }
        }
      }
    }

    // 设置玩家张嘴（附近食物）
    const pl = this.player;
    if (pl.alive) {
      pl.mouthOpen = false;
      for (let i = 0; i < food.length; i++) {
        const f = food[i];
        if (!f.active) continue;
        const dx = f.x - pl.x, dy = f.y - pl.y;
        if (dx * dx + dy * dy < 60 * 60) { pl.mouthOpen = true; break; }
      }
    }
  }

  _eat(s, f) {
    s.mass += f.value;
    recompute(s);
    const c = CANDY[f.ci];
    if (s.isPlayer) {
      s.combo++;
      s.comboTimer = 0.8;
      if (f.kind === 'butterfly') Audio.butterfly();
      else if (f.kind === 'orb' || f.kind === 'pearl') Audio.bigOrb();
      else Audio.eat(s.combo);
      Juice.burst(f.x, f.y, f.kind === 'small' ? 3 : 6, c[0], c[1], c[2], 90);
      if (f.value >= 15) Juice.text(f.x, f.y, '+' + Math.round(f.value), '#fff', 18);
    } else {
      Juice.burst(f.x, f.y, 2, c[0], c[1], c[2], 60);
    }
  }

  // 排行榜前 10
  leaderboard() {
    const arr = [];
    for (let i = 0; i < this.snakes.length; i++) {
      const s = this.snakes[i];
      if (s.alive) arr.push(s);
    }
    arr.sort((a, b) => b.mass - a.mass);
    return arr.slice(0, 10);
  }

  consumeConfetti() {
    if (this._pendingConfetti) { this._pendingConfetti = false; return true; }
    return false;
  }
}
