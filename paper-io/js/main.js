// main.js — 启动、游戏循环、界面状态机、PWA、唤醒锁。
import { Game, TUNING } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Juice } from './juice.js';
import { Storage } from './storage.js';
import { Meta } from './meta/meta.js';
import { MetaUI } from './meta/meta-ui.js';
import { MetaFX } from './meta/meta-fx.js';
import { I18N } from './i18n.js';

const DT = 1 / 60;
const MAX_STEPS = 4;

const canvas = document.getElementById('game');
const game = new Game();
const renderer = new Renderer(canvas);
window.__game = game; // 调试句柄（自动化测试用）

let state = 'menu'; // menu | playing | paused | revive | results
let reviveTimer = 0;
let dailyAutoShown = false;
let last = performance.now();
let acc = 0;
let uiAcc = 0;
let miniAcc = 0;
let wakeLock = null;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const screens = {
  start: $('start-screen'),
  hud: $('hud'),
  pause: $('pause-screen'),
  revive: $('revive-panel'),
};
const el = {
  pct: $('pct'),
  bestSmall: $('best-small'),
  leaderboard: $('leaderboard'),
  minimap: $('minimap'),
  toasts: $('toasts'),
  skinList: $('skin-list'),
  bestMenu: $('best-menu'),
  btnStart: $('btn-start'),
  btnPause: $('btn-pause'),
  btnMute: $('btn-mute'),
  btnBgm: $('btn-bgm'),
  reviveCount: $('revive-count'),
  btnRevive: $('btn-revive'),
  btnGiveup: $('btn-giveup'),
  pauseMute: $('pause-mute'),
  btnResume: $('btn-resume'),
  btnMenu: $('btn-menu'),
  btnLang: $('btn-lang'),
};
const mctx = el.minimap.getContext('2d');

function showScreen(name) {
  screens.start.classList.toggle('hidden', name !== 'menu');
  screens.hud.classList.toggle('hidden', !(name === 'playing' || name === 'paused' || name === 'revive'));
  screens.pause.classList.toggle('hidden', name !== 'paused');
  screens.revive.classList.toggle('hidden', name !== 'revive');
}

// ---------- 皮肤界面（菜单里横排已拥有皮肤快选；完整收藏/购买见收藏册）----------
function buildSkins() {
  el.skinList.innerHTML = '';
  const owned = Meta.getCollection().filter((s) => s.owned);
  owned.forEach((s) => {
    const card = document.createElement('button');
    card.className = 'skin-card';
    card.innerHTML =
      '<div class="skin-emoji">' + s.emoji + '</div>' +
      '<div class="skin-name">' + s.name + '</div>';
    card.dataset.skin = s.id;
    card.addEventListener('click', () => {
      Audio.click();
      Meta.selectSkin(s.id);
      highlightSkins();
    });
    el.skinList.appendChild(card);
  });
  highlightSkins();
}
function highlightSkins() {
  const curId = Meta.getSelectedSkinId();
  [...el.skinList.children].forEach((c) => {
    c.classList.toggle('selected', c.dataset.skin === curId);
  });
}

function refreshMenu() {
  el.bestMenu.textContent = Storage.getBest().toFixed(1) + '%';
  buildSkins();
  updateMuteButtons();
  MetaUI.refreshMenu();
}
function updateMuteButtons() {
  const muted = Audio.isMuted();
  el.btnMute.textContent = I18N.t(muted ? 'menu.soundOff' : 'menu.soundOn');
  el.btnBgm.textContent = I18N.t(Audio.isBgmOff() ? 'menu.musicOff' : 'menu.musicOn');
  el.pauseMute.textContent = I18N.t(muted ? 'menu.soundOff' : 'menu.soundOn');
}

// ---------- 游戏控制 ----------
function startGame() {
  Audio.unlock();
  Audio.click();
  Meta.startMatch();
  game.newGame(Meta.getSelectedSkinObject());
  Input.reset();
  renderer.camX = game.player.x;
  renderer.camY = game.player.y;
  renderer.zoom = 0.9;
  acc = 0; last = performance.now();
  state = 'playing';
  showScreen('playing');
  requestWakeLock();
}

function handlePlayerDeath() {
  if (state === 'results') return;
  if (!game.reviveUsed && TUNING.reviveOnce) {
    state = 'revive';
    reviveTimer = 5;
    el.reviveCount.textContent = '5';
    showScreen('revive');
  } else {
    gameOver();
  }
}

function doRevive() {
  // 防重入：仅当复活面板显示时首次点击有效，避免快速双击把仅有的一次复活浪费/直接结算。
  if (state !== 'revive') return;
  Audio.click();
  if (game.revivePlayer()) {
    state = 'playing';
    showScreen('playing');
  } else {
    gameOver();
  }
}

// 赛后结算：跑养成结算流程（金币→段位→宝箱→再来一局，SPEC §5.4）。
function finishMatch(isVictory) {
  if (state === 'results') return;
  const pct = game.percent(game.player.id);
  // 本局名次/总人数（用于段位星）
  const lb = game.leaderboard();
  const total = lb.length || 1;
  let rank = lb.findIndex((r) => r.id === game.player.id) + 1;
  if (rank <= 0) rank = total;
  if (isVictory) rank = 1;
  // 旧存档权威：最高纪录/累计（Storage 仍负责，Meta 另存养成 blob）
  Storage.addGame();
  Storage.addKills(game.playerKills);
  const isRecord = Storage.setBest(pct);
  // 养成结算（只增：金币/段位/宝箱）
  const report = Meta.reportMatch({ pct, kills: game.playerKills, rank, total, won: isVictory });

  state = 'results';
  showScreen('results');
  if (isVictory) { Audio.victory(); MetaFX.confettiBurst({ gold: true, count: 200 }); }

  MetaUI.showResults({
    isVictory,
    stats: {
      pct, kills: game.playerKills, rank,
      timeStr: formatTime(game.aliveTime), isRecord,
      enc: (() => { const E = I18N.tArray('encourage'); return E[(Math.random() * E.length) | 0]; })(),
    },
    report,
  });
}

function gameOver() { finishMatch(false); }

function doVictory() {
  if (state === 'results') return;
  finishMatch(true);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showScreen('paused');
  } else if (state === 'paused') {
    state = 'playing';
    showScreen('playing');
    last = performance.now();
  }
}

function toMenu() {
  Audio.click();
  state = 'menu';
  showScreen('menu');
  onEnterMenu();
  releaseWakeLock();
}

// 进入主菜单：刷新钱包/段位；生日彩蛋优先，其次每日礼物（本次会话自动仅一次，绝无催促）。
function onEnterMenu() {
  refreshMenu();
  if (Meta.shouldCelebrateBirthday()) {
    MetaUI.celebrateBirthday();
  } else if (!dailyAutoShown && Meta.isDailyReady()) {
    dailyAutoShown = true;
    MetaUI.showDailyGift();
  }
}

// ---------- 击杀 toast ----------
function killToast(killer, victim) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = I18N.t(killer.isPlayer ? 'killFeed.playerCut' : 'killFeed.botCut',
    { killer: killer.name, victim: victim.name });
  el.toasts.appendChild(div);
  requestAnimationFrame(() => div.classList.add('show'));
  setTimeout(() => {
    div.classList.remove('show');
    setTimeout(() => div.remove(), 400);
  }, 2200);
}

// ---------- 回调 ----------
let comboCount = 0;
let lastCaptureTime = 0;
game.callbacks.onKill = (k, v) => killToast(k, v);
game.callbacks.onPlayerDeath = () => handlePlayerDeath();
game.callbacks.onVictory = () => doVictory();
game.callbacks.onKillStreak = (level) => {
  // 连杀升级弹窗 + 额外金币（计入本局，SPEC §8）
  Meta.reportKillStreak(level);
  MetaUI.showKillStreak(level);
};
game.callbacks.onCapture = (e, delta) => {
  if (e.isPlayer) {
    const now = performance.now();
    if (now - lastCaptureTime < 2500) comboCount++; else comboCount = 0;
    lastCaptureTime = now;
    Audio.eatBlip(comboCount);
    el.pct.classList.remove('bounce');
    void el.pct.offsetWidth;
    el.pct.classList.add('bounce');
  }
};

// ---------- HUD ----------
function updateHUD() {
  const pct = game.percent(game.player.id);
  el.pct.textContent = pct.toFixed(1) + '%';
  el.bestSmall.textContent = I18N.t('hud.best', { n: Storage.getBest().toFixed(1) + '%' });
}
function updateLeaderboard() {
  const lb = game.leaderboard();
  const top = lb.slice(0, 5);
  const pid = game.player.id;
  let html = '';
  let rank = 0;
  let playerShown = false;
  for (const row of top) {
    rank++;
    const crown = rank === 1 ? '👑' : (rank + '.');
    const me = row.id === pid;
    if (me) playerShown = true;
    html += '<li class="' + (me ? 'me' : '') + '">' +
      '<span class="lb-rank">' + crown + '</span>' +
      '<span class="lb-dot" style="background:' + row.color + '"></span>' +
      '<span class="lb-name">' + (me ? game.player.name : row.name) + '</span>' +
      '<span class="lb-pct">' + row.pct.toFixed(1) + '%</span></li>';
  }
  if (!playerShown) {
    const myRank = lb.findIndex((r) => r.id === pid) + 1;
    const me = lb.find((r) => r.id === pid);
    if (me) {
      html += '<li class="me sep"><span class="lb-rank">' + myRank + '.</span>' +
        '<span class="lb-dot" style="background:' + me.color + '"></span>' +
        '<span class="lb-name">' + game.player.name + '</span>' +
        '<span class="lb-pct">' + me.pct.toFixed(1) + '%</span></li>';
    }
  }
  el.leaderboard.innerHTML = html;
}

// ---------- 主循环 ----------
function applyInput() {
  const r = Input.compute();
  if (game.player && game.player.alive && r.has) {
    game.player.targetAngle = r.angle;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let ft = (now - last) / 1000;
  last = now;
  if (ft > 0.25) ft = 0.25;

  const stepping = (state === 'playing' || state === 'revive');
  if (stepping) {
    acc += ft;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS) {
      if (state === 'playing') applyInput();
      game.step(DT);
      acc -= DT; steps++;
    }
    if (acc > DT * MAX_STEPS) acc = 0;
  }

  if (state !== 'menu') {
    Juice.update(ft);
    renderer.updateCamera(game, ft);
    const alpha = stepping ? acc / DT : 0;
    renderer.render(game, alpha, ft);
    if (state === 'playing' && Input.joystick.active) renderer.drawJoystick(Input);

    // HUD 更新节流
    if (state === 'playing' || state === 'revive') {
      updateHUD();
      uiAcc += ft;
      if (uiAcc >= 0.5) { uiAcc = 0; updateLeaderboard(); }
      miniAcc += ft;
      if (miniAcc >= 0.2) { miniAcc = 0; renderer.drawMinimap(mctx, 132, game); }
    }
  }

  // 复活倒计时
  if (state === 'revive') {
    reviveTimer -= ft;
    if (reviveTimer <= 0) { gameOver(); }
    else el.reviveCount.textContent = String(Math.ceil(reviveTimer));
  }
}

// ---------- 事件绑定 ----------
Input.onFirstPoint = () => { Audio.unlock(); updateMuteButtons(); };
Input.init(canvas);

el.btnStart.addEventListener('click', startGame);
el.btnPause.addEventListener('click', () => { Audio.click(); togglePause(); });
el.btnResume.addEventListener('click', () => { Audio.click(); togglePause(); });
el.btnMenu.addEventListener('click', toMenu);
el.btnRevive.addEventListener('click', doRevive);
el.btnGiveup.addEventListener('click', () => { Audio.click(); gameOver(); });
el.btnMute.addEventListener('click', () => { Audio.unlock(); Audio.toggleMute(); Audio.click(); updateMuteButtons(); });
el.btnBgm.addEventListener('click', () => { Audio.unlock(); Audio.toggleBgm(); Audio.click(); updateMuteButtons(); });
el.pauseMute.addEventListener('click', () => { Audio.toggleMute(); updateMuteButtons(); });
if (el.btnLang) el.btnLang.addEventListener('click', () => { Audio.unlock(); Audio.click(); I18N.toggle(); });

// 语言切换：即时重绘所有可见文本（静态 DOM + 菜单动态部分 + 打开的养成覆盖层）。
I18N.onChange(() => {
  I18N.hydrate(document);
  if (state === 'menu') refreshMenu();
  else { updateMuteButtons(); MetaUI.refreshMenu(); }
  MetaUI.onLangChange();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (state === 'playing' || state === 'paused') togglePause();
    e.preventDefault();
  } else if (e.code === 'Enter') {
    if (state === 'menu') startGame();
    else if (state === 'results') MetaUI.triggerReplay();
  }
});

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));

// 可见性：暂停音频/循环
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    Audio.suspend();
    if (state === 'playing') togglePause();
  } else {
    Audio.resume();
    last = performance.now();
    requestWakeLock();
  }
});

// iOS 手势兜底：只拦截游戏画面上的滑动，放行覆盖层内部滚动。
// 含旧覆盖层 .overlay 与养成层 .meta-root（收藏册/结算可溢出窄屏，需触摸滚动），
// 否则窄屏上面板溢出后无法滚动，购买/返回/再来一局等按钮会够不到（SPEC §5.4 绝不困住孩子）。
document.addEventListener('touchmove', (e) => {
  if (!(e.target.closest && e.target.closest('.overlay, .meta-root'))) e.preventDefault();
}, { passive: false });

// ---------- Wake Lock ----------
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) {}
}
function releaseWakeLock() {
  try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
}

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  });
}

// ---------- 启动 ----------
I18N.hydrate(document); // 用当前语言填充静态 DOM（默认英文）
Meta.load();
MetaUI.init({ onReplay: startGame, onMenu: toMenu, onGallery: refreshMenu });
showScreen('menu');
onEnterMenu();
requestAnimationFrame(frame);
