// storage.js — 本地存储（localStorage），全部 try/catch 包裹（隐私模式可能抛错）
const PREFIX = 'noodle.';

function readRaw(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch (e) {
    /* 忽略：隐私模式或配额 */
  }
}

export const Storage = {
  getBest() {
    const n = parseInt(readRaw('best', '0'), 10);
    return Number.isFinite(n) ? n : 0;
  },
  setBest(v) {
    writeRaw('best', Math.max(0, Math.floor(v)));
  },
  getSkin() {
    const n = parseInt(readRaw('skin', '0'), 10);
    return Number.isFinite(n) ? n : 0;
  },
  setSkin(id) {
    writeRaw('skin', Math.floor(id));
  },
  isMuted() {
    return readRaw('muted', '0') === '1';
  },
  setMuted(m) {
    writeRaw('muted', m ? '1' : '0');
  },
  getKills() {
    const n = parseInt(readRaw('kills', '0'), 10);
    return Number.isFinite(n) ? n : 0;
  },
  addKills(n) {
    writeRaw('kills', this.getKills() + n);
  },
  getGames() {
    const n = parseInt(readRaw('games', '0'), 10);
    return Number.isFinite(n) ? n : 0;
  },
  addGame() {
    writeRaw('games', this.getGames() + 1);
  },
};
