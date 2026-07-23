// meta-config.js — 蛇蛇星球 元系统配置：皮肤目录、稀有度、金币公式、段位表、宝箱、生日。
// 纯数据 + 纯函数，无任何 import（叶子模块）。所有数字严格按 SPEC-meta.md。

// === 稀有度四档（色盲友好：色 + 边框 + 标签三重区分） ===
// 展示用文案（label/name 等）已迁至 js/i18n.js，按 key/id 查表；此处仅保留结构数据 + 英文兜底。
export const RARITY = {
  common:    { key: 'common',    label: 'Common',    color: '#9e9e9e', price: 200,  rollWeight: 60 },
  rare:      { key: 'rare',      label: 'Rare',      color: '#4a90d9', price: 600,  rollWeight: 30 },
  epic:      { key: 'epic',      label: 'Epic',      color: '#9b59b6', price: 1500, rollWeight: 9 },
  legendary: { key: 'legendary', label: 'Legendary', color: '#ffb300', price: 4000, rollWeight: 3 },
};

// === 皮肤目录（数据驱动花纹皮肤）===
// 每款 = {id,name,rarity,base,accent,style}；style ∈ stripe|ring|gradient|rainbow|dots|dragon。
// 顺序即渲染索引；前若干项对应旧 0..5 索引（迁移用 legacy/unlock 标注）。
// 皮肤展示名由 i18n 按 id 查表（skin.<id>）；此处 name 仅作英文兜底。
export const SKIN_CATALOG = [
  // 常见（6）
  { id: 'sunny',   name: 'Honey Orange', rarity: 'common', base: '#ff9d2e', accent: '#ffd36b', style: 'ring',     legacy: 0, unlock: 0 },
  { id: 'frost',   name: 'Frost Blue',   rarity: 'common', base: '#5aa9ff', accent: '#cfeaff', style: 'ring',     legacy: 1, unlock: 1000 },
  { id: 'lime',    name: 'Lime Stripe',  rarity: 'common', base: '#a6e22e', accent: '#e2ff8f', style: 'stripe',   legacy: 3, unlock: 5000 },
  { id: 'mint',    name: 'Mint Dots',    rarity: 'common', base: '#5fe0b3', accent: '#d6fff0', style: 'dots' },
  { id: 'cherry',  name: 'Cherry Pink',  rarity: 'common', base: '#ff85c2', accent: '#ffd6ec', style: 'ring' },
  { id: 'sky',     name: 'Sky Blue',     rarity: 'common', base: '#4fc3ff', accent: '#cdefff', style: 'stripe' },

  // 稀有（6）
  { id: 'berry',   name: 'Berry Fade',   rarity: 'rare', base: '#d56bff', accent: '#ff9de0', style: 'gradient', legacy: 2, unlock: 2500 },
  { id: 'coral',   name: 'Coral Stripe', rarity: 'rare', base: '#ff7a6b', accent: '#ffc7ba', style: 'stripe' },
  { id: 'forest',  name: 'Forest Green', rarity: 'rare', base: '#3fae6a', accent: '#b6f5c9', style: 'ring' },
  { id: 'grape',   name: 'Grape Dots',   rarity: 'rare', base: '#8a5bff', accent: '#d3c4ff', style: 'dots' },
  { id: 'peach',   name: 'Peach Fade',   rarity: 'rare', base: '#ffab6b', accent: '#ffe2c4', style: 'gradient' },
  { id: 'ocean',   name: 'Ocean Wave',   rarity: 'rare', base: '#2f8fd6', accent: '#bfe6ff', style: 'ring' },

  // 史诗（4）
  { id: 'rainbow', name: 'Rainbow Loop', rarity: 'epic', base: '#ff5ecb', accent: '#ffffff', style: 'rainbow', legacy: 4, unlock: 8000 },
  { id: 'lava',    name: 'Lava Flow',    rarity: 'epic', base: '#ff5a2e', accent: '#ffd06b', style: 'stripe' },
  { id: 'star',    name: 'Starlight',    rarity: 'epic', base: '#6b8cff', accent: '#fff2a0', style: 'dots' },
  { id: 'icedrake', name: 'Frost Dragon', rarity: 'epic', base: '#6be0ff', accent: '#e6faff', style: 'dragon' },

  // 传说（3）
  { id: 'golddrake', name: 'Gold Dragon',  rarity: 'legendary', base: '#e6a91f', accent: '#ffe9a0', style: 'dragon', legacy: 5, unlock: 15000 },
  { id: 'crown',   name: 'Golden Crown',   rarity: 'legendary', base: '#ffcf40', accent: '#fff3c0', style: 'dragon' },
  { id: 'aurora',  name: 'Aurora',         rarity: 'legendary', base: '#5be0b3', accent: '#b8a0ff', style: 'rainbow' },

  // 生日限定（1）——只能由生日彩蛋赠送，绝不进宝箱池
  { id: 'birthday', name: 'Cake Rainbow', rarity: 'legendary', base: '#ff6fb5', accent: '#ffe08a', style: 'rainbow', birthdayOnly: true },
];

export const DEFAULT_SKIN = 'sunny'; // 永远拥有的初始皮肤

// 快速索引
const _byId = {};
for (let i = 0; i < SKIN_CATALOG.length; i++) { SKIN_CATALOG[i].index = i; _byId[SKIN_CATALOG[i].id] = SKIN_CATALOG[i]; }
export function skinById(id) { return _byId[id] || null; }
export function indexById(id) { const s = _byId[id]; return s ? s.index : 0; }

// 宝箱可出的皮肤 id 池（排除生日限定）
export const CHEST_SKIN_IDS = SKIN_CATALOG.filter((s) => !s.birthdayOnly).map((s) => s.id);
// 收藏总数（生日皮肤计入总册，但不进宝箱）
export const COLLECTION_TOTAL = SKIN_CATALOG.length;

// 迁移映射：旧数字索引 0..5 → 新 id + 旧解锁分数阈值（best length）
export const MIGRATION = SKIN_CATALOG
  .filter((s) => s.legacy !== undefined)
  .map((s) => ({ legacy: s.legacy, id: s.id, unlock: s.unlock }));

// === 金币公式（snake）：coins = 10 + floor(length/6) + kills*20 + (top3?100:0)，上限 500 ===
export const COIN_CAP = 500;
export function coinsForMatch(length, kills, top3) {
  let c = 10 + Math.floor((length || 0) / 6) + (kills || 0) * 20 + (top3 ? 100 : 0);
  if (c > COIN_CAP) c = COIN_CAP;
  if (c < 0) c = 0;
  return c;
}

// 连杀奖励金币（双杀/三杀/超神），计入本局金币（额外叠加，不受 500 上限约束——慷慨）
export const STREAK_BONUS = { 2: 30, 3: 80, 4: 150 };
// 连杀弹窗文案由 i18n 按等级查表（streak.2/3/4）；此处英文兜底。
export const STREAK_NAME = { 2: 'DOUBLE KILL!', 3: 'TRIPLE KILL!', 4: 'UNSTOPPABLE!' };
export const STREAK_WINDOW = 3.0; // 秒

// === 段位星（只增）===
// 名次给星：第1 +30，第2 +20，第3 +15，前半程 +8，其余 +5。
export function trophyDelta(rank, totalPlayers) {
  if (rank <= 1) return 30;
  if (rank === 2) return 20;
  if (rank === 3) return 15;
  const half = Math.ceil((totalPlayers || 1) / 2);
  if (rank <= half) return 8;
  return 5;
}

// 段位表（含 emoji，图标优先）。tier 名称由 i18n 按 key 查表（tier.<key>）；name 为英文兜底。
export const RANKS = [
  { t: 0,    emoji: '🌱', key: 'rookie',  name: 'Rookie',  color: '#7fd47f' },
  { t: 60,   emoji: '🥉', key: 'bronze',  name: 'Bronze',  color: '#cd8032' },
  { t: 180,  emoji: '🥈', key: 'silver',  name: 'Silver',  color: '#c8d0dc' },
  { t: 400,  emoji: '🥇', key: 'gold',    name: 'Gold',    color: '#ffcf40' },
  { t: 800,  emoji: '💎', key: 'diamond', name: 'Diamond', color: '#5be0ff' },
  { t: 1500, emoji: '👑', key: 'master',  name: 'Master',  color: '#c78bff' },
  { t: 3000, emoji: '🌈', key: 'legend',  name: 'Legend',  color: '#ff7ac0' },
];

// 由星数解析段位 + 进度
export function rankInfo(trophies) {
  const tr = Math.max(0, trophies || 0);
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) { if (tr >= RANKS[i].t) idx = i; }
  const cur = RANKS[idx];
  const next = idx + 1 < RANKS.length ? RANKS[idx + 1] : null;
  const toNext = next ? next.t - tr : 0;
  const span = next ? next.t - cur.t : 1;
  const progress = next ? Math.max(0, Math.min(1, (tr - cur.t) / span)) : 1;
  return { index: idx, tier: cur, next, toNext, progress };
}

// === 宝箱 ===
export const CHEST_TIERS = ['wood', 'silver', 'gold', 'rainbow'];
export const CHESTS = {
  wood:    { key: 'wood',    emoji: '📦', name: 'Wood Chest',    coins: [20, 60],   frame: '#b98a5a' },
  silver:  { key: 'silver',  emoji: '🎁', name: 'Silver Chest',  coins: [50, 120],  frame: '#c8d0dc' },
  gold:    { key: 'gold',    emoji: '🏆', name: 'Gold Chest',    coins: [100, 220], frame: '#ffcf40' },
  rainbow: { key: 'rainbow', emoji: '🌈', name: 'Rainbow Chest', coins: [200, 400], frame: '#ff7ac0' },
};

// 档位加权（表现越好越偏高档）。base 木60/银28/金10/彩2，perf 高时右移。
export function chestTierWeights(perf) {
  const p = Math.max(0, Math.min(1, perf || 0));
  return [
    Math.max(4, 60 * (1 - p * 0.75)), // wood
    28 + p * 10,                       // silver
    10 + p * 34,                       // gold
    2 + p * 24,                        // rainbow
  ];
}

// === 保底（软保底）参数 ===
export const PITY_HARD = 5;      // 第 5 个宝箱强制出新皮肤
export const PITY_SOFT_BASE = 0.40;
export const PITY_SOFT_STEP = 0.15;

// === 每日礼物 ===
export const DAILY_COOLDOWN_MS = 20 * 3600 * 1000; // 20h（第二天早上就绪）

// === 生日模式（Leon）===
// Leon 生日 = 8月1号（Nick 于 2026-07 确认）。month 用 1–12，day 用 1–31。
export const BIRTHDAY = { name: 'Leon', month: 8, day: 1, windowDays: 1 };
export const PLAYER_NAME = 'Leon';
