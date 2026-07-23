// meta-ui.js — 元系统覆盖层 UI：主菜单钱包/段位牌、收藏册、开箱序列、赛后结算流程、
// 每日礼物、生日庆典、连杀弹窗。全部 HTML/CSS 覆盖层，非游戏热循环。
import { Meta } from './meta.js';
import { SKIN_CATALOG, RARITY, COLLECTION_TOTAL, skinById } from './meta-config.js';
import { confettiBurst, countUp, lightBurst, rays, compactNum } from './meta-fx.js';
import { I18N } from '../i18n.js';

// 展示名助手：全部按 id/key 走 i18n 查表
const skinName = (sk) => I18N.t('skin.' + sk.id);
const rarityLabel = (key) => I18N.t('rarity.' + key);

const $create = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

// 皮肤色卡：由 style + base + accent 生成 CSS 背景
function applySwatch(el, skin) {
  const b = skin.base, a = skin.accent;
  el.style.backgroundSize = '';
  switch (skin.style) {
    case 'stripe':
      el.style.background = 'repeating-linear-gradient(90deg,' + b + ' 0 9px,' + a + ' 9px 18px)';
      break;
    case 'ring':
      el.style.background = 'repeating-linear-gradient(45deg,' + b + ' 0 10px,' + a + ' 10px 20px)';
      break;
    case 'gradient':
      el.style.background = 'linear-gradient(135deg,' + b + ',' + a + ')';
      break;
    case 'rainbow':
      el.style.background = 'linear-gradient(90deg,#ff5e5e,#ffd166,#5be0b3,#5b8cff,#c78bff,#ff5ecb)';
      break;
    case 'dots':
      el.style.background = b;
      el.style.backgroundImage = 'radial-gradient(circle at 5px 5px,' + a + ' 2.6px,transparent 3px)';
      el.style.backgroundSize = '13px 13px';
      break;
    case 'dragon':
      el.style.background = 'linear-gradient(135deg,' + b + ',' + a + ',' + b + ')';
      break;
    default:
      el.style.background = b;
  }
}

export const MetaUI = {
  _cb: {},
  _audio: null,
  _stepSkip: false,
  _sleepResolve: null,
  _sleepTimer: 0,
  _dailyPromptedSession: false,

  // opts: { onPlayAgain, onMenu, audio }
  init(opts) {
    this._cb = opts || {};
    this._audio = opts && opts.audio ? opts.audio : null;
    this._buildMenuBar();
    this._buildGallery();
    this._buildChest();
    this._buildResults();
    this._buildStreak();
    this._buildDailyPrompt();
    this._buildBirthday();
  },

  _snd(name) { const a = this._audio; if (a && typeof a[name] === 'function') { try { a[name](); } catch (e) {} } },

  // ---- 内部计时（可点击加速）----
  _sleep(ms) {
    return new Promise((res) => {
      this._sleepResolve = res;
      this._sleepTimer = setTimeout(res, ms);
    }).then(() => { clearTimeout(this._sleepTimer); this._sleepResolve = null; });
  },
  _bump() { this._stepSkip = true; if (this._sleepResolve) this._sleepResolve(); },
  _resetStep() { this._stepSkip = false; },

  // ================= 主菜单钱包 / 段位牌 =================
  _buildMenuBar() {
    const start = document.getElementById('start-screen');
    if (!start) return;

    const bar = $create('div', 'meta-menubar');
    bar.innerHTML =
      '<div class="meta-wallet"><span class="mw-icon">🪙</span><span id="meta-coins">0</span></div>' +
      '<div class="meta-rankbadge" id="meta-rankbadge">' +
      '<span class="mr-emoji" id="meta-rank-emoji">🌱</span>' +
      '<div class="mr-info"><span class="mr-name" id="meta-rank-name"></span>' +
      '<div class="mr-bar"><div class="mr-fill" id="meta-rank-fill"></div></div>' +
      '<span class="mr-next" id="meta-rank-next"></span></div></div>';
    start.appendChild(bar);

    // 收藏册 + 每日礼物按钮行（标签 data-i18n，语言切换时由 hydrate 重刷）
    const row = $create('div', 'meta-btnrow');
    const gBtn = $create('button', 'meta-iconbtn', '🎁<span class="mib-label" data-i18n="menu.gallery"></span>');
    gBtn.id = 'meta-gallery-btn';
    gBtn.addEventListener('click', () => { this._snd('button'); this.openGallery(); });
    const dBtn = $create('button', 'meta-iconbtn', '🎀<span class="mib-label" data-i18n="menu.dailyGift"></span><span class="mib-dot" id="meta-daily-dot"></span>');
    dBtn.id = 'meta-daily-btn';
    dBtn.addEventListener('click', () => { this._snd('button'); this.claimDailyFlow(); });
    row.appendChild(gBtn);
    row.appendChild(dBtn);
    // 放在皮肤行之前，开始按钮之上
    const startBtn = document.getElementById('start-btn');
    start.insertBefore(row, startBtn);

    // 生日常驻横幅（当天）
    const banner = $create('div', 'meta-bday-banner hidden');
    banner.id = 'meta-bday-banner';
    banner.setAttribute('data-i18n', 'birthday.banner');
    start.insertBefore(banner, bar.nextSibling);
  },

  renderMenu() {
    const coinsEl = document.getElementById('meta-coins');
    if (coinsEl) coinsEl.textContent = compactNum(Meta.coins());
    const r = Meta.rank();
    const em = document.getElementById('meta-rank-emoji');
    const nm = document.getElementById('meta-rank-name');
    const fill = document.getElementById('meta-rank-fill');
    const next = document.getElementById('meta-rank-next');
    if (em) em.textContent = r.tier.emoji;
    if (nm) nm.textContent = I18N.t('tier.' + r.tier.key);
    if (fill) fill.style.width = Math.round(r.progress * 100) + '%';
    if (next) next.textContent = r.next ? I18N.t('rank.next', { emoji: r.next.emoji, n: r.toNext }) : I18N.t('rank.maxed');

    const dot = document.getElementById('meta-daily-dot');
    const dbtn = document.getElementById('meta-daily-btn');
    const ready = Meta.isDailyReady();
    if (dot) dot.style.display = ready ? 'block' : 'none';
    if (dbtn) dbtn.classList.toggle('ready', ready);

    // NEW 红点在收藏册按钮
    const gbtn = document.getElementById('meta-gallery-btn');
    if (gbtn) gbtn.classList.toggle('has-new', Meta.hasAnyNew());

    // 生日横幅
    const banner = document.getElementById('meta-bday-banner');
    if (banner) banner.classList.toggle('hidden', !Meta.isBirthdayToday());
  },

  // ================= 收藏册 gallery =================
  _buildGallery() {
    const g = $create('div', 'overlay meta-overlay hidden');
    g.id = 'meta-gallery';
    g.innerHTML =
      '<div class="mg-head"><div class="mg-title" data-i18n="gallery.title"></div>' +
      '<button class="meta-close" id="meta-gallery-close">✕</button></div>' +
      '<div class="mg-count"><span id="mg-count-txt"></span>' +
      '<div class="mg-cbar"><div class="mg-cfill" id="mg-cfill"></div></div></div>' +
      '<div class="mg-grid" id="mg-grid"></div>';
    document.getElementById('app').appendChild(g);
    document.getElementById('meta-gallery-close').addEventListener('click', () => { this._snd('button'); this.closeGallery(); });
  },

  openGallery() {
    this._renderGallery();
    document.getElementById('meta-gallery').classList.remove('hidden');
  },
  closeGallery() {
    document.getElementById('meta-gallery').classList.add('hidden');
    this.renderMenu();
    if (this._cb.onGalleryClose) this._cb.onGalleryClose();
  },

  _renderGallery() {
    const grid = document.getElementById('mg-grid');
    const owned = Meta.ownedCount();
    document.getElementById('mg-count-txt').textContent = I18N.t('gallery.collected', { n: owned, total: COLLECTION_TOTAL });
    document.getElementById('mg-cfill').style.width = Math.round(owned / COLLECTION_TOTAL * 100) + '%';
    grid.innerHTML = '';
    const selId = Meta.selectedSkinId();
    for (let i = 0; i < SKIN_CATALOG.length; i++) {
      const sk = SKIN_CATALOG[i];
      const isOwned = Meta.isOwned(sk.id);
      const rarity = RARITY[sk.rarity];
      const cell = $create('div', 'mg-cell rar-' + sk.rarity + (isOwned ? '' : ' locked') + (sk.id === selId ? ' selected' : ''));
      cell.style.setProperty('--rar', rarity.color);

      const sw = $create('div', 'mg-swatch');
      if (isOwned) applySwatch(sw, sk);
      cell.appendChild(sw);

      if (isOwned) {
        cell.appendChild($create('div', 'mg-name', skinName(sk)));
        cell.appendChild($create('div', 'mg-tag', rarityLabel(sk.rarity)));
        if (Meta.isNew(sk.id)) cell.appendChild($create('span', 'mg-new', 'NEW'));
        if (sk.id === selId) cell.appendChild($create('span', 'mg-check', '✓'));
        cell.addEventListener('click', () => {
          Meta.selectSkin(sk.id);
          Meta.clearNew(sk.id);
          this._snd('button');
          if (this._cb.onSkinSelect) this._cb.onSkinSelect(sk.id);
          this._renderGallery();
        });
      } else if (sk.birthdayOnly) {
        // 生日限定：只能由生日彩蛋赠送，绝不进金币经济。剪影 + 🎂 提示，无购买按钮。
        sw.classList.add('silhouette');
        sw.innerHTML = '<span class="mg-cake">🎂</span>';
        cell.appendChild($create('div', 'mg-tag', rarityLabel(sk.rarity)));
        cell.appendChild($create('div', 'mg-bday-hint', I18N.t('gallery.birthdayOnly')));
      } else {
        sw.classList.add('silhouette');
        sw.innerHTML = '<span class="mg-q">?</span>';
        cell.appendChild($create('div', 'mg-tag', rarityLabel(sk.rarity)));
        const can = Meta.canBuy(sk.id);
        const buy = $create('button', 'mg-buy' + (can ? '' : ' cant'), '🪙 ' + rarity.price);
        buy.addEventListener('click', (e) => {
          e.stopPropagation();
          if (Meta.buySkin(sk.id)) {
            this._snd('milestone');
            confettiBurst({ count: 60, gold: true, origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 } });
            if (this._cb.onSkinSelect) this._cb.onSkinSelect(sk.id);
            this._renderGallery();
          } else {
            this._snd('button');
            buy.classList.remove('shake'); void buy.offsetWidth; buy.classList.add('shake');
          }
        });
        cell.appendChild(buy);
      }
      grid.appendChild(cell);
    }
  },

  // ================= 宝箱开箱序列 =================
  _buildChest() {
    const c = $create('div', 'overlay meta-overlay hidden');
    c.id = 'meta-chest';
    c.innerHTML =
      '<div class="mc-stage" id="mc-stage">' +
      '<div class="mc-box" id="mc-box">📦</div>' +
      '<div class="mc-reward hidden" id="mc-reward"></div>' +
      '</div><div class="mc-tap" data-i18n="chest.tap"></div>';
    document.getElementById('app').appendChild(c);
    // 点击加速跳过（SPEC §5.3/§5.4）——与结算/晋升覆盖层一致
    c.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      this._bump();
    });
  },

  // chest: {tier, coins, newSkinId, extraCoins}; opts:{gift:false}
  async openChestSequence(chest, opts) {
    opts = opts || {};
    const overlay = document.getElementById('meta-chest');
    const stage = document.getElementById('mc-stage');
    const box = document.getElementById('mc-box');
    const reward = document.getElementById('mc-reward');
    let raysHandle = null;
    try {
      this._resetStep();
      reward.classList.add('hidden');
      reward.innerHTML = '';
      box.classList.remove('hidden', 'mc-shake');
      const tierInfo = { wood: '📦', silver: '🎁', gold: '🏆', rainbow: '🌈' };
      box.textContent = opts.gift ? '🎀' : (tierInfo[chest.tier] || '📦');
      overlay.classList.remove('hidden');

      // 抖动 3 次（tick 渐强）
      for (let i = 0; i < 3; i++) {
        box.classList.remove('mc-shake'); void box.offsetWidth; box.classList.add('mc-shake');
        this._snd('button');
        await this._sleep(220);
        if (this._stepSkip) break;
      }

      // 白光爆 + 彩带
      const cx = window.innerWidth / 2, cy = window.innerHeight * 0.42;
      const isNew = !!chest.newSkinId;
      lightBurst({ x: cx, y: cy }, { size: isNew ? 380 : 300 });
      confettiBurst({ count: isNew ? 120 : 70, gold: isNew, origin: { x: cx, y: cy } });
      box.classList.add('hidden');

      // 组装奖励卡
      const sk = chest.newSkinId ? skinById(chest.newSkinId) : null;
      if (sk) {
        const rarity = RARITY[sk.rarity];
        reward.className = 'mc-reward rar-' + sk.rarity;
        reward.style.setProperty('--rar', rarity.color);
        const sw = $create('div', 'mc-swatch');
        applySwatch(sw, sk);
        reward.appendChild(sw);
        reward.appendChild($create('div', 'mc-newbadge', I18N.t('chest.newBadge')));
        reward.appendChild($create('div', 'mc-skname', skinName(sk)));
        reward.appendChild($create('div', 'mc-sktag', I18N.t('gallery.skinTag', { rarity: rarityLabel(sk.rarity) })));
        const coinLine = chest.coins > 0 ? '<div class="mc-coins">🪙 +' + chest.coins + '</div>' : '';
        reward.insertAdjacentHTML('beforeend', coinLine);
        if (sk.rarity === 'legendary') raysHandle = rays(stage, { size: 420, color: 'rgba(255,220,120,0.5)' });
        this._snd('milestone');
        confettiBurst({ count: 90, gold: true, origin: { x: cx, y: cy } });
      } else {
        reward.className = 'mc-reward rar-coins';
        reward.appendChild($create('div', 'mc-coinbig', '🪙'));
        reward.appendChild($create('div', 'mc-coins', '+' + chest.coins));
        if (chest.extraCoins > 0) reward.appendChild($create('div', 'mc-extra', I18N.t('chest.extraCoins', { n: chest.extraCoins })));
        this._snd('bigOrb');
      }
      reward.classList.remove('hidden');
      reward.classList.remove('mc-pop'); void reward.offsetWidth; reward.classList.add('mc-pop');

      this._resetStep();
      await this._sleep(opts.gift ? 2200 : 1500);
    } finally {
      overlay.classList.add('hidden');
      if (raysHandle) raysHandle.remove();
    }
  },

  // ================= 赛后结算流程 =================
  _buildResults() {
    const r = $create('div', 'overlay meta-overlay hidden');
    r.id = 'meta-results';
    r.innerHTML =
      '<div class="mrs-panel" id="mrs-panel">' +
      '<div class="mrs-title" id="mrs-title" data-i18n="results.title"></div>' +
      '<div class="mrs-newbest hidden" id="mrs-newbest" data-i18n="results.newBest"></div>' +
      '<div class="mrs-stats">' +
      '<div class="mrs-stat"><span class="mrs-val" id="mrs-length">0</span><span class="mrs-key" data-i18n="results.length"></span></div>' +
      '<div class="mrs-stat"><span class="mrs-val" id="mrs-kills">0</span><span class="mrs-key" data-i18n="results.kills"></span></div>' +
      '<div class="mrs-stat"><span class="mrs-val" id="mrs-rank">-</span><span class="mrs-key" data-i18n="results.rank"></span></div>' +
      '</div>' +
      '<div class="mrs-wallet">🪙 <span id="mrs-coins">0</span></div>' +
      '<div class="mrs-trophy">' +
      '<span class="mrs-remoji" id="mrs-remoji">🌱</span>' +
      '<div class="mrs-tbar"><div class="mrs-tfill" id="mrs-tfill"></div></div>' +
      '<span class="mrs-delta" id="mrs-delta"></span></div>' +
      '</div>' +
      '<div class="mrs-actions">' +
      '<button class="big-btn" id="mrs-again" data-i18n="results.again"></button>' +
      '<div class="mrs-sub">' +
      '<button class="small-btn" id="mrs-gallery">🎁 <span data-i18n="results.gallery"></span></button>' +
      '<button class="small-btn" id="mrs-menu" data-i18n="results.menu"></button></div></div>';
    document.getElementById('app').appendChild(r);

    r.addEventListener('click', (e) => {
      // 点击面板空白处加速当前步；按钮自身除外
      if (e.target.closest('button')) return;
      this._bump();
    });
    document.getElementById('mrs-again').addEventListener('click', () => { this._snd('button'); this._hideResults(); if (this._cb.onPlayAgain) this._cb.onPlayAgain(); });
    document.getElementById('mrs-menu').addEventListener('click', () => { this._snd('button'); this._hideResults(); if (this._cb.onMenu) this._cb.onMenu(); });
    document.getElementById('mrs-gallery').addEventListener('click', () => { this._snd('button'); this.openGallery(); });
  },

  _hideResults() { document.getElementById('meta-results').classList.add('hidden'); },

  // result 来自 Meta.reportMatch()
  async showResults(result) {
    const overlay = document.getElementById('meta-results');
    const actions = overlay.querySelector('.mrs-actions');
    try {
      // 成绩静态填充
      document.getElementById('mrs-length').textContent = compactNum(result.length);
      document.getElementById('mrs-kills').textContent = result.kills;
      document.getElementById('mrs-rank').textContent = '#' + result.rank;
      const nb = document.getElementById('mrs-newbest');
      nb.classList.toggle('hidden', !result.newBest);
      const coinsEl = document.getElementById('mrs-coins');
      coinsEl.textContent = compactNum(result.coins.start);
      // 段位条初始
      const tb = result.trophies;
      document.getElementById('mrs-remoji').textContent = tb.rankBefore.tier.emoji;
      document.getElementById('mrs-tfill').style.width = Math.round(tb.rankBefore.progress * 100) + '%';
      document.getElementById('mrs-delta').textContent = '';
      actions.style.visibility = 'hidden';

      overlay.classList.remove('hidden');

      // 1) 面板滑入 + 破纪录彩带
      this._resetStep();
      if (result.newBest) confettiBurst({ count: 90, origin: { x: window.innerWidth / 2, y: window.innerHeight * 0.28 } });
      await this._sleep(500);

      // 2) 金币计数上滚（旧值→本局后）
      this._resetStep();
      this._snd('bigOrb');
      await countUp(coinsEl, result.coins.start, result.coins.afterMatch, { dur: 900, shouldSkip: () => this._stepSkip });

      // 3) 段位星条填充；跨段 → 晋升庆典
      this._resetStep();
      document.getElementById('mrs-delta').textContent = '+' + tb.delta + '★';
      document.getElementById('mrs-delta').classList.remove('mrs-pop'); void document.getElementById('mrs-delta').offsetWidth;
      document.getElementById('mrs-delta').classList.add('mrs-pop');
      if (tb.rankedUp) {
        document.getElementById('mrs-tfill').style.width = '100%';
        await this._sleep(400);
        await this._rankUpCeremony(tb.rankBefore, tb.rankAfter);
        document.getElementById('mrs-remoji').textContent = tb.rankAfter.tier.emoji;
        document.getElementById('mrs-tfill').style.width = Math.round(tb.rankAfter.progress * 100) + '%';
      } else {
        document.getElementById('mrs-tfill').style.width = Math.round(tb.rankAfter.progress * 100) + '%';
        await this._sleep(650);
      }

      // 4) 宝箱开箱序列
      this._resetStep();
      await this.openChestSequence(result.chest);
      // 箱内金币回填到钱包显示
      coinsEl.textContent = compactNum(result.coins.afterChest);
    } catch (e) {
      // 任何异常都不能把孩子卡住
    } finally {
      // 5) 露出「再来一局」
      actions.style.visibility = 'visible';
    }
  },

  // 段位晋升庆典
  async _rankUpCeremony(before, after) {
    const ov = document.getElementById('meta-rankup') || this._buildRankUp();
    const oldB = document.getElementById('mru-old');
    const newB = document.getElementById('mru-new');
    const nameEl = document.getElementById('mru-name');
    let raysHandle = null;
    try {
      oldB.textContent = before.tier.emoji;
      newB.textContent = after.tier.emoji;
      nameEl.textContent = I18N.t('tier.' + after.tier.key);
      nameEl.style.color = after.tier.color;
      ov.classList.remove('hidden');
      raysHandle = rays(document.getElementById('mru-stage'), { size: 400, color: 'rgba(255,255,255,0.35)' });
      this._resetStep();
      newB.classList.remove('mru-burst'); void newB.offsetWidth; newB.classList.add('mru-burst');
      lightBurst({ x: window.innerWidth / 2, y: window.innerHeight * 0.42 }, { size: 360 });
      confettiBurst({ count: 110, gold: true, origin: { x: window.innerWidth / 2, y: window.innerHeight * 0.42 } });
      this._snd('milestone');
      await this._sleep(1800);
    } finally {
      if (raysHandle) raysHandle.remove();
      ov.classList.add('hidden');
    }
  },
  _buildRankUp() {
    const ov = $create('div', 'overlay meta-overlay meta-rankup hidden');
    ov.id = 'meta-rankup';
    ov.innerHTML =
      '<div class="mru-stage" id="mru-stage">' +
      '<div class="mru-label" data-i18n="rankup.title"></div>' +
      '<div class="mru-badges"><span class="mru-old" id="mru-old">🌱</span>' +
      '<span class="mru-arrow">➜</span><span class="mru-new" id="mru-new">🥉</span></div>' +
      '<div class="mru-name" id="mru-name"></div></div>';
    document.getElementById('app').appendChild(ov);
    I18N.hydrate(ov); // 惰性构建：立即注水静态文案（其余覆盖层在 init 后由全局 hydrate 覆盖）
    ov.addEventListener('click', () => this._bump());
    return ov;
  },

  // ================= 连杀弹窗 =================
  _buildStreak() {
    const s = $create('div', 'meta-streak hidden');
    s.id = 'meta-streak';
    document.getElementById('app').appendChild(s);
  },
  streakPopup(text, level) {
    const s = document.getElementById('meta-streak');
    if (!s) return;
    s.textContent = text;
    s.className = 'meta-streak lv' + Math.min(4, level);
    s.classList.remove('show'); void s.offsetWidth; s.classList.add('show');
    clearTimeout(this._streakTimer);
    this._streakTimer = setTimeout(() => { s.classList.remove('show'); s.classList.add('hidden'); }, 1100);
    s.classList.remove('hidden');
  },

  // ================= 每日礼物 =================
  _buildDailyPrompt() {
    const p = $create('div', 'overlay meta-overlay hidden');
    p.id = 'meta-daily-prompt';
    p.innerHTML =
      '<div class="mdp-card">' +
      '<div class="mdp-mascot">🐍</div>' +
      '<div class="mdp-title" data-i18n="daily.title"></div>' +
      '<div class="mdp-box">🎀</div>' +
      '<button class="big-btn" id="mdp-open" data-i18n="daily.open"></button>' +
      '<button class="small-btn" id="mdp-later" data-i18n="daily.later"></button></div>';
    document.getElementById('app').appendChild(p);
    document.getElementById('mdp-open').addEventListener('click', () => {
      this._snd('button');
      p.classList.add('hidden');
      this.claimDailyFlow();
    });
    document.getElementById('mdp-later').addEventListener('click', () => { this._snd('button'); p.classList.add('hidden'); });
  },

  // 进主菜单时若就绪，递上礼物（每会话只自动弹一次；红点常驻）
  maybeDailyGift() {
    if (this._dailyPromptedSession) return;
    if (!Meta.isDailyReady()) return;
    this._dailyPromptedSession = true;
    document.getElementById('meta-daily-prompt').classList.remove('hidden');
  },

  async claimDailyFlow() {
    const res = Meta.claimDaily();
    if (!res) return; // 未就绪：什么也不发生（零愧疚）
    await this.openChestSequence(res, { gift: true });
    this.renderMenu();
  },

  // ================= 生日庆典 =================
  _buildBirthday() {
    const b = $create('div', 'overlay meta-overlay hidden');
    b.id = 'meta-birthday';
    b.innerHTML =
      '<div class="mbd-stage">' +
      '<div class="mbd-cake">🎂</div>' +
      '<div class="mbd-title" data-i18n="birthday.title"></div>' +
      '<div class="mbd-sub" data-i18n="birthday.sub"></div>' +
      '<button class="big-btn" id="mbd-go" data-i18n="birthday.openGift"></button></div>';
    document.getElementById('app').appendChild(b);
  },

  // firstToday=true 时放完整彩蛋
  async birthdayCelebration(info) {
    if (!info || !info.triggered) return;
    this.renderMenu(); // 常驻横幅
    if (!info.firstToday) return; // 当天已放过，只留横幅
    const b = document.getElementById('meta-birthday');
    b.classList.remove('hidden');
    // 满屏金色彩带 + 生日旋律
    confettiBurst({ count: 160, gold: true, origin: { x: window.innerWidth / 2, y: window.innerHeight * 0.35 } });
    this._snd('birthday');
    setTimeout(() => confettiBurst({ count: 120, gold: true, origin: { x: window.innerWidth * 0.3, y: window.innerHeight * 0.3 } }), 700);

    await new Promise((resolve) => {
      const go = document.getElementById('mbd-go');
      const handler = () => { go.removeEventListener('click', handler); resolve(); };
      go.addEventListener('click', handler);
    });
    b.classList.add('hidden');
    // 赠送生日限定皮肤（已在 Meta.checkBirthday 中入账），开箱式呈现
    await this.openChestSequence({ tier: 'rainbow', coins: 0, newSkinId: info.skinId, extraCoins: 0 }, { gift: true });
    this.renderMenu();
  },

  // ================= 语言切换实时重渲染 =================
  // 由 main.js 在 I18N.onChange 中调用（全局静态文案已由 I18N.hydrate 重刷）。
  // 这里刷新数据驱动、动态构建的部分：菜单钱包/段位牌，以及打开中的收藏册。
  relocalize() {
    this.renderMenu();
    const g = document.getElementById('meta-gallery');
    if (g && !g.classList.contains('hidden')) this._renderGallery();
  },
};
