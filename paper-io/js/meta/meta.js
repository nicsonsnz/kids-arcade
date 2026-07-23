// meta.js — 存档 schema（v1，抗损坏）+ 迁移 + 纯函数经济引擎 + Meta 门面。
// main.js / game.js 只通过 Meta 门面交互，绝不直接碰 localStorage。
// 儿童安全铁律（SPEC §0）：只增不减、无 FOMO、慷慨保底、皮肤纯装饰。
import {
  RARITY, SKIN_CATALOG, DEFAULT_SKIN, LEGACY_UNLOCK, RANKS, CHESTS,
  CHEST_EXTRA_COINS, ECONOMY, DAILY_COOLDOWN_MS, DAILY_PERF, RUBBER_BAND, BIRTHDAY,
} from './meta-config.js';
import { I18N } from '../i18n.js';

const PREFIX = 'quanland.';
const META_KEY = PREFIX + 'meta';
const SCHEMA_V = 1;

// 皮肤 id 快速查表
const SKIN_BY_ID = new Map(SKIN_CATALOG.map((s) => [s.id, s]));

// ============================================================
// 纯函数经济引擎（注入 RNG，可单测）
// ============================================================

// mulberry32：确定性种子 RNG（生产用时间种子，测试用固定种子）。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  if (max < min) { const t = min; min = max; max = t; }
  return min + Math.floor(rng() * (max - min + 1));
}

// 每局金币（paper 公式，SPEC §3.1）：10 + round(pct*8) + kills*25 + (won?100:0)，上限 500。
export function computeMatchCoins({ pct = 0, kills = 0, won = false }) {
  let c = ECONOMY.coinsBase
    + Math.round(Math.max(0, pct) * ECONOMY.coinsPerPct)
    + Math.max(0, kills | 0) * ECONOMY.coinsPerKill
    + (won ? ECONOMY.coinsWinBonus : 0);
  if (c < 0) c = 0;
  if (c > ECONOMY.coinsCap) c = ECONOMY.coinsCap;
  return c;
}

// 表现分 perf ∈ [0,1]：用同一套金币因子归一，喂给宝箱档位权重（SPEC §3.3）。
export function computePerf({ pct = 0, kills = 0, won = false }) {
  const raw = Math.round(Math.max(0, pct) * ECONOMY.coinsPerPct)
    + Math.max(0, kills | 0) * ECONOMY.coinsPerKill
    + (won ? 200 : 0);
  let p = raw / 420;
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  return p;
}

// 段位星按名次（只增，SPEC §3.2）
export function trophyDelta(rank, total) {
  if (rank <= 1) return ECONOMY.trophyFirst;
  if (rank === 2) return ECONOMY.trophySecond;
  if (rank === 3) return ECONOMY.trophyThird;
  const half = Math.ceil(Math.max(1, total) / 2);
  if (rank <= half) return ECONOMY.trophyHalf;
  return ECONOMY.trophyRest;
}

// 宝箱档位加权（perf 高 → 权重右移，SPEC §3.3）
export function rollChestTier(rng, perf) {
  const p = Math.max(0, Math.min(1, perf));
  const w = {
    wood:    Math.max(1, 60 - p * 45),
    silver:  28 + p * 7,
    gold:    10 + p * 25,
    rainbow: 2 + p * 13,
  };
  const total = w.wood + w.silver + w.gold + w.rainbow;
  let r = rng() * total;
  if ((r -= w.wood) < 0) return 'wood';
  if ((r -= w.silver) < 0) return 'silver';
  if ((r -= w.gold) < 0) return 'gold';
  return 'rainbow';
}

// 从未拥有池按稀有度加权抽一款皮肤 id（保底命中后调用）。
export function rollNewSkin(rng, unownedIds) {
  if (!unownedIds || unownedIds.length === 0) return null;
  let total = 0;
  const weights = unownedIds.map((id) => {
    const sk = SKIN_BY_ID.get(id);
    const wgt = (sk && ECONOMY.rollWeight[sk.rarity]) || 1;
    total += wgt;
    return wgt;
  });
  let r = rng() * total;
  for (let i = 0; i < unownedIds.length; i++) {
    if ((r -= weights[i]) < 0) return unownedIds[i];
  }
  return unownedIds[unownedIds.length - 1];
}

// 段位查询：给定星数返回当前段位 + 进度信息。
export function rankForTrophies(t) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (t >= RANKS[i].min) idx = i;
  const cur = RANKS[idx];
  const next = RANKS[idx + 1] || null;
  const floor = cur.min;
  const ceil = next ? next.min : cur.min;
  const span = ceil - floor;
  const progress = next ? Math.max(0, Math.min(1, (t - floor) / (span || 1))) : 1;
  const toNext = next ? Math.max(0, ceil - t) : 0;
  return { index: idx, key: cur.key, emoji: cur.emoji, name: cur.name, min: cur.min, next, progress, toNext };
}

// ============================================================
// 存档 schema + 抗损坏兜底
// ============================================================

function num(v, fallback, min) {
  if (typeof v !== 'number' || !isFinite(v)) return fallback;
  if (min !== undefined && v < min) return min;
  return v;
}

function defaultSkins() {
  const skins = {};
  for (const s of SKIN_CATALOG) skins[s.id] = { owned: false, isNew: false };
  skins[DEFAULT_SKIN].owned = true; // 默认皮肤永远拥有
  return skins;
}

function defaultState() {
  return {
    v: SCHEMA_V,
    coins: 0,
    lifetimeCoins: 0,
    trophies: 0,
    skins: defaultSkins(),
    selectedSkin: DEFAULT_SKIN,
    pity: { sinceNew: 0 },
    daily: { lastClaimed: 0 },
    best: 0, kills: 0, games: 0,
    birthdaySeenYear: 0,
    lossStreak: 0, winStreak: 0,
  };
}

function readRaw(key) {
  try {
    const v = localStorage.getItem(key);
    if (v === null || v === undefined) return undefined;
    return JSON.parse(v);
  } catch (e) { return undefined; }
}

// 校验 + clamp 任意字段：缺失/类型错/负值 → 兜底，绝不抛错、绝不崩（SPEC §2）。
function sanitize(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  s.coins = num(raw.coins, 0, 0);
  s.lifetimeCoins = Math.max(num(raw.lifetimeCoins, 0, 0), s.coins);
  s.trophies = num(raw.trophies, 0, 0);
  // 皮肤：以目录为准逐个校验，未知 id 丢弃、缺失补默认
  if (raw.skins && typeof raw.skins === 'object') {
    for (const id in s.skins) {
      const r = raw.skins[id];
      if (r && typeof r === 'object') {
        s.skins[id] = { owned: !!r.owned, isNew: !!r.isNew };
      }
    }
  }
  s.skins[DEFAULT_SKIN].owned = true;
  // 选中皮肤必须是已拥有的合法 id
  const sel = raw.selectedSkin;
  s.selectedSkin = (typeof sel === 'string' && s.skins[sel] && s.skins[sel].owned) ? sel : DEFAULT_SKIN;
  s.pity.sinceNew = num(raw.pity && raw.pity.sinceNew, 0, 0);
  s.daily.lastClaimed = num(raw.daily && raw.daily.lastClaimed, 0, 0);
  s.best = num(raw.best, 0, 0);
  s.kills = num(raw.kills, 0, 0);
  s.games = num(raw.games, 0, 0);
  s.birthdaySeenYear = num(raw.birthdaySeenYear, 0, 0);
  s.lossStreak = num(raw.lossStreak, 0, 0);
  s.winStreak = num(raw.winStreak, 0, 0);
  return s;
}

// 首次加载无 .meta 但有旧分散键 → 组装新 schema（best/kills/games/skin 继承 + 按 best 解锁）。
function migrateFromLegacy() {
  const s = defaultState();
  const best = num(readRaw(PREFIX + 'best'), 0, 0);
  s.best = best;
  s.kills = num(readRaw(PREFIX + 'kills'), 0, 0);
  s.games = num(readRaw(PREFIX + 'games'), 0, 0);
  // 旧「按分数解锁」的皮肤标记为 owned
  for (const id in LEGACY_UNLOCK) {
    if (s.skins[id] && best >= LEGACY_UNLOCK[id]) s.skins[id].owned = true;
  }
  // 旧选中皮肤
  const oldSkin = readRaw(PREFIX + 'skin');
  if (typeof oldSkin === 'string' && s.skins[oldSkin] && s.skins[oldSkin].owned) {
    s.selectedSkin = oldSkin;
  }
  return s;
}

// ============================================================
// 门面状态 + 持久化
// ============================================================

let state = defaultState();
let loaded = false;
let matchStreakBonus = 0; // 本局连杀累计奖励金币（结算时并入）
let rngCounter = 0;

function makeRng() {
  // 生产用时间种子（+ 递增计数避免同毫秒多次调用同种子）
  const seed = ((Date.now() >>> 0) ^ ((rngCounter++ * 0x9e3779b1) >>> 0)) >>> 0;
  return mulberry32(seed);
}

function persist() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(state));
  } catch (e) { /* 隐私模式/配额：静默 */ }
}

function load() {
  if (loaded) return;
  loaded = true;
  const rawMeta = readRaw(META_KEY);
  state = rawMeta ? sanitize(rawMeta) : migrateFromLegacy();
  persist();
}

// 未拥有、且可获取（排除生日限定）的皮肤 id 列表
function unownedRollableIds() {
  const out = [];
  for (const sk of SKIN_CATALOG) {
    if (sk.birthday) continue;
    if (!state.skins[sk.id].owned) out.push(sk.id);
  }
  return out;
}

// 授予皮肤（幂等）：拥有则不重复，新拥有标 isNew，重置保底计数。
function grantSkin(id, markNew) {
  const rec = state.skins[id];
  if (!rec || rec.owned) return false;
  rec.owned = true;
  rec.isNew = markNew !== false;
  return true;
}

function todayBirthdayAge() {
  const y = new Date().getFullYear();
  return BIRTHDAY.birthYear ? (y - BIRTHDAY.birthYear) : null;
}

// ============================================================
// Meta 门面
// ============================================================
export const Meta = {
  load,

  // ---- 只读查询 ----
  getCoins() { load(); return state.coins; },
  getLifetimeCoins() { load(); return state.lifetimeCoins; },
  getTrophies() { load(); return state.trophies; },
  getRank() { load(); return rankForTrophies(state.trophies); },
  rankOf(t) { return rankForTrophies(num(t, 0, 0)); },

  // 收藏册数据（含未拥有剪影信息，SPEC §5.2）
  getCollection() {
    load();
    return SKIN_CATALOG.map((sk) => {
      const rec = state.skins[sk.id];
      const rar = RARITY[sk.rarity];
      return {
        id: sk.id, emoji: sk.emoji, name: I18N.skinName(sk.id), rarity: sk.rarity,
        rarityName: I18N.rarityName(sk.rarity), color: rar.color, price: rar.price,
        birthday: !!sk.birthday,
        owned: rec.owned, isNew: rec.isNew,
      };
    });
  },
  collectedCount() { load(); let n = 0; for (const id in state.skins) if (state.skins[id].owned) n++; return n; },
  totalSkins() { return SKIN_CATALOG.length; },

  isOwned(id) { load(); return !!(state.skins[id] && state.skins[id].owned); },
  getSelectedSkinId() { load(); return state.selectedSkin; },
  getSelectedSkinObject() {
    load();
    return SKIN_BY_ID.get(state.selectedSkin) || SKIN_BY_ID.get(DEFAULT_SKIN);
  },
  getSkinById(id) { return SKIN_BY_ID.get(id) || null; },

  // 选皮肤（仅限已拥有）
  selectSkin(id) {
    load();
    if (state.skins[id] && state.skins[id].owned) {
      state.selectedSkin = id;
      persist();
      return true;
    }
    return false;
  },

  // 进收藏册查看后清 NEW 角标（SPEC §5.2）
  clearNew(id) {
    load();
    if (state.skins[id] && state.skins[id].isNew) { state.skins[id].isNew = false; persist(); }
  },
  clearAllNew() {
    load();
    let changed = false;
    for (const id in state.skins) if (state.skins[id].isNew) { state.skins[id].isNew = false; changed = true; }
    if (changed) persist();
  },
  hasAnyNew() { load(); for (const id in state.skins) if (state.skins[id].isNew) return true; return false; },

  // 金币直购皮肤（金币出口，SPEC §3.4）。返回 {ok, reason}。
  buySkin(id) {
    load();
    const sk = SKIN_BY_ID.get(id);
    if (!sk) return { ok: false, reason: 'unknown' };
    if (sk.birthday) return { ok: false, reason: 'birthday' };
    if (state.skins[id].owned) return { ok: false, reason: 'owned' };
    const price = RARITY[sk.rarity].price;
    if (state.coins < price) return { ok: false, reason: 'poor' };
    state.coins -= price;
    grantSkin(id, true);
    persist();
    return { ok: true, price };
  },

  // ---- 连杀（本局累计奖励，SPEC §8）----
  startMatch() { matchStreakBonus = 0; },
  reportKillStreak(level) {
    const bonus = ECONOMY.streakBonus[level] || ECONOMY.streakBonus[4] || 0;
    matchStreakBonus += bonus;
    return bonus;
  },

  // ---- 隐形照顾难度（SPEC §0/§8）----
  getDifficulty() {
    load();
    const l = state.lossStreak;
    let cfg = null;
    if (l >= 5) cfg = RUBBER_BAND.loss5;
    else if (l >= 3) cfg = RUBBER_BAND.loss3;
    else if (l >= 2) cfg = RUBBER_BAND.loss2;
    if (!cfg) return { aggressionMult: 1, botCountDelta: 0, minBots: RUBBER_BAND.minBots };
    return { aggressionMult: cfg.aggressionMult, botCountDelta: cfg.botCountDelta, minBots: RUBBER_BAND.minBots };
  },

  // ---- 赛后结算：算钱 + 段位 + 宝箱（只增，绝不扣，SPEC §3/§5.4）----
  // 入参 {pct,kills,rank,total,won}。返回结算流程所需数据（不含开箱结果，开箱另调 openChest）。
  reportMatch({ pct = 0, kills = 0, rank = 99, total = 8, won = false } = {}) {
    load();
    // 金币
    const base = computeMatchCoins({ pct, kills, won });
    const streak = matchStreakBonus; matchStreakBonus = 0;
    const earned = base + streak;
    const coinFrom = state.coins;
    state.coins += earned;
    state.lifetimeCoins += earned;
    const coinTo = state.coins;

    // 段位星
    const tFrom = state.trophies;
    const tDelta = trophyDelta(rank, total);
    state.trophies += tDelta;
    const tTo = state.trophies;
    const rFrom = rankForTrophies(tFrom);
    const rTo = rankForTrophies(tTo);
    const rankUp = (rTo.index > rFrom.index) ? { from: rFrom, to: rTo } : null;

    // 迁移字段镜像（只增；Storage 仍为 best/kills/games 权威，这里仅保持一致展示）
    if (pct > state.best) state.best = pct;
    state.kills += Math.max(0, kills | 0);
    state.games += 1;

    // 隐形难度：名次第1或胜利视为「赢」（缓回难度）；否则连败+1
    const isWin = won || rank <= 1;
    if (isWin) { state.winStreak += 1; state.lossStreak = 0; }
    else { state.lossStreak += 1; state.winStreak = 0; }

    // 宝箱档位（每局必得 1 个，SPEC §3.3）
    const perf = computePerf({ pct, kills, won });
    const tier = rollChestTier(makeRng(), perf);

    persist();
    return {
      coins: { from: coinFrom, base, streak, earned, to: coinTo },
      trophy: { from: tFrom, delta: tDelta, to: tTo },
      rankUp,
      chest: { tier, source: 'match' },
      perf,
    };
  },

  // ---- 开箱（NEW 皮肤保底，SPEC §0/§3.3）----
  // 入参 {tier}。应用奖励并持久化。返回开箱结果供 UI 演出。
  openChest(descriptor) {
    load();
    const tierKey = (descriptor && descriptor.tier) || 'wood';
    const tier = CHESTS[tierKey] || CHESTS.wood;
    const rng = makeRng();
    const coinAmt = randInt(rng, tier.coinMin, tier.coinMax);

    const unowned = unownedRollableIds();
    let newSkin = null;
    let extraCoins = 0;

    if (unowned.length > 0) {
      const sinceNew = state.pity.sinceNew;
      const forced = (sinceNew + 1) >= ECONOMY.hardPity;                 // 硬保底：第 5 箱必出
      const softP = Math.min(1, ECONOMY.softPityStart + ECONOMY.softPityStep * sinceNew); // 软保底
      const hit = forced || rng() < softP;
      if (hit) {
        const id = rollNewSkin(rng, unowned);
        if (id && grantSkin(id, true)) {
          newSkin = SKIN_BY_ID.get(id);
          state.pity.sinceNew = 0;
        }
      }
      if (!newSkin) {
        state.pity.sinceNew += 1;
        extraCoins = CHEST_EXTRA_COINS[tierKey] || 0; // 折算额外金币（绝不「已拥有」的沮丧）
      }
    }
    // 全部集齐：保底自动失效，只给金币（永不卡死）

    const totalCoins = coinAmt + extraCoins;
    const from = state.coins;
    state.coins += totalCoins;
    state.lifetimeCoins += totalCoins;
    const to = state.coins;
    persist();

    return {
      tier: tierKey, tierName: tier.name, tierEmoji: tier.emoji, tierColor: tier.color,
      coinAmt, extraCoins, totalCoins, from, to,
      newSkin: newSkin ? { id: newSkin.id, emoji: newSkin.emoji, name: newSkin.name, rarity: newSkin.rarity } : null,
    };
  },

  // ---- 每日礼物（纯惊喜，零愧疚，SPEC §3.5）----
  isDailyReady() {
    load();
    const now = Date.now();
    const last = state.daily.lastClaimed;
    if (now < last) return false; // 时钟被调回：视为未就绪，不发放、不崩
    return (now - last) >= DAILY_COOLDOWN_MS;
  },
  claimDaily() {
    load();
    if (!this.isDailyReady()) return null;
    state.daily.lastClaimed = Date.now();
    const tier = rollChestTier(makeRng(), DAILY_PERF);
    persist();
    return { tier, source: 'daily' };
  },

  // ---- 生日模式（SPEC §7）----
  // month/day 为 0（占位）时永不触发。
  isBirthdayToday() {
    if (!BIRTHDAY.month || !BIRTHDAY.day) return false;
    const now = new Date();
    const m = BIRTHDAY.month - 1; // 转 JS 月份
    const target = new Date(now.getFullYear(), m, BIRTHDAY.day);
    const win = Math.max(1, BIRTHDAY.windowDays || 1);
    const diffDays = Math.floor((now - target) / 86400000);
    // windowDays=1 只当天；>1 为 [0, win-1] 天窗口
    return diffDays >= 0 && diffDays <= (win - 1);
  },
  // 今天是否应播放生日彩蛋（当天首次，避免重复轰炸）
  shouldCelebrateBirthday() {
    load();
    if (!this.isBirthdayToday()) return false;
    return state.birthdaySeenYear !== new Date().getFullYear();
  },
  birthdayInfo() {
    return { name: BIRTHDAY.name, age: todayBirthdayAge() };
  },
  // 执行生日彩蛋：赠送生日皮肤 + 标记当年已展示。返回 {skin, age} 供演出。
  celebrateBirthday() {
    load();
    const gave = grantSkin('birthdaycake', true);
    state.birthdaySeenYear = new Date().getFullYear();
    persist();
    const sk = SKIN_BY_ID.get('birthdaycake');
    return {
      gaveSkin: gave,
      skin: sk ? { id: sk.id, emoji: sk.emoji, name: sk.name, rarity: sk.rarity } : null,
      name: BIRTHDAY.name, age: todayBirthdayAge(),
    };
  },
  playerName() { return BIRTHDAY.name; },
};
