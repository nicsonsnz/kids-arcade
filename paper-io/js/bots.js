// bots.js — Bot AI：性格 + FSM（FLEE>DEFEND>RETURN>RAID>EXPAND）。20Hz 决策。
const TAU = Math.PI * 2;
const CELL = 8;
const GRID_N = 400;

function nrand() { return (Math.random() + Math.random() + Math.random()) / 3; } // ~正态 0..1
function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function normAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

export const Bots = {
  makeBrain() {
    const skill = clamp01(nrand());
    return {
      aggression: clamp01(nrand()),
      caution: clamp01(nrand()),
      skill,
      state: 'EXPAND',
      plan: [],
      planIndex: 0,
      reactionDelay: 0.1 + (1 - skill) * 0.3,
      reactTimer: 0,
      exposeTime: 0,
      lastThreatDist: 99999,
      enemies: [],
      _cen: { x: 0, y: 0 },
    };
  },

  refreshPerceived(e, game) {
    const ai = e.ai;
    ai.enemies.length = 0;
    for (let id = 1; id <= 8; id++) {
      if (id === e.id) continue;
      const o = game.entities[id];
      if (!o || !o.alive || o.dead) continue;
      ai.enemies.push({ id, x: o.x, y: o.y, trailActive: o.trailActive, inTerritory: o.inTerritory, cx: 0, cy: 0, ent: o });
    }
  },

  nearestThreat(e, game) {
    const ai = e.ai;
    let best = 99999;
    const pts = e.trailPoints;
    for (let k = 0; k < ai.enemies.length; k++) {
      const en = ai.enemies[k];
      // 到头部
      let d = Math.hypot(en.x - e.x, en.y - e.y);
      if (d < best) best = d;
      // 到轨迹（采样）
      if (e.trailActive && pts.length) {
        const stepN = Math.max(1, (pts.length / 12) | 0);
        for (let p = 0; p < pts.length; p += stepN) {
          const dd = Math.hypot(en.x - pts[p].x, en.y - pts[p].y);
          if (dd < best) best = dd;
        }
      }
    }
    const approaching = best <= ai.lastThreatDist + 4;
    ai.lastThreatDist = best;
    return { dist: best, approaching };
  },

  // §5 DEFEND：敌头/敌轨迹进入自己领地边缘 12 格（96u）内 → 冲向其“轨迹格”截断。
  // 返回一个截击点 {x,y}（敌方最近轨迹点，无轨迹时退化为敌头），无威胁返回 null。
  defendTarget(e, game) {
    const ai = e.ai;
    const cen = ai._cen;
    // 用领地等效半径近似“到领地边缘”的距离：edge ≈ 中心距 - 半径。
    const terrR = Math.sqrt(Math.max(1, game.counts[e.id]) / Math.PI) * CELL;
    const range = terrR + 96; // 边缘外 12 格
    let bestD = range, target = null;
    for (let k = 0; k < ai.enemies.length; k++) {
      const en = ai.enemies[k];
      if (!en.trailActive) continue;
      const pts = en.ent.trailPoints;
      if (pts && pts.length) {
        const stepN = Math.max(1, (pts.length / 10) | 0);
        for (let p = 0; p < pts.length; p += stepN) {
          const d = Math.hypot(pts[p].x - cen.x, pts[p].y - cen.y);
          if (d < bestD) { bestD = d; target = pts[p]; }
        }
      } else {
        const d = Math.hypot(en.x - cen.x, en.y - cen.y);
        if (d < bestD) { bestD = d; target = { x: en.x, y: en.y }; }
      }
    }
    return target;
  },

  // §5 RAID：aggression 高且邻近敌方领地（袭击范围内）→ 返回最近敌方领地质心。
  raidTarget(e, game) {
    let bd = 1e9, target = null;
    for (let id = 1; id <= 8; id++) {
      if (id === e.id) continue;
      const o = game.entities[id];
      if (!o || !o.alive || game.counts[id] <= 0) continue;
      const c = { x: 0, y: 0 };
      game.centroid(id, c);
      const d = Math.hypot(c.x - e.x, c.y - e.y);
      if (d < bd) { bd = d; target = c; }
    }
    return (target && bd < 480) ? target : null; // ~60 格内才偷地
  },

  // RAID 计划：朝敌方领地浅切一刀再垂向拉回（后续 plan 耗尽自动 RETURN 回家）。
  planRaid(e, game, target) {
    const ai = e.ai;
    const world = 3200;
    const dir = Math.atan2(target.y - e.y, target.x - e.x) + (Math.random() - 0.5) * 0.4;
    const depth = (10 + ai.aggression * 14) * CELL; // 浅切
    const width = (6 + Math.random() * 8) * CELL;
    const cosD = Math.cos(dir), sinD = Math.sin(dir);
    const perp = dir + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    const w1x = e.x + cosD * depth, w1y = e.y + sinD * depth;
    const w2x = w1x + Math.cos(perp) * width, w2y = w1y + Math.sin(perp) * width;
    // 第三点：平行折返，形成完整矩形回路，避免回家直线横穿出程轨迹
    const w3x = w2x - cosD * depth, w3y = w2y - sinD * depth;
    const m = 20;
    const cl = (v) => v < m ? m : (v > world - m ? world - m : v);
    ai.plan = [{ x: cl(w1x), y: cl(w1y) }, { x: cl(w2x), y: cl(w2y) }, { x: cl(w3x), y: cl(w3y) }];
    ai.planIndex = 0;
  },

  planExcursion(e, game) {
    const ai = e.ai;
    const world = 3200;
    const depthCells = 8 + (1 - ai.caution) * 32 + ai.aggression * 8;
    const depth = depthCells * CELL;
    const widthCells = 6 + (1 - ai.caution) * 18;
    const width = widthCells * CELL;

    // 出圈方向：默认延续当前朝向，避免掉头
    let dir = e.angle + (Math.random() - 0.5) * 1.2;
    // 高侵略性偏向最近敌方领地（RAID）
    if (ai.aggression > 0.5 && Math.random() < ai.aggression) {
      let bx = 0, by = 0, bd = 1e9;
      for (let id = 1; id <= 8; id++) {
        if (id === e.id) continue;
        const o = game.entities[id];
        if (!o || !o.alive || game.counts[id] <= 0) continue;
        const c = { x: 0, y: 0 };
        game.centroid(id, c);
        const d = Math.hypot(c.x - e.x, c.y - e.y);
        if (d < bd) { bd = d; bx = c.x; by = c.y; }
      }
      if (bd < 1e9) dir = Math.atan2(by - e.y, bx - e.x) + (Math.random() - 0.5) * 0.5;
    }

    const cosD = Math.cos(dir), sinD = Math.sin(dir);
    const turnSign = Math.random() < 0.5 ? 1 : -1;
    const perp = dir + turnSign * Math.PI / 2;

    let w1x = e.x + cosD * depth;
    let w1y = e.y + sinD * depth;
    let w2x = w1x + Math.cos(perp) * width;
    let w2y = w1y + Math.sin(perp) * width;
    // 第三点：平行折返构成矩形，回家不横穿出程轨迹
    let w3x = w2x - cosD * depth;
    let w3y = w2y - sinD * depth;

    const m = 20;
    const cl = (v) => v < m ? m : (v > world - m ? world - m : v);
    ai.plan = [
      { x: cl(w1x), y: cl(w1y) },
      { x: cl(w2x), y: cl(w2y) },
      { x: cl(w3x), y: cl(w3y) },
    ];
    ai.planIndex = 0;
  },

  steerTo(e, tx, ty, game) {
    const ai = e.ai;
    const noise = (1 - ai.skill) * 0.3 * (Math.random() - 0.5);
    e.targetAngle = normAngle(Math.atan2(ty - e.y, tx - e.x) + noise);
    if (game) this.avoidOwnTrail(e, game);
  },

  // 前瞻射线：ang 方向 16..88u 内是否压到自己的旧轨迹格
  rayHitsOwnTrail(e, game, ang) {
    const to = game.trailOwner, ts = game.trailStep;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    for (let d = 16; d <= 88; d += 8) {
      const cx = ((e.x + cos * d) / CELL) | 0;
      const cy = ((e.y + sin * d) / CELL) | 0;
      if (cx < 0 || cy < 0 || cx >= GRID_N || cy >= GRID_N) continue;
      const ix = cy * GRID_N + cx;
      if (to[ix] === e.id && (e.stepCounter - ts[ix]) > 6) return true;
    }
    return false;
  },

  // 目标航向撞自己轨迹时，左右找空隙偏转（找不到就保持原向，认命）
  avoidOwnTrail(e, game) {
    if (!e.trailActive) return;
    if (!this.rayHitsOwnTrail(e, game, e.targetAngle)) return;
    const offs = [0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1];
    for (let i = 0; i < offs.length; i++) {
      const a = normAngle(e.targetAngle + offs[i]);
      if (!this.rayHitsOwnTrail(e, game, a)) { e.targetAngle = a; return; }
    }
  },

  decide(e, game, dt) {
    const ai = e.ai;
    if (!ai) return;
    ai.reactTimer += dt;
    if (ai.reactTimer >= ai.reactionDelay || ai.enemies.length === 0) {
      ai.reactTimer = 0;
      this.refreshPerceived(e, game);
    }
    const cen = ai._cen;
    game.centroid(e.id, cen);

    ai.exposeTime = e.trailActive ? ai.exposeTime + dt : 0;

    // 低技能偶尔犯错：晚一拍反应
    const mistake = Math.random() > (0.55 + ai.skill * 0.45);

    // FLEE（最高优先）
    if (e.trailActive) {
      const threat = this.nearestThreat(e, game);
      const dangerDist = 55 + ai.caution * 95;
      if (threat.dist < dangerDist && threat.approaching && !mistake) {
        ai.state = 'FLEE';
        this.steerTo(e, cen.x, cen.y, game);
        return;
      }
    }

    // DEFEND（优先级高于 RETURN，对齐 §5：FLEE > DEFEND > RETURN > RAID > EXPAND）
    if (ai.aggression > 0.55 && !mistake) {
      const tgt = this.defendTarget(e, game);
      if (tgt) {
        ai.state = 'DEFEND';
        this.steerTo(e, tgt.x, tgt.y, game);
        return;
      }
    }

    // 暴露过久 -> RETURN
    const tol = 1.5 + (1 - ai.caution) * 3.0;
    if (e.trailActive && ai.exposeTime > tol) {
      ai.state = 'RETURN';
      this.steerTo(e, cen.x, cen.y, game);
      return;
    }

    // 在领地内且无轨迹 -> 规划新出行（RAID 优先于普通 EXPAND）
    if (e.inTerritory && !e.trailActive) {
      const raid = (ai.aggression > 0.55 && !mistake) ? this.raidTarget(e, game) : null;
      if (raid) {
        this.planRaid(e, game, raid);
        ai.state = 'RAID';
      } else {
        this.planExcursion(e, game);
        ai.state = 'EXPAND';
      }
    }

    if (ai.state === 'EXPAND' || ai.state === 'RAID') {
      let wp = ai.plan[ai.planIndex];
      if (!wp) { ai.state = 'RETURN'; this.steerTo(e, cen.x, cen.y, game); return; }
      const dx = wp.x - e.x, dy = wp.y - e.y;
      if (dx * dx + dy * dy < 26 * 26) { ai.planIndex++; }
      wp = ai.plan[ai.planIndex];
      if (!wp) { ai.state = 'RETURN'; this.steerTo(e, cen.x, cen.y, game); return; }
      this.steerTo(e, wp.x, wp.y, game);
      return;
    }

    // RETURN 默认
    this.steerTo(e, cen.x, cen.y, game);
  },
};
