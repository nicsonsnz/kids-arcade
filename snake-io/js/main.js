// main.js — 装配、主循环（固定步长+插值）、UI 屏幕、PWA、唤醒锁、可见性
import { Game, TUNING, SKINS } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Juice } from './juice.js';
import { Storage } from './storage.js';
import { Meta } from './meta/meta.js';
import { MetaUI } from './meta/meta-ui.js';
import { I18N } from './i18n.js';

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

function cacheEls() {
  ['hud', 'length-num', 'best-small', 'leaderboard', 'pause-btn', 'toasts', 'minimap',
    'boost-btn', 'joystick-base', 'joystick-knob', 'start-screen', 'start-best', 'skins-row',
    'start-btn', 'mute-btn', 'death-screen', 'death-encourage', 'd-length', 'd-kills', 'd-rank',
    'd-best', 'd-newbest', 'restart-btn', 'death-menu-btn', 'pause-screen', 'resume-btn',
    'pause-mute-btn', 'pause-menu-btn', 'lang-btn'].forEach((id) => { el[id] = $(id); });
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
  row.innerHTML = '';
  const selId = Meta.selectedSkinId();
  // 菜单横排快选：只展示「已拥有」的皮肤（未拥有去收藏册解锁）
  for (let i = 0; i < SKINS.length; i++) {
    const sk = SKINS[i];
    if (!Meta.isOwned(sk.id)) continue;
    const item = document.createElement('div');
    item.className = 'skin-item' + (sk.id === selId ? ' selected' : '');
    item.style.background = skinPreview(sk);
    let inner = '<span>' + escapeHtml(I18N.t('skin.' + sk.id)) + '</span>';
    if (Meta.isNew(sk.id)) inner += '<span class="lock-cond">' + escapeHtml(I18N.t('menu.new')) + '</span>';
    item.innerHTML = inner;
    item.addEventListener('click', () => {
      Meta.selectSkin(sk.id);
      Meta.clearNew(sk.id);
      currentSkin = sk.index;
      Audio.button();
      MetaUI.renderMenu();
      buildSkins();
    });
    row.appendChild(item);
  }
}

function skinPreview(sk) {
  const b = sk.base, a = sk.accent;
  switch (sk.style) {
    case 'stripe': return 'repeating-linear-gradient(90deg,' + b + ' 0 9px,' + a + ' 9px 18px)';
    case 'ring': return 'repeating-linear-gradient(45deg,' + b + ' 0 10px,' + a + ' 10px 20px)';
    case 'gradient': return 'linear-gradient(135deg,' + b + ',' + a + ')';
    case 'rainbow': return 'linear-gradient(90deg,#ff5e5e,#ffd166,#5be0b3,#5b8cff,#c78bff,#ff5ecb)';
    case 'dragon': return 'linear-gradient(135deg,' + b + ',' + a + ',' + b + ')';
    default: return b;
  }
}

function showStart() {
  paused = false;
  // 回到主菜单：停 BGM + 释放唤醒锁，回到与全新启动一致的菜单状态（startGame 会重新申请两者）
  Audio.stopBgm();
  releaseWake();
  el['start-best'].textContent = Storage.getBest();
  currentSkin = Meta.selectedSkinIndex();
  buildSkins();
  hide(el.hud);
  hide(el['death-screen']);
  hide(el['pause-screen']);
  show(el['start-screen']);
  MetaUI.renderMenu();
  // 进主菜单：生日优先，其次每日礼物（都为纯正向惊喜，缺席零惩罚）
  const bday = Meta.checkBirthday();
  if (bday.triggered) MetaUI.birthdayCelebration(bday);
  else MetaUI.maybeDailyGift();
}

function startGame() {
  Audio.unlock();
  currentSkin = Meta.selectedSkinIndex();
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

function onDeath() {
  Audio.boostOff(); boostSnd = false;
  const st = game.stats;
  // 结算入账（金币/段位/宝箱只增）并跑赛后结算流程覆盖层
  const result = Meta.reportMatch({
    length: st.length,
    kills: st.kills,
    rank: st.bestRank,
    totalPlayers: st.totalPlayers,
    top3: st.top3,
    bonusCoins: st.bonusCoins,
    newBest: st.newBest,
  });
  MetaUI.showResults(result);
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
  el['pause-mute-btn'].textContent = icon + ' ' + I18N.t('hud.sound');
}

function toggleMute() {
  const m = Audio.toggleMuted();
  setMuteIcon();
  if (m) Audio.stopBgm();
  else if (game.state === 'play' && !paused) Audio.startBgm();
  Audio.button();
}

// === 语言 / Language ===
function setLangBtn() {
  // 显示目标语言：英文时显示「中文」，中文时显示「EN」
  if (el['lang-btn']) el['lang-btn'].textContent = I18N.t('lang.toggle');
}

function toggleLang() {
  Audio.button();
  I18N.toggle();
}

// 语言切换后：重刷所有静态文案 + 动态构建 UI（当前可见的都实时更新）
function relocalize() {
  I18N.hydrate(document);
  setLangBtn();
  setMuteIcon();
  buildSkins();
  if (el['best-small']) updateLeaderboard();
  MetaUI.relocalize();
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
  el['best-small'].textContent = I18N.t('hud.best') + ' ' + Storage.getBest();
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
    // 连杀弹窗（双杀/三杀/超神）
    let sp;
    while ((sp = game.consumeStreak())) MetaUI.streakPopup(sp.text, sp.level);
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
  Meta.init(); // 存档 + 迁移旧键（在装配前，供皮肤/难度/名字读取）
  canvas = $('game');
  Renderer.init(canvas);
  Renderer.initMinimap(el['minimap']);
  Juice.init();
  Audio.init();
  resize();

  MetaUI.init({
    audio: Audio,
    onPlayAgain: () => { Audio.button(); startGame(); },
    onMenu: () => { Audio.button(); showStart(); },
    onSkinSelect: () => { currentSkin = Meta.selectedSkinIndex(); MetaUI.renderMenu(); buildSkins(); },
    onGalleryClose: () => { buildSkins(); },
  });

  game = new Game();
  window.__game = game; // 调试句柄（自动化测试用）
  window.__meta = Meta; // 调试句柄（自动化测试用）
  window.__metaui = MetaUI; // 调试句柄（自动化测试用）
  currentSkin = Meta.selectedSkinIndex();

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
  el['lang-btn'].addEventListener('click', toggleLang);

  // i18n：初次注水静态文案 + 语言按钮，订阅切换后实时重渲染
  I18N.hydrate(document);
  setLangBtn();
  I18N.onChange(relocalize);

  setMuteIcon();
  showStart();

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', onVisibility);
  // 阻止整页橡皮筋滚动，但放行可滚动的收藏册网格（否则折叠线以下的皮肤无法查看/选择/购买）
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest && e.target.closest('.mg-grid')) return;
    e.preventDefault();
  }, { passive: false });

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
