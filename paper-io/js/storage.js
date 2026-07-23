// storage.js — localStorage 封装（隐私模式安全，全部 try/catch）
const PREFIX = 'quanland.';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v === null || v === undefined) return fallback;
    return JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

// 皮肤定义：id -> 解锁所需最高百分比
export const SKINS = [
  { id: 'icecream', emoji: '🍦', name: '冰棒', unlockAt: 0 },
  { id: 'duck', emoji: '🦆', name: '果冻鸭', unlockAt: 10 },
  { id: 'donut', emoji: '🍩', name: '甜甜圈', unlockAt: 20 },
  { id: 'cat', emoji: '🐱', name: '喵喵', unlockAt: 35 },
  { id: 'car', emoji: '🚗', name: '小赛车', unlockAt: 50 },
  { id: 'alien', emoji: '👾', name: '外星人', unlockAt: 100 },
];

export const Storage = {
  getBest() { return read('best', 0); },
  setBest(v) {
    const cur = this.getBest();
    if (v > cur) { write('best', v); return true; }
    return false;
  },

  getMuted() { return read('muted', false); },
  setMuted(v) { write('muted', !!v); },

  getBgmOff() { return read('bgmOff', false); },
  setBgmOff(v) { write('bgmOff', !!v); },

  getSkin() { return read('skin', 'icecream'); },
  setSkin(id) { write('skin', id); },

  getKills() { return read('kills', 0); },
  addKills(n) { write('kills', this.getKills() + n); },

  getGames() { return read('games', 0); },
  addGame() { write('games', this.getGames() + 1); },

  // 已解锁皮肤基于最高百分比推导，但也持久化以防降级
  isSkinUnlocked(skin) {
    if (skin.unlockAt <= 0) return true;
    return this.getBest() >= skin.unlockAt;
  },
};
