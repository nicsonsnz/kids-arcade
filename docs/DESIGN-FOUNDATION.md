# Game 项目设计基础（v2 重写版）

目标：为孩子做两款手机上可玩的休闲对战游戏，玩法对标 Paper.io 2 与 Snake.io 的核心乐趣，
**零广告、零内购、离线可玩**，以 PWA 形式添加到 iPhone 主屏幕后全屏运行，体验接近原生 App。

> 说明：我们只借鉴玩法类型（玩法机制不受版权保护），名称、角色、美术全部原创，
> 不使用原游戏的商标名与素材。

## 两款游戏

| 内部目录 | 显示名称 | 类型 | 对标 |
|---|---|---|---|
| `paper-io/` | **圈地大冒险 Popsicle Land** | 圈地吞并 | Paper.io 2 |
| `snake-io/` | **蛇蛇星球 Noodle Stars** | 大蛇吃豆对战 | Snake.io |

## 共同美术方向
- 明亮糖果色系、大圆角、软阴影，低幼但不廉价（参考现代休闲手游的 flat + soft shadow 风格）。
- 全部图形用 Canvas 代码绘制 + 少量 emoji 点缀，无外部图片资源（图标除外，用 Pillow 生成 PNG）。
- 角色是原创的糖果小动物：圈地游戏玩家角色是「冰棒小车」，AI 对手每人一个原创角色（果冻鸭、甜圈猫……）。
- 死亡/击杀/占领都要有夸张的粒子和弹跳文字反馈（juice 优先）。

## 共同技术架构（每款游戏独立自包含，无构建工具、无外部依赖）
```
<game>/
  index.html          # 入口 + PWA meta
  manifest.webmanifest
  sw.js               # service worker，cache-first 离线
  icons/              # PNG 图标（Pillow 生成）
  css/style.css
  js/
    main.js           # 启动、循环（固定步长 update + 插值 render）、场景切换
    game.js           # 核心玩法
    bots.js           # AI 状态机
    render.js         # 渲染（含离屏缓存）
    input.js          # 虚拟摇杆/触控
    audio.js          # WebAudio 合成音效（无音频文件）
    juice.js          # 粒子、飘字、屏震、缓动
    storage.js        # localStorage：最高分、皮肤选择、设置
```
- 固定步长 60Hz 逻辑 + rAF 渲染插值；DPR 上限 2；禁用 shadowBlur 于每帧路径（用预渲染精灵）。
- 触控：全屏拖拽虚拟摇杆（拇指落点即摇杆中心）+ 右下加速键（蛇蛇）。
- 本地排行榜与「最高记录」让孩子有目标感；皮肤通过分数解锁（免费，纯成就感）。
- 全中文 UI，文案简短，孩子不识字也能靠图标玩。

## 门户
`Game/index.html`：游戏机厅风格选择页，两张大卡片进入两款游戏，各自记录最高分。

## 验收标准（每款）
1. iPhone 视口 60fps，无 console 报错;
2. AI 看起来像真人：会犯错、有性格差异、行为可读;
3. 手感：转向跟手、镜头平滑、死亡反馈清晰不挫败（3 秒内可重开）;
4. 断网后从主屏幕打开可玩;
5. 大人试玩 5 分钟不觉得无聊。
