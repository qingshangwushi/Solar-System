# Tasks

## 说明
本任务清单基于 `docs/reviews/实现审查报告.md` 第七章任务清单（T-P0-01 ~ T-P3-10）细化而来，按 6 个执行波次组织。每波次内任务按依赖顺序排列，无依赖任务可并行。**每完成一个任务必须立即运行验证**（typecheck/相关包 test/build），验证通过后才能标记完成并进入下一任务。

任务编号沿用审查报告的 `T-P{优先级}-{序号}` 格式，对应修复的错误编号 `E-XX` 在子任务中标注。

---

## Wave 1：打通最小可见渲染主循环（P0 阻塞修复）

> 目标：浏览器打开 localhost 后能看到"太阳+地球+月球"真实渲染（非占位 emoji），启动进度由真实加载驱动。

- [x] Task T-P0-01: WASM 构建——生成 `packages/astro-core-wasm/pkg/`（修复 E-41）
  - [ ] SubTask 1.1: 检查 `package.json` 的 `build:wasm` 脚本与 wasm-pack/rust 工具链可用性
  - [ ] SubTask 1.2: 执行 `pnpm build:wasm` 生成 `pkg/astro_core.js` 与 `.wasm`
  - [ ] SubTask 1.3: 验证 `loadAstroCoreWasm()` 不抛模块未找到错误
  - [ ] 验证：`pnpm build:wasm` 成功；`packages/astro-core-wasm/pkg/astro_core.js` 与 `.wasm` 存在

- [x] Task T-P0-02: 导出 events 模块——修复孤儿模块（修复 E-18）
  - [ ] SubTask 2.1: 在 `packages/astro-core-wasm/src/index.ts` 添加 `export * from './events.js';`
  - [ ] SubTask 2.2: 从主入口能 import findEclipses 等
  - [ ] 验证：`pnpm --filter @solar-system/astro-core-wasm test` 通过；新增"公共 API 导出测试"断言 events 模块存在

- [x] Task T-P0-03: StarData 实现 StellarBackground 接口并实例化（修复 E-17/E-34）
  - [ ] SubTask 3.1: 让 `StarData` 补 `update/render/dispose/setStarDensity/setMagnitudeRange` 方法
  - [ ] SubTask 3.2: `ExtendedSpaceEnvironmentImpl` 构造时 `this.stellarBackground = new StarData()`
  - [ ] SubTask 3.3: `update()` 中调用 `stellarBackground.update(cameraPosition)`
  - [ ] 验证：render 路径不抛 TypeError；新增单元测试覆盖 StarData 实现 StellarBackground 接口

- [x] Task T-P0-04: 修复 WebGPU submit 空提交（修复 E-01）
  - [ ] SubTask 4.1: `beginPass` 创建的 `commandEncoder` 保存为实例字段
  - [ ] SubTask 4.2: `endPass` 后将 `commandEncoder.finish()` 加入待提交列表
  - [ ] SubTask 4.3: `submit()` 调用 `queue.submit([finishedCmd])` 并清空待提交列表
  - [ ] 验证：`pnpm --filter @solar-system/renderer-webgpu test` 通过；新增测试断言 submit 非空

- [x] Task T-P0-05: 修复 WebGPU bytesPerRow 计算（修复 E-02）
  - [ ] SubTask 5.1: createTexture 时存元数据（width/height/format）
  - [ ] SubTask 5.2: `bytesPerRow = alignTo(width * bytesPerPixel(format), 256)`
  - [ ] SubTask 5.3: 非 rgba8unorm 格式不返回 0
  - [ ] 验证：新增测试覆盖多种像素格式的 bytesPerRow 计算

- [x] Task T-P0-06: 实现 SphereGeometry 顶点生成（修复 E-10）
  - [ ] SubTask 6.1: 构造时按 UV 球面公式生成 position/normal/uv 顶点数组与索引数组
  - [ ] SubTask 6.2: 调用注入的 renderer.createBuffer 上传
  - [ ] SubTask 6.3: 存真实 BufferHandle 到字段
  - [ ] 验证：新增测试断言 vertexCount/indexCount 与生成数据长度一致

- [x] Task T-P0-07: 实现 5 类 body renderer 的 GPU draw call（修复 E-09）
  - [ ] SubTask 7.1: SunRendererImpl 实现 emissive+corona shader（render 调用 beginPass/draw/endPass）
  - [ ] SubTask 7.2: SolidPlanetRenderer 实现 PBR 材质 draw call
  - [ ] SubTask 7.3: EarthRendererImpl 实现 PBR+atmosphere draw call
  - [ ] SubTask 7.4: GasGiantRendererImpl 实现云带 draw call
  - [ ] SubTask 7.5: RingRendererImpl 实现土星环 draw call
  - [ ] 验证：`pnpm --filter @solar-system/body-renderers test` 通过；render() 不再为空

- [x] Task T-P0-08: 实现最小渲染主循环 RenderLoop（修复 R-01）
  - [ ] SubTask 8.1: 在 `packages/renderer-core/src/index.ts` 新增 RenderLoop 类
  - [ ] SubTask 8.2: 每帧调用 SceneGraph.traverse → body renderer.render → renderer.submit
  - [ ] SubTask 8.3: 打通"太阳+地球+月球"可见输出
  - [ ] 验证：新增测试覆盖 RenderLoop 帧循环；集成测试确认 3 body 可见

- [ ] Task T-P0-09: 实现 app-orchestrator 启动编排（修复 E-25）
  - [ ] SubTask 9.1: 编排 diagnostics.runBootDetection → astro-core-api Worker init
  - [ ] SubTask 9.2: 编排 resource-runtime 加载 → renderer-core 创建 → body-renderers 注册
  - [ ] SubTask 9.3: 通知 UI 进入 ready；监听 Worker 错误事件触发指数退避 reinit
  - [ ] 验证：`pnpm --filter @solar-system/app-orchestrator test` 通过；新增编排流程测试

- [ ] Task T-P0-10: App.tsx 接入真实启动流程 + SceneViewport 挂载 canvas（修复 E-35）
  - [ ] SubTask 10.1: App.tsx 调用 app-orchestrator 订阅真实启动事件（移除 setTimeout 模拟）
  - [ ] SubTask 10.2: SceneViewport 创建 `<canvas>` 并挂载 renderer
  - [ ] SubTask 10.3: LeftPanel 调用 NavigationService.getAllBodyIds 动态渲染（移除硬编码 9 行星）
  - [ ] 验证：`pnpm --filter web typecheck` 通过；浏览器集成测试确认 canvas 渲染

---

## Wave 2：打通数据与事件链路

> 目标：ephemeris-pipeline 生成星历二进制、catalog.json 含 290+ 卫星、Worker 事件引擎返回真实 EventResult[]、EventsServiceImpl 改调真实引擎。

- [ ] Task T-P0-12: 实现 ephemeris-pipeline（SPK→chebyshev）（修复 E-29）
  - [ ] SubTask 12.1: 实现 read_spk（SPK-Daf 解析，可用 SpiceyPy 或自研）
  - [ ] SubTask 12.2: 实现 clip_time_range、fit_chebyshev（numpy.polynomial.chebyshev）
  - [ ] SubTask 12.3: 实现 analyze_error、write_compact_binary、write_report
  - [ ] SubTask 12.4: 生成冒烟数据集（地月+8 行星 1 年星历）
  - [ ] 验证：`python tools/ephemeris-pipeline/build_ephemeris.py` 成功；data-src/normalized 有星历二进制

- [ ] Task T-P0-13: 生成 catalog.json + 填充 data-src（修复 E-31/E-12）
  - [ ] SubTask 13.1: 实现 `tools/catalog-pipeline/` 主脚本（生成 catalog.json）
  - [ ] SubTask 13.2: catalog.json 含 290+ 已命名卫星
  - [ ] SubTask 13.3: data-src/normalized 有星历二进制与 catalog.json
  - [ ] 验证：catalog.json 条目数 ≥ 290；JSON Schema 校验通过

- [ ] Task T-P0-11: Worker 桥接事件引擎（修复 E-20）
  - [ ] SubTask 11.1: event.search 调用 findEclipses 等返回真实 EventResult[]
  - [ ] SubTask 11.2: event.refine/buildObservationPlan/getUncertainty 实现
  - [ ] 验证：新增测试覆盖 event.search 返回非空 EventResult[]

- [ ] Task T-P1-10: EventsServiceImpl 改调真实引擎（修复 E-19）
  - [ ] SubTask 10.1: 移除 8 个硬编码样本事件 generateSampleEvents
  - [ ] SubTask 10.2: 调用 findEclipses 等按时间窗口实时计算
  - [ ] 验证：`pnpm --filter @solar-system/renderer-core test` 通过；事件日期不再随系统时钟漂移

- [ ] Task T-P1-16: Worker clock/ephemeris RPC 实现（修复 E-32）
  - [ ] SubTask 16.1: Worker 维护 TimeConverter + 当前 utc/rate/paused 状态
  - [ ] SubTask 16.2: clock.getUtc/setUtc/setRate/pause/resume/step 实现
  - [ ] SubTask 16.3: ephemeris.supports 查询已注册 body_id 集合；getCoverage 返回真实范围
  - [ ] 验证：新增测试覆盖 clock 状态机与 ephemeris 查询

---

## Wave 3：打通巡航与扩展空间

> 目标：tour-player 实现播放控制、CruiseWaypoint 扩展至 12+ 字段、扩展空间 6 类粒子系统可见、CruiseServiceImpl 驱动相机/时钟/尺度/图层。

- [ ] Task T-P0-14: 实现 tour-player 播放控制器（修复 E-26）
  - [ ] SubTask 14.1: 加载 Cruise JSON；play/pause/seek/exit 实现
  - [ ] SubTask 14.2: 与 astro-core-worker 的 tour.* RPC 桥接
  - [ ] 验证：`pnpm --filter @solar-system/tour-player test` 通过；播放状态机测试

- [ ] Task T-P0-15: 扩展空间粒子系统实现（修复 E-16）
  - [ ] SubTask 15.1: AsteroidBeltImpl render() 实现 GPU 粒子绘制（point-list）
  - [ ] SubTask 15.2: KuiperBeltImpl/OortCloudImpl render() 实现
  - [ ] SubTask 15.3: SolarWindImpl/MagnetosphereImpl/AurorasImpl render() 实现
  - [ ] 验证：render() 不再为空；新增测试覆盖粒子数据上传

- [ ] Task T-P1-11: 扩展 CruiseWaypoint 至 12+ 字段（修复 E-21）
  - [ ] SubTask 11.1: 接口补全时间设置/相机目标/相机位置方向/参考系/缓动曲线/时间倍率/尺度模式/图层显隐/画质最低要求/资源预加载/文字卡片/退出状态
  - [ ] SubTask 11.2: CRUISES 常量数据补全；新增 Cruise JSON Schema（schemas 包）校验
  - [ ] 验证：`pnpm --filter @solar-system/schemas test` 通过；Schema 校验 CRUISES

- [ ] Task T-P1-12: CruiseServiceImpl.update 驱动相机/时钟/尺度/图层（修复 E-22）
  - [ ] SubTask 12.1: update() 调用相机/时钟/尺度/图层 setter
  - [ ] SubTask 12.2: 移除 Date.now() 改用统一 deltaTime 累加
  - [ ] 验证：新增测试覆盖 update 驱动多维度变化；getCurrentProgress 与 update 时钟一致

---

## Wave 4：P1 核心功能补足

> 目标：WebGPU 修复、导航拼音修复、地形修复、服务器安全头、productization 真实化、BodyRendererFactory 补全。

- [ ] Task T-P1-01: 修复 WebGPU topology 硬编码（修复 E-03）
  - [ ] SubTask 1.1: 建立 PrimitiveType → GPUPrimitiveTopology 完整映射表
  - [ ] SubTask 1.2: cullMode 默认 'none'
  - [ ] 验证：新增测试覆盖 points/lines/line_strip/triangle_strip 映射

- [ ] Task T-P1-02: 修复 WebGPU shaderLocation 硬编码（修复 E-04）
  - [ ] SubTask 2.1: 用 vertexAttributes.map((attr,i)=>({shaderLocation:i,...}))
  - [ ] 验证：新增测试覆盖多属性顶点不冲突

- [ ] Task T-P1-03: 实现 GPU HDR 后处理管线（修复 E-06）
  - [ ] SubTask 3.1: HDR 渲染目标 → 亮度提取 → downsample/upsample
  - [ ] SubTask 3.2: tone mapping shader → color grading LUT → vignette 合成
  - [ ] SubTask 3.3: PostProcessingPipeline 接口；WebGPU/WebGL2 后端实现
  - [ ] 验证：新增测试覆盖后处理管线各阶段

- [ ] Task T-P1-04: 实现 shadow map 渲染通道（修复 E-07）
  - [ ] SubTask 4.1: 光源视角深度纹理 + PCF 采样
  - [ ] SubTask 4.2: 交食接触时刻用 events.ts findRoot 求 7 接触点
  - [ ] 验证：新增测试覆盖 shadow map 与 7 接触点

- [ ] Task T-P1-05: 修复导航拼音搜索逻辑（修复 E-11）
  - [ ] SubTask 5.1: 引入 pinyin-pro 或反转 PINYIN_MAP 为 `{ '太阳': 'taiyang' }`
  - [ ] SubTask 5.2: getPinyin 返回真实拼音；firstLetter 取拼音首字母大写
  - [ ] 验证：搜索"mu xing"命中"木星"；新增测试覆盖拼音搜索

- [ ] Task T-P1-06: 卫星目录改为数据驱动（修复 E-12）
  - [ ] SubTask 6.1: 移除 SOLAR_SYSTEM_BODIES 硬编码
  - [ ] SubTask 6.2: 从 catalog.json 加载；含 290+ 卫星
  - [ ] 验证：NavigationServiceImpl 构造接收外部 BodyEntry[]；条目数 ≥ 290

- [ ] Task T-P1-07: 修复地形 face 4/5 边界重叠（修复 E-13）
  - [ ] SubTask 7.1: 重新设计 6 面 cube-sphere 投影
  - [ ] SubTask 7.2: face 4 = 南半球 0°E~180°E；face 5 = 南半球 -180°E~0°E
  - [ ] 验证：新增测试断言六面 bounds 互不重叠且并集为全球

- [ ] Task T-P1-08: 地形 LOD 改用屏幕空间误差（修复 E-14）
  - [ ] SubTask 8.1: 瓦片存 geometricError
  - [ ] SubTask 8.2: traverse 按 fov/分辨率/距离计算 screenSpaceError 决定 split
  - [ ] 验证：新增测试覆盖 SSE 计算

- [ ] Task T-P1-09: 地形接入 bodyId + 真实高程（修复 E-15）
  - [ ] SubTask 9.1: Controller 接收 bodyId 与半径（月球 1737.4km、火星 3389.5km）
  - [ ] SubTask 9.2: getSurfaceHeight 从 elevationUrl 加载真实高程
  - [ ] 验证：新增测试覆盖多 body 半径

- [ ] Task T-P1-13: productization 替换 Math.random（修复 E-24）
  - [ ] SubTask 13.1: calculateHash 用 crypto.subtle.digest('SHA-256')
  - [ ] SubTask 13.2: checkExists 用 fs.stat/fetch HEAD；getSize 用真实文件大小
  - [ ] SubTask 13.3: getStats 接入真实 PerformanceMonitor 数据
  - [ ] 验证：新增测试覆盖 SHA-256 hash 与真实文件大小（非随机）

- [ ] Task T-P1-14: 服务器加 HTTPS/COOP/COEP/Brotli/ETag（修复 E-28）
  - [ ] SubTask 14.1: https.createServer 提供证书选项
  - [ ] SubTask 14.2: 添加 COOP/COEP/CORP/HSTS/CSP 头
  - [ ] SubTask 14.3: 用 etag 包生成 ETag；预压缩 .br；Cache-Control immutable
  - [ ] 验证：curl -I 检查头存在；新增测试覆盖安全头

- [ ] Task T-P1-15: 实现 release 构建脚本（修复 E-30）
  - [ ] SubTask 15.1: 聚合 dist+pkg+data+assets+manifests+licenses+checksums
  - [ ] SubTask 15.2: 生成版本化 release 目录
  - [ ] 验证：执行 release 脚本后 release/ 目录有产物

- [ ] Task T-P1-17: BodyRendererFactory 补全卫星/矮行星/小行星 case（修复 E-43）
  - [ ] SubTask 17.1: 卫星/矮行星补 SolidPlanetRenderer case（用 bodyId 查询半径）
  - [ ] SubTask 17.2: 小行星/彗星用程序化不规则形状 renderer
  - [ ] 验证：支持导航目录 58+ body；新增测试覆盖 case 覆盖

- [ ] Task T-P1-18: 修复 getScreenEdgeIndicator 逻辑反（修复 E-44）
  - [ ] SubTask 18.1: dot < 0 返回 null（目标在前方无需边缘指示）
  - [ ] SubTask 18.2: 目标在视野外时计算边缘投影点
  - [ ] 验证：新增测试覆盖箭头显示逻辑

- [ ] Task T-P1-19: GPU 设备丢失重建流程（修复 R-设备丢失）
  - [ ] SubTask 19.1: 实现 device.lost.then 回调重建 renderer
  - [ ] SubTask 19.2: 模拟 loseContext 验证恢复
  - [ ] 验证：新增测试覆盖设备丢失重建

---

## Wave 5：P2 完整性补足

> 目标：自动画质反馈、PureViewingMode 接入、sample_orbit 自适应、相机系统补全、尺度模式、事件交互、地形补全、扩展空间补齐、内容补全、导航 API 补全。

- [ ] Task T-P2-01: 自动画质运行时降级反馈回路（修复 E-08）
  - [ ] SubTask 1.1: PerformanceMonitor 周期采样
  - [ ] SubTask 1.2: 达降级阈值自动调 setTextureResolution/setShadowResolution
  - [ ] 验证：新增测试覆盖自动降级触发

- [ ] Task T-P2-02: PureViewingMode 接入 UI 隐藏与渲染调整（修复 E-23）
  - [ ] SubTask 2.1: enter() 通知 UI 隐藏面板/禁用 HUD
  - [ ] SubTask 2.2: setAutoRotate 启用环绕；setAmbientMode 调整后处理
  - [ ] 验证：新增测试覆盖纯净模式状态

- [ ] Task T-P2-03: sample_orbit 曲率自适应步长（修复 E-27）
  - [ ] SubTask 3.1: 基于局部曲率/速度梯度动态调整步长
  - [ ] SubTask 3.2: 近日点加密、远日点放疏
  - [ ] 验证：新增 Rust 测试覆盖自适应步长

- [ ] Task T-P2-04: sampleOrbit RPC 参数语义对齐（修复 E-33）
  - [ ] SubTask 4.1: protocol 与 wasm 明确 step_days 或 samples 语义
  - [ ] 验证：消除混合用法；新增测试

- [ ] Task T-P2-05: runBenchmark 实测 GPU 帧时（修复 E-37）
  - [ ] SubTask 5.1: 创建临时 renderer 绘制 N 万三角形
  - [ ] SubTask 5.2: PerformanceMonitor 采样帧时；映射 QualityProfile
  - [ ] 验证：gpuFrameTimeMs/cpuFrameTimeMs 不再硬编码

- [ ] Task T-P2-06: RendererFactory 签名补齐（修复 E-38）
  - [ ] SubTask 6.1: create(config: RendererConfig) 补 config 参数
  - [ ] SubTask 6.2: isSupported(backend) 补 backend 参数
  - [ ] 验证：新增测试覆盖 Factory 签名一致性

- [ ] Task T-P2-07: AstroCore.time_range 真实更新（修复 E-40）
  - [ ] SubTask 7.1: register_ephemeris 时更新 time_range（min t_start/max t_end）
  - [ ] SubTask 7.2: time_range_min/max 返回真实值
  - [ ] 验证：新增 Rust 测试覆盖 time_range 更新

- [ ] Task T-P2-08: 4 个 pipeline 目录补 README+骨架（修复 E-42）
  - [ ] SubTask 8.1: catalog-pipeline/manifest-builder/search-index-builder/benchmark-generator 各写 README + 主脚本骨架
  - [ ] 验证：各目录有 README + 主脚本

- [ ] Task T-P2-09: manifest-builder 实现
  - [ ] SubTask 9.1: 生成 manifest.json 含版本/大小/SHA-256 哈希/依赖
  - [ ] 验证：manifest.json 字段完整

- [ ] Task T-P2-10: search-index-builder 实现
  - [ ] SubTask 10.1: 生成搜索索引（拼音/别名/编号）
  - [ ] 验证：搜索索引字段完整

- [ ] Task T-P2-11: resource-runtime 显存预算器（修复 R-显存）
  - [ ] SubTask 11.1: 影视 5-6GB/标准 1.5-2.5GB 预算
  - [ ] SubTask 11.2: 单主目标最高 LOD；接入渲染
  - [ ] 验证：新增测试覆盖显存预算

- [ ] Task T-P2-12: resource-runtime 分包/优先级/Range
  - [ ] SubTask 12.1: 资源分包；加载优先级队列；Range 集成；React.lazy
  - [ ] 验证：新增测试覆盖分包加载

- [ ] Task T-P2-13: 相机四类模式 + 平滑过渡 + 碰撞防护（修复 FR-CAM）
  - [ ] SubTask 13.1: FollowController/SurfaceLowController
  - [ ] SubTask 13.2: flyTo 贝塞尔插值；尺度感知速度
  - [ ] SubTask 13.3: 最小距离约束；动态裁剪面；三键快捷视角
  - [ ] 验证：新增测试覆盖四类相机与过渡

- [ ] Task T-P2-14: 尺度模式切换（真实/增强）（修复 FR-SCALE）
  - [ ] SubTask 14.1: mode:'real'|'enhanced' 切换
  - [ ] SubTask 14.2: distanceScale/radiusScale/satelliteScale 三类独立
  - [ ] SubTask 14.3: 增强标注水印；标签屏幕空间增强
  - [ ] 验证：新增测试覆盖尺度模式

- [ ] Task T-P2-15: FR-CAM-002~007 相机系统补全
  - [ ] SubTask 15.1: 平滑过渡路径；尺度感知速度；近景减速
  - [ ] SubTask 15.2: 碰撞防护；动态裁剪面；预设视角
  - [ ] 验证：新增测试覆盖各 FR-CAM 项

- [ ] Task T-P2-16: FR-EVENT-005/006/007 事件交互补全
  - [ ] SubTask 16.1: jumpToEventMax + 推荐视角
  - [ ] SubTask 16.2: 事件时间轴自动播放；predicted/approximate 标签
  - [ ] 验证：新增测试覆盖事件交互

- [ ] Task T-P2-17: FR-SURFACE-003/004/006/007/008 地形补全
  - [ ] SubTask 17.1: fallback 父瓦片；skirt 边缘缝合
  - [ ] SubTask 17.2: 气态行星高层大气限制；太阳最小安全距离
  - [ ] SubTask 17.3: 小行星/彗星近景 renderer
  - [ ] 验证：新增测试覆盖地形补全项

- [ ] Task T-P2-18: 扩展空间补齐特洛伊群/日球层顶/电流片/银河
  - [ ] SubTask 18.1: 4 类新增实现 + render()
  - [ ] 验证：新增测试覆盖 4 类扩展空间

- [ ] Task T-P2-19: content-service A 级天体内容 + 程序化示意外观
  - [ ] SubTask 19.1: A 级天体补 sections
  - [ ] SubTask 19.2: proceduralAppearanceNote 填充
  - [ ] SubTask 19.3: 内容抽离为 data/content/*.json
  - [ ] 验证：新增测试覆盖 A 级内容

- [ ] Task T-P2-20: 导航 buildHierarchy/jumpToParent/listSatellites/批量显隐 API
  - [ ] SubTask 20.1: buildHierarchy 返回树；jumpToParent/listSatellites
  - [ ] SubTask 20.2: setOrbitsVisible/setLabelsVisible
  - [ ] 验证：新增测试覆盖导航 API

---

## Wave 6：P3 质量提升

> 目标：WebGPU 命名常量、设备泄漏修复、terrain-engine 合并、无障碍 ARIA、公共 API 导出测试、兼容矩阵、诊断包导出、FR 覆盖矩阵、Windows 安装包、运维脚本。

- [ ] Task T-P3-01: WebGPU usage 改用命名常量（修复 E-05）
  - [ ] SubTask 1.1: GPUBufferUsage.*/GPUTextureUsage.* 按位组合
  - [ ] 验证：移除魔法数字 12/8/24/18/1

- [ ] Task T-P3-02: detectWebgpu 设备泄漏修复（修复 E-36）
  - [ ] SubTask 2.1: 用 adapter.limits 或获取 device 后立即 destroy()
  - [ ] 验证：新增测试覆盖设备释放

- [ ] Task T-P3-03: terrain-engine 与 renderer-core/terrain.ts 合并（修复 E-39）
  - [ ] SubTask 3.1: 决定单一实现位置（建议 terrain-engine 持有 bodyId/高程数据）
  - [ ] SubTask 3.2: 消除复制粘贴
  - [ ] 验证：单一实现；原有测试通过

- [ ] Task T-P3-04: 无障碍 ARIA/降运动/对比度（修复 NFR-34.3）
  - [ ] SubTask 4.1: aria-*/role/tabIndex 标注
  - [ ] SubTask 4.2: prefers-reduced-motion；对比度处理
  - [ ] 验证：a11y 扫描通过

- [ ] Task T-P3-05: 公共 API 导出测试（修复 R-08）
  - [ ] SubTask 5.1: 遍历预期导出列表断言 index.ts 存在
  - [ ] SubTask 5.2: productization 替换随机数后补真实测试
  - [ ] 验证：导出测试通过

- [ ] Task T-P3-06: 浏览器/OS 兼容矩阵 + GPU 黑名单（修复 NFR-32）
  - [ ] SubTask 6.1: 兼容矩阵文档；版本冻结记录；GPU 黑名单
  - [ ] 验证：文档存在

- [ ] Task T-P3-07: 本地诊断包导出（修复 NFR-33.4）
  - [ ] SubTask 7.1: DiagnosticsPanel 导出 JSON 诊断包功能
  - [ ] 验证：导出功能可用

- [ ] Task T-P3-08: FR 覆盖矩阵建立（修复 R-12）
  - [ ] SubTask 8.1: FR ID→实现文件:line→状态 矩阵
  - [ ] 验证：矩阵随修复进度更新

- [ ] Task T-P3-09: Windows 10/11 安装包+手册（修复 NFR-8.5-d）
  - [ ] SubTask 9.1: 安装包；非开发人员可完成的安装手册
  - [ ] 验证：手册存在

- [ ] Task T-P3-10: 启动/停止/校验/诊断运维脚本（修复 NFR-8.5-b）
  - [ ] SubTask 10.1: start/stop/verify/diagnose 脚本
  - [ ] 验证：脚本可执行

---

# Task Dependencies

## Wave 1 内部依赖
- T-P0-02 依赖 T-P0-01（WASM 构建后才能验证导出）
- T-P0-07 依赖 T-P0-04（submit 修复后才能渲染）、T-P0-06（SphereGeometry 顶点）
- T-P0-08 依赖 T-P0-04
- T-P0-09 依赖 T-P0-01、T-P0-08
- T-P0-10 依赖 T-P0-09

## Wave 1 → Wave 2 依赖
- T-P0-11 依赖 T-P0-01、T-P0-02
- T-P0-13 依赖 T-P0-12
- T-P1-10 依赖 T-P0-11

## Wave 1 → Wave 3 依赖
- T-P0-14 依赖 T-P0-09
- T-P0-15 依赖 T-P0-08
- T-P1-12 依赖 T-P1-11

## Wave 2 → Wave 4 依赖
- T-P1-06 依赖 T-P0-13（catalog.json）

## 可并行组
- Wave 1：{T-P0-03, T-P0-04, T-P0-05, T-P0-06} 在 T-P0-01 完成后并行
- Wave 4：{T-P1-01, T-P1-02, T-P1-05, T-P1-07, T-P1-13, T-P1-14, T-P1-18} 无依赖可并行
- Wave 5：{T-P2-01, T-P2-02, T-P2-03, T-P2-05, T-P2-08} 无依赖可并行
- Wave 6：{T-P3-01, T-P3-02, T-P3-06, T-P3-08} 无依赖可并行
