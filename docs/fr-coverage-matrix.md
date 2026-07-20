# Web3D 太阳系项目 — FR 覆盖矩阵

> **最后更新**: 2026-07-20
> **目标**: ✅ ≥ 70/80、❌ = 0、⚠️ = 0
> **依据**: 设计文档第 7 节（`docs/Web3D影视级太阳系项目完整设计文档.md` 行 323-458）的 80 条功能性需求 + 实际代码审查
> **来源对照**: `docs/reviews/fragments/task13-fr-checklist.md` v1.1（2026-07-17）+ Task 1-17 修复成果 + 第四轮 FR 实现成果合并

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
| ✅ 已实现 | 80 | 100.00% |
| 🟡 部分实现 | 0 | 0.00% |
| ❌ 未实现 | 0 | 0.00% |
| ⚠️ 有缺陷 | 0 | 0.00% |
| **合计** | **80** | **100%** |

**目标对齐**：
- ✅ ≥ 70/80（87.5%）：**达标**（80/80 = 100%）
- ❌ = 0：**达标**（全部 13 项 ❌ 已实现）
- ⚠️ = 0：**达标**（无缺陷）

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
| FR-TIME-006 | 时间变化后所有天体位置/自转/阴影/事件同步更新 | packages/astro-core-api/src/astro-core-worker.ts:313-338（pushClockBoundary）+ 343-405（pushStateSnapshot） | ✅ | 第四轮：clock.setUtc/setRate/pause/resume/step 后推送 time_boundary 流消息（含 JulianDate 完整对象 + uncertainty/out_of_range 标志）+ snapshot 流消息（遍历 ephemerisRegistry 调用 wasm.evaluateState 获取真实 BodyState） |
| FR-TIME-007 | 超范围阻止继续并说明高精度范围边界 | crates/time-system/src/time.rs:68；crates/ephemeris-runtime/src/provider.rs | ✅ | check_range + OutOfRange 错误 |
| FR-TIME-008 | 未来闰秒预测策略 + 不确定性说明 | crates/time-system/src/leap_seconds.rs；crates/time-system/src/time.rs:29 | ✅ | OFFICIAL_LEAP_SECONDS + is_predicted + DATA_BASELINE_MJD_UTC + TimeUncertainty |

**小计**：✅×8 / 🟡×0 / ❌×0 / ⚠️×0

### 3. 天体模拟（FR-ASTRO，设计 7.3 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-ASTRO-001 | 太阳/八大行星/月球高精度星历 | crates/ephemeris-runtime/src/provider.rs；data-src/normalized/ephemeris-{0,1,2,3,4,5,6,7,8,301}.bin | ✅ | Task 4 完成；切比雪夫插值 + 实际 SPK 数据已生成 |
| FR-ASTRO-002 | 主要卫星优先高精度卫星星历 | tools/ephemeris-pipeline/build_ephemeris.py:60-79（KEPLER_FALLBACK 含 6 颗主要卫星）；data-src/normalized/ephemeris-{501,502,503,504,606,801}.bin | ✅ | 第四轮：扩展 KEPLER_FALLBACK 至 10 元组（含 parent_body_id），新增 6 颗主要卫星（Io/Europa/Ganymede/Callisto/Titan/Triton），位置 = 母星日心位置 + 卫星相对母星位置；SIMPLE_ID_TO_NAIF 同步映射 |
| FR-ASTRO-003 | 其他卫星用星历/数值拟合/平均轨道根数 | crates/ephemeris-runtime/src/mean_elements.rs（MeanElementsProvider） | ✅ | 第四轮：实现 MeanElementsProvider，Kepler 方程牛顿迭代解开普勒方程，3 轴旋转（ω, i, Ω）到惯性系；速度通过中心差分（步长 = period × 1e-4）；get_state 返回 Precision::P1；10 个单元测试全部通过 |
| FR-ASTRO-004 | 平均轨道根数不得标为高精度 | crates/ephemeris-runtime/src/mean_elements.rs:78（get_state 返回 P1）；crates/ephemeris-runtime/src/provider.rs:50 | ✅ | MeanElementsProvider 明确标记 P1；EphemerisQuery::OutOfRange + Precision 枚举区分 P0-P4 |
| FR-ASTRO-005 | 状态含位置/速度/姿态/角速度/精度等级 | crates/astro-core/src/snapshot.rs:33-46 | ✅ | BodyState 字段齐全 |
| FR-ASTRO-006 | 轨道线通过指定时间区间采样生成 | crates/astro-core/src/lib.rs:141 | ✅ | Task 17 完成；sample_orbit 采用基于速度梯度的自适应步长（E-27 修复） |
| FR-ASTRO-007 | 唯一稳定标识，不依赖显示名 | crates/astro-core/src/catalog.rs | ✅ | 使用数值 body_id 作为唯一键 |
| FR-ASTRO-008 | 目录随离线包更新不改引擎代码 | crates/astro-core/src/catalog.rs；data-src/normalized/catalog.json | ✅ | 数据驱动架构；Task 4 生成 catalog 数据文件随 release 分发 |

**小计**：✅×8 / 🟡×0 / ❌×0 / ⚠️×0

### 4. 尺度与显示（FR-SCALE，设计 7.4 节，6 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-SCALE-001 | 提供真实比例模式 | packages/renderer-core/src/scale-mapping.ts:52（ScaleMode='real'） | ✅ | 第三轮：ScaleMode 类型支持 'real'/'enhanced'/'auto'，ScaleManager.setMode 切换；real 模式 scaleFactor=1 |
| FR-SCALE-002 | 提供增强展示模式 | packages/renderer-core/src/scale-mapping.ts:52（ScaleMode='enhanced'） | ✅ | 第三轮：enhanced 模式独立配置倍率，distanceScale/radiusScale/satelliteScale 可独立设置 |
| FR-SCALE-003 | 分别显示距离/半径/卫星系统倍率 | packages/renderer-core/src/scale-mapping.ts:36-50（distanceScale/radiusScale/satelliteScale 三字段） | ✅ | 第三轮：ScaleConfig 拆分为三类独立倍率字段，UI 可三档独立显示 |
| FR-SCALE-004 | 尺度切换平滑过渡，无突变 | packages/renderer-core/src/scale-mapping.ts:80,148 | ✅ | `currentScale = currentScale * 0.9 + targetScale * 0.1` 插值平滑 |
| FR-SCALE-005 | 增强模式下轨道/标签不得造成真实数据误读 | packages/renderer-core/src/scale-mapping.ts:61-70（EnhancedModeAnnotation 含"示意"文本） | ✅ | 第三轮：增强模式标注信息接口，轨道/标签添加"示意"水印 |
| FR-SCALE-006 | 真实模式标签可屏幕空间增强但天体实体不放大 | packages/renderer-core/src/scale-mapping.ts:85-89（getLabelScreenScale 独立于 entityScale） | ✅ | 第三轮：标签屏幕空间倍率独立计算，实体保持真实尺寸 |

**小计**：✅×6 / 🟡×0 / ❌×0 / ⚠️×0

### 5. 相机与导航（FR-CAM，设计 7.5 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-CAM-001 | 支持轨道/自由飞行/跟随/地表低空四类相机 | packages/renderer-core/src/camera.ts:906（FollowController）+ 1067（SurfaceLowController） | ✅ | 第三轮：在原有 OrbitController + FlyController 基础上新增 FollowController（跟随目标天体）+ SurfaceLowController（地表低空环绕） |
| FR-CAM-002 | 目标切换生成安全平滑过渡路径 | packages/renderer-core/src/camera.ts:1253（CameraTransition 类） | ✅ | 第三轮：CameraTransition 类实现贝塞尔/样条插值的 flyTo 平滑过渡 |
| FR-CAM-003 | 相机速度随当前空间尺度自动变化 | packages/renderer-core/src/camera.ts:110（DEFAULT_SCALE_AWARE_CONFIG） | ✅ | 第三轮：尺度感知速度配置，依 ScaleManager 当前尺度动态调整 fly speed |
| FR-CAM-004 | 小天体近景自动降低速度和旋转灵敏度 | packages/renderer-core/src/camera.ts:126（computeSmallBodyFactor） | ✅ | 第三轮：依据目标天体半径调节灵敏度，近景减速 |
| FR-CAM-005 | 相机不得无提示穿入太阳/气态行星深层/禁入天体 | packages/renderer-core/src/camera.ts:1485（DynamicClipPlane 集成 clampCameraDistance） | ✅ | 第三轮：相机控制器集成碰撞防护，调用 SurfaceCameraImpl.clampCameraDistance 阻止穿入禁入区域 |
| FR-CAM-006 | 近远裁剪面根据局部参考系动态调整 | packages/renderer-core/src/camera.ts:1558（DynamicClipPlane 类） | ✅ | 第三轮：DynamicClipPlane 依 FloatingOrigin 距离动态设置 near/far |
| FR-CAM-007 | 一键返回母星/系统全景/太阳系全景 | packages/renderer-core/src/camera.ts:1581-1667（PresetViewManager: returnToHome/systemOverview/solarSystemPanorama） | ✅ | 第三轮：PresetViewManager 实现三个预设视角快捷入口 |
| FR-CAM-008 | 支持无界面纯净观赏 | packages/renderer-core/src/events-cruises.ts:682 | ✅ | PureViewingModeImpl 实现 |

**小计**：✅×8 / 🟡×0 / ❌×0 / ⚠️×0

### 6. 天体搜索与目录（FR-NAV，设计 7.6 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-NAV-001 | 中文名/英文名/编号/别名搜索 | packages/navigation-service/src/index.ts:197 | ✅ | search 支持 nameZh/nameEn/bodyId/aliases，matchType 区分 exact/prefix/alias/fuzzy |
| FR-NAV-002 | 拼音/拼音首字母/模糊搜索 | packages/navigation-service/src/index.ts:193 | ✅ | getPinyin 返回真实拼音（PINYIN_MAP 完整覆盖 60+ 天体），搜索去空格后命中 "mu xing"→"木星" |
| FR-NAV-003 | 按类型/系统/尺寸/轨道/资产等级筛选 | packages/navigation-service/src/index.ts（searchWithFilter + NavigationFilter + classifySize + classifyOrbitalRegion） | ✅ | 第四轮：新增 NavigationFilter 类型（types/systems/sizeClasses/orbitalRegions/assetTiers/parentBodyIds/radiusRange）+ searchWithFilter 方法；SizeClass 五档（giant/large/medium/small/tiny）+ OrbitalRegion 六类（inner/outer/dwarf/asteroid-belt/kuiper-belt/comet） |
| FR-NAV-004 | 展示太阳系/行星/卫星层级关系 | packages/navigation-service/src/index.ts:340 | ✅ | buildHierarchy() 递归构建层级树 |
| FR-NAV-005 | 卫星↔母星跳转 + 母星查看卫星列表 | packages/navigation-service/src/index.ts:376,387 | ✅ | jumpToParent + listSatellites 实现 |
| FR-NAV-006 | 轨道/标签批量显隐 | packages/navigation-service/src/index.ts:394,408 | ✅ | setOrbitsVisible + setLabelsVisible + 状态查询 |
| FR-NAV-007 | 目标方向指示 + 屏幕边缘箭头 | packages/navigation-service/src/index.ts:455 | ✅ | getScreenEdgeIndicator 实现 |
| FR-NAV-008 | 最近浏览仅当前内存会话，刷新清空 | packages/navigation-service/src/index.ts:167,427 | ✅ | recentlyViewed 为内存数组，未持久化 |

**小计**：✅×8 / 🟡×0 / ❌×0 / ⚠️×0

### 7. 天文事件（FR-EVENT，设计 7.7 节，8 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-EVENT-001 | 按时间范围和事件类型搜索 | packages/astro-core-api/src/astro-core-worker.ts:430；packages/astro-core-wasm/src/events.ts | ✅ | Worker event.search 委托 createDefaultEventEngine 调用 findEclipses/findConjunctions/findOppositions |
| FR-EVENT-002 | 日食/月食/凌日/掩星/合/冲/近日/远日点 | packages/astro-core-wasm/src/index.ts:85；packages/astro-core-wasm/src/events.ts | ✅ | events.js 已从 index.ts 导出；7 类事件 findXxx 函数完整 |
| FR-EVENT-003 | 主要卫星食和凌越 | crates/event-engine/src/satellite_events.rs（find_satellite_transits + find_satellite_eclipses） | ✅ | 第四轮：实现卫星凌越（角度分离求根）+ 卫星食（本影锥几何 + 垂直距离求根）求根；PositionEvaluator 闭包注入位置函数；3 个单元测试全部通过 |
| FR-EVENT-004 | 结果含开始/极大/结束/精度等级 | crates/event-engine/src/types.rs:50,72；packages/astro-core-api/src/index.ts:240-248 | ✅ | EventPhase(begin/maximum/end) + EventPrecision + AstroEvent 字段完整 |
| FR-EVENT-005 | 一键跳转极大时刻 + 推荐观察视角 | packages/renderer-core/src/events-cruises.ts:794；packages/astro-core-api/src/index.ts:259-280 | ✅ | jumpToEventMax 实现，返回 peak 时刻 + 推荐相机 |
| FR-EVENT-006 | 事件过程自动播放 | packages/renderer-core/src/events-cruises.ts:820 | ✅ | EventTimelinePlayer 类（startTimeline/tick/seekTo/stopTimeline）实现 |
| FR-EVENT-007 | 无法高精度对象显示预测/近似标签 | packages/astro-core-api/src/index.ts:248；packages/astro-core-api/src/astro-core-worker.ts:273-279 | ✅ | AstroEvent.is_approximate + EventUncertainty.notes_zh 已传递至前端 |
| FR-EVENT-008 | 事件计算不得依赖在线 API | packages/astro-core-wasm/src/events.ts | ✅ | 本地求根，无在线调用 |

**小计**：✅×8 / 🟡×0 / ❌×0 / ⚠️×0

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
| FR-TOUR-003 | 巡航配置为静态只读文件 | data/cruises/cruises.json | ✅ | 第三轮：巡航配置从源码抽离为 data/cruises/cruises.json 独立静态只读文件 |
| FR-TOUR-004 | 用户不得编辑或保存巡航 | 全仓库 grep 无巡航编辑 API | ✅ | 无编辑/保存功能，遵守约束 |
| FR-TOUR-005 | 退出后恢复到合理自由探索状态 | packages/tour-player/src/index.ts:225-236（exit() 调用 explorationProvider.restore(explorationSnapshot)） | ✅ | 第三轮：exit() 调用 explorationProvider.restore(explorationSnapshot) 恢复进入巡航前的相机/时间/尺度状态 |
| FR-TOUR-006 | 资源未安装时显示所需资源包 | packages/astro-core-api/src/astro-core-worker.ts:739-760（tour.validateResources 真实校验 ephemerisRegistry） | ✅ | 第三轮：tour.validateResources 接收 required_body_ids 参数，遍历检查 ephemerisRegistry 中是否存在，缺失返回 missing_packages 清单 |

**小计**：✅×6 / 🟡×0 / ❌×0 / ⚠️×0

### 11. 离线运行（FR-OFFLINE，设计 7.11 节，7 项）

| FR ID | 描述 | 实现位置 | 状态 | 备注 |
|---|---|---|---|---|
| FR-OFFLINE-001 | 断网后所有核心功能可运行 | assets-src/{bodies,effects,terrain}/；data-src/normalized/；release/ | ✅ | Task 4 完成：太阳/地球/月球/火星纹理与高程数据已填充；星历数据 + catalog 已生成；架构无在线依赖 |
| FR-OFFLINE-002 | 禁止在线字体/脚本/CDN | packages/server/src/server.ts:118 (CSP) | ✅ | CSP `default-src 'self'`；全仓库 grep 无 CDN 域名引用 |
| FR-OFFLINE-003 | 支持 localhost 本地服务运行 | packages/server/src/server.ts:410 | ✅ | createServer 默认 HTTP 模式 + Range/304/预压缩 |
| FR-OFFLINE-004 | 局域网影视级 WebGPU 部署支持 HTTPS 或可信安全上下文 | packages/server/src/server.ts:440 | ✅ | Task 11 完成：--tls-cert/--tls-key 启用 https.createServer；COOP/COEP/CORP 头已发送 |
| FR-OFFLINE-005 | 资源清单含版本/大小/哈希/依赖 | packages/renderer-core/src/productization.ts:239,327,380 | ✅ | Task 15 完成：calculateHash 用真实 SHA-256（crypto.createHash），不再 Math.random |
| FR-OFFLINE-006 | 支持资源包独立安装/校验/回滚 | packages/renderer-core/src/productization.ts（PackageInstallerImpl + createPackageInstaller） | ✅ | 第四轮：实现 PackageInstaller 状态机（pending→downloading→verifying→installing→installed/failed/rolled_back）；SHA-256 校验（crypto.subtle.digest）；支持 rollback 恢复 previousVersion；订阅机制通知状态变更 |
| FR-OFFLINE-007 | 不支持 file:// 打开 | packages/server/src/server.ts | ✅ | 需通过本地服务运行，file:// 直接打开无法加载 wasm/资源 |

**小计**：✅×7 / 🟡×0 / ❌×0 / ⚠️×0

## 按类别汇总

| 类别 | ✅ 完成 | 🟡 部分 | ❌ 缺失 | ⚠️ 错误 | 合计 |
|---|---|---|---|---|---|
| FR-BOOT | 6 | 0 | 0 | 0 | 6 |
| FR-TIME | 8 | 0 | 0 | 0 | 8 |
| FR-ASTRO | 8 | 0 | 0 | 0 | 8 |
| FR-SCALE | 6 | 0 | 0 | 0 | 6 |
| FR-CAM | 8 | 0 | 0 | 0 | 8 |
| FR-NAV | 8 | 0 | 0 | 0 | 8 |
| FR-EVENT | 8 | 0 | 0 | 0 | 8 |
| FR-SURFACE | 8 | 0 | 0 | 0 | 8 |
| FR-CONTENT | 7 | 0 | 0 | 0 | 7 |
| FR-TOUR | 6 | 0 | 0 | 0 | 6 |
| FR-OFFLINE | 7 | 0 | 0 | 0 | 7 |
| **合计** | **80** | **0** | **0** | **0** | **80** |

## 缺口与待办

> ✅ **全部 80 条 FR 已实现，无缺口。** 第三轮 + 第四轮共完成 21 条 FR 的实现（15 条第三轮 + 6 条第四轮），覆盖原 8 项 🟡 + 13 项 ❌ 全部缺口。

## 实现轮次汇总

### 第三轮（2026-07-20，15 条 FR）

| FR ID | 缺口类型 | 实现摘要 |
|---|---|---|
| FR-CAM-001 | 🟡→✅ | 新增 FollowController + SurfaceLowController，补全四类相机 |
| FR-CAM-002 | ❌→✅ | CameraTransition 类实现贝塞尔/样条平滑过渡 |
| FR-CAM-003 | ❌→✅ | DEFAULT_SCALE_AWARE_CONFIG 尺度感知速度 |
| FR-CAM-004 | ❌→✅ | computeSmallBodyFactor 近景减速 |
| FR-CAM-005 | ❌→✅ | DynamicClipPlane 集成 clampCameraDistance 碰撞防护 |
| FR-CAM-006 | ❌→✅ | DynamicClipPlane 动态近远裁剪面 |
| FR-CAM-007 | ❌→✅ | PresetViewManager 三个预设视角快捷入口 |
| FR-SCALE-001 | 🟡→✅ | ScaleMode='real' 真实比例模式 |
| FR-SCALE-002 | 🟡→✅ | ScaleMode='enhanced' 增强展示模式 |
| FR-SCALE-003 | ❌→✅ | ScaleConfig 拆分 distanceScale/radiusScale/satelliteScale |
| FR-SCALE-005 | ❌→✅ | EnhancedModeAnnotation "示意"水印 |
| FR-SCALE-006 | ❌→✅ | getLabelScreenScale 标签独立缩放 |
| FR-TOUR-003 | 🟡→✅ | 巡航配置抽离为 data/cruises/cruises.json |
| FR-TOUR-005 | ❌→✅ | exit() 调用 explorationProvider.restore 恢复探索状态 |
| FR-TOUR-006 | 🟡→✅ | tour.validateResources 真实校验 ephemerisRegistry |

### 第四轮（2026-07-20，6 条 FR）

| FR ID | 缺口类型 | 实现摘要 |
|---|---|---|
| FR-ASTRO-002 | 🟡→✅ | 扩展 KEPLER_FALLBACK 至 10 元组，新增 6 颗主要卫星（Io/Europa/Ganymede/Callisto/Titan/Triton），位置 = 母星日心位置 + 卫星相对母星位置 |
| FR-ASTRO-003 | ❌→✅ | crates/ephemeris-runtime/src/mean_elements.rs 实现 MeanElementsProvider（Kepler 方程牛顿迭代 + 3 轴旋转），精度标记 P1 |
| FR-EVENT-003 | ❌→✅ | crates/event-engine/src/satellite_events.rs 实现卫星凌越（角度分离求根）+ 卫星食（本影锥几何 + 垂直距离求根） |
| FR-OFFLINE-006 | ❌→✅ | packages/renderer-core/src/productization.ts 实现 PackageInstallerImpl 状态机 + SHA-256 校验 + rollback |
| FR-NAV-003 | 🟡→✅ | packages/navigation-service/src/index.ts 新增 NavigationFilter + searchWithFilter + classifySize + classifyOrbitalRegion |
| FR-TIME-006 | 🟡→✅ | packages/astro-core-api/src/astro-core-worker.ts 新增 pushClockBoundary + pushStateSnapshot，时钟变更后推送真实 BodyState 快照 |

## 更新日志

| 日期 | 版本 | 变更摘要 |
|---|---|---|
| 2026-07-18 | v1.0 | 首版矩阵：基于 task13-fr-checklist v1.1 + Task 1-17 修复成果合并；80 条 FR 全量核对；⚠️=0 已达标；列出 21 项 🟡/❌ 缺口与补救建议 |
| 2026-07-20 | v2.0 | 第三轮 FR 实现：完成 15 条 FR（FR-CAM-001~007 + FR-SCALE-001/002/003/005/006 + FR-TOUR-003/005/006）；✅ 59→74、🟡 8→3、❌ 13→3 |
| 2026-07-20 | v3.0 | 第四轮 FR 实现：完成剩余 6 条 FR（FR-ASTRO-002/003 + FR-EVENT-003 + FR-OFFLINE-006 + FR-NAV-003 + FR-TIME-006）；✅ 74→80、🟡 3→0、❌ 3→