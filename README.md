# 🕹️ 小小游戏厅

给儿子做的两款**零广告、零内购、离线可玩**的手机游戏（HTML5 PWA）。

| 游戏 | 目录 | 玩法 |
|---|---|---|
| 🍦 圈地大冒险 | `paper-io/` | 圈地吞并：出圈拉轨迹，绕回领地占地盘；轨迹被碰即死；目标 100% |
| 🐍 蛇蛇星球 | `snake-io/` | 大蛇吃豆：吃豆变长变粗，用身体拦截别的蛇，登顶排行榜 |

`index.html` 是选择门户。两款游戏完全自包含（无框架、无外部依赖、无任何网络请求）。

## 在电脑上试玩

```bash
python3 -m http.server 8347 --directory "/Users/nick/Documents/Nick_Projects/Game"
```

浏览器打开 http://localhost:8347 。桌面操作：WASD/方向键或按住鼠标拖动转向；蛇蛇加速=空格或按住左键。

## 装到儿子的 iPhone 上（两种方式）

**方式 A：同一 Wi-Fi 快速体验（不用部署）**
1. Mac 上运行上面的命令；查 Mac 的局域网 IP（系统设置 → Wi-Fi → 详细信息，例如 192.168.1.23）
2. iPhone Safari 打开 `http://192.168.1.23:8347`
3. 点分享 ⬆️ → 「添加到主屏幕」→ 桌面出现图标，全屏玩
4. 限制：Mac 得开着服务器；HTTP 局域网下离线缓存（Service Worker）不生效

**方式 B：免费静态托管（推荐，一劳永逸）**
把 `Game` 文件夹整个部署到任意免费静态托管（GitHub Pages / Cloudflare Pages / Netlify）。
HTTPS 环境下 Service Worker 生效：添加到主屏幕后**断网也能玩**，图标、全屏、启动色全都到位。
部署后打开对应网址 → 分享 → 添加到主屏幕即可。

## 技术要点
- 纯 vanilla JS ES modules，Canvas 2D，60Hz 固定步长 + 渲染插值，DPR 上限 2
- 音效全部 WebAudio 合成（无音频文件）；iOS 首触解锁 + 中断恢复
- AI 假多人：每个 bot 有性格向量（激进/谨慎/技术/贪婪），状态机驱动，会犯错、会互杀、会偷地
- 圈地算法：400×400 网格 + 外侧洪水填充反选；marching squares + Chaikin 平滑渲染领地
- 蛇蛇：路径采样身体、空间哈希碰撞、预烘焙光晕（全程无 shadowBlur）
- 皮肤按最高纪录解锁（纯成就感，无任何付费）；最高分存 localStorage
- 更新版本时记得 bump `sw.js` 里的 `CACHE` 版本号，旧缓存会自动清除

## 目录
- `docs/` — 设计规格书（PLATFORM / SPEC-paper-io / SPEC-snake-io / DESIGN-FOUNDATION）
- `_legacy_anna/` — 上一版的归档（确认不要后可整个删除）
