// main.js — 装配、主循环（固定步长+插值）、UI 屏幕、PWA、唤醒锁、可见性
import { Game, TUNING, SKINS, skinUnlocked } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Juice } from './juice.js';
import { Storage } from './storage.js';

const DT = 1 / 60;
const MAX_STEPS = 4;

const $ = (id) => document.getElementById(id);

let game, canvas;
let currentSkin = 0;
let paused = false, hidden = false;
let boostSnd = false;
let deathShown = false;
let wakeLock = null;
let lastLen = -1;
let last = performance.now();
let acc = 0, mmTimer = 0, lbTimer = 0;

const el = {};

const ENCOURAGE_NEAR = ['差一点点！', '就快破纪录啦！', '手感火热！'];
const ENCOURAGE_GOOD = ['太厉害了！', '这条蛇好长！', '横扫全场！'];
const ENCOURAGE_MEH = ['再接再厉！', '下一局更长！', '别灰心，继续冲！'];

function cacheEls() {
  ['hud', 'length-num', 'best-small', 'leaderboard', 'pause-btn', 'toasts', 'minimap',
    'boost-btn', 'joystick-base', 'joystick-knob', 'start-screen', 'start-best', 'skins-row',
    'start-btn', 'mute-btn', 'death-screen', 'death-encourage', 'd-length', 'd-kills', 'd-rank',
    'd-best', 'd-newbest', 'restart-btn', 'death-menu-btn', 'pause-screen', 'resume-btn',
    'pause-mute-btn', 'pause-menu-btn'].forEach((id) => { el[id] = $(id); });
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  Renderer.resize(w, h, dpr);
}

// === 屏幕管理 ===
function show(node) { node.classList.remove('hidden'); }
function hide(node) { node.classList.add('hidden'); }

function buildSkins() {
  const row = el['skins-row'];
  const best = Storage.getBest();
  row.innerHTML = '';
  for (let i = 0; i < SKINS.length; i++) {
    const sk = SKINS[i];
    const unlocked = skinUnlocked(i, best);
    const item = document.createElement('div');
    item.className = 'skin-item' + (i === currentSkin ? ' selected' : '') + (unlocked ? '' : ' locked');
    item.style.background = skinPreview(sk);
    if (unlocked) {
      item.innerHTML = '<span>' + sk.name + '</span>';
    } else {
      item.innerHTML = '<span class="lock">🔒</span><span class="lock-cond">' + sk.unlock + '</span>';
    }
    item.addEventListener('click', () => {
      if (!skinUnlocked(i, Storage.getBest())) return;
      currentSkin = i;
      Storage.setSkin(i);
      Audio.button();
      buildSkins();
    });
    row.appendChild(item);
  }
}

function skinPreview(sk) {
  switch (sk.type) {
    case 'rings': return 'repeating-linear-gradient(45deg,#ff9d2e,#ff9d2e 10px,#ffd36b 10px,#ffd36b 20px)';
    case 'ice': return 'repeating-linear-gradient(45deg,#3f8fe6,#3f8fe6 10px,#cfeaff 10px,#cfeaff 20px)';
    case 'gradient': return 'linear-gradient(135deg,#ff5ecb,#8a4bff)';
    case 'stripes': return 'repeating-linear-gradient(90deg,#7fbf1f,#7fbf1f 9px,#d7f56b 9px,#d7f56b 18px)';
    case 'rainbow': return 'linear-gradient(90deg,#ff5e5e,#ffd166,#5be0b3,#5b8cff,#c78bff)';
    case 'gold': return 'linear-gradient(135deg,#e6a91f,#ffe9a0,#b9791a)';
    default: return sk.accent;
  }
}

function showStart() {
  paused = false;
  // 回到主菜单：停 BGM + 释放唤醒锁，回到与全新启动一致的菜单状态（startGame 会重新申请两者）
  Audio.stopBgm();
  releaseWake();
  el['start-best'].textContent = Storage.getBest();
  const best = Storage.getBest();
  if (!skinUnlocked(currentSkin, best)) currentSkin = 0;
  buildSkins();
  hide(el.hud);
  hide(el['death-screen']);
  hide(el['pause-screen']);
  show(el['start-screen']);
}

function startGame() {
  Audio.unlock();
  currentSkin = clampSkin(currentSkin);
  game.start(currentSkin);
  Renderer.resetCam(game);
  Input.reset();
  Juice.reset();
  deathShown = false;
  lastLen = -1;
  paused = false;
  acc = 0;
  last = performance.now();
  hide(el['start-screen']);
  hide(el['death-screen']);
  hide(el['pause-screen']);
  show(el.hud);
  updateLeaderboard();
  updateToasts();
  Renderer.drawMinimap(game);
  requestWake();
  if (!Audio.isMuted()) Audio.startBgm();
}

function clampSkin(i) {
  return skinUnlocked(i, Storage.getBest()) ? i : 0;
}

function onDeath() {
  Audio.boostOff(); boostSnd = false;
  const st = game.stats;
  el['d-length'].textContent = st.length;
  el['d-kills'].textContent = st.kills;
  el['d-rank'].textContent = '#' + st.bestRank;
  el['d-best'].textContent = st.best;
  let msg;
  if (st.newBest) msg = '太厉害了！';
  else if (st.length >= st.best * 0.7) msg = ENCOURAGE_NEAR[(Math.random() * ENCOURAGE_NEAR.length) | 0];
  else if (st.length >= 800) msg = ENCOURAGE_GOOD[(Math.random() * ENCOURAGE_GOOD.length) | 0];
  else msg = ENCOURAGE_MEH[(Math.random() * ENCOURAGE_MEH.length) | 0];
  el['death-encourage'].textContent = msg;
  if (st.newBest) { show(el['d-newbest']); Juice.confetti(Renderer.w / 2, Renderer.h * 0.3, Renderer.w * 0.8, 60); Audio.milestone(); }
  else hide(el['d-newbest']);
  show(el['death-screen']);
}

function togglePause(p) {
  if (game.state !== 'play') return;
  paused = p;
  if (p) {
    Audio.boostOff(); boostSnd = false;
    Audio.stopBgm();
    show(el['pause-screen']);
  } else {
    hide(el['pause-screen']);
    last = performance.now();
    Audio.resume();
    if (!Audio.isMuted()) Audio.startBgm();
  }
}

function setMuteIcon() {
  const icon = Audio.isMuted() ? '🔇' : '🔊';
  el['mute-btn'].textContent = icon;
  el['pause-mute-btn'].textContent = icon + ' 音效';
}

function toggleMute() {
  const m = Audio.toggleMuted();
  setMuteIcon();
  if (m) Audio.stopBgm();
  else if (game.state === 'play' && !paused) Audio.startBgm();
  Audio.button();
}

// === HUD 更新 ===
function updateLength() {
  const len = Math.floor(game.player.mass);
  if (len !== lastLen) {
    el['length-num'].textContent = len;
    el['length-num'].classList.remove('bump');
    void el['length-num'].offsetWidth;
    el['length-num'].classList.add('bump');
    lastLen = len;
  }
}

function updateLeaderboard() {
  el['best-small'].textContent = '最高 ' + Storage.getBest();
  const lb = game.leaderboard();
  let html = '';
  for (let i = 0; i < lb.length; i++) {
    const s = lb[i];
    const me = s.isPlayer ? ' me' : '';
    const crown = i === 0 ? '👑 ' : (i + 1) + '. ';
    html += '<div class="lb-row' + me + '"><span class="lb-name">' + crown + escapeHtml(s.name) +
      '</span><span class="lb-len">' + Math.floor(s.mass) + '</span></div>';
  }
  el['leaderboard'].innerHTML = html;
}

function updateToasts() {
  const t = game.killToasts;
  let html = '';
  for (let i = 0; i < t.length; i++) html += '<div class="toast">' + escapeHtml(t[i].text) + '</div>';
  el['toasts'].innerHTML = html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// === 逻辑步 ===
function tick(dt) {
  const p = game.player;
  if (p && p.alive) {
    const cx = Renderer.w / 2, cy = Renderer.h / 2;
    const h = Input.resolve(cx, cy);
    if (h !== null) p.targetHeading = h;
    p.boosting = Input.isBoosting();
    const actually = p.boosting && p.mass > TUNING.minBoostMass;
    if (actually && !boostSnd) { Audio.boostOn(); boostSnd = true; }
    else if (!actually && boostSnd) { Audio.boostOff(); boostSnd = false; }
  }
  game.step(dt);
  if (game.consumeConfetti()) Juice.confetti(Renderer.w / 2, Renderer.h * 0.35, Renderer.w * 0.8, 60);
}

// === 主循环 ===
function frame(now) {
  requestAnimationFrame(frame);
  let ft = (now - last) / 1000;
  last = now;
  if (ft > 0.25) ft = 0.25;
  if (ft < 0) ft = 0;

  const stepping = game.state === 'play' && !paused && !hidden;
  if (stepping) {
    acc += ft;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS) { tick(DT); acc -= DT; steps++; }
    if (steps >= MAX_STEPS) acc = 0;
  } else {
    acc = 0;
  }
  const alpha = stepping ? acc / DT : 0;
  const dtc = Math.min(ft, 0.05);
  if (!paused && !hidden) Juice.update(dtc);

  if (game.player) Renderer.draw(game, alpha, dtc);

  if (game.state === 'play') {
    updateLength();
    mmTimer -= ft;
    if (mmTimer <= 0) { mmTimer = 1 / 3; Renderer.drawMinimap(game); }
    lbTimer -= ft;
    if (lbTimer <= 0) { lbTimer = 0.5; updateLeaderboard(); updateToasts(); }
  }

  if (game.state === 'dead' && !deathShown) { deathShown = true; onDeath(); }
}

// === 唤醒锁 ===
async function requestWake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* 忽略 */ }
}
function releaseWake() {
  try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
}

// === 可见性 ===
function onVisibility() {
  if (document.hidden) {
    hidden = true;
    Audio.boostOff(); boostSnd = false;
    Audio.stopBgm();
    Audio.suspend();
    releaseWake();
  } else {
    hidden = false;
    last = performance.now();
    Audio.resume();
    if (game.state === 'play' && !paused) {
      requestWake();
      if (!Audio.isMuted()) Audio.startBgm();
    }
  }
}

// === 初始化 ===
function init() {
  cacheEls();
  canvas = $('game');
  Renderer.init(canvas);
  Renderer.initMinimap(el['minimap']);
  Juice.init();
  Audio.init();
  resize();

  game = new Game();
  window.__game = game; // 调试句柄（自动化测试用）
  currentSkin = clampSkin(Storage.getSkin());

  Input.setup({
    canvas,
    boostBtn: el['boost-btn'],
    joystickBase: el['joystick-base'],
    joystickKnob: el['joystick-knob'],
    onUnlock: () => Audio.unlock(),
  });

  // 按钮事件
  el['start-btn'].addEventListener('click', () => { Audio.button(); startGame(); });
  el['restart-btn'].addEventListener('click', () => { Audio.button(); startGame(); });
  el['death-menu-btn'].addEventListener('click', () => { Audio.button(); showStart(); });
  el['pause-btn'].addEventListener('click', () => { Audio.button(); togglePause(true); });
  el['resume-btn'].addEventListener('click', () => { Audio.button(); togglePause(false); });
  el['pause-menu-btn'].addEventListener('click', () => { Audio.button(); game.state = 'menu'; paused = false; showStart(); });
  el['mute-btn'].addEventListener('click', toggleMute);
  el['pause-mute-btn'].addEventListener('click', toggleMute);

  setMuteIcon();
  showStart();

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    });
  }

  last = performance.now();
  requestAnimationFrame(frame);
}

init();
