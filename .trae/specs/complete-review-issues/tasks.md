# Tasks

## 第一波 P0 阻塞链（打通端到端可见）

- [x] Task 1: 构建 WASM pkg/ 并验证 Worker 加载（修复 E-41 / R-03）
  - [x] SubTask 1.1: 验证 `wasm-pack build` 工具链可用，必要时安装 rustup + wasm-pack
  - [x] SubTask 1.2: 执行 `pnpm build:wasm` 生成 `packages/astro-core-wasm/pkg/{astro_core.js,astro_core_bg.wasm,astro_core.d.ts}`
  - [x] SubTask 1.3: 验证 `loadAstroCoreWasm()` 在 Node 与浏览器环境均能成功加载 wasm 实例
  - [x] SubTask 1.4: 在 `packages/astro-core-wasm/src/__tests__/` 增加 pkg 产物存在的 smoke 测试
- [x] Task 2: 实现 app-orchestrator 启动编排（修复 E-25 / R-02）
  - [x] SubTask 2.1: 定义 BootFlow 状态机：`diagnostics → worker init → resource-runtime → renderer 创建 → body renderers 注册 → UI ready`，每阶段暴露进度回调
  - [x] SubTask 2.2: 实现 Worker 错误事件监听 + 指数退避 reinit（参考 `astro-core-client.ts:97-130` 已有逻辑）
  - [x] SubTask 2.3: 实现每帧调用 `astro-core-api.evaluateSnapshot(bodyIds, utc)` 并将 BodyState 分发到对应 `BodyRenderer.update(time, position, orientation, sunDirection)`，关闭 R-02 数据流断裂
  - [x] SubTask 2.4: 暴露 `subscribe(listener)` / `start()` / `retry()` 公共 API，移除 `export {}` 占位
  - [x] SubTask 2.5: 增加 `packages/app-orchestrator/src/__tests__/orchestrator.test.ts` 覆盖正常启动与 Worker 崩溃 reinit 路径
- [x] Task 3: App.tsx 接入真实启动 + SceneViewport 挂载 canvas（修复 E-35 / R-01）
  - [x] SubTask 3.1: `App.tsx` 移除 setTimeout 模拟，改为 `appOrchestrator.subscribe(event => updateBootProgress(event))`，处理 `booting/ready/error` 三态
  - [x] SubTask 3.2: `SceneViewport.tsx` 创建 `<canvas ref={canvasRef}>`，在 ready 阶段调用 `appOrchestrator.attachCanvas(canvasRef.current)`；移除 ☀️ emoji 占位
  - [x] SubTask 3.3: `LeftPanel.tsx` 移除硬编码 9 行星，改为 `NavigationService.getAllBodyIds()` + `getBodySummary(id)` 动态渲染目录树
  - [x] SubTask 3.4: `DiagnosticsPanel.tsx` 移除 Math.random 假数据，订阅 `appOrchestrator.subscribeMetrics(metrics => setMetrics(metrics))`；FPS 用 rAF 测量替代 setInterval
  - [x] SubTask 3.5: 验证"太阳 + 地球 + 月球"在浏览器中可见，画面随时间推进位置同步更新
- [x] Task 4: 填充 assets-src 公开资产（修复 N-06 / E-31）
  - [x] SubTask 4.1: 编写 `tools/asset-downloader`（或扩展 manifest-builder）下载 NASA/USGS 公开影像（行星纹理贴图）到 `assets-src/bodies/`
  - [x] SubTask 4.2: 下载或生成地球/月球/火星高程数据到 `assets-src/terrain/`
  - [x] SubTask 4.3: 准备特效素材（太阳 corona、极光、磁层 shader 所需噪声图等）到 `assets-src/effects/`
  - [x] SubTask 4.4: 在 manifest.json 中登记全部新增资产，按 S/A/B/C 分层
- [x] Task 5: 实现最小渲染主循环（修复 R-01）
  - [x] SubTask 5.1: 在 `packages/renderer-core/src/index.ts` 增加 `RenderLoop` 类，每帧调用 `SceneGraph.traverse → body renderer.render(renderer) → renderer.endFrame/submit`
  - [x] SubTask 5.2: RenderLoop 接入 app-orchestrator 的 rAF 调度，与 snapshot 推送同步
  - [x] SubTask 5.3: 单元测试覆盖 RenderLoop 单帧执行与 dispose 路径

## 第二波 P1 功能错误（接线与质量）

- [x] Task 6: 修复 ExtendedSpaceEnvironment.render() 签名（修复 N-02 / N-03）
  - [x] SubTask 6.1: 修改 `ExtendedSpaceEnvironment.render(renderer: Renderer)` 接口，所有子模块 `render(renderer)` 同步签名
  - [x] SubTask 6.2: 修复 `stellarBackground.update(cameraPosition)`，从 camera state 注入真实位置，移除 `{0,0,0}` 硬编码
  - [x] SubTask 6.3: 验证 7 类粒子的 `drawPointList` 在传入 renderer 时真实提交 GPU 绘制
- [x] Task 7: renderer-core 地形导出补全 + terrain-engine 复用（修复 N-01 / E-15 / N-04 / E-39）
  - [x] SubTask 7.1: `packages/renderer-core/src/index.ts` 导出 `SurfaceCameraImpl`、`IrregularBodyRendererImpl`、`calculateScreenSpaceError`、`ElevationData`
  - [x] SubTask 7.2: `packages/terrain-engine/src/index.ts` 删除独立的 `SurfaceCameraImpl`（硬编码半径/假高程）与 `TerrainEngineImpl`，改为 `export * from '@solar-system/renderer-core/terrain'`
  - [x] SubTask 7.3: 验证 `packages/terrain-engine/src/__tests__/reexport.test.ts` 覆盖新导出
- [x] Task 8: 修复 RendererFactory 签名（修复 E-38 / R-07）
  - [x] SubTask 8.1: `WebGpuRendererFactory.create(config: RendererConfig): Promise<Renderer>` 与 `isSupported(backend: BackendType): boolean` 补齐参数
  - [x] SubTask 8.2: WebGL2 Factory 同步修复
  - [x] SubTask 8.3: 增加 `packages/renderer-webgpu/src/__tests__/factory-contract.test.ts` 与 WebGL2 对应测试断言签名一致
- [x] Task 9: 实现 HDR GPU 后处理管线（修复 E-06）
  - [x] SubTask 9.1: 在 `packages/renderer-core/src/hdr.ts` 定义 `PostProcessingPipeline` 接口与 GPU pass 编排
  - [x] SubTask 9.2: `packages/renderer-webgpu` 实现 HDR 渲染目标 → 亮度提取 → downsample/upsample 多级 → tone mapping shader → color grading LUT → vignette/CA/dither 合成
  - [x] SubTask 9.3: `packages/renderer-webgl2` 实现等价管线
  - [x] SubTask 9.4: 单元测试覆盖管线阶段顺序与资源 dispose
- [x] Task 10: 实现 Shadow Map 渲染通道 + 7 接触点（修复 E-07）
  - [x] SubTask 10.1: 在 `packages/renderer-core/src/shadows.ts` 定义 `ShadowMapPass` 接口与光源视角深度纹理生成
  - [x] SubTask 10.2: WebGPU/WebGL2 后端实现 PCF 采样
  - [x] SubTask 10.3: `computeContactTimes` 用 `events.ts` 的 `findRoot` 在 P1/U1/U2/极大/U3/U4/P2 七个接触判据函数上求根
  - [x] SubTask 10.4: 单元测试覆盖 7 接触点求根正确性
- [x] Task 11: 服务器 HTTPS 支持（修复 E-28）
  - [x] SubTask 11.1: `packages/server/src/server.ts` 增加 `https.createServer` 模式，接收 `--tls-cert` / `--tls-key` 选项
  - [x] SubTask 11.2: 默认 localhost 仍走 HTTP（开发回退），局域网部署走 HTTPS
  - [x] SubTask 11.3: 更新 `packages/server/src/__tests__/security-headers.test.ts` 覆盖 HTTPS 模式
- [x] Task 12: 补全 release 目录构建脚本（修复 E-30）
  - [x] SubTask 12.1: 编写 `tools/build-release.sh`（或 .ts）聚合 `apps/web/dist` + `pkg/` + `data-src/normalized` + `assets-src` + `release/manifests` + `release/licenses` + `release/checksums`
  - [x] SubTask 12.2: 为 release 文件生成 SHA-256 校验和写入 `release/checksums/checksums.sha256`
  - [x] SubTask 12.3: 拷贝 LICENSE/第三方 license 到 `release/licenses/`
  - [x] SubTask 12.4: 拷贝 start/stop/verify/diagnose 脚本到 `release/server/`

## 第三波 P2 完整性补足

- [x] Task 13: WebGPU usage 命名常量化（修复 E-05）
  - [x] SubTask 13.1: 全量替换 `packages/renderer-webgpu/src/index.ts` 中 `12/8/24/18/1` 为 `GPUBufferUsage.*` / `GPUTextureUsage.*`
  - [x] SubTask 13.2: grep 确认无残留魔法数字
- [x] Task 14: 删除 TerrainTileImpl.needsRefinement() 死代码（修复 E-14）
  - [x] SubTask 14.1: `packages/renderer-core/src/terrain.ts` 删除 `needsRefinement` 方法（或统一为 SSE 调用 `calculateScreenSpaceError`）
  - [x] SubTask 14.2: 测试覆盖 traverse 仅依赖 SSE 判定
- [x] Task 15: productization 移除剩余 Math.random（修复 E-24 / N-05）
  - [x] SubTask 15.1: `UpdateManager.checkForUpdates` 用真实版本比对（manifest.version vs remote manifest）
  - [x] SubTask 15.2: `TestRunner.runTest` 用真实测试执行（调用 `pnpm test` 或子进程）
  - [x] SubTask 15.3: 测试覆盖更新检测与测试运行结果
- [x] Task 16: 补全 4 类扩展空间环境（修复 N-07）
  - [x] SubTask 16.1: 在 `packages/renderer-core/src/extended-space.ts` 增加 `TrojanGroupImpl`、`HeliopauseImpl`、`CurrentSheetImpl`、`GalaxyImpl` 接口与实现
  - [x] SubTask 16.2: `ExtendedSpaceEnvironmentImpl` 注册新模块并参与 update/render
  - [x] SubTask 16.3: 单元测试覆盖 4 类新模块的 render 调用路径
- [x] Task 17: Python pipeline 单元测试（修复 R-08 补充项）
  - [x] SubTask 17.1: `tools/ephemeris-pipeline/test_build_ephemeris.py` 覆盖 read_spk/fit_chebyshev/write_compact_binary
  - [x] SubTask 17.2: `tools/catalog-pipeline/test_build_catalog.py` 覆盖 catalog.json 生成
  - [x] SubTask 17.3: `tools/manifest-builder/test_build_manifest.py` 覆盖 manifest 生成
  - [x] SubTask 17.4: `tools/search-index-builder/test_build_search_index.py` 覆盖索引生成
  - [x] SubTask 17.5: `tools/benchmark-generator/test_generate_benchmark.py` 覆盖基准数据生成

## 第四波 P3 架构质量

- [x] Task 18: 跨包接口一致性测试（修复 R-07）
  - [x] SubTask 18.1: 为每个 public interface（Renderer/RendererFactory/BodyRenderer/NavigationService/TourPlayer/etc.）建立 mock 实现并通过类型检查 + smoke test
  - [x] SubTask 18.2: CI 增加 `pnpm test:contracts` 阶段
- [x] Task 19: pnpm workspace 全链路构建验证（修复 R-11）
  - [x] SubTask 19.1: 验证 `pnpm typecheck` 全 workspace 无类型错误
  - [x] SubTask 19.2: 验证 `pnpm build:wasm && pnpm build` 链路完整
  - [x] SubTask 19.3: 验证 `pnpm test` 全部通过
- [x] Task 20: FR 覆盖矩阵建立（修复 R-12）
  - [x] SubTask 20.1: 编写 `docs/fr-coverage-matrix.md`，FR ID → 实现文件:line → 状态（✅/🟡/❌/⚠️）
  - [x] SubTask 20.2: 随修复进度更新矩阵，最终目标 ✅ ≥ 70/80、❌ = 0、⚠️ = 0

## 第五波 最终验证

- [x] Task 21: 全量回归与审查清单对照
  - [x] SubTask 21.1: 对照 `docs/reviews/深入审查报告-第二轮.md` 第二章 51 项逐条核对状态为 ✅
  - [x] SubTask 21.2: 对照第三章 12 项架构风险逐条核对状态为 ✅ 或合理缓解
  - [x] SubTask 21.3: 执行 `pnpm typecheck && pnpm build:wasm && pnpm build && pnpm test` 全部通过
  - [x] SubTask 21.4: 浏览器手动验证"太阳+地球+月球"可见，启动进度真实，UI 接入内核

# Task Dependencies

- Task 2 (app-orchestrator) 依赖 Task 1 (WASM pkg/) —— Worker init 需要 wasm 产物
- Task 3 (App.tsx + SceneViewport) 依赖 Task 2 —— UI 需要订阅 orchestrator 事件
- Task 5 (RenderLoop) 依赖 Task 1 —— 渲染需要 wasm 提供天体状态
- Task 4 (assets-src) 可与 Task 1-3 并行
- Task 6-17 大部分可并行（不同模块），但 Task 9/10 依赖 Task 5（RenderLoop）
- Task 18-20 依赖前面所有任务完成
- Task 21 是最终验证，依赖所有任务完成
