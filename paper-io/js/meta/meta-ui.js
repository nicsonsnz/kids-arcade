// meta-ui.js — 养成覆盖层 UI：菜单钱包/段位、收藏册、开箱、赛后结算、每日礼物、生日彩蛋。
// 全部 HTML/CSS 覆盖层（非游戏热循环）；异步流程用 promise/await 顺序编排，可点击加速跳过。
import { Meta } from './meta.js';
import { MetaFX } from './meta-fx.js';
import { Audio } from '../audio.js';
import { RARITY } from './meta-config.js';
import { I18N } from '../i18n.js';

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function rarityColor(r) { return (RARITY[r] && RARITY[r].color) || '#9e9e9e'; }
function rarityName(r) { return I18N.rarityName(r); }
function fmt(n) { return MetaFX.compactNumber(n); }
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 菜单里的 DOM（在 index.html 中）
const menuRefs = {};
// 动态覆盖层根
let root = null;
let cbs = { onReplay: () => {}, onMenu: () => {}, onGallery: () => {} };

function ensureRoot() {
  if (root) return root;
  root = h('div', 'meta-root hidden');
  document.body.appendChild(root);
  return root;
}
function openRoot() { ensureRoot().classList.remove('hidden'); }
function closeRoot() { if (root) { root.classList.add('hidden'); root.innerHTML = ''; } MetaUI._openView = null; }

export const MetaUI = {
  _openView: null, // 当前打开的养成覆盖层（'collection' 等），用于语言切换时重绘

  // 语言切换回调：菜单钱包/段位即时刷新，若收藏册正在打开则整册重绘。
  onLangChange() {
    this.refreshMenu();
    if (root && !root.classList.contains('hidden') && this._openView === 'collection') {
      this.openCollection();
    }
  },

  init(callbacks) {
    cbs = Object.assign(cbs, callbacks || {});
    menuRefs.wallet = document.getElementById('wallet-coins');
    menuRefs.rankBadge = document.getElementById('rank-badge');
    menuRefs.btnCollection = document.getElementById('btn-collection');
    menuRefs.btnDaily = document.getElementById('btn-daily');
    menuRefs.collDot = document.getElementById('coll-dot');
    menuRefs.birthdayBanner = document.getElementById('birthday-banner');
    ensureRoot();

    if (menuRefs.btnCollection) menuRefs.btnCollection.addEventListener('click', () => { Audio.click(); this.openCollection(); });
    if (menuRefs.btnDaily) menuRefs.btnDaily.addEventListener('click', () => { Audio.click(); this.showDailyGift(); });
    if (menuRefs.rankBadge) menuRefs.rankBadge.addEventListener('click', () => { Audio.click(); this.openCollection(); });
  },

  // 键盘兜底（PLATFORM §5）：从任意覆盖层直接再来一局，等价于结算页“再来一局”按钮。
  triggerReplay() { closeRoot(); cbs.onReplay(); },

  // ---------- 主菜单钱包 + 段位 + 每日礼物按钮 ----------
  refreshMenu() {
    const coins = Meta.getCoins();
    const rank = Meta.getRank();
    if (menuRefs.wallet) menuRefs.wallet.textContent = fmt(coins);
    if (menuRefs.rankBadge) {
      const toNext = rank.next
        ? I18N.t('rankBadge.toNext', { emoji: rank.next.emoji, n: rank.toNext })
        : I18N.t('rankBadge.maxed');
      menuRefs.rankBadge.innerHTML =
        '<span class="rb-emoji">' + rank.emoji + '</span>' +
        '<span class="rb-mid"><span class="rb-name">' + I18N.rankName(rank.key) + '</span>' +
        '<span class="rb-bar"><i style="width:' + Math.round(rank.progress * 100) + '%"></i></span></span>' +
        '<span class="rb-next">' + toNext + '</span>';
    }
    // 每日礼物：就绪才显示（红点跳动）；未就绪隐藏，绝无倒计时/愧疚（SPEC §0/§3.5）
    if (menuRefs.btnDaily) menuRefs.btnDaily.classList.toggle('hidden', !Meta.isDailyReady());
    // 收藏册红点：有 NEW 皮肤
    if (menuRefs.collDot) menuRefs.collDot.classList.toggle('hidden', !Meta.hasAnyNew());
    // 生日横幅（当天常驻）
    if (menuRefs.birthdayBanner) {
      if (Meta.isBirthdayToday()) {
        const info = Meta.birthdayInfo();
        menuRefs.birthdayBanner.textContent = info.age
          ? I18N.t('birthday.banner', { name: info.name, age: info.age, ageOrd: I18N.ordinal(info.age) })
          : I18N.t('birthday.bannerNoAge', { name: info.name });
        menuRefs.birthdayBanner.classList.remove('hidden');
      } else {
        menuRefs.birthdayBanner.classList.add('hidden');
      }
    }
  },

  // ---------- 收藏册 gallery ----------
  openCollection() {
    openRoot();
    this._openView = 'collection';
    root.innerHTML = '';
    const screen = h('div', 'meta-screen coll-screen');
    const collected = Meta.collectedCount();
    const total = Meta.totalSkins();
    const header = h('div', 'coll-header');
    header.innerHTML =
      '<div class="coll-title">' + I18N.t('collection.title') + '</div>' +
      '<div class="coll-count">' + I18N.t('collection.collected', { c: '<b id="coll-collected">' + collected + '</b>', n: total }) + '</div>' +
      '<div class="coll-progress"><i id="coll-progress-bar" style="width:' + Math.round(collected / total * 100) + '%"></i></div>' +
      '<div class="coll-wallet">🪙 <b id="coll-wallet-coins">' + fmt(Meta.getCoins()) + '</b></div>';
    screen.appendChild(header);

    // 刷新顶部「已收集 X / N」计数与进度条（购买/解锁后调用）
    const refreshHeader = () => {
      const c = Meta.collectedCount();
      const cEl = document.getElementById('coll-collected');
      const pEl = document.getElementById('coll-progress-bar');
      const wEl = document.getElementById('coll-wallet-coins');
      if (cEl) cEl.textContent = c;
      if (pEl) pEl.style.width = Math.round(c / total * 100) + '%';
      if (wEl) wEl.textContent = fmt(Meta.getCoins());
    };

    const grid = h('div', 'coll-grid');
    const buildCards = () => {
      grid.innerHTML = '';
      const items = Meta.getCollection();
      const curSel = Meta.getSelectedSkinId();
      for (const it of items) {
        const card = h('button', 'skin-cell');
        card.style.setProperty('--rar', it.color);
        card.classList.add('rar-' + it.rarity);
        if (it.owned && it.id === curSel) card.classList.add('selected');
        if (!it.owned) card.classList.add('unowned');
        let inner = '';
        if (it.owned) {
          inner += '<div class="cell-emoji">' + it.emoji + '</div>';
          if (it.isNew) inner += '<div class="cell-new">NEW</div>';
        } else {
          inner += '<div class="cell-emoji silhouette">' + it.emoji + '</div>';
          inner += '<div class="cell-q">?</div>';
        }
        inner += '<div class="cell-name">' + (it.owned ? it.name : I18N.t('collection.unknownName')) + '</div>';
        inner += '<div class="cell-rar" style="color:' + it.color + '">' + it.rarityName + '</div>';
        if (!it.owned) {
          if (it.birthday) {
            inner += '<div class="cell-buy birthday-tag">' + I18N.t('collection.birthdayTag') + '</div>';
          } else {
            const afford = Meta.getCoins() >= it.price;
            inner += '<div class="cell-buy' + (afford ? ' afford' : '') + '">🪙 ' + it.price + '</div>';
          }
        }
        card.innerHTML = inner;
        card.addEventListener('click', () => {
          if (it.owned) {
            Audio.click();
            Meta.selectSkin(it.id);
            Meta.clearNew(it.id);
            buildCards();
          } else if (!it.birthday) {
            const res = Meta.buySkin(it.id);
            if (res.ok) {
              Audio.fanfare();
              MetaFX.confettiBurst({ gold: true, count: 90 });
              buildCards();
              refreshHeader();
            } else {
              Audio.click();
              card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
            }
          }
        });
        grid.appendChild(card);
      }
    };
    buildCards();
    screen.appendChild(grid);

    const close = h('button', 'meta-btn big', I18N.t('collection.back'));
    close.addEventListener('click', () => { Audio.click(); Meta.clearAllNew(); closeRoot(); cbs.onGallery && cbs.onGallery(); this.refreshMenu(); });
    screen.appendChild(close);
    root.appendChild(screen);
  },

  // ---------- 连杀弹窗（不阻塞，SPEC §8）----------
  showKillStreak(level) {
    Audio.streakHit(level);
    const label = level >= 4 ? I18N.t('streak.unstoppable') : (level === 3 ? I18N.t('streak.triple') : I18N.t('streak.double'));
    const emoji = level >= 4 ? '🔥' : (level === 3 ? '⚡' : '✨');
    const pop = h('div', 'streak-pop lvl' + Math.min(level, 4), emoji + ' ' + label);
    document.body.appendChild(pop);
    requestAnimationFrame(() => pop.classList.add('show'));
    setTimeout(() => { pop.classList.add('out'); setTimeout(() => pop.remove(), 400); }, 1100);
  },

  // ---------- 赛后结算流程（async 顺序编排，SPEC §5.4）----------
  async showResults(data) {
    const stats = data.stats || {};
    const report = data.report;
    openRoot();
    root.innerHTML = '';
    const screen = h('div', 'meta-screen results-screen');
    this._skipEl = screen;

    // 面板：成绩 + 钱包 + 段位条
    const title = data.isVictory ? I18N.t('results.victory') : I18N.t('results.normal');
    screen.innerHTML =
      '<div class="res-title">' + title + '</div>' +
      (stats.isRecord ? '<div class="res-record">' + I18N.t('results.record') + '</div>' : '') +
      '<div class="res-stats">' +
        '<div class="res-row"><span>' + I18N.t('results.land') + '</span><b>' + (stats.pct != null ? stats.pct.toFixed(1) + '%' : '-') + '</b></div>' +
        '<div class="res-row"><span>' + I18N.t('results.kills') + '</span><b>' + (stats.kills || 0) + '</b></div>' +
        '<div class="res-row"><span>' + I18N.t('results.rank') + '</span><b>' + (stats.rank ? I18N.t('results.rankValue', { n: stats.rank }) : '-') + '</b></div>' +
        '<div class="res-row"><span>' + I18N.t('results.time') + '</span><b>' + (stats.timeStr || '-') + '</b></div>' +
      '</div>' +
      '<div class="res-coins">🪙 <b id="res-coins">' + fmt(report.coins.from) + '</b>' +
        '<span class="res-earn" id="res-earn"></span></div>' +
      '<div class="res-trophy">' +
        '<div class="res-rank" id="res-rank"></div>' +
        '<div class="res-trophy-bar"><i id="res-trophy-fill"></i></div>' +
        '<div class="res-trophy-delta" id="res-trophy-delta"></div>' +
      '</div>' +
      '<div class="res-chest-slot" id="res-chest-slot"></div>' +
      '<div class="res-hint" id="res-hint">' + I18N.t('results.tapContinue') + '</div>' +
      '<div class="res-buttons hidden" id="res-buttons"></div>';
    root.appendChild(screen);

    const coinEl = document.getElementById('res-coins');
    const rankEl = document.getElementById('res-rank');
    const fillEl = document.getElementById('res-trophy-fill');
    const deltaEl = document.getElementById('res-trophy-delta');

    try {
      // 步骤1：成绩滑入
      screen.classList.add('reveal');
      if (stats.isRecord) MetaFX.confettiBurst({ gold: true, count: 120 });
      await this._waitOrSkip(600);

      // 步骤2：金币计数上滚
      document.getElementById('res-earn').textContent = '+' + fmt(report.coins.earned);
      await this._countTo(coinEl, report.coins.from, report.coins.to);
      Audio.coinTick();

      // 步骤3：段位星条 + 晋升
      deltaEl.textContent = '+' + report.trophy.delta + '★';
      const from = report.trophy.from, to = report.trophy.to;
      const rankUp = report.rankUp;
      const rfrom = rankUp ? rankUp.from : Meta.rankOf(from);
      const rto = rankUp ? rankUp.to : Meta.rankOf(to);
      rankEl.innerHTML = rfrom.emoji + ' ' + I18N.rankName(rfrom.key);
      fillEl.style.transition = 'none';
      fillEl.style.width = Math.round(rfrom.progress * 100) + '%';
      void fillEl.offsetWidth;
      fillEl.style.transition = 'width 0.7s ease';
      if (!rankUp) {
        fillEl.style.width = Math.round(rto.progress * 100) + '%';
        await this._waitOrSkip(750);
      } else {
        fillEl.style.width = '100%';
        await this._waitOrSkip(600);
        await this._rankUpCeremony(rankUp.from, rankUp.to);
        rankEl.innerHTML = rto.emoji + ' ' + I18N.rankName(rto.key);
        fillEl.style.transition = 'none';
        fillEl.style.width = '0%';
        void fillEl.offsetWidth;
        fillEl.style.transition = 'width 0.7s ease';
        fillEl.style.width = Math.round(rto.progress * 100) + '%';
        await this._waitOrSkip(600);
      }

      // 步骤4：宝箱开箱
      if (report.chest) {
        const result = Meta.openChest(report.chest);
        await this._chestSequence(document.getElementById('res-chest-slot'), result);
        // 宝箱金币并入钱包展示
        await this._countTo(coinEl, result.from, result.to);
      }
    } catch (e) {
      // try/finally 保证异常也不会把孩子卡在黑覆盖层里（SPEC §5.4）
    } finally {
      const hint = document.getElementById('res-hint');
      if (hint) hint.classList.add('hidden');
      this._showResultButtons(data);
    }
  },

  _showResultButtons(data) {
    const box = document.getElementById('res-buttons');
    if (!box) return;
    box.innerHTML = '';
    const replay = h('button', 'meta-btn big primary', I18N.t('results.replay'));
    replay.addEventListener('click', () => { Audio.click(); closeRoot(); cbs.onReplay(); });
    const gallery = h('button', 'meta-btn', I18N.t('results.collection'));
    gallery.addEventListener('click', () => { Audio.click(); this.openCollection(); });
    const menu = h('button', 'meta-btn', I18N.t('results.menu'));
    menu.addEventListener('click', () => { Audio.click(); closeRoot(); cbs.onMenu(); });
    box.appendChild(replay);
    const row = h('div', 'res-btn-row');
    row.appendChild(gallery); row.appendChild(menu);
    box.appendChild(row);
    box.classList.remove('hidden');
  },

  // 等待固定时长或点击跳过
  _waitOrSkip(ms) {
    return new Promise((res) => {
      let done = false;
      const el = this._skipEl;
      const finish = () => { if (done) return; done = true; clearTimeout(tid); if (el) el.removeEventListener('click', finish); res(); };
      const tid = setTimeout(finish, ms);
      if (el) el.addEventListener('click', finish, { once: true });
      else setTimeout(finish, ms);
    });
  },

  // 计数上滚 + 可跳过
  async _countTo(el, from, to) {
    if (!el) return;
    const dur = Math.min(1400, 450 + Math.abs(to - from) * 3);
    const p = MetaFX.countUp(el, from, to, { durMs: dur });
    const sk = () => MetaFX.finishCountUp(el);
    if (this._skipEl) this._skipEl.addEventListener('click', sk, { once: true });
    await p;
    if (this._skipEl) this._skipEl.removeEventListener('click', sk);
  },

  // 段位晋升庆典（SPEC §5.5 / §6）
  async _rankUpCeremony(from, to) {
    Audio.fanfare();
    const ov = h('div', 'rankup-overlay');
    ov.innerHTML =
      '<div class="rankup-inner">' +
        '<div class="rankup-label">' + I18N.t('rankUp.title') + '</div>' +
        '<div class="rankup-badges">' +
          '<span class="rankup-old">' + from.emoji + '</span>' +
          '<span class="rankup-arrow">➜</span>' +
          '<span class="rankup-new">' + to.emoji + '</span>' +
        '</div>' +
        '<div class="rankup-name">' + I18N.rankName(to.key) + '</div>' +
        '<div class="rankup-tip">' + I18N.t('rankUp.tip') + '</div>' +
      '</div>';
    (root || document.body).appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    MetaFX.lightBurst({ color: '#ffd24a' });
    MetaFX.confettiBurst({ gold: true, count: 160 });
    await new Promise((res) => {
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(tid); res(); };
      const tid = setTimeout(finish, 2400);
      ov.addEventListener('click', finish, { once: true });
    });
    ov.classList.add('out');
    await delay(280);
    ov.remove();
  },

  // 宝箱开箱序列（SPEC §5.3）：抖动 → 白光爆+彩带 → 内容飞出 → NEW
  async _chestSequence(slot, result) {
    if (!slot) return;
    const legendary = result.newSkin && (result.newSkin.rarity === 'legendary');
    slot.innerHTML =
      '<div class="chest-stage">' +
        '<div class="chest-box" style="--chest:' + result.tierColor + '">' + result.tierEmoji + '</div>' +
        '<div class="chest-caption">' + I18N.chestName(result.tier) + '</div>' +
      '</div>';
    const box = slot.querySelector('.chest-box');
    // 抖动 + tick 渐强
    box.classList.add('chest-shake');
    for (let i = 0; i < 3; i++) { Audio.chestTick(i); await this._waitOrSkip(230); }
    box.classList.remove('chest-shake');
    // 爆开
    const rect = box.getBoundingClientRect();
    MetaFX.lightBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, color: legendary ? '#ffd24a' : '#ffffff', r: 340 });
    MetaFX.confettiBurst({ gold: !!(result.newSkin), count: result.newSkin ? 150 : 80, origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
    if (result.newSkin) Audio.fanfare(); else Audio.claim(2);
    // 内容
    let reveal = '<div class="chest-reward">';
    if (legendary) reveal += '<div class="chest-rays"></div>';
    if (result.newSkin) {
      const col = rarityColor(result.newSkin.rarity);
      reveal +=
        '<div class="reward-skin" style="--rar:' + col + '">' +
          '<div class="reward-new">' + I18N.t('results.newTag') + '</div>' +
          '<div class="reward-emoji">' + result.newSkin.emoji + '</div>' +
        '</div>' +
        '<div class="reward-skin-name" style="color:' + col + '">' + I18N.skinName(result.newSkin.id) +
          ' · ' + rarityName(result.newSkin.rarity) + '</div>';
    }
    let coinLine = '🪙 +' + result.coinAmt;
    if (result.extraCoins > 0) coinLine += ' <span class="reward-extra">' + I18N.t('results.extraCoins', { n: result.extraCoins }) + '</span>';
    reveal += '<div class="reward-coins">' + coinLine + '</div>';
    reveal += '</div>';
    slot.innerHTML = '<div class="chest-stage revealed">' + reveal + '</div>';
    requestAnimationFrame(() => { const r = slot.querySelector('.chest-reward'); if (r) r.classList.add('show'); });
    await this._waitOrSkip(result.newSkin ? 1200 : 700);
  },

  // ---------- 每日礼物（纯惊喜，SPEC §3.5）----------
  async showDailyGift() {
    if (!Meta.isDailyReady()) return;
    openRoot();
    root.innerHTML = '';
    const screen = h('div', 'meta-screen daily-screen');
    this._skipEl = screen;
    screen.innerHTML =
      '<div class="daily-title">' + I18N.t('daily.title') + '</div>' +
      '<div class="daily-sub">' + I18N.t('daily.sub') + '</div>' +
      '<div class="daily-gift" id="daily-gift">🎁</div>' +
      '<div class="res-chest-slot" id="daily-slot"></div>' +
      '<div class="res-buttons hidden" id="daily-buttons"></div>';
    root.appendChild(screen);
    const gift = document.getElementById('daily-gift');
    gift.classList.add('wobble');
    await new Promise((res) => {
      let done = false;
      const finish = () => { if (done) return; done = true; res(); };
      gift.addEventListener('click', finish, { once: true });
      setTimeout(finish, 6000); // 兜底自动打开，绝不卡住
    });
    gift.classList.add('hidden');
    const desc = Meta.claimDaily();
    try {
      if (desc) {
        const result = Meta.openChest(desc);
        await this._chestSequence(document.getElementById('daily-slot'), result);
      }
    } catch (e) { /* 静默 */ } finally {
      const box = document.getElementById('daily-buttons');
      const ok = h('button', 'meta-btn big primary', I18N.t('daily.ok'));
      ok.addEventListener('click', () => { Audio.click(); closeRoot(); this.refreshMenu(); });
      box.appendChild(ok);
      box.classList.remove('hidden');
    }
  },

  // ---------- 生日彩蛋（SPEC §7）----------
  async celebrateBirthday() {
    const info = Meta.celebrateBirthday(); // 授予生日皮肤 + 标记当年已展示
    openRoot();
    root.innerHTML = '';
    const screen = h('div', 'meta-screen birthday-screen');
    this._skipEl = screen;
    const bdTitle = info.age
      ? I18N.t('birthday.title', { name: info.name, age: info.age, ageOrd: I18N.ordinal(info.age) })
      : I18N.t('birthday.titleNoAge', { name: info.name });
    screen.innerHTML =
      '<div class="bd-balloons">🎈🎈🎈</div>' +
      '<div class="bd-title">' + bdTitle + '</div>' +
      '<div class="res-chest-slot" id="bd-slot"></div>' +
      '<div class="res-buttons hidden" id="bd-buttons"></div>';
    root.appendChild(screen);
    Audio.birthdaySong();
    MetaFX.confettiBurst({ gold: true, count: 220 });
    setTimeout(() => MetaFX.confettiBurst({ count: 160 }), 700);
    await this._waitOrSkip(900);
    // 生日礼物皮肤开箱式呈现
    const slot = document.getElementById('bd-slot');
    slot.innerHTML =
      '<div class="chest-stage revealed"><div class="chest-reward show">' +
        '<div class="chest-rays"></div>' +
        (info.skin ?
          '<div class="reward-skin" style="--rar:' + rarityColor('birthday') + '">' +
            '<div class="reward-new">' + I18N.t('birthday.giftTag') + '</div>' +
            '<div class="reward-emoji">' + info.skin.emoji + '</div></div>' +
          '<div class="reward-skin-name" style="color:' + rarityColor('birthday') + '">' + I18N.skinName(info.skin.id) + '</div>'
          : '') +
        '<div class="reward-coins">' + I18N.t('birthday.giftLine') + '</div>' +
      '</div></div>';
    await this._waitOrSkip(600);
    const box = document.getElementById('bd-buttons');
    const ok = h('button', 'meta-btn big primary', I18N.t('birthday.start'));
    ok.addEventListener('click', () => { Audio.click(); closeRoot(); this.refreshMenu(); });
    box.appendChild(ok);
    box.classList.remove('hidden');
  },
};
