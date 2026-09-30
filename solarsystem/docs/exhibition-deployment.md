# 展览部署 (Exhibition Deployment)

本文说明如何离线构建与托管本展项、`public/exhibition.config.json` 的全部选项、触摸/4K 注意事项、自动演示与导览行为、WebGL 上下文丢失恢复，以及上线前预检清单。

## 1. 构建与离线托管

```bash
npm ci                 # 安装锁定依赖
npm run build          # tsc -b && vite build → dist/
npm run preview        # vite preview --host 0.0.0.0 --port 4173
# 或使用任意静态服务器托管 dist/
```

- Vite 配置（`vite.config.ts`）：`build.target = 'es2022'`，`chunkSizeWarningLimit = 2000`。
- `public/` 下的数据与贴图会被原样复制进 `dist/`：`dist/data/catalog/*`、`dist/data/stars/*`、`dist/data/textures/*`、`dist/exhibition.config.json`。
- **完全离线**：应用启动时不下载任何外部资源；贴图与目录均来自本地 `public/data/`。部署到展厅机器时无需联网。
- 数据 URL 生成（`src/data/ConfigLoader.ts` 的 `dataUrl`）基于 `import.meta.env.BASE_URL`，因此把站点部署到子路径（例如 `https://museum.local/solar/`）时，构建前设置 `base` 即可，数据路径会随之前缀。
- `index.html` 含 `<noscript>` 提示：本展项需要 JavaScript 与 WebGL2。

## 2. `exhibition.config.json`（启动时合并）

文件位于 `public/exhibition.config.json`，由 `src/data/ConfigLoader.ts` 的 `loadExhibitionConfig()` 在启动时 `fetch`（`cache: 'no-cache'`）并与默认值合并（`mergeExhibitionConfig` 做类型校验，非法值回退默认；文件缺失/损坏不致命）。字段定义见 `src/types/catalog.ts` 的 `ExhibitionConfig`。

当前仓库中的配置：

```json
{
  "language": "zh-CN",
  "autoDemo": true,
  "autoDemoDelaySeconds": 150,
  "defaultTarget": "sun",
  "defaultScaleMode": "exhibition",
  "defaultQuality": "high",
  "enableScientificMode": true,
  "enableMinorPlanets": true,
  "enableStarfield": true,
  "enableAutoDemo": true,
  "guidedTourOnIdle": true,
  "showPerformanceOverlay": false,
  "uiScale": 1,
  "reducedMotion": false,
  "title": { "zh": "太阳系 · 真实三维导览", "en": "Real-Time Solar System" },
  "subtitle": {
    "zh": "探索太阳、行星、卫星、小行星以及人类已编目的太阳系世界",
    "en": "Explore the Sun, planets, moons and catalogued small bodies of our solar system"
  }
}
```

字段含义与取值范围：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `language` | `'zh-CN'\|'en-US'` | `zh-CN` | 初始语言（非法值回退 `zh-CN`） |
| `autoDemo` | boolean | `true` | 无操作后是否进入自动演示 |
| `autoDemoDelaySeconds` | number | `150` | 无操作进入自动演示的等待秒数 |
| `defaultTarget` | string | `sun` | 初始相机目标的天体 id |
| `defaultScaleMode` | `'scientific'\|'visible'\|'exhibition'` | `exhibition` | 初始尺度（非法值回退 `exhibition`） |
| `defaultQuality` | `'ultra'\|'high'\|'medium'\|'performance'` | `high` | 初始画质（非法值回退 `high`） |
| `enableScientificMode` | boolean | `true` | 是否开放科学尺度 |
| `enableMinorPlanets` | boolean | `true` | 是否加载小天体目录（关闭可省内存/带宽） |
| `enableStarfield` | boolean | `true` | 是否加载恒星背景 |
| `enableAutoDemo` | boolean | `true` | 自动演示开关（运行时可被设置面板切换） |
| `guidedTourOnIdle` | boolean | `true` | 空闲时是否引导导览 |
| `showPerformanceOverlay` | boolean | `false` | 是否显示性能面板 |
| `uiScale` | number | `1` | 全局 UI 缩放，被夹紧到 `[0.75, 2]`（写入 CSS 变量 `--ui-scale`） |
| `reducedMotion` | boolean | `false` | 减弱动效（同时设置 `.app[data-reduced-motion]` 与相机的 `setReducedMotion`） |
| `title` | `{zh,en}` | 见上 | 标题（splash / HUD） |
| `subtitle` | `{zh,en}` | 见上 | 副标题 |

注：`DEFAULT_EXHIBITION_CONFIG`（`src/data/ConfigLoader.ts`）与仓库中的 JSON 一致，因此未提供配置文件时行为不变。`uiScale` 由 `App.tsx` 通过 `document.documentElement.style.setProperty('--ui-scale', ...)` 应用。

## 3. 触摸与 4K

样式位于 `src/styles/app.css`，以 `rem`/`px` 与 `clamp()`/`vw` 表达，适配 1920×1080、2560×1440、3840×2160：

- **触摸**：`:root` 定义 `--touch-min: 48px`；`@media (pointer: coarse)` 把所有交互元素（chip、transport 按钮、速度按钮、object-row、搜索结果、segmented、tab、inspector 关闭按钮）的最小高度提升到 48 px。
- **窄屏/竖屏**：`@media (max-width: 1180px), (max-aspect-ratio: 1/1)` 收窄侧栏与信息面板宽度并隐藏图例；`@media (max-width: 760px)` 进一步压缩时间读数与面板高度。
- **4K/高 DPI**：标签是 DOM 元素（`src/engine/LabelRenderer.ts`），字号随视口高度缩放（`fontSizePx = clamp(height/62, 11, 18)`），因此在 4K 面板上文字保持锐利；像素比由画质档的 `pixelRatioCap` 限制（ultra 2、performance 0.85），避免 4K 屏过度绘制。
- **减弱动效**：`@media (prefers-reduced-motion: reduce)` 与 `.app[data-reduced-motion='true']` 把过渡/动画时长压到 0.01 ms；`CameraController.setReducedMotion(true)` 同时把 fly-to 时长压到约 0.35 s。
- **高对比度**：`@media (prefers-contrast: more)` 加深面板底色、增强分隔线与文字亮度（依赖明度而非色相表达状态）。
- 画布 `touch-action: none`，指针事件统一处理（见第 4 节），适合触摸屏与一体机。

## 4. 交互模型（`src/ui/useEngine.ts`）

指针事件统一处理鼠标与触摸：

- 单指/左键拖动 → 旋转；双指 → 捏合缩放 + 平移；滚轮 → 缩放（自由飞行模式下改为调节平移速率）。
- 轻点（移动 < 8 px 且 < 420 ms）→ 选中指针下的天体；双击（窗口 340 ms、位移 < 28 px）→ fly-to。
- 键盘：`Space` 暂停/继续，`F` 切换自由飞行，`Esc` 清除选择；`W A S D / Q E / Shift` 自由飞行。
- `ResizeObserver` 监听容器尺寸变化并调用 `renderer.resize`。

## 5. 自动演示与导览

- **导览（`src/data/Tour.ts` 的 `TOUR_STOPS`）**：13 站，依次为太阳、水星、金星、地球、月球、火星、小行星带（special: asteroidBelt）、木星、土星、天王星、海王星、冥王星、柯伊伯带（special: kuiperBelt）。每站设定时间速率、可选的层筛选与中英文解说。`useEngine` 在 `tourActive` 时应用该站的 `timeScale`、筛选，并 fly-to 目标或 framing 特殊视图。
- **自动演示（`AUTO_DEMO_STOPS`）**：`['sun','earth','moon','mars','jupiter','saturn','neptune','pluto']` 共 8 站。无操作达到 `autoDemoDelaySeconds`（默认 150 s，与 `DEFAULT_IDLE_SECONDS` 一致）后启动；以 `10×86400`（1 秒 = 10 天）速率依次 fly-to，等待转场结束（上限 12 s）后停 6.5 s；结束时回到总览并把 `autoDemoActive` 置回 `false`。任意输入立即退出（`markInteraction`）。
- 空闲计时器每秒检查一次，`autoDemoCountdown` 供 HUD 显示倒计时；导览进行中不会触发自动演示。

## 6. WebGL 上下文丢失恢复

- `SceneRenderer`（`src/engine/Renderer.ts`）监听 `webglcontextlost`：调用 `event.preventDefault()` 让浏览器可尝试恢复，并触发引擎的 `contextLost` 回调。
- 监听 `webglcontextrestored`：触发 `contextRestored` 回调。
- 引擎（`SolarSystemEngine` 构造函数）在恢复时**销毁并重建全部 `BodyVisual`**（其他状态保留），然后发 `contextRestored` 事件——不通过刷新页面伪造恢复。
- `useEngine` 把 `contextLost` 显示为警告 toast（“图形上下文丢失，正在尝试恢复”），`contextRestored` 显示信息 toast。
- 若环境根本没有 WebGL 2，`detectGraphicsCapability()`（`src/engine/GraphicsCapability.ts`）返回 `none`/`webgl1`，应用进入 `error` 阶段并显示 `degradationNotice`（中文提示启用硬件加速或更换浏览器/驱动），其余 UI 仍可交互，不会白屏。

## 7. 上线前预检清单

- [ ] 目标机器/浏览器支持 **WebGL 2**（Chrome/Edge/Firefox 现代版本；Safari 需较新版本与硬件加速）。可在浏览器控制台确认 `detectGraphicsCapability().backend === 'webgl2'`，或观察是否出现降级提示。
- [ ] 展厅机器**启用硬件加速**；若为无 GPU 的虚拟机，会出现“未能创建 WebGL 上下文”的提示。
- [ ] `npm run build` 无 TypeScript 错误（`tsc -b` 通过）；`npm test` 全绿（当前 9 文件 / 115 用例）。
- [ ] `dist/` 中包含完整数据：`data/catalog/{catalog-vYYYYMMDD.json,planet-elements.json,minor-bodies.json,minor-bodies.bin,manifest.json}`（`manifest.json` 的 `catalogFile` 指向版本化目录）、`data/stars/*`、`data/textures/*`、`exhibition.config.json`。
- [ ] 拔网线/离线启动，确认无外部请求（贴图、目录均本地）。
- [ ] 按展陈需要编辑 `exhibition.config.json`：语言、默认尺度/画质、`autoDemoDelaySeconds`、`uiScale`、`reducedMotion`、标题副标题。
- [ ] 触摸屏：确认 48 px 触控目标、单指旋转/双指缩放/轻点选中/双击飞抵均正常。
- [ ] 4K 大屏：确认标签清晰、布局不溢出（`clamp()` 响应式）；必要时下调 `defaultQuality` 或 `uiScale`。
- [ ] 长时间无人值守：确认贴图缓存有界（上限 48）、上下文丢失可恢复；建议开启 `showPerformanceOverlay` 观察一段时间后再关闭。
- [ ] 无障碍/合规：确认 `prefers-reduced-motion` 与 `prefers-contrast: more` 在展陈环境下按需生效；`uiScale` 适配视距。
- [ ] 数据来源与比例声明可见：HUD 的尺度警告标签、信息面板的“真实尺寸/×N 放大”“约定相位”“程序化贴图”“暂无可靠数据”等披露正常显示。

## 8. 已知缺口

- 科学验证有两个入口：`npm run verify:ephemeris`（独立误差表，超阈值时返回非零码，适合 CI）与 `npm test`（`src/astronomy/__tests__/EphemerisValidation.test.ts` 等 60 个用例）。
- 本仓库未附带容器/Docker 或 systemd 服务定义；离线托管使用任意静态文件服务器即可，注意设置正确的 MIME 类型（`.bin` 以 `application/octet-stream` 提供，`.json` 以 `application/json`）。