# Task 13 — 功能性需求(FR)逐项核对表

> 本片段对照设计文档第 7 节（`docs/Web3D影视级太阳系项目完整设计文档.md` 行 323-458）的全部 80 条功能性需求，逐项核对 `/workspace` 仓库实现状态。
>
> **状态图例**：✅ 完成（功能完整且正确）/ 🟡 部分（有框架但功能不全）/ ❌ 缺失（完全缺失）/ ⚠️ 错误（有实现但实现错误）
>
> **证据格式**：`相对仓库根路径:行号`，凡标注"未找到实现"表示在仓库中未检索到对应代码。
>
> **覆盖范围**：FR-BOOT(6) + FR-TIME(8) + FR-ASTRO(8) + FR-SCALE(6) + FR-CAM(8) + FR-NAV(8) + FR-EVENT(8) + FR-SURFACE(8) + FR-CONTENT(7) + FR-TOUR(6) + FR-OFFLINE(7) = **80 条**。

---

## 1. FR-BOOT 启动与能力检测（设计 7.1 节，行 329-334）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-BOOT-001 | 启动检测浏览器/OS/WebGPU/WebGL2/纹理压缩/最大纹理尺寸/GPU 限制 | ✅ | `packages/diagnostics/src/index.ts:98,116,132,174,198,215,227` | 检测函数齐全（detectBrowser/detectOs/detectWebgpu/detectWebgl2/detectTextureCompression/detectMemory/detectCapabilities），覆盖全部检测维度 | 已满足；如需补充"最大纹理尺寸"独立探测可扩展 detectMemory | 启动应用查看 `detectCapabilities()` 返回对象字段完整性 |
| FR-BOOT-002 | 短时基准测试 + 推荐画质 | ✅ | `packages/diagnostics/src/index.ts:252,287` | runBenchmark 返回 GPU/CPU 时间与帧率，recommendQuality 据此给推荐画质 | 已满足 | 调用 `runBenchmark()` 后校验返回 BenchmarkResult 含 gpuTime/cpuTime/fps |
| FR-BOOT-003 | WebGPU 不可用自动转 WebGL2 标准模式 | ✅ | `packages/diagnostics/src/index.ts:295` | recommendBackend 实现降级逻辑 | 已满足 | 模拟无 WebGPU 环境校验 recommendBackend 返回 'webgl2-standard' |
| FR-BOOT-004 | 资源缺失/校验失败显示缺失包和路径 | 🟡 | `packages/diagnostics/src/index.ts:301` | validateResources 框架存在，但启动流程 `apps/web/src/App.tsx` 为 setTimeout 模拟，未真实调用 validateResources 并展示缺失清单 | 在 App.tsx 启动流程接入 validateResources，缺失时渲染缺失包/路径 UI | 断开资源包后启动，校验是否显示缺失资源清单 |
| FR-BOOT-005 | 分阶段进度：核心程序/星历/基础天体/当前目标资产 | 🟡 | `apps/web/src/App.tsx:18-21`；`apps/web/src/components/BootProgress.tsx` | BOOT_PHASES 定义 4 阶段（核心程序/星历/基础天体/目标资产），但 `App.tsx:46` 用 `setTimeout(r, 30)` 模拟推进，非真实加载驱动 | 将 4 阶段绑定真实资源加载回调（WASM/星历/天体资产） | 启动时观察进度条是否随真实加载推进而非定时器 |
| FR-BOOT-006 | 不读取或写入浏览器持久化偏好 | ✅ | 全局未发现 localStorage/IndexedDB 偏好读写；diagnostics 不读取偏好 | 遵守约束 | 已满足 | 全仓库 grep `localStorage`/`indexedDB` 确认无偏好读写 |

**小计**：✅×4 / 🟡×2 / ❌×0 / ⚠️×0

---

## 2. FR-TIME 时间模拟（设计 7.2 节，行 340-347）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-TIME-001 | 支持系统当前 UTC 时间同步 | 🟡 | `crates/time-system/src/time.rs:14`；`packages/astro-core-api/src/astro-core-worker.ts` clock.setUtc 为 stub | Rust 内核 TimeConverter 支持 UTC，但 Worker 的 clock 控制消息（setUtc/pause/resume/step）均返回 null，主线程未接入"同步系统当前时间" | 在 astro-core-worker.ts 实现 clock.setUtc，App 启动时调用 `Date.now()` 同步 | 启动后校验模拟时间是否等于当前真实 UTC |
| FR-TIME-002 | 支持 1900-2100 年任意日期 | ✅ | `crates/time-system/src/time.rs:14` | TIME_RANGE_MJD_UTC = (15020.0, 88128.999988) 覆盖 1900-2100 | 已满足 | 构造 1900-01-01 与 2100-12-31 MJD 校验 check_range 通过 |
| FR-TIME-003 | 支持暂停/继续/正向/反向/单步 | ❌ | 未找到实现（worker clock 控制全为 stub 返回 null） | Rust 内核与 Worker 均无播放控制状态机 | 在 time-system 增加 ClockController（paused/direction/step），Worker 暴露 pause/resume/reverse/step API | 调用 pause 后校验状态不再推进；reverse 后时间倒流 |
| FR-TIME-004 | 多级倍率（秒/分/时/日/月/年） | ❌ | 未找到实现 | 无倍率枚举与换算逻辑 | 定义 TimeRate 单位枚举并在 Worker 暴露 setRate | 设置 1年/秒倍率校验单帧推进约 365 天 |
| FR-TIME-005 | 高倍率按目标时刻直接计算，不用帧累计 | ✅ | `crates/astro-core/src/lib.rs:106` evaluate_state 接收 tdb 直接求值 | 架构支持按目标时刻计算 | 已满足 | 大倍率下校验天体位置与直接求值一致 |
| FR-TIME-006 | 时间变化后所有天体位置/自转/阴影/事件同步更新 | 🟡 | `packages/astro-core-api/src/astro-core-client.ts:266` subscribeSnapshot；`astro-core-worker.ts` snapshot 流未推送真实数据 | 订阅框架存在，但 Worker 的 snapshot 流式消息未填充真实快照数据（client.ts:160-163 注释"实际快照应由 WASM 序列化"） | Worker 在每帧/低频推送真实 CelestialStateSnapshot | 订阅快照后校验收到非空 BodyState |
| FR-TIME-007 | 超范围阻止继续并说明高精度范围边界 | ✅ | `crates/time-system/src/time.rs:68` check_range；`crates/ephemeris-runtime/src/provider.rs` EphemerisQuery::OutOfRange | 超范围返回错误而非伪高精度 | 已满足 | 构造 1899 年 MJD 校验 check_range 返回 Err |
| FR-TIME-008 | 未来闰秒预测策略 + 不确定性说明 | ✅ | `crates/time-system/src/leap_seconds.rs` OFFICIAL_LEAP_SECONDS + is_predicted + DATA_BASELINE_MJD_UTC=61237；`time.rs:29` TimeUncertainty | 含官方闰秒表(至 2017)、基线日期标记、is_predicted 字段、TimeUncertainty 结构 | 已满足 | 查询 2027 年闰秒校验 is_predicted=true |

**小计**：✅×4 / 🟡×2 / ❌×2 / ⚠️×0

---

## 3. FR-ASTRO 天体模拟（设计 7.3 节，行 353-360）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-ASTRO-001 | 太阳/八大行星/月球高精度星历 | 🟡 | `crates/ephemeris-runtime/src/provider.rs` Precision P0-P4；`data-src/` 全空 | 框架支持切比雪夫插值与精度等级，但 `data-src/raw|normalized` 仅有 .gitkeep，无实际 SPK 数据 | 用 `tools/ephemeris-pipeline` 生成星历二进制并随离线包分发 | 启动后求值地球状态校验非 OutOfRange |
| FR-ASTRO-002 | 主要卫星优先高精度卫星星历 | 🟡 | 同上 provider.rs | 框架在但无卫星星历数据 | 同上，优先覆盖木卫/土卫等主要卫星 | 求值木卫一校验有数据 |
| FR-ASTRO-003 | 其他卫星用星历/数值拟合/平均轨道根数 | ❌ | 未找到实现 | 无平均轨道根数计算与降级链路 | 在 ephemeris-runtime 增加 MeanElementsProvider | 求值小卫星校验返回 P0/P1 精度 |
| FR-ASTRO-004 | 平均轨道根数不得标为高精度 | ✅ | `crates/ephemeris-runtime/src/provider.rs` EphemerisQuery::OutOfRange + Precision 枚举区分 | 超范围不返回伪高精度，精度等级显式 | 已满足 | 强制查询超范围校验返回 OutOfRange 而非 P4 |
| FR-ASTRO-005 | 状态含位置/速度/姿态/角速度/精度等级 | ✅ | `crates/astro-core/src/snapshot.rs:33-46` | BodyState 字段齐全（position/velocity/orientation/angular_velocity/illumination/precision/flags） | 已满足 | 检查 BodyState 结构体字段完整性 |
| FR-ASTRO-006 | 轨道线通过指定时间区间采样生成 | 🟡 | `crates/astro-core/src/lib.rs:106-125` | sample_orbit 实现存在，但 `while t <= t_end_utc { t += base_step_days }` 为固定步长，与设计 14.4"自适应步长"不符 | 改为基于曲率/速度的自适应步长采样 | 对比固定 vs 自适应采样点数与拟合误差 |
| FR-ASTRO-007 | 唯一稳定标识，不依赖显示名 | ✅ | `crates/astro-core/src/catalog.rs` BodyRecord body_id | 使用数值 body_id 作为唯一键 | 已满足 | 校验同名天体不冲突，id 稳定 |
| FR-ASTRO-008 | 目录随离线包更新不改引擎代码 | 🟡 | `crates/astro-core/src/catalog.rs` Catalog 可加载；`data-src/` 空 | 数据驱动架构存在，但无离线数据包与版本化目录 | 生成 catalog 数据文件并随 release/manifests 分发 | 替换目录文件后不重新编译即可见新天体 |

**小计**：✅×3 / 🟡×4 / ❌×1 / ⚠️×0

---

## 4. FR-SCALE 尺度与显示（设计 7.4 节，行 366-371）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-SCALE-001 | 提供真实比例模式 | 🟡 | `packages/renderer-core/src/scale-mapping.ts:161` ScaleManager | ScaleManager 框架存在，但无"真实比例 vs 增强展示"显式模式切换 API | 在 ScaleManager 增加 mode: 'real'|'enhanced' 切换 | 切换至 real 模式校验 scaleFactor=1 |
| FR-SCALE-002 | 提供增强展示模式 | 🟡 | 同上 | 同上，无增强模式独立配置 | 同上 | 切换至 enhanced 校验距离/半径放大 |
| FR-SCALE-003 | 分别显示距离/半径/卫星系统倍率 | ❌ | `packages/renderer-core/src/scale-mapping.ts:15,38,102` | 仅单一 `scaleFactor: number`，未分离 distanceScale/radiusScale/satelliteScale 三类倍率 | 拆分为三类独立倍率并在 UI 分别显示 | 检查 UI 是否独立显示三类倍率数值 |
| FR-SCALE-004 | 尺度切换平滑过渡，无突变 | ✅ | `packages/renderer-core/src/scale-mapping.ts:80,148` | `currentScale = currentScale * 0.9 + targetScale * 0.1` 实现插值平滑 | 已满足 | 切换尺度校验无瞬时跳变 |
| FR-SCALE-005 | 增强模式下轨道/标签不得造成真实数据误读 | ❌ | 未找到实现 | 无"增强标注"机制防止数据误读 | 在增强模式对轨道/标签添加"示意"水印 | 检查增强模式轨道线是否标注示意 |
| FR-SCALE-006 | 真实模式标签可屏幕空间增强但天体实体不放大 | ❌ | 未找到实现 | 无标签屏幕空间增强与实体尺寸分离逻辑 | 实现标签独立缩放，实体保持真实尺寸 | 真实模式下校验天体半径不随距离放大 |

**小计**：✅×1 / 🟡×2 / ❌×3 / ⚠️×0

---

## 5. FR-CAM 相机与导航（设计 7.5 节，行 377-384）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-CAM-001 | 支持轨道/自由飞行/跟随/地表低空四类相机 | 🟡 | `packages/renderer-core/src/camera.ts:427,558` | 仅 OrbitController + FlyController 两类，缺 follow（目标跟随）与 surface-low（地表低空）模式 | 新增 FollowController 与 SurfaceLowController | 切换四类模式校验均可生效 |
| FR-CAM-002 | 目标切换生成安全平滑过渡路径 | ❌ | 未找到实现 | 无过渡路径生成与插值 | 在 camera.ts 增加 flyTo(target) 贝塞尔/样条插值 | 切换目标校验相机平滑飞行而非瞬移 |
| FR-CAM-003 | 相机速度随当前空间尺度自动变化 | ❌ | 未找到实现 | 无尺度感知的速度调节 | 依 ScaleManager 当前尺度动态调整 fly speed | 缩放至不同尺度校验速度档位变化 |
| FR-CAM-004 | 小天体近景自动降低速度和旋转灵敏度 | ❌ | 未找到实现 | 无近景减速逻辑 | 依据目标天体半径调节灵敏度 | 近景小天体校验操作变慢 |
| FR-CAM-005 | 相机不得无提示穿入太阳/气态行星深层/禁入天体 | ❌ | 未找到实现 | 无碰撞防护 | 增加最小距离约束与阻挡反馈 | 推向太阳校验被阻挡并提示 |
| FR-CAM-006 | 近远裁剪面根据局部参考系动态调整 | ❌ | 未找到实现 | 无动态裁剪面 | 依 FloatingOrigin 距离动态设置 near/far | 大尺度切换校验无 z-fighting 与裁剪丢失 |
| FR-CAM-007 | 一键返回母星/系统全景/太阳系全景 | ❌ | 未找到实现 | 无预设视角快捷入口 | 增加三键快捷视角 | 点击返回母星校验相机归位 |
| FR-CAM-008 | 支持无界面纯净观赏 | ✅ | `packages/renderer-core/src/events-cruises.ts:635` PureViewingModeImpl | 纯净模式实现 | 已满足 | 进入纯净模式校验 UI 隐藏 |

**小计**：✅×1 / 🟡×1 / ❌×6 / ⚠️×0

---

## 6. FR-NAV 天体搜索与目录（设计 7.6 节，行 390-397）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-NAV-001 | 中文名/英文名/编号/别名搜索 | 🟡 | `packages/navigation-service/src/index.ts:175` | search 支持名称匹配，但别名字段与编号搜索覆盖不全 | 扩展 BodyEntry.aliases 与 bodyId 数字搜索 | 输入别名/编号校验命中 |
| FR-NAV-002 | 拼音/拼音首字母/模糊搜索 | ⚠️ | `packages/navigation-service/src/index.ts:182-183` | getPinyin 实现错误：`return PINYIN_MAP[chineseName] ? chineseName : chineseName`——无论是否命中均返回中文本身，未做真正拼音转换 | 引入拼音库或完整 PINYIN_MAP，返回真实拼音串 | 搜索"mu xing"校验命中"木星" |
| FR-NAV-003 | 按类型/系统/尺寸/轨道/资产等级筛选 | 🟡 | `packages/navigation-service/src/index.ts:65` SOLAR_SYSTEM_BODIES | search 有 filter 参数，但 `SOLAR_SYSTEM_BODIES` 仅 35 颗天体，远少于设计 290+ 已命名卫星 | 扩充目录至全部已命名卫星并补全筛选字段 | 按类型筛选校验结果分类正确 |
| FR-NAV-004 | 展示太阳系/行星/卫星层级关系 | 🟡 | `packages/navigation-service/src/index.ts:65` BodyEntry.parentId | 有 parentId 但无层级树构建 API | 增加 buildHierarchy() 返回树结构 | 校验层级树含系统→行星→卫星三层 |
| FR-NAV-005 | 卫星↔母星跳转 + 母星查看卫星列表 | 🟡 | 同上 parentId | 数据有 parent 关系，但无显式 jumpToParent/listSatellites API | 增加跳转与卫星列表 API | 从月球跳转地球校验生效 |
| FR-NAV-006 | 轨道/标签批量显隐 | ❌ | 未找到实现 | NavigationService 无批量显隐 API | 增加 setOrbitsVisible/setLabelsVisible 批量接口 | 批量隐藏轨道校验场景中无轨道线 |
| FR-NAV-007 | 目标方向指示 + 屏幕边缘箭头 | ✅ | `packages/navigation-service/src/index.ts:38,338` getScreenEdgeIndicator | 屏幕边缘指示实现 | 已满足 | 目标在视锥外校验边缘箭头出现 |
| FR-NAV-008 | 最近浏览仅当前内存会话，刷新清空 | ✅ | `packages/navigation-service/src/index.ts:162,316` recentlyViewed | recentlyViewed 为内存数组，未持久化，刷新即清空 | 已满足 | 刷新页面校验最近浏览为空 |

**小计**：✅×2 / 🟡×4 / ❌×1 / ⚠️×1

---

## 7. FR-EVENT 天文事件（设计 7.7 节，行 403-410）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-EVENT-001 | 按时间范围和事件类型搜索 | 🟡 | `packages/renderer-core/src/events-cruises.ts:353,361`；`packages/astro-core-api/src/astro-core-worker.ts:128-129` | EventsServiceImpl.search 仅对 8 个硬编码样本做内存过滤；Worker 的 event.search 直接返回 `result: []` | Worker 接入真实求根（events.ts 已有但未导出） | 搜索 2024 日食校验返回真实事件 |
| FR-EVENT-002 | 日食/月食/凌日/掩星/合/冲/近日/远日点 | 🟡 | `packages/astro-core-wasm/src/events.ts` findEclipses/findConjunctions/findOppositions/findOrbitalExtrema；`packages/astro-core-wasm/src/index.ts:82-84` | events.ts 含真实求根实现，但 index.ts 仅导出 time/reference-frame/ephemeris，**未导出 events.js**，导致被孤立 | 在 index.ts 增加 `export * from './events.js'` | 检查 events 模块可从主入口导入 |
| FR-EVENT-003 | 主要卫星食和凌越 | ❌ | `crates/event-engine/src/types.rs` 有 SatelliteTransit/SatelliteEclipse 类型；无求根实现 | 类型定义在但 event-engine 无任何求根逻辑（lib.rs 仅导出） | 在 event-engine 实现卫星食/凌求根 | 搜索木卫食校验返回事件 |
| FR-EVENT-004 | 结果含开始/极大/结束/精度等级 | ✅ | `crates/event-engine/src/types.rs` EventRecord + EventPhase(begin/maximum/end) + EventPrecision | 事件结构含完整阶段与精度 | 已满足 | 检查 EventRecord 字段完整性 |
| FR-EVENT-005 | 一键跳转极大时刻 + 推荐观察视角 | ❌ | 未找到实现 | 无事件跳转与推荐视角 | 增加jumpToEventMax与推荐相机位 | 点击事件校验时间/相机跳转 |
| FR-EVENT-006 | 事件过程自动播放 | ❌ | 未找到实现 | 无事件播放器 | 增加事件时间轴自动推进 | 触发播放校验时间推进至结束 |
| FR-EVENT-007 | 无法高精度对象显示预测/近似标签 | ❌ | `crates/time-system/src/time.rs:29` TimeUncertainty 有 predicted；事件层无 | 时间层有不确定性标记，但事件层未传递/显示 | 事件结果携带 predicted/approximate 标签 | 查询远期事件校验显示"预测"标签 |
| FR-EVENT-008 | 事件计算不得依赖在线 API | ✅ | `packages/astro-core-wasm/src/events.ts` 本地求根 | 架构上本地计算，无在线调用 | 已满足（前提是 events.ts 被正确接入） | 断网后校验事件搜索可用 |

**小计**：✅×2 / 🟡×2 / ❌×4 / ⚠️×0

---

## 8. FR-SURFACE 星体近景和地表（设计 7.8 节，行 416-423）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-SURFACE-001 | 地球/月球/火星全球连续地形覆盖 | ⚠️ | `packages/renderer-core/src/terrain.ts:291-298` | getFaceBounds 的 face 4 与 face 5 边界完全重叠（`4: new TileBoundsImpl(-90,0,-180,180)` 与 `5: new TileBoundsImpl(-90,0,-180,180)`），Cube-Sphere 六面应分别覆盖不同经纬区，导致全球覆盖有缺口/重叠 | 修正 face 4/5 的 bounds 为正确区间 | 校验六面 bounds 互不重叠且并集为全球 |
| FR-SURFACE-002 | 太空到低空连续 LOD | ⚠️ | `packages/renderer-core/src/terrain.ts:313` | LOD 用距离阈值 `distance < 500000 && node.level < maxLevel`，非设计要求的屏幕空间误差(SSE) | 改为基于屏幕空间误差的细分判定 | 缩放校验 LOD 细分随视距连续变化 |
| FR-SURFACE-003 | 瓦片缺失用低一级，不显示空洞 | ❌ | 未找到实现 | 无 fallback 到父瓦片机制 | TerrainLODController 增加 fallback 渲染父瓦片 | 缺失瓦片时校验无空洞 |
| FR-SURFACE-004 | 瓦片边界无明显裂缝 | ❌ | 未找到实现 | 无 skirt/边缘缝合处理 | 增加 skirt 几何或顶点缝合 | 近景校验瓦片边界无缝隙 |
| FR-SURFACE-005 | 地球不含真实建筑/道路/植被三维重建 | ✅ | `packages/body-renderers/src/index.ts`；`assets-src/bodies` 空 | 无此类资产，遵守约束 | 已满足 | 检查地球渲染无建筑/道路模型 |
| FR-SURFACE-006 | 气态行星仅允许进入高层大气可视区域 | ❌ | 未找到实现 | 无气态行星进入限制 | 增加气态行星高层大气边界约束 | 推入木星校验被高层大气阻挡 |
| FR-SURFACE-007 | 太阳设置最小安全距离 | ❌ | 未找到实现 | 无太阳最小距离约束 | 增加太阳最小安全距离 | 推向太阳校验在安全距离停止 |
| FR-SURFACE-008 | 代表性小行星/彗星支持超近景环绕 | ❌ | 未找到实现 | 无小天体近景渲染 | 增加小行星/彗星近景 renderer | 近景小行星校验可环绕观察 |

**小计**：✅×1 / 🟡×0 / ❌×5 / ⚠️×2

---

## 9. FR-CONTENT 科普内容（设计 7.9 节，行 429-435）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-CONTENT-001 | 每天体含名称/类型/尺寸/质量/轨道周期/自转周期 | ✅ | `packages/content-service/src/index.ts:58` DEFAULT_CONTENT_DATA | 10 颗天体均含 basicParams | 已满足（10 颗天体） | 检查 basicParams 字段完整性 |
| FR-CONTENT-002 | S/A 级含结构/大气/地貌/发现/科学章节 | 🟡 | `packages/content-service/src/index.ts:58` | 仅 S 级 10 颗天体含 sections（结构/大气/地貌/发现/科学），缺 A 级天体内容 | 补充 A 级天体（主要卫星）的章节内容 | 查询木卫一校验有完整章节 |
| FR-CONTENT-003 | 内容使用简体中文 | ✅ | `packages/content-service/src/index.ts:58` | 内容为中文 | 已满足 | 检查字段值为简体中文 |
| FR-CONTENT-004 | 数据卡片显示数据来源和精度等级 | ✅ | `packages/content-service/src/index.ts` sources + precision 字段 | 含来源与精度 | 已满足 | 检查 ContentCard 含 sources/precision |
| FR-CONTENT-005 | 程序化外观显示"示意外观"说明 | 🟡 | `packages/content-service/src/index.ts:32` proceduralAppearanceNote 字段 | 字段存在但未填充内容 | 为程序化天体填充 proceduralAppearanceNote | 查询程序化天体校验显示"示意外观" |
| FR-CONTENT-006 | 科普内容以静态数据随版本发布 | 🟡 | `packages/content-service/src/index.ts:58` DEFAULT_CONTENT_DATA 硬编码 | 内容硬编码在源码中，非独立版本化静态文件 | 抽离为 `data/content/*.json` 随版本发布 | 检查存在独立静态内容文件 |
| FR-CONTENT-007 | 不提供评论/收藏/学习记录/内容编辑 | ✅ | 未找到实现 | 无此类用户功能，遵守约束 | 已满足 | 全仓库 grep 无评论/收藏 API |

**小计**：✅×4 / 🟡×3 / ❌×0 / ⚠️×0

---

## 10. FR-TOUR 预制巡航（设计 7.10 节，行 441-446）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-TOUR-001 | 支持播放/暂停/跳转/退出 | 🟡 | `packages/renderer-core/src/events-cruises.ts:530` CruiseServiceImpl；`packages/tour-player/src/index.ts` 仅 2 行 placeholder | renderer-core 有 CruiseServiceImpl（含 update 计时），但 `tour-player` 包完全空实现，未集成播放控制 | 在 tour-player 实现完整播放控制器 | 调用 play/pause/seek/exit 校验状态变化 |
| FR-TOUR-002 | 同步控制相机/时间/尺度/图层/目标 | ❌ | `packages/renderer-core/src/events-cruises.ts` CruiseWaypoint 仅 5 字段(bodyId/name/position/duration/pauseDuration) | CruiseWaypoint 缺相机/时间/尺度/图层控制字段，update 仅累计 elapsedTime | 扩展 CruiseWaypoint 至设计 26.1 的 10+ 字段 | 播放巡航校验多维度同步变化 |
| FR-TOUR-003 | 巡航配置为静态只读文件 | 🟡 | `packages/renderer-core/src/events-cruises.ts:94` CRUISES 硬编码 | 20 条巡航硬编码在源码，非独立静态文件 | 抽离为 `data/cruises/*.json` 只读文件 | 检查存在独立巡航配置文件 |
| FR-TOUR-004 | 用户不得编辑或保存巡航 | ✅ | 未找到实现 | 无编辑/保存功能，遵守约束 | 已满足 | 全仓库 grep 无巡航编辑 API |
| FR-TOUR-005 | 退出后恢复到合理自由探索状态 | ❌ | 未找到实现 | 无退出恢复逻辑 | 增加 exit 时保存/恢复探索状态 | 退出巡航校验回到自由探索 |
| FR-TOUR-006 | 资源未安装时显示所需资源包 | 🟡 | `packages/astro-core-api/src/astro-core-worker.ts:143-144` | Worker tour.load 返回 TOUR_RESOURCES_MISSING 错误，但前端未展示所需资源包清单 | 前端捕获错误并渲染所需资源包 UI | 未安装资源时点击巡航校验显示资源包 |

**小计**：✅×1 / 🟡×3 / ❌×2 / ⚠️×0

---

## 11. FR-OFFLINE 离线运行（设计 7.11 节，行 452-458）

| FR 编号 | 需求摘要 | 状态 | 证据 | 缺口说明 | 补足方向 | 验证方法 |
|---|---|---|---|---|---|---|
| FR-OFFLINE-001 | 断网后所有核心功能可运行 | 🟡 | 架构无在线依赖；`data-src/`、`assets-src/`、`release/` 全空 | 架构上可离线，但资源/数据全空，无实际可运行的离线包 | 生成完整离线资源包并验证 | 断网启动校验核心功能可用 |
| FR-OFFLINE-002 | 禁止在线字体/脚本/CDN | ✅ | 未发现 CDN/在线字体引用 | 遵守约束 | 已满足 | 全仓库 grep 无 CDN 域名引用 |
| FR-OFFLINE-003 | 支持 localhost 本地服务运行 | ✅ | `packages/server/src/server.ts:68` http.createServer | 提供静态服务 + Range 请求 | 已满足 | `node server` 后 localhost 可访问 |
| FR-OFFLINE-004 | 局域网影视级 WebGPU 部署支持 HTTPS 或可信安全上下文 | ❌ | `packages/server/src/server.ts:68` 仅 http.createServer | 无 HTTPS 实现，无 COOP/COEP 头（WebGPU 需安全上下文） | 增加 HTTPS 模式与 COOP/COEP/CORP 头 | 局域网访问校验为 HTTPS 且 WebGPU 可用 |
| FR-OFFLINE-005 | 资源清单含版本/大小/哈希/依赖 | ❌ | `packages/renderer-core/src/productization.ts:224,230,237`；`packages/resource-runtime/src/index.ts` | resource-runtime 有 ResourceManager 框架，但 productization.ts 用 `Math.random()` 生成 hash/size/校验结果，无真实清单 | 用真实哈希(SHA-256)与文件大小生成 manifest | 检查 manifest 含真实哈希而非随机串 |
| FR-OFFLINE-006 | 支持资源包独立安装/校验/回滚 | ❌ | 未找到实现 | 无安装/校验/回滚流程 | 实现资源包安装器与版本回滚 | 安装新包后校验可回滚至旧版 |
| FR-OFFLINE-007 | 不支持 file:// 打开 | ✅ | `packages/server/src/server.ts` 需 server 运行 | 需通过本地服务运行 | 已满足 | file:// 打开校验提示需启动服务 |

**小计**：✅×3 / 🟡×1 / ❌×3 / ⚠️×0

---

## 汇总统计

| 类别 | ✅ 完成 | 🟡 部分 | ❌ 缺失 | ⚠️ 错误 | 合计 |
|---|---|---|---|---|---|
| FR-BOOT | 4 | 2 | 0 | 0 | 6 |
| FR-TIME | 4 | 2 | 2 | 0 | 8 |
| FR-ASTRO | 3 | 4 | 1 | 0 | 8 |
| FR-SCALE | 1 | 2 | 3 | 0 | 6 |
| FR-CAM | 1 | 1 | 6 | 0 | 8 |
| FR-NAV | 2 | 4 | 1 | 1 | 8 |
| FR-EVENT | 2 | 2 | 4 | 0 | 8 |
| FR-SURFACE | 1 | 0 | 5 | 2 | 8 |
| FR-CONTENT | 4 | 3 | 0 | 0 | 7 |
| FR-TOUR | 1 | 3 | 2 | 0 | 6 |
| FR-OFFLINE | 3 | 1 | 3 | 0 | 7 |
| **合计** | **26** | **24** | **27** | **3** | **80** |

**整体完成率**：✅ 完成 26/80 = 32.5%；🟡 部分 24/80 = 30.0%；❌ 缺失 27/80 = 33.75%；⚠️ 错误 3/80 = 3.75%。

**关键风险点（⚠️ 错误项）**：
1. **FR-NAV-002** 拼音搜索逻辑错误（`navigation-service/src/index.ts:183` 返回中文本身）
2. **FR-SURFACE-001** Cube-Sphere face 4/5 边界重叠（`terrain.ts:297-298`）
3. **FR-SURFACE-002** LOD 用距离阈值而非屏幕空间误差（`terrain.ts:313`）

**最严重缺口集群**：
- FR-CAM（6/8 缺失）：相机系统大量功能未实现
- FR-SURFACE（5/8 缺失 + 2 错误）：地形系统实质未达成
- FR-EVENT（4/8 缺失）：事件求根被孤立未接入
- FR-SCALE（3/6 缺失）：尺度模式切换未实现
