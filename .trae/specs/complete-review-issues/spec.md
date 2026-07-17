# 审查问题全量补足与缺陷修复 Spec

## Why

项目历经两轮审查（`docs/reviews/实现审查报告.md` 44 个 E 类错误 + 12 个架构风险；`docs/reviews/深入审查报告-第二轮.md` 31 项已修 / 9 项部分 / 4 项未修 / 7 项新发现），目前仍有 4 项未修复、9 项部分修复、7 项新发现问题与 4 项架构风险未关闭。最致命的 4 条阻塞链——WASM pkg 未构建、app-orchestrator 空、App.tsx/SceneViewport 占位、内核→渲染数据流断裂——导致项目至今无法在浏览器中输出任何天体画面。本 spec 的目标是**真实完整**地关闭两份审查报告中所有遗留问题，使项目达到"端到端可见 + 主功能可用 + 通过审查清单"的状态。

## What Changes

### 一、P0 阻塞链（5 项，必须最先修复）

- **构建 WASM pkg/**：执行 `pnpm build:wasm` 生成 `packages/astro-core-wasm/pkg/{astro_core.js,astro_core_bg.wasm,astro_core.d.ts}`；CI/本地构建链路验证通过；修复 E-41 / R-03。
- **实现 app-orchestrator 启动编排**：`packages/app-orchestrator/src/index.ts` 实现 BootFlow（diagnostics → worker init → resource-runtime → renderer 创建 → body renderers 注册 → UI ready），监听 Worker 错误触发指数退避 reinit；修复 E-25。
- **App.tsx 接入真实启动 + SceneViewport 挂载 canvas**：`App.tsx` 调用 app-orchestrator 订阅真实启动事件，移除 setTimeout 模拟；`SceneViewport` 创建 `<canvas>` 并挂载 renderer；`LeftPanel` 调用 NavigationService 动态渲染目录；修复 E-35 / R-01。
- **打通内核→渲染数据流**：app-orchestrator 每帧调用 `astro-core-api.evaluateSnapshot(bodyIds, utc)` 并将 BodyState 分发到对应 `BodyRenderer.update(time, position, orientation, sunDirection)`；修复 R-02。
- **填充 assets-src 资产**：下载/生成公开纹理、高程、网格源数据到 `assets-src/{bodies,effects,terrain}`，至少覆盖太阳/地球/月球/火星的可见纹理与地球/月球/火星的高程瓦片；修复 N-06。

### 二、P1 功能错误（7 项）

- **HDR GPU 后处理管线**：`packages/renderer-core/src/hdr.ts` 与 WebGPU/WebGL2 后端实现真正的 fragment shader 后处理（HDR 渲染目标 → 亮度提取 → downsample/upsample → tone mapping → color grading LUT → vignette 合成）；修复 E-06。
- **Shadow Map 渲染通道**：实现光源视角深度纹理 + PCF 采样；`computeContactTimes` 用 events.ts 的 `findRoot` 在不同接触判据函数上求根得到 P1/U1/U2/极大/U3/U4/P2 七接触点；修复 E-07。
- **ExtendedSpaceEnvironment.render() 传 renderer 参数**：修正接口签名与所有调用方，让粒子系统的 `drawPointList` 真实提交 GPU；修复 N-02。
- **terrain-engine SurfaceCameraImpl 复用 renderer-core 实现**：renderer-core 导出 `SurfaceCameraImpl` 等缺失符号，terrain-engine 通过 re-export 复用，删除硬编码半径/假高程/忽略 bodyId 的旧实现；修复 E-15 / N-04 / N-01 / E-39。
- **RendererFactory 签名对齐**：WebGPU/WebGL2 Factory 的 `create(config)` / `isSupported(backend)` 补齐参数；修复 E-38 / R-07。
- **服务器 HTTPS 支持**：`packages/server/src/server.ts` 增加 `https.createServer` 模式（证书选项），保留 HTTP 模式作开发回退；修复 E-28。
- **补全 release 目录**：实现 release 构建脚本聚合 `apps/web/dist` + `pkg/` + `data/` + `assets/` + `manifests/` + `licenses/` + `checksums/`；修复 E-30。

### 三、P2 完整性补足（9 项）

- **WebGPU usage 命名常量化**：全面替换 `12/8/24/18/1` 为 `GPUBufferUsage.*` / `GPUTextureUsage.*`；修复 E-05。
- **删除 TerrainTileImpl.needsRefinement() 死代码**：统一为 SSE 逻辑；修复 E-14。
- **productization 移除剩余 Math.random**：`checkForUpdates` 用真实版本比对，`runTest` 用真实测试执行；修复 E-24 / N-05。
- **assets-src 数据补齐**：在 N-06 基础上覆盖 S/A/B/C 全资产层级；修复 E-31。
- **terrain-engine 仅作 re-export 包装**：删除剩余独立 `TerrainEngineImpl`，改为复用 renderer-core 实现；修复 E-39。
- **renderer-core 补全地形相关导出**：`SurfaceCameraImpl`、`IrregularBodyRendererImpl`、`calculateScreenSpaceError`、`ElevationData` 等全部导出；修复 N-01。
- **stellarBackground.update() 使用真实相机位置**：从 camera state 注入，移除硬编码 `{0,0,0}`；修复 N-03。
- **补全 4 类扩展空间环境**：特洛伊群、日球层顶、电流片、银河——补接口定义 + 实现 + render()；修复 N-07。
- **Python pipeline 单元测试**：为 5 个 pipeline 增加 pytest 测试；修复 R-08 补充项。

### 四、P3 架构质量（4 项）

- **跨包接口一致性测试**：建立接口契约测试，每个 interface 都有 mock 实现通过类型检查 + 运行时 smoke test；修复 R-07。
- **pnpm workspace 全链路构建验证**：CI 增加 `pnpm typecheck && pnpm build:wasm && pnpm build && pnpm test`；修复 R-11。
- **FR 覆盖矩阵**：建立 `docs/fr-coverage-matrix.md`，FR ID → 实现文件:line → 状态；修复 R-12。
- **N-04 补充**：Python pipeline 单元测试已合并到 P2 第三项。

## Impact

- **Affected specs**：FR-BOOT-004/005/006、FR-TIME-001/003/004/006、FR-ASTRO-001/002/003/006/008、FR-SCALE-001~006、FR-CAM-001~008、FR-NAV-001~008、FR-EVENT-001~008、FR-SURFACE-001~008、FR-CONTENT-001~007、FR-TOUR-001~006、FR-OFFLINE-001~007；NFR 8.1/8.2/8.3/8.4/8.5 与散落非功能约束全部受影响。
- **Affected code**：
  - `packages/app-orchestrator/src/index.ts`（实现 BootFlow）
  - `packages/astro-core-wasm/`（构建 pkg/）+ `package.json`（build:wasm 脚本）
  - `packages/astro-core-api/src/astro-core-worker.ts`（snapshot 流、Worker 错误事件）
  - `packages/renderer-core/src/index.ts`（RenderLoop、地形相关导出）
  - `packages/renderer-core/src/hdr.ts`（GPU 后处理管线）
  - `packages/renderer-core/src/shadows.ts`（shadow map + 7 接触点）
  - `packages/renderer-core/src/extended-space.ts`（render(renderer) 签名 + 4 类新增 + 真实相机位置）
  - `packages/renderer-core/src/terrain.ts`（删除死代码）
  - `packages/renderer-core/src/productization.ts`（移除剩余 Math.random）
  - `packages/renderer-webgpu/src/index.ts`（usage 常量、Factory 签名）
  - `packages/renderer-webgl2/src/index.ts`（Factory 签名）
  - `packages/terrain-engine/src/index.ts`（re-export，删除独立实现）
  - `packages/server/src/server.ts`（HTTPS 支持）
  - `apps/web/src/App.tsx`（接入 orchestrator）
  - `apps/web/src/components/{SceneViewport,LeftPanel,DiagnosticsPanel}.tsx`（canvas 挂载、动态目录、真实指标）
  - `assets-src/{bodies,effects,terrain}/`（填充公开数据）
  - `release/{checksums,licenses,server}/`（构建产物）
  - `tools/*/test_*.py`（pytest 单元测试）
  - `docs/fr-coverage-matrix.md`（FR 覆盖矩阵，新增）

## ADDED Requirements

### Requirement: 端到端可见主循环

系统 SHALL 在浏览器中启动后输出"太阳 + 地球 + 月球"的可见天体画面，画面由真实 WebGPU/WebGL2 draw call 产生，非占位 emoji。

#### Scenario: 启动后看到天体画面
- **WHEN** 用户在浏览器中打开 localhost 应用
- **THEN** 启动进度由真实资源加载驱动（非 setTimeout）
- **AND** 启动完成后主视口显示太阳、地球、月球的渲染画面
- **AND** 画面随时间推进同步更新位置

### Requirement: 审查问题全量关闭

系统 SHALL 关闭两轮审查报告中所有遗留问题（4 项未修复 + 9 项部分修复 + 7 项新发现 + 4 项架构风险），每项问题有对应代码变更与验证证据。

#### Scenario: 审查清单全部通过
- **WHEN** 审查者对照 `docs/reviews/深入审查报告-第二轮.md` 的 P0/P1/P2/P3 清单逐项核对
- **THEN** 所有项目标记为 ✅ 已完全修复
- **AND** `pnpm typecheck && pnpm build:wasm && pnpm build && pnpm test` 全部通过
- **AND** FR 覆盖矩阵显示 ✅ 完成数 ≥ 70/80，❌ 缺失 = 0，⚠️ 错误 = 0

## MODIFIED Requirements

### Requirement: app-orchestrator 启动编排

`packages/app-orchestrator` SHALL 实现 BootFlow 编排器：协调 `diagnostics.runBootDetection` → `astro-core-api.init Worker` → `resource-runtime` 加载 → `renderer-core` 创建 → `body-renderers` 注册 → 通知 UI 进入 ready；监听 Worker 错误事件触发指数退避 reinit。

### Requirement: astro-core-wasm 构建产物

`packages/astro-core-wasm/pkg/` SHALL 存在 `astro_core.js` + `astro_core_bg.wasm` + `astro_core.d.ts`，由 `pnpm build:wasm` 生成；`loadAstroCoreWasm()` 不抛模块未找到错误。

### Requirement: 前端 UI 接入内核

`App.tsx` SHALL 通过 app-orchestrator 订阅真实启动事件；`SceneViewport` SHALL 创建 `<canvas>` 并挂载 renderer；`LeftPanel` SHALL 调用 NavigationService 动态渲染目录；`DiagnosticsPanel` SHALL 接入真实 PerformanceMonitor 指标。

### Requirement: HDR 与 Shadow 的 GPU 实现

HDR 后处理 SHALL 通过 GPU fragment shader 完成（亮度提取 → downsample/upsample → tone mapping → color grading LUT → vignette）；Shadow SHALL 通过光源视角深度纹理 + PCF 采样实现；交食接触时刻 SHALL 通过 findRoot 求得 7 接触点。

### Requirement: 扩展空间环境完整

ExtendedSpaceEnvironment SHALL 实现 11 类扩展空间环境（小行星带、特洛伊群、柯伊伯带、奥尔特云、太阳风、磁层、极光、恒星背景、日球层顶、电流片、银河）；render() 接收 renderer 参数并真实提交 GPU 绘制；星空背景使用真实相机位置更新。

### Requirement: 服务器 HTTPS 与 release 产物

server.ts SHALL 支持 HTTPS 模式（证书选项）；release 构建脚本 SHALL 聚合 dist + pkg + data + assets + manifests + licenses + checksums 生成版本化 release 目录。

## REMOVED Requirements

### Requirement: 占位实现

**Reason**: 所有占位（app-orchestrator 空、SceneViewport emoji、App.tsx setTimeout 模拟、terrain-engine 复制粘贴、productization Math.random、ExtendedSpaceEnvironment 空对象强转）均阻碍真实功能交付，必须移除。
**Migration**: 占位代码删除并由真实实现替代；保持外部 API 兼容（导出符号不变，行为真实化）。
