# Task14 — 非功能需求(NFR)与验收标准核对

> 审查对象：仓库根 `/workspace`
> 设计基线：`docs/Web3D影视级太阳系项目完整设计文档.md`（V1.0，2026-07-16，45 节，3112 行）
> 审查日期：2026-07-16
> 审查范围：第 8 节（NFR）、第 36 节（验收标准）及散落的非功能约束（第 12/13/27/29/30/31/32/34 节）

## 状态图例

| 标记 | 含义 |
|---|---|
| ✅ | 满足设计要求 |
| 🟡 | 部分满足（有相关实现但不完整或未接入运行时） |
| ❌ | 未实现（缺失或仅占位） |
| ⚠️ | 有相关代码但未达标（伪实现/未达标） |

## 关键总体结论（先读此节）

1. **Web 应用 `apps/web` 是纯 UI 外壳**：`App.tsx:1-98` 仅渲染面板组件，`SceneViewport.tsx:1-17` 是占位 div（含 ☀️ emoji），**未 import 任何 astro-core / render-engine / navigation / content / Worker**。所有 package 层实现均未接入运行时。
2. **`render-engine` 包是空占位**（`packages/render-engine/src/index.ts:1-2` `// Placeholder`）。真实渲染代码在 `renderer-core`、`renderer-webgpu`、`renderer-webgl2`，但 `renderer-webgpu` 的 `device: unknown = null`（`renderer-webgpu/src/index.ts:25`），无真实 WebGPU 调用。
3. **诊断面板造假**：`DiagnosticsPanel.tsx:68-71` 用 `Math.random()` 生成 drawCalls/triangles/textures/shaders；FPS 用 `setInterval` 而非 `requestAnimationFrame`（`DiagnosticsPanel.tsx:48`）。
4. 因此凡依赖"真实渲染管线/真实运行时"的 NFR（性能、视觉、显存、LOD、设备丢失等）均**无法验证或已确认未达标**。

---

## 表 1：NFR 核对表

### 8.1 性能

| NFR 编号/类别 | 需求摘要 | 状态 | 证据(file:line) | 缺口 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| 8.1-a | 影视级基线 RTX 4070/RX 7800 XT、32GB、1440p | ❌ | `apps/web/src/components/SceneViewport.tsx:1-17`（占位）；无渲染管线 | 无真实渲染，基线无法成立 | 实现 render-engine 并接入 SceneViewport | 在 1440p 基线机运行 `tests/performance/` |
| 8.1-b | 常规场景平均 60 FPS | ❌ | 无渲染循环；`DiagnosticsPanel.tsx:48` 用 setInterval 测 FPS | 无可测帧率 | 接入 rAF 渲染循环 | 性能测试套件 |
| 8.1-c | 高复杂度近景不低于 45 FPS | ❌ | 同上 | 同上 | 同上 | 同上 |
| 8.1-d | 标准模式 1080p 不低于 30 FPS | ❌ | 同上 | 同上 | 同上 | 同上 |
| 8.1-e | UI 长任务 < 50 ms | ⚠️ | `apps/web/src/App.tsx:36-60` 启动用 setTimeout 模拟；无长任务监控 | 无 PerformanceObserver/LongTask 埋点 | 加长任务埋点 | PerformanceObserver 采样 |
| 8.1-f | 时间切换后核心天体状态 100 ms 内可见 | ❌ | `App.tsx` 未接入 astro-core；`TimeControl.tsx:54` 仅本地 setInterval | 无内核联动 | 接入 Worker 快照流 | E2E 计时测试 |
| 8.1-g | 单会话活跃 GPU 资源受预算控制 | ❌ | `resource-runtime/src/index.ts:54-66` 有 memoryLimit/LRU，但未接入渲染；无 GPU 预算（5–6GB/1.5–2.5GB） | 无显存预算执行 | 接入显存预算器 | 显存监控 |
| 8.1-h | 连续 2 小时无持续内存增长 | ❌ | 无长稳测试；`tests/performance/.gitkeep` 空 | 无长稳基线 | 编写 2h 长稳 | `tests/performance/` |

### 8.2 稳定性

| NFR 编号/类别 | 需求摘要 | 状态 | 证据(file:line) | 缺口 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| 8.2-a | GPU 设备丢失时重建渲染器 | ❌ | `packages/renderer-core/src/productization.ts` 无 deviceLost/recovery 匹配；`renderer-webgpu/src/index.ts:25` device=unknown | 无设备丢失处理 | 实现 33.3 节流程 | 模拟 loseContext |
| 8.2-b | 单资源损坏不致白屏 | 🟡 | `resource-runtime/src/index.ts:9` 有 failed 状态；`astro-core/src/lib.rs:206-216` 有 NoEphemeris 错误；但 App 未接入降级路径 | 降级链未接通 | 接入资源失败降级 | 故障注入测试 |
| 8.2-c | Worker 崩溃后可重新初始化 | 🟡 | `astro-core-api/src/astro-core-client.ts:97-130` 实现指数退避 reinit；但 App 未使用该 Client | 实现存在但未接入运行时 | App 接入 AstroCoreClient | 崩溃注入测试 |
| 8.2-d | 星历数据错误进入安全失败 | ✅ | `crates/astro-core/src/lib.rs:206-216`（out_of_range_errors_no_fake_precision 测试）；`snapshot.rs:52-58` is_nan_position/is_degraded 标志；`ephemeris-runtime/src/provider.rs:104-109` OutOfRange | 内核侧满足 | — | Rust 单元测试 |
| 8.2-e | 预制巡航中断后可返回自由探索 | ❌ | `packages/tour-player/src/index.ts:1-2` 占位 `export {};` | 巡航播放器未实现 | 实现 tour-player | 集成测试 |

### 8.3 可维护性

| NFR 编号/类别 | 需求摘要 | 状态 | 证据(file:line) | 缺口 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| 8.3-a | 天文/渲染/UI/资产管线独立 | ✅ | `crates/astro-core`、`packages/renderer-core`、`apps/web`、`tools/` 分离；`astro-core` 不引用 three.js | 满足 | — | 架构审查 |
| 8.3-b | 数据格式带版本号 | ✅ | `packages/schemas/src/index.ts:149,159,173,175,198,221` schema_version 字段；`schemas.ts:51,107,156,210` required | 满足 | — | Schema 校验测试 |
| 8.3-c | 所有天体资产通过 Manifest 声明 | 🟡 | `schemas/src/index.ts:155-176` ManifestEntry 定义；`tools/manifest-builder/.gitkeep` 空；无实际 manifest 文件 | 有 Schema 无构建器/无产出 | 实现 manifest-builder | 检查 release/manifests/ |
| 8.3-d | 渲染后端统一接口封装 | 🟡 | `renderer-core/src/index.ts:122` Renderer 接口；`renderer-webgpu`/`renderer-webgl2` 实现但 device=unknown | 接口存在，后端为 stub | 实现真实后端 | 后端单元测试 |
| 8.3-e | 关键算法具备基准测试数据 | 🟡 | `astro-core-wasm/src/__tests__/benchmark.test.ts:35`；`tools/benchmark-generator/.gitkeep` 空 | 有微基准框架，无基准数据集/无生成器 | 生成基准数据 | 基准对照 |
| 8.3-f | 不在 React 状态树保存逐帧位置 | ✅ | `App.tsx:28-33` 仅保存 boot/phase/pureMode 低频状态；无天体位置 useState | 满足 | — | 代码审查 |

### 8.4 可解释性

| NFR 编号/类别 | 需求摘要 | 状态 | 证据(file:line) | 缺口 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| 8.4-a | 精度降级可被用户识别 | 🟡 | `snapshot.rs:56` is_degraded；`content-service/src/index.ts:50-56,560-566` PRECISION_DESCRIPTIONS；但 UI 未消费该标志 | 数据层有标志，UI 未展示 | UI 展示降级标识 | 视觉/功能测试 |
| 8.4-b | 增强尺度可被用户识别 | ❌ | `navigation-service`/`content-service` 无 scale_mode 显示；无增强倍率 UI | 无尺度映射 UI | 实现尺度映射系统(17 节) | 功能测试 |
| 8.4-c | 程序化科学推演可被用户识别 | 🟡 | `content-service/src/index.ts:43-48,24` REALITY_TIER_DESCRIPTIONS + section.realityTier | 仅内容卡片有 R 标签，渲染层无 R3/R4 标识 | 渲染层加 R3/R4 标识 | 视觉验收 |
| 8.4-d | 不超出来源精度展示小数位 | ⚠️ | `content-service/src/index.ts:62-70` 数值带约数表述；但无精度截断规则引擎 | 无系统化精度控制 | 加精度截断 | 内容审查 |

### 8.5 可部署性

| NFR 编号/类别 | 需求摘要 | 状态 | 证据(file:line) | 缺口 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| 8.5-a | 单机/内网/离线均可部署 | 🟡 | `packages/server/src/server.ts:68-93` 静态服务器 + Range；但仅 HTTP，无 HTTPS | 无 HTTPS 部署 | 加 HTTPS 支持 | 离线测试 |
| 8.5-b | 正式包含启动/停止/校验/诊断脚本 | ❌ | `package.json:8-15` 仅 dev/build/test/typecheck/lint；`release/server/.gitkeep` 空 | 无启动/校验/诊断脚本 | 编写运维脚本 | 脚本清单审查 |
| 8.5-c | 不要求安装数据库/应用服务器 | ✅ | `packages/server/src/server.ts:1-127` 纯静态 http | 满足 | — | 部署测试 |
| 8.5-d | Windows 10/11 部署可由非开发人员完成 | ❌ | 无安装包/安装文档；`README.md:1` 仅 "# Solar-System" | 无安装流程 | 生成安装包+手册 | 非开发人员测试 |

### 散落非功能约束

| NFR 编号/类别 | 需求摘要 | 状态 | 证据(file:line) | 缺口 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| 13.4/12 | 精度层级 P0–P4 运行时降级 | 🟡 | `ephemeris-runtime/src/provider.rs:11-32` Precision 枚举+中文标签；`snapshot.rs:56` is_degraded；但运行时无按层级切换渲染/资源策略 | 枚举存在，无运行时降级执行 | 接入降级策略 | 降级测试 |
| 27.2 | 真实性层级 R1–R4 用户可识别 | 🟡 | `content-service/src/index.ts:3,43-48` RealityTier+描述；仅内容卡片 | 渲染层无 R 标识 | 渲染层标识 | 视觉验收 |
| 2/28 | 资产层级 S/A/B/C 分层资产 | 🟡 | `astro-core/src/catalog.rs:9-14` AssetTier；`navigation-service/src/index.ts:66-124` 标注 tier；`body-renderers` 各 renderer assetTier='S' 硬编码 | 枚举与目录有，**无实际分层资产文件**（`assets-src/bodies/.gitkeep` 空）；render() 全空 | 制作分层资产 | 资产清单审查 |
| 29.1/29.3 | 资源分包/加载优先级/懒加载/预加载 | ❌ | `resource-runtime/src/index.ts:54` LRU；但无分包、无优先级队列、无 Range 集成、无 React.lazy；`schemas/index.ts:192` preload 字段未用 | 无加载策略实现 | 实现分包加载 | 加载测试 |
| 29.5 | 显存预算（影视 5–6GB/标准 1.5–2.5GB） | ❌ | `resource-runtime/src/index.ts:60` memoryLimit=1GB 默认；无显存预算/无单主目标最高 LOD | 无显存治理 | 实现显存预算器 | 显存监控 |
| 30.1/30.3 | 自动画质分档与动态降级顺序 | 🟡 | `renderer-core/src/quality.ts:263-360` QUALITY_PRESETS/PerformanceMonitor/shouldDowngrade；但档位名 low/medium/high/ultra 与设计（影视/极高/高/标准/安全）不一致；未接入 | 档位语义不符且未接入 | 对齐档位并接入 | 画质测试 |
| 30.5 | 性能监控面板（FPS/CPU/GPU/DrawCall/LOD/Worker 延迟/加载队列） | ⚠️ | `DiagnosticsPanel.tsx:8-22` 字段齐；但 `:68-71` drawCalls/triangles 用 Math.random()；无 GPU 时间/Worker 延迟/加载队列 | 字段造假、缺项 | 接入真实 PerformanceMonitor | 面板对照 |
| 31.3/34.2 | 安全头：CSP/COOP/COEP/CORP/HSTS | ❌ | `apps/web/vite.config.ts:9-12` 仅 dev server COOP/COEP；`packages/server/src/server.ts:99-104` 生产服务器**无任何安全头**；无 CSP；无 HTTPS | 生产侧无安全头 | 服务器加安全头 | 头部扫描 |
| 31.3 | 静态服务器：Brotli/Gzip/ETag/不可变缓存 | ❌ | `server.ts:101` Cache-Control: public, max-age=86400（非 immutable）；无 ETag；无压缩 | 缺压缩/ETag/immutable | 完善服务器 | 头部扫描 |
| 34.1 | 隐私（无账户/无后端/无分析/Cookie） | ✅ | `server.ts` 纯静态；`App.tsx` 无 localStorage/无 analytics | 满足 | — | 隐私审查 |
| 34.3 | 无障碍：键盘/焦点/屏幕阅读器/降运动/对比度 | ⚠️ | 各组件用原生 `<button>`（`TimeControl.tsx:132-192` 等）天然可键盘操作；但**无 aria-* / role / tabIndex 显式标注**；无 prefers-reduced-motion；无对比度处理 | 仅按钮可达，无完整无障碍 | 加 ARIA + 降运动 | a11y 扫描 |
| 32 | 浏览器/OS 兼容矩阵 + 版本冻结 | ❌ | `diagnostics/src/index.ts:11-15` BrowserType/OsType 检测；但无版本冻结记录；无 GPU 黑名单 | 无兼容矩阵/黑名单 | 建立兼容矩阵 | 兼容测试 |
| 33.4 | 本地诊断包导出 | ❌ | `DiagnosticsPanel.tsx` 仅展示；无导出功能 | 无诊断包导出 | 实现导出 | 功能测试 |
| 7.11/36.4 | 离线：无 service worker / PWA | 🟡 | 无 SW/PWA manifest（grep 无匹配）；但纯静态服务器+本地资源可离线；无 SW 缓存策略 | 无 SW，二次访问需重载 | 评估是否需 SW | 断网测试 |
| 44 | 所有 UI 简体中文（i18n） | ✅ | `apps/web/index.html:2` lang="zh-CN"；所有文案中文；设计明确中文-only，**无 i18n 框架是符合设计的**（非缺口） | 满足 | — | UI 审查 |

---

## 表 2：验收标准核对表

### 36.1 科学模拟验收

| 验收项 | 设计要求 | 达成度 | 证据 | 阻塞项 | 达成路径 |
|---|---|---|---|---|---|
| 太阳/八大行星位置 | 与基准差异 ≤1 km | 10% | `crates/astro-core/src/lib.rs:191-204` 切比雪夫插值有线性测试；`tests/astro-reference/.gitkeep` 空 | 无基准数据集、无 SPK 真实星历接入 | 接入 DE440 + 基准对照 |
| 月球位置 | ≤1 km | 10% | 同上 | 同上 | 同上 |
| S 级姿态 | 轴向误差 ≤0.1°，纹理经度正确 | 5% | `crates/astro-core/src/orientation.rs` 存在；未验证 | 无姿态数据/无纹理 | 接入 IAU 姿态模型 |
| A 级主要卫星 | ≤10 km | 5% | `navigation-service/src/index.ts:72-98` 列出 A 级卫星；无独立星历 | 无 A 级星历 | 接入卫星星历 |
| B/C 级对象 | 满足各自级别 | 5% | `navigation-service` 列出 B 级；无轨道根数传播 | 无 B/C 轨道模型 | 实现历元传播 |
| 日月食极大时间 | 偏差 ≤60 s | 10% | `crates/event-engine/src/types.rs:37` EventPrecision；`root.rs` 有算法框架 | 无基准对照 | 基准对照 |
| 主要凌日 | 偏差 ≤60 s | 10% | 同上 | 同上 | 同上 |
| 时间倍率无累计漂移 | 帧率无关 | 10% | `time-system` 存在；`TimeControl.tsx` 用 setInterval（帧率相关） | 未用连续时间尺度 | 改用 TDB 连续时间 |
| 真实比例几何映射 | 误差 ≤0.01% | 5% | `renderer-core/src/scale-mapping.ts` 存在；未接入 | 无映射执行 | 接入映射 |
| 增强比例 UI 显示 | 始终显示状态与倍率 | 0% | 无增强尺度 UI | 无 UI | 实现尺度 UI |

### 36.2 视觉验收

| 验收项 | 设计要求 | 达成度 | 证据 | 阻塞项 | 达成路径 |
|---|---|---|---|---|---|
| S 级独立渲染方案 | 每个有独立实现 | 5% | `body-renderers/src/index.ts:140-358` 有 Sun/Earth/GasGiant/Ring 类，**render() 全空** | 渲染方法空 | 实现真实 Shader |
| 大气无明显硬边 | — | 0% | `body-renderers` EarthRendererImpl 无渲染 | 无大气渲染 | 实现大气散射 |
| 昼夜交界连续 | — | 0% | 同上 | 无 | 实现 |
| 土星环透明/投影/遮挡 | — | 0% | `body-renderers/src/index.ts:258-284` RingRendererImpl.render() 空 | 无 | 实现 |
| 太阳 LOD 无突变 | — | 0% | 同上 | 无 LOD | 实现 LOD |
| 地形无裂缝空洞 | — | 10% | `terrain-engine/src/index.ts:269-403` QuadTree LOD 结构；`loadedTiles` 从未填充 | 无真实瓦片加载 | 接入瓦片数据 |
| 云层不穿地表 | — | 0% | 无云层渲染 | 无 | 实现 |
| 轨道线不抖动 | — | 10% | `renderer-core/src/floating-origin.ts` 存在；未接入 | 未接入 | 接入 |
| LOD 切换不可感知 | — | 0% | 无 LOD 切换实现 | 无 | 实现 |
| HDR 曝光无闪烁 | — | 10% | `renderer-core/src/hdr.ts:1-168` 有 HDR 实现；未接入 | 未接入 | 接入 |
| R3/R4 科学模式可识别/弱化 | — | 5% | `content-service` 有 R 标签；渲染层无 | 渲染层无标识 | 渲染层标识 |

### 36.3 性能验收

| 验收项 | 设计要求 | 达成度 | 证据 | 阻塞项 | 达成路径 |
|---|---|---|---|---|---|
| 影视级 1440p ≥55 FPS | RTX4070/32GB | 0% | 无渲染管线 | 无渲染 | 实现渲染管线 |
| 复杂近景 1% Low ≥45 FPS | — | 0% | 同上 | 同上 | 同上 |
| 2h 无不可恢复崩溃 | — | 0% | `tests/performance/.gitkeep` 空 | 无长稳测试 | 编写长稳 |
| 场景切换显存回落预算 | — | 0% | 无显存预算 | 无 | 实现预算 |
| 无持续内存泄漏 | — | 0% | 无监控 | 无 | 实现监控 |
| 标准模式 1080p ≥30 FPS | 集显/16GB | 0% | 同上 | 同上 | 同上 |
| 标准模式功能完整 | 搜索/时间/轨道/科普/事件 | 20% | UI 组件存在（TopBar/LeftPanel/RightPanel/TimeControl）；未接内核 | 未接内核 | 接入内核 |
| 允许关闭高成本特效 | — | 0% | 无特效开关 | 无 | 实现 |

### 36.4 离线验收

| 验收项 | 设计要求 | 达成度 | 证据 | 阻塞项 | 达成路径 |
|---|---|---|---|---|---|
| 物理断网启动成功 | — | 40% | `server.ts` 纯静态；`vite.config.ts:4` 注释明示无 CDN；无在线字体 | 无 SW，但静态可离线 | 断网测试 |
| 核心资产来自本地 | — | 10% | `assets-src/bodies/.gitkeep` 空；无实际资产 | 无资产 | 制作资产 |
| 无第三方 CDN 请求 | — | 80% | `index.html:1-12` 无 CDN；`vite.config.ts:4` 明示 | 需 build 验证 | 构建扫描 |
| localhost WebGPU 正常或降级 | — | 10% | `diagnostics/src/index.ts` 有 WebGPU 检测接口；`server.ts` 无 HTTPS（localhost 可 HTTP） | 未接入降级 | 接入降级 |
| 内网 HTTPS 部署正常 | — | 0% | `server.ts` 仅 HTTP；无 TLS | 无 HTTPS | 加 TLS |
| 资源校验和回滚 | — | 5% | `schemas/index.ts:159` ManifestEntry 有 version；无 SHA-256 校验逻辑、无回滚 | 无校验/回滚 | 实现校验 |
| 缺失可选包可继续 | — | 10% | `resource-runtime` 有 failed 状态；未接入 | 未接入降级 | 接入 |

### 36.5 功能验收

| 验收项 | 设计要求 | 达成度 | 证据 | 阻塞项 | 达成路径 |
|---|---|---|---|---|---|
| 全部已命名卫星在目录 | — | 40% | `navigation-service/src/index.ts:66-124` 列出 ~50 天体含主要卫星 | 非全部已命名 | 补全目录 |
| 按名称/别名/拼音搜索 | — | 60% | `navigation-service/src/index.ts:186-249` search 实现 exact/prefix/alias/pinyin/fuzzy；`PINYIN_MAP:126-157` | 未接入 UI | 接入搜索框 |
| 卫星跳转母星 | — | 60% | `getParent/getPath` 实现（:255-294） | 未接入 UI | 接入 |
| 播放首版预制巡航 | — | 0% | `tour-player/src/index.ts:1-2` 占位 | 巡航播放器未实现 | 实现 |
| 切换真实/增强尺度 | — | 10% | `schemas/index.ts` 有 scale_mode；无 UI/无映射 | 无尺度系统 | 实现尺度 |
| 任意范围时间选择 | — | 30% | `TimeControl.tsx` 有时间 UI；未接内核 | 未接内核 | 接入 |
| 查询并跳转主要事件 | — | 10% | `event-engine` 有类型；无事件搜索 UI | 无事件 UI | 实现 |
| 地球/月球/火星全球下降 | — | 5% | `terrain-engine` 有 QuadTree；`SurfaceCameraImpl` 用 sin/cos 伪高程（:464-466） | 伪高程、无瓦片 | 接入真实高程 |
| 无用户创作/账户/音频 | — | 100% | `App.tsx` 无此类入口 | — | — |
| 刷新不恢复用户状态 | — | 100% | `App.tsx:29-33` 纯 useState，无 localStorage | — | — |

### 44 项目完成定义（摘要）

| 维度 | 达成度 | 说明 |
|---|---|---|
| 产品 | 25% | UI 外壳存在，功能未接内核；无重大缺口声明；中文满足 |
| 科学 | 20% | 内核算法框架在，无基准对照、无来源台账运行时 |
| 视觉 | 5% | 渲染方法全空 |
| 性能 | 0% | 无渲染管线 |
| 离线交付 | 15% | 静态服务器在，无 HTTPS/校验/回滚/文档 |

---

## 附：审查方法说明

- NFR 条目来源：设计文档第 8 节（行 462–505）、第 36 节（行 2344–2420）、散落于第 12/13/27/29/30/31/32/33/34 节。
- 证据采集：Grep 全仓关键词 + Read 关键文件 + Glob 目录扫描。
- "未接入运行时"判定依据：`apps/web/src` 全量扫描仅命中 `SceneViewport.tsx:1` 一处 `render-engine` 字样（且为注释），无任何 `astro-core`/`Worker`/`navigation`/`content` import。
