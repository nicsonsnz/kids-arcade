# 🕹️ Leon's Arcade

Two ad-free, purchase-free, offline-capable mobile games built as a 7th-birthday gift for Leon.
给 Leon 的两款无广告、无内购、可离线的手机游戏。

**English by default, with a one-tap 中文 toggle on every screen.**

| Game | Folder | Play |
|---|---|---|
| 🍦 **Popsicle Land** (圈地大冒险) | `paper-io/` | Grab land: leave your base to draw a trail, loop back to claim everything inside. Cut rivals' trails. Goal: 100%. |
| 🐍 **Noodle Stars** (蛇蛇星球) | `snake-io/` | Eat glowing dots to grow. Block other snakes so they crash into you. Climb to #1. |

`index.html` is the arcade portal. Each game is fully self-contained (no frameworks, no dependencies, no network calls).

## 🌐 Live

**https://nicsonsnz.github.io/kids-arcade/**

Install on iPhone: open in **Safari** → Share ⬆️ → **Add to Home Screen**. Full-screen, no browser bar, **works offline**.

## 🎁 Progression (all free — the stuff Paper.io 2 hides behind ads)

- **Coins** earned every match (big satisfying count-up).
- **Chests** — one after every match, plus a free daily gift. Shake → burst → reveal.
- **20 collectible skins per game** across Common / Rare / Epic / Legendary, shown as mystery silhouettes until unlocked. Unlock via chests or buy directly with coins.
- **Pity system** — a guaranteed brand-new skin at least every 5th chest, plus ramping odds. A kid never opens a run of duds; duplicates convert to bonus coins ("extra coins!", never "already owned").
- **Rank road** — 🌱 Rookie → 🥉 Bronze → 🥈 Silver → 🥇 Gold → 💎 Diamond → 👑 Master → 🌈 Legend, with a rank-up ceremony.
- **Kill streaks** — DOUBLE KILL / TRIPLE KILL / UNSTOPPABLE with bonus coins.
- **Results flow** — score → coin count-up → rank bar → chest reveal → Play Again.
- **🎂 Birthday mode** — on **1 August**, the game greets Leon with confetti, a birthday song, "Happy 7th Birthday, Leon!", and gifts an exclusive 🎂 birthday skin (obtainable no other way). Configured in each game's `js/meta/meta-config.js` → `BIRTHDAY`.

### Kid-safety rules (enforced in code)
Coins/ranks/collection **only ever go up** — losing costs nothing. No energy timers, no lockouts, no login streaks that can break, no FOMO, no purchases, no ads. Skins are **cosmetic only**. Difficulty quietly eases after a couple of losses (never announced). Icon-first UI with minimal text.

## 🛠 Development

```bash
python3 -m http.server 8347 --directory "/Users/nick/Documents/Nick_Projects/Game"
```

Then open http://localhost:8347. Desktop controls: WASD/arrows or hold-drag the mouse to steer; Space / hold left-click to boost (Noodle Stars).

Both games expose `window.__game` for scripted testing (drive `game.step(1/60)` headlessly).

**Deploying:** edit → **bump the `CACHE` version in that game's `sw.js`** (currently `quanland-v4` / `noodle-v4`) → `git push`. GitHub Pages rebuilds automatically; the phone picks it up next launch.

## 📁 Layout
- `docs/` — design specs (PLATFORM, SPEC-paper-io, SPEC-snake-io, SPEC-meta, DESIGN-FOUNDATION)
- `paper-io/` `snake-io/` — the two games (each with `js/meta/` progression + `js/i18n.js` localization)
- `_legacy_anna/` — archived first draft (safe to delete)
