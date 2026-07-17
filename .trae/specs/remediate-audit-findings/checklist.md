# Checklist

> 用于校验"审查问题全量补足开发"的完成度。所有项须在对应任务完成后逐条核验并勾选。
> 验证命令参考：`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm build:wasm`、`pnpm lint`。

## Wave 1：最小可见渲染主循环

### WASM 与导出
- [ ] `pnpm build:wasm` 成功执行，无错误
- [ ] `packages/astro-core-wasm/pkg/astro_core.js` 文件存在
- [ ] `packages/astro-core-wasm/pkg/astro_core_bg.wasm` 文件存在
- [ ] `loadAstroCoreWasm()` 调用不抛模块未找到错误（E-41 修复）
- [ ] `packages/astro-core-wasm/src/index.ts` 含 `export * from './events.js';`（E-18 修复）
- [ ] 从主入口能 import findEclipses/findConjunctions/findOppositions 等
- [ ] 新增"公共 API 导出测试"断言 events 模块导出存在并通过

### StarData 与扩展空间
- [ ] `StarData` 类实现 `update/render/dispose/setStarDensity/setMagnitudeRange` 方法（E-17 修复）
- [ ] `ExtendedSpaceEnvironmentImpl` 构造时 `this.stellarBackground = new StarData()`（E-34 修复）
- [ ] `update()` 中调用 `stellarBackground.update(cameraPosition)`
- [ ] render 路径不抛 TypeError
- [ ] 新增单元测试覆盖 StarData 实现 StellarBackground 接口

### WebGPU 修复
- [ ] `beginPass` 创建的 `commandEncoder` 保存为实例字段（E-01 修复）
- [ ] `endPass` 后 `commandEncoder.finish()` 加入待提交列表
- [ ] `submit()` 调用 `queue.submit([finishedCmd])` 并清空待提交列表
- [ ] submit 不再是空数组提交
- [ ] 新增测试断言 submit 非空
- [ ] `createTexture` 时存元数据（width/height/format）（E-02 修复）
- [ ] `bytesPerRow = alignTo(width * bytesPerPixel(format), 256)`
- [ ] 非 rgba8unorm 格式不返回 0
- [ ] 新增测试覆盖多种像素格式的 bytesPerRow 计算

### SphereGeometry 与 body renderers
- [ ] `SphereGeometry` 构造时按 UV 球面公式生成 position/normal/uv 顶点数组（E-10 修复）
- [ ] 生成索引数组
- [ ] 调用 renderer.createBuffer 上传
- [ ] 存真实 BufferHandle 到字段（非字符串 id 占位）
- [ ] 新增测试断言 vertexCount/indexCount 与生成数据长度一致
- [x] `SunRendererImpl.render()` 不再为空，调用 beginPass/draw/endPass（E-09 修复）
- [x] `SolidPlanetRenderer.render()` 不再为空
- [x] `EarthRendererImpl.render()` 不再为空
- [x] `GasGiantRendererImpl.render()` 不再为空
- [x] `RingRendererImpl.render()` 不再为空
- [x] 每类 body renderer 有专属材质/shader
- [x] `pnpm --filter @solar-system/body-renderers test` 通过

### RenderLoop 与 app-orchestrator
- [ ] `packages/renderer-core/src/index.ts` 新增 RenderLoop 类（R-01 修复）
- [ ] 每帧调用 SceneGraph.traverse → body renderer.render → renderer.submit
- [ ] 新增测试覆盖 RenderLoop 帧循环
- [ ] `packages/app-orchestrator/src/index.ts` 不再是 `export {}` 占位（E-25 修复）
- [ ] 编排 diagnostics.runBootDetection → astro-core-api Worker init
- [ ] 编排 resource-runtime 加载 → renderer-core 创建 → body-renderers 注册
- [ ] 通知 UI 进入 ready
- [ ] 监听 Worker 错误事件触发指数退避 reinit
- [ ] `pnpm --filter @solar-system/app-orchestrator test` 通过

### App.tsx 与 SceneViewport
- [ ] `App.tsx` 不再使用 setTimeout 模拟启动进度（E-35 修复）
- [ ] App.tsx 调用 app-orchestrator 订阅真实启动事件
- [ ] `SceneViewport.tsx` 不再渲染占位 emoji
- [ ] SceneViewport 创建 `<canvas>` 并挂载 renderer
- [ ] `LeftPanel.tsx` 不再硬编码 9 个行星名
- [ ] LeftPanel 调用 NavigationService.getAllBodyIds 动态渲染
- [ ] `pnpm --filter web typecheck` 通过
- [ ] 浏览器集成测试：localhost 打开后 canvas 渲染太阳+地球+月球

## Wave 2：数据与事件链路

### ephemeris-pipeline 与 catalog
- [ ] `tools/ephemeris-pipeline/build_ephemeris.py` 6 函数不再抛 NotImplementedError（E-29 修复）
- [ ] read_spk 实现 SPK-Daf 解析
- [ ] fit_chebyshev 实现切比雪夫拟合
- [ ] write_compact_binary 输出紧凑二进制
- [ ] `python tools/ephemeris-pipeline/build_ephemeris.py` 成功执行
- [ ] `data-src/normalized/` 有星历二进制文件（E-31 修复）
- [ ] `tools/catalog-pipeline/` 主脚本实现
- [ ] `data-src/normalized/catalog.json` 存在
- [ ] catalog.json 含 ≥ 290 个已命名卫星条目（E-12 修复）
- [ ] catalog.json 通过 JSON Schema 校验

### Worker 事件引擎与 clock
- [ ] `astro-core-worker.ts` 的 event.search 不再返回 `[]`（E-20 修复）
- [ ] event.search 调用 findEclipses 等返回真实 EventResult[]
- [ ] event.refine/buildObservationPlan/getUncertainty 实现
- [ ] 新增测试覆盖 event.search 返回非空 EventResult[]
- [ ] `EventsServiceImpl` 不再使用 8 个硬编码样本事件（E-19 修复）
- [ ] EventsServiceImpl 调用真实事件引擎按时间窗口计算
- [ ] 事件日期不再随系统时钟漂移
- [ ] Worker `clock.*` RPC 不再全 no-op（E-32 修复）
- [ ] Worker 维护 TimeConverter + utc/rate/paused 状态
- [ ] clock.getUtc/setUtc/setRate/pause/resume/step 实现
- [ ] ephemeris.supports 查询已注册 body_id 集合（不再永假）
- [ ] ephemeris.getCoverage 返回真实范围（不再 null）
- [ ] 新增测试覆盖 clock 状态机与 ephemeris 查询

## Wave 3：巡航与扩展空间

### tour-player 与 CruiseWaypoint
- [ ] `packages/tour-player/src/index.ts` 不再是 `export {}` 占位（E-26 修复）
- [ ] 加载 Cruise JSON
- [ ] play/pause/seek/exit 实现
- [ ] 与 astro-core-worker 的 tour.* RPC 桥接
- [ ] `pnpm --filter @solar-system/tour-player test` 通过
- [ ] `CruiseWaypoint` 接口补全至 12+ 字段（E-21 修复）
- [ ] 含时间设置/相机目标/相机位置方向/参考系/缓动曲线/时间倍率/尺度模式/图层显隐/画质最低要求/资源预加载/文字卡片/退出状态
- [ ] CRUISES 常量数据补全
- [ ] 新增 Cruise JSON Schema（schemas 包）校验
- [ ] `pnpm --filter @solar-system/schemas test` 通过
- [ ] `CruiseServiceImpl.update` 调用相机/时钟/尺度/图层 setter（E-22 修复）
- [ ] getCurrentProgress 不再用 Date.now()，改用统一 deltaTime
- [ ] 新增测试覆盖 update 驱动多维度变化

### 扩展空间粒子系统
- [ ] `AsteroidBeltImpl.render()` 不再为空（E-16 修复）
- [ ] `KuiperBeltImpl.render()` 不再为空
- [ ] `OortCloudImpl.render()` 不再为空
- [ ] `SolarWindImpl.render()` 不再为空
- [ ] `MagnetosphereImpl.render()` 不再为空
- [ ] `AurorasImpl.render()` 不再为空
- [ ] 每类实现 GPU 粒子绘制（point-list 或 instanced quad）
- [ ] 新增测试覆盖粒子数据上传

## Wave 4：P1 核心功能

### WebGPU 补充修复
- [ ] WebGPU topology 不再硬编码（E-03 修复）
- [ ] PrimitiveType → GPUPrimitiveTopology 完整映射表（points/lines/line_strip/triangle_strip）
- [ ] cullMode 默认 'none'
- [ ] 新增测试覆盖各 topology 映射
- [ ] WebGPU shaderLocation 不再硬编码 0（E-04 修复）
- [ ] 用 vertexAttributes.map((attr,i)=>({shaderLocation:i,...}))
- [ ] 新增测试覆盖多属性顶点不冲突
- [ ] HDR 实现 GPU 后处理管线（E-06 修复）
- [ ] HDR 渲染目标 → 亮度提取 → downsample/upsample
- [ ] tone mapping shader → color grading LUT → vignette 合成
- [ ] PostProcessingPipeline 接口存在
- [ ] WebGPU/WebGL2 后端实现后处理
- [ ] 新增测试覆盖后处理管线各阶段
- [ ] shadow map 渲染通道实现（E-07 修复）
- [ ] 光源视角深度纹理 + PCF 采样
- [ ] 交食接触时刻用 findRoot 求 7 接触点（P1/U1/U2/极大/U3/U4/P2）
- [ ] 新增测试覆盖 shadow map 与 7 接触点

### 导航与地形修复
- [ ] 导航拼音搜索逻辑修复（E-11 修复）
- [ ] getPinyin 返回真实拼音（非中文本身）
- [ ] firstLetter 取拼音首字母大写
- [ ] 搜索"mu xing"命中"木星"
- [ ] 新增测试覆盖拼音搜索
- [ ] 卫星目录改为数据驱动（E-12 修复）
- [ ] SOLAR_SYSTEM_BODIES 硬编码移除
- [ ] 从 catalog.json 加载
- [ ] NavigationServiceImpl 构造接收外部 BodyEntry[]
- [ ] 条目数 ≥ 290
- [ ] 地形 face 4/5 边界不再重叠（E-13 修复）
- [ ] face 4 = 南半球 0°E~180°E
- [ ] face 5 = 南半球 -180°E~0°E
- [ ] 六面 bounds 互不重叠且并集为全球
- [ ] 新增测试断言 bounds 互不重叠
- [ ] 地形 LOD 改用屏幕空间误差（E-14 修复）
- [ ] 瓦片存 geometricError
- [ ] traverse 按 fov/分辨率/距离计算 screenSpaceError
- [ ] 新增测试覆盖 SSE 计算
- [ ] 地形接入 bodyId + 真实高程（E-15 修复）
- [ ] Controller 接收 bodyId 与半径（月球 1737.4km、火星 3389.5km）
- [ ] getSurfaceHeight 从 elevationUrl 加载真实高程（非 sin/cos 假高程）
- [ ] 新增测试覆盖多 body 半径

### 服务器与 productization
- [ ] productization 不再用 Math.random（E-24 修复）
- [ ] calculateHash 用 crypto.subtle.digest('SHA-256')
- [ ] checkExists 用 fs.stat/fetch HEAD（不再常真）
- [ ] getSize 用真实文件大小（不再随机）
- [ ] getStats 接入真实 PerformanceMonitor 数据
- [ ] 新增测试覆盖 SHA-256 hash 与真实文件大小
- [ ] 服务器加 HTTPS/COOP/COEP/Brotli/ETag（E-28 修复）
- [ ] https.createServer 提供证书选项
- [ ] COOP/COEP/CORP/HSTS/CSP 头存在
- [ ] etag 包生成 ETag
- [ ] 预压缩 .br 文件
- [ ] Cache-Control: immutable
- [ ] curl -I 检查头存在
- [ ] 新增测试覆盖安全头
- [ ] release 构建脚本实现（E-30 修复）
- [ ] 聚合 dist+pkg+data+assets+manifests+licenses+checksums
- [ ] 生成版本化 release 目录
- [ ] 执行 release 脚本后 release/ 目录有产物

### BodyRendererFactory 与导航 API
- [ ] BodyRendererFactory 补全卫星/矮行星/小行星 case（E-43 修复）
- [ ] 卫星/矮行星补 SolidPlanetRenderer case
- [ ] 小行星/彗星用程序化不规则形状 renderer
- [ ] 支持导航目录 58+ body
- [ ] 新增测试覆盖 case 覆盖
- [ ] getScreenEdgeIndicator 逻辑修复（E-44 修复）
- [ ] dot < 0 返回 null（目标在前方无需边缘指示）
- [ ] 目标在视野外时计算边缘投影点
- [ ] 新增测试覆盖箭头显示逻辑
- [ ] GPU 设备丢失重建流程实现
- [ ] device.lost.then 回调重建 renderer
- [ ] 模拟 loseContext 验证恢复
- [ ] 新增测试覆盖设备丢失重建

## Wave 5：P2 完整性

### 画质与运行时
- [ ] 自动画质运行时降级反馈回路实现（E-08 修复）
- [ ] PerformanceMonitor 周期采样
- [ ] 达降级阈值自动调 setTextureResolution/setShadowResolution
- [ ] 新增测试覆盖自动降级触发
- [ ] PureViewingMode 接入 UI 隐藏与渲染调整（E-23 修复）
- [ ] enter() 通知 UI 隐藏面板/禁用 HUD
- [ ] setAutoRotate 启用环绕
- [ ] setAmbientMode 调整后处理
- [ ] 新增测试覆盖纯净模式状态
- [ ] sample_orbit 曲率自适应步长实现（E-27 修复）
- [ ] 基于局部曲率/速度梯度动态调整步长
- [ ] 近日点加密、远日点放疏
- [ ] 新增 Rust 测试覆盖自适应步长
- [ ] sampleOrbit RPC 参数语义对齐（E-33 修复）
- [ ] protocol 与 wasm 明确 step_days 或 samples 语义
- [ ] 消除混合用法
- [ ] 新增测试
- [ ] runBenchmark 实测 GPU 帧时（E-37 修复）
- [ ] 创建临时 renderer 绘制 N 万三角形
- [ ] PerformanceMonitor 采样帧时
- [ ] gpuFrameTimeMs/cpuFrameTimeMs 不再硬编码
- [ ] RendererFactory 签名补齐（E-38 修复）
- [ ] create(config: RendererConfig) 补 config 参数
- [ ] isSupported(backend) 补 backend 参数
- [ ] 新增测试覆盖 Factory 签名一致性
- [ ] AstroCore.time_range 真实更新（E-40 修复）
- [ ] register_ephemeris 时更新 time_range
- [ ] time_range_min/max 返回真实值（不再 0）
- [ ] 新增 Rust 测试覆盖 time_range 更新

### Pipeline 与资源
- [ ] 4 个 pipeline 目录补 README+骨架（E-42 修复）
- [ ] catalog-pipeline 有 README + 主脚本
- [ ] manifest-builder 有 README + 主脚本
- [ ] search-index-builder 有 README + 主脚本
- [ ] benchmark-generator 有 README + 主脚本
- [ ] manifest-builder 实现
- [ ] 生成 manifest.json 含版本/大小/SHA-256 哈希/依赖
- [ ] search-index-builder 实现
- [ ] 生成搜索索引（拼音/别名/编号）
- [ ] resource-runtime 显存预算器实现
- [ ] 影视 5-6GB/标准 1.5-2.5GB 预算
- [ ] 单主目标最高 LOD
- [ ] 接入渲染
- [ ] 新增测试覆盖显存预算
- [ ] resource-runtime 分包/优先级/Range 实现
- [ ] 资源分包
- [ ] 加载优先级队列
- [ ] Range 集成
- [ ] React.lazy
- [ ] 新增测试覆盖分包加载

### 相机与尺度
- [ ] 相机四类模式 + 平滑过渡 + 碰撞防护实现
- [ ] FollowController/SurfaceLowController 实现
- [ ] flyTo 贝塞尔插值
- [ ] 尺度感知速度
- [ ] 最小距离约束
- [ ] 动态裁剪面
- [ ] 三键快捷视角
- [ ] 新增测试覆盖四类相机与过渡
- [ ] 尺度模式切换实现（真实/增强）
- [ ] mode:'real'|'enhanced' 切换
- [ ] distanceScale/radiusScale/satelliteScale 三类独立
- [ ] 增强标注水印
- [ ] 标签屏幕空间增强
- [ ] 新增测试覆盖尺度模式

### 事件与地形补全
- [ ] FR-EVENT-005/006/007 事件交互补全
- [ ] jumpToEventMax + 推荐视角
- [ ] 事件时间轴自动播放
- [ ] predicted/approximate 标签
- [ ] 新增测试覆盖事件交互
- [ ] FR-SURFACE-003/004/006/007/008 地形补全
- [ ] fallback 父瓦片
- [ ] skirt 边缘缝合
- [ ] 气态行星高层大气限制
- [ ] 太阳最小安全距离
- [ ] 小行星/彗星近景 renderer
- [ ] 新增测试覆盖地形补全项

### 扩展空间与内容
- [ ] 扩展空间补齐特洛伊群/日球层顶/电流片/银河
- [ ] 4 类新增实现 + render()
- [ ] 新增测试覆盖 4 类扩展空间
- [ ] content-service A 级天体内容 + 程序化示意外观
- [ ] A 级天体补 sections
- [ ] proceduralAppearanceNote 填充
- [ ] 内容抽离为 data/content/*.json
- [ ] 新增测试覆盖 A 级内容
- [ ] 导航 buildHierarchy/jumpToParent/listSatellites/批量显隐 API
- [ ] buildHierarchy 返回树
- [ ] jumpToParent/listSatellites
- [ ] setOrbitsVisible/setLabelsVisible
- [ ] 新增测试覆盖导航 API

## Wave 6：P3 质量

- [ ] WebGPU usage 改用命名常量（E-05 修复）
- [ ] GPUBufferUsage.*/GPUTextureUsage.* 按位组合
- [ ] 移除魔法数字 12/8/24/18/1
- [ ] detectWebgpu 设备泄漏修复（E-36 修复）
- [ ] 用 adapter.limits 或获取 device 后立即 destroy()
- [ ] 新增测试覆盖设备释放
- [ ] terrain-engine 与 renderer-core/terrain.ts 合并（E-39 修复）
- [ ] 单一实现位置
- [ ] 消除复制粘贴
- [ ] 原有测试通过
- [ ] 无障碍 ARIA/降运动/对比度实现
- [ ] aria-*/role/tabIndex 标注
- [ ] prefers-reduced-motion
- [ ] 对比度处理
- [ ] a11y 扫描通过
- [ ] 公共 API 导出测试实现
- [ ] 遍历预期导出列表断言 index.ts 存在
- [ ] productization 替换随机数后补真实测试
- [ ] 导出测试通过
- [ ] 浏览器/OS 兼容矩阵 + GPU 黑名单
- [ ] 兼容矩阵文档
- [ ] 版本冻结记录
- [ ] GPU 黑名单
- [ ] 本地诊断包导出实现
- [ ] DiagnosticsPanel 导出 JSON 诊断包功能
- [ ] 导出功能可用
- [ ] FR 覆盖矩阵建立
- [ ] FR ID→实现文件:line→状态 矩阵
- [ ] 矩阵随修复进度更新
- [ ] Windows 10/11 安装包+手册
- [ ] 安装包
- [ ] 非开发人员可完成的安装手册
- [ ] 启动/停止/校验/诊断运维脚本
- [ ] start/stop/verify/diagnose 脚本
- [ ] 脚本可执行

## 全局验证（最终回归）

### 构建与类型
- [ ] `pnpm typecheck` 全 workspace 无类型错误
- [ ] `pnpm build:wasm` 成功
- [ ] `pnpm build` 成功（apps/web/dist 生成）
- [ ] `pnpm lint` 无 error
- [ ] `pnpm test` 全部通过

### FR/NFR 回归
- [ ] 80 条 FR 中 ✅ 完成数 ≥ 70（87.5%）
- [ ] 80 条 FR 中 ❌ 缺失数 = 0
- [ ] 80 条 FR 中 ⚠️ 错误数 = 0
- [ ] 40 项 NFR 中 ✅ 达标数 ≥ 30（75%）

### 集成测试
- [ ] 启动：localhost 打开有真实启动进度（非 setTimeout）
- [ ] 渲染：太阳+地球+月球可见（非占位 emoji）
- [ ] 时间控制：暂停/继续/反向/单步/倍率生效
- [ ] 导航搜索：输入"mu xing"/"木星"/编号命中
- [ ] 事件搜索：返回真实 EventResult[]（非空数组）
- [ ] 巡航播放：play/pause/seek/exit 生效
- [ ] 地形下降：六面连续覆盖、无裂缝
- [ ] 纯净模式：UI 隐藏、自动环绕

### 性能与离线
- [ ] 影视级 1440p 平均 ≥55 FPS（基线机）
- [ ] 标准模式 1080p ≥30 FPS
- [ ] 2h 长稳无不可恢复崩溃
- [ ] 显存预算：影视 ≤6GB、标准 ≤2.5GB
- [ ] 物理断网启动成功
- [ ] 无 CDN 请求
- [ ] localhost WebGPU 可用或降级
- [ ] 内网 HTTPS 部署正常
- [ ] COOP/COEP 头存在
- [ ] 资源 SHA-256 校验通过

## 不越界
- [ ] 仅修复审查报告所列错误，未重写未列入问题的代码
- [ ] 未删除或回滚用户既有改动
- [ ] 审查报告 `docs/reviews/实现审查报告.md` 保持原样
