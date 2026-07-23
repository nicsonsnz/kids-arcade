// meta-config.js — 圈地大冒险 养成系统配置（皮肤目录 / 稀有度 / 经济 / 段位 / 生日）。
// 所有数字可在此集中调参（PLATFORM §10）。本文件为纯数据，无副作用。

// ---------- 稀有度四档（+ 生日限定）----------
// 颜色/描边/标签三重区分（色盲友好，SPEC §5.2）。
// name fields are the authoritative English fallback; runtime display is resolved
// through I18N (I18N.rarityName/skinName/rankName/chestName) so both languages render.
export const RARITY = {
  common:    { key: 'common',    name: 'Common',    color: '#9e9e9e', price: 200,  rollWeight: 50 },
  rare:      { key: 'rare',      name: 'Rare',      color: '#4a90d9', price: 600,  rollWeight: 30 },
  epic:      { key: 'epic',      name: 'Epic',      color: '#9b59b6', price: 1500, rollWeight: 15 },
  legendary: { key: 'legendary', name: 'Legendary', color: '#ffb300', price: 4000, rollWeight: 5 },
  // 生日限定：不可用金币购买、不进宝箱抽奖池，只在生日彩蛋赠送（SPEC §7）。
  birthday:  { key: 'birthday',  name: 'Birthday',  color: '#ff7fd0', price: 0,    rollWeight: 0 },
};

// ---------- 皮肤目录（≥16 款；emoji 角色，纯装饰零属性，SPEC §0/§4）----------
// 旧 6 款 id 保留（icecream/duck/donut/cat/car/alien）以便迁移旧存档。
export const SKIN_CATALOG = [
  // 常见（6）
  { id: 'icecream',    emoji: '🍦', name: 'Popsicle',      rarity: 'common' },
  { id: 'duck',        emoji: '🦆', name: 'Jelly Duck',    rarity: 'common' },
  { id: 'cat',         emoji: '🐱', name: 'Meow',          rarity: 'common' },
  { id: 'puddingdog',  emoji: '🐶', name: 'Pudding Pup',   rarity: 'common' },
  { id: 'sodabear',    emoji: '🐻', name: 'Soda Bear',     rarity: 'common' },
  { id: 'cottoncandy', emoji: '🐰', name: 'Cotton Candy',  rarity: 'common' },
  // 稀有（6）
  { id: 'donut',       emoji: '🍩', name: 'Donut',         rarity: 'rare' },
  { id: 'car',         emoji: '🚗', name: 'Racer',         rarity: 'rare' },
  { id: 'jamfox',      emoji: '🦊', name: 'Jam Fox',       rarity: 'rare' },
  { id: 'matchafrog',  emoji: '🐸', name: 'Matcha Frog',   rarity: 'rare' },
  { id: 'koala',       emoji: '🐨', name: 'Koala',         rarity: 'rare' },
  { id: 'melonpig',    emoji: '🐷', name: 'Melon Pig',     rarity: 'rare' },
  // 史诗（4）
  { id: 'bubbledragon',emoji: '🐲', name: 'Bubble Dragon', rarity: 'epic' },
  { id: 'unicorn',     emoji: '🦄', name: 'Unicorn',       rarity: 'epic' },
  { id: 'tiger',       emoji: '🐯', name: 'Little Tiger',  rarity: 'epic' },
  { id: 'lion',        emoji: '🦁', name: 'Little Lion',   rarity: 'epic' },
  // 传说（3）
  { id: 'alien',       emoji: '👾', name: 'Alien',         rarity: 'legendary' },
  { id: 'crownking',   emoji: '👑', name: 'Crown King',    rarity: 'legendary' },
  { id: 'rainbowcandy',emoji: '🌈', name: 'Rainbow Candy', rarity: 'legendary' },
  // 生日限定（1）
  { id: 'birthdaycake',emoji: '🎂', name: 'Birthday Cake', rarity: 'birthday', birthday: true },
];

export const DEFAULT_SKIN = 'icecream';

// 旧「按最高分解锁」阈值 → 迁移时据此把已达成皮肤标记为拥有（SPEC §2 迁移）。
export const LEGACY_UNLOCK = { duck: 10, donut: 20, cat: 35, car: 50, alien: 100 };

// ---------- 段位表（只增，emoji 图标优先，SPEC §3.2）----------
export const RANKS = [
  { key: 'novice',  emoji: '🌱', name: 'Rookie',  min: 0 },
  { key: 'bronze',  emoji: '🥉', name: 'Bronze',  min: 60 },
  { key: 'silver',  emoji: '🥈', name: 'Silver',  min: 180 },
  { key: 'gold',    emoji: '🥇', name: 'Gold',    min: 400 },
  { key: 'diamond', emoji: '💎', name: 'Diamond', min: 800 },
  { key: 'master',  emoji: '👑', name: 'Master',  min: 1500 },
  { key: 'legend',  emoji: '🌈', name: 'Legend',  min: 3000 },
];

// ---------- 宝箱档位（SPEC §3.3）----------
export const CHESTS = {
  wood:    { key: 'wood',    name: 'Wood Chest',    emoji: '📦', color: '#c58f5a', coinMin: 20,  coinMax: 60 },
  silver:  { key: 'silver',  name: 'Silver Chest',  emoji: '🎁', color: '#b9c4d0', coinMin: 50,  coinMax: 120 },
  gold:    { key: 'gold',    name: 'Gold Chest',    emoji: '🏆', color: '#ffcf3d', coinMin: 120, coinMax: 260 },
  rainbow: { key: 'rainbow', name: 'Rainbow Chest', emoji: '🌈', color: '#ff7fd0', coinMin: 300, coinMax: 600 },
};
// 宝箱开出「未拥有新皮肤」失败时，折算成额外金币（绝不出现「已拥有」的沮丧，SPEC §3.3）。
export const CHEST_EXTRA_COINS = { wood: 30, silver: 60, gold: 120, rainbow: 220 };

// ---------- 经济公式（SPEC §3.1 / §3.2 / §8）----------
export const ECONOMY = {
  coinsBase: 10,
  coinsPerPct: 8,        // round(pct * 8)
  coinsPerKill: 25,
  coinsWinBonus: 100,    // 100% 胜利
  coinsCap: 500,         // 每局公式上限（连杀奖励额外叠加，不受此限）
  // 连杀奖励（计入本局金币，SPEC §8）：2=双杀 3=三杀 4+=超神
  streakBonus: { 2: 30, 3: 80, 4: 150 },
  // 段位星按名次（只增，SPEC §3.2）
  trophyFirst: 30, trophySecond: 20, trophyThird: 15, trophyHalf: 8, trophyRest: 5,
  // 宝箱保底（SPEC §0/§3.3）
  softPityStart: 0.40,   // 距上次出新皮肤越久越高
  softPityStep: 0.15,
  hardPity: 5,           // 每第 5 个宝箱强制出新皮肤
  // 皮肤稀有度抽取权重（从未拥有池加权，保底保证最终集齐）
  rollWeight: { common: 50, rare: 30, epic: 15, legendary: 5 },
};

// 每日礼物：冷却 20 小时（SPEC §3.5）；礼物箱偏好中档。
export const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
export const DAILY_PERF = 0.45;

// 隐形照顾难度（SPEC §0/§8）：连败越多，bot 越少越温和（绝不提示）。
export const RUBBER_BAND = {
  loss2: { aggressionMult: 0.85, botCountDelta: 0 },
  loss3: { aggressionMult: 0.75, botCountDelta: -1 },
  loss5: { aggressionMult: 0.70, botCountDelta: -2 },
  minBots: 4,
};

// ---------- 生日模式（Leon，SPEC §7）----------
// Leon 生日 = 8月1号（Nick 于 2026-07 确认）。month 用 1..12（人类月份）；day 1..31。
export const BIRTHDAY = {
  name: 'Leon',
  month: 8,        // 8 月
  day: 1,          // 1 号
  windowDays: 1,   // 仅生日当天（可放宽为 ±N 天窗口容错）
  birthYear: 2019, // 2026 年满 7 岁 → 生于 2019
};
