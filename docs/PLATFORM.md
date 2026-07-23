# PLATFORM.md — 两款游戏共享的工程规范（必须严格遵守）

本项目为儿童向、零广告、离线可玩的 HTML5 手机游戏，以 PWA 添加到 iPhone 主屏幕。
目标设备：iPhone（iOS 17–26 Safari / 主屏幕 standalone 模式），同时可在桌面浏览器用键盘鼠标试玩。

## 1. 技术栈
- 纯 vanilla JS（ES modules，`<script type="module">`），无框架、无构建工具、无任何外部依赖/CDN/网络请求。
- 所有图形 Canvas 2D 代码绘制；允许用 emoji 文本作为角色/装饰。音效全部 WebAudio 合成，无音频文件。
- 每款游戏自包含在自己的目录里，互不引用（portal 除外）。

## 2. 目录结构（每款游戏）
```
<game>/
  index.html            # 含完整 PWA head 块（见 §7）
  manifest.webmanifest
  sw.js                 # cache-first，缓存名含版本号 e.g. 'popsicle-v1'
  icons/icon-180.png  icons/icon-192.png  icons/icon-512.png   # 已由外部生成，直接引用即可（构建时可先假定存在）
  css/style.css
  js/main.js game.js bots.js render.js input.js audio.js juice.js storage.js
  (可按需增加模块，但不要合并成单文件)
```
相对路径引用（`./js/main.js`、`./manifest.webmanifest`），因为部署路径是 `/paper-io/`、`/snake-io/` 子目录。sw.js 注册用 `navigator.serviceWorker.register('./sw.js')`，缓存列表也全用相对路径。manifest 的 `start_url` 和 `scope` 用 `./`。

## 3. 游戏循环（固定步长 + 插值，Gaffer 模式）
- 固定 DT=1/60s 逻辑步，accumulator 限幅 0.25s，MAX_STEPS=4 防死亡螺旋；渲染用 alpha 插值实体位置与角度（角度走最短弧）。ProMotion 120Hz 下逻辑仍是 60Hz。
- AI 决策 20Hz（每 3 个逻辑步一次）。
- `visibilitychange` 隐藏时暂停循环与音频；恢复时重置计时器（防止巨大 frameTime）、重新 resume AudioContext、重新申请 wake lock。

## 4. 渲染纪律（60fps 关键）
- DPR 上限 2：`Math.min(devicePixelRatio,2)`，backing store = css尺寸×dpr，`ctx.setTransform(dpr,0,0,dpr,0,0)`，所有逻辑用 CSS px。resize 时重算。
- **热循环内严禁 `shadowBlur`、`ctx.filter`、每帧新建渐变**。发光效果一律预烘焙：启动时把径向渐变光晕画进小离屏 canvas，运行时 `drawImage`（可配 `globalCompositeOperation='lighter'`）。
- 静态/慢变层用离屏缓存 + 脏标记（背景、领地、小地图），每帧只 blit。
- 视野剔除：镜头外实体/线段不画。
- 热路径零分配：对象池（粒子、飘字、豆子）、typed array、复用临时向量；不在每帧用 map/filter/闭包。
- 相机平滑一律用 `1-exp(-k*dt)` 形式（帧率无关），k≈6–10；缩放同理并对头部/角色为中心缩放。

## 5. 输入
- Pointer Events 统一处理（`pointerdown/move/up/cancel`），多点触控用 pointerId 区分。
- 触控方案见各游戏 SPEC。桌面必须同时支持：WASD/方向键 + 鼠标（按住拖动转向），空格 = 加速/暂停（按游戏定义）。
- 阻止 iOS 手势：CSS `touch-action:none`（html/body/canvas）、`overscroll-behavior:none`、`position:fixed;inset:0;overflow:hidden`、`-webkit-user-select:none`、`-webkit-touch-callout:none`、`-webkit-tap-highlight-color:transparent`；JS 兜底 `document.addEventListener('touchmove', e=>e.preventDefault(), {passive:false})`。

## 6. 音频（WebAudio 合成）
- 单例 AudioContext；首次 `pointerdown` 时创建/resume + 播放 1 帧静音 buffer 解锁（`{once:true}` 之外还要在每次可见性恢复及下一次触摸时兜底 resume；处理 iOS 的 'interrupted' 状态）。
- 合成音效模式：吃豆=双升调 blip（连续吃按 combo 升 pitch）；占领=上行琶音；击杀=噪声爆破+下滑锯齿；死亡=下行滑音；胜利=大三和弦琶音。全部走一个 master GainNode，提供静音开关（存 storage）。
- 可选轻量循环 BGM：lookahead 调度器（setInterval 25ms、scheduleAhead 0.1s）2–3 声部小调式循环，音量低；默认开，可关。

## 7. PWA / index.html head 块（逐条照抄）
```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="（游戏短名）">
<meta name="theme-color" content="（游戏主色）">
<link rel="apple-touch-icon" href="./icons/icon-180.png">
<link rel="manifest" href="./manifest.webmanifest">
```
- body 背景色 = 游戏主色（启动白闪变成品牌色闪；不做 startup-image 集）。
- manifest：`id:'./'`、`display:'standalone'`、`icons` 192/512、`background_color`/`theme_color` 同主色。
- sw.js：install 时 `cache.addAll` 全部资源（相对路径），activate 清旧缓存 + `clients.claim()`，fetch cache-first + 后台回填；`skipWaiting()`。页面注册后调用 `navigator.storage?.persist?.()`。
- Wake Lock：`navigator.wakeLock.request('screen')` try/catch，visibilitychange 恢复时重申请。
- 安全区：HUD 容器 `padding: env(safe-area-inset-top) ... env(safe-area-inset-bottom)`；canvas 全屏铺满；交互按钮避开底部 home 指示条区域。
- 无任何网络请求（除同源资源）；无 analytics；无外链。

## 8. UI/文案
- 全中文、字号大、圆角大、按钮大（拇指友好 ≥64px）。字体栈：`-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif`，标题可加粗+描边感（text-shadow 模拟）。
- 开始界面：游戏名 LOGO（CSS 绘制，带弹跳动画）、皮肤选择（横排大按钮）、最高纪录展示、大「开始」按钮、静音按钮。
- 死亡界面：成绩 + 最高纪录 + 鼓励文案（随机几条，如「差一点点！」「太厉害了，快破纪录了！」）+ 大「再来一局」；3 秒内可重开。
- 暂停按钮（右上角，暂停时显示继续/回主菜单/静音）。
- HTML/CSS 做 UI 覆盖层（不在 canvas 里画按钮），canvas 只画游戏世界与游戏内 HUD（分数、排行、小地图可以画在 canvas 或 DOM，二选一保持 60fps）。

## 9. 存储（storage.js）
localStorage 键前缀区分游戏（如 `popsicle.best`）。存：最高分、已解锁皮肤、当前皮肤、静音设置、累计击杀/局数（成就感数据）。全部 try/catch 包裹（隐私模式可能抛错）。

## 10. 质量红线
- 无 console 报错/未捕获异常；所有 JS 严格可运行（构建后自测语法：`node --check` 每个文件通过——注意 node --check 不支持 ES module 语法时用 `node --input-type=module --check < file` 方式验证）。
- 不留 TODO/占位符/空函数；每个特性完整实现。
- 代码可读：模块职责单一、常量集中在文件顶部便于调参（TUNING 对象）。
- 原创命名与美术：不得使用 "Paper.io"、"Snake.io"、"slither" 等商标名或原版素材;界面与代码注释里也不要出现这些名字。
