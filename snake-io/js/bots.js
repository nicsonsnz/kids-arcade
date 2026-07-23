// bots.js — AI 蛇：性格向量 + FSM（AVOID > FLEE > HUNT > COIL > SEEK_FOOD > WANDER）
import { TUNING, TAU, clamp, angDiff, rand, randInt, cellKey, SKINS } from './game.js';
import { I18N } from './i18n.js';

// 原创可爱名字池（英文兜底，≥24）。实际展示池按当前语言取自 i18n（en/zh）。
export const BOT_NAMES = [
  'Noodle', 'Rainbow', 'Comet', 'Gummy', 'Marshmallow', 'Sprinkles', 'Jellybean', 'Bubbles',
  'Stardust', 'Pudding', 'Cotton', 'Melon', 'PopRock', 'Mango', 'Cookie', 'Minty',
  'Poppy', 'Cheddar', 'BerryBear', 'LemonPie', 'Cocoa', 'Frosting', 'DotFish', 'Cloudy',
  'Choco', 'Blueberry', 'Caramel', 'Tangelo',
];

let nameCursor = (Math.random() * BOT_NAMES.length) | 0;
let skinCursor = 0;

function pickName() {
  // 按当前语言取名字池；名字在出生时固定，本局内保持（切换语言不会改已生成的 bot 名）。
  const pool = I18N.botNames();
  const list = (pool && pool.length) ? pool : BOT_NAMES;
  const n = list[nameCursor % list.length];
  nameCursor++;
  return n;
}

// bot 可用皮肤索引（排除生日限定）。懒初始化，避免与 game.js 的循环 import 造成 TDZ。
let _botSkins = null;
function botSkins() {
  if (!_botSkins) {
    _botSkins = [];
    for (let i = 0; i < SKINS.length; i++) if (!SKINS[i].birthdayOnly) _botSkins.push(i);
    if (_botSkins.length === 0) _botSkins = [0];
  }
  return _botSkins;
}

export function spawnBotConfig() {
  // 大小分布偏小；10% 概率大蛇
  let mass;
  if (Math.random() < 0.1) mass = rand(300, 700);
  else mass = rand(8, 120);
  const list = botSkins();
  const skin = list[skinCursor % list.length];
  skinCursor++;
  const ai = {
    aggression: Math.random(),
    caution: rand(0.3, 1),
    greed: rand(0.4, 1),
    boostiness: Math.random(),
    skill: rand(0.35, 1),
    state: 'WANDER',
    stateTimer: 0,
    reactionTimer: 0,
    coilTimer: 0,
    coilDir: Math.random() < 0.5 ? 1 : -1,
    wanderX: 0,
    wanderY: 0,
    wanderTimer: 0,
    threatX: 0, threatY: 0, threatMass: 0, threatValid: false,
  };
  return { name: pickName(), skin, mass, ai };
}

// 沿方向探测净空（撞墙或外蛇身体前的距离）
function rayClear(game, s, ang, maxDist) {
  const cell = TUNING.hashCell;
  const step = Math.max(30, s.r * 2);
  const cos = Math.cos(ang), sin = Math.sin(ang);
  let dist = step;
  while (dist <= maxDist) {
    const x = s.x + cos * dist, y = s.y + sin * dist;
    if (Math.hypot(x, y) > game.worldR - 6) return dist - step;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const b = game.hash.get(cellKey(gx, gy));
        if (!b) continue;
        for (let k = 0; k < b.length; k++) {
          const idx = b[k];
          if (game.segOwner[idx] === s.id) continue;
          const dx = game.segX[idx] - x, dy = game.segY[idx] - y;
          const rr = s.r + game.segR[idx] + 8;
          if (dx * dx + dy * dy < rr * rr) return dist - step;
        }
      }
    }
    dist += step;
  }
  return maxDist;
}

function bestOpenHeading(game, s, biasAng, maxDist) {
  // 在若干候选方向里选净空最大的（偏向 biasAng）
  let bestAng = biasAng, bestScore = -1;
  const offsets = [0, 0.4, -0.4, 0.9, -0.9, 1.5, -1.5, 2.4, -2.4, Math.PI];
  for (let i = 0; i < offsets.length; i++) {
    const ang = biasAng + offsets[i];
    const clr = rayClear(game, s, ang, maxDist);
    // 偏好接近 bias 的方向
    const score = clr - Math.abs(offsets[i]) * 12;
    if (score > bestScore) { bestScore = score; bestAng = ang; }
  }
  return bestAng;
}

function setState(ai, st) {
  if (ai.state !== st) { ai.state = st; ai.stateTimer = 0; if (st === 'COIL') ai.coilTimer = 0; }
}

export function botThink(s, game, dt) {
  const ai = s.ai;
  ai.stateTimer += dt;
  ai.reactionTimer -= dt;
  ai.wanderTimer -= dt;
  if (ai.state === 'COIL') ai.coilTimer += dt;

  s.boosting = false;
  const snakes = game.snakes;

  // 反应快照刷新（0.1–0.35s）
  if (ai.reactionTimer <= 0) {
    ai.reactionTimer = rand(0.1, 0.35);
    // 找最近“更大蛇头”威胁与最近猎物
    let threat = null, td = 1e9;
    let prey = null, pd = 1e9;
    for (let i = 0; i < snakes.length; i++) {
      const o = snakes[i];
      if (!o.alive || o === s) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (o.mass > s.mass * 1.05 && d < td) { td = d; threat = o; }
      if (s.mass > o.mass * 1.3 && d < pd) { pd = d; prey = o; }
    }
    if (threat) { ai.threatX = threat.x; ai.threatY = threat.y; ai.threatMass = threat.mass; ai.threatValid = true; ai.threatDist = td; }
    else ai.threatValid = false;
    ai.prey = prey; ai.preyDist = pd;
  }

  const lookahead = s.r * 6 + 120;
  const forwardClr = rayClear(game, s, s.heading, lookahead);

  const canSwitch = ai.stateTimer >= 0.5;
  // 低概率漏看威胁
  const seesThreat = Math.random() < (0.55 + 0.45 * ai.skill);

  // 距墙
  const distCenter = Math.hypot(s.x, s.y);
  const wallDanger = distCenter > game.worldR - (lookahead * (0.5 + ai.caution * 0.5));
  const headingOut = (s.x * Math.cos(s.heading) + s.y * Math.sin(s.heading)) > 0;

  let desired = s.heading;
  let chosen = ai.state;

  // === 优先级判定 ===
  const avoidNeeded = (forwardClr < lookahead * 0.6) || (wallDanger && headingOut);
  const threatNear = ai.threatValid && seesThreat &&
    ai.threatDist < (s.r + 60) + lookahead * (0.5 + ai.caution * 0.5);

  if (avoidNeeded) {
    chosen = 'AVOID';
    if (wallDanger && headingOut) {
      // 转向圆心方向的开阔角
      const toCenter = Math.atan2(-s.y, -s.x);
      desired = bestOpenHeading(game, s, toCenter, lookahead);
    } else {
      desired = bestOpenHeading(game, s, s.heading, lookahead);
    }
    if (ai.boostiness > 0.7 && s.mass > TUNING.minBoostMass && forwardClr > lookahead * 0.3) s.boosting = true;
  } else if (threatNear) {
    chosen = 'FLEE';
    const away = Math.atan2(s.y - ai.threatY, s.x - ai.threatX);
    desired = bestOpenHeading(game, s, away, lookahead);
    if (ai.boostiness > 0.5 && s.mass > TUNING.minBoostMass) s.boosting = true;
  } else if (ai.prey && s.mass >= ai.prey.mass * 1.3 && ai.preyDist < 420 && ai.aggression > 0.4) {
    // HUNT（优先于 COIL，符合 §5 AVOID>FLEE>HUNT>COIL 顺序）
    chosen = 'HUNT';
    const target = ai.prey;
    // 预测目标前方位置切入拦截
    const lead = ai.preyDist / TUNING.baseSpeed * (0.4 + ai.skill);
    const skillErr = (1 - ai.skill) * rand(-0.6, 0.6);
    const px = target.x + Math.cos(target.heading) * TUNING.baseSpeed * lead;
    const py = target.y + Math.sin(target.heading) * TUNING.baseSpeed * lead;
    desired = Math.atan2(py - s.y, px - s.x) + skillErr;
    if (ai.boostiness > 0.6 && s.mass > TUNING.minBoostMass && ai.preyDist < 260) s.boosting = true;
  } else if (ai.prey && ai.preyDist < 260 && ai.prey.mass <= s.mass * 0.4) {
    // COIL：围猎小蛇（HUNT 未触发时，如 aggression 低的谨慎型个体绕圈收紧）
    if (canSwitch || ai.state === 'COIL') chosen = 'COIL';
    else chosen = ai.state;
    if (chosen === 'COIL') {
      const toPrey = Math.atan2(ai.prey.y - s.y, ai.prey.x - s.x);
      desired = toPrey + ai.coilDir * (0.9 + 0.4 * clamp(120 / (ai.preyDist + 1), 0, 1));
      if (ai.coilTimer > rand(6, 10)) { setState(ai, 'WANDER'); }
    }
  } else {
    // SEEK_FOOD
    const foodDir = seekFood(game, s, ai);
    if (foodDir !== null) {
      chosen = 'SEEK_FOOD';
      desired = foodDir;
    } else {
      chosen = 'WANDER';
      if (ai.wanderTimer <= 0 || (ai.wanderX === 0 && ai.wanderY === 0)) {
        ai.wanderTimer = rand(2, 4);
        const a = Math.random() * TAU;
        const rr = game.worldR * 0.7 * Math.sqrt(Math.random());
        ai.wanderX = Math.cos(a) * rr; ai.wanderY = Math.sin(a) * rr;
      }
      desired = Math.atan2(ai.wanderY - s.y, ai.wanderX - s.x) + Math.sin(game.time * 0.7 + s.id) * 0.25;
    }
  }

  // 迟滞：切换需 ≥0.5s（AVOID/FLEE 例外，紧急）
  if (chosen !== ai.state) {
    if (chosen === 'AVOID' || chosen === 'FLEE' || canSwitch) setState(ai, chosen);
  }

  s.targetHeading = desired;
}

function seekFood(game, s, ai) {
  const radius = 260 + ai.greed * 340;
  const food = game.food;
  let sx = 0, sy = 0, w = 0;
  const r2 = radius * radius;
  for (let i = 0; i < food.length; i++) {
    const f = food[i];
    if (!f.active) continue;
    if (f.kind === 'butterfly' && ai.boostiness < 0.6) continue;
    const dx = f.x - s.x, dy = f.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    let weight = f.value;
    if (f.kind === 'pearl') weight *= 3;
    if (f.kind === 'orb') weight *= 1.5;
    // 近的权重更高
    weight *= 1 / (1 + d2 / 40000);
    sx += f.x * weight; sy += f.y * weight; w += weight;
  }
  if (w <= 0) return null;
  const cx = sx / w, cy = sy / w;
  return Math.atan2(cy - s.y, cx - s.x);
}
