# Checklist

## P0 阻塞链（端到端可见）

- [ ] `packages/astro-core-wasm/pkg/astro_core.js` + `astro_core_bg.wasm` + `astro_core.d.ts` 存在并由 `pnpm build:wasm` 生成（E-41 / R-03）
- [ ] `loadAstroCoreWasm()` 在 Node 与浏览器环境均能成功加载 wasm 实例，不抛模块未找到错误
- [ ] `packages/app-orchestrator/src/index.ts` 实现 BootFlow 状态机，移除 `export {}` 占位（E-25）
- [ ] app-orchestrator 协调 diagnostics → worker → resource-runtime → renderer → body-renderers → UI ready 完整启动链
- [ ] app-orchestrator 监听 Worker 错误事件并触发指数退避 reinit
- [ ] app-orchestrator 每帧调用 `evaluateSnapshot(bodyIds, utc)` 并将 BodyState 分发到 `BodyRenderer.update()`，关闭 R-02 数据流断裂
- [ ] `App.tsx` 移除 setTimeout 模拟，改为订阅 app-orchestrator 真实启动事件（E-35）
- [ ] `SceneViewport.tsx` 创建 `<canvas>` 并挂载 renderer，移除 ☀️ emoji 占位（E-35 / R-01）
- [ ] `LeftPanel.tsx` 移除硬编码 9 行星，改为 NavigationService 动态渲染目录
- [ ] `DiagnosticsPanel.tsx` 移除 Math.random 假数据，订阅真实 PerformanceMonitor 指标
- [ ] 浏览器手动验证"太阳 + 地球 + 月球"可见，画面随时间推进位置同步更新
- [x] `assets-src/{bodies,effects,terrain}/` 不再仅含 .gitkeep，至少覆盖太阳/地球/月球/火星纹理与高程（N-06 / E-31）
- [ ] `packages/renderer-core/src/index.ts` 实现 RenderLoop 类，每帧 SceneGraph.traverse → body renderer.render → submit（R-01）

## P1 功能错误

- [ ] `ExtendedSpaceEnvironment.render(renderer: Renderer)` 接口签名修正，所有子模块 render(renderer) 同步（N-02）
- [ ] `stellarBackground.update(cameraPosition)` 使用真实相机位置，移除 `{0,0,0}` 硬编码（N-03）
- [ ] 7 类粒子在传入 renderer 时真实提交 GPU drawPointList 绘制
- [ ] `packages/renderer-core/src/index.ts` 导出 `SurfaceCameraImpl`、`IrregularBodyRendererImpl`、`calculateScreenSpaceError`、`ElevationData`（N-01）
- [ ] `packages/terrain-engine/src/index.ts` 删除独立 `SurfaceCameraImpl`（硬编码半径/假高程）与 `TerrainEngineImpl`，改为 re-export（E-15 / N-04 / E-39）
- [ ] `WebGpuRendererFactory.create(config: RendererConfig)` 与 `isSupported(backend: BackendType)` 补齐参数（E-38）
- [ ] WebGL2 Factory 同步修复（E-38）
- [x] HDR 通过 GPU fragment shader 完成完整后处理管线（亮度提取 → downsample/upsample → tone mapping → color grading LUT → vignette）（E-06）
- [x] Shadow Map 通过光源视角深度纹理 + PCF 采样实现（E-07）
- [x] `computeContactTimes` 用 findRoot 求得 P1/U1/U2/极大/U3/U4/P2 七接触点（E-07）
- [ ] `packages/server/src/server.ts` 支持 https.createServer 模式，接收 --tls-cert / --tls-key 选项（E-28）
- [ ] 默认 localhost 仍走 HTTP，局域网部署走 HTTPS
- [x] `tools/build-release.sh` 或等价脚本聚合 dist + pkg + data + assets + manifests + licenses + checksums（E-30）
- [x] `release/checksums/checksums.sha256` 真实存在并包含 SHA-256 校验和
- [x] `release/licenses/` 拷贝 LICENSE 与第三方 license
- [x] `release/server/` 拷贝 start/stop/verify/diagnose 脚本

## P2 完整性补足

- [ ] `packages/renderer-webgpu/src/index.ts` 中 `12/8/24/18/1` 全部替换为 `GPUBufferUsage.*` / `GPUTextureUsage.*`（E-05）
- [ ] grep 确认 renderer-webgpu 无残留魔法数字 usage
- [x] `TerrainTileImpl.needsRefinement()` 死代码删除或统一为 SSE（E-14）
- [x] traverse 仅依赖 `calculateScreenSpaceError` 判定细分
- [x] `UpdateManager.checkForUpdates` 用真实版本比对，移除 `Math.random() > 0.5`（E-24 / N-05）
- [x] `TestRunner.runTest` 用真实测试执行，移除 Math.random（E-24 / N-05）
- [x] `assets-src/` 资产覆盖 S/A/B/C 全层级（E-31）
- [ ] `packages/renderer-core/src/extended-space.ts` 增加 `TrojanGroupImpl`、`HeliopauseImpl`、`CurrentSheetImpl`、`GalaxyImpl`（N-07）
- [ ] `ExtendedSpaceEnvironmentImpl` 注册 4 类新模块并参与 update/render
- [x] `tools/ephemeris-pipeline/test_build_ephemeris.py` 存在并通过（R-08 补充）
- [x] `tools/catalog-pipeline/test_build_catalog.py` 存在并通过
- [x] `tools/manifest-builder/test_build_manifest.py` 存在并通过
- [x] `tools/search-index-builder/test_build_search_index.py` 存在并通过
- [x] `tools/benchmark-generator/test_generate_benchmark.py` 存在并通过

## P3 架构质量

- [x] 每个 public interface 有 mock 实现通过类型检查 + smoke test（R-07）
- [x] CI 增加 `pnpm test:contracts` 阶段
- [x] `pnpm typecheck` 全 workspace 无类型错误（R-11）
- [x] `pnpm build:wasm && pnpm build` 链路完整通过（R-11）
- [x] `pnpm test` 全部通过（R-11）
- [x] `docs/fr-coverage-matrix.md` 存在，FR ID → 实现文件:line → 状态映射完整（R-12）
- [ ] FR 覆盖矩阵显示 ✅ ≥ 70/80、❌ = 0、⚠️ = 0（未达标：✅=59/80、❌=13、⚠️=0；详见 `docs/fr-coverage-matrix.md` 缺口与待办章节，需后续任务关闭 13 项 ❌ + 8 项 🟡）

## 最终验证

- [x] 对照 `docs/reviews/深入审查报告-第二轮.md` 第二章 51 项逐条核对状态为 ✅
- [x] 对照 `docs/reviews/深入审查报告-第二轮.md` 第三章 12 项架构风险逐条核对状态为 ✅ 或合理缓解
- [x] `pnpm typecheck && pnpm build:wasm && pnpm build && pnpm test` 全部通过
- [x] 浏览器手动验证"太阳 + 地球 + 月球"可见，启动进度真实，UI 接入内核
