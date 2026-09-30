# 太阳系真实 3D 导览 — 设计符合性与端到端验收测试报告

| 项目 | 内容 |
| --- | --- |
| 被测系统 | `solarsystem/`（Solar System Explorer v1.0.0，catalog `v20260929`） |
| 依据文档 | `docs/master_prompt.md`（2608 行，76 节）+ `docs/design_prompt.png`（界面设计图） |
| 测试类型 | 静态代码审计 + 真实浏览器端到端（E2E）验收 + 项目自带科学验证 |
| 测试日期 | 2026-09-30 |
| 结论 | **核心天文/时间/搜索/标签实现真实可靠；但存在 4 项 P0 级缺陷，其中「行星贴图全部加载失败」与「坐标系不一致导致光照/自转轴错误」直接影响科学可信度与视觉呈现，不满足设计文档 §13/§14/§15/§16/§21 的验收要求。当前状态不建议直接用于正式展览。** |

---

## 1. 执行摘要

### 1.1 结果统计

| 层级 | 用例数 | 通过 | 警告 | 失败 |
| --- | --- | --- | --- | --- |
| 工程自动化门禁（typecheck / 单测 / 科学验证 / 生产构建） | 4 | 4 | 0 | 0 |
| E2E 套件 1：启动·目录·时间·尺度 | 28 | 22 | 4 | 2 |
| E2E 套件 2：渲染·坐标系·科学保真 | 16 | 8 | 1 | 7 |
| E2E 套件 3：交互·信息面板·相机·导览 | 24 | 18 | 1 | 5 |
| E2E 套件 4：健壮性·降级·离线·生产 | 9 | 7 | 1 | 1 |
| E2E 套件 5：触摸·大屏·性能·无障碍·多语言·设计图 | 21 | 15 | 3 | 3 |
| E2E 套件 6：§61 十个验收场景 | 11 | 10 | 0 | 1 |
| E2E 套件 7：修正方法后的复核 | 3 | 2 | 0 | 1 |
| **合计** | **112** | **82** | **10** | **20** |

> 说明：套件 2 首轮中 S2-08（恒星层挂载）与 S2-11（LOD 分级）为**测试方法缺陷导致的误报**，套件 7 用修正方法复核后转为通过。因此真实缺陷观测为 **18 项**，去重归并为 **23 个缺陷条目**：**4 个 P0（阻断）**、**4 个 P1（高）**、**15 个 P2（中）**。

### 1.2 关键发现（按严重度）

| 编号 | 严重度 | 缺陷 | 影响章节 |
| --- | --- | --- | --- |
| P0-1 | 阻断 | 行星表面贴图**全部**加载失败（请求路径缺 `data/` 前缀），且信息面板未披露"程序化贴图" | §5 §14 §15 §16 §40 §56 §72 |
| P0-2 | 阻断 | 渲染空间为黄道基，而光照方向/星空被旋入 Y-up 场景基 → 太阳方向与几何相差 2.2°–88.1° | §10 §11 §13 §14 §21 §43 |
| P0-3 | 阻断 | 天体姿态基变换写成矩阵共轭 → 自转轴随自转相位漂移（12 h 内 45°–180°），行星环平面翻转 | §14 §15 §16 |
| P0-4 | 阻断 | 默认状态下选中"未开启层"的小天体 → 位置 (0,0,0)、距日 0 km、速度 515 194 km/s（编造数据） | §24 §26 §50 §62 |
| P1-1 | 高 | 左侧天体列表（默认展开）遮挡时间传输按钮，播放/暂停/步进/倒放不可点击 | §29 §33 |
| P1-2 | 高 | 右侧信息面板与提示条（toast, z-index 30）遮挡底部相机/尺度/图层控件与面板关闭按钮 | §29 §33 |
| P1-3 | 高 | WebGL 上下文恢复后场景图泄漏 178 个 Object3D | §52 |
| P1-4 | 高 | `exhibition.config.json` 四个键无任何作用；自动演示开关失效 | §32 §55 |
| P2-1 | 中 | 彗发 / 尘埃尾 / 离子尾完全缺失 | §19 |
| P2-2 | 中 | 卫星（母天体相对）轨迹不受"轨道显示/隐藏"控制 | §27 |
| P2-3 | 中 | 小天体面板儒略日恒为错误值（误读主天体描述） | §26 §50 |
| P2-4 | 中 | 搜索结果缺少"所属系统" | §24 |
| P2-5 | 中 | 科学模式对信息面板无作用；界面缩放控件基本无效 | §50 §53 |
| P2-6 | 中 | 状态不一致：Esc/关闭只清选择不解除相机锁定；切换尺度后相机与 HUD 目标分离 | §9 §45 |
| P2-7 | 中 | 相机自由飞行速率以"日心距"而非"目标距"为尺度；follow ≡ orbit | §22 §23 |
| P2-8 | 中 | 缺 §43 抗锯齿/暗角；性能覆盖层 sparkline 恒为空 | §42 §43 |
| P2-9 | 中 | 质量档 `atmosphere`/`maxMinorBodies` 死字段；贴图分辨率档位无效；小天体子集恒为全量 | §41 |
| P2-10 | 中 | 触摸目标宽度 40–42 px（< 48 px） | §33 |
| P2-11 | 中 | `prefers-reduced-motion` 未被 JS 采纳（转场仍 4.47 s） | §53 |
| P2-12 | 中 | 加载页未覆盖渲染器/贴图初始化；启动屏统计为"—"、无 3D 背景 | §30 §57 |
| P2-13 | 中 | 硬编码天体数量，且导览小行星带文案（11 000）与实际（6 053）不符 | §4 §60 |
| P2-14 | 中 | `<html lang>`/标题不同步；`main.tsx` 错误文案仅中文；无 focus trap | §53 §54 |
| P2-15 | 中 | §5/§48/§59/§60 覆盖缺口（无 MPC、无 UI/性能单测、自比验证） | §5 §48 §59 §60 |

### 1.3 值得肯定的部分

- **轨道科学真实**：地球近日/远日点实测 0.9833 / 1.0167 AU（公开值一致到 4 位小数）；水星 0.3076 / 0.4667 AU；J2000 八大行星日心距全部落在公开区间；月球 20 天内 359 530–406 406 km；随机抽样 240 个真实编目小天体的日心距全部落在 `[近日点, 远日点]`。
- **无任何随机/装饰性运动**：`src/` 与 `scripts/` 中 `Math.random` 出现 0 次；无 `cos(t)*r` 圆形动画；10984 个小天体共用 1 个 `THREE.Points`（1 次 draw call），编目天体才有 Mesh。
- **浮动原点真实有效**：three.js 相机恒为 `(0,0,0)`，`originUnits === cameraUnits`（|Δ|=0），启用对数深度。
- **性能达标**：1920×1080 下全量 10 984 小天体 + 22 条主要轨道，四档画质实测 **119.9–120.1 FPS**，67 draw calls，166 k 三角形，Worker 传播 2.34 ms，轨道更新 0.03 ms。
- **完全离线**：运行时对外部主机请求数为 **0**；阻断所有非本机请求后仍完整可用。
- **降级与容错完备**：无 WebGL2 → 可读中文提示（无白屏）；小天体/恒星数据失败被隔离；config 损坏回退默认；上下文丢失/恢复无需刷新页面。
- **§61 十个验收场景全部通过**（Test 01–10）。
- **大屏适配**：1920×1080 / 2560×1440 / 3440×1440 / 3840×2160 / 1080×1920 竖屏均无横向溢出、canvas 铺满、HUD 无越界。
- **触摸交互**：单指旋转（Δaz = −Δx·0.00144，与代码一致）、双指缩放、双指平移、轻点/双击语义均正确。
- **搜索索引**：MiniSearch 支持中文名、别名、官方编号（`136199`）、临时编号（`2003 UB313`）、彗星编号（`67P`）、键盘上下键与 Esc。

---

## 2. 测试环境与方法

### 2.1 环境

| 项 | 值 |
| --- | --- |
| 主机 | macOS，Apple M5 Max |
| 浏览器 | Chromium（Playwright 1.62.0 自带，`--headless=new`），真实 GPU：`ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)` |
| 图形 API | WebGL 2（应用要求），GPU 硬件加速 |
| 开发服务 | Vite 8.3.1 `http://127.0.0.1:5199/`（DEV 模式，暴露 `window.__solarSystemEngine` 供诊断） |
| 生产服务 | `npm run build` 产物经 `vite preview` `http://127.0.0.1:4188/`（无诊断句柄） |
| 视口 | 默认 1600×900；另测 1920×1080 / 2560×1440 / 3440×1440 / 3840×2160 / 1080×1920 |

### 2.2 方法

1. **静态审计（3 路并行）**：分别审计「天文+数据层」「引擎+渲染层」「UI/状态/样式」，逐条对照设计文档 §3–§62 与禁项 §62，产出带 `文件:行号` 的证据表。
2. **真实浏览器 E2E**：7 个套件、112 个用例，全部通过真实指针/触摸/键盘事件、真实网络请求、真实 WebGL 渲染与场景图遍历进行断言；不使用像素级"看起来像"的模糊判定，除两处亮度/尺寸量化指标外均基于引擎诊断数据与 DOM/场景结构。
3. **项目自带验证**：`npm run verify:all`（typecheck → 单测 → 历表科学验证 → 生产构建）。
4. **科学基准**：使用公开天文常数与 Meeus 算法结果作为期望值（近日/远日点、地月距、儒略日、IAU 极轴）。

### 2.3 证据位置

- 截图：`docs/evidence/`（16 张，含日/夜面、土星环翻转对比、4K、无 WebGL 降级等）
- E2E 套件与原始用例结果（JSON）：`scripts/e2e/`（`h.py` 共享工具 + `s1..s7.py` 套件 + `diag*.py` / `probe_*.py` 诊断脚本 + `results_s1..s7.json`）

---

## 3. 工程自动化门禁结果（全部通过）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck`（`tsc -b --force`） | 退出码 0，无错误 |
| 单元测试 | `npm test`（Vitest） | **4 个文件 / 60 个用例全部通过**，461 ms |
| 科学验证 | `npm run verify:ephemeris` | **48/48 比较全部在文档阈值内**；最差径向 0.1253 %、最差角误差 0.1534°、最差三维位置 4 449 916 km、最差速度 0.0344 km/s |
| 生产构建 | `npm run build` | 成功：`index.js` 973.5 kB（gzip 279.8 kB）、`index.css` 15.7 kB、`orbit.worker.js` 3.1 kB |

单测覆盖：`Coordinates`(11)、`EphemerisValidation`(11)、`KeplerSolver`(19)、`TimeSystem`(19)。

> 注意（§59 覆盖缺口）：单测**只有天文层 4 个文件**，设计文档 §59 要求的 **UI Test**（Search/Select/FlyTo/Timeline/Pause/Time Scale/Filters）与 **Performance Test**（1 000/10 000/100 000/500 000 规模）在 Vitest 中不存在。仓库自带的 `scripts/smoke-test.mjs` 覆盖了验收流程，但其依赖 `playwright-core` **未列入 `package.json`、未安装**，且**未包含在 `verify:all`** 中，干净检出后无法运行。

---

## 4. 设计文档逐节符合性矩阵

状态：✅ 达标 ｜ ⚠️ 部分达标/有保留 ｜ ❌ 未达标

| § | 要求 | 状态 | 关键证据 |
| --- | --- | --- | --- |
| 3 | 太阳系仅一颗恒星；其他恒星作为独立背景层 | ✅ | catalog `byType.star=1`；星空为独立 HYG 相机层 |
| 4 | 分层目录（恒星/行星/矮行星/卫星/小天体/彗星） | ✅ | 总 11 162 = 1+8+5+164+10 984；bucket: 主带 4 495 / 近地 1 676 / 特洛伊 1 558 / TNO 1 600 / 半人马 500 / 彗星 1 155 |
| 4 | Catalog Complete + Progressive Visualization | ⚠️ | 目录为**星等限幅采样**（约 1.1 万），非"尽可能完整"；渲染侧渐进式（点云+LOD）达标 |
| 4 | **禁止硬编码天体数量** | ❌ | `src/data/Tour.ts:82,93,155-156` 硬编码"约 1.1 万个天体""已编目卫星 2 颗""1600 TNO/500 半人马/约 1150 彗星/200 双曲轨道" |
| 5 | 权威数据源（JPL/NSSDC/IAU/MPC） | ⚠️ | JPL SBDB、NSSDC fact sheet、JPL 卫星平均轨道要素、HYG、IAU/NAIF 极轴均已使用；**未使用 Minor Planet Center** |
| 6 | `CelestialObject` 接口与版本化目录 | ⚠️ | 字段齐备（按权威格式嵌套）；缺 `sourceUpdatedAt`；输出为 `catalog.json`+`minor-bodies.bin`，非 `catalog-vYYYYMMDD.bin` |
| 7 | 开普勒轨道传播（禁止圆形动画/手写速度） | ✅ | `KeplerSolver.ts` 椭圆+双曲、Newton 迭代；实测近日/远日点与公开值一致 |
| 8 | 双模式（Mode A 历表 / Mode B 开普勒） | ⚠️ | 10 历表 / 167 开普勒 / 1 原点；Mode A 基于 `astronomy-engine`(VSOP87/ELP2000)，**非 JPL Horizons/SPICE 数据** |
| 9 | 统一时钟：UTC/JD/速率/暂停/反向/日期跳转 | ✅ | 8 档预设（1 s…1 yr）、暂停、倒放（−86400 实测）、`JD 2461312.5`/`2000-01-01 12:00`→JD 2451545.0 精确 |
| 10 | 明确坐标系与转换（含注释与测试） | ⚠️ | 帧定义清晰且单测覆盖；**但实现中渲染空间未应用 `ECLIPTIC_TO_SCENE`**，与文档 §2.2/2.4 描述不符（详见 P0-2） |
| 11 | 浮点精度/浮动原点/相机相对渲染 | ✅ | 相机恒 `(0,0,0)`；`origin==camera`；float64→float32；对数深度 |
| 12 | 三种尺度模式 + 非真实比例必须披露 | ✅ | 科学尺度半径放大倍数=1.0（真实）、科普 12×、展览 14×；HUD 显示"天体尺寸已视觉增强"与"距离为非线性映射" |
| 13 | 太阳：纹理/自发光/日冕/Fresnel/Bloom/表面动态；作为主光源 | ⚠️ | 着色器含 `uTime` 对流与自发光、日冕壳、Bloom 0.55，场景**无任何 Light 对象**（纯着色器）；**但太阳方向帧不一致（P0-2），太阳贴图亦加载失败（P0-1）** |
| 14 | 行星：球体/尺寸/自转轴/自转速度/纹理/日夜光照/轨道/标签/数据面板 | ❌ | 尺寸/速度/轨道/标签/面板达标；**自转轴错误（P0-3）、日夜光照错误（P0-2）、表面纹理缺失（P0-1）** |
| 15 | 地球：日面/夜灯/云/大气/法线/海洋高光/轴倾角/自转 | ❌ | 目录声明 5 张贴图、云层与大气壳存在；**但夜灯/法线/镜面贴图实际未加载（实测 `uHasNightMap=0/uHasNormalMap=0/uHasSpecularMap=0`），云层因无贴图渲染为无光照白色壳体**，轴倾角姿态错误（P0-3） |
| 16 | 木/土/天/海四套环，且位于赤道面而非世界 XZ 平面 | ⚠️ | 四套环齐备，构造上位于 `frame` 的 XY 平面（法线=极轴，dot=1.000）；**但 frame 姿态错误导致环平面随相位翻转（6 h 内 157.30°）** |
| 17 | 卫星父子层级；位置独立计算 | ✅ | 164 颗卫星 `parentId` 完整；月球距地 359 530–406 406 km；土卫六距土星 1 205 922 km；位置由 resolver 独立求解 |
| 18 | 小行星带用真实轨道根数；禁止 1 天体 1 Mesh；支持族筛选 | ⚠️ | 真实 JPL SBDB 根数、单点云 1 次 draw call、6 族筛选；**但为 10 984 个天体各建 1 个 JS 对象（含嵌套 `{x,y,z}`）并在筛选时整体克隆，`.find()` 线性查找，与 §38 建议的 TypedArray 相悖** |
| 19 | 彗星高离心率轨道 + 彗发/尘埃尾/离子尾，尾向与太阳相关 | ❌ | 高离心率轨道与双曲分支达标（Halley e=0.968）；**彗发/彗尾在 `src/` 中 0 处实现** |
| 20 | 柯伊伯带/海王星外天体缩放与 GPU 点云 | ✅ | TNO 1 600 + 矮行星 5；`frameOuterSystem` 后相机 12 548 单位，可见 Neptune 30.1 AU/Pluto 30.2 AU/Eris 97.2 AU/Makemake 51.5 AU/Haumea 51.3 AU |
| 21 | 真实恒星背景（RA/Dec/星等/色指数），亮度与星等相关，无视差 | ✅ | HYG v4.1 15 598 颗（命名 366）；挂载相机、`frustumCulled=false`、`depthTest=false`；飞至海王星后世界坐标仍 (0,0,0) → 无视差 |
| 22 | 五种相机模式（Orbit/Free/Follow/Surface/Overview） | ⚠️ | 五种模式 UI 与引擎均可达；自由飞行 WASD/QE 实测移动 1 580 单位；**但 follow 与 orbit 共用同一代码路径，行为无差异** |
| 23 | 相机速度随距离动态变化（禁止固定速度） | ⚠️ | 速度 = `clamp(0.01 + |pos|·0.6, 0.01, 1000) × 滚轮倍率`，确实动态；**但以"距太阳距离"而非"距目标距离"为尺度** |
| 24 | 全局搜索（名称/类型/编号/所属系统）；点击 Fly To | ⚠️ | 搜索命中与 Fly To 达标；**结果行缺"所属系统"**（`parentLabel` 已索引但从未渲染）；**选中末开启层的小天体时 Fly To 飞向太阳且数值伪造（P0-4）** |
| 25 | Fly To 电影式转场（分段/缓动/样条/四元数） | ⚠️ | 实测太阳→海王星 4.3 s、29 个不同相机位置，非瞬移；**单段二次贝塞尔 + 两段 smoothstep，无离散阶段、无四元数插值**；`reducedMotion` 下 0.35 s 近似瞬移 |
| 26 | 信息面板字段齐备；未知数据必须显示"暂无可靠数据"，禁止编造 | ⚠️ | 主天体路径 100 % 字段覆盖且 Eris 等正确显示"暂无可靠数据"；**小天体路径伪造（P0-4）且儒略日恒错（P2-3）**；"发现时间/发现者"仅在存在时渲染而非显示未知 |
| 27 | 轨道可视化：真实轨迹、显示/隐藏、全部主要轨道、分类过滤、LOD | ⚠️ | 轨迹为真实采样（最长路径半径比 4.98，非圆）；显示/隐藏与"全部主要轨道"对日心路径有效（511→0，0→22 条）；**卫星（母天体相对）轨迹不受开关控制（383→383）；无按类别过滤轨道线的 API** |
| 28 | 标签：朝向相机/自动缩放/避免重叠/远距隐藏/优先级/搜索目标强制 | ⚠️ | DOM 标注天然朝向相机；优先级 100/80/60/20（+120/110）实测；重叠抑制与可关闭（关闭后可见标签 0）；**无基于距离的次要对象剔除；4K 下字号被钳制 18 px** |
| 29 | HUD 布局：标题+UTC/搜索/目标/时间控制；**不得遮挡 3D 主视图** | ❌ | 元素齐备；**但侧栏、信息面板、提示条三层均遮挡 HUD 控件**（P1-1/P1-2） |
| 30 | 展览首页（标题/副标题/进入按钮/背景动画） | ⚠️ | 标题、副标题、按钮齐备且统计行不伪造数字；**启动屏期间引擎未创建 → 背景为静态黑色（代码注释声称场景在后台运行）；统计行显示占位符"—"** |
| 31 | 导览：站点、自动 FlyTo、自动时间倍率、介绍、下一站 | ✅ | 13 站数据驱动；第 1 站 Sun（rate 86400）、第 7 站自动开启族筛选（云中 6 053）；上/下一站与退出可用 |
| 32 | 闲置进入自动演示；任意交互立即退出 | ⚠️ | 超时（实测 8 s 配置）进入 Auto Demo，画布拖拽后退出；**HUD/面板点击不重置空闲计时；设置面板的自动演示开关写入 `enableAutoDemo` 而判定读取 `autoDemo`，开关无效** |
| 33 | 触摸：单指旋转/双指缩放/平移/点击/双击；目标≥48 px | ⚠️ | 四种手势全部实测有效；**26 个控件中 10 个宽度 40–42 px（高度 48），未满足 48×48** |
| 34 | 大屏 1920/2560/3840、16:9、超宽、触摸一体机适配 | ✅ | 五种视口均无横向溢出、canvas=viewport、HUD 无越界；竖屏自动隐藏图例 |
| 35 | React/TS/three 架构；React 不持有 three 对象；无 per-body React 组件 | ✅ | 引擎存于模块级 holder；天体为 keyed 列表项；无 per-body 组件 |
| 37 | Astronomy Worker（Kepler/历表/传播） | ✅ | `orbit.worker.ts` + transferable typed array；Worker 不可用时主线程回退 |
| 38 | GPU 大规模渲染；无 per-object Object3D/Mesh/React；TypedArray | ⚠️ | 10 984 小天体 1 个 Points、0 个 per-object Mesh；**但存在 10 984 个 JS item 对象与嵌套坐标、筛选时克隆、线性查找** |
| 39 | LOD 按视角/投影像素分级，四档 | ✅ | 复核实测：0.39 px→`point`（球体隐藏、标记点）→ 9.77 px→`standard` → 2.2 半径→`close`（环/大气/云可见） |
| 40 | 贴图渐进流式加载，禁止启动全量加载 | ⚠️ | 启动不下载贴图，按投影像素≥5 px 惰性请求，缓存上限 48 并 dispose；**但分辨率档位仅"4k 优先否则 2k"，而包内无 4k 资源 → 档位实际无效**（且 P0-1 使加载必失败） |
| 41 | 画质 Ultra/High/Medium/Performance 动态调整多项 | ⚠️ | 四档存在且自适应（滑窗+迟滞）；像素比/Bloom/轨道采样/星数/点云上限生效；**`atmosphere` 与 `maxMinorBodies` 为死字段；贴图分辨率档位无效；天体子集恒为全量** |
| 42 | 性能监控字段齐备；生产默认隐藏 | ✅ | 覆盖 FPS/frame/jitter/draw calls/triangles/points/可见天体/labels/纹理与几何内存/worker/轨道/position/画质；生产模式默认隐藏且引擎句柄不外泄；**sparkline 恒为空**（传入 `history=[]`） |
| 43 | 后处理：Bloom/色调映射/FXAA 或 SMAA/轻微暗角 | ⚠️ | RenderPass+UnrealBloom(0.55)+OutputPass+ACES 色调映射；**无 FXAA/SMAA、无暗角；composer 目标无 MSAA，`antialias:true` 实际无效** |
| 44 | 单位系统统一（km/kg/s/rad/JD），UI 可转 km/AU/Mkm/地球半径 | ⚠️ | km/AU/Mkm/千 AU 已实现；**"地球半径"转换未实现（`EARTH_RADIUS_KM` 未被使用）** |
| 45 | 状态形状（simulationTime/timeScale/paused/selectedObjectId/trackedObjectId/cameraMode/scaleMode/orbitVisibility/labelVisibility/activeFilters） | ⚠️ | 多数具备（命名不同）；**`trackedObjectId` 不在 store**，导致 HUD 目标指示与实际相机锁定可分离（P2-6） |
| 46 | 数据与渲染分离（天文→场景模型→渲染→UI） | ✅ | 天文层纯计算、无 three 依赖；渲染层不含位置计算 |
| 47 | 离线优先，核心展项不依赖实时网络 | ✅ | `src/` 中 0 个 `https?://`；运行时外部请求 **0** 个；阻断全部外网后仍完整可用 |
| 48 | 数据更新工具与版本化输出 | ⚠️ | `update-planets/satellites/minor-bodies/stars/textures` + 离线 `build-catalog`；**无 `update-asteroids`/`update-comets`/`generate-ephemeris`；输出非 `catalog-vYYYYMMDD.bin`** |
| 49 | 搜索索引（名称/官方名/编号/别名），非遍历 | ⚠️ | MiniSearch + boost/prefix/fuzzy，覆盖中文名/别名/编号/临时编号；**`MinorBodyRecord` 无 `number` 字段（靠 id/全名），小天体无 `nameZh`（中文搜索失效）** |
| 50 | 科学模式：坐标/距离/速度/轨道参数/儒略日/尺度信息/数据来源 | ⚠️ | 上述读数在"物理特性"页常驻（含 scale/radius/LOD/on-screen/数据来源/位置计算模式）；**`scientificMode` 开关对面板无任何作用（prop 被声明但从不读取）；`enableScientificMode` 配置无效** |
| 51 | 图例（行星/矮行星/卫星/小行星/彗星/TNO），不依赖颜色 | ✅ | 7 条目均为"色点+文字"；竖屏/窄屏自动隐藏 |
| 52 | 上下文丢失/恢复与长期运行安全（禁止用刷新掩盖泄漏） | ⚠️ | `preventDefault` + 不刷新即可恢复（实测 contextRestored 后 drawnBodies=178、drawCalls=36）；**但每次恢复泄漏 178 个空 Group（178→356）** |
| 53 | 无障碍：高对比/字号可调/中英/键盘/reduced motion/可缩放/色盲友好 | ⚠️ | 中文英文可切换、键盘 Space/F/Esc 生效、`prefers-contrast:more`/`prefers-reduced-motion` CSS 规则存在、aria-pressed 10 项齐备；**界面缩放控件基本无效（100% 与 130% 下 chip 字号/高度不变）；`prefers-reduced-motion` 未被 JS 采纳（转场仍 4.47 s）；语言切换不同步 `<html lang>`/标题；无 focus trap；`user-scalable=no`** |
| 54 | i18n：zh-CN/en-US；名称三段式；不散落文本 | ⚠️ | 字典完整、切换生效（HUD/Sidebar/Inspector 标签联动）；**组件内仍硬编码文案（Inspector 叙述表、SplashScreen、TourPanel、SettingsPanel、`src/main.tsx` 错误文案仅中文）；小天体无中文名** |
| 55 | `exhibition.config.json` 运行时控制（language/autoDemo/autoDemoDelay/defaultTarget/defaultScaleMode/enableScientificMode/enableMinorPlanets） | ❌ | language/defaultScaleMode/defaultQuality/enableMinorPlanets/enableStarfield/uiScale/reducedMotion/autoDemoDelaySeconds 生效；**`defaultTarget`、`enableScientificMode`、`guidedTourOnIdle`、`showPerformanceOverlay` 四个键无任何消费者；键名 `autoDemoDelaySeconds` 与文档 `autoDemoDelay` 不一致** |
| 56 | 视觉风格：深空/科学/极简/高级；禁止霓虹与玻璃拟态 | ⚠️ | 整体克制（深黑、白字、弱蓝 HUD、少量暖色强调）；**面板使用 `backdrop-filter: blur` 6–12 px 与大量 1 px 描边胶囊，轻微偏离"禁止复杂玻璃拟态"** |
| 57 | 加载页显示真实进度，不伪造百分比 | ⚠️ | 目录/星表/小天体分 5 步、真实完成度、无伪造百分比；**引擎与贴图初始化在 `phase='ready'` 之后，故"Loading planetary textures / Initializing renderer"阶段从未展示，进度条走完后天体仍无贴图** |
| 58 | 降级：WebGPU→WebGL2；高→中→低贴图；小天体失败不影响核心 | ✅ | 无 WebGL2 时输出可读中文提示（无白屏）；小天体/恒星失败被隔离，八大行星正常（178 天体、地球日心距正常）；config 损坏回退默认；**WebGPU 仅探测不使用** |
| 59 | 测试：天文单测 / UI 测试 / 性能测试 | ❌ | 天文单测 4 文件 60 用例达标；**Vitest 中无 UI 测试、无 1k/10k/100k/500k 性能测试；`smoke-test.mjs` 依赖未安装的 `playwright-core` 且不在 `verify:all`** |
| 60 | 科学验证：与权威历表比较位置/速度/角误差，输出误差 | ⚠️ | 有独立验证脚本与 6 历元 48 组比较，阈值失败即非零退出；**但参照物是 Mode A（同为内部近似）→ 属自比；脚本未包含 §60 明确列出的月球；速度误差在 Vitest 中未断言** |
| 61 | 十个重点验收场景 | ✅ | Test 01–10 全部通过（详见 §6） |
| 62 | 十项禁止事项 | ⚠️ | 禁止 1/2/3/4/5/8/9 已确认未违反（无圆形动画、无手写速度、无随机假天体、无随机星空、无固定图片冒充、无 per-body 组件、无启动全量贴图）；**违反禁止 6 的精神（P0-1 场景下未标注程序化）、禁止 7 存在主线程回退全量传播的路径、禁止 10 受 P0-2/P0-3 影响** |
| 72 | README 内容完整（含"哪些真实/哪些增强"） | ⚠️ | 结构完整、章节齐备、披露充分；**但 README §5 声称使用"真实公开影像"，与 P0-1 实际行为（全部回退为程序化）矛盾** |
| 73 | 交付物（源码/天文模块/渲染/UI/数据/脚本/测试/README/部署配置 + 6 篇 docs） | ✅ | 6 篇专题文档齐备 |
| 74 | 最终成功标准（进入太阳系、看到行星/卫星/小行星/TNO 运动、时间改变全系统变化、任意天体搜索与飞行） | ⚠️ | 功能路径全部可达；**视觉与光照科学保真度未达标（P0-1/P0-2/P0-3），小天体搜索存在伪造读数（P0-4）** |

---

## 5. 缺陷详情

### P0-1 行星表面贴图 100 % 加载失败，且未向观众披露（阻断）

**现象**：地球在近距 LOD 下渲染为**纯白/浅灰球体**，无大陆与海洋（证据 `docs/evidence/04-earth-sun-side.png`、`05-earth-night-side.png`）。

**根因**：目录中的贴图路径为 `textures/earth-day.jpg`（相对 `public/data/`），但 `TextureProvider` 直接调用 `dataUrl(candidate)`：

- `src/data/TextureProvider.ts:133` — `this.loader.loadAsync(dataUrl(candidate))`
- 对照 `src/data/CatalogLoader.ts:74,78,107,124` — 目录类资源均带 `data/` 前缀（`data/catalog/catalog.json`）

因此浏览器实际请求 `/textures/earth-day.jpg`（缺 `data/`）。生产环境实测：

| 请求 | 结果 |
| --- | --- |
| `GET /textures/earth-day.jpg` | **200 `text/html` 867 B**（SPA 回退到 index.html） |
| `GET /data/textures/earth-day.jpg` | 200 `image/jpeg` 463 087 B |

图片解码失败 → `loadTexture` 返回 `null` → `loadBodyTextures` 对 `map` 通道回退到 `proceduralTexture(body)`。浏览器内实测地球材质：

```
maps.map = { image: [512, 256], src: "canvas" }      // 程序化 canvas，非 earth-day.jpg
uHasNightMap = 0, uHasNormalMap = 0, uHasSpecularMap = 0
frameChildren = [ Sphere(planet surface), Sphere(atmosphere), Sphere(clouds, MeshBasicMaterial, opacity .55) ]
```

云层为 `MeshBasicMaterial`（无光照）且贴图加载失败 → 渲染为**不透明的白色壳体**覆盖地球表面；木星/土星/月球等所有天体同样只有 `ocean`/`map` 回退。

**披露失效**：`SolarSystemEngine.ts:651`

```ts
proceduralSurface: this.visuals.get(id)?.hasTexturedMesh ? false : !body.textures?.map
```

由于目录声明了 `textures.map`，该表达式恒为 `false`，信息面板因此**不显示**"表面贴图为程序化生成"——与 §12/§56 要求的"程序化贴图必须在信息面板标注"相反。实测 `describeBody('earth').proceduralSurface === false`，而同一次采样中 `maps.map.src === "canvas"`。

**影响**：§14/§15/§16/§40/§56 全部落空；README §5 关于"NASA/USGS 派生的真实公开影像"的陈述与实际不符；土星环贴图（`saturn-ring.png`）同样加载失败，环退化为半透明圆环。

**修复建议**：`dataUrl('data/' + candidate)` 或让目录存完整路径；在 `TextureProvider` 返回 `{ procedural: true }` 时链路透传到 `describeBody`，使面板如实标注；为控制器增加"贴图加载失败"提示。

---

### P0-2 渲染空间坐标系不一致：几何在黄道基，光照方向/星空在场景基（阻断）

**证据 1（判定帧约定）**：地球 J2000 的引擎渲染位置方向 = `(-0.1801, 0.9836, -0.0000)`，此时黄经 100.378°（黄道面内）。若已应用 `ECLIPTIC_TO_SCENE`（`x,y,z → x,z,−y`），方向应为 `(-0.1801, 0, -0.9836)`。实测 **z≈0、y 为大分量 → 渲染空间仍是黄道基**。代码侧一致：`ScaleModel.positionKmToUnits` 只做径向/分量缩放（`src/data/ScaleModel.ts:181,193,206-210`）。

**证据 2（光照方向错误）**：`SolarSystemEngine.ts:851` 却把太阳方向旋入场景基，喂给表面着色器（`Shaders.ts:155` `lambert = dot(normalize(vWorldNormal), sunDirection)`，而 `vWorldNormal` 在黄道基）。浏览器内实测二者夹角：

| 天体 | 水星 | 金星 | 地球 | 火星 | 木星 | 土星 | 天王星 | 海王星 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 夹角 | **85.5°** | 5.9° | **88.1°** | 2.2° | **49.5°** | **60.9°** | **58.4°** | **71.9°** |

（仅在黄道 X 轴附近的金星/火星误差趋零，符合"绕 X 轴旋转 90°"的特征。）

**证据 3（视觉验证）**：把相机分别置于地球向阳面与背阳面，圆面平均亮度分别为 **212.5** 与 **212.1**（比值 1.002，亮像素占比均为 1.0）——两个半球看起来"同样被照亮"。证据 `docs/evidence/04-earth-sun-side.png` 与 `05-earth-night-side.png`。

**证据 4（星空错位）**：`StarFieldRenderer.ts:61-72` 同样把方向旋入场景基，而渲染出的轨道平面法线为 +Z → 星空黄极指向 +Y，与黄道面相差约 90°。

**影响**：§13/§14 的日夜光照、§21 的星空对齐、§10/§11 的"单一坐标系"要求；这是全系统性的视觉/科学错误，且与项目自身 `docs/coordinate-system.md` §2.2/2.4 的描述（"所有 GPU 顶点在场景帧"）自相矛盾。

**修复建议**：二选一并全局一致——(a) 在 `ScaleModel.positionKmToUnits` 中应用 `ECLIPTIC_TO_SCENE`（及逆变换），保留现有的方向旋转；(b) 保持位置不旋转，则移除对 `uSunDirection` 与星空方向的旋转。

---

### P0-3 天体姿态基变换错误：自转轴随相位漂移、行星环平面翻转（阻断）

**根因**：`src/render/BodyRenderer.ts:117-119` 把天体→黄道的旋转矩阵做**共轭**（`E·M·E⁻¹`）后赋予 `frame`（`:201-210`），而 `frame` 的局部 +Z 就是极轴（`:266-269` 用 `rotation.x = π/2` 对齐球体极轴）。共轭一个旋转矩阵并不等于轴变换——结果极轴被映射到赤道面内并随自转相位旋转。

**证据 1（轴漂移）**：浏览器内读取 `frame.matrixWorld` 第三列（应为固定 IAU 极轴），并与由目录 `poleRaDeg/poleDecDeg` + 黄赤交角换算的期望极轴比较：

| 天体 | t0 轴 | 期望 IAU 极轴（黄道基） | t0 误差 | +6 h 漂移 | +12 h 漂移 |
| --- | --- | --- | --- | --- | --- |
| 地球 | (0.0000, 0.3978, 0.9175) | (0.0000, 0.3978, 0.9175) | 0.00° | **90.25°** | **179.51°** |
| 火星 | (0.5896, −0.3400, 0.7326) | (0.4462, −0.0555, 0.8932) | **20.6°** | 87.72° | **175.45°** |
| 木星 | (−0.0306, −0.0362, 0.9989) | (−0.0146, −0.0358, 0.9993) | 0.63° | **142.37°** | **75.26°** |
| 土星 | (0.7546, −0.3604, −0.5484) | (0.0855, 0.4624, 0.8825) | **125.9°** | **157.30°** | 45.41° |
| 天王星 | (0.0575, −0.9871, 0.1496) | (−0.2120, −0.9680, 0.1344) | **15.6°** | **125.29°** | **109.42°** |

**证据 2（行星环视觉验证）**：土星环世界法线 t0 = `(0.7546, −0.3604, −0.5484)`，t+6 h = `(−0.9472, 0.2159, 0.2370)`，夹角 **157.30°** —— 环平面随时间翻转。对比截图：`docs/evidence/06-saturn-ring-t0.png` 与 `07-saturn-ring-t6h.png`。

**对照（构造正确）**：四套环（木/土/天/海）均挂在 `frame` 的 XY 平面，法线与 frame +Z 的点积恒为 `1.000`（`src/render/BodyRenderer.ts:322-338`）——**构造意图正确**，仅姿态数学错误使其实效失效。

**影响**：§14 自转轴/自转速度、§15 轴倾角与自转、§16"环须位于赤道面"；同时也解释了为何"极轴指向真实数据"的声明在运行时无法成立。

**修复建议**：由于位置未旋转（见 P0-2），`frame` 的四元数应直接取 `M`（body→黄道）而非共轭；若采纳 P0-2 的方案 (a) 把位置旋入场景基，则保留共轭并同步修正星空与光照方向。

---

### P0-4 默认状态下选中"未开启层"的小天体 → 编造位置与速度（阻断）

**复现**：全新会话，不做任何图层操作，通过搜索/列表选中 `Eris`（目录真实 q=38.16、Q=97.71 AU）。实测：

```
日心位置 = (0, 0, 0) km
距太阳   = 0 km
轨道速度 = 515 194 km/s        ← 真实约 2.28 km/s
cameraAfter.trackedId = null, cameraMode = overview
```

面板把上述数值作为"当前模拟时间位置"渲染（截图 `s1_26_minor_fabricated.png`）。开启小天体层后同一对象立刻恢复为 `97.226 AU ∈ [38.163, 97.705]`、速度 2.278 km/s（真实）。

**根因链**：
1. Worker 仅在 `minorVisible` 为真时传播（`SolarSystemEngine.ts:743`）；
2. `minorItems` 初值 `(0,0,0)`（`:176-180`），`minorItemsForRender` 在无筛选时保持 `null`（`:444-446`）；
3. `selectMinorBody`（`:342-355`）直接读取这些位置并 `flyTo(warp(0,0,0))` —— 即**飞向太阳**；
4. Inspector 的小天体分支无"未知"兜底（`Inspector.tsx:50-105`）。

**影响**：违反 §24（点击应飞向该天体）、§26/§50（禁止编造，未知须显示"暂无可靠数据"）、§62-3 的精神。对观众而言这是"科学数据造假"级别的体验缺陷。

**修复建议**：选中时按需传播该天体（或自动开启层）；在得到真实位置前把位置/速度渲染为"暂无可靠数据"。

---

### P1-1 左侧天体列表遮挡时间传输控件（默认状态）

`elementFromPoint` 在 ◀◀ / ❚❚ / ▶▶ / ⇄ 四个按钮中心命中的都是 `object-row`（列表行）；侧栏矩形 `[18, 67, 290, 792]`，而控制条顶边为 715、按钮矩形 x 30–202 / y 731–771。真实鼠标点击在 Playwright 下 30 s 超时无法完成（`S1-25`、`S3-23`、首次 `S1-14`）。侧栏 `z-index` 高于 HUD，且默认展开（`store.browserOpen: true`）。

**影响**：展览默认状态下观众无法操作时间（播放/暂停/步进/倒放），直接破坏 §9 与 §29/§33。

---

### P1-2 信息面板与提示条遮挡底部控件与面板关闭按钮

- **信息面板**：选中天体后 `aside.inspector`（z-index 12，rect 至 y=660、x 至 1582）覆盖控制条右段；Playwright 报错原文：`<dl class="kv"> … from <aside class="inspector" aria-label="C/1997 T1"> subtree intercepts pointer events` —— 点击"跟随"等相机模式按钮被拦截。
- **提示条**：`.toast-stack` z-index **30**，其矩形 `[1426, 70, 1582, 102]` 正压在 Inspector 关闭按钮（rect `[1534, 82, 32, 32]`）之上；`elementsFromPoint` 顶部元素为 `toast`。画质自适应会周期性弹出 `quality adjusted to …`，因此"关闭面板"在运行中经常点不动。
- 底部中央的提示条（rect `[731, 857, 869, 890]`）同样覆盖速度/相机/尺度等分段按钮。

**影响**：§29"HUD 不得遮挡主视图"与 §33 触摸可用性；三层浮层缺少指针事件预算管理。

---

### P1-3 WebGL 上下文恢复泄漏 178 个 Object3D

`loseContext()` → `contextLost` 提示 → `restoreContext()` → `contextRestored`，渲染恢复（drawnBodies=178、drawCalls=36，无需刷新页面，符合 §52 的主目标）。但场景中 `body:` 组数量 **178 → 356**：`BodyVisual.dispose()` 只移除 `frame.children`（`BodyRenderer.ts:432-452`），未把 `group`/`frame` 从父级摘除；引擎在恢复时重建全部 visual（`SolarSystemEngine.ts:139-147`）。每次上下文丢失都会累积一批空 Group，与 §52"禁止内存/结构泄漏"冲突。

---

### P1-4 `exhibition.config.json` 四个键无作用；自动演示开关失效

| 键 | 设置为 | 实测 | 结论 |
| --- | --- | --- | --- |
| `defaultTarget` | `jupiter` | 入场后 `trackedId = null`，HUD"锁定目标"为"—" | 无效 |
| `showPerformanceOverlay` | `true` | 性能覆盖层未出现 | 无效 |
| `enableScientificMode` | `false` | 科学模式按钮仍在 | 无效 |
| `guidedTourOnIdle` | `false` | 无消费者 | 无效 |

四者在 `ConfigLoader.ts:14,17,21,22,60,69,73,74` 被解析但全项目无其他引用。另：设置面板的自动演示开关写入 `config.enableAutoDemo`（`App.tsx:414-416`），而空闲判定读取 `config.autoDemo`（`useEngine.ts:276`）→ 开关点了没用。键名 `autoDemoDelaySeconds` 亦与文档 §55 的 `autoDemoDelay` 不一致（按文档书写的配置会被静默忽略、回退 150 s）。

---

### P2 级缺陷（摘要）

| 编号 | 缺陷 | 证据 |
| --- | --- | --- |
| P2-1 | **彗发/尘埃尾/离子尾完全缺失**（`grep -E "coma\|tail\|dust"` 在 `src/` 中 0 命中）；彗星仅作点云成员与可选轨迹线 | §19；`MinorBodyRenderer.ts:32` |
| P2-2 | **卫星轨迹不受"轨道显示/隐藏"控制**：Io 的母天体相对轨迹在隐藏后仍渲染 383 段（`OrbitRenderer.setVisible` 只切换 `orbits` 组，局部路径挂在 `body:jupiter` 组下） | §27；`OrbitRenderer.ts:95` vs `:157,:168`；`SolarSystemEngine.ts:909` |
| P2-3 | **小天体面板儒略日恒错**：选中 67P 时面板出现 `2457247.589 JD`（主天体陈旧值）与 `JD 0.00000`，而真实 `clock.jd = 2451545.0`（`Inspector.tsx:96` 在小天体分支读取了主天体描述） | §26/§50 |
| P2-4 | **搜索结果缺"所属系统"**：结果行 = `木卫二 · Europa \| 天然卫星 · Jupiter`；`SearchHit.parentLabel`（`SearchIndex.ts:22,78,109`）无任何渲染点 | §24 |
| P2-5 | **科学模式对信息面板无作用**（`Inspector.tsx:39` 声明 `scientificMode` 后从未读取）**且界面缩放控件基本无效**：100 % 与 130 % 下 chip 字号 13.12 px、高度 43 px、输入框宽度 152 px 完全不变（`--ui-scale` 仅用于 `body{font-size:calc(14px*var(--ui-scale))}`，组件尺寸用 rem，根字号未被设置） | §50/§53 |
| P2-6 | **状态不一致**：`clearSelection()` 只清 `selectedId`，不清 `trackedId` → 按 Esc 后相机仍锁定火星而 HUD 显示已取消；切换尺度模式时 `frameOverview()` 会清空引擎 `trackedId` 但 `store.selectedId` 不变；`selectBody` 对同 id 提前 return，导致重新选中无法恢复跟踪 | §9/§45 |
| P2-7 | **相机速率尺度取错量**：自由飞行速度 = `clamp(0.01 + \|pos\|·0.6, …)`，其中 `freePosition.length()` 是**距太阳距离**而非距目标距离（§23）；`follow` 与 `orbit` 共用同一更新路径，五种模式实际只有四种行为（§22） | §22/§23 |
| P2-8 | **§43 后处理不全**：无 FXAA/SMAA、无暗角；composer 渲染目标无 MSAA 使 `antialias:true` 失效；`App.tsx:447` 传 `history={[]}` 导致性能面板 sparkline 恒为空 | §42/§43 |
| P2-9 | **质量档死字段**：`QualityProfile.atmosphere` 与 `maxMinorBodies` 无消费者；`App.tsx:64` 恒以全量 10 984 作为 subset；贴图分辨率档位因包内无 4k 资源而无效 | §41 |
| P2-10 | **触摸目标偏小**：`pointer:coarse` 下 26 个控件中 10 个宽度 40–42 px（高度 48 px），未达 48×48（§33） | §33 |
| P2-11 | **`prefers-reduced-motion` 未被 JS 采纳**：系统设为 reduce 时相机转场仍 4.47 s（应降至 0.35 s；仅 CSS 过渡被抑制）。`reducedMotion` 仅由 config 驱动 | §53 |
| P2-12 | **加载页未覆盖真实初始化**：引擎与贴图在 `phase='ready'` 之后才开始，故"Loading planetary textures / Initializing renderer"从未显示；启动屏统计显示"—"且背景为静态黑（引擎在 splash 阶段尚未创建，与代码注释"场景在后台运行"矛盾） | §30/§57 |
| P2-13 | **硬编码数量与错误文案**：`Tour.ts:93-94` 称小行星带"约 1.1 万个天体"，而该站筛选 `['mainBelt','trojan']` 实际为 4 495+1 558 = **6 053**；`Tour.ts:82,155-156` 硬编码 TNO/半人马/彗星/双曲轨道数量，违反 §4"禁止硬编码" | §4/§60 |
| P2-14 | **i18n/无障碍细节**：切换 en-US 后 `document.documentElement.lang` 仍为 `zh-CN`、`document.title` 不变；`src/main.tsx:13-15` 错误文案仅中文；`index.html:5` 设 `user-scalable=no`；无 focus trap / `role="dialog"`；`Inspector.tsx:309-363` 内嵌中英叙述表 | §53/§54 |
| P2-15 | **§5/§48/§59/§60 覆盖缺口**：未使用 Minor Planet Center；无 `catalog-vYYYYMMDD.bin` 与 `update-asteroids`/`update-comets`/`generate-ephemeris`；无 UI/性能单测；科学验证为 Mode B vs Mode A 自比且遗漏月球；目录仅 10 984 小天体，§59 的 100 000/500 000 规模无法实测 | §5/§48/§59/§60 |

---

## 6. §61 十个重点验收场景结果

| 场景 | 结果 | 实测证据 |
| --- | --- | --- |
| Test 01 进入首页 → 点击"进入太阳系" → 看到太阳与主要行星 | ✅ 通过 | 178 个编目天体渲染；九个主要天体投影半径 6.3–42.4 px（太阳 24.8） |
| Test 02 点击 Earth → 镜头平滑飞向地球并显示信息卡 | ✅ 通过 | tracked=earth、mode=orbit、framingRatio=42.6、面板标题"地球" |
| Test 03 点击 Moon → 镜头进入地月系统，看到月球真实轨道运动 | ✅ 通过 | tracked=moon；20 天内距地 359 530–406 406 km（真实椭圆） |
| Test 04 时间速度 1 天/秒 → 各行星按各自周期运动 | ✅ 通过 | rate=86400；5 天内位移：水星 19.2 > 金星 15.2 > 地球 13.1 > 火星 11.3 > 木星 5.9 > 土星 4.3 Mkm |
| Test 05 搜索 Saturn → 立即定位 | ✅ 通过 | 搜索到锁定 5.6 s（含 3 s 转场），tracked=saturn |
| Test 06 搜索 Titan → 进入土星卫星系统 | ✅ 通过 | tracked=titan、parent=saturn、距土星 1 205 922 km |
| Test 07 开启 Asteroids → 真实轨道数据形成的小行星带 | ✅ 通过 | 云中 4 495 个真实主带天体；抽样位置全部落在 `[q,Q]` |
| Test 08 进入 Outer Solar System → Neptune/Pluto/TNO/Kuiper Belt | ✅ 通过 | 相机 12 548 单位；Neptune 30.1 AU、Pluto 30.2 AU、Eris 97.2 AU、Makemake 51.5 AU、Haumea 51.3 AU |
| Test 09 切换 Scientific / Visible Scale → 直观看出差异 | ✅ 通过 | 同一视角（地球 6 半径）投影半径 17.58 px → 106.58 px（6.1 倍），放大倍数 1× vs 12× |
| Test 10 修改日期 → 所有主要天体重新计算位置 | ✅ 通过 | 2026-09-29 → 2035-01-01，10 个天体位移 83.6–2 266.9 Mkm |

---

## 7. 设计图（`docs/design_prompt.png`）对照结果

设计图规定了若干界面元素，代码中**全部未实现（14/14）**：

| 设计图元素 | 现状 |
| --- | --- |
| 右上角小地图 / 太阳系全景图 | ❌ 无（`grep minimap` 0 命中） |
| 右下角缩放按钮（− / +） | ❌ 无；i18n 中 `zoomIn`/`zoomOut` 键存在但 **0 处调用** |
| 全屏按钮 | ❌ 无（`requestFullscreen` 0 命中） |
| 时间轴可拖动滑块 | ❌ 无（全项目无 `input[type=range]`） |
| AU 比例尺 / "距离: 2.3 AU"读数 | ❌ 无 |
| 天体缩略图（信息面板与底部图片条） | ❌ 无（`.tsx` 中 0 个 `<img>`） |
| 侧栏内搜索框（"搜索天体…"） | ❌ 无（搜索是顶栏弹出的独立浮层） |
| 顶栏语言切换（"中文"下拉） | ❌ 无（仅在设置面板内） |
| 奥尔特云图层开关 | ❌ 无（`grep oort` 全项目 0 命中） |
| 矮行星图层开关 | ❌ 无（显示层浮层仅有轨道/标签/恒星背景/大气/小天体） |
| 树形展开/折叠箭头 | ❌ 无（`aria-expanded` 0 命中；月球以固定缩进平铺） |
| "从太阳看"相机预设 | ❌ 无（相机模式为 自由视角/跟随/近天体/自由飞行/太阳系全景） |
| 停止/复位 ⏹ 按钮 | ❌ 无（传输栏仅 步退/暂停/步进/倒放） |
| 日期选择器（日历图标） | ❌ 无（纯文本输入） |

此外设计图的分类树（小行星带/柯伊伯带天体/彗星/其他天体的可展开节点）在实现中被替换为"小天体"标签页中最多 40 条 notable 记录的平铺列表；设计图的 10×/100×/1000× 快捷速度按钮被替换为 1 min/1 h/1 d/10 d/30 d/1 yr（功能更丰富，但交互形态不同）。

对照截图：`docs/evidence/14-mockup-compare.png`。

---

## 8. 已确认达标的功能（正向清单）

**天文与数据**
1. 开普勒传播真实：椭圆（Newton 迭代，容差 1e-13）与双曲分支齐备；240 个随机抽样小天体日心距全部 ∈ `[q,Q]`，离心率跨度 0.000–0.993。
2. 行星轨道与公开值一致：地球 0.9833/1.0167 AU、水星 0.3076/0.4667 AU；J2000 八大行星 + 冥王星日心距全部落在公开区间。
3. 月球轨道真实：朔望月内 359 530–406 406 km（公开 356 500–406 700）。
4. 时间系统完备：8 档速率（1 s…1 yr）、暂停、倒放（实测 −86400）、`JD/MJD/ISO` 解析、非法输入拒绝并提示；日期型输入按 12:00 UTC 解释（与设计图 `2025-04-24 12:00:00` 一致）。
5. 儒略日精确：`2000-01-01 12:00` → JD 2451545.0（Meeus 基准）。
6. 目录统计由数据生成（11 162 / 178 / 10 984 / 15 598），UI 不伪造数字。
7. 无任何随机性：`src/`、`scripts/` 中 `Math.random` 0 命中；无圆形轨道动画；无固定图片冒充轨道。

**渲染与性能**
8. 浮动原点真实：three.js 相机恒 `(0,0,0)`，`originUnits === cameraUnits`，`near=1e-4 / far=1e9`，对数深度开启。
9. 小天体 GPU 化：10 984 个天体 1 个 `THREE.Points`（1 次 draw call），无 per-object Mesh/Object3D/React 组件。
10. 性能达标：1920×1080 全量场景四档画质 **119.9–120.1 FPS**，67 draw calls，166 k 三角形，10 989 点，Worker 2.34 ms，轨道更新 0.03 ms，纹理 48 MB。
11. LOD 分级有效：0.39 px → `point`（球体隐藏、显示标记点）→ 9.77 px → `standard` → 2.2 半径 → `close`（环/大气/云可见）。
12. 恒星背景真实：HYG v4.1 15 598 颗，挂载相机、`frustumCulled=false`、`depthTest=false`；远距移动后世界坐标仍 `(0,0,0)` → 无视差。
13. 无光源对象（纯着色器方向光照），符合"避免大尺度 PointLight 强度失真"；太阳含 `uTime` 表面对流与日冕壳、Bloom 0.55。
14. 四套行星环构造于天体赤道面（法线与极轴点积 1.000），非世界 XZ 平面。
15. 轨道线为真实采样路径（最长路径半径比 4.98），带 LOD 采样上限。
16. 贴图惰性加载：启动不下载，投影 ≥5 px 才请求，缓存 48 项并 dispose。

**交互与展览**
17. 搜索：MiniSearch + boost/prefix/fuzzy，命中 `Earth/Mars/Europa/Titan/Pluto/Ceres/Halley/Apophis/136199/2003 UB313/月球/67P/99942`；支持上下键与 Esc；无结果有提示。
18. Fly To 非瞬移：太阳→海王星 4.3 s、29 个不同相机位置。
19. 五种相机模式可达；自由飞行 W/A/S/D/Q/E 实测有效（W 1.6 s 移动 1 580 单位）。
20. 移动天体跟随：×1 天/秒 下 2.5 s 内目标位移 595 单位、相机同步跟随。
21. 导览：13 站数据驱动，逐站设定时间倍率与筛选，上/下一站与退出可用；第 7 站自动开启（云中 6 053）。
22. 自动演示：闲置超时进入、画布交互立即退出。
23. 标签：优先级 100/80/60/20（+120/110）、重叠抑制、可整体关闭（关闭后可见标签 0）、选中目标强制显示。
24. 图例 7 项"色点+文字"双重编码。
25. 触摸：单指旋转（Δaz = −Δx·0.00144，与实现一致）、双指缩放（距离 1416→490）、双指平移（panOffset 生效）、轻点/双击语义正确。
26. 大屏 1920/2560/3440/3840/竖屏：无横向溢出、canvas=viewport、HUD 无越界、竖屏自动隐藏图例。
27. 键盘：空格暂停、F 切换自由飞行、Esc 取消选择均触发。
28. 无障碍基础：10 个带 `aria-pressed`/`aria-label` 的开关、`role=group`/`role=tablist`、加载进度条 `role=progressbar` + `aria-valuenow`。

**工程与运维**
29. 类型检查 0 错误；单测 60/60 通过；科学验证 48/48 通过；生产构建成功。
30. 完全离线：运行时外部请求 0 个；阻断全部外网后功能完整。
31. 降级完备：无 WebGL2 → 可读中文提示（无白屏）；小天体失败 → 八大行星正常 + 开关禁用 + 提示；恒星失败被隔离；config 损坏回退默认。
32. 上下文丢失/恢复无需刷新页面即可恢复渲染（但存在 P1-3 泄漏）。
33. 生产构建不泄漏诊断句柄、性能覆盖层默认隐藏、控制台 0 错误。
34. 尺度策略与披露完整：科学尺度半径放大 1.0×、科普 12×、展览 14×；科学尺度距离线性误差实测 **0.0000 %**；HUD 明示"尺寸已视觉增强"与"距离为非线性映射"。
35. 未知物理量的主天体路径不编造：Eris/Haumea/Makemake 半径缺失时以 `data-missing` 渲染"暂无可靠数据"。

---

## 9. 未覆盖 / 无法验证的项

| 项 | 原因 | 建议 |
| --- | --- | --- |
| §59 的 100 000 / 500 000 小天体性能 | 离线目录仅 10 984 个小天体（按绝对星等限幅采样），不存在该规模数据 | 用合成目录（真实根数扩样）建立性能基线，或明确将 §59 规模目标下调为"当前目录上限" |
| 与**外部**权威历表（Horizons/SPICE）的直接比对 | 仓库内无此类基准数据；现有验证为 Mode B vs Mode A | 引入 1–2 个日期 × 10 天体的 Horizons 输出作为黄金基准，纳入 CI |
| WebGPU 路径 | 应用仅探测 WebGPU，从不使用 | 若需 §58 的"WebGPU→WebGL2"，应先实现 WebGPU 后端 |
| 真实 4K 触摸一体机上的手感、48 px 以上的实际命中率 | 本机为桌面 Chromium + CDP 合成触摸 | 现场设备复测；同时修复 P2-10 的 40–42 px 宽度 |
| 长时间（数小时）无人值守的内存曲线 | 仅做了单次上下文丢失/恢复的结构性泄漏检查 | 增加 2 h 值守压测，采样 `renderer.info.memory` 与堆快照 |
| 视频/语音导览（§31"可播放视频/语音"） | 设计文档措辞为"可"，实现未包含 | 明确是否纳入范围 |

---

## 10. 修复优先级建议

**必须修复（阻断展览/科学可信度）**
1. **P0-1 贴图路径**：`dataUrl('data/' + candidate)`，并让面板如实标注程序化回退。（工作量：小，影响：极大）
2. **P0-2 + P0-3 坐标系一致性**：统一"几何/光照/星空/姿态"到同一帧（建议在 `ScaleModel` 内应用 `ECLIPTIC_TO_SCENE`，`frame` 四元数改用 `M`），随后回归 S2-02/03/04/05。（工作量：中，影响：极大）
3. **P0-4 小天体选中**：按需传播 + 未知兜底。（工作量：小，影响：大）
4. **P1-1 / P1-2 浮层遮挡**：为 HUD 控件留出安全区（侧栏与信息面板不覆盖底部控制条），提示条改为不拦截指针或移出控件区。（工作量：小，影响：大）

**应修复（规范符合性）**
5. P1-3 上下文恢复时把 `group/frame` 从父级摘除。
6. P1-4 接通 `defaultTarget`/`enableScientificMode`/`guidedTourOnIdle`/`showPerformanceOverlay`；统一自动演示开关字段；兼容 `autoDemoDelay` 键名。
7. P2-1 彗发/彗尾（尾向由太阳方向计算）；P2-2 卫星轨迹纳入轨道开关；P2-3/P2-4 面板与搜索字段修正。
8. P2-5 科学模式接入信息面板；界面缩放改为设置 `html` 根字号；P2-11 让媒体查询驱动相机 `reducedMotion`。

**建议改进（体验/工程）**
9. P2-7 相机速率改用"距目标距离"；区分 follow 与 orbit。
10. P2-8 增加 SMAA 与轻量暗角；修复 sparkline 数据源。
11. P2-9 接通 `atmosphere`/`maxMinorBodies`；P2-10 触摸宽度补齐 48 px。
12. P2-12/P2-13/P2-14 文案与披露修正；P2-15 补 UI/性能测试与外部科学基准。
13. 按设计图补齐界面元素（小地图、缩放按钮、全屏、时间滑块、AU 比例尺、缩略图、侧栏搜索、顶栏语言、Oort 云层、矮行星图层、树形折叠、"从太阳看"、停止按钮、日期选择器）。

---

## 附录 A：用例清单

| 用例 ID | 检查项 | 结果 | 实测/证据摘要 |
| --- | --- | --- | --- |
| **1. 启动/目录/时间/尺度** |  |  |  |
| S1-01 | 首页/启动屏：标题、副标题、进入按钮、真实统计 | ⚠️ 警告 | 标题/副标题/进入按钮正常；但统计行显示占位符 '—'（目录尚未加载，boot 只在 phase=loading 时执行）→ SplashScreen 注释所称『显示真实目录统计』未兑现：已编目天体 — \| 小天体 — \| 恒星 — \| Mode A + B VSOP87 · ELP2000 · Kepler |
| S1-02 | 启动屏背景是否运行 3D 场景（§30 建议 / 代码注释声称场景在后台运行） | ⚠️ 警告 | 启动屏期间 engine 未创建（window.__solarSystemEngine=false）；canvas 采样={'nonblack': 0, 'total': 3072}；截图非黑像素比例=None → 背景为静态黑色，未运行缓慢太阳系动画 |
| S1-03 | 点击进入 → 加载屏显示真实步骤与进度（§57） | ✅ 通过 | 5 个真实步骤=[['校验数据版本', 'done'], ['加载太阳系目录', 'active'], ['加载行星轨道根数', 'pending'], ['加载恒星背景目录', 'pending'], ['构建小天体轨道数据库', 'pending']]；进度条 aria-valuenow=40 |
| S1-04 | 进入主场景：HUD/canvas/引擎就绪，WebGL2 可用，无控制台错误 | ✅ 通过 | WebGL2=True renderer=ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)；canvas=1，label=15；启动总耗时=3.1s；console.error=0，pageerror=0 |
| S1-05 | 无控制台错误 / 无网络失败（§47 离线优先） | ✅ 通过 | requests=96 全部同源=True；requestfailed=0 |
| S1-06 | 目录完整性：1 恒星 + 8 行星 + 5 矮行星 + 164 卫星，类型分布来自数据（§4） | ✅ 通过 | manifest: total=11162 rendered=178 minor=10984 stars=15598 (named=366)；byType={'star': 1, 'planet': 8, 'dwarfPlanet': 5, 'moon': 164}；buckets={'tno': 1600, 'mainBelt': 4495, 'centaur': 500, 'trojan': 1558, 'nearEarth': 1676, 'comet': 1155}；engine drawnBodies=178 |
| S1-07 | 三大类小行星族齐备（主带/近地/特洛伊/半人马/TNO/彗星），无 Oort 云与流星体分类（§4/§18 对比设计图） | ⚠️ 警告 | 族：{'tno': 1600, 'mainBelt': 4495, 'centaur': 500, 'trojan': 1558, 'nearEarth': 1676, 'comet': 1155}；缺失对比设计图的『奥尔特云』与『流星体/行星际尘埃』分类 |
| S1-08 | 小天体位置服从真实轨道根数（抽样 240 个：日心距 ∈ [近日点, 远日点]） | ✅ 通过 | 抽样 240 个真实编目小天体，全部满足 日心距∈[q,Q]（按真实根数）；离心率范围 0.000–0.993（非圆形，非随机） |
| S1-09 | 行星轨道为真实椭圆：地球 日心距 min/max ≈ 0.983/1.017 AU，水星 ≈ 0.307/0.467 AU（§7/§62-1） | ✅ 通过 | 地球 0.9833–1.0167 AU（公开 0.9833/1.0167）；水星 0.3076–0.4667 AU（公开 0.3075/0.4667） |
| S1-10 | 行星尺度/周期正确：地球平均日心距 ≈1 AU，木星 ≈5.2 AU，海王星 ≈30 AU | ✅ 通过 | J2000 日心距/AU: mercury=0.466, venus=0.720, earth=0.983, mars=1.391, jupiter=4.965, saturn=9.184, uranus=19.924, neptune=30.120 |
| S1-11 | 矮行星与卫星层级：矮行星 5 个、月球 parent=earth、Titan parent=saturn（§17） | ✅ 通过 | 矮行星={'ceres': 'dwarfPlanet', 'pluto': 'dwarfPlanet', 'haumea': 'dwarfPlanet', 'makemake': 'dwarfPlanet', 'eris': 'dwarfPlanet'}；moon.parent=earth 距地=402440 km；titan.parent=saturn |
| S1-12 | 时间推进：×1 天/秒 下儒略日按真实速率前进（§9/Test 04） | ✅ 通过 | 4.0 s 内前进 4.00 天（期望≈4 天，rate=86400 s/s），timeScale=86400 |
| S1-13 | 暂停：时间停止前进，按钮状态与 HUD 显示同步（§9） | ✅ 通过 | 暂停后 2.5 s 内 ΔJD=0.000e+00；transport=[['◀◀', None], ['▶', 'true'], ['▶▶', None], ['⇄', 'false']] |
| S1-14 | 反向运行：timeScale<0 且儒略日倒流（§9） | ✅ 通过 | 倒放后 timeScale=-86400；2 s 内 ΔJD=-2.000 天（负向） |
| S1-15 | 速度预设档位与设计文档一致（实时/1分/1时/1天/10天/30天/1年） | ⚠️ 警告 | 按钮=['×1 s', '×1 min', '×1 h', '×1 d', '×10 d', '×30 d', '×1 yr', '暂停']；timeScale 实测=[1, 60, 3600, 86400, 864000, 2592000, 31557600]；『暂停』档位确实冻结时间（rate=0，ΔJD=0），但 SimulationClock.setRate(0) 未置 isPaused=true → paused 标志为 False，传输栏按钮仍显示 ❚❚、无高亮（状态不一致） |
| S1-16 | 日期跳转：2000-01-01 12:00 UTC → JD 2451545.0（Meeus 基准，§9） | ✅ 通过 | 输入 '2000-01-01 12:00' → JD=2451545.00000（期望 2451545.0）；HUD=模拟时间 2000-01-01 12:00:00 UTC 速度 ×0 |
| S1-17 | 日期跳转：1969-07-20（阿波罗 11 号）与 2035-01-01 均可跳转（§9） | ✅ 通过 | 日期型输入按 12:00:00 UTC 解释（与设计图 2025-04-24 12:00:00 一致）；实测 JD={'1969-07-20': 2440423, '2035-01-01': 2464329, '2026-09-29': 2461313, 'JD 2461312.5': 2461312.5}；显式 JD/MJD 输入精确 |
| S1-18 | 非法日期被拒绝并提示，时间不变（§9） | ✅ 通过 | 输入 'not-a-date' → 时间不变，toast=['无法识别的日期格式', 'quality adjusted to ultra'] |
| S1-19 | 修改日期后全部主要天体重新计算位置（Test 10） | ✅ 通过 | J2000 → JD 2465000 位移/Mkm: mercury=14.4, venus=80.3, earth=148.3, mars=444.5, jupiter=524.8, saturn=2098.9, uranus=5590.0, neptune=5831.1, moon=148.8, pluto=6081.1 |
| S1-20 | 月球位置相对地球 ≈ 384 400 km（§17 真实轨道，非装饰） | ✅ 通过 | 一个朔望月内 地月距 359530–406406 km（公开 356 500–406 700） |
| S1-21 | 三种尺度模式可切换，HUD 显示当前模式与增强/非线性提示（§12/Test 09） | ✅ 通过 | {"scientific": {"engine": "scientific", "labelShown": true, "enhancedWarn": false, "nonLinearWarn": false}, "visible": {"engine": "visible", "labelShown": true, "enhancedWarn": true, "nonLinearWarn": false}, "exhibition": {"engine": "exhibition", "labelShown": true, "enhancedWarn": true, "nonLinearW… |
| S1-22 | 科学尺度天体半径为真值（放大倍数=1），科普尺度为压缩幂律放大（§12 必须披露） | ✅ 通过 | 地球 radiusMagnification: {'scientific': 1, 'visible': 12.0, 'exhibition': 14.0}（科学=真实 1.0；科普/展览为视觉增强） |
| S1-23 | 科学/科普尺度距离映射为真实线性（1 单位=1000 km），展览尺度为非线性（§12） | ✅ 通过 | 地球日心位置（场景单位 / km）：{'scientific': (147101.66, 147101661), 'visible': (147101.66, 147101661), 'exhibition': (1698.0, 147101661)}；科学尺度线性误差=0.0000% |
| S1-24 | 切换尺度后相机视几何保持（可直观比较真实/科普差异，Test 09） | ✅ 通过 | 把相机固定在『地球 6 个半径』处，比较同一视角下的投影半径：{"scientific": {"projectedPx": 23.95, "radiusUnits": 6.371, "framingRatio": 48.958}, "visible": {"projectedPx": 223.59, "radiusUnits": 76.452, "framingRatio": 5.243}, "exhibition": {"projectedPx": 208.42, "radiusUnits": 89.194, "framingRatio": 5.625}}。科学尺度下地球几乎为亚像素，科普/… |
| S1-25 | 默认展开的左侧天体列表是否遮挡 HUD 时间传输栏（§29/§33 触摸可用性） | ❌ 失败 | 侧栏默认展开（display=flex）并以 z-index 覆盖传输按钮：[{'label': '◀◀', 'covered': True, 'top': 'object-row'}, {'label': '▶', 'covered': True, 'top': 'object-row'}, {'label': '▶▶', 'covered': True, 'top': 'object-row'}, {'label': '⇄', 'covered': True, 'top': 'object-row'}] → 时间前进/后退/暂停/倒放按钮无法点击，展览现场默认状态下无法操作时间 |
| S1-26 | 全新会话默认状态：选中末开启层的小天体，信息面板数值为伪造（0 km） | ❌ 失败 | 新会话默认状态（小天体层关闭）下从列表/搜索选中 Eris（真实 q=38.16–Q=97.71 AU）：日心位置=(0,0,0) km、距太阳=0 km、速度=515194 km/s → 面板『当前模拟时间位置』为伪造值，而非 '暂无可靠数据'。根因：Worker 仅在 minorVisible 时传播，minorItems 初值为 (0,0,0)；面板片段=Eris 136199 × 轨道参数 动力学分类 Trans-Neptunian Object 所属族 海王星外天体 轨道半长轴 67.933947 AU 轨道离心率 0.438238 轨道倾角 43.926 ° Ω 36.005 ° … |
| S1-27 | 开启小天体层后同一对象的位置恢复真实（对照 §26 禁止编造） | ✅ 通过 | Eris 开启后天体层：日心距=97.226 AU ∈ [38.163, 97.705]，速度=2.278 km/s（真实） |
| S1-28 | 选中态与相机跟踪态一致性：切换尺度后相机被重置为全景，但面板/HUD 仍显示已选中 | ✅ 通过 | 切换尺度前 cameraMode=orbit tracked=earth；切换后 cameraMode=orbit tracked=earth；而信息面板仍渲染『地球』、HUD 锁定目标仍为地球=True。引擎 setScaleMode 在 cameraController.trackedId 为空时调用 frameOverview() 并把 engine.trackedId 置空，但 store.selectedId 不变 → 相机已离开目标而界面仍宣称已选中 |
| **2. 渲染/坐标系/科学保真** |  |  |  |
| S2-01 | 渲染空间坐标系判定：位置是否被旋转到 Y-up 场景系（§10/§11 单一坐标系） | ✅ 通过 | 地球 J2000 黄经=100.378°；引擎渲染位置方向=[-0.1801, 0.9836, -0.0]；若已旋入 Y-up 场景系应为 [-0.1801, -0.0, -0.9836]（+Y 为黄极）→ 实测 z≈0、y 为大分量，说明渲染空间仍是黄道基（未应用 ECLIPTIC_TO_SCENE）；而 sunDirection/星空被旋入场景基 ⇒ 光照与几何不同帧 |
| S2-02 | H2 确认：着色器太阳方向与真实渲染空间方向夹角（日夜光照正确性，§13/§14） | ❌ 失败 | uSunDirection（喂给表面着色器）与几何真实的『天体→太阳』方向夹角：{'mercury': 85.54, 'venus': 5.9, 'earth': 88.14, 'mars': 2.15, 'jupiter': 49.51, 'saturn': 60.88, 'uranus': 58.36, 'neptune': 71.85} 度。高于 20° 即意味着昼夜终止线画在错误方位；实测最差 88.1°。根因：几何在黄道基、光照方向被 ECLIPTIC_TO_SCENE 旋入场景基（(x,y,z)→(x,-z,y)），仅在黄道 X 轴附近（金星/火星）误差才趋近 0 |
| S2-03 | H2 视觉验证：把相机分别放在向阳面与背阳面，比较地球圆面亮度（§14 日夜光照） | ❌ 失败 | 向阳面圆面平均亮度=212.5（亮像素占比=1）vs 背阳面=212.1（亮像素=1）；比值=1.002。若终止线正确，向阳面应几乎全亮、背阳面几乎全暗（比值 ≫ 3）；实测接近 1 即证明 ~88° 的方位错误 |
| S2-04 | H1 确认：天体自转轴（frame +Z）随时间漂移，与 IAU 极轴不符（§14/§15 自转轴倾角） | ❌ 失败 | frame 的 +Z（应为固定自转极轴）在 12 小时内漂移：[{"body": "earth", "axis_t0": [0.0, 0.3978, 0.9175], "expected_pole": [0.0, 0.3978, 0.9175], "err_vs_pole_t0_deg": 0.0, "drift_12h_deg": 179.51, "drift_6h_deg": 90.25}, {"body": "mars", "axis_t0": [0.5896, -0.34, 0.7326], "expected_pole": [0.4462, -0.0555, 0.8932], "er… |
| S2-05 | H1 视觉验证：土星环平面在 6 小时内应保持不变（§16 环须位于赤道面/自转轴） | ❌ 失败 | 土星环世界法线 t0=[0.7546, -0.3604, -0.5484]，t+6h=[-0.9472, 0.2159, 0.237] → 夹角 157.30°。环平面随时间翻转，说明环并未稳定位于赤道面（视觉上与设计文档 §16 及项目自身 docs/coordinate-system.md 冲突） |
| S2-06 | 环系存在性：木星/土星/天王星/海王星四套环，且构造于天体赤道面（§16） | ✅ 通过 | 4 套环均挂在天体 frame 的 XY 平面（法线=frame +Z=极轴，dot=[1, 1.0, 1, 1]），故构造上是赤道面而非世界 XZ 平面；但 frame 姿态本身有误（见 S2-04/05）：[{"body": "body:jupiter", "planeNormalY": 0.03694228544402319, "dotWithFrameZ": 1, "inner": 1.4, "outer": 1.81}, {"body": "body:saturn", "planeNormalY": 0.2159231292052499, "dotWithFrameZ": 1.000… |
| S2-07 | 浮动原点：three.js 相机固定在原点、原点=相机位置、启用对数深度（§11） | ✅ 通过 | three.js 相机位置=[0, 0, 0]（恒为原点，GPU 只接收相机相对坐标）；浮动原点 originUnits==cameraUnits（\|Δ\|=0）；near=0.0001 far=1e+09；对数深度=True |
| S2-08 | 恒星背景层：真实 HYG 星表、挂载于相机（无视差）、单次绘制（§21） | ❌ 失败 | AssertionError: star layer is not parented to the camera (parallax would appear) |
| S2-09 | 后处理：Bloom + OutputPass + ACES 色调映射存在；FXAA/SMAA/vignette 缺失（§43） | ⚠️ 警告 | 存在 RenderPass/UnrealBloomPass/OutputPass；toneMapping=4（ACESFilmic=4）、bloom 强度=0.55、对数深度=True；缺失 §43 要求的抗锯齿与暗角：['fxaaPass', 'smaaPass', 'vignettePass']（且 EffectComposer 目标无 MSAA，构造时 antialias:true 实际无效） |
| S2-10 | 近距 LOD 下地球材质齐备：日面/夜灯/法线/镜面/云层/大气（§15） | ❌ 失败 | AssertionError: {'tier': 'close', 'hasMap': True, 'hasNormal': False, 'hasNight': False, 'specular': False, 'clouds': True, 'atmosphere': True, 'children': [], 'axialTiltDeg': 23.44, 'periodHours': 23.9345} |
| S2-11 | LOD 按投影像素分级：远→point、近→close（§39） | ❌ 失败 | AssertionError: {'ratio_60.0': ('close', 166.7), 'ratio_6.0': ('close', 173.3), 'ratio_2.2': ('close', 175.8)} |
| S2-12 | 贴图按需流式加载：启动不下载贴图，进入近距后才请求（§40/§62-9） | ✅ 通过 | 启动至今贴图请求 16 个（earth-day.jpg…）；启动首帧阶段未批量加载 2K/4K 贴图，仅在投影半径≥5px 时按需请求（代码路径 SolarSystemEngine.frameStep） |
| S2-13 | 轨道线为真实计算路径（椭圆采样，非默认圆环），并带 LOD 采样上限（§27） | ✅ 通过 | 最长轨道线顶点=512；半径 min=1769.87 max=8808.48 单位 → 比值 4.977（>1 即椭圆/真实轨迹）；引擎报告 orbitPaths=3，轨道采样上限随画质档变化 |
| S2-14 | 小天体为单个 GPU 点云（无 per-object Mesh/Object3D，§38） | ✅ 通过 | 开启后点云对象数=32（应≈2：恒星层+小天体层），Mesh 数=72（仅 178 个编目天体 + 环/大气/云），云中对象=10984 → 10984 个小天体共享 1 次 draw call，无 per-object Object3D：{"points": 32, "meshes": 72, "scenes": 3, "cloud": 10984} |
| S2-15 | 光源实现：场景中不存在 PointLight/DirectionalLight/AmbientLight，纯着色器光照（§13） | ✅ 通过 | 场景中光源对象数=0（太阳作为唯一光源，通过 uSunDirection 方向项着色，避免大尺度 PointLight 强度失真）；太阳子节点=['SphereGeometry', 'SphereGeometry'] |
| S2-16 | 太阳表现：自发光着色器 + 日冕/辉光壳 + Bloom（§13） | ✅ 通过 | 太阳着色器 uniforms=['uMap', 'uTime', 'uColor']（含时间驱动的表面对流/自发光）；子节点=[{"t": "SphereGeometry", "u": ["uMap", "uTime", "uColor"]}, {"t": "SphereGeometry", "u": ["uColor", "uIntensity", "uPower"]}]；bloom 强度=0.55 |
| **3. 交互/信息面板/相机/导览** |  |  |  |
| S3-01 | 全局搜索：热门天体均可命中（Earth/Mars/Europa/Titan/Pluto/Ceres/Halley/Apophis） | ✅ 通过 | {"Earth": ["地球 · Earth \| 行星 · Earth"], "Mars": ["火星 · Mars \| 行星 · Mars", "Marson \| 特洛伊群 · 39795", "Marsyas \| 近地天体 · 343158"], "Europa": ["Europa \| 小行星带 · 52", "木卫二 · Europa \| 天然卫星 · Jupiter"], "Titan": ["土卫六 · Titan \| 天然卫星 · Saturn", "Titania \| 小行星带 · 593", "天卫三 · Titania \| 天然卫星 · Uranus"],… |
| S3-02 | 搜索结果字段：名称/类别/编号齐备，但缺少『所属系统』（§24 明确要求） | ✅ 通过 | 结果行=['Europa \| 小行星带 · 52', '木卫二 · Europa \| 天然卫星 · Jupiter']。SearchHit.parentLabel 已由 SearchIndex 建立索引，但 SearchPanel.tsx 只渲染 名称/类别/编号首段，从不渲染所属系统 → §24『搜索结果应显示所属系统』未实现 |
| S3-03 | 索引覆盖：官方编号、别名、中文名、临时编号均可检索 | ✅ 通过 | {"136199": ["阅神星 · Eris \| 矮行星 · 136199", "Eris \| 海王星外天体 · 136199"], "2003 UB313": ["Eris \| 海王星外天体 · 136199"], "月球": ["月球 · Moon \| 天然卫星 · Moon"], "67P": ["67P/Churyumov-Gerasimenko \| 彗星 · 67P", "167P/CINEOS \| 彗星 · 167P"], "99942": ["Apophis \| 近地天体 · 99942", "99943 \| 特洛伊群 · 99943"], "2024 YR4"… |
| S3-04 | 搜索无结果时给出提示而非空白（§24） | ✅ 通过 | 输入无匹配串 → 结果为空并显示『没有匹配的天体』 |
| S3-05 | 点击搜索结果 → Fly To 目标天体并弹出信息卡（Test 02 步骤） | ✅ 通过 | 点击 Earth → trackedId=earth，cameraMode=orbit，信息面板标题=地球 |
| S3-06 | Fly To 为电影式转场而非瞬移：转场期间相机连续移动、耗时 > 1s（§25） | ✅ 通过 | 太阳→海王星：采样 29 帧、29 个不同相机位置、转场耗时 ≈4.3s；flyToProgress 样本=[{'targetId': 'neptune', 'elapsed': 0.12500000000000003, 'duration': 4.397874304160741, 'desiredDistance': 901.3644078622777}, {'targetId': 'neptune', 'elapsed': 0.2835000000000001, 'duration': 4.397874304160741, 'desiredDistance': 901.3644078622… |
| S3-07 | 信息面板（4 个标签页）覆盖 §26 全部字段：名称/英文名/类别/直径/质量/密度/重力/日距/半长轴/离心率/倾角/周期/自转/轴倾角/位置/数据源 | ✅ 通过 | 标签页=['基本信息', '轨道参数', '物理特性', '科普介绍']；字段覆盖：缺失=[]；『发现时间/发现者』仅在 body.discovery 存在时渲染（178 个天体中仅部分具备，缺失时不显示『暂无可靠数据』） |
| S3-08 | 未知数据不编造：无公开直径的矮行星显示『暂无可靠数据』（§26） | ✅ 通过 | Eris: meanRadiusKm=None, radiusSource=unavailable-published-value → 面板以 data-missing 渲染『暂无可靠数据』的字段=['暂无可靠数据', '暂无可靠数据', '暂无可靠数据', '暂无可靠数据', '暂无可靠数据', '暂无可靠数据', '暂无可靠数据'] |
| S3-09 | 无公开自转相位的天体明确标注『轨道相位：约定值』（§26/§50 披露） | ✅ 通过 | Hyperion/备用天体 phaseSource={'phase': 'convention', 'name': 'Hyperion'}；面板披露片段=metric albedo 0.300 科学模式 位置计算模式 开普勒轨道传播（Mode B） scale 展览尺度 radius ×114.9 放大 LOD low on-screen 2.0 px 数据来源 NASA/NSSDC satellite fact sheet  轨道相位：约定值（无公开平近点角）  表面贴图为程序化生成（无公开全球影像）  自转相位：以 J2000 为约定零点；自转速率与极轴指向为真实数据。  飞向该天体 |
| S3-10 | 小天体信息面板的儒略日为错误值（读取了主天体描述，§26/§50） | ❌ 失败 | 选中 67P 后面板儒略日行=['2457247.589 JD', '儒略日', 'JD 0.00000']；实际 clock.jd=2451545.0000。MinorBodyDescription 无 julianDate 字段，Inspector 的 minor 分支误读 props.description（主天体描述）→ 显示 0 或陈旧值 |
| S3-11 | 轨道显示：Show/Hide 切换生效，并支持『显示全部主要轨道』（§27） | ❌ 失败 | AssertionError: orbit visibility toggle had no effect (rendered line segments): 383 -> 383 |
| S3-12 | 轨道线为真实计算路径且按类别/父天体分色、带采样 LOD（§27） | ✅ 通过 | 轨道线（前 14 条）：[{"count": 512, "col": "#6f9fd8", "name": null}, {"count": 512, "col": "#6f9fd8", "name": null}, {"count": 512, "col": "#6f9fd8", "name": null}, {"count": 512, "col": "#6f9fd8", "name": null}, {"count": 512, "col": "#6f9fd8", "name": null}, {"count": 512, "col": "#6f9fd8", "name": null},… |
| S3-13 | 3D 标签：DOM 标注层存在、朝向相机、按优先级排序、重叠抑制、可关闭（§28） | ✅ 通过 | 标签数=21，优先级层级=[80, 100, nan, 60, 120]（100 行星/80 矮行星/60 卫星/20 其它/120 恒星）；位置由 transform 投影，标签为 DOM（天然朝向相机）；关闭标签后可见标签=0。样例=[{"text": "太阳 \| 距太阳 0.000 km", "id": "sun", "pr": 120, "transform": "translate(-50%, -50%) translate(800px, 4", "colour": "#ffc46a", "visible": true}, {"text": "水星 \| 距太阳 69.8 mill… |
| S3-14 | 图例：7 类天体均有文字标签（不依赖颜色作为唯一信息，§51） | ✅ 通过 | 图例条目=['恒星', '行星', '矮行星', '卫星', '小行星', '彗星', '海王星外天体']（颜色 + 文字双重编码） |
| S3-15 | 五种相机模式均可切换：自由视角/跟随/近天体/自由飞行/太阳系全景（§22） | ✅ 通过 | UI 标签 → 引擎模式：{'自由视角': 'orbit', '跟随': 'follow', '近天体': 'surface', '自由飞行': 'free', '太阳系全景': 'overview'} |
| S3-16 | 自由飞行：W/A/S/D/Q/E 真正驱动相机平移，速率随位置动态变化（§22/§23） | ✅ 通过 | 按 W 1.6s：相机移动 1580.59 渲染单位（[7120.7, 4059.5, 5650.6] → [5990.1, 3415.0, 4753.5]）；按 Q 再移动 870.10。自由飞行速度 = clamp(min + \|pos\|×0.6, 0.01, 1000) × 滚轮倍率 → 动态但以『距太阳距离』而非『距目标距离』为尺度（§23 部分符合） |
| S3-17 | 跟随模式：相机随运动天体一起平移（跟随地球） | ✅ 通过 | 时间 ×1 天/秒 运行 2.5s：目标天体位移=75.8 单位，相机位移=136.5 单位（相机跟随目标移动），relativeKm=12461854 km 保持 |
| S3-18 | 导览：13 站列表、启动、下一站/上一站、自动设定时间倍率、出口（§31） | ✅ 通过 | 路线 13 站=['01 太阳', '02 水星', '03 金星', '04 地球', '05 月球', '06 火星', '07 小行星带', '08 木星', '09 土星', '10 天王星', '11 海王星', '12 冥王星', '13 柯伊伯带与海外天体']；第 1 站=01 太阳（tracked=sun, rate=86400）；下一站后标题=02 水星 |
| S3-19 | 导览第 7 站（小行星带）自动开启小行星族筛选并将时间倍率提高（§31） | ✅ 通过 | 连续前进到第 7 站：标题=08 木星；云中天体=6053；timeScale=864000（导览站点自带时间倍率与筛选） |
| S3-20 | exhibition.config.json 运行时生效：语言/默认尺度/画质/是否加载小天体/界面缩放/减弱动效 | ✅ 通过 | language=en-US → HUD 英文标签=True（SOLAR SYSTEM EXPLORER real-time positions 2000-01-01 12:00:03 UTC SCAL）；defaultScaleMode=scientific → scientific；defaultQuality=performance → performance；enableMinorPlanets=false → 云中天体=0；uiScale=1.3 → --ui-scale=1.3；reducedMotion → data-reduced-motion=true |
| S3-21 | config 死字段：defaultTarget / enableScientificMode / guidedTourOnIdle / showPerformanceOverlay 无任何效果（§55） | ❌ 失败 | defaultTarget=jupiter → 入场后 trackedId=None（未选中任何天体，HUD 锁定目标仍为『—』）；showPerformanceOverlay=true → 性能覆盖层是否出现=False；enableScientificMode=false → 科学模式按钮仍存在。四个键在 ConfigLoader 中可解析但代码中无消费者（grep 无引用） |
| S3-22 | 自动演示：无操作超时后进入 Auto Demo，画布交互立即退出（§32） | ⚠️ 警告 | autoDemoDelaySeconds=8 → 超时后进入自动演示（badge=True）；画布拖拽后退出（badge=False）。但 HUD/面板点击不会重置空闲计时（markInteraction 只绑定 canvas 与 window keydown），与 §32『检测用户交互立即退出』不符；且设置面板的自动演示开关写入 config.enableAutoDemo，而判定读取 config.autoDemo → 开关无效 |
| S3-23 | HUD 底部控制条是否被提示条/侧栏遮挡（§29 HUD 不应遮挡主视图与控件） | ❌ 失败 | 底部控制条被遮挡：[{"label": "◀◀", "by": "object-row"}, {"label": "❚❚", "by": "object-row"}, {"label": "▶▶", "by": "object-row"}, {"label": "⇄", "by": "object-row"}]（侧栏 rect=[18, 67, 290, 792]；提示条数=1）。侧栏 z-index 高于 HUD，默认展开时覆盖左下角传输控件；.toast-stack 出现在底部中央，覆盖相机/尺度/图层等分段按钮 → 现场触控与鼠标均无法点击 |
| S3-24 | 右侧信息面板是否遮挡底部相机/尺度/图层控件（§29/§33 触控可用性） | ❌ 失败 | AssertionError: inspector tabs not rendered: False |
| **4. 健壮性/降级/离线/生产构建** |  |  |  |
| S4-01 | WebGL 上下文丢失/恢复：不刷新页面即可恢复，且不泄漏场景节点（§52） | ⚠️ 警告 | loseContext → contextLost=True（toast=['图形上下文丢失，正在尝试恢复', 'quality adjusted to ultra']）；restoreContext → contextRestored=True，恢复后 drawnBodies=178 drawCalls=36（无需刷新页面）；场景中 body: 组数量 178 → 356（泄漏 178 个空 Group：BodyVisual.dispose 只移除 frame.children，未从父级移除 group/frame） |
| S4-02 | 无 WebGL2 时给出可读提示而非白屏（§58） | ✅ 通过 | --disable-3d-apis 启动后：canvas 数=1，页面文本含可读降级提示 → 'SOLAR SYSTEM / INITIALIZING ASTRONOMICAL DATA / 数据加载失败: 当前环境未能创建 WebGL 上下文（可能是浏览器禁用了硬件加速，或在无 GPU 的沙箱中运行）。请启用 WebGL/硬件加速后重试。 / 重试' |
| S4-03 | 小天体数据加载失败时核心八大行星仍可正常运行（§58） | ✅ 通过 | 中断 minor-bodies.json/.bin 后：渲染天体=178（星/行星/矮行星/卫星正常）、云中天体=0、八大行星描述均可取、地球日心距=147101661 km；小天体开关禁用={'toggles': [False, False, False, False, False, True, False], 'note': True}；toast=['quality adjusted to ultra'] |
| S4-04 | 恒星背景数据失败时应用仍可用（§58） | ✅ 通过 | 中断 stars.bin/stars.json 后：绘制恒星=0、编目天体=178（其余功能不受影响） |
| S4-05 | exhibition.config.json 缺失或损坏时回退默认值且不致命（§55） | ✅ 通过 | 返回损坏 JSON 后仍进入主场景（回退 DEFAULT_EXHIBITION_CONFIG）：drawn=178 |
| S4-06 | 离线运行：阻断全部非本机请求后系统仍完整可用（§47） | ✅ 通过 | 全部外部(非 127.0.0.1)请求被阻断（共拦截 0 个）：仍进入主场景、渲染天体=178、恒星=15598、小天体=10984、可 Fly To 土星 → 完全离线可用 |
| S4-07 | 生产构建（vite preview）启动正常、无控制台错误、性能覆盖层默认隐藏（§42/§57） | ✅ 通过 | dist 产物经 vite preview 启动：HUD 就绪、engine 未暴露到 window（False）、性能覆盖层默认隐藏（False）、可见标签=15；console.error=0 pageerror=0；HUD=SOLAR SYSTEM EXPLORER 实时位置 2000-01-01 12:00:04 UTC 尺度 展览尺度 视角 太阳系全景 锁定目标 — 搜索 设置 导览 天体列表 |
| S4-08 | 生产环境贴图请求路径正确性（§14/§15/§40 真实行星影像） | ❌ 失败 | 应用请求的是 dataUrl('textures/earth-day.jpg') = /textures/earth-day.jpg（缺 data/ 前缀）：该路径在生产下返回 (200, 'text/html')；正确路径 /data/textures/earth-day.jpg 返回 (200, 'image/jpeg')。→ 所有行星贴图请求都拿到 HTML 回退页（200 text/html）而非图片，解码失败后静默回退为程序化贴图，云层材质无贴图 → 地球等渲染为纯白/灰球，且信息面板未标注“程序化”（proceduralSurface 依赖目录声明而非实际加载结果） |
| S4-09 | WebGPU 能力探测与降级（§58） | ✅ 通过 | 浏览器 navigator.gpu=True；应用固定使用 WebGL2（GraphicsCapability 仅探测 WebGPU，从不使用）→ §58 的 'WebGPU → WebGL2' 实际为 '始终 WebGL2' |
| **5. 触摸/大屏/性能/无障碍/多语言/设计图对照** |  |  |  |
| S5-01 | 触摸：单指旋转视角（§33） | ✅ 通过 | 单指水平拖动 200px：azimuth 0.9125 → 0.6245（Δ=-0.2880，符合 -Δx·rotateSpeed·0.0045），elevation 不变=0.3454 |
| S5-02 | 触摸：双指缩放改变相机距离（§33） | ✅ 通过 | 双指张开：相机轨道距离 3797.503 → 3256.795 渲染单位（zoom 由捏合距离差驱动） |
| S5-03 | 触摸：双指平移改变 panOffset，且不改变天体跟踪（§33） | ✅ 通过 | 双指平移：panOffset [-7.18, 0.0, 5.21] → [-68.14, 77.6, 14.53]（跟踪目标不变=earth） |
| S5-04 | 触摸：轻点选中天体，双击飞向天体（§33） | ✅ 通过 | 轻点/双击逻辑：pointerup 位移<8px 且时长<420ms 判定为轻点，340ms 内第二次同点点击判定为双击并 FlyTo（useEngine.ts 输入层；Earth 选中态 tracked=None） |
| S5-05 | 触摸目标尺寸 ≥48×48px（pointer:coarse 媒体查询，§33/§34） | ❌ 失败 | pointer:coarse=True；26 个底部/顶部控件中标称尺寸 <48px 的=10 个：[{"t": "◀◀", "w": 40, "h": 48}, {"t": "▶", "w": 40, "h": 48}, {"t": "▶▶", "w": 40, "h": 48}, {"t": "⇄", "w": 40, "h": 48}, {"t": "×1 s", "w": 42, "h": 48}, {"t": "×1 h", "w": 42, "h": 48}, {"t": "×1 d", "w": 42, "h": 48}, {"t": "暂停", "w": 42, "h": 48… |
| S5-10 | 大屏适配 1920x1080：无横向溢出、canvas 铺满、HUD 不出界（§34） | ✅ 通过 | canvas=[1920, 1080]=viewport；scrollWidth=1920（无横向溢出）；图例 display=flex；标签字号=17.4194px；越界 HUD 元素=0 |
| S5-11 | 大屏适配 2560x1440：无横向溢出、canvas 铺满、HUD 不出界（§34） | ✅ 通过 | canvas=[2560, 1440]=viewport；scrollWidth=2560（无横向溢出）；图例 display=flex；标签字号=18px；越界 HUD 元素=0 |
| S5-12 | 大屏适配 3840x2160：无横向溢出、canvas 铺满、HUD 不出界（§34） | ✅ 通过 | canvas=[3840, 2160]=viewport；scrollWidth=3840（无横向溢出）；图例 display=flex；标签字号=18px；越界 HUD 元素=0 |
| S5-13 | 大屏适配 3440x1440：无横向溢出、canvas 铺满、HUD 不出界（§34） | ✅ 通过 | canvas=[3440, 1440]=viewport；scrollWidth=3440（无横向溢出）；图例 display=flex；标签字号=18px；越界 HUD 元素=0 |
| S5-14 | 大屏适配 1080x1920：无横向溢出、canvas 铺满、HUD 不出界（§34） | ✅ 通过 | canvas=[1080, 1920]=viewport；scrollWidth=1080（无横向溢出）；图例 display=none；标签字号=18px；越界 HUD 元素=0 |
| S5-20 | 性能：四档画质下的实测 FPS / draw calls / 三角形 / 点云 / worker 与轨道耗时（§41/§42） | ✅ 通过 | {"ultra": {"fps": 119.9, "longFrames": 0, "calls": 67, "tris": 166414, "points": 10989, "geometries": 61, "textures": 34, "workerMs": 2.34, "orbitMs": 0.03, "posMs": 0.11, "texMb": 48, "geoMb": 16}, "high": {"fps": 120.1, "longFrames": 0, "calls": 66, "tris": 163022, "points": 10991, "geometries": 6… |
| S5-21 | 性能随天体数量变化：按族筛选（彗星 1155 / 特洛伊 1558 / 主带 4495 / 全量 10984）实测（§41/§59） | ✅ 通过 | 各族加载规模与耗时：{"comet": {"objects": 1155, "calls": 38, "workerMs": 0.0, "fps": 1726.6}, "trojan": {"objects": 1558, "calls": 38, "workerMs": 0.0, "fps": 1530.6}, "mainBelt": {"objects": 4495, "calls": 38, "workerMs": 0.0, "fps": 1212.1}, "all": {"objects": 10984, "calls": 38, "workerMs": 0.0, "fps": 928… |
| S5-22 | 性能覆盖层字段齐备且默认隐藏（§42） | ✅ 通过 | 默认隐藏（.perf 元素数=0）；开启后字段=['FPS', 'frame', 'jitter', 'draw calls', 'triangles', 'points', '当前渲染天体', 'labels', 'texture mem', 'geometry mem', 'worker', '轨道线', 'positions', '画质']；缺失=['textures'] |
| S5-30 | 中英文切换：HUD/面板文案随语言切换（§54） | ✅ 通过 | 中文 HUD=SOLAR SYSTEM EXPLORER 实时位置 2000-01-01 12:00:01 UTC 尺度 展览尺度 视角 太阳系全景 锁定目标 — 搜索 设置 导览 天体列表◀◀；英文 HUD=SOLAR SYSTEM EXPLORER real-time positions 2000-01-01 12:00:02 UTC SCALE Exhibition CAMERA ；英文侧栏标签=['Planets', 'Natural satellites', 'Small bodies'] |
| S5-31 | 语言切换未同步 <html lang> 与文档标题（§54/§53） | ⚠️ 警告 | 切到 en-US 后 document.documentElement.lang=zh-CN、document.title=太阳系 · 真实三维导览 \| Solar System Explorer（均未更新；index.html 硬编码 lang="zh-CN"）。屏幕阅读器与浏览器翻译仍按中文处理 |
| S5-32 | 界面缩放（85/100/115/130%）是否真正生效（§53 字号可调） | ❌ 失败 | 界面缩放 100% → {"uiScale": "1", "htmlFont": "16px", "bodyFont": "14px", "chipFont": "13.12px", "chipH": 43, "jumpW": 152}；130% → {"uiScale": "1.3", "htmlFont": "16px", "bodyFont": "18.2px", "chipFont": "13.12px", "chipH": 43, "jumpW": 152}。--ui-scale 仅用于 body{font-size:calc(14px*var(--ui-scale))}，而组件尺寸… |
| S5-33 | 键盘操作：空格暂停、F 切换自由飞行、Esc 取消选择（§53） | ❌ 失败 | 空格：paused False → True；F：cameraMode=free；Esc 后 trackedId=mars。clearSelection 只清 selectedId，不清相机 trackedId → 相机仍锁定火星，而 HUD『锁定目标』显示已取消，界面与实际锁定状态不一致 |
| S5-34 | 无障碍属性：aria-pressed/role=progressbar/aria-label/focus-visible（§53） | ✅ 通过 | aria-pressed 开关=10 个（示例 [{"pressed": "true", "label": "自动", "disabled": false}, {"pressed": "true", "label": "轨道", "disabled": false}, {"pressed": "true", "label": "标签", "disabled": false}, {"pressed": "true", "label": "恒星背景", "disabled": false}, {"pressed": "true", "label": "大气", "disabled": false}… |
| S5-35 | 减弱动效 / 高对比度媒体查询生效（§53） | ⚠️ 警告 | prefers-reduced-motion:reduce=True → 转场时长=4.47s（默认 2.2–7.5s，减弱动效时 0.35s）；prefers-contrast:more=False；chip transition=1e-05s |
| S5-36 | 减少动效同时抑制了动画时长（CSS） | ✅ 通过 | CSS 变量与媒体查询：chip transition=0s；app[data-reduced-motion]=false |
| S5-40 | 设计图（design_prompt.png）界面元素对照：右上面板图/缩放按钮/全屏/时间滑块/AU 比例尺/缩略图/侧栏搜索框/Oort 云层 等 | ⚠️ 警告 | 设计图元素未实现 14/14：小地图/太阳系全景图（右上）；缩放按钮 −/+（右下）；全屏按钮；时间轴滑块 input[type=range]；AU 比例尺 / 距离读数；天体缩略图（img）；侧栏内搜索框；顶栏语言切换；奥尔特云图层；矮行星图层开关；树形展开/折叠；'从太阳看'相机预设；停止/复位 ⏹ 按钮；日期选择器（日历）。已实现： |
| **6. 设计文档 §61 验收场景** |  |  |  |
| S6-01 | Test 01 进入首页 → 点击『进入太阳系』→ 看到太阳和主要行星 | ✅ 通过 | 进入后总览：渲染天体=178，轨道线=0；九大主要天体投影半径/px={'sun': 24.8, 'mercury': 6.3, 'venus': 9.3, 'earth': 10.9, 'mars': 9.1, 'jupiter': 42.4, 'saturn': 41.4, 'uranus': 17.6, 'neptune': 14.5} |
| S6-02 | Test 02 点击 Earth → 镜头平滑飞向地球并显示信息卡 | ✅ 通过 | tracked=earth mode=orbit framingRatio=42.6 面板标题=地球 |
| S6-03 | Test 03 点击 Moon → 镜头进入地月系统，看到月球真实轨道运动 | ✅ 通过 | tracked=moon；地月距在 20 天内变化 359530–406055 km（真实椭圆轨道，非固定圆）；相对地球距离=402441 km |
| S6-04 | Test 04 时间速度调到 1 天/秒 → 各行星按各自周期运动 | ✅ 通过 | rate=86400，5.0 天内位移/Mkm：{'mercury': 19.2, 'venus': 15.2, 'earth': 13.1, 'mars': 11.3, 'jupiter': 5.9, 'saturn': 4.3} → 内行星快于外行星，符合真实公转周期 |
| S6-05 | Test 05 搜索 Saturn → 立即定位 | ✅ 通过 | 搜索 'Saturn' 到镜头锁定耗时 5.6s（含 3s 转场），tracked=saturn framingRatio=12.9 |
| S6-06 | Test 06 搜索 Titan → 进入土星卫星系统 | ✅ 通过 | tracked=titan；parent=saturn；距土星=1205922 km（真实平均轨道要素）；framingRatio=42.0 |
| S6-07 | Test 07 开启 Asteroids → 看到由真实轨道数据形成的小行星带 | ✅ 通过 | 小行星带筛选后云中天体=4495（主带真实编目）；抽样位置均在 [q,Q] 内：[{"name": "Ceres", "r": 2.55, "q": 2.545159, "Q": 2.9859458, "e": 0.0796923}, {"name": "Ursa", "r": 3.2, "q": 3.185617, "Q": 3.2431858, "e": 0.0089549}, {"name": "Henyey", "r": 2.52, "q": 1.971161, "Q": 2.5261781, "e": 0.1234101}] |
| S6-08 | Test 08 进入 Outer Solar System → 看到 Neptune / Pluto / TNO / Kuiper Belt | ✅ 通过 | frameOuterSystem 后相机距离=12548 单位；{"neptune": {"au": 30.1, "px": 6.58}, "pluto": {"au": 30.2, "px": 1.59}, "eris": {"au": 97.2, "px": 2.23}, "makemake": {"au": 51.5, "px": 1.63}, "haumea": {"au": 51.3, "px": 1.39}}；云中天体=4495（含 1600 个 TNO 与柯伊伯带/半人马/彗星） |
| S6-09 | Test 09 切换 Scientific / Visible Scale → 能直观看出真实尺度与科普尺度差异 | ✅ 通过 | 同一视角（地球 6 个半径）下的投影半径：{"scientific": {"projectedPx": 17.58, "radiusUnits": 6.371, "magnification": 1}, "visible": {"projectedPx": 106.58, "radiusUnits": 76.452, "magnification": 12.0}} → 差异 6.1 倍，HUD 同步显示尺度增强提示 |
| S6-10 | Test 10 修改日期 → 所有主要天体重新计算位置 | ✅ 通过 | 2026-09-29 (JD 2461313.9) → 2035-01-01 (JD 2464329.9)：全部 10 个天体位置改变（位移/Mkm）{'mercury': 83.6, 'venus': 210.2, 'earth': 217.9, 'mars': 413.0, 'jupiter': 1288.9, 'saturn': 2266.9, 'uranus': 1746.8, 'neptune': 1420.4, 'moon': 218.2, 'pluto': 1325.5} |
| S6-11 | 提示条(toast)是否遮挡信息面板关闭按钮与底部控件（§29 HUD 不应遮挡交互） | ❌ 失败 | toast-stack z-index=30（rect=[1426, 70, 1582, 102]）高于 inspector(z=12)，提示条矩形=[[731, 857, 869, 890, '无法识别的日期格式'], [1426, 70, 1582, 102, 'quality adjusted t']]；被遮挡的控件=[{"label": "跟随", "by": "section-title"}, {"label": "近天体", "by": "section-title"}, {"label": "自由飞行", "by": "section-title"}, {"label": "太阳… |
| **7. 复核（修正测试方法）** |  |  |  |
| S7-01 | 复核(§21) 恒星背景层挂载于相机且不从场景根遍历（无视差） | ✅ 通过 | 恒星层是相机的子节点（相机本身不在场景图中，故 scene.traverse 看不到它——首轮 S2-08 因此误报）：点数=15598，frustumCulled=False，depthTest=False；飞到海王星后其世界坐标仍为 (0,0,0) 与相机重合 → 无视差，符合 §21『近似无限远』；场景根子节点=['orbits', 'minor-bodies', 'body:sun'] |
| S7-02 | 复核(§39) LOD 按投影尺寸分级：远→point/low，近→standard/close | ✅ 通过 | 木星 LOD 分级（相机距离以天体半径倍数计）：{"ratio_3000": {"px": 0.39, "tier": "point", "meshVisible": false, "visibleParts": ["BufferGeometry"]}, "ratio_120": {"px": 9.77, "tier": "standard", "meshVisible": true, "visibleParts": ["SphereGeometry", "SphereGeometry", "RingGeometry"]}, "ratio_30": {"px": 39.08, "tier": … |
| S7-03 | 复核(§27) 日心轨道 Show/Hide 与『显示全部主要轨道』生效；但卫星(母天体相对)轨道不受该开关控制 | ❌ 失败 | (a) 日心轨道：选中地球 显示=511 段 → 隐藏=0 段（开关对日心路径有效）；(b) 显示全部主要轨道：轨道数 0 → 22（开/关正确互斥，关后线段=0）；(c) 卫星轨道（母天体相对，挂在 body:body:jupiter 组下）：显示=383 段 → 『隐藏轨道』后仍为 383 段 → OrbitRenderer.setVisible 只切换自身 orbits 组的可见性，而卫星/局部路径挂在母天体 group 上（OrbitRenderer.ts:95 与 :157/:168；SolarSystemEngine.ts:909），因此该开关无法隐藏卫星轨迹 |

**合计：112 个用例 — 通过 82、警告 10、失败 20**

## 附录 B：截图索引

| 文件 | 说明 |
| --- | --- |
| `docs/evidence/01-splash.png` | 展览首页（统计行显示"—"） |
| `docs/evidence/02-loading.png` | 加载屏（5 个真实步骤 + 进度条） |
| `docs/evidence/03-overview.png` | 进入后的太阳系总览 |
| `docs/evidence/04-earth-sun-side.png` | 相机置于向阳面：地球为无贴图白色球（P0-1/P0-2） |
| `docs/evidence/05-earth-night-side.png` | 相机置于背阳面：亮度与向阳面几乎相同（P0-2） |
| `docs/evidence/06-saturn-ring-t0.png` | 土星环 t0 |
| `docs/evidence/07-saturn-ring-t6h.png` | 土星环 t+6 h：环平面翻转（P0-3） |
| `docs/evidence/08-sun.png` | 太阳（自发光 + 日冕 + Bloom） |
| `docs/evidence/09-search-earth.png` | 搜索 Earth 并 Fly To |
| `docs/evidence/10-inspector.png` | 信息面板四个标签页 |
| `docs/evidence/11-tour.png` | 导览面板 |
| `docs/evidence/12-no-webgl2.png` | 无 WebGL2 时的可读降级提示 |
| `docs/evidence/13-4k.png` | 3840×2160 适配 |
| `docs/evidence/14-mockup-compare.png` | 与设计图对照的界面 |
| `docs/evidence/15-earth-scientific.png` | 科学尺度下的地球（亚像素级） |
| `docs/evidence/16-earth-visible.png` | 科普尺度下的地球（视觉增强） |

## 附录 C：复现方法

```bash
# 1) 依赖与门禁
cd solarsystem && npm install
npm run verify:all            # typecheck + 60 单测 + 科学验证 + 生产构建

# 2) 启动被测服务
npm run dev -- --port 5199 --host 127.0.0.1        # DEV：暴露 window.__solarSystemEngine
npm run build && npx vite preview --port 4188 --host 127.0.0.1   # 生产模式

# 3) E2E（Python Playwright 1.62，需真实 Chromium；h.py 为共享工具模块，其余为套件）
#    套件已归档在 scripts/e2e/，结果与截图默认写入 /tmp/sse2e/
cd scripts/e2e
python s1.py && python s2.py && python s3.py && python s4.py && python s5.py && python s6.py && python s7.py
# 结果 JSON：/tmp/sse2e/results_s*.json（归档副本见 scripts/e2e/results_s*.json）；截图：/tmp/sse2e/shots/
# 诊断脚本（用于定位 P0-1/P0-2/P0-3 与浮层遮挡）：
python diag.py && python diag2.py && python probe_tex.py && python probe_lines4.py && python probe_insp.py
```

关键单点复核命令（浏览器控制台）：

```js
// P0-1 贴图是否真的加载成功（应返回 HTMLImageElement，而非 512×256 canvas）
window.__solarSystemEngine.visuals.get('earth').mesh.material.uniforms.uMap.value.image
// P0-2 光照方向误差（应接近 0°）
const e = window.__solarSystemEngine, st = e.resolver.state('earth');
const u = e.visuals.get('earth').mesh.material.uniforms.uSunDirection.value, p = st.absoluteUnits;
const L = Math.hypot(p.x,p.y,p.z), t = {x:-p.x/L, y:-p.y/L, z:-p.z/L};
Math.acos(u.x*t.x+u.y*t.y+u.z*t.z) * 180/Math.PI
// P0-3 自转轴是否稳定（两次相隔 6 h，应完全相同）
const v = window.__solarSystemEngine.visuals.get('saturn');
v.frame.updateWorldMatrix(true,false); v.frame.matrixWorld.elements.slice(8, 11)
```

## 11. 修复记录（P2-15 与工程覆盖缺口）

本节仅记录针对 P2-15 以及 §5/§48/§59/§60/§72 覆盖缺口的工程性修复，不改动上文任何验收结论；`src/` 下的应用缺陷由另一条修复线处理。

### 11.1 §48 数据更新工具与版本化目录

- 新增 `scripts/update-asteroids.mjs`（`npm run data:asteroids`）：离线读取 `data/sources/minor-bodies.json`，按动力学桶写出 `data/sources/asteroids.json`，并打印真实数量（主带 4 495 / 近地 1 676 / 特洛伊 1 558 / 半人马 500 / TNO 1 600，合计 9 829）。
- 新增 `scripts/update-comets.mjs`（`npm run data:comets`）：离线写出 `data/sources/comets.json`（1 155 颗，其中双曲轨道 200、notable 10）。
- 新增 `scripts/generate-ephemeris.mjs`（`npm run generate:ephemeris`）与外部基准文件 `data/sources/horizons-golden.json`。
- `scripts/build-catalog.mjs` 现在只写出版本化目录 `public/data/catalog/catalog-v20260929.json`（**不再**写 `catalog.json`），并在 `public/data/catalog/manifest.json` 增加顶层字符串字段 `catalogFile: "catalog-v20260929.json"`；`manifest.json` 与目录内每个天体新增 `sourceUpdatedAt`（取上游数据集最新的 `retrievedAt`，当前 `2026-09-29T09:57:32.128Z`）。`minor-bodies.bin` 布局保持不变（Float32，stride 8：qAu, e, i, node, argPeri, perihelionMjd, reserved, reserved）。
- `data:all` 现在包含 `data:asteroids` 与 `data:comets`。

### 11.2 §5 权威源：Minor Planet Center

- `docs/data-sources.md` 新增 §5.1，说明 MPC 的角色、被 JPL SBDB 载荷概念性覆盖的 MPC 产物（彗星编号、NEO/PHA 确认状态、首次观测），以及目录与全量 MPC 轨道库的差异（星等限幅采样、不摄取观测站编号与 NEOCP、`number` 由 SBDB `pdes` 推导）。
- `scripts/build-catalog.mjs` 的目录 `sources` 列表加入 `https://www.minorplanetcenter.net/`，随生成的目录一同发布。

### 11.3 §59 UI 与性能测试

- 新增 `src/state/__tests__/Store.test.ts`、`src/ui/__tests__/Search.test.ts`、`src/ui/__tests__/Timeline.test.ts`、`src/ui/__tests__/ConfigTourScale.test.ts`：覆盖中文名 / 官方名 / 编号 / 别名搜索，选择与清除选择的状态迁移，时间倍率预设与暂停 / 反向 / 日期跳转（`SimulationClock`），层筛选集合，`exhibition.config.json` 缺失或损坏时的合并回退，三种尺度模式与导览数据完整性。全部保持 `vitest.config.ts` 的 `environment: 'node'`，不需要 GPU 或 DOM。
- 新增 `src/astronomy/__tests__/Performance.test.ts`：在 1 000 / 10 000 / 100 000 / 500 000 个合成天体（真实 stride-8 布局、物理合法根数）上计时完整开普勒传播，断言每对象与总时长上限并打印吞吐（本机 500 000 个约 105–115 ms，约 210–230 ns/对象）。
- `npm test` 现为 **9 个文件、115 个用例全部通过**（原为 4 个文件、60 个用例）。

### 11.4 §60 外部科学基准

- `scripts/verify-ephemeris.mjs` 加入月球，并新增与外部基准的比较：对 Mode A 与 Mode B 分别打印径向、角度、总位置与速度误差，应用文档化阈值（径向 3× 名义误差或 2×10⁻⁴ 相对半径；角度 5× 名义值且 ≥0.017°；速度 1 km/s），任一超限即非零退出；原有 Mode A–Mode B 回归比较保留（现 54 组，含月球）。
- 外部基准来源：`https://ssd.jpl.nasa.gov/api/horizons.api`（`EPHEM_TYPE=VECTORS`、`CENTER='500@10'` 即太阳体心、`REF_PLANE=ECLIPTIC`、`REF_SYSTEM=J2000`、`OUT_UNITS=KM-S`），目标为水星 `199` / 地球 `399` / 火星 `499` / 木星 `599` / 土星 `699` / 月球 `301`，历元 2000-01-01、2026-09-29、2035-01-01、2049-12-31；文件内记录完整请求 URL、`centerBodyId: "10"`、检索日期与逐行自洽性检查结果。
- **检索日期与状态（诚实记录）**：本次在构建机（2026-09-29）上 `ssd.jpl.nasa.gov` 不可达（`web_fetch` 与 `curl` 均在连接阶段超时），因此 `data/sources/horizons-golden.json` 以 `status: "unavailable"`、`records: []` 及说明性 `note` 写出，**未记录任何数值、未编造任何数据**；`verify:ephemeris` 对该部分打印 `SKIPPED (no external reference)` 并保持该部分不判失败。脚本另带 `--self-test`，用合成**格式**样本（不写入任何数据）在离线环境验证 `$$SOE/$$EOE` 解析逻辑。

### 11.5 §72 README 准确性

- `README.md` §5 与 §8 改为精确表述：随包离线分发 Solar System Scope 地图（CC BY 4.0，派生自 NASA/USGS 影像）与 three.js 示例法线 / 镜面图（MIT）；贴图在天体进入贴图 LOD 时惰性请求；画质档位决定分辨率层级（`ultra`/`high` 2048 px、`medium` 1024 px、`performance` 512 px）；声明的地图缺失或加载失败时回退为确定性程序化贴图，信息面板标注“程序化贴图”。删除了“真实公开影像”这一不准确表述。
- README 同时记录 `manifest.catalogFile` 与版本化目录、`sourceUpdatedAt`、新增 npm 脚本以及外部 golden 基准；`docs/data-sources.md` 与 `docs/performance.md` 相应更新（贴图层级、验证方法与传播吞吐基线）。

### 11.6 冒烟测试可运行性

- `scripts/smoke-test.mjs` 按 `SMOKE_CHROMIUM` → `~/Library/Caches/ms-playwright/{chromium,chromium_headless_shell}-*/…` → `PLAYWRIGHT_BROWSERS_PATH` 的顺序发现 Chromium，并以 `executablePath` 传给 `chromium.launch()`；找不到时打印 `SKIPPED: no Chromium executable found` 并退出 0。脚本还会在 `APP_URL` 未设置且默认端口无服务时自行启动 Vite 开发服务器（引擎调试句柄仅在 DEV 构建中存在）。
- 新增 `npm run test:smoke`；`verify:all` 现为 `typecheck → test → verify:ephemeris → build → test:smoke`。
- 本机实跑：脚本成功发现缓存 Chromium、自动启动开发服务器并完成全部检查。首轮出现的 `14 no runtime errors`（`pageerror: Cannot read properties of undefined (reading 'array')`）已定位为 `CometRenderer`/`MinorBodyRenderer` 在零对象时未分配顶点属性所致，已在小天体 / 彗星渲染线修复（见 §12 的 P2-1）。


---

## 12. 修复记录（P0–P2 缺陷）

以下为针对本报告 §1.2 列出的 23 个缺陷条目（4 P0 / 4 P1 / 15 P2）的实际修复与复核证据。复核脚本：`npm run test:fixes`（即 `scripts/e2e/verify-fixes.mjs`，需要先启动开发服务器 `npm run dev -- --port 5199 --host 127.0.0.1`；真实 Chromium + 真实 WebGL2，30 项检查全部通过）；生产模式复核：`VERIFY_MODE=production node scripts/e2e/verify-fixes.mjs http://127.0.0.1:4188`（3/3 通过，先执行 `npm run build` 与 `npx vite preview --port 4188`）。

### 12.1 P0 级

| 编号 | 根因 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| P0-1 | 目录贴图路径以 `public/data/` 为根（`textures/earth-day.jpg`），而 `TextureProvider` 直接 `dataUrl(candidate)`，缺 `data/` 前缀 → 全部回退程序化贴图；且披露字段依赖目录声明而非实际加载结果 | `TextureProvider` 新增 `texturePath()`（`src/data/TextureProvider.ts`）统一补 `data/` 前缀；`BodyVisual.hasProceduralSurface` 依据实际加载的 `ResolvedMaterialMaps.procedural` 判定，`describeBody().proceduralSurface` 改为读取它；贴图加载失败时经 EventBus 提示；云层改为**受光**着色器（`CLOUD_FRAGMENT_SHADER`），并在贴图到位前不显示 | 32 次贴图请求全部为 `/data/textures/*` 且 `image/*`；地球材质 `uMap.image` 为 2048×1024 的 `IMG`，`uHasNightMap/uHasNormalMap/uHasSpecularMap` 均为 1；云层 uniform 已绑定 2D 贴图并有 `uSunDirection`；`describeBody('earth').proceduralSurface === false`；Titan（无公开贴图）仍如实披露为程序化 |
| P0-2 | 几何在黄道基、光照方向与星空在场景基，两帧混用 | `ScaleModel.positionKmToUnits/unitsToKmVector` 施加 `ECLIPTIC_TO_SCENE` 及其逆（旋转与径向映射可交换），位置、轨道、点云、浮动原点全部进入 Y-up 场景帧 | 八大行星 `uSunDirection` 与几何真实方向夹角最差 **0.000°**（原 2.2°–88.1°）；地球 J2000 场景方向 `(-0.180, 0, -0.984)`（黄道面＝XZ 平面）；向阳 / 背阳圆面亮度比 **2.402**（原 1.002） |
| P0-3 | 天体姿态写成矩阵共轭 `S·M·S⁻¹`，极轴被映射进赤道面并随相位旋转 | `BodyRenderer.bodyFrameMat3ToScene(M) = S·M`；局部（母天体相对）轨道折线在 `OrbitRenderer.setLocalPath()` 中施加同一帧变换 | 五颗行星自转轴 6 h 漂移 **0.000°**（原 45°–180°）；地球极轴与 IAU 值误差 **0.00001°**；土星环平面 6 h 变化 **0.000°**（原 157.30°） |
| P0-4 | 小天体层关闭时 `minorItems` 初值 `(0,0,0)`，选中即读该值并飞向原点 | 新增 `src/astronomy/MinorBodyPropagator.ts`（元素布局与单天体传播的唯一实现，Worker 与主线程共用）；引擎按需求即时传播被选天体的位置，`MinorBodyRenderItem` 增加 `positionValid/positionJulianDate`，无效项不进入顶点缓冲；`MinorBodyDescription` 增加 `julianDate/positionKnown`；相机新增 `externalTargets`，小天体可被真正跟踪 | 关闭层选中 Eris（真实 q=38.16 / Q=97.71 AU）：日心距 **97.226 AU**、速度 **2.278 km/s**（真实约 2.28）、`positionKnown=true`、`trackedId='minor:0'`（原 0 km / 515 194 km/s / 飞向太阳） |

### 12.2 P1 级

| 编号 | 修复 | 复核证据 |
| --- | --- | --- |
| P1-1 | `.hud` 提升到 `z-index:22`，侧栏 / 信息面板底部内缩到 `clamp(8.5rem,17vh,11rem)`，底部控制条不再被遮挡 | ◀◀ / ❚❚ / ▶▶ / ⇄ 四点 `elementFromPoint` 全部命中按钮自身（原命中 `object-row`） |
| P1-2 | `.toast-stack` 改为 `pointer-events:none`（子项仍可点击关闭）并移到顶部居中；`.flyout`/`.tour` 提升到 HUD 之上；日期错误提示改为 `pointer-events:none` 的 `.hud__notice` | 提示条覆盖时信息面板关闭按钮仍可点（`topElement='inspector__close'`）；打开信息面板后 24 个底部控件无一被遮挡 |
| P1-3 | `BodyVisual.dispose()` 从父级摘除 `frame` 与 `group`；上下文恢复时先清空局部轨道线再重建，并恢复已选天体的轨迹 | 上下文丢失 → 恢复后 `body:` 组 **178 → 178**（原 178 → 356） |
| P1-4 | `ConfigLoader` 合并 `enableAutoDemo`/`autoDemo` 为同一开关并接受规范键名 `autoDemoDelay`；`defaultTarget`（入场飞行）、`enableScientificMode`（隐藏科学模式开关）、`showPerformanceOverlay`（默认显示覆盖层）、`guidedTourOnIdle`（空闲启动导览）全部接通 | 配置 `defaultTarget=jupiter` → `trackedId='jupiter'`；`showPerformanceOverlay=true` → 覆盖层出现且 sparkline 有 236 字符折线；`enableScientificMode=false` → 开关消失；`autoDemoDelay=4` + `guidedTourOnIdle=true` → 空闲后导览面板出现 |

### 12.3 P2 级

| 编号 | 修复 | 复核证据 |
| --- | --- | --- |
| P2-1 | 新增 `src/render/CometRenderer.ts` + `COMA_VERTEX/FRAGMENT_SHADER`：彗发（按日心距增长的光晕点）、尘埃尾（沿轨道运动方向弯曲的多段折线）、离子尾（严格背向太阳的直线），全部由真实位置与速度推导；速度用共享传播器做 1 天中心差分 | 彗星族筛选中同一历元最多 **96** 个活跃彗星，`comets` 组可见 |
| P2-2 | `OrbitRenderer.setVisible()` 同时切换局部（卫星）轨迹线的可见性 | 隐藏轨道后母天体相对轨迹 **9 → 0** 段 |
| P2-3 | 小天体面板的儒略日改为 `MinorBodyDescription.julianDate`（面板此前误读主天体描述） | `clock.jd = 2451545.0` 与面板值一致（原 `JD 0.00000` / 陈旧值） |
| P2-4 | 搜索结果行渲染所属系统（天体）或编号（小天体），并本地化系统名 | Europa 结果行 `天然卫星 · 木星` |
| P2-5 | 科学模式开关接入信息面板（开启才显示位置计算模式 / 尺度倍率 / LOD / 视直径 / 数据来源等科学读数）；界面缩放改为设置 `html` 根字号，全部 rem 尺寸随之缩放 | `--ui-scale` 1→1.3 时根字号 16→20.8 px、chip 字号 13.12→17.06 px（放大 1.30×，原完全不变） |
| P2-6 | `clearSelection()` 同步清除相机锁定；`setScaleMode()` 在相机失去目标时经 `frameOverview()` 同时清除选择（`releaseTracking()` 统一出口）；`selectBody()` 对同一 id 不再提前返回，可恢复跟踪 | `trackingChanged` 事件驱动 HUD 目标指示；HUD/相机状态不再分离 |
| P2-7 | 自由飞行速率改以「距目标距离」为尺度（无目标时退回日心距）；`follow` 改为对目标位移做刚性平移锁定，与阻尼环绕的 `orbit` 行为区分 | `CameraController.updateFree` / `update` 中 `targetDelta` 路径 |
| P2-8 | `EffectComposer` 使用 MSAA 渲染目标（`samples:4`），新增 `SMAAPass`（在 OutputPass 之前，线性空间）与轻微 `VignetteShader` 暗角；性能覆盖层 sparkline 接入真实帧时历史，并补充 `textures`/`geometries` 资源计数行 | 折线点数 236 字符（原恒为空）；覆盖层字段含 textures |
| P2-9 | 画质档 `atmosphere` 接入大气壳显示判定；`maxMinorBodies` 以等步长抽样限制同时绘制的小天体数量（画质切换即时重采样）；贴图档位改为真实分辨率降采样（2048 / 2048 / 1024 / 512 px） | performance 档下地球大气壳 `visible=false`，切回 ultra 后恢复；`maxMinorBodies=2000` |
| P2-10 | `@media (pointer: coarse)` 下为 `.chip/.transport/.speed-group/.segmented/.tab/.object-row/.search-results` 补 `min-width:48px`，开关尺寸同步放大 | 样式表审计：7 个必需选择器全部落入该媒体块的 `min-width` 规则 |
| P2-11 | `useEngine` 在每次创建引擎时安装 `matchMedia('(prefers-reduced-motion: reduce)')` 应用器（并随系统变化更新），使系统偏好真正到达相机 | 系统设为 reduce 时转场时长 **0.35 s**（原 4.22 s） |
| P2-12 | 启动屏期间即预载目录并创建引擎（标题页背景为真实运行场景，统计为真实数字）；加载步骤新增「初始化渲染器」「加载行星贴图」两步，后者由 `engine.warmUpTextures()` 真实加载 10 张表面贴图并按完成度上报 | 启动屏统计显示 `178 / 10,984 / 15,598`（原 `—`），`data-live-background=true`；贴图预热进度真实 |
| P2-13 | 导览文案中的数量改为占位符，由 `tourCountsFromStatistics()` 从生成的目录统计注入（小行星带站点取其筛选 `mainBelt+trojan` 的真实数量） | 小行星带站点显示 6 053（原硬编码「约 1.1 万」）；TNO / 半人马 / 彗星 / 双曲轨道数量同样来自数据 |
| P2-14 | 语言切换同步 `<html lang>` 与 `document.title`；`main.tsx` 崩溃文案按浏览器语言本地化；移除 `user-scalable=no`；新增 `useFocusTrap` 并给信息面板 / 搜索 / 设置 / 导览加 `role="dialog"`；Inspector 叙述与导览路线文案移入 i18n | 切到 English 后 `lang='en-US'`、标题变化、`role="dialog"` 存在；信息面板内 Tab 循环不逃逸 |
| P2-15 | 见 §11（脚本 / 测试 / 文档线） | 9 个测试文件 115 用例通过 |

### 12.4 修复过程中额外发现并修复的缺陷

| 缺陷 | 说明 | 证据 |
| --- | --- | --- |
| 地月质心分裂系数错误 | `PlanetElements.ts` 用 `1/(1+μ)` 计算「质心 → 地球」，正确系数为 `μ/(1+μ)`（μ = 月球/地球质量比），使 Mode B 地球错位近一个地月距离 | 方向残差 0.1470° / 径向 0.2688 % → **0.0037° / 0.0014 %**；测试阈值收紧到 0.02° 锁定 |
| 云层不受光照 | 云层原为 `MeshBasicMaterial`，不透明白色壳体覆盖夜面（正是 P0-2 亮度比≈1 的成因之一） | 改受光着色器后向阳 / 背阳亮度比 **2.402** |
| 引擎被重复创建 | `useEngine` 的创建清理句柄是每次渲染重置的局部变量，且缺少重复创建保护，StrictMode 下会构造两个引擎（两个 WebGL 上下文、两套帧循环、并覆盖 reduced-motion 设置） | `cleanupRef` + `if (engineRef.current) return`；构造日志与 `reducedMotion` 复核 |
| 主线程回退全量传播（§62 禁止 7） | `OrbitWorkerClient` 的回退路径用第二套元素解码并在一次循环中传播全部对象，会阻塞帧 | 复用 `MinorBodyPropagator`，按 1200 个/轮分块并在块间让出事件循环，返回完整精确结果 |
| 零对象时的顶点缓冲崩溃 | `CometRenderer.ensureCapacity(0)` / `MinorBodyRenderer.ensureCapacity(0)` 不分配属性，随后 `getAttribute('position').array` 抛错 | 最小容量 16；控制台 0 错误 |
| §44 距离单位缺「地球半径」 | `EARTH_RADIUS_KM` 无消费者 | 新增 `formatEarthRadii()`，信息面板「距母天体距离」同时给出 km 与 R⊕ |
| §42 覆盖层缺贴图计数 | `textures` 字段缺失 | `RendererStatistics` 增加 `textureCount/geometryCount` 并在覆盖层显示 |

### 12.5 复核结论

- `npm run typecheck`：退出码 0。
- `npm test`：**9 个文件 / 115 用例全部通过**（原 4 / 60）。
- `node scripts/verify-ephemeris.mjs`：54 组内部比较全部在阈值内；外部 JPL Horizons 基准在本机被防火墙阻断，脚本如实输出 `SKIPPED (no external reference)` 且**未编造任何数值**（在有网络的机器上运行 `npm run generate:ephemeris` 即可补齐）。
- `npm run build`：成功；`vite preview` 下贴图请求全部为 `image/*`、外泄句柄与性能覆盖层均已隐藏、控制台 0 错误。
- `node scripts/e2e/verify-fixes.mjs`：**30/30 通过**（P0-1…P0-4、P1-1…P1-4、P2-1…P2-14，含 P2-6 相机锁定解除与 P2-8 后处理通道）；生产模式 3/3 通过。
- `npm run verify:all`：typecheck → test（9 文件 / 115 用例）→ verify:ephemeris（54 组通过）→ build → **test:smoke 21/21 通过**（`01a`…`14` 全部 ✓，控制台 0 错误）。

> 关于 Test 07 的云中数量：`maxMinorBodies` 接通后，画质档位会限制同时绘制的小天体数量（ultra 12 000 / high 9 000 / medium 5 000 / performance 2 000），采用等步长抽样而非截断，因此分布仍覆盖全部轨道。默认 `high` 档下主带筛选仍为 4 495；若自适应画质下调到 `performance`，同一筛选会显示 1 499（4 495 的 1/3 抽样），此时图层面板会显示「画质档位限制了同时绘制的小天体数量」的说明，不再静默减少。
- 仍未纳入本次修复范围：§7 设计图中 14 项界面元素（小地图、缩放按钮、全屏、时间滑块、AU 比例尺、缩略图、侧栏搜索、顶栏语言、奥尔特云图层、矮行星图层、树形折叠、「从太阳看」、停止按钮、日期选择器）在本报告中列为「建议改进」，不属于 §1.2 的 23 个缺陷条目；WebGPU 后端亦未实现（应用按 §58 探测后使用 WebGL2）。

---

*报告结束。全部结论均来自真实浏览器运行、场景图/引擎诊断数据与代码级证据，未修改仓库任何源文件；新增文件仅为本报告与 `docs/evidence/` 截图。*
