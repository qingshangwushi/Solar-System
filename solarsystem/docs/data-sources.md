# 数据来源 (Data Sources)

本文逐条列出每个数据源：URL、许可、提供内容、摄取脚本与字段映射，并诚实说明数据缺口。所有路径相对仓库根目录。

## 0. 管线结构

```
权威数据 (网络)  --update-*.mjs-->  data/sources/*.json
                                     |-- update-asteroids.mjs / update-comets.mjs (离线切分) --> data/sources/{asteroids,comets}.json
                                     |-- generate-ephemeris.mjs (网络, JPL Horizons) --> data/sources/horizons-golden.json
                                     `-- build-catalog.mjs (离线合并校验) --> public/data/catalog/catalog-<版本>.json + manifest.json
```

- `scripts/lib/io.mjs`：`httpText`（4 次重试、60 s 超时、自定义 user-agent）、`httpJson`、`httpBuffer`、最小 HTML 表格解析（`htmlToRows`/`decodeEntities`）、`parseNumber`、`parseMeanRadius`、`writeJson`/`writeBuffer`。
- `scripts/build-catalog.mjs`：**不联网**，读取 `data/sources/` 与 `public/data/stars/stars.json`，合并校验后写出运行时目录，并打印校验结果。输出为版本化文件 `catalog-vYYYYMMDD.json`，`manifest.json` 的 `catalogFile` 字段指向它，`manifest.json` 与每个天体还带 `sourceUpdatedAt`。

## 1. JPL/Standish 行星近似位置（Mode B 行星）

- URL：https://ssd.jpl.nasa.gov/planets/approx_pos.html
- 参考：Standish, E.M. & Williams, J.G. (1992) *Orbital Ephemerides of the Sun, Moon and Planets*
- 许可：NASA/JPL 公有领域。
- 提供：8 组行星根数（a、e、i、L、长近日点 ϖ、长升交点 Ω），含每儒略世纪的变化率；有效区间 1800–2050；历元 J2000.0（JD 2451545.0）。
- 脚本：**无联网摄取脚本**。文件 `data/sources/planets-jpl-approx.json` 是人工策展的参考表，由 `scripts/build-catalog.mjs` 直接读取；同内容被复制到 `public/data/catalog/planet-elements.json` 供运行时 `src/astronomy/PlanetElements.ts` 使用。
- 字段：`elements.<planet>.{a,e,i,L,longPeri,longNode}` 均为 `[J2000 值, 每世纪变化]`；`accuracy1800to2050` 记录名义误差。地球条目名为 `earthMoonBarycenter`（地月质心）。
- 运行时映射（`PlanetElements.planetElementsAt`）：`T = (JD − epochJD)/36525`；`ω = ϖ − Ω`；`M = L − ϖ`。

## 2. NASA/NSSDC 行星实况表（行星物理参数）

- URL：https://nssdc.gsfc.nasa.gov/planetary/factsheet/（`mercuryfact.html` … `plutofact.html`）
- 发布者：NASA Goddard Space Flight Center；许可：公有领域。
- 提供：半径（赤道/极/体积平均）、扁率、密度、表面重力、逃逸速度、GM、键/几何反照率、已编目卫星数、半长轴、恒星公转周期、近日点/远日点、平均轨道速度、轨道倾角/离心率、恒星自转周期、自转轴倾角、平均黄经、是否有环。
- 脚本：`scripts/update-planets.mjs` → `data/sources/planet-physical.json`。
- 字段映射（`ROW_MAP`，标签先去标签/空白再匹配；值乘缩放因子）：`mass(10^24 kg)→massKg×1e24`、`equatorial/polar/volumetric mean radius (km)→*Km×1`、`ellipticity→flattening`、`mean density (kg/m3)→densityKgM3`、`surface gravity→surfaceGravityMs2`、`escape velocity (km/s)→escapeVelocityKmS`、`GM (x10^6 km3/s2)→gmKm3S2×1e6`、`bond/geometric albedo`、`number of natural satellites→documentedSatelliteCount`、`semimajor axis (10^6 km)→semiMajorAxisKm×1e6`、`sidereal orbit period (days)→siderealOrbitPeriodDays`、`perihelion/aphelion (10^6 km)×1e6`、`mean orbital velocity→meanOrbitalVelocityKmS`、`orbit inclination (deg)`、`orbit eccentricity`、`sidereal rotation period (hrs)→siderealRotationPeriodHours`、`obliquity to orbit (deg)→axialTiltDeg`、`mean longitude (deg)`；`planetary ring system (yes/no)→hasRingSystem`。

## 3. NASA/JPL 行星卫星平均轨道要素

- URL：https://ssd.jpl.nasa.gov/sats/elem/
- 许可：NASA/JPL 公有领域。
- 提供：对数值积分轨道拟合的进动椭圆平均要素；历元 2000-01-01.5 TDB（JD 2451545.0）；a 单位 km、角度单位度、周期单位天；“frame”为表项的参考面（`ecliptic` 或 `laplace`）；另含各母行星 J2000 极轴。
- 文件：`data/sources/jpl-satellite-mean-elements.json` 为人工策展的参考表（字段 `parentPole` 与 `satellites[]`）。
- 脚本：`scripts/update-satellites.mjs` 读取它，与 NSSDC 卫星实况表合并。
- 字段：`{ id, parentId, name, code, frame, aKm, e, argPeriapsisDeg, meanAnomalyDeg, inclinationDeg, nodeDeg, periodDays }`。
- 运行时映射：作为 `satellites.json` 的**首选**来源（含 ω、M、Ω）；`referencePlane` 直接取 `frame`；有该条目的卫星 `phaseSource = "jpl-mean-elements"`。

## 4. NASA/NSSDC 卫星实况表

- URL：`joviansatfact.html`、`saturniansatfact.html`、`uraniansatfact.html`、`neptuniansatfact.html`、`marsfact.html`、`plutofact.html`、`moonfact.html`（NSSDC 域名）
- 许可：NASA/NSSDC 公有领域。
- 提供：卫星物理参数（质量、半径、密度、几何反照率）与轨道几何（a、周期、倾角、离心率）；规则/不规则卫星的倾角参考面不同（规则接近行星赤道面，远距不规则参考黄道）。
- 脚本：`scripts/update-satellites.mjs` → `data/sources/satellites.json`。
- 字段映射（节选）：物理表 “name | mass(10^20 kg) | radius | density | albedo” → `physical.{massKg(×1e20), meanRadiusKm, densityKgM3, geometricAlbedo}`（半径可为三轴 “a x b x c” 取均值，`parseMeanRadius`）；轨道表数值列 → `{semiMajorAxisKm(×1e3), periodDays, inclinationDeg, eccentricity}`，`R` 后缀 → `retrograde`；火星/冥王星用 “名称表头” 布局解析；月球与冥王星有专用解析函数。
- 合并规则：`semiMajorAxisKm / periodDays / eccentricity / inclinationDeg` 依次优先取 JPL、再取 NSSDC 轨道表、再取物理表；参考面按 JPL frame，或按倾角 < 20°（规则）取 `laplace`、否则 `ecliptic`；`phaseSource` 仅当有 JPL 条目时才为 `"jpl-mean-elements"`，否则 `"convention"`。

## 5. NASA/JPL 小天体数据库（约 1.1 万）

- URL：https://ssd-api.jpl.nasa.gov/sbdb_query.api（公开，无需 key）
- 许可：NASA/JPL 公有领域。
- 提供：密近轨道根数（a、q、ad、e、i、Ω、ω、M、历元、近日点时刻、周期）与物理量（H、直径、反照率、自转周期、NEO/PHA 标记、首次观测、MOID）。
- 脚本：`scripts/update-minor-bodies.mjs` → `data/sources/minor-bodies.json`。
- 字段映射（`FIELDS` → `rowToRecord`）：`pdes→id`、`full_name/name→name/fullName`、`class→classCode`、`epoch_mjd→epochMjd`、`a→semiMajorAxisAu`、`q→perihelionDistanceAu`、`ad→aphelionDistanceAu`、`e→eccentricity`、`i→inclinationDeg`、`om→longitudeAscendingNodeDeg`、`w→argumentOfPeriapsisDeg`、`ma→meanAnomalyDeg`、`tp→perihelionJD`、`per→periodDays`、`H→absoluteMagnitude`、`diameter→diameterKm`、`albedo→albedo`、`rot_per→rotationPeriodHours`、`neo→isNeo`、`pha→isPha`、`first_obs→firstObservation`、`moid→moidAu`。
- 选样：14 个查询按动力学族（内/主/外主带、Hilda、火星穿越、木星特洛伊、半人马、TNO、NEO、PHA、彗星各型）以 `sb-cdata` 的 H 上限挑出各族较大成员，避免随机切片；另有 10 颗“必选彗星”按 pdes 单独查询；按 pdes 去重、按 H 排序。
- 二进制布局（`build-catalog.mjs` 的 `buildMinorBodyBuffer`，Float32、stride 8）：`[q(AU), e, i(rad), node(rad), argPeri(rad), Tp(MJD), H, diameter(km)]`。`Tp` 由公开 M 与历元推导，因此同一路径支持椭圆/抛物/双曲传播。该布局**未改变**；版本化只作用于 JSON 目录文件。

### 5.1 Minor Planet Center（MPC，间接覆盖）

- URL：https://www.minorplanetcenter.net/
- 角色：IAU 授权的小天体命名与编号机构，负责临时编号、彗星编号、近地天体确认（NEOCP）、观测站编号与 MPC 轨道数据库。
- **概念上已被 JPL SBDB 载荷覆盖的 MPC 产物**：
  - 彗星周期/临时编号：SBDB 的 `pdes` 与 `full_name`（如 `1P`、`67P`）即 MPC 编号体系；
  - NEO / PHA 确认状态：SBDB 的 `neo`、`pha` 标记来自 MPC 的确认与风险评估流程；
  - 发现与首次观测：SBDB 的 `first_obs` 源自 MPC 收录的观测档案。
- **目录与 MPC 的差异（诚实说明）**：
  - `data/sources/minor-bodies.json` 是**按绝对星等限幅采样**的约 1.1 万条 SBDB 记录，**不是** MPC 轨道数据库的全量（数十万条）；
  - 应用不摄取 MPC 观测站编号、NEOCP 待确认列表或 MPC 自解轨道；轨道根数以 JPL SBDB 为准；
  - 目录中的 `number` 由 SBDB 的 `pdes` 数值形式推导，不来自独立的 MPC 编号文件；
  - 因此目录中没有任何 MPC 独有数据被伪造或推断。
- MPC URL（`https://www.minorplanetcenter.net/`）已加入生成目录的 `sources` 列表，供观众与审计者查看来源。

### 5.2 离线切分（小行星与彗星）

- `npm run data:asteroids`（`scripts/update-asteroids.mjs`）：把 `minor-bodies.json` 中 `bucket` 属于 mainBelt / nearEarth / trojan / centaur / tno 的记录按桶写入 `data/sources/asteroids.json`，并打印各桶真实数量（当前 4 495 / 1 676 / 1 558 / 500 / 1 600，合计 9 829）。
- `npm run data:comets`（`scripts/update-comets.mjs`）：把 `bucket === "comet"` 的记录写入 `data/sources/comets.json`，并打印总数（1 155）及双曲（200）、notable（10）分类计数。
- 两个脚本都**不联网**，只读取已下载的 SBDB 载荷，可在离线展机上重跑；它们不改变运行时目录的二进制布局。

## 6. HYG 星表（恒星背景）

- URL：https://github.com/astronexus/HYG-Database（`hygdata_v41.csv`）
- 许可：**CC BY-SA 4.0**。
- 提供：赤经（时）、赤纬（度）、视星等、B−V 色指数、专名、Bayer、星座、光谱型、距离（pc）。仅导出亮于设定极限星等的恒星（`LIMITING_MAGNITUDE = 7.0`）。
- 脚本：`scripts/update-stars.mjs` → `public/data/stars/stars.bin` + `stars.json`。
- 字段映射：`ra(时)×π/12→raRad`、`dec(度)×π/180→decRad`、`mag→magnitude`、`ci→colorIndex`（无效时取 0.65）。二进制 Float32、stride 4：`[raRad, decRad, magnitude, colorIndex]`；`stars.json` 另存最多 400 个命名恒星。
- 实测计数（`stars.json`）：扫描 119 626、导出 **15 598**、命名 **366**（命名数取 `stars.json.counts.named`；目录另记 `namedStars = 366`，二者一致）。

## 7. 行星表面贴图

- 主源：https://www.solarsystemscope.com/textures/ —— 许可 **CC BY 4.0**，派生自 NASA/USGS 数据。
- 辅源：`https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets`（地球法线/镜面图）—— 许可 **MIT**。
- 脚本：`scripts/update-textures.mjs` → `public/data/textures/*` + `textures.json`（记录每个文件的源、许可、字节数；当前总计 8 140 210 字节）。
- 运行时行为（`src/data/TextureProvider.ts`）：启动阶段不请求任何贴图；某天体首次进入贴图 LOD（投影半径 ≥ 5 px）时才惰性请求其声明的地图。画质档位决定分辨率层级：离线包为 2048 px（2k）资源，`ultra`/`high` 使用原生 2048 px，`medium` 在加载时降采样到 1024 px，`performance` 降采样到 512 px（`TEXTURE_MAX_WIDTH`）。某天体声明的地图文件不存在或请求/解码失败时，回退为由天体 id 哈希生成的**确定性程序化贴图**，信息面板标注“程序化贴图”。缓存上限 48 项并显式 `dispose()`。

## 8. 人工策展的参考表（无联网脚本）

- `data/sources/planet-orientation.json`：行星 IAU WGCCRE / NAIF J2000 极轴（`poleRaDeg/poleDecDeg`）与 `rotationPhaseSource`（当前全部为 `"convention-zero-at-j2000"`），另记 `rotationRateSource` 为 NASA/NSSDC 恒星自转周期。
- `data/sources/body-names.json`：中英文名（中文名遵循中国天文学会名词审定委员会术语）、官方名称、别名、发现记录。来源：IAU / NASA-JPL 公开命名与发现记录。
- `data/sources/planets-jpl-approx.json`：见第 1 节。

## 8.1 外部历表基准（JPL Horizons，用于科学验证）

- URL：https://ssd.jpl.nasa.gov/api/horizons.api
- 许可：NASA/JPL 公有领域。
- 请求（`scripts/generate-ephemeris.mjs`）：`EPHEM_TYPE=VECTORS`、`CENTER='500@10'`（太阳**体心**，Horizons 中心 id `10`）、`REF_PLANE=ECLIPTIC`、`REF_SYSTEM=J2000`、`OUT_UNITS=KM-S`、`VEC_TABLE=2`；目标为水星 `199`、地球 `399`、火星 `499`、木星 `599`、土星 `699`、**月球** `301`，历元为 2000-01-01 / 2026-09-29 / 2035-01-01 / 2049-12-31。
- 输出：`data/sources/horizons-golden.json`，包含 `status`、`center`（`500@10`）、`centerBodyId`（`10`）、`referenceFrame`、`retrievedAt`（检索日期）、`fetchUrls`（每个请求的完整 URL）、`sanityChecks`（被丢弃的行）与 `records`（每个记录含 `positionKm`、`velocityKmS`、`julianDate`、`radiusAu`、`speedKmS`）。
- 自洽性检查：每一行写入前都按该天体的公开近日/远日距离（au）与轨道速度（km/s）区间校验；不合格的行**丢弃并记录**，不会写入。
- 离线行为：若构建机无法访问 Horizons，脚本写出 `status: "unavailable"`、`records: []` 与说明性的 `note`，**绝不编造数值**；若已存在 `status: "available"` 的旧基准，则不覆盖。`scripts/verify-ephemeris.mjs` 对该状态打印 `SKIPPED (no external reference)` 并保持该部分不判失败。
- 当前状态（2026-09-29 于本机构建）：`ssd.jpl.nasa.gov` 不可达，因此文件为 `status: "unavailable"`、`records: []`；验证脚本的 Mode A / Mode B 外部比较显示为 SKIPPED，内部 Mode A–Mode B 回归比较（含月球）仍全部通过。

## 9. 数据缺口与诚实说明

以下限制是真实的，代码与 UI 已按“绝不编造”原则处理：

1. **无公开直径的天体**：Eris、Haumea、Makemake（`manifest.json` 的 `radius-provenance` 校验记录 `bodiesWithoutPublishedRadius: ["eris","haumea","makemake"]`，并在版本化目录 `catalog-v20260929.json` 的 `validation.warnings` 中告警）。`build-catalog.mjs` 给它们打上 `physical.radiusSource = "unavailable-published-value"`；`PositionResolver.estimateRadiusFromMagnitude` 用绝对星等估算标记大小（绝不当作实测半径）；信息面板显示 `暂无可靠数据`。
2. **卫星相位**：164 颗卫星中仅 12 颗有公开平近点角（`satellitesWithPublishedPhase = 12`）。其余卫星 `orbit.phaseSource = "convention"`，其 Ω/ω/M 为约定值（0 或填充值），**相位无科学含义**；UI 显示“轨道相位：约定值（无公开平近点角）”。
3. **自转本初子午线相位**：所有天体的 `rotationPhaseSource` 均为 `"convention-zero-at-j2000"`，即 J2000 时相位为 0。自转**速率**与**极轴**是真实数据，但完整 IAU W0 多项式未随离线包分发。UI 明确标注该约定。
4. **未知字段统一显示 `暂无可靠数据`**：`src/ui/formatters.ts` 中所有 `null/undefined/非有限` 值渲染为 `t('valueUnknown')`（中文 `暂无可靠数据`、英文 `no reliable data`），并加 `missing` 样式；绝不以貌似合理的数字填充。覆盖半径、直径、质量、密度、重力、反照率、绝对星等、MOID、首次观测、发现时间等字段。
5. **程序化表面**：无公开全球影像的天体（如 Eris、Titan）使用确定性程序化贴图（由 id 哈希决定的噪声），UI 显示“表面贴图为程序化生成（无公开全球影像）”。
6. **小天体尺寸编码**：点云中每个点的尺寸由 H 与直径按显示约定编码（图例说明），不是按真实角径绘制。
7. **科学验证的两类比较**：`scripts/verify-ephemeris.mjs` 仍输出 JPL 拟合椭圆级数与 VSOP87 之间的**相互差异**（两个独立近似之和，含月球平均要素路径），阈值按公开精度的固定倍数（径向 3×、角度 5×，并叠加 2×10⁻⁴ 相对半径的下限）给出，脚本输出中逐条列出实测值。此外，脚本还会将 Mode A 与 Mode B **分别**与外部基准（第 8.1 节的 JPL Horizons 矢量）比较，打印径向 / 角度 / 总位置 / 速度误差并设置速度容差（1 km/s）；基准缺失时该部分明确显示 `SKIPPED (no external reference)`，而不是悄悄通过。

## 10. 许可汇总

| 源 | 许可 |
| --- | --- |
| NASA/JPL（行星根数、SBDB、卫星平均要素） | 公有领域 |
| NASA/NSSDC（行星/卫星实况表） | 公有领域 |
| IAU WGCCRE / NAIF 极轴常数 | 公有领域 |
| HYG 星表（astronexus/HYG-Database） | CC BY-SA 4.0 |
| Solar System Scope 贴图 | CC BY 4.0（派生自 NASA/USGS） |
| three.js 示例贴图 | MIT |

应用内的 `sourcesNote`（`src/i18n/index.ts`）向观众简述了以上来源。