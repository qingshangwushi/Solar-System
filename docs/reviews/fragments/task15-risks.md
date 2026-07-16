# 任务 15 — 错误实现与风险清单

> 审查对象：仓库根 `/workspace`
> 设计基线：`docs/Web3D影视级太阳系项目完整设计文档.md`（V1.0，2026-07-16，45 节，3112 行）
> 审查日期：2026-07-16
> 审查方法：逐文件 Read + Grep 核实，每条均给出 `file:line` 证据

## 状态图例

| 标记 | 含义 |
|---|---|
| P0 致命 | 阻塞核心功能或导致运行时崩溃，必须优先修复 |
| P1 严重 | 功能错误或与设计语义冲突，影响主流程正确性 |
| P2 一般 | 功能不全或简化实现，影响完整性但不崩溃 |
| P3 轻微 | 代码质量、死代码、接口不一致，不影响主流程 |

---

## 第一节　错误实现清单

| 编号 | 错误描述 | 证据 file:line | 严重度 | 影响范围 | 修复复杂度 | 修复方向 |
|---|---|---|---|---|---|---|
| E-01 | WebGPU `submit()` 空提交：渲染管线编码的 commandEncoder 在 `beginPass` 创建后从未 `finish()` 并提交到队列，`submit()` 仅 `queue.submit([])`。绘制命令实际不会进入 GPU 队列，整个 WebGPU 后端不可见。 | `packages/renderer-webgpu/src/index.ts:299-303`（submit 空数组）；`packages/renderer-webgpu/src/index.ts:258-262`（commandEncoder 未保存到实例字段） | P0 | FR-RENDER-001/003、所有渲染输出；WebGPU 路径完全无图像 | 中 | 在 `beginPass` 创建的 `commandEncoder` 保存为实例字段；`endPass` 后将 `commandEncoder.finish()` 加入待提交列表；`submit()` 调用 `queue.submit([finishedCmd])` 并清空待提交列表。 |
| E-02 | WebGPU `uploadTextureData` 中 `bytesPerRow` 计算错误：`handle.format === 'rgba8unorm' ? handle.id.length * 4 : 0`。用 buffer id 字符串长度乘 4 当作行字节数（id 是 `texture-xxxxx` 字符串），非 rgba8unorm 格式直接为 0。必定导致纹理上传校验失败或上传错误数据。 | `packages/renderer-webgpu/src/index.ts:177-182` | P0 | FR-TEXTURE-001、所有纹理上传；非 rgba8unorm 必崩 | 低 | 改为根据 `desc.width` 与像素格式字节宽度计算：`bytesPerRow = alignTo(desc.width * bytesPerPixel(format), 256)`，并从 TextureDescriptor 携带的 width 推断（需调整 uploadTextureData 签名以接收 width/height 或在 createTexture 时存元数据）。 |
| E-03 | WebGPU topology 硬编码：`desc.topology === 'triangles' ? 'triangle-list' : 'triangle-list'`，两分支结果相同；`points/lines/line_strip/triangle_strip` 永远映射为 triangle-list。`cullMode === 'none'` 时回退到 `undefined`（实际应显式 `'none'`）。 | `packages/renderer-webgpu/src/index.ts:218-221` | P1 | FR-RENDER-001；线框/点云/粒子拓扑错误 | 低 | 建立 `PrimitiveType → GPUPrimitiveTopology` 完整映射表（points→point-list、lines→line-list、line_strip→line-strip、triangles→triangle-list、triangle_strip→triangle-strip）；cullMode 默认 `'none'`。 |
| E-04 | WebGPU pipeline 顶点属性 shaderLocation 硬编码为 0：`attributes: [{ shaderLocation: 0, offset: attr.offset, format: attr.format }]`，多个属性会冲突。 | `packages/renderer-webgpu/src/index.ts:206-209` | P1 | FR-RENDER-001；多属性顶点（位置+法线+uv）渲染错乱 | 低 | 用 `desc.vertexAttributes.map((attr, i) => ({ shaderLocation: i, offset: attr.offset, format: attr.format }))`。 |
| E-05 | WebGPU `createBuffer` 的 usage 用魔法数字 `12`/`8`，`createTexture` 用 `24`/`18`，`readPixels` buffer usage 用 `1`，未使用 `GPUBufferUsage`/`GPUTextureUsage` 命名常量，可读性差且易错。 | `packages/renderer-webgpu/src/index.ts:117`、`162`、`320` | P3 | 代码质量 | 低 | 引入 `GPUBufferUsage.*`、`GPUTextureUsage.*` 常量按位组合。 |
| E-06 | HDR/色调映射/泛光/颜色分级实现为 CPU 端纯数学函数（`applyToneMapping`/`applyColorGrading`/`applyVignette`/`computeBloomThreshold`/`gaussianBlur1D`），无 GPU shader、无渲染通道、无泛光 downsample/upsample 管线、无输出合成。 | `packages/renderer-core/src/hdr.ts:121-356`（全部为 CPU 纯函数） | P1 | FR-HDR 全部需求（设计文档 §22）、影视级视觉 | 高 | 实现真正的 GPU 后处理管线：HDR 渲染目标 → 亮度提取 → 高斯模糊 downsample/upsample 多级 → tone mapping shader → color grading LUT → vignette/CA/dither 合成。在 renderer-core 提供 PostProcessingPipeline 接口，WebGPU/WebGL2 后端各自实现。 |
| E-07 | Shadow 全部为 CPU 端几何计算（`computeShadowCone`/`computeEclipseGeometry`/`computeLunarEclipse`/`computeShadowMapParams`），无 shadow map 渲染通道、无深度纹理采样、`computeContactTimes` 仅返回 1 个 P1 接触点（hardcoded mjd），所有 partialBegin/totalBegin/maximum/totalEnd/partialEnd 均为 null/0。`computeShadowMapParams` 的 viewMatrix/projectionMatrix 是手写非正交矩阵，无法用于真实阴影投射。 | `packages/renderer-core/src/shadows.ts:330-400`（computeShadowMapParams 非正交）；`packages/renderer-core/src/shadows.ts:375-400`（computeContactTimes 仅 1 接触点）；`packages/renderer-core/src/shadows.ts:179-189`（时间字段全 null/0） | P1 | FR-SHADOW、FR-EVENT-002/004；阴影渲染、交食接触时刻 | 高 | 实现 shadow map 渲染通道（光源视角深度纹理 + PCF 采样）；交食接触时刻用 events.ts 的 `findRoot` 在不同接触判据函数上求根得到 P1/U1/U2/极大/U3/U4/P2 七接触点。 |
| E-08 | 自动画质 `autoDetectQuality`/`estimateGPUPerformance` 仅基于 GPU 厂商字符串与 maxTextureSize 评分，`PerformanceMonitor.shouldDowngrade/shouldUpgrade` 仅看 FPS 阈值；无运行时降级触发器、无 GPU timer 自动反馈回路、`suggestQualityChange` 仅返回建议不触发实际切换。 | `packages/renderer-core/src/quality.ts:267-360` | P2 | FR-QUALITY、FR-BOOT-002（设计要求短时基准测试驱动画质） | 中 | 在 runtime 层接入 PerformanceMonitor 周期采样，达到降级阈值时自动调用 renderer.setTextureResolution/setShadowResolution 等；runBenchmark 应执行实际 GPU 负载测试（绘制 N 万三角形测帧时）。 |
| E-09 | 所有 body renderer 的 `render(): void {}` 为空实现，`update()/dispose()/setLOD()` 也全为空。`SunRendererImpl/SolidPlanetRenderer/EarthRendererImpl/GasGiantRendererImpl/RingRendererImpl` 五个类无任何 GPU 资源创建、无 draw call、无材质绑定。 | `packages/body-renderers/src/index.ts:149`、`178`、`211`、`243`、`269`（render）；`147`、`176`、`209`、`241`、`265`（update 全空） | P0 | 所有天体渲染、FR-RENDER 全部；画面无任何天体 | 高 | 在 render() 中实际调用 renderer-core 的 createPipeline/createBuffer/beginPass/draw；为每类天体实现专属 shader（太阳 emissive+corona、地球 PBR+atmosphere、气巨云带、土星环）。建议先接入 renderer-core 抽象，再由 WebGPU/WebGL2 后端执行。 |
| E-10 | `SphereGeometry` 构造函数仅设置 `vertexCount`/`indexCount` 与占位 `BufferHandle`（字符串 id），不生成任何顶点/索引数据、不调用 renderer.createBuffer。 | `packages/renderer-core/src/celestial-bodies.ts:341-353` | P0 | 所有天体几何；无顶点数据 → draw call 失败 | 中 | 在构造时按 UV 球面公式生成 position/normal/uv 顶点数组与索引数组，调用注入的 renderer.createBuffer/uploadTextureData 上传，将返回的真实 BufferHandle 存入字段。 |
| E-11 | 导航拼音索引逻辑错误：`getPinyin(chineseName)` 检查 `PINYIN_MAP[chineseName]`，但 `PINYIN_MAP` 的键是拼音（如 `taiyang`），而传入参数是中文（如 `太阳`），查找永远 undefined，最终 `return chineseName`（直接返回中文本身）。`pinyinIndex` 中 `fullPinyin` 实际是中文名，`firstLetter` 是中文首字符。 | `packages/navigation-service/src/index.ts:182-184`（getPinyin 三元表达式两分支均返回 chineseName）；`packages/navigation-service/src/index.ts:126-157`（PINYIN_MAP 键为拼音） | P1 | FR-NAV-002（拼音/拼音首字母搜索）；输入拼音无法命中 | 中 | 引入 pinyin 数据集（如 `pinyin-pro` 或自建中文→拼音映射），`getPinyin(nameZh)` 返回 `nameZh` 的拼音字符串；`firstLetter` 取拼音首字母大写。或反转 PINYIN_MAP 为 `{ '太阳': 'taiyang' }` 形式。 |
| E-12 | 卫星目录仅 35 颗硬编码（月球 1 + 火卫 2 + 木卫 6 + 土卫 8 + 天卫 5 + 海卫 8 + 冥卫 5 = 35），且全部硬编码在 `SOLAR_SYSTEM_BODIES` 常量中。设计文档要求"全部已命名天然卫星"由数据快照驱动（FR-ASTRO-008：天体目录随离线数据包更新，不要求修改引擎代码）。 | `packages/navigation-service/src/index.ts:65-124`（35 颗卫星硬编码） | P1 | FR-ASTRO-002/003/008、FR-NAV-001/003/004 | 中 | 移除硬编码常量，改为从 `data/normalized/catalog.json`（由 catalog-pipeline 生成）加载；NavigationServiceImpl 构造函数接收外部传入的 BodyEntry[]。tools/catalog-pipeline 需实现，data-src 需填充。 |
| E-13 | 地形 Cube-Sphere face 4/5 边界完全重叠：两者都设为 `(-90, 0, -180, 180)`（南半球整圈），导致南半球瓦片被双重覆盖；face 0-3 仅覆盖北半球（0~90°N），face 4-5 应分别覆盖南半球不同经度段。 | `packages/renderer-core/src/terrain.ts:291-301`；`packages/terrain-engine/src/index.ts:302-312`（同一 bug 复制粘贴） | P1 | FR-SURFACE-001/002/004（全球连续覆盖、无裂缝）；南半球瓦片重复 | 中 | 重新设计 6 面 cube-sphere 投影：face 4 = 南半球 0°E~180°E 段、face 5 = 南半球 -180°E~0°E 段，或采用标准 cube map 投影公式（+X/-X/+Y/-Y/+Z/-Z）替代经纬度划分。 |
| E-14 | 地形 LOD 用距离阈值（`distance < 500000` 米 / `distance < 100000` 米），非设计要求的屏幕空间几何误差（`errorPixels = geometricError * projectionScale / cameraDistance`）。距离阈值会导致远距离小瓦片过度细化、近距离大瓦片细化不足。 | `packages/renderer-core/src/terrain.ts:313`（traverse）；`packages/renderer-core/src/terrain.ts:159`（needsRefinement）；`packages/terrain-engine/src/index.ts:324`、`181` | P1 | FR-SURFACE-002（连续 LOD）、设计文档 §20.3 | 中 | 为每个瓦片存储 `geometricError`，traverse 时按相机 fov/分辨率/距离计算 `screenSpaceError`，与画质阈值比较决定 split。 |
| E-15 | 地形 `TerrainLODControllerImpl` 与 `TerrainEngineImpl.init(_bodyId)` 忽略 bodyId，`calculateDistance` 硬编码 `radius = 6371000`（地球半径）。月球/火星地形无法正确生成。`getSurfaceHeight` 用 `Math.sin(lat*5)*Math.cos(lng*3)` 等正弦函数生成假高程，非真实高程数据。 | `packages/renderer-core/src/terrain.ts:335`（硬编码 6371000）；`packages/terrain-engine/src/index.ts:346`、`491-493`（init 忽略 bodyId）；`packages/terrain-engine/src/index.ts:459-468`（假高程） | P1 | FR-SURFACE-001（地球/月球/火星地形） | 中 | Controller 接收 bodyId 与对应半径/高程数据源；`getSurfaceHeight` 改为从 elevationUrl 加载的真实高程瓦片查询；不同 body 配置不同半径（月球 1737.4km、火星 3389.5km）。 |
| E-16 | 扩展空间所有 render() 为空：`AsteroidBeltImpl.render`/`KuiperBeltImpl.render`/`OortCloudImpl.render`/`SolarWindImpl.render`/`MagnetosphereImpl.render`/`AurorasImpl.render`/`ExtendedSpaceEnvironmentImpl.render`（仅转发调用空的子模块）。 | `packages/renderer-core/src/extended-space.ts:261`、`331`、`382`、`468`、`489`、`511`、`568-590` | P0 | FR-EXTEND 全部；小行星带/柯伊伯带/奥尔特云/太阳风/磁层/极光不可见 | 高 | 为每类实现 GPU 粒子系统：上传 position/size/color 到 SSBO/VBO，用 point-list 或 instanced quad 渲染；磁层/极光用 volume shader。 |
| E-17 | `StarData` 类完整实现（生成 10000 颗星 + temperatureToRGB + getVisibleStars），但从未被实例化。`ExtendedSpaceEnvironmentImpl` 用 `this.stellarBackground = {} as StellarBackground` 强制转换空对象，调用 `this.stellarBackground.render()` 会抛 `TypeError: render is not a function`。 | `packages/renderer-core/src/extended-space.ts:130-203`（StarData 定义）；`packages/renderer-core/src/extended-space.ts:544`（`{} as StellarBackground`）；`packages/renderer-core/src/extended-space.ts:569-571`（调用 render） | P0 | 恒星背景；运行时崩溃（render 路径触发即崩） | 低 | 让 `StarData` 实现 `StellarBackground` 接口（补 update/render/dispose/setStarDensity/setMagnitudeRange），构造时 `this.stellarBackground = new StarData()`。update() 中调用 `stellarBackground.update(cameraPosition)`。 |
| E-18 | 事件引擎真实求根算法（`findRoot`/`findRootNewton`/`findAllRoots`/`findMoonPhaseEvents`/`findConjunctions`/`findOppositions`/`findEclipses`/`findOrbitalExtrema`/`findNodes`）完整实现于 `events.ts`，但 `astro-core-wasm/src/index.ts` 仅 re-export `./time.js`、`./reference-frame.js`、`./ephemeris.js`，**未导出 `./events.js`**。导致 events.ts 成为孤儿模块，外部无法访问。 | `packages/astro-core-wasm/src/index.ts:82-84`（仅导出 3 个模块，缺 events）；`packages/astro-core-wasm/src/events.ts:62-577`（完整求根算法） | P0 | FR-EVENT 全部；事件计算无法被调用 | 低 | 在 `astro-core-wasm/src/index.ts` 添加 `export * from './events.js';`。 |
| E-19 | `EventsServiceImpl` 用 8 个硬编码样本事件（`generateSampleEvents`），所有 startDate/endDate/peakDate 用 `now + N * oneDay` 偏移，不调用真实事件引擎。日期随系统时钟漂移，非真实天文事件。 | `packages/renderer-core/src/events-cruises.ts:361-459`（8 硬编码样本） | P1 | FR-EVENT-001/002/004/008；事件搜索结果全部伪造 | 中 | 改为调用 astro-core-wasm 的 `findEclipses`/`findConjunctions`/`findOppositions`/`findMoonPhaseEvents` 等（修 E-18 后），按 EventSearchOptions 的时间窗口实时计算。 |
| E-20 | astro-core-worker 的 `event.search` 直接返回 `[]`（空数组），`event.refine`/`event.buildObservationPlan`/`event.getUncertainty` 报"事件引擎尚未实现"。即使修了 E-18，Worker 仍未桥接事件引擎。 | `packages/astro-core-api/src/astro-core-worker.ts:128-135`（event.search 返回 []，其余 UNSUPPORTED） | P0 | FR-EVENT 全部；Worker 通道无事件数据 | 中 | Worker 中调用 `findEclipses` 等（需先让 wasm 实例持有星历求值器闭包，或新增 wasm binding 暴露事件扫描），将结果序列化为 EventResult[] 返回。 |
| E-21 | `CruiseWaypoint` 接口仅 5 个字段（bodyId/name/position/duration/pauseDuration），缺设计文档 §26.2 要求的 12+ 字段：时间设置、相机目标、相机位置和方向、参考系、缓动曲线、时间倍率、尺度模式、图层显隐、画质最低要求、资源预加载列表、文字卡片、退出状态。 | `packages/renderer-core/src/events-cruises.ts:28-34`（仅 5 字段）；`docs/Web3D影视级太阳系项目完整设计文档.md:1700-1712`（设计要求 12+ 字段） | P1 | FR-TOUR-002/003；巡航无法同步控制相机/时间/尺度/图层 | 中 | 扩展 CruiseWaypoint 接口补全 12 字段；CRUISES 常量数据补全；新增 Cruise JSON Schema（schemas 包）校验。 |
| E-22 | `CruiseServiceImpl.update(deltaTime)` 仅累加 elapsedTime 并按 waypoint 总时长切换 currentWaypointIndex，**不驱动相机位置/时钟/缩放/图层**。FR-TOUR-002 要求"巡航可同步控制相机、时间、尺度、图层和目标"。`getCurrentProgress` 用 `Date.now()` 实时计算，但 `update` 用入参 deltaTime，两套时钟不一致。 | `packages/renderer-core/src/events-cruises.ts:610-632`（update 仅计时）；`packages/renderer-core/src/events-cruises.ts:588-600`（getCurrentProgress 用 Date.now） | P1 | FR-TOUR-002；巡航播放无实际效果 | 高 | update() 中根据当前 waypoint 与进度，调用注入的相机控制器/时钟/尺度管理器/图层管理器的对应 setter；移除 Date.now() 改用统一 deltaTime 累加。 |
| E-23 | `PureViewingModeImpl` 仅切换 active 标志，enter/exit/setAutoRotate/setAmbientMode 都只改内部布尔，不实际隐藏 UI、不调整渲染管线、不停止事件推送。 | `packages/renderer-core/src/events-cruises.ts:635-676` | P2 | FR-CAM-008（纯净观赏） | 中 | enter() 时通过回调通知 UI 层隐藏面板、禁用 HUD；setAutoRotate 通过相机控制器启用环绕；setAmbientMode 调整渲染后处理参数。 |
| E-24 | `productization.ts` 全程用 `Math.random()` 替代真实计算：`calculateHash` 返回 `Math.random().toString(36).substring(2,15)`、`getSize` 返回随机数、`validateContent` 返回 `Math.random() > 0.05`、`checkExists` 永远返回 true、`checkForUpdates` 用 `Math.random() > 0.5` 决定是否有更新、`runTest` 用随机数决定 pass/fail、`getStats` 全部返回随机指标。 | `packages/renderer-core/src/productization.ts:215`（checkExists 常真）；`224`（hash 随机）；`230`（size 随机）；`237`（validate 随机）；`261`（update 随机）；`437-446`（test 随机）；`538-546`（stats 随机） | P1 | FR-OFFLINE-005/006、FR-PROD（资源校验/更新/测试全部失效） | 高 | calculateHash 改用 `crypto.subtle.digest('SHA-256')`（参考 resource-runtime/src/index.ts:327-331 已有实现）；checkExists 用 `fs.stat`/`fetch HEAD`；getSize 用真实文件大小；移除所有随机指标，接入真实 PerformanceMonitor 数据。 |
| E-25 | `app-orchestrator/src/index.ts` 仅 1 行 `// Placeholder for @solar-system/app-orchestrator\nexport {};`，整个编排包为空。无 BootFlow 编排、无 Worker↔Renderer↔UI 胶水、无崩溃恢复（设计文档 §8.2 要求 Worker 崩溃后主线程可重新初始化）。 | `packages/app-orchestrator/src/index.ts:1-2` | P0 | 整个应用启动编排、FR-BOOT-005、§8.2 稳定性 | 高 | 实现编排器：协调 diagnostics.runBootDetection → astro-core-api.init Worker → resource-runtime 加载 → renderer-core 创建 → body-renderers 注册 → 通知 UI 进入 ready；监听 Worker 错误事件触发 reinit。 |
| E-26 | `tour-player/src/index.ts` 仅 1 行 `// Placeholder for @solar-system/tour-player\nexport {};`，整个巡航播放器包为空。`CruiseServiceImpl`（在 renderer-core）与 astro-core-worker 的 `tour.*` RPC 之间无桥接。 | `packages/tour-player/src/index.ts:1-2`；`packages/astro-core-api/src/astro-core-worker.ts:143-160`（tour RPC 全占位） | P0 | FR-TOUR 全部；巡航无法播放 | 高 | 实现 TourPlayer：加载 Cruise JSON Schema 文件 → 解析节点 → 调用相机/时钟/尺度/图层 API 驱动 → 暴露 play/pause/seek/exit；与 astro-core-worker 的 tour.* RPC 桥接。 |
| E-27 | `sample_orbit` 用固定步长 `t += base_step_days`（while 循环），非设计文档 §14.4 要求的"自适应步长采样"。注释自称"曲率高/近日点附近加密此处以步长自适应简化实现"但代码无任何自适应逻辑。 | `crates/astro-core/src/lib.rs:106-128`（固定步长）；`docs/Web3D影视级太阳系项目完整设计文档.md:971-972`（要求自适应） | P2 | FR-ASTRO-006、§14.4；轨道线在近日点欠采样 | 中 | 实现自适应：基于局部曲率（相邻三点夹角）或速度梯度动态调整步长，近日点加密、远日点放疏。 |
| E-28 | 静态服务器 `server.ts` 缺设计文档 §31.3 要求的多项能力：无 HTTPS（仅 `http.createServer`）、无 COOP/COEP 头（导致 SharedArrayBuffer 不可用，影响多线程 WASM）、无 Brotli/Gzip 预压缩、无 ETag（仅 Cache-Control）、无 SPA 路由回退（仅在 ENOENT 时回退 index.html，未处理非静态路径）、无访问日志开关。 | `packages/server/src/server.ts:68`（仅 http）；`99-104`（headers 无 COOP/COEP/ETag）；`docs/Web3D影视级太阳系项目完整设计文档.md:2031-2038` | P1 | FR-OFFLINE-004（HTTPS）、§31.3 静态服务器要求；WebGPU 多线程受限 | 中 | 用 `https.createServer` 提供证书选项；添加 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`；用 `etag` 包生成 ETag；用 `shrink-ray-current` 或预压缩 .br 文件提供 Brotli。 |
| E-29 | `tools/ephemeris-pipeline/build_ephemeris.py` 全部 6 个函数（read_spk/clip_time_range/fit_chebyshev/analyze_error/write_compact_binary/write_report）抛 `NotImplementedError`，main() 仅打印骨架标识。其他 4 个 pipeline 目录（catalog-pipeline/benchmark-generator/manifest-builder/search-index-builder）只有 `.gitkeep`。 | `tools/ephemeris-pipeline/build_ephemeris.py:14-60`（全 NotImplementedError）；`tools/catalog-pipeline/.gitkeep` 等 | P0 | FR-ASTRO-001/002、§14.2；无星历数据生成 → 无高精度星历 | 高 | 实现 SPK 解析（用 SpiceyPy 或自研 SPK-Daf 解析器）、切比雪夫拟合（numpy.polynomial.chebyshev）、紧凑二进制布局；同步实现 catalog-pipeline（生成 catalog.json）、manifest-builder（生成 manifest.json）、search-index-builder（生成搜索索引）。 |
| E-30 | `release/` 目录 4 个子目录（checksums/licenses/manifests/server）全部仅 `.gitkeep`，无任何发布产物。`apps/web/dist` 不存在（server.ts 默认指向此目录）。 | `release/*/.gitkeep`；`packages/server/src/server.ts:17`（STATIC_DIR 默认 `../apps/web/dist`） | P1 | FR-OFFLINE-005/006、§31 发布；无法部署 | 中 | 实现 release 构建脚本：聚合 apps/web/dist + packages/astro-core-wasm/pkg + data/ + assets/ + manifests/ + licenses/ + checksums/，生成版本化 release 目录。 |
| E-31 | `data-src/` 3 个子目录（raw/normalized/provenance）与 `assets-src/` 3 个子目录（bodies/effects/terrain）全部仅 `.gitkeep`。无任何原始星历数据、归一化数据、纹理/网格/地形源数据。 | `data-src/*/.gitkeep`；`assets-src/*/.gitkeep` | P0 | FR-ASTRO-001/002、FR-SURFACE-001、FR-CONTENT-006；无数据则无内容 | 高 | 由 ephemeris-pipeline 输出 data-src/normalized；由 catalog-pipeline 输出 catalog.json；下载 NASA/USGS 公开影像与高程到 assets-src/raw，经处理输出到 assets-src/bodies/terrain。 |
| E-32 | `astro-core-worker.ts` 的 `clock.*` RPC 全部返回 `null`/无操作（getUtc/getTdb/setUtc/setRate/pause/resume/step 均不调用 wasm），`ephemeris.supports` 永远返回 `false`，`ephemeris.getCoverage` 返回 `null`。Worker 未维护时钟状态。 | `packages/astro-core-api/src/astro-core-worker.ts:74-99`（clock 全 no-op，supports 永假，coverage null） | P1 | FR-TIME-001/003/004/006、FR-ASTRO-001 | 中 | Worker 内维护 TimeConverter + 当前 utc/rate/paused 状态；clock.getUtc 返回当前 utc，clock.setRate 调整 rate，clock.step 按 rate 推进；ephemeris.supports 查询已注册 body_id 集合。 |
| E-33 | `state.sampleOrbit` RPC 调用 `wasm.sampleOrbit` 时，步长用 `(tdb_end - tdb_start) / Math.max(1, p.samples)`，把请求的采样数当步长分母，但 wasm 期望 `base_step_days`（步长天数）。语义混淆，且与设计要求的自适应步长（E-27）冲突。 | `packages/astro-core-api/src/astro-core-worker.ts:116-121` | P2 | FR-ASTRO-006；轨道线采样密度与请求不符 | 低 | 协议层明确参数语义：要么传 `step_days`，要么传 `samples` 由 wasm 内部自适应；当前混合用法需在 protocol.ts 与 wasm.rs 间对齐。 |
| E-34 | `ExtendedSpaceEnvironmentImpl` 构造函数未将已实例化的 `StarData` 接入，且 `stellarBackground` 用空对象强转；`update()` 也未调用 `stellarBackground.update(cameraPosition)`（接口要求）。 | `packages/renderer-core/src/extended-space.ts:543-551`（构造）；`553-566`（update 不调 stellarBackground） | P0 | 恒星背景；与 E-17 同根因，运行时 render 崩溃 | 低 | 见 E-17 修复方向。 |
| E-35 | `App.tsx` 启动阶段进度用 `setTimeout` 模拟（每阶段 10 步 × 30ms），不接入 diagnostics.runBootDetection 与 resource-runtime 加载进度。`SceneViewport` 仅渲染占位 emoji，无 canvas 挂载、无 renderer 创建。`LeftPanel` 硬编码 9 个行星名 div，不接入 NavigationService。 | `apps/web/src/App.tsx:36-60`（setTimeout 模拟）；`apps/web/src/components/SceneViewport.tsx:1-17`（占位）；`apps/web/src/components/LeftPanel.tsx:8-16`（硬编码 9 行星） | P0 | FR-BOOT-005（实际进度）、整个 UI 交互 | 高 | App.tsx 调用 app-orchestrator（修 E-25 后）订阅真实启动事件；SceneViewport 创建 canvas 并挂载 renderer；LeftPanel 调用 NavigationService.getAllBodyIds 动态渲染。 |
| E-36 | `detectWebgpu` 中调用 `adapter.requestDevice()` 仅为读 limits，未 destroy 设备，造成设备泄漏；且在能力检测阶段就消耗了 GPU 设备配额。 | `packages/diagnostics/src/index.ts:143-160` | P3 | 资源泄漏；多实例场景下耗尽设备配额 | 低 | 改用 `adapter.limits`（adapter 已含 limits）或获取 device 后立即 `device.destroy()`。 |
| E-37 | `runBenchmark` 不执行任何 GPU 负载测试，`gpuFrameTimeMs: 100` 与 `cpuFrameTimeMs: 50` 硬编码，仅按 capability 标志评分。设计文档 FR-BOOT-002 要求"根据 GPU 时间、CPU 时间和帧率给出推荐画质"。 | `packages/diagnostics/src/index.ts:252-284`（硬编码 100/50） | P2 | FR-BOOT-002；推荐画质不准 | 中 | 实际创建临时 renderer 绘制 N 万三角形，用 PerformanceMonitor 采样帧时；按测得帧时映射 QualityProfile。 |
| E-38 | WebGPU/WebGL2 的 `RendererFactory` 实现签名与 renderer-core 接口不一致：接口定义 `create(config: RendererConfig): Promise<Renderer>` 与 `isSupported(backend: BackendType): boolean`，但 `WebGpuRendererFactory.create(): Promise<Renderer>`（无 config 参数）、`isSupported(): boolean`（无 backend 参数）。WebGL2 同样。 | `packages/renderer-core/src/index.ts:257-260`（接口）；`packages/renderer-webgpu/src/index.ts:345-353`（实现缺参数）；`packages/renderer-webgl2/src/index.ts`（同问题） | P2 | FR-RENDER-003；类型不安全，调用方传 config 被忽略 | 低 | Factory 实现补齐 config/backend 参数，create 内读取 config 设置 canvas 尺寸/抗锯齿，isSupported 按 backend 分支。 |
| E-39 | `terrain-engine` 包是 `renderer-core/terrain.ts` 的复制粘贴（含 E-13/E-14/E-15 同样 bug），两份代码并存且都未接入实际渲染。架构上职责重叠：renderer-core 已有 TerrainLODController，terrain-engine 又定义一份。 | `packages/terrain-engine/src/index.ts:269-403` 与 `packages/renderer-core/src/terrain.ts:258-392` 几乎逐行相同 | P3 | 架构冗余、维护负担 | 中 | 决定单一实现位置：要么 terrain-engine 作为独立引擎包、renderer-core 删除 terrain.ts；要么 terrain-engine 删除、统一用 renderer-core。建议前者，让 terrain-engine 持有 bodyId/高程数据，renderer-core 仅提供 Tile 数据结构。 |
| E-40 | `crates/astro-core/src/lib.rs` 中 `AstroCore::new` 初始化 `time_range: TimeRange::default()`（默认 0,0），但 `evaluate_state`/`evaluate_snapshot` 调用 `utc.check_range()` 用的是 JulianDate 自带的范围检查，与 AstroCore.time_range 不一致；`time_range()` getter 返回默认值，wasm.rs 的 `time_range_min/max` 也返回 0.0，UI 无法知道真实星历覆盖范围。 | `crates/astro-core/src/lib.rs:51-58`（time_range 默认）；`crates/astro-core/src/wasm.rs:91-101`（返回 0） | P2 | FR-TIME-007、FR-ASTRO-002；超范围提示失效 | 中 | AstroCore 在 register_ephemeris 时更新 time_range（取所有已注册段的最小 t_start 与最大 t_end）；time_range_min/max 返回真实值。 |
| E-41 | `astro-core-wasm/src/index.ts` 动态 import URL 默认为 `new URL('../pkg/astro_core.js', import.meta.url).href`，但 `packages/astro-core-wasm/pkg/` 目录不存在（wasm 未构建）。任何调用 `loadAstroCoreWasm` 的代码会因模块不存在而失败。 | `packages/astro-core-wasm/src/index.ts:57`；`packages/astro-core-wasm/pkg/` 缺失（LS 确认） | P0 | 整个天文内核；Worker init 失败 | 低（构建）/中（验证） | 执行 `pnpm build:wasm`（需 wasm-pack + rust 工具链）；CI 增加 wasm 构建步骤；package.json 的 exports 指向 pkg/。 |
| E-42 | `tools/ephemeris-pipeline/README.md` 与 `build_ephemeris.py` 自称骨架，但 5 个其他 pipeline 目录无任何 README/脚本，无构建入口。 | `tools/{catalog-pipeline,benchmark-generator,manifest-builder,search-index-builder}/.gitkeep` | P2 | §14 数据管线；catalog/manifest/search-index 全无 | 高 | 为每个 pipeline 写 README + 主脚本骨架，定义输入/输出/校验流程；优先级：catalog-pipeline > manifest-builder > search-index-builder > benchmark-generator。 |
| E-43 | `BodyRendererFactoryImpl.create` 的 default 分支返回 `null`，但 PLANET_BODY_IDS 仅含 10 个 body（SUN/MERCURY/.../MOON），所有卫星（如 301 月球已支持但 401/501/601 等卫星）、矮行星（134340 冥王星）、小行星、彗星均返回 null。设计与导航目录（含 58 个 body）脱节。 | `packages/body-renderers/src/index.ts:286-318`（switch 仅 10 case）；`packages/navigation-service/src/index.ts:65-124`（58 body） | P1 | FR-RENDER 全部卫星/矮行星/小行星/彗星渲染 | 中 | 为卫星/矮行星补 SolidPlanetRenderer case（用 bodyId 查询半径）；小行星/彗星用程序化不规则形状 renderer。 |
| E-44 | `NavigationService` 接口声明 `getDirectionToTarget`/`getScreenEdgeIndicator`，但 `getScreenEdgeIndicator` 实现中 `dot > 0` 时返回 null（目标在前方则无指示），与"屏幕边缘箭头"语义相反——目标在视野外（应判定为 cameraForward 与 toTarget 夹角 > 90°，即 dot < 0）才需边缘箭头。逻辑反了。 | `packages/navigation-service/src/index.ts:345-351`（dot > 0 返回 null） | P1 | FR-NAV-007（屏幕边缘箭头）；箭头永不显示 | 低 | 改为 `if (dot < 0) return null;`（目标在前方无需边缘指示）；或反转语义：当目标不在视野内时计算边缘投影点。需配合相机 fov 判定。 |

---

## 第二节　架构与集成风险

### R-01　渲染管线完全断裂（P0）
**描述**：renderer-core 定义了完整的 Renderer/SceneGraph/Material/Geometry 抽象，WebGPU/WebGL2 后端有部分实现，但上游 body-renderers、celestial-bodies、extended-space 的 render() 全为空。没有任何代码调用 `renderer.beginPass()`/`draw()`/`endPass()`/`submit()` 完成一帧渲染。SceneViewport 仅渲染占位 emoji。
**证据**：`packages/body-renderers/src/index.ts:149-269` 全空 render；`apps/web/src/components/SceneViewport.tsx:1-17` 占位；`packages/renderer-webgpu/src/index.ts:299-303` submit 空提交。
**缓解措施**：实现一个最小渲染主循环（renderer-core 提供 RenderLoop，每帧调用 SceneGraph.traverse → body renderer.render → renderer.submit），先打通"太阳 + 地球 + 月球"三个 body 的可见输出，再扩展。

### R-02　天文内核 → 渲染层数据流断裂（P0）
**描述**：astro-core 提供 evaluateState/evaluateSnapshot，但无任何代码订阅快照并将 BodyState.position/orientation 写入 body-renderers 的 update()。body renderer 的 update() 全空。CelestialStateSnapshot 永远不会驱动渲染。
**证据**：`packages/body-renderers/src/index.ts:147/176/209/241/265`（update 空）；`crates/astro-core/src/snapshot.rs` 定义 BodyState 但前端无消费者。
**缓解措施**：app-orchestrator（修 E-25）每帧调用 astro-core-api.evaluateSnapshot(bodyIds, utc) → 将结果分发到对应 BodyRenderer.update(time, position, orientation, sunDirection)。

### R-03　WASM 构建产物缺失（P0）
**描述**：`packages/astro-core-wasm/pkg/` 目录不存在，astro-core-worker.init 调用 `createAstroCoreWasm(wasmUrl)` 必失败。整个天文内核在浏览器侧不可用。
**证据**：`packages/astro-core-wasm/src/index.ts:57` 引用 `../pkg/astro_core.js`；LS 确认 pkg/ 缺失。
**缓解措施**：CI 增加 `pnpm build:wasm` 步骤（需 rust + wasm-pack）；本地开发文档说明前置构建；package.json 增加预构建钩子。

### R-04　事件引擎模块孤岛（P0）
**描述**：events.ts 完整实现求根算法但未导出（E-18）；Worker 的 event.search 返回 []（E-20）；renderer-core 的 EventsServiceImpl 用 8 硬编码样本（E-19）。三层均断开。
**证据**：见 E-18/E-19/E-20。
**缓解措施**：依次修复 E-18（导出）→ E-20（Worker 桥接，需 wasm 暴露事件扫描接口或在前端用 evaluateState 闭包调用 events.ts）→ E-19（EventsServiceImpl 改调真实引擎）。

### R-05　数据管线全空，无任何运行时数据（P0）
**描述**：data-src、assets-src、release 全部仅 .gitkeep；tools 5 个 pipeline 中 4 个只有 .gitkeep，1 个全 NotImplementedError。意味着没有星历数据、没有 catalog.json、没有 manifest、没有纹理/高程/网格资产。即使代码全修好，运行时也无内容可加载。
**证据**：见 E-29/E-30/E-31。
**缓解措施**：优先实现 ephemeris-pipeline（生成核心天体 SPK → chebyshev）+ catalog-pipeline（生成 catalog.json）。提供"冒烟数据集"（地月系统 + 8 大行星 1 年星历）供前端联调。

### R-06　Worker RPC 大量 no-op（P1）
**描述**：astro-core-worker 的 clock.* 全 no-op、ephemeris.supports 永假、ephemeris.getCoverage 返回 null、event.* 返回空/UNSUPPORTED、tour.* 返回占位。前端调用这些 RPC 得到的是欺骗性空响应，不会触发错误但功能不存在。
**证据**：`packages/astro-core-api/src/astro-core-worker.ts:74-160`（多个 no-op 与占位）。
**缓解措施**：对未实现的方法显式抛 `UNSUPPORTED` 错误而非返回空成功，让前端能感知；按优先级逐个实现：clock → ephemeris.query → state.evaluate → state.sampleOrbit → event.search → tour.*。

### R-07　类型接口与实现签名不一致（P2）
**描述**：RendererFactory 接口与实现签名不符（E-38）；BodyRendererFactory 不支持导航目录中的 58 个 body（E-43）；CruiseWaypoint 缺 12 字段（E-21）。这些是接口契约断裂，会导致类型检查通过但运行时失败。
**证据**：见对应错误条目。
**缓解措施**：建立接口一致性测试（每个 interface 都有 mock 实现通过类型检查 + 运行时 smoke test）；对设计文档中的数据结构（Cruise/Tour/ContentCard/Catalog）生成 JSON Schema 并在 schemas 包校验。

### R-08　测试覆盖与生产代码脱节（P2）
**描述**：astro-core-wasm 有 7 个测试文件，但 events.test.ts 直接 import `../events.js`（绕过 index.ts），所以测试通过但 events 未导出（E-18）无人发现。renderer-core 的多个 __tests__ 主要测试纯函数（hdr/shadows/quality 的 CPU 数学），未测试 GPU 管线（因无 GPU 环境）。productization 的"测试运行器"用随机数（E-24）。
**证据**：`packages/astro-core-wasm/src/__tests__/events.test.ts:13`（直接 import）；`packages/renderer-core/src/__tests__/` 各文件。
**缓解措施**：增加"public API 导出测试"——遍历预期导出列表，断言 index.ts 中存在；为 productization 替换随机数后补真实测试。

### R-09　COOP/COEP 缺失导致 SharedArrayBuffer 不可用（P1）
**描述**：服务器未发 COOP/COEP 头，浏览器禁用 SharedArrayBuffer。若未来 WASM 多线程（design §8.2 稳定性 + 性能）或大缓冲区零拷贝传输需要 SAB，将无法启用。当前 astro-core-worker 用 postMessage 序列化 JsValue，性能受限。
**证据**：`packages/server/src/server.ts:99-104`（headers 无 COOP/COEP）。
**缓解措施**：server.ts 默认添加 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`；评估所有跨域资源（字体/影像）是否需 CORS。

### R-10　代码复制粘贴导致 bug 双倍（P3）
**描述**：terrain.ts（renderer-core）与 index.ts（terrain-engine）几乎逐行相同（E-39），face 4/5 重叠、距离 LOD、硬编码半径三个 bug 同时存在两份代码。修一处忘另一处将导致不一致。
**证据**：`packages/renderer-core/src/terrain.ts:291-301` 与 `packages/terrain-engine/src/index.ts:302-312` 完全相同。
**缓解措施**：合并为单一实现，或在 terrain-engine 中 `export * from '@solar-system/renderer-core'` 复用。

### R-11　pnpm workspace 构建链未验证（P1）
**描述**：根 package.json 的 build 脚本是 `pnpm -r build`，但多包为空（app-orchestrator/tour-player/render-engine 是 `export {}`），astro-core-wasm 依赖未构建的 pkg/。从未验证整个 workspace 能否完成 typecheck/build。
**证据**：`package.json:13`（build:wasm）；空包见 E-25/E-26；pkg/ 缺失见 E-41。
**缓解措施**：在 CI 增加 `pnpm typecheck && pnpm build:wasm && pnpm build` 全链路；修复空包与缺失 pkg。

### R-12　设计文档与实现的 FR 覆盖率未追踪（P2）
**描述**：设计文档定义了 80+ FR（FR-BOOT/TIME/ASTRO/SCALE/CAM/NAV/EVENT/SURFACE/CONTENT/TOUR/OFFLINE/RENDER/SHADER/TEXTURE/HDR/SHADOW/QUALITY/EXTEND/PROD/ASSET），但仓库无 FR → 代码映射表，无法量化完成度。
**证据**：`.trae/specs/audit-implementation-vs-design/` 有 spec/checklist/tasks 但未填充；`docs/reviews/实现审查报告.md` 仅 19 行模板。
**缓解措施**：建立 FR 覆盖矩阵（FR ID → 实现文件:line → 状态），随修复进度更新。

---

## 第三节　按严重度排序的修复优先级

### P0（致命，阻塞核心功能或运行时崩溃）— 必须最先修复

| 序号 | 错误 | 一句话修复方向 | 复杂度 |
|---|---|---|---|
| 1 | E-41 WASM pkg 缺失 | 执行 `pnpm build:wasm`，CI 加构建步骤 | 低 |
| 2 | E-25 app-orchestrator 空 | 实现启动编排器，协调 diagnostics→worker→renderer→UI | 高 |
| 3 | E-35 App.tsx/SceneViewport 占位 | 接入真实启动流程，挂载 canvas + renderer | 高 |
| 4 | E-09 body renderers 全空 | 实现 5 类 body 的 GPU draw call | 高 |
| 5 | E-10 SphereGeometry 无顶点 | 生成 UV 球面顶点/索引数据 | 中 |
| 6 | E-01 WebGPU submit 空提交 | 保存 commandEncoder，finish 后 submit | 中 |
| 7 | E-02 WebGPU bytesPerRow bug | 按 width × 像素字节计算并对齐 256 | 低 |
| 8 | E-17/E-34 StarData 死代码 + 空对象强转 | StarData 实现 StellarBackground 接口并实例化 | 低 |
| 9 | E-16 扩展空间 render 全空 | 实现粒子系统 GPU 渲染 | 高 |
| 10 | E-18 events.ts 未导出 | index.ts 添加 `export * from './events.js'` | 低 |
| 11 | E-20 Worker event.search 返回 [] | Worker 桥接事件引擎 | 中 |
| 12 | E-26 tour-player 空 | 实现 TourPlayer + 桥接 worker tour RPC | 高 |
| 13 | E-29 ephemeris-pipeline 全 NotImplementedError | 实现 SPK 解析 + chebyshev 拟合 | 高 |
| 14 | E-31 data-src/assets-src 全空 | 由 pipeline 生成 + 下载公开数据 | 高 |

### P1（严重，功能错误或语义冲突）— 紧随其后

| 序号 | 错误 | 一句话修复方向 | 复杂度 |
|---|---|---|---|
| 15 | E-03 WebGPU topology 硬编码 | 补全 PrimitiveType 映射表 | 低 |
| 16 | E-04 WebGPU shaderLocation 硬编码 0 | 用 map index 作 shaderLocation | 低 |
| 17 | E-06 HDR CPU 数学非 GPU 管线 | 实现 GPU 后处理管线 | 高 |
| 18 | E-07 Shadow CPU 几何非 GPU 阴影 | 实现 shadow map 渲染通道 + 接触时刻求根 | 高 |
| 19 | E-11 导航拼音索引逻辑错 | 引入中文→拼音转换 | 中 |
| 20 | E-12 卫星目录硬编码 35 颗 | 改为从 catalog.json 加载 | 中 |
| 21 | E-13 地形 face 4/5 重叠 | 重新设计 6 面投影 | 中 |
| 22 | E-14 地形距离 LOD 非屏幕空间误差 | 用 screenSpaceError 判定 split | 中 |
| 23 | E-15 地形忽略 bodyId + 假高程 | 接收 bodyId + 加载真实高程瓦片 | 中 |
| 24 | E-19 EventsServiceImpl 8 硬编码样本 | 改调真实事件引擎 | 中 |
| 25 | E-21 CruiseWaypoint 缺 12 字段 | 补全接口与数据 | 中 |
| 26 | E-22 CruiseServiceImpl.update 不驱动相机/时钟 | update 中调用相机/时钟/尺度 setter | 高 |
| 27 | E-24 productization 全 Math.random | 改用 SHA-256/真实文件大小/真实指标 | 高 |
| 28 | E-28 服务器无 HTTPS/COOP/COEP/Brotli/ETag | 用 https + 添加头 + 预压缩 + etag 包 | 中 |
| 29 | E-30 release 目录全空 | 实现 release 构建脚本 | 中 |
| 30 | E-32 Worker clock/ephemeris RPC no-op | Worker 维护时钟与星历状态 | 中 |
| 31 | E-43 BodyRendererFactory 仅支持 10 body | 补全卫星/矮行星/小行星 case | 中 |
| 32 | E-44 getScreenEdgeIndicator 逻辑反 | 修正 dot 符号判定 | 低 |

### P2（一般，功能不全或简化）— 第三梯队

| 序号 | 错误 | 一句话修复方向 | 复杂度 |
|---|---|---|---|
| 33 | E-08 自动画质无运行时反馈回路 | 接入 PerformanceMonitor 自动降级 | 中 |
| 34 | E-23 PureViewingMode 仅切换标志 | 接入 UI 隐藏与渲染调整 | 中 |
| 35 | E-27 sample_orbit 固定步长 | 实现曲率自适应步长 | 中 |
| 36 | E-33 sampleOrbit RPC 参数语义混淆 | protocol 与 wasm 对齐参数 | 低 |
| 37 | E-37 runBenchmark 硬编码帧时 | 实测 GPU 帧时 | 中 |
| 38 | E-38 RendererFactory 签名不一致 | 补齐 config/backend 参数 | 低 |
| 39 | E-40 AstroCore.time_range 默认 0 | register_ephemeris 时更新范围 | 中 |
| 40 | E-42 4 个 pipeline 目录无任何文件 | 各写 README + 主脚本骨架 | 高 |

### P3（轻微，代码质量）— 可延后

| 序号 | 错误 | 一句话修复方向 | 复杂度 |
|---|---|---|---|
| 41 | E-05 WebGPU usage 魔法数字 | 改用 GPUBufferUsage 常量 | 低 |
| 42 | E-36 detectWebgpu 设备泄漏 | 用 adapter.limits 或 destroy device | 低 |
| 43 | E-39 terrain-engine 与 renderer-core/terrain.ts 重复 | 合并单一实现 | 中 |

---

## 附：核实方法说明

- 本清单每条证据均通过 Read/Grep 实际读取对应文件确认，行号为审查时（2026-07-16）仓库状态。
- 设计文档要求引用以 `docs/Web3D影视级太阳系项目完整设计文档.md:line` 形式标注。
- 部分错误（如 E-17/E-34）为同根因的两面，修复时合并处理。
- 测试文件（`__tests__/`）的覆盖情况未单独列入错误清单，但作为风险 R-08 记录。
