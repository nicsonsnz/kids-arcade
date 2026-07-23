// meta.js — 存档 schema（v1）+ 迁移 + 抗损坏兜底 + 纯函数经济引擎 + Meta 门面。
// main.js/game.js 只通过 Meta 门面交互，绝不直接碰 localStorage。
import {
  SKIN_CATALOG, DEFAULT_SKIN, skinById, indexById, CHEST_SKIN_IDS,
  MIGRATION, RARITY, coinsForMatch, trophyDelta, rankInfo,
  CHEST_TIERS, CHESTS, chestTierWeights,
  PITY_HARD, PITY_SOFT_BASE, PITY_SOFT_STEP, DAILY_COOLDOWN_MS,
  BIRTHDAY, PLAYER_NAME,
} from './meta-config.js';

const PREFIX = 'noodle.';
const META_KEY = PREFIX + 'meta';
const SCHEMA_VERSION = 1;

// ==================================================================
// 纯函数经济引擎（注入 RNG，可单测）
// ==================================================================

// mulberry32：确定性 RNG（生产用时间种子，测试用固定种子）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 加权索引抽取
function weightedPick(weights, rng) {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += weights[i];
  let r = rng() * sum;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}

// 宝箱档位（perf 0..1，越高越可能高档）
export function rollChestTier(perf, rng) {
  return CHEST_TIERS[weightedPick(chestTierWeights(perf), rng)];
}

// 宝箱金币（按档位区间）
function rollChestCoins(tier, rng) {
  const range = CHESTS[tier].coins;
  return Math.round(range[0] + rng() * (range[1] - range[0]));
}

// 从未拥有池按稀有度加权抽一个新皮肤 id
function pickNewSkin(unownedIds, rng) {
  if (unownedIds.length === 0) return null;
  const weights = unownedIds.map((id) => {
    const sk = skinById(id);
    const r = sk && RARITY[sk.rarity];
    return r ? r.rollWeight : 1;
  });
  return unownedIds[weightedPick(weights, rng)];
}

// 纯函数开箱：给定拥有集合 + 保底计数，返回本次结果（不修改任何状态）
// 返回 { tier, coins, newSkinId, extraCoins, sinceNew }
export function openChestPure({ tier, ownedIds, sinceNew, rng }) {
  const coins = rollChestCoins(tier, rng);
  const ownedSet = ownedIds instanceof Set ? ownedIds : new Set(ownedIds);
  const unowned = CHEST_SKIN_IDS.filter((id) => !ownedSet.has(id));

  // 全部集齐 → 保底失效，只给金币（永不卡死）
  if (unowned.length === 0) {
    return { tier, coins, newSkinId: null, extraCoins: 0, sinceNew: 0 };
  }

  const forceNew = sinceNew + 1 >= PITY_HARD;
  const softProb = Math.min(1, PITY_SOFT_BASE + PITY_SOFT_STEP * sinceNew);
  const hit = forceNew || rng() < softProb;

  if (hit) {
    const newSkinId = pickNewSkin(unowned, rng);
    return { tier, coins, newSkinId, extraCoins: 0, sinceNew: 0 };
  }
  // 未出新皮肤：折算成额外金币（「多得金币！」，绝不出现「你已拥有」的沮丧）
  const extra = 30 + Math.round(rng() * 40);
  return { tier, coins, newSkinId: null, extraCoins: extra, sinceNew: sinceNew + 1 };
}

// 表现分 perf（0..1）——与金币公式同源，越高越偏高档宝箱
function perfFromMatch(length, kills, top3) {
  const c = coinsForMatch(length, kills, top3);
  return Math.max(0, Math.min(1, c / 300));
}

// ==================================================================
// 存档 schema + 抗损坏兜底
// ==================================================================
function num(v, def) { return (typeof v === 'number' && isFinite(v)) ? v : def; }
function clampNonNeg(v, def) { const n = num(v, def); return n < 0 ? 0 : Math.floor(n); }

function defaultSkins() {
  const skins = {};
  for (let i = 0; i < SKIN_CATALOG.length; i++) skins[SKIN_CATALOG[i].id] = { owned: false, isNew: false };
  skins[DEFAULT_SKIN].owned = true; // 初始皮肤永远拥有
  return skins;
}

function defaultState() {
  return {
    v: SCHEMA_VERSION,
    coins: 0,
    lifetimeCoins: 0,
    trophies: 0,
    skins: defaultSkins(),
    selectedSkin: DEFAULT_SKIN,
    pity: { sinceNew: 0 },
    daily: { lastClaimed: 0 },
    best: 0, kills: 0, games: 0,
    birthdaySeenYear: 0,
    recentLosses: 0,
  };
}

// 校验 + 兜底：任何字段缺失/类型错/负值 → 用默认/clamp，绝不抛错
function sanitize(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  d.coins = clampNonNeg(raw.coins, 0);
  d.lifetimeCoins = Math.max(clampNonNeg(raw.lifetimeCoins, 0), d.coins);
  d.trophies = clampNonNeg(raw.trophies, 0);
  d.best = clampNonNeg(raw.best, 0);
  d.kills = clampNonNeg(raw.kills, 0);
  d.games = clampNonNeg(raw.games, 0);
  d.birthdaySeenYear = clampNonNeg(raw.birthdaySeenYear, 0);
  d.recentLosses = Math.max(0, Math.min(9, clampNonNeg(raw.recentLosses, 0)));

  if (raw.pity && typeof raw.pity === 'object') d.pity.sinceNew = clampNonNeg(raw.pity.sinceNew, 0);
  if (raw.daily && typeof raw.daily === 'object') d.daily.lastClaimed = clampNonNeg(raw.daily.lastClaimed, 0);

  // 皮肤：以默认全表为基底，合并已存记录（未知 id 忽略）
  if (raw.skins && typeof raw.skins === 'object') {
    for (const id in d.skins) {
      const r = raw.skins[id];
      if (r && typeof r === 'object') {
        d.skins[id].owned = !!r.owned;
        d.skins[id].isNew = !!r.isNew;
      }
    }
  }
  d.skins[DEFAULT_SKIN].owned = true; // 恒真

  // 选中皮肤必须已拥有，否则回落默认
  const sel = typeof raw.selectedSkin === 'string' ? raw.selectedSkin : DEFAULT_SKIN;
  d.selectedSkin = (d.skins[sel] && d.skins[sel].owned) ? sel : DEFAULT_SKIN;
  return d;
}

// 从旧的分散键迁移（best/kills/games/muted/skin）
function readLegacy(key, def) {
  try { const v = localStorage.getItem(PREFIX + key); return v === null ? def : v; } catch (e) { return def; }
}

function migrateFromLegacy() {
  const s = defaultState();
  const best = parseInt(readLegacy('best', '0'), 10);
  const kills = parseInt(readLegacy('kills', '0'), 10);
  const games = parseInt(readLegacy('games', '0'), 10);
  const oldSkin = parseInt(readLegacy('skin', '0'), 10);
  s.best = isFinite(best) && best > 0 ? best : 0;
  s.kills = isFinite(kills) && kills > 0 ? kills : 0;
  s.games = isFinite(games) && games > 0 ? games : 0;

  // 旧「按分数解锁」的皮肤 → 标记 owned（不标 NEW，避免老玩家一堆红点）
  for (let i = 0; i < MIGRATION.length; i++) {
    const m = MIGRATION[i];
    if (s.best >= m.unlock) s.skins[m.id].owned = true;
  }
  // 旧选中皮肤索引 → 新 id
  const mapEntry = MIGRATION.find((m) => m.legacy === oldSkin);
  const selId = mapEntry ? mapEntry.id : DEFAULT_SKIN;
  s.selectedSkin = s.skins[selId] && s.skins[selId].owned ? selId : DEFAULT_SKIN;
  return s;
}

// ==================================================================
// Meta 门面
// ==================================================================
let state = defaultState();
let loaded = false;
let rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);

function persist() {
  try { localStorage.setItem(META_KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式/配额：忽略 */ }
}

function ownedIdSet() {
  const set = new Set();
  for (const id in state.skins) if (state.skins[id].owned) set.add(id);
  return set;
}

function grantSkin(id, markNew) {
  const rec = state.skins[id];
  if (!rec) return false;
  if (rec.owned) return false;
  rec.owned = true;
  rec.isNew = !!markNew;
  return true;
}

// 应用一次开箱结果到状态（金币入账、皮肤入账、保底计数更新）
function applyChest(res) {
  const gained = res.coins + (res.extraCoins || 0);
  state.coins += gained;
  state.lifetimeCoins += gained;
  state.pity.sinceNew = res.sinceNew;
  if (res.newSkinId) grantSkin(res.newSkinId, true);
}

export const Meta = {
  // ---- 生命周期 ----
  init() {
    if (loaded) return;
    let parsed = null;
    try {
      const rawStr = localStorage.getItem(META_KEY);
      if (rawStr !== null) parsed = JSON.parse(rawStr);
    } catch (e) { parsed = null; }

    if (parsed) {
      state = sanitize(parsed);
    } else {
      // 无 .meta：尝试从旧键迁移
      state = migrateFromLegacy();
    }
    loaded = true;
    persist();
  },

  // 测试注入固定种子（生产不调用）
  _setRng(fn) { rng = fn; },
  _state() { return state; },

  // ---- 钱包 / 段位 ----
  coins() { return state.coins; },
  lifetimeCoins() { return state.lifetimeCoins; },
  trophies() { return state.trophies; },
  rank() { return rankInfo(state.trophies); },

  // ---- 皮肤 ----
  catalog() { return SKIN_CATALOG; },
  isOwned(id) { return !!(state.skins[id] && state.skins[id].owned); },
  isNew(id) { return !!(state.skins[id] && state.skins[id].isNew); },
  ownedCount() { let c = 0; for (const id in state.skins) if (state.skins[id].owned) c++; return c; },
  selectedSkinId() { return state.selectedSkin; },
  selectedSkinIndex() { return indexById(state.selectedSkin); },
  ownedSkinIds() { return SKIN_CATALOG.filter((s) => state.skins[s.id].owned).map((s) => s.id); },

  selectSkin(id) {
    if (state.skins[id] && state.skins[id].owned) { state.selectedSkin = id; persist(); return true; }
    return false;
  },
  // 进收藏册查看后清除 NEW 角标
  clearNew(id) {
    if (state.skins[id] && state.skins[id].isNew) { state.skins[id].isNew = false; persist(); }
  },
  clearAllNew() {
    let changed = false;
    for (const id in state.skins) if (state.skins[id].isNew) { state.skins[id].isNew = false; changed = true; }
    if (changed) persist();
  },
  hasAnyNew() { for (const id in state.skins) if (state.skins[id].isNew) return true; return false; },

  // 金币直购（玩家主动花已赚金币——非死亡扣款，符合安全铁律）
  skinPrice(id) { const s = skinById(id); return s ? RARITY[s.rarity].price : 0; },
  // 生日限定皮肤只能由生日彩蛋赠送，绝不进入金币经济（SPEC §3.4/§7）
  isPurchasable(id) { const s = skinById(id); return !!s && !s.birthdayOnly; },
  canBuy(id) { return this.isPurchasable(id) && !this.isOwned(id) && state.coins >= this.skinPrice(id); },
  buySkin(id) {
    if (!this.isPurchasable(id)) return false;
    if (this.isOwned(id)) return false;
    const price = this.skinPrice(id);
    if (state.coins < price) return false;
    state.coins -= price;
    grantSkin(id, true);
    state.selectedSkin = id; // 买了就选上
    persist();
    return true;
  },

  // ---- 赛后结算：计算 + 入账，返回供结算流程动画的结构 ----
  // opts: { length, kills, rank, totalPlayers, top3, bonusCoins, newBest }
  reportMatch(opts) {
    const length = Math.max(0, Math.floor(opts.length || 0));
    const kills = Math.max(0, Math.floor(opts.kills || 0));
    const rank = Math.max(1, Math.floor(opts.rank || 1));
    const total = Math.max(1, Math.floor(opts.totalPlayers || 1));
    const top3 = !!opts.top3;
    const bonus = Math.max(0, Math.floor(opts.bonusCoins || 0));

    // 迁移镜像（展示用，只增）
    if (length > state.best) state.best = length;
    state.kills += kills;
    state.games += 1;

    // 1) 本局金币（公式 + 连杀奖励）
    const matchCoins = coinsForMatch(length, kills, top3) + bonus;
    const coinsStart = state.coins;
    state.coins += matchCoins;
    state.lifetimeCoins += matchCoins;
    const coinsAfterMatch = state.coins;

    // 2) 段位星（只增）
    const trophiesStart = state.trophies;
    const rankBefore = rankInfo(state.trophies);
    const dTrophy = trophyDelta(rank, total);
    state.trophies += dTrophy;
    const rankAfter = rankInfo(state.trophies);
    const trophiesAfter = state.trophies;

    // 3) 宝箱（每局必得 1 个）
    const perf = perfFromMatch(length, kills, top3);
    const tier = rollChestTier(perf, rng);
    const chestRes = openChestPure({ tier, ownedIds: ownedIdSet(), sinceNew: state.pity.sinceNew, rng });
    applyChest(chestRes);
    const coinsAfterChest = state.coins;

    // 4) 隐形照顾难度：连败计数
    if (top3) state.recentLosses = Math.max(0, state.recentLosses - 1);
    else state.recentLosses = Math.min(9, state.recentLosses + 1);

    persist();

    return {
      length, kills, rank, top3, newBest: !!opts.newBest,
      coins: {
        start: coinsStart,
        afterMatch: coinsAfterMatch,
        afterChest: coinsAfterChest,
        matchCoins,
        bonus,
      },
      trophies: {
        start: trophiesStart, after: trophiesAfter, delta: dTrophy,
        rankBefore, rankAfter, rankedUp: rankAfter.index > rankBefore.index,
      },
      chest: {
        tier: chestRes.tier,
        coins: chestRes.coins,
        newSkinId: chestRes.newSkinId,
        extraCoins: chestRes.extraCoins,
      },
    };
  },

  // ---- 隐形照顾难度（连败 ≥2 → 悄悄降 bot 数量/激进度）----
  difficulty() {
    const l = state.recentLosses;
    let botDelta = 0, aggressionMul = 1;
    if (l >= 2) { botDelta = -1; aggressionMul = 0.85; }
    if (l >= 4) { botDelta = -2; aggressionMul = 0.70; }
    return { botDelta, aggressionMul };
  },

  // ---- 每日礼物（纯惊喜，零愧疚）----
  isDailyReady(now) {
    const t = typeof now === 'number' ? now : Date.now();
    const last = state.daily.lastClaimed;
    if (t < last) return false;        // 时钟被调回 → 视为未就绪
    return (t - last) >= DAILY_COOLDOWN_MS || last === 0;
  },
  claimDaily(now) {
    const t = typeof now === 'number' ? now : Date.now();
    if (!this.isDailyReady(t)) return null;
    state.daily.lastClaimed = t;
    const tier = rollChestTier(0.35, rng); // 每日礼物中性表现
    const res = openChestPure({ tier, ownedIds: ownedIdSet(), sinceNew: state.pity.sinceNew, rng });
    applyChest(res);
    persist();
    return { tier: res.tier, coins: res.coins, newSkinId: res.newSkinId, extraCoins: res.extraCoins };
  },

  // ---- 生日模式（Leon）----
  // 占位安全：month/day 任一为 0 → 永不触发
  isBirthdayToday(now) {
    if (!BIRTHDAY.month || !BIRTHDAY.day) return false;
    const d = now instanceof Date ? now : new Date();
    const win = Math.max(1, BIRTHDAY.windowDays || 1);
    // 以当年生日为锚，容差 ±(win-1) 天
    const anchor = new Date(d.getFullYear(), BIRTHDAY.month - 1, BIRTHDAY.day);
    const diffDays = Math.floor((d - anchor) / 86400000);
    return Math.abs(diffDays) <= (win - 1);
  },
  // 返回 { triggered, firstToday, skinId } —— firstToday=true 表示当天首次（放彩蛋）
  checkBirthday(now) {
    const d = now instanceof Date ? now : new Date();
    if (!this.isBirthdayToday(d)) return { triggered: false, firstToday: false, skinId: null };
    const year = d.getFullYear();
    const first = state.birthdaySeenYear !== year;
    if (first) {
      grantSkin('birthday', true);
      state.birthdaySeenYear = year;
      persist();
    }
    return { triggered: true, firstToday: first, skinId: 'birthday' };
  },

  playerName(now) {
    return this.isBirthdayToday(now) ? PLAYER_NAME + ' 🎂' : PLAYER_NAME;
  },
};
