# Web3D 太阳系项目 — FR 覆盖矩阵

> **最后更新**: 2026-07-18
> **目标**: ✅ ≥ 70/80、❌ = 0、⚠️ = 0
> **依据**: 设计文档第 7 节（`docs/Web3D影视级太阳系项目完整设计文档.md` 行 323-458）的 80 条功能性需求 + 实际代码审查
> **来源对照**: `docs/reviews/fragments/task13-fr-checklist.md` v1.1（2026-07-17）+ Task 1-17 修复成果合并

## 状态图例

| 图例 | 含义 |
|---|---|
| ✅ | 已实现：功能完整且通过测试 |
| 🟡 | 部分实现：有框架但功能不全 |
| ❌ | 未实现：完全缺失 |
| ⚠️ | 有缺陷：实现存在 bug 或与规范不符 |

## 概览统计

| 状态 | 数量 | 占比 |
|---|---|---|
| ✅ 已实现 | 59 | 73.75% |
| 🟡 部分实现 | 8 | 10.00% |
| ❌ 未实现 | 13 | 16.25% |
| ⚠️ 有缺陷 | 0 | 0.00% |
| **合计** | **80** | **100%** |

**目标对齐**：
- ✅ ≥ 70/80（87.5%）：**未达标**（59/80 = 73.75%，缺口 11 项）
- ❌ = 0：**未达标**（仍剩 13 项 ❌）
- ⚠️ = 0：**达标**（3 项 ⚠️ 全部修复，归零）

## 详细矩阵

### 1. 启动与能力检测（FR-BOOT，设计 7.1 节，6 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-BOOT-001 | 浏览器/OS/WebGPU/WebGL2/纹理压缩/最大纹理/GPU 限制检测 | packages/diagnostics/src/index.ts:233 | ✅ | detectCapabilities 完整覆盖全部检测维度 |
| FR-BOOT-002 | 短时基准测试 + 推荐画质 | packages/diagnostics/src/index.ts:258 | ✅ | GpuBenchmarkRunner 实测 GPU 帧时（E-37 修复） |
| FR-BOOT-003 | WebGPU 不可用自动转 WebGL2 标准模式 | packages/diagnostics/src/index.ts:327 | ✅ | recommendBackend 实现降级 |
| FR-BOOT-004 | 资源缺失/校验失败显示缺失包与路径 | packages/diagnostics/src/index.ts:333；packages/app-orchestrator/src/index.ts | ✅ | Task 2 完成；orchestrator 在启动流程接入 validateResources |
| FR-BOOT-005 | 分阶段进度（核心程序/星历/基础天体/目标资产） | apps/web/src/App.tsx:61；apps/web/src/components/BootProgress.tsx | ✅ | Task 3 完成；4 阶段绑定 orchestrator.subscribe 真实事件，移除 setTimeout 模拟 |
| FR-BOOT-006 | 不读写浏览器持久化偏好 | 全仓库 grep 无 localStorage/IndexedDB 偏好读写 | ✅ | 遵守约束 |

**小计**：✅×6 / 🟡×0 / ❌×0 / ⚠️×0

### 2. 时间模拟（FR-TIME，设计 7.2 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-TIME-001 | 支持系统当前 UTC 时间同步 | packages/astro-core-api/src/astro-core-worker.ts:353 | ✅ | clock.setUtc 真实写入 ClockState |
| FR-TIME-002 | 支持 1900-2100 年任意日期 | crates/time-system/src/time.rs:14 | ✅ | TIME_RANGE_MJD_UTC=(15020, 88128.999988) 覆盖 1900-2100 |
| FR-TIME-003 | 支持暂停/继续/正向/反向/单步 | packages/astro-core-api/src/astro-core-worker.ts:359-368 | ✅ | clock.pause/resume/step/setRate（rate 负值即反向）齐全 |
| FR-TIME-004 | 多级倍率（秒/分/时/日/月/年） | packages/astro-core-api/src/astro-core-worker.ts:356 | ✅ | clock.setRate 支持 multiplier，由 UI 传入不同倍率值 |
| FR-TIME-005 | 高倍率按目标时刻直接计算，不用帧累计 | crates/astro-core/src/lib.rs:95 | ✅ | evaluate_state 接收 tdb 直接求值 |
| FR-TIME-006 | 时间变化后所有天体位置/自转/阴影/事件同步更新 | packages/astro-core-api/src/astro-core-client.ts:159-163；packages/app-orchestrator/src/index.ts | 🟡 | orchestrator 每帧 RPC 调用 evaluateSnapshot 推送 BodyState 已实现；但 Worker → client 的低频 snapshot 流消息（client.ts:159-163 注释"实际快照应由 WASM 序列化"）未填充真实数据 |
| FR-TIME-007 | 超范围阻止继续并说明高精度范围边界 | crates/time-system/src/time.rs:68；crates/ephemeris-runtime/src/provider.rs | ✅ | check_range + OutOfRange 错误 |
| FR-TIME-008 | 未来闰秒预测策略 + 不确定性说明 | crates/time-system/src/leap_seconds.rs；crates/time-system/src/time.rs:29 | ✅ | OFFICIAL_LEAP_SECONDS + is_predicted + DATA_BASELINE_MJD_UTC + TimeUncertainty |

**小计**：✅×7 / 🟡×1 / ❌×0 / ⚠️×0

### 3. 天体模拟（FR-ASTRO，设计 7.3 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-ASTRO-001 | 太阳/八大行星/月球高精度星历 | crates/ephemeris-runtime/src/provider.rs；data-src/normalized/ephemeris-{0,1,2,3,4,5,6,7,8,301}.bin | ✅ | Task 4 完成；切比雪夫插值 + 实际 SPK 数据已生成 |
| FR-ASTRO-002 | 主要卫星优先高精度卫星星历 | crates/ephemeris-runtime/src/provider.rs；data-src/normalized/ephemeris-301.bin | 🟡 | 仅月球（301）有星历数据，木卫/土卫等主要卫星未生成数据文件 |
| FR-ASTRO-003 | 其他卫星用星历/数值拟合/平均轨道根数 | 未找到实现 | ❌ | 无 MeanElementsProvider；需在 ephemeris-runtime 增加 |
| FR-ASTRO-004 | 平均轨道根数不得标为高精度 | crates/ephemeris-runtime/src/provider.rs:50 | ✅ | EphemerisQuery::OutOfRange + Precision 枚举区分 P0-P4 |
| FR-ASTRO-005 | 状态含位置/速度/姿态/角速度/精度等级 | crates/astro-core/src/snapshot.rs:33-46 | ✅ | BodyState 字段齐全 |
| FR-ASTRO-006 | 轨道线通过指定时间区间采样生成 | crates/astro-core/src/lib.rs:141 | ✅ | Task 17 完成；sample_orbit 采用基于速度梯度的自适应步长（E-27 修复） |
| FR-ASTRO-007 | 唯一稳定标识，不依赖显示名 | crates/astro-core/src/catalog.rs | ✅ | 使用数值 body_id 作为唯一键 |
| FR-ASTRO-008 | 目录随离线包更新不改引擎代码 | crates/astro-core/src/catalog.rs；data-src/normalized/catalog.json | ✅ | 数据驱动架构；Task 4 生成 catalog 数据文件随 release 分发 |

**小计**：✅×6 / 🟡×1 / ❌×1 / ⚠️×0

### 4. 尺度与显示（FR-SCALE，设计 7.4 节，6 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-SCALE-001 | 提供真实比例模式 | packages/renderer-core/src/scale-mapping.ts:161 | 🟡 | ScaleManager 框架存在，但无 `real`/`enhanced` 显式模式切换 API |
| FR-SCALE-002 | 提供增强展示模式 | packages/renderer-core/src/scale-mapping.ts:161 | 🟡 | 同上，无增强模式独立配置 |
| FR-SCALE-003 | 分别显示距离/半径/卫星系统倍率 | packages/renderer-core/src/scale-mapping.ts:13 | ❌ | 仅单一 `scaleFactor: number`，未拆分 distanceScale/radiusScale/satelliteScale 三类倍率 |
| FR-SCALE-004 | 尺度切换平滑过渡，无突变 | packages/renderer-core/src/scale-mapping.ts:80,148 | ✅ | `currentScale = currentScale * 0.9 + targetScale * 0.1` 插值平滑 |
| FR-SCALE-005 | 增强模式下轨道/标签不得造成真实数据误读 | 未找到实现 | ❌ | 无"增强标注"水印机制 |
| FR-SCALE-006 | 真实模式标签可屏幕空间增强但天体实体不放大 | 未找到实现 | ❌ | 无标签独立缩放与实体尺寸分离逻辑 |

**小计**：✅×1 / 🟡×2 / ❌×3 / ⚠️×0

### 5. 相机与导航（FR-CAM，设计 7.5 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-CAM-001 | 支持轨道/自由飞行/跟随/地表低空四类相机 | packages/renderer-core/src/camera.ts:427,558 | 🟡 | 仅 OrbitController + FlyController 两类，缺 FollowController 与 SurfaceLowController |
| FR-CAM-002 | 目标切换生成安全平滑过渡路径 | 未找到实现 | ❌ | 无 flyTo 贝塞尔/样条插值 |
| FR-CAM-003 | 相机速度随当前空间尺度自动变化 | 未找到实现 | ❌ | 无尺度感知的速度调节 |
| FR-CAM-004 | 小天体近景自动降低速度和旋转灵敏度 | 未找到实现 | ❌ | 无近景减速逻辑 |
| FR-CAM-005 | 相机不得无提示穿入太阳/气态行星深层/禁入天体 | 未找到实现（camera.ts）；SurfaceCameraImpl 在 terrain.ts:557 有最小距离约束但未接入 camera controller | ❌ | 相机控制器未集成碰撞防护 |
| FR-CAM-006 | 近远裁剪面根据局部参考系动态调整 | 未找到实现 | ❌ | 无动态裁剪面 |
| FR-CAM-007 | 一键返回母星/系统全景/太阳系全景 | 未找到实现 | ❌ | 无预设视角快捷入口 |
| FR-CAM-008 | 支持无界面纯净观赏 | packages/renderer-core/src/events-cruises.ts:682 | ✅ | PureViewingModeImpl 实现 |

**小计**：✅×1 / 🟡×1 / ❌×6 / ⚠️×0

### 6. 天体搜索与目录（FR-NAV，设计 7.6 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-NAV-001 | 中文名/英文名/编号/别名搜索 | packages/navigation-service/src/index.ts:197 | ✅ | search 支持 nameZh/nameEn/bodyId/aliases，matchType 区分 exact/prefix/alias/fuzzy |
| FR-NAV-002 | 拼音/拼音首字母/模糊搜索 | packages/navigation-service/src/index.ts:193 | ✅ | getPinyin 返回真实拼音（PINYIN_MAP 完整覆盖 60+ 天体），搜索去空格后命中 "mu xing"→"木星" |
| FR-NAV-003 | 按类型/系统/尺寸/轨道/资产等级筛选 | packages/navigation-service/src/index.ts:197；data/catalog.json | 🟡 | search 有评分但无显式 filter 参数；catalog 仅 58 颗天体，远少于设计 290+ 已命名卫星 |
| FR-NAV-004 | 展示太阳系/行星/卫星层级关系 | packages/navigation-service/src/index.ts:340 | ✅ | buildHierarchy() 递归构建层级树 |
| FR-NAV-005 | 卫星↔母星跳转 + 母星查看卫星列表 | packages/navigation-service/src/index.ts:376,387 | ✅ | jumpToParent + listSatellites 实现 |
| FR-NAV-006 | 轨道/标签批量显隐 | packages/navigation-service/src/index.ts:394,408 | ✅ | setOrbitsVisible + setLabelsVisible + 状态查询 |
| FR-NAV-007 | 目标方向指示 + 屏幕边缘箭头 | packages/navigation-service/src/index.ts:455 | ✅ | getScreenEdgeIndicator 实现 |
| FR-NAV-008 | 最近浏览仅当前内存会话，刷新清空 | packages/navigation-service/src/index.ts:167,427 | ✅ | recentlyViewed 为内存数组，未持久化 |

**小计**：✅×7 / 🟡×1 / ❌×0 / ⚠️×0

### 7. 天文事件（FR-EVENT，设计 7.7 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-EVENT-001 | 按时间范围和事件类型搜索 | packages/astro-core-api/src/astro-core-worker.ts:430；packages/astro-core-wasm/src/events.ts | ✅ | Worker event.search 委托 createDefaultEventEngine 调用 findEclipses/findConjunctions/findOppositions |
| FR-EVENT-002 | 日食/月食/凌日/掩星/合/冲/近日/远日点 | packages/astro-core-wasm/src/index.ts:85；packages/astro-core-wasm/src/events.ts | ✅ | events.js 已从 index.ts 导出；7 类事件 findXxx 函数完整 |
| FR-EVENT-003 | 主要卫星食和凌越 | crates/event-engine/src/types.rs:30-32 | ❌ | 仅类型定义（SatelliteTransit/SatelliteEclipse），event-engine 无任何求根实现 |
| FR-EVENT-004 | 结果含开始/极大/结束/精度等级 | crates/event-engine/src/types.rs:50,72；packages/astro-core-api/src/index.ts:240-248 | ✅ | EventPhase(begin/maximum/end) + EventPrecision + AstroEvent 字段完整 |
| FR-EVENT-005 | 一键跳转极大时刻 + 推荐观察视角 | packages/renderer-core/src/events-cruises.ts:794；packages/astro-core-api/src/index.ts:259-280 | ✅ | jumpToEventMax 实现，返回 peak 时刻 + 推荐相机 |
| FR-EVENT-006 | 事件过程自动播放 | packages/renderer-core/src/events-cruises.ts:820 | ✅ | EventTimelinePlayer 类（startTimeline/tick/seekTo/stopTimeline）实现 |
| FR-EVENT-007 | 无法高精度对象显示预测/近似标签 | packages/astro-core-api/src/index.ts:248；packages/astro-core-api/src/astro-core-worker.ts:273-279 | ✅ | AstroEvent.is_approximate + EventUncertainty.notes_zh 已传递至前端 |
| FR-EVENT-008 | 事件计算不得依赖在线 API | packages/astro-core-wasm/src/events.ts | ✅ | 本地求根，无在线调用 |

**小计**：✅×7 / 🟡×0 / ❌×1 / ⚠️×0

### 8. 星体近景和地表（FR-SURFACE，设计 7.8 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-SURFACE-001 | 地球/月球/火星全球连续地形覆盖 | packages/renderer-core/src/terrain.ts:400 | ✅ | E-13 修复：face 4/5 边界拆分为东经/西经半区，六面互不重叠且并集为全球 |
| FR-SURFACE-002 | 太空到低空连续 LOD | packages/renderer-core/src/terrain.ts:428,433 | ✅ | E-14 修复：traverse 基于 calculateScreenSpaceError 判定细分，删除距离阈值与 needsRefinement 死代码 |
| FR-SURFACE-003 | 瓦片缺失用低一级，不显示空洞 | packages/renderer-core/src/terrain.ts:440-444 | ✅ | E-15 fallback：子瓦片未加载完成时把父瓦片加入 visibleTiles |
| FR-SURFACE-004 | 瓦片边界无明显裂缝 | packages/renderer-core/src/terrain.ts:174 | ✅ | skirt 裙边顶点生成：将瓦片四角顶点沿径向向行星中心偏移 skirtHeight |
| FR-SURFACE-005 | 地球不含真实建筑/道路/植被三维重建 | packages/body-renderers/src/index.ts | ✅ | 无此类资产，遵守约束 |
| FR-SURFACE-006 | 气态行星仅允许进入高层大气可视区域 | packages/renderer-core/src/terrain.ts:557,569 | ✅ | SurfaceCameraImpl.isGasGiant + getMinSafeDistance（atmosphereRadius=1.1*radius）+ clampCameraDistance |
| FR-SURFACE-007 | 太阳设置最小安全距离 | packages/renderer-core/src/terrain.ts:558 | ✅ | SurfaceCameraImpl.isSun + getMinSafeDistance 返回 1.5*radius |
| FR-SURFACE-008 | 代表性小行星/彗星支持超近景环绕 | packages/renderer-core/src/terrain.ts:637 | ✅ | IrregularBodyRendererImpl 程序化噪声扰动球面生成不规则形状顶点 |

**小计**：✅×8 / 🟡×0 / ❌×0 / ⚠️×0

### 9. 科普内容（FR-CONTENT，设计 7.9 节，7 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-CONTENT-001 | 每天体含名称/类型/尺寸/质量/轨道周期/自转周期 | packages/content-service/src/data/content.json；packages/content-service/src/index.ts:65 | ✅ | 16 颗天体均含完整 basicParams |
| FR-CONTENT-002 | S/A 级含结构/大气/地貌/发现/科学章节 | packages/content-service/src/data/content.json | ✅ | S 级（10 颗）+ A 级（6 颗，含木卫一/土卫六/月球/火卫一等）均含完整 sections |
| FR-CONTENT-003 | 内容使用简体中文 | packages/content-service/src/data/content.json | ✅ | 全部字段值为简体中文 |
| FR-CONTENT-004 | 数据卡片显示数据来源和精度等级 | packages/content-service/src/index.ts:32；content.json | ✅ | ContentCard.sources + BasicParams.precision |
| FR-CONTENT-005 | 程序化外观显示"示意外观"说明 | packages/content-service/src/data/content.json | ✅ | 16 颗天体 proceduralAppearanceNote 全部填充（"太阳表面采用光球层湍流纹理程序化合成..."等） |
| FR-CONTENT-006 | 科普内容以静态数据随版本发布 | packages/content-service/src/data/content.json；packages/content-service/src/index.ts:65 | ✅ | 内容抽离为独立 JSON 静态文件，由 import 加载（T-P2-19 修复） |
| FR-CONTENT-007 | 不提供评论/收藏/学习记录/内容编辑 | 全仓库 grep 无评论/收藏 API | ✅ | 无此类用户功能，遵守约束 |

**小计**：✅×7 / 🟡×0 / ❌×0 / ⚠️×0

### 10. 预制巡航（FR-TOUR，设计 7.10 节，6 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-TOUR-001 | 支持播放/暂停/跳转/退出 | packages/tour-player/src/index.ts:78；packages/renderer-core/src/events-cruises.ts:530 | ✅ | TourPlayerImpl 实现 load/play/pause/resume/seek/exit + rAF 循环驱动 CruiseService.update |
| FR-TOUR-002 | 同步控制相机/时间/尺度/图层/目标 | packages/renderer-core/src/events-cruises.ts:78,129 | ✅ | E-21 修复：CruiseWaypoint 扩展至 12+ 字段（timeSetting/cameraTarget/cameraPosition/scaleMode/layerVisibility 等），CruiseCallbacks 在 waypoint 切换时触发 |
| FR-TOUR-003 | 巡航配置为静态只读文件 | packages/renderer-core/src/events-cruises.ts:180 (CRUISES 常量) | 🟡 | 20 条巡航仍硬编码在源码中，未抽离为 `data/cruises/*.json` 独立静态文件 |
| FR-TOUR-004 | 用户不得编辑或保存巡航 | 全仓库 grep 无巡航编辑 API | ✅ | 无编辑/保存功能，遵守约束 |
| FR-TOUR-005 | 退出后恢复到合理自由探索状态 | packages/tour-player/src/index.ts:167；packages/renderer-core/src/events-cruises.ts:582 | ❌ | exit() 仅 stopCruise() 清空状态，未保存/恢复进入巡航前的自由探索相机/时间/尺度状态 |
| FR-TOUR-006 | 资源未安装时显示所需资源包 | packages/astro-core-api/src/astro-core-worker.ts:488 | 🟡 | tour.validateResources 当前硬编码返回 `{ ok: true, missing_packages: [] }`，前端无法获取真实缺失资源包清单 |

**小计**：✅×3 / 🟡×2 / ❌×1 / ⚠️×0

### 11. 离线运行（FR-OFFLINE，设计 7.11 节，7 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-OFFLINE-001 | 断网后所有核心功能可运行 | assets-src/{bodies,effects,terrain}/；data-src/normalized/；release/ | ✅ | Task 4 完成：太阳/地球/月球/火星纹理与高程数据已填充；星历数据 + catalog 已生成；架构无在线依赖 |
| FR-OFFLINE-002 | 禁止在线字体/脚本/CDN | packages/server/src/server.ts:118 (CSP) | ✅ | CSP `default-src 'self'`；全仓库 grep 无 CDN 域名引用 |
| FR-OFFLINE-003 | 支持 localhost 本地服务运行 | packages/server/src/server.ts:410 | ✅ | createServer 默认 HTTP 模式 + Range/304/预压缩 |
| FR-OFFLINE-004 | 局域网影视级 WebGPU 部署支持 HTTPS 或可信安全上下文 | packages/server/src/server.ts:440 | ✅ | Task 11 完成：--tls-cert/--tls-key 启用 https.createServer；COOP/COEP/CORP 头已发送 |
| FR-OFFLINE-005 | 资源清单含版本/大小/哈希/依赖 | packages/renderer-core/src/productization.ts:239,327,380 | ✅ | Task 15 完成：calculateHash 用真实 SHA-256（crypto.createHash），不再 Math.random |
| FR-OFFLINE-006 | 支持资源包独立安装/校验/回滚 | 未找到实现 | ❌ | ResourceManager 仅 load/unload，无 install/verify/rollback 流程 |
| FR-OFFLINE-007 | 不支持 file:// 打开 | packages/server/src/server.ts | ✅ | 需通过本地服务运行，file:// 直接打开无法加载 wasm/资源 |

**小计**：✅×6 / 🟡×0 / ❌×1 / ⚠️×0

## 按类别汇总

| 类别 | ✅ 完成 | 🟡 部分 | ❌ 缺失 | ⚠️ 错误 | 合计 |
|---|---|---|---|---|---|
| FR-BOOT | 6 | 0 | 0 | 0 | 6 |
| FR-TIME | 7 | 1 | 0 | 0 | 8 |
| FR-ASTRO | 6 | 1 | 1 | 0 | 8 |
| FR-SCALE | 1 | 2 | 3 | 0 | 6 |
| FR-CAM | 1 | 1 | 6 | 0 | 8 |
| FR-NAV | 7 | 1 | 0 | 0 | 8 |
| FR-EVENT | 7 | 0 | 1 | 0 | 8 |
| FR-SURFACE | 8 | 0 | 0 | 0 | 8 |
| FR-CONTENT | 7 | 0 | 0 | 0 | 7 |
| FR-TOUR | 3 | 2 | 1 | 0 | 6 |
| FR-OFFLINE | 6 | 0 | 1 | 0 | 7 |
| **合计** | **59** | **8** | **13** | **0** | **80** |

## 缺口与待办

> 按优先级（P0/P1/P2）排序，列出所有 🟡/❌/⚠️ 项及修复方向。

### P0 — 阻塞用户体验（❌×4，影响相机/尺度核心交互）

| FR ID | 缺口 | 修复方向 | 预估工作量 |
|---|---|---|---|
| FR-CAM-002 | 目标切换无平滑过渡路径 | 在 camera.ts 增加 `flyTo(target)` 贝塞尔/样条插值 | 2d |
| FR-CAM-005 | 相机无碰撞防护 | 在 CameraController.update 调用 SurfaceCameraImpl.clampCameraDistance | 1d |
| FR-CAM-007 | 无预设视角快捷入口 | 增加 `returnToHome()` / `systemOverview()` / `solarSystemPanorama()` | 1d |
| FR-SCALE-003 | 尺度未拆分 distance/radius/satellite 三类倍率 | ScaleConfig 拆分三字段 + UI 三档独立显示 | 2d |

### P1 — 影响完整性（🟡×4 + ❌×4）

| FR ID | 缺口 | 修复方向 | 预估工作量 |
|---|---|---|---|
| FR-TIME-006 | Worker snapshot 流未填充真实数据 | Worker 定时调用 evaluateSnapshot 后通过 postMessage 推送序列化快照 | 1d |
| FR-ASTRO-002 | 仅月球有卫星星历，缺木卫/土卫等 | 用 ephemeris-pipeline 生成主要卫星 SPK 数据 | 2d |
| FR-ASTRO-003 | 无平均轨道根数降级 | 在 ephemeris-runtime 增加 MeanElementsProvider | 3d |
| FR-NAV-003 | catalog 仅 58 颗，缺 290+ 已命名卫星 | 扩充 catalog.json 至全部已命名卫星 + 增加 filter 参数 | 2d |
| FR-EVENT-003 | 无卫星食/凌越求根实现 | 在 event-engine 实现 SatelliteTransit/SatelliteEclipse 求根 | 3d |
| FR-TOUR-005 | 巡航退出未恢复探索状态 | exit() 前保存相机/时间/尺度状态，退出时恢复 | 1d |
| FR-OFFLINE-006 | 无资源包安装/校验/回滚 | 实现 PackageInstaller + 版本管理 | 3d |
| FR-TOUR-006 | tour.validateResources 硬编码 ok=true | 真实校验资源包存在性，缺失时返回 missing_packages 清单 | 1d |

### P2 — 体验增强（🟡×4 + ❌×5）

| FR ID | 缺口 | 修复方向 | 预估工作量 |
|---|---|---|---|
| FR-SCALE-001 | 无真实比例模式切换 | ScaleManager 增加 `mode: 'real'` API，real 模式 scaleFactor=1 | 1d |
| FR-SCALE-002 | 无增强展示模式 | 同上，`mode: 'enhanced'` 配置独立倍率 | 1d |
| FR-SCALE-005 | 增强模式无"示意"标注 | 增强模式下轨道/标签添加 "示意" 水印 | 1d |
| FR-SCALE-006 | 标签无屏幕空间独立增强 | 标签独立缩放，实体保持真实尺寸 | 1d |
| FR-CAM-001 | 缺 Follow/SurfaceLow 相机 | 新增 FollowController + SurfaceLowController | 3d |
| FR-CAM-003 | 无尺度感知速度 | 依 ScaleManager 当前尺度动态调整 fly speed | 1d |
| FR-CAM-004 | 无近景减速 | 依据目标天体半径调节灵敏度 | 1d |
| FR-CAM-006 | 无动态裁剪面 | 依 FloatingOrigin 距离动态设置 near/far | 1d |
| FR-TOUR-003 | CRUISES 硬编码 | 抽离为 `data/cruises/*.json` 只读文件 | 1d |

### 补救建议

**短期（关闭 ❌=13）**：
1. **FR-CAM-002/005/007 + FR-SCALE-003**（P0）：相机平滑过渡 + 碰撞防护 + 预设视角 + 尺度三档拆分——直接提升核心交互可用性，预计 6 工作日
2. **FR-ASTRO-003 + FR-EVENT-003 + FR-OFFLINE-006**（P1）：平均轨道根数 + 卫星食求根 + 资源包管理——补全天文内核完整性，预计 9 工作日
3. **FR-TOUR-005/006 + FR-ASTRO-002 + FR-NAV-003**（P1）：巡航退出恢复 + 资源缺失展示 + 卫星星历 + catalog 扩充——预计 6 工作日

**中期（关闭 🟡=8）**：
4. **FR-TIME-006 + FR-SCALE-001/002/005/006 + FR-CAM-001/003/004/006 + FR-TOUR-003**：snapshot 流真实化 + 尺度模式 + 相机四类齐全 + 巡航配置抽离——预计 11 工作日

**累计**：约 32 工作日可关闭全部 21 项缺口，达到 ✅≥70/80 + ❌=0 + ⚠️=0 的最终目标。

## 更新日志

| 日期 | 版本 | 变更摘要 |
|---|---|---|
| 2026-07-18 | v1.0 | 首版矩阵：基于 task13-fr-checklist v1.1 + Task 1-17 修复成果合并；80 条 FR 全量核对；⚠️=0 已达标；列出 21 项 🟡/❌ 缺口与补救建议 |
