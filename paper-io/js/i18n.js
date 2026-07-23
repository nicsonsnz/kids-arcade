// i18n.js — internationalization for Popsicle Land (圈地大冒险).
// English is authoritative and the DEFAULT (unset lang => 'en'); Chinese is the
// original hardcoded text, kept fully intact as the alternate language.
// Language-neutral number/percent formatting stays in MetaFX / callers — this
// module only owns human-readable strings.

const LANG_KEY = 'quanland.lang';
const DEFAULT_LANG = 'en';
const SUPPORTED = ['en', 'zh'];

// ---------- string tables ----------
// Keys are grouped sensibly and addressed with dotted paths, e.g. t('menu.start').
// English keys are the source of truth; zh mirrors the game's original text.
const STRINGS = {
  en: {
    brand: 'Popsicle Land',
    logo: { part1: 'Popsicle', part2: 'Land' },
    subtitle: 'The more land you grab, the cooler you are!',
    menu: {
      best: 'Best Record',
      chooseSkin: 'Pick your racer',
      start: 'Play',
      collection: '🎁 Collection',
      daily: '🎁 Daily Gift',
      soundOn: '🔊 Sound On',
      soundOff: '🔇 Sound Off',
      musicOn: '🎶 Music On',
      musicOff: '🎵 Music Off',
      langToggle: '中文',        // shown while in English: tap to switch to Chinese
      langAria: 'Switch language',
    },
    hud: {
      best: 'Best {n}',
      pauseAria: 'Pause',
      rankAria: 'Rank',
    },
    rankBadge: {
      toNext: 'To {emoji} {n}★',
      maxed: 'Maxed ★',
    },
    pause: {
      title: 'Paused',
      resume: 'Resume',
      menu: 'Main Menu',
    },
    revive: {
      title: 'You got cut off!',
      tip: 'Revive once for free, keep your land',
      revive: 'Revive',
      giveup: 'Give Up',
    },
    killFeed: {
      playerCut: '{killer} cut off {victim}!',
      botCut: '{killer} cut off {victim}',
    },
    streak: {
      double: 'DOUBLE KILL!',
      triple: 'TRIPLE KILL!',
      unstoppable: 'UNSTOPPABLE!',
    },
    results: {
      victory: '🎉 You ruled the whole world!',
      normal: 'Match Results',
      record: '🏅 New Record!',
      land: 'Land',
      kills: 'Kills',
      rank: 'Rank',
      time: 'Time',
      rankValue: 'No. {n}',
      tapContinue: 'Tap to continue ▸',
      replay: '▶ Play Again',
      collection: '🎁 Collection',
      menu: '🏠 Main Menu',
      newTag: 'NEW!',
      extraCoins: '(Extra coins! +{n})',
    },
    rankUp: {
      title: 'Rank Up!',
      tip: 'Tap to continue ▸',
    },
    collection: {
      title: '🎁 Collection',
      collected: 'Collected {c} / {n}',
      unknownName: '???',
      birthdayTag: '🎂 Birthday Gift',
      back: 'Back',
    },
    daily: {
      title: '🐻 A gift for you!',
      sub: 'Tap to open~',
      ok: 'Got it ✓',
    },
    birthday: {
      banner: '🎈🎂 Happy {ageOrd} Birthday, {name}! 🎂🎈',
      bannerNoAge: '🎈🎂 Happy Birthday, {name}! 🎂🎈',
      title: 'Happy {ageOrd} Birthday, {name}! 🎂',
      titleNoAge: 'Happy Birthday, {name}! 🎂',
      giftTag: 'Birthday Gift!',
      giftLine: 'A birthday gift for you! 🎉',
      start: "Thanks! Let's Play ▶",
    },
    encourage: [
      'So close!',
      'Amazing — almost a new record!',
      "One more try, you've got this!",
      'You look super cool out there!',
      "Wow, that's a huge patch of land!",
      'Push a little farther next time!',
      'So close, just one more step!',
      "You're a land-grabbing star!",
    ],
    rarity: {
      common: 'Common',
      rare: 'Rare',
      epic: 'Epic',
      legendary: 'Legendary',
      birthday: 'Birthday',
    },
    rank: {
      novice: 'Rookie',
      bronze: 'Bronze',
      silver: 'Silver',
      gold: 'Gold',
      diamond: 'Diamond',
      master: 'Master',
      legend: 'Legend',
    },
    chest: {
      wood: 'Wood Chest',
      silver: 'Silver Chest',
      gold: 'Gold Chest',
      rainbow: 'Rainbow Chest',
    },
    skin: {
      icecream: 'Popsicle',
      duck: 'Jelly Duck',
      cat: 'Meow',
      puddingdog: 'Pudding Pup',
      sodabear: 'Soda Bear',
      cottoncandy: 'Cotton Candy',
      donut: 'Donut',
      car: 'Racer',
      jamfox: 'Jam Fox',
      matchafrog: 'Matcha Frog',
      koala: 'Koala',
      melonpig: 'Melon Pig',
      bubbledragon: 'Bubble Dragon',
      unicorn: 'Unicorn',
      tiger: 'Little Tiger',
      lion: 'Little Lion',
      alien: 'Alien',
      crownking: 'Crown King',
      rainbowcandy: 'Rainbow Candy',
      birthdaycake: 'Birthday Cake',
    },
    bot: [
      'Jelly Duck', 'Donut Cat', 'Soda Bear', 'Bubble Dragon',
      'Marshmallow', 'Pudding Pup', 'Cream Whale', 'Boba Koala',
      'Jam Fox', 'Melon Pig', 'Mango Elephant', 'Berry Bunny',
      'Blueberry Mouse', 'Lemon Birdie', 'Coco Monkey', 'Cherry Deer',
      'Matcha Frog', 'Caramel Badger', 'Peachy Sheep', 'Watermelon Pengu',
      'Lychee Kitty', 'Tart Owl',
    ],
  },

  zh: {
    brand: '圈地大冒险',
    logo: { part1: '圈地', part2: '大冒险' },
    subtitle: '圈住越多地盘越厉害！',
    menu: {
      best: '最高纪录',
      chooseSkin: '选择你的小车',
      start: '开始游戏',
      collection: '🎁 收藏册',
      daily: '🎁 每日礼物',
      soundOn: '🔊 音效开',
      soundOff: '🔇 音效关',
      musicOn: '🎶 音乐开',
      musicOff: '🎵 音乐关',
      langToggle: 'EN',         // shown while in Chinese: tap to switch to English
      langAria: '切换语言',
    },
    hud: {
      best: '最高 {n}',
      pauseAria: '暂停',
      rankAria: '段位',
    },
    rankBadge: {
      toNext: '距 {emoji} {n}★',
      maxed: '已满级 ★',
    },
    pause: {
      title: '暂停',
      resume: '继续',
      menu: '回主菜单',
    },
    revive: {
      title: '被切断了！',
      tip: '免费复活一次，保留你的地盘',
      revive: '复活',
      giveup: '放弃',
    },
    killFeed: {
      playerCut: '{killer} 切断了 {victim}！',
      botCut: '{killer} 切断了 {victim}',
    },
    streak: {
      double: '双杀!',
      triple: '三杀!',
      unstoppable: '超神!',
    },
    results: {
      victory: '🎉 你统治了整个世界！',
      normal: '本局结算',
      record: '🏅 新纪录!',
      land: '占领',
      kills: '击杀',
      rank: '名次',
      time: '存活',
      rankValue: '第 {n} 名',
      tapContinue: '点击继续 ▸',
      replay: '▶ 再来一局',
      collection: '🎁 收藏册',
      menu: '🏠 主菜单',
      newTag: 'NEW!',
      extraCoins: '(多得金币! +{n})',
    },
    rankUp: {
      title: '段位晋升!',
      tip: '点击继续 ▸',
    },
    collection: {
      title: '🎁 收藏册',
      collected: '已收集 {c} / {n}',
      unknownName: '？？？',
      birthdayTag: '🎂 生日礼物',
      back: '返回',
    },
    daily: {
      title: '🐻 送你的礼物！',
      sub: '点一下打开～',
      ok: '收下啦 ✓',
    },
    birthday: {
      banner: '🎈🎂 {name}，{age} 岁生日快乐！ 🎂🎈',
      bannerNoAge: '🎈🎂 {name} 生日快乐！ 🎂🎈',
      title: '{name}，{age} 岁生日快乐！🎂',
      titleNoAge: '{name} 生日快乐！🎂',
      giftTag: '生日礼物!',
      giftLine: '送你的生日礼物！🎉',
      start: '谢谢！开始玩 ▶',
    },
    encourage: [
      '差一点点！', '太厉害了，快破纪录了！', '再来一局一定行！',
      '你圈地的样子超酷！', '哇，占了好大一片！', '下次冲更远一点！',
      '好可惜，就差一步！', '你是圈地小能手！',
    ],
    rarity: {
      common: '常见',
      rare: '稀有',
      epic: '史诗',
      legendary: '传说',
      birthday: '生日限定',
    },
    rank: {
      novice: '新手',
      bronze: '青铜',
      silver: '白银',
      gold: '黄金',
      diamond: '钻石',
      master: '大师',
      legend: '传奇',
    },
    chest: {
      wood: '木箱',
      silver: '银箱',
      gold: '金箱',
      rainbow: '彩虹箱',
    },
    skin: {
      icecream: '冰棒',
      duck: '果冻鸭',
      cat: '喵喵',
      puddingdog: '布丁狗',
      sodabear: '汽水熊',
      cottoncandy: '棉花糖',
      donut: '甜甜圈',
      car: '小赛车',
      jamfox: '果酱狐',
      matchafrog: '抹茶蛙',
      koala: '考拉',
      melonpig: '蜜瓜猪',
      bubbledragon: '泡泡龙',
      unicorn: '独角兽',
      tiger: '小老虎',
      lion: '小狮子',
      alien: '外星人',
      crownking: '皇冠王',
      rainbowcandy: '彩虹糖',
      birthdaycake: '生日蛋糕',
    },
    bot: [
      '果冻鸭', '甜圈猫', '汽水熊', '泡泡龙',
      '棉花糖', '布丁狗', '奶盖鲸', '波波熊',
      '果酱狐', '蜜瓜猪', '芒果象', '草莓兔',
      '蓝莓鼠', '柠檬鸟', '椰子猴', '樱桃鹿',
      '抹茶蛙', '焦糖獾', '蜜桃羊', '西瓜企鹅',
      '荔枝喵', '蛋挞鸭',
    ],
  },
};

// ---------- internal state ----------
let lang = readInitialLang();
const listeners = new Set();

function readInitialLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v && SUPPORTED.indexOf(v) !== -1) return v;
  } catch (e) { /* private mode / no storage: fall through */ }
  return DEFAULT_LANG; // DEFAULT is English when unset
}

// Resolve a dotted key against a table, returning the raw value (string or array) or undefined.
function resolve(table, key) {
  let cur = table;
  const parts = key.split('.');
  for (let i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => (params[name] != null ? String(params[name]) : m));
}

// English ordinal suffix (1st, 2nd, 3rd, 7th, 21st, ...). Language-neutral fallback = plain number.
function ordinal(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (lang !== 'en') return String(n);
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return n + 'th';
  switch (n % 10) {
    case 1: return n + 'st';
    case 2: return n + 'nd';
    case 3: return n + 'rd';
    default: return n + 'th';
  }
}

export const I18N = {
  getLang() { return lang; },

  setLang(l) {
    if (SUPPORTED.indexOf(l) === -1 || l === lang) return;
    lang = l;
    try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* silent */ }
    try { document.documentElement.setAttribute('lang', l === 'zh' ? 'zh-CN' : 'en'); } catch (e) {}
    listeners.forEach((cb) => { try { cb(l); } catch (e) {} });
  },

  toggle() { this.setLang(lang === 'en' ? 'zh' : 'en'); },

  // Subscribe to language changes; returns an unsubscribe function.
  onChange(cb) {
    if (typeof cb === 'function') listeners.add(cb);
    return () => listeners.delete(cb);
  },

  // Look up a single string by dotted key, with {name}/{n}/... interpolation.
  t(key, params) {
    let val = resolve(STRINGS[lang], key);
    if (val === undefined) val = resolve(STRINGS.en, key); // fall back to authoritative English
    if (val === undefined) return key;                     // last resort: show the key
    if (typeof val !== 'string') return key;
    return interpolate(val, params);
  },

  // Look up an array (e.g. encourage lines) by dotted key.
  tArray(key) {
    let val = resolve(STRINGS[lang], key);
    if (!Array.isArray(val)) val = resolve(STRINGS.en, key);
    return Array.isArray(val) ? val : [];
  },

  // ---- convenience resolvers for catalog data keyed by id/key/index ----
  skinName(id) { return this.t('skin.' + id); },
  rankName(key) { return this.t('rank.' + key); },
  rarityName(key) { return this.t('rarity.' + key); },
  chestName(key) { return this.t('chest.' + key); },
  botName(index) {
    const arr = this.tArray('bot');
    return arr[index] != null ? arr[index] : (this.tArray('bot') && String(index));
  },

  ordinal,

  // Hydrate static DOM: elements with data-i18n get textContent; data-i18n-aria gets aria-label.
  hydrate(rootEl) {
    const root = rootEl || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this.t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria')));
    });
  },
};

// Expose for any non-module context (defensive; modules should import I18N).
try { if (typeof window !== 'undefined') window.I18N = I18N; } catch (e) {}
