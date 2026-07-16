# Web3D 影视级太阳系项目 — 工程规格说明书 (spec.md)

> 状态：规格制定完成，待评审批准后进入执行
> 基线设计文档：`docs/Web3D影视级太阳系项目完整设计文档.md`（V1.0，2026-07-16）
> 本文件将设计文档翻译为可执行的工程规格。设计文档是需求与决策的唯一来源；本规格不修改任何已确认决策，只细化实现路径、技术选型与验证策略。

---

## 1. 执行范围与策略

### 1.1 总体原则

设计文档定义的是一个多团队、多阶段的完整产品（阶段 0—8）。本次执行以**严格遵循设计文档、建立可验证的工程底座**为第一目标，按设计文档的阶段顺序与技术门禁推进。

执行策略：

1. **严格遵循设计文档**：所有架构决策、模块边界、技术栈、真实性边界、资产分级、离线原则均以设计文档为准，不擅自增减范围。
2. **门禁驱动**：按附录 C 的五项技术门禁分阶段推进，未通过门禁不进入下一阶段资产/功能开发。
3. **可验证优先**：每个任务产出可运行的代码与可执行的验证（类型检查、单元测试、构建、运行时冒烟）。
4. **数据与代码分离**：天体目录、星历、科普内容通过版本化 Schema 驱动，不硬编码天体数量。

### 1.2 本次执行目标

建立设计文档**阶段 0（技术风险验证）**的完整可运行底座，并完成阶段 1（天文模拟底座）与阶段 2（核心渲染引擎）的关键基础设施，使其满足阶段 0 的全部退出条件：

- React 壳 + Three.js WebGPU/WebGL 2 双路径；
- 太阳、地球、月球可渲染；
- 高精度星历（地月）+ Rust/WASM Worker；
- 浮动原点与局部参考系；
- 地球大气；
- 时间控制；
- 基础性能检测；
- 离线运行。

> 说明：完整产品的全部资产生产、全球地形瓦片数据、全部卫星目录、20 个巡航等内容型/数据型工作需由数据管线与资产团队持续推进，不在单次代码执行范围内；但代码架构与接口必须为这些扩展预留完整挂载点。

### 1.3 明确不在此规格范围内

- 不修改设计文档已确认决策；
- 不引入设计文档明确排除项（账户、后端、音频、移动端、VR/AR、用户创作、本地持久化等）；
- 不伪造高精度数据；数据不足时按 P0—P4 降级并标识。

---

## 2. 技术栈与版本基线

严格遵循设计文档第 2 章与第 9.2 节。

| 层 | 选型 | 备注 |
|---|---|---|
| 应用层 | React + TypeScript（strict）+ Vite + shadcn/ui | 轻量状态管理，CSS Variables 主题 |
| 三维引擎 | 原生 Three.js（不用 R3F 管理核心场景） | WebGPURenderer 主路径，WebGLRenderer 兼容路径 |
| 着色器 | TSL/WGSL + GLSL 兼容 | 双后端语义统一 |
| 天文内核 | Rust → WebAssembly + Web Worker | 不引用 Three.js 类型 |
| 星历构建 | NAIF SPICE Toolkit（构建期）+ 切比雪夫插值（运行时） | 联网加工与离线运行严格分离 |
| 数据工具链 | Python（ETL）、GDAL、Blender、KTX2、glTF/GLB、Meshopt | 构建期使用 |
| 校验 | SHA-256 | 资源完整性 |
| 部署 | 纯前端静态，localhost HTTP / 局域网 HTTPS | 无业务后端 |

版本冻结（发布时记录，开发期使用锁定版本）：Three.js、WebGPU 能力快照、浏览器版本、Rust/wasm-pack 版本。

---

## 3. 工程目录结构

遵循设计文档第 41 节推荐结构。Monorepo（pnpm workspace + Cargo workspace）：

```
solar-system/
  apps/web/                      # React 壳（Vite 入口）
  packages/
    app-orchestrator/            # 会话状态/模式/导航/巡航/画质编排
    astro-core-api/              # 内核 TS 接口与类型（Worker 消息协议）
    render-engine/               # 渲染后端抽象、渲染图、相机、资源
    renderer-webgpu/             # WebGPU 实现
    renderer-webgl2/             # WebGL 2 实现
    body-renderers/              # 太阳/固态/气态/环/彗星专项渲染
    terrain-engine/              # Cube-Sphere 瓦片 LOD
    resource-runtime/            # Manifest/Range/LRU/哈希
    navigation-service/          # 搜索索引/层级/镜头过渡
    tour-player/                 # 只读巡航播放
    content-service/             # 简体中文科普
    diagnostics/                 # 诊断面板
    schemas/                     # 版本化 JSON Schema
  crates/
    astro-core/                  # Rust 内核：时间/星历/姿态/事件
    ephemeris-runtime/           # 切比雪夫插值运行时
    event-engine/                # 事件求解
    time-system/                 # UTC/TAI/TT/TDB
    coordinate-system/           # 参考系与坐标转换
  tools/
    ephemeris-pipeline/          # SPK→紧凑二进制
    catalog-pipeline/            # 天体目录生成
    manifest-builder/            # 资源清单
    search-index-builder/        # 搜索索引
    benchmark-generator/         # 基准对照样本
  data-src/{raw,normalized,provenance}/
  assets-src/{bodies,terrain,effects}/
  release/{manifests,packages,checksums,licenses}/
  tests/{astro-reference,visual-regression,performance,compatibility,offline}/
  docs/
```

---

## 4. 架构与关键设计

### 4.1 分层与数据流（设计文档 9.1）

```
React 应用层 ──命令+低频快照──> 应用编排层
                                  │
        ┌─────────────────────────┴──────────────────────────┐
   天文模拟内核 (Rust/WASM + Worker)        Web3D 渲染引擎 (Three.js)
   时间/星历/姿态/事件                       WebGPU/WebGL2
        │ 状态快照                            │ 资源请求
        └─────────────数据与资源服务层──────────┘
                          │ HTTP Range / 静态文件
                  本地或内网静态服务器
```

核心原则（设计文档 9.3）：

1. React 不参与逐帧天体状态更新；
2. 天文内核不引用 Three.js 类型；
3. 渲染引擎不自行推算轨道；
4. 运行时数据通过版本化 Schema 交付；
5. WebGPU 与 WebGL 2 共享语义；
6. 高精度优先，缺失降级；
7. 大文件按需加载，禁止启动全量读取；
8. 联网数据加工与离线运行严格分离。

### 4.2 天文时间系统（设计文档 11）

- 内核时间尺度：JD、UTC、TAI、TT、TDB；
- 转换链：UTC →(闰秒表)→ TAI →(+32.184s)→ TT →(周期修正)→ TDB；
- 闰秒：离线包含最新闰秒表；当前日期前用正式闰秒，未来用"最后已知表 + 预测 Delta T"并标识；
- 内部轨道计算基于连续时间尺度，避免 UTC 跳秒导致轨道不连续；
- 时间倍率档位：-1年/s … 暂停 … +1年/s；高倍率按目标时刻直接计算状态（FR-TIME-005）。

### 4.3 坐标与精度（设计文档 12）

- 科学计算统一双精度；
- 参考系：SSBI / 日心惯性 / 行星质心 / 天体固连 / 地表 ENU / 观察者相对；
- 每个状态携带参考系标识，禁止跨系直接相加；
- 渲染采用浮动原点 + 局部参考系 + 高低位拆分，GPU 用 32 位浮点；
- 深度策略：反向 Z / 浮点深度 / 对数深度 / 多相机分层，按场景选择。

### 4.4 星历引擎（设计文档 14）

- 核心天体（日、八大行星、月球）：JPL 行星月球星历 → 构建期转分段切比雪夫系数；
- 运行时按 bodyId/TDB/参考系定位系数块并插值；
- 轨道线自适应步长采样，曲率高/近日点/事件附近加密；
- 缓存：当前时刻前后小窗口状态、按 (天体,时间窗,参考系,精度) 键控的轨道采样。

### 4.5 渲染架构（设计文档 18—19）

- 渲染后端统一接口：init/capabilities/createTexture/createBuffer/executeRenderGraph/compute/gpuTime/deviceLost/dispose；WebGPU 与 WebGL 2 分别实现；
- 渲染图节点：太阳与恒星背景 / 远景天体 / 主目标不透明 / 地形 / 阴影与食 / 大气散射 / 体积云 / 透明环系 / 极光磁层 / 空间粒子 / Bloom / 色调映射 / AA / UI 合成；
- HDR + 自动/目标曝光 + 镜头切换曝光平滑；科学模式降耀光，影视模式受控 Bloom；
- 阴影：太阳为主光源；近景级联/局部高精度；食用解析天文几何，不依赖常规 shadow map。

### 4.6 尺度映射（设计文档 17）

- 真实比例模式：单一长度比例，尺寸与距离同倍率，轨道无压缩，标签可屏幕空间增强；
- 增强模式：分层映射（恒星半径/行星半径/行星轨道/卫星轨道/小天体最小可见/空间结构密度），映射单调连续可逆，UI 显示倍率，不改物理计算；
- 太阳系层 → 行星轨道层 → 行星系统层 → 卫星系统层 → 低轨层 → 地表层，过渡插值无突变。

### 4.7 资源治理（设计文档 29）

- 分包：core-app / core-astro / core-bodies / cinematic-bodies / satellites-a / satellites-bc / terrain-* / small-bodies / extended-space / tours / content-zh-cn / diagnostics；
- Manifest 字段：逻辑ID/路径/包ID/版本/大小/SHA-256/MIME/依赖/质量等级/适用后端/解码/GPU 估计内存/来源引用；
- 加载优先级：当前目标可见核心 > 过渡路径 > 近景 > 下一巡航节点 > 邻近系统 > 后台预取；
- 取消与降级：目标变化取消过期请求，高 LOD 失败回退低 LOD；
- 显存预算：影视级 5—6 GB，标准 1.5—2.5 GB；同时只允许一个主目标最高 LOD。

### 4.8 自动画质（设计文档 30）

- 档位：影视级 / 极高 / 高 / 标准 / 安全；
- 能力检测：Adapter/特性/限制/压缩纹理/时间戳/分辨率/真实基准，不只看 GPU 名；
- 动态降级顺序：内部分辨率→粒子密度→阴影→体积云大气→后期→地形 LOD→纹理 MIP→环粒子→镜头光学→简化材质；
- 迟滞：连续低帧一段时间才降级，连续高帧更长时间才升级，镜头快速移动临时降级。

### 4.9 离线与部署（设计文档 31）

- 单机 localhost HTTP / 局域网 HTTPS（可信 CA）；
- 禁止 file://（ESM/Fetch Range/Worker/WASM/MIME/WebGPU 安全上下文限制）；
- 静态服务器：正确 MIME、HTTP Range、Brotli/Gzip、ETag、不可变缓存、SPA 回退、可配 COOP/COEP、HTTPS、可关日志；
- 资源包可独立校验/安装/回滚；先校验后切换 Manifest，失败回滚。

### 4.10 真实性标识（设计文档 27、25.3）

- R1 确定性计算 / R2 公开观测数据 / R3 科学模型统计推演 / R4 影视增强；
- 一个天体可同时多级（地球地形 R2 + 大气散射 R3 + 镜头光晕 R4）；
- UI 在模式栏/数据卡片/尺度状态/资源详情显示真实性文本；
- 程序化外观必须显示"示意外观"，不以超出来源精度展示小数位。

---

## 5. 验证策略

每个任务执行后必须验证。验证分层：

| 层级 | 手段 | 工具 |
|---|---|---|
| 静态 | TypeScript strict 类型检查、Rust clippy/fmt、ESLint | tsc --noEmit、cargo clippy、eslint |
| 单元 | 天文内核（时间/闰秒/切比雪夫/坐标/姿态/求根）、应用层（搜索/模式/巡航状态机/Manifest 依赖） | vitest、cargo test |
| 基准对照 | 核心天体每年多点、近日远日点、典型日月食/凌日、主要卫星、月球天平动 vs JPL Horizons/SPICE | tests/astro-reference |
| 构建 | 前端构建产物、WASM 打包、Manifest 生成 | vite build、wasm-pack、自定义构建脚本 |
| 运行时冒烟 | dev server 启动、WebGPU/WebGL2 路径、地月渲染、时间控制、浮动原点无抖动、离线 fetch | playwright/手测脚本 |
| 集成 | UI 时间→星体更新、搜索→跳转、事件→播放、资源缺失→降级、WebGPU 失败→WebGL2、巡航切尺度图层、瓦片加载释放 | vitest + dom |
| 视觉回归 | 固定相机/时间/画质/浏览器/GPU/资源版本的截图对比 | tests/visual-regression |
| 性能 | 首屏/全景/低轨/地表/土星环/小天体/高速时间/事件/连续切换/2h 长稳 | tests/performance |
| 兼容 | Chrome/Edge/Firefox × Win10/11，WebGPU/WebGL2，NVIDIA/AMD/Intel | tests/compatibility |
| 离线 | 断网、清缓存、单机、内网 HTTPS、缺可选包、包损坏、升级回滚 | tests/offline |

门禁（设计文档附录 C）：

1. 星历可行性：核心天体基准对照通过才进资产制作；
2. 坐标可行性：太阳系→低轨连续导航无抖动才进全球地形扩展；
3. 双后端可行性：WebGPU/WebGL2 共享架构可维护才进大规模 Shader；
4. 资源治理：显存预算/取消/回收实现才导影视级超大资源；
5. 离线部署：localhost + 内网 HTTPS 验证才进正式交付。

---

## 6. 阶段交付映射

| 设计文档阶段 | 本规格执行内容 | 门禁 |
|---|---|---|
| 阶段 0 技术风险验证 | React 壳、Three.js 双路径、日地月、高精度星历、Rust/WASM Worker、浮动原点、地球大气、地形瓦片骨架、时间控制、性能检测、离线 | 退出条件全满足 |
| 阶段 1 天文模拟底座 | 时间系统、参考系、星历内核、姿态、状态快照、轨道采样、事件算法框架、基准对照、Schema | 门禁 1 |
| 阶段 2 核心渲染引擎 | 渲染后端抽象、局部参考系、相机、资源管理器、HDR/后期、阴影与食几何、自动画质、诊断面板 | 门禁 3、4 |
| 阶段 3 太阳与八大行星 | S 级资产、太阳专项、固态材质、气态云层、地球专项、土星环、科普卡片、视觉回归基线 | 门禁 1—4 |
| 阶段 4 卫星与扩展天体 | 目录快照、已命名卫星索引、A 级卫星、B/C 生成、矮行星、代表小行星彗星、搜索关系导航 | — |
| 阶段 5 地形系统 | Cube-Sphere、LOD、地球/月球/火星全球覆盖、地表相机、分包、长稳 | 门禁 2 |
| 阶段 6 扩展空间环境 | 小行星带、特洛伊、柯伊伯、奥尔特、太阳风、日球层、磁层极光、真实星空 | — |
| 阶段 7 事件与巡航 | 事件搜索、日月食凌日、事件自动相机、20 巡航、纯净模式、预加载 | — |
| 阶段 8 产品化交付 | Chrome/Edge 验收、Firefox 兼容、Win 安装包、单机/局域网部署、校验、升级回滚、测试报告、许可清单、运维/用户手册 | 门禁 5 |

执行顺序严格按门禁串行推进，详见 `tasks.md`。

---

## 7. 风险与边界（设计文档 39）

执行中重点规避：

- 影视级目标无限扩张 → 以 S/A/B/C 验收标准与镜头距离边界约束；
- WebGPU 浏览器差异 → WebGL 2 降级 + 版本冻结 + 驱动黑名单；
- 显存峰值失控 → 预算 + 请求取消 + LRU + 单主目标最高 LOD；
- 程序化资产被误解为真实 → 强制 R3/R4 标识；
- 事件算法误差 → 基准样本 + 数值收敛 + 精度分级；
- 数据许可差异 → 逐数据集台账。

任何超出当前数据覆盖范围的结果不得给出虚假精度；任何视觉增强不得被标识为真实观测。
