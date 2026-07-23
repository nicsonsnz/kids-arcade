// i18n.js — 蛇蛇星球 / Noodle Stars internationalization.
// Standalone leaf module (no imports). English is authoritative and the DEFAULT;
// Chinese is the existing original copy, kept fully intact as the alternate language.
// Usage: import { I18N } from './i18n.js';  I18N.t('key', { name })  /  I18N.onChange(cb)

const LANG_KEY = 'noodle.lang';
const DEFAULT_LANG = 'en';
const SUPPORTED = ['en', 'zh'];

// ==================================================================
// String table. Keys grouped by area. {name}/{n}/{total}/{emoji} = params.
// ==================================================================
const TABLE = {
  en: {
    // ---- Brand / logo ----
    'brand': 'Noodle Stars',
    'logo.primary': 'Noodle Stars',
    'logo.sub': '蛇蛇星球',
    'lang.toggle': '中文',        // label shown when currently English (switch to Chinese)

    // ---- Start menu ----
    'menu.bestScore': 'Best Score',
    'menu.chooseSkin': 'Choose a Skin',
    'menu.play': 'PLAY',
    'menu.gallery': 'Collection',
    'menu.dailyGift': 'Daily Gift',
    'menu.new': 'NEW',

    // ---- HUD ----
    'hud.length': 'Length',
    'hud.best': 'Best',           // rendered as "Best 0"
    'hud.pause': 'Pause',
    'hud.sound': 'Sound',         // rendered as "🔊 Sound"

    // ---- Kill feed / floaters ----
    'feed.kill': 'Leon ate {name}!',
    'feed.plusKill': '+Kill',
    'milestone.newRecord': 'New Record!',
    'milestone.passed': 'Passed {n}!',

    // ---- Kill streaks ----
    'streak.2': 'DOUBLE KILL!',
    'streak.3': 'TRIPLE KILL!',
    'streak.4': 'UNSTOPPABLE!',

    // ---- Death / pause panels (legacy overlay, kept in sync) ----
    'death.title': 'Game Over',
    'death.encourage': 'So close!',
    'death.statLength': 'Length',
    'death.statKills': 'Kills',
    'death.statRank': 'Best Rank',
    'death.statBest': 'Best',
    'death.newBest': '🏆 New Record!',
    'death.again': 'Play Again',
    'death.menu': 'Main Menu',
    'pause.title': 'Paused',
    'pause.resume': 'Resume',
    'pause.menu': 'Main Menu',

    // ---- Results (post-match) ----
    'results.title': 'Results',
    'results.length': 'Length',
    'results.kills': 'Kills',
    'results.rank': 'Rank',
    'results.newBest': '🏆 New Record!',
    'results.again': 'Play Again',
    'results.gallery': 'Collection',
    'results.menu': 'Main Menu',

    // ---- Rank badge ----
    'rank.next': '{emoji} {n}★ to go',
    'rank.maxed': 'Maxed out 🌈',
    'rankup.title': 'Rank Up!',

    // ---- Collection gallery ----
    'gallery.title': '🎁 Collection',
    'gallery.collected': 'Collected {n} / {total}',
    'gallery.birthdayOnly': 'Birthday Only',
    'gallery.skinTag': '{rarity} Skin',

    // ---- Chest / rewards ----
    'chest.tap': 'Tap to continue',
    'chest.newBadge': '✨ NEW ✨',
    'chest.extraCoins': 'Bonus coins! +{n}',

    // ---- Daily gift ----
    'daily.title': 'A gift for you!',
    'daily.open': 'Open',
    'daily.later': 'Later',

    // ---- Birthday ----
    'birthday.banner': '🎂 Happy 7th Birthday, Leon!',
    'birthday.title': 'Happy 7th Birthday, Leon! 🎂',
    'birthday.sub': "Here's a birthday gift 🎁",
    'birthday.openGift': 'Open Gift',

    // ---- Rarity labels ----
    'rarity.common': 'Common',
    'rarity.rare': 'Rare',
    'rarity.epic': 'Epic',
    'rarity.legendary': 'Legendary',

    // ---- Rank tier names (emoji kept separately in config) ----
    'tier.rookie': 'Rookie',
    'tier.bronze': 'Bronze',
    'tier.silver': 'Silver',
    'tier.gold': 'Gold',
    'tier.diamond': 'Diamond',
    'tier.master': 'Master',
    'tier.legend': 'Legend',

    // ---- Skin names ----
    'skin.sunny': 'Honey Orange',
    'skin.frost': 'Frost Blue',
    'skin.lime': 'Lime Stripe',
    'skin.mint': 'Mint Dots',
    'skin.cherry': 'Cherry Pink',
    'skin.sky': 'Sky Blue',
    'skin.berry': 'Berry Fade',
    'skin.coral': 'Coral Stripe',
    'skin.forest': 'Forest Green',
    'skin.grape': 'Grape Dots',
    'skin.peach': 'Peach Fade',
    'skin.ocean': 'Ocean Wave',
    'skin.rainbow': 'Rainbow Loop',
    'skin.lava': 'Lava Flow',
    'skin.star': 'Starlight',
    'skin.icedrake': 'Frost Dragon',
    'skin.golddrake': 'Gold Dragon',
    'skin.crown': 'Golden Crown',
    'skin.aurora': 'Aurora',
    'skin.birthday': 'Cake Rainbow',

    // ---- Bot name pool (opponents shown on-screen) ----
    'botNames': [
      'Noodle', 'Rainbow', 'Comet', 'Gummy', 'Marshmallow', 'Sprinkles', 'Jellybean', 'Bubbles',
      'Stardust', 'Pudding', 'Cotton', 'Melon', 'PopRock', 'Mango', 'Cookie', 'Minty',
      'Poppy', 'Cheddar', 'BerryBear', 'LemonPie', 'Cocoa', 'Frosting', 'DotFish', 'Cloudy',
      'Choco', 'Blueberry', 'Caramel', 'Tangelo',
    ],
  },

  zh: {
    // ---- Brand / logo ----
    'brand': '蛇蛇星球',
    'logo.primary': '蛇蛇星球',
    'logo.sub': 'Noodle Stars',
    'lang.toggle': 'EN',          // label shown when currently Chinese (switch to English)

    // ---- Start menu ----
    'menu.bestScore': '最高纪录',
    'menu.chooseSkin': '选择皮肤',
    'menu.play': '开 始',
    'menu.gallery': '收藏册',
    'menu.dailyGift': '每日礼物',
    'menu.new': 'NEW',

    // ---- HUD ----
    'hud.length': '长度',
    'hud.best': '最高',
    'hud.pause': '暂停',
    'hud.sound': '音效',

    // ---- Kill feed / floaters ----
    'feed.kill': 'Leon 吃掉了 {name}！',
    'feed.plusKill': '+击杀',
    'milestone.newRecord': '新纪录！',
    'milestone.passed': '突破 {n}！',

    // ---- Kill streaks ----
    'streak.2': '双杀!',
    'streak.3': '三杀!',
    'streak.4': '超神!',

    // ---- Death / pause panels ----
    'death.title': '游戏结束',
    'death.encourage': '差一点点！',
    'death.statLength': '本局长度',
    'death.statKills': '击杀',
    'death.statRank': '最高名次',
    'death.statBest': '最高纪录',
    'death.newBest': '🏆 新纪录！',
    'death.again': '再来一局',
    'death.menu': '回主菜单',
    'pause.title': '暂停',
    'pause.resume': '继 续',
    'pause.menu': '回主菜单',

    // ---- Results (post-match) ----
    'results.title': '本局成绩',
    'results.length': '长度',
    'results.kills': '击杀',
    'results.rank': '名次',
    'results.newBest': '🏆 新纪录！',
    'results.again': '再来一局',
    'results.gallery': '收藏册',
    'results.menu': '回主菜单',

    // ---- Rank badge ----
    'rank.next': '距 {emoji} {n}★',
    'rank.maxed': '已满级 🌈',
    'rankup.title': '段位晋升！',

    // ---- Collection gallery ----
    'gallery.title': '🎁 收藏册',
    'gallery.collected': '已收集 {n} / {total}',
    'gallery.birthdayOnly': '生日限定',
    'gallery.skinTag': '{rarity}皮肤',

    // ---- Chest / rewards ----
    'chest.tap': '点击继续',
    'chest.newBadge': '✨ NEW ✨',
    'chest.extraCoins': '多得金币！ +{n}',

    // ---- Daily gift ----
    'daily.title': '送你的礼物！',
    'daily.open': '打开',
    'daily.later': '稍后',

    // ---- Birthday ----
    'birthday.banner': '🎂 Leon，7 岁生日快乐！',
    'birthday.title': 'Leon，7 岁生日快乐！🎂',
    'birthday.sub': '送你一份生日礼物 🎁',
    'birthday.openGift': '打开礼物',

    // ---- Rarity labels ----
    'rarity.common': '常见',
    'rarity.rare': '稀有',
    'rarity.epic': '史诗',
    'rarity.legendary': '传说',

    // ---- Rank tier names ----
    'tier.rookie': '新手',
    'tier.bronze': '青铜',
    'tier.silver': '白银',
    'tier.gold': '黄金',
    'tier.diamond': '钻石',
    'tier.master': '大师',
    'tier.legend': '传奇',

    // ---- Skin names ----
    'skin.sunny': '蜜橙环',
    'skin.frost': '冰蓝纹',
    'skin.lime': '青柠条',
    'skin.mint': '薄荷点',
    'skin.cherry': '樱粉环',
    'skin.sky': '天蓝纹',
    'skin.berry': '粉紫渐变',
    'skin.coral': '珊瑚条',
    'skin.forest': '森绿纹',
    'skin.grape': '葡萄点',
    'skin.peach': '蜜桃渐变',
    'skin.ocean': '海洋纹',
    'skin.rainbow': '彩虹循环',
    'skin.lava': '熔岩纹',
    'skin.star': '星光点',
    'skin.icedrake': '冰霜龙',
    'skin.golddrake': '金龙',
    'skin.crown': '皇冠金',
    'skin.aurora': '极光',
    'skin.birthday': '蛋糕彩虹',

    // ---- Bot name pool ----
    'botNames': [
      '面条侠', '彩虹糖', '流星锤', '软糖将军', '奶盖波波', '闪电泡芙', '果冻弹', '蜜桃气泡',
      '星尘喵', '布丁怪', '棉花星', '西瓜霜', '跳跳糖', '芒果冰', '小圆饼', '薄荷君',
      '爆爆珠', '芝士条', '草莓熊', '柠檬派', '可可球', '糖霜龙', '波点鱼', '云朵卷',
      '巧克脆', '蓝莓酱', '焦糖喵', '橘子汽',
    ],
  },
};

// ==================================================================
// State + subscriptions
// ==================================================================
let _lang = null;              // resolved lazily
const _subs = new Set();

function _readLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v && SUPPORTED.indexOf(v) !== -1) return v;
  } catch (e) { /* private mode */ }
  return DEFAULT_LANG;         // DEFAULT is English when unset
}

function _writeLang(l) {
  try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* ignore */ }
}

// {name} style interpolation over a string
function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

export const I18N = {
  // ---- language ----
  getLang() {
    if (_lang === null) _lang = _readLang();
    return _lang;
  },
  setLang(l) {
    if (SUPPORTED.indexOf(l) === -1) return;
    if (this.getLang() === l) return;
    _lang = l;
    _writeLang(l);
    this._emit();
  },
  toggle() {
    this.setLang(this.getLang() === 'en' ? 'zh' : 'en');
  },
  supported() { return SUPPORTED.slice(); },

  // ---- lookup ----
  // t(key, params?) → localized string. Falls back en → key.
  t(key, params) {
    const lang = this.getLang();
    let v = TABLE[lang] && TABLE[lang][key];
    if (v == null) v = TABLE.en[key];
    if (v == null) return key;
    if (typeof v !== 'string') return v; // (arrays etc — callers should use raw())
    return interpolate(v, params);
  },
  // raw(key) → uninterpolated value for current lang (e.g. arrays like botNames)
  raw(key) {
    const lang = this.getLang();
    const v = TABLE[lang] && TABLE[lang][key];
    return v != null ? v : TABLE.en[key];
  },
  // bot opponent name pool for the current language
  botNames() { return this.raw('botNames') || []; },

  // ---- subscriptions ----
  // onChange(cb) → unsubscribe fn. cb() is called after every language change.
  onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    _subs.add(cb);
    return () => _subs.delete(cb);
  },
  _emit() {
    _subs.forEach((cb) => { try { cb(this.getLang()); } catch (e) { /* isolate */ } });
  },

  // ---- DOM hydration ----
  // Applies translations to any element under `root` carrying:
  //   data-i18n       → textContent
  //   data-i18n-html  → innerHTML
  //   data-i18n-aria  → aria-label attribute
  hydrate(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this.t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = this.t(el.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria')));
    });
    // keep <html lang> in sync for accessibility
    try { document.documentElement.setAttribute('lang', this.getLang() === 'zh' ? 'zh-CN' : 'en'); } catch (e) {}
  },
};
