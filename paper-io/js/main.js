// main.js — 启动、游戏循环、界面状态机、PWA、唤醒锁。
import { Game, TUNING } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Juice } from './juice.js';
import { Storage, SKINS } from './storage.js';

const DT = 1 / 60;
const MAX_STEPS = 4;

const ENCOURAGE = [
  '差一点点！', '太厉害了，快破纪录了！', '再来一局一定行！',
  '你圈地的样子超酷！', '哇，占了好大一片！', '下次冲更远一点！',
  '好可惜，就差一步！', '你是圈地小能手！',
];

const canvas = document.getElementById('game');
const game = new Game();
const renderer = new Renderer(canvas);
window.__game = game; // 调试句柄（自动化测试用）

let state = 'menu'; // menu | playing | paused | revive | dead | won
let selectedSkin = null;
let reviveTimer = 0;
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
  death: $('death-screen'),
  victory: $('victory-screen'),
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
  deathPct: $('death-pct'),
  deathKills: $('death-kills'),
  deathTime: $('death-time'),
  deathBest: $('death-best'),
  deathEnc: $('death-enc'),
  deathRecord: $('death-record'),
  btnReplay: $('btn-replay'),
  btnReplay2: $('btn-replay2'),
  btnContinueWin: $('btn-continue-win'),
  pauseMute: $('pause-mute'),
  btnResume: $('btn-resume'),
  btnMenu: $('btn-menu'),
};
const mctx = el.minimap.getContext('2d');

function showScreen(name) {
  screens.start.classList.toggle('hidden', name !== 'menu');
  screens.hud.classList.toggle('hidden', !(name === 'playing' || name === 'paused' || name === 'revive'));
  screens.pause.classList.toggle('hidden', name !== 'paused');
  screens.revive.classList.toggle('hidden', name !== 'revive');
  screens.death.classList.toggle('hidden', name !== 'dead');
  screens.victory.classList.toggle('hidden', name !== 'won');
}

// ---------- 皮肤界面 ----------
function buildSkins() {
  el.skinList.innerHTML = '';
  const curId = Storage.getSkin();
  let curUnlocked = false;
  SKINS.forEach((s) => {
    const unlocked = Storage.isSkinUnlocked(s);
    const card = document.createElement('button');
    card.className = 'skin-card' + (unlocked ? '' : ' locked');
    card.innerHTML =
      '<div class="skin-emoji">' + s.emoji + '</div>' +
      '<div class="skin-name">' + s.name + '</div>' +
      (unlocked ? '' : '<div class="skin-lock">' + s.unlockAt + '%解锁</div>');
    if (unlocked) {
      card.addEventListener('click', () => {
        Audio.click();
        selectedSkin = s;
        Storage.setSkin(s.id);
        highlightSkins();
      });
      if (s.id === curId) { selectedSkin = s; curUnlocked = true; }
    }
    card.dataset.skin = s.id;
    el.skinList.appendChild(card);
  });
  if (!selectedSkin || !curUnlocked) selectedSkin = SKINS[0];
  highlightSkins();
}
function highlightSkins() {
  [...el.skinList.children].forEach((c) => {
    c.classList.toggle('selected', c.dataset.skin === selectedSkin.id);
  });
}

function refreshMenu() {
  el.bestMenu.textContent = Storage.getBest().toFixed(1) + '%';
  buildSkins();
  updateMuteButtons();
}
function updateMuteButtons() {
  const muted = Audio.isMuted();
  el.btnMute.textContent = muted ? '🔇 音效关' : '🔊 音效开';
  el.btnBgm.textContent = Audio.isBgmOff() ? '🎵 音乐关' : '🎶 音乐开';
  el.pauseMute.textContent = muted ? '🔇 音效关' : '🔊 音效开';
}

// ---------- 游戏控制 ----------
function startGame() {
  Audio.unlock();
  Audio.click();
  game.newGame(selectedSkin || SKINS[0]);
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
  if (state === 'dead' || state === 'won') return;
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

function gameOver() {
  state = 'dead';
  const pct = game.percent(game.player.id);
  Storage.addGame();
  Storage.addKills(game.playerKills);
  const isRecord = Storage.setBest(pct);
  el.deathPct.textContent = pct.toFixed(1) + '%';
  el.deathKills.textContent = String(game.playerKills);
  el.deathTime.textContent = formatTime(game.aliveTime);
  el.deathBest.textContent = Storage.getBest().toFixed(1) + '%';
  el.deathEnc.textContent = ENCOURAGE[(Math.random() * ENCOURAGE.length) | 0];
  el.deathRecord.classList.toggle('hidden', !isRecord);
  showScreen('dead');
  if (isRecord) Juice.confettiBurst(0, 0, window.innerWidth, window.innerHeight, true);
}

function doVictory() {
  if (state === 'won') return;
  state = 'won';
  const pct = game.percent(game.player.id);
  Storage.setBest(pct);
  Audio.victory();
  Juice.confettiBurst(0, 0, window.innerWidth, window.innerHeight, true);
  showScreen('won');
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
  refreshMenu();
  releaseWakeLock();
}

// ---------- 击杀 toast ----------
function killToast(killer, victim) {
  const div = document.createElement('div');
  div.className = 'toast';
  if (killer.isPlayer) div.textContent = '你切断了 ' + victim.name + '！';
  else div.textContent = killer.name + ' 切断了 ' + victim.name;
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
  el.bestSmall.textContent = '最高 ' + Storage.getBest().toFixed(1) + '%';
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
      '<span class="lb-name">' + (me ? '你' : row.name) + '</span>' +
      '<span class="lb-pct">' + row.pct.toFixed(1) + '%</span></li>';
  }
  if (!playerShown) {
    const myRank = lb.findIndex((r) => r.id === pid) + 1;
    const me = lb.find((r) => r.id === pid);
    if (me) {
      html += '<li class="me sep"><span class="lb-rank">' + myRank + '.</span>' +
        '<span class="lb-dot" style="background:' + me.color + '"></span>' +
        '<span class="lb-name">你</span>' +
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
el.btnReplay.addEventListener('click', startGame);
el.btnReplay2.addEventListener('click', startGame);
el.btnContinueWin.addEventListener('click', () => {
  // 继续游玩：回到当前对局
  Audio.click();
  state = 'playing';
  showScreen('playing');
  last = performance.now();
});
el.btnMute.addEventListener('click', () => { Audio.unlock(); Audio.toggleMute(); Audio.click(); updateMuteButtons(); });
el.btnBgm.addEventListener('click', () => { Audio.unlock(); Audio.toggleBgm(); Audio.click(); updateMuteButtons(); });
el.pauseMute.addEventListener('click', () => { Audio.toggleMute(); updateMuteButtons(); });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (state === 'playing' || state === 'paused') togglePause();
    e.preventDefault();
  } else if (e.code === 'Enter') {
    if (state === 'menu') startGame();
    else if (state === 'dead' || state === 'won') startGame();
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

// iOS 手势兜底：只拦截游戏画面上的滑动，放行覆盖层（.overlay）内部滚动，
// 否则窄屏上开始/结算面板溢出后无法触摸滚动，按钮会够不到。
document.addEventListener('touchmove', (e) => {
  if (!(e.target.closest && e.target.closest('.overlay'))) e.preventDefault();
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
refreshMenu();
showScreen('menu');
requestAnimationFrame(frame);
