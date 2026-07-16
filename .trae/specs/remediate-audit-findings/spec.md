# 审查问题全量补足开发 Spec

## Why

`docs/reviews/实现审查报告.md`（V1.0，2026-07-16）已完成对仓库的全量审查，识别出 44 条错误实现（E-01~E-44）、12 项架构风险（R-01~R-12）、80 条 FR 中 27 条缺失 + 3 条错误 + 24 条部分完成、40 项 NFR 中 17 条未达标。当前项目整体完成度仅 22-25%，**无法在浏览器中输出任何天体画面**，处于"骨架已立、血肉未填"的早期阶段。

为使项目达到设计文档要求并能在浏览器中真实运行天体画面，必须按审查报告第七章任务清单全量执行补足开发，并在每完成一个修复后立即测试验证，确保修复真实生效、不引入回归。

## What Changes

- **按 P0 → P1 → P2 → P3 优先级全量修复审查报告所列 44 条错误**（E-01~E-44）。
- **打通最小可见渲染主循环**：WASM 构建 → app-orchestrator 编排 → App.tsx/SceneViewport 接入 → body renderer 渲染 → "太阳+地球+月球"可见。
- **打通数据与事件链路**：ephemeris-pipeline 实现 → catalog.json 生成 → Worker 事件引擎桥接 → EventsServiceImpl 改调真实引擎。
- **打通巡航与扩展空间**：tour-player 实现 → CruiseWaypoint 扩展 → 扩展空间 6 类粒子系统 + StarData 接入。
- **补足 P1 核心功能**：WebGPU 修复（topology/shaderLocation/HDR/shadow）、导航拼音修复、地形 face/SSE/bodyId 修复、服务器安全头、productization 真实化、Worker clock/ephemeris RPC、BodyRendererFactory 补全。
- **补足 P2 完整性**：自动画质反馈回路、PureViewingMode 接入、sample_orbit 自适应、相机系统补全、尺度模式、事件交互、地形补全、扩展空间补齐、内容补全、导航 API 补全。
- **补足 P3 质量**：WebGPU 命名常量、设备泄漏修复、terrain-engine 合并、无障碍 ARIA、公共 API 导出测试、兼容矩阵、诊断包导出、FR 覆盖矩阵、Windows 安装包、运维脚本。
- **每完成一个修复任务立即运行验证**：相关单元测试、typecheck、构建、集成测试，验证通过后再进入下一任务。

## Impact

- 受影响产物：仓库中所有源码文件（`apps/web/`、`packages/`、`crates/`、`tools/`）、数据资产（`data-src/`、`assets-src/`）、构建产物（`release/`）、配置（`package.json`、`Cargo.toml`、CI）。
- 受影响 specs：`audit-implementation-vs-design`（审查 spec，作为本 spec 的输入基线）。
- 不涉及回滚：保留审查报告本身及用户既有改动；仅修复审查报告所列错误，不重写未列入问题的代码。
- 关键下游：补足完成后项目可在浏览器中运行出真实天体画面，FR 完成率从 32.5% 提升至 ≥87.5%，NFR 达标率从 17.5% 提升至 ≥75%。

## ADDED Requirements

### Requirement: 全量修复审查错误
系统 SHALL 修复审查报告第六章所列全部 44 条错误（E-01~E-44），每条修复必须消除原 file:line 证据所指的错误实现。

#### Scenario: 错误逐条消除
- **WHEN** 修复某条 E-XX 后
- **THEN** 原证据 file:line 处的实现不再包含错误描述所述行为；新增/修改的代码通过对应单元测试

### Requirement: 最小可见渲染主循环
系统 SHALL 实现"太阳+地球+月球"在浏览器中可见的最小渲染主循环，作为 P0 第一波交付。

#### Scenario: 浏览器可见天体
- **WHEN** 用户在浏览器打开 localhost
- **THEN** 看到 canvas 上渲染出太阳、地球、月球（非占位 emoji）；启动进度由真实加载驱动（非 setTimeout 模拟）

### Requirement: 数据与事件链路打通
系统 SHALL 实现 ephemeris-pipeline 生成星历二进制、catalog.json 含 290+ 已命名卫星、Worker 事件引擎桥接返回真实 EventResult[]。

#### Scenario: 事件搜索返回真实数据
- **WHEN** 搜索 2024 年日食
- **THEN** 返回真实 EventResult[]（非空数组、非硬编码样本），含开始/极大/结束阶段与精度等级

### Requirement: 每修复一项立即验证
每完成一个修复任务后 SHALL 立即运行相关验证（typecheck/test/build/集成），验证通过后再进入下一任务。

#### Scenario: 修复后验证
- **WHEN** 完成某修复任务
- **THEN** 运行 `pnpm typecheck`、相关包 `pnpm test`、必要时 `pnpm build`，全部通过才标记任务完成

### Requirement: FR/NFR 回归达标
补足完成后 SHALL 使 80 条 FR 中 ✅ 完成数 ≥ 70（87.5%），❌ 缺失数 = 0，⚠️ 错误数 = 0；40 项 NFR 中 ✅ 达标数 ≥ 30（75%）。

#### Scenario: 回归通过
- **WHEN** 全部修复任务完成
- **THEN** 按审查报告第八章验证计划回归，FR/NFR 达标率满足上述阈值

## MODIFIED Requirements

### Requirement: app-orchestrator 启动编排
原 `packages/app-orchestrator/src/index.ts` 仅为 `export {}` 占位。修改为实现完整 BootFlow 编排器：协调 diagnostics.runBootDetection → astro-core-api Worker init → resource-runtime 加载 → renderer-core 创建 → body-renderers 注册 → 通知 UI ready；监听 Worker 错误事件触发指数退避 reinit。

### Requirement: SceneViewport 真实渲染挂载
原 `apps/web/src/components/SceneViewport.tsx` 仅渲染占位 emoji。修改为创建 `<canvas>`、实例化 renderer、挂载到 canvas、订阅 RenderLoop。

### Requirement: body-renderers GPU draw call
原 5 类 body renderer 的 `render(): void {}` 全空。修改为在 render() 中调用 renderer.beginPass/draw/endPass，每类有专属材质/shader。

## REMOVED Requirements

### Requirement: setTimeout 模拟启动
**Reason**: `App.tsx:36-60` 用 setTimeout 模拟启动进度，与设计 FR-BOOT-005 要求"分阶段进度由真实资源加载驱动"冲突。
**Migration**: 改为订阅 app-orchestrator 的真实启动事件流，进度随 WASM 加载/星历加载/天体资产加载真实推进。

### Requirement: Math.random 伪造指标
**Reason**: `productization.ts` 与 `DiagnosticsPanel.tsx` 用 Math.random 生成 hash/size/validate/drawCalls 等指标，违反数据真实性原则。
**Migration**: productization 改用 crypto.subtle.digest('SHA-256') + 真实文件大小；DiagnosticsPanel 接入真实 PerformanceMonitor。
