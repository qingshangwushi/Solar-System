# 天文模型 (Astronomical Model)

本文说明两套位置模型、所用库/算法及其公布精度、开普勒方程（含双曲情形）、地月质心分裂、卫星平均要素与相位约定、轨道/自转相位约定，以及验证方法与实测误差。相关代码位于 `src/astronomy/`。

## 1. 两套位置模型

目录中每个天体带有 `positionModel`（`src/types/catalog.ts`）：

- `origin`：坐标原点（仅太阳）。
- `ephemeris`：Mode A，高精度历表。
- `kepler`：Mode B，开普勒轨道传播。

### Mode A — `ephemeris`（`src/astronomy/Ephemeris.ts`）

- 覆盖：太阳（origin，位置为 0）、八大行星、月球、冥王星。
- 库：`astronomy-engine ^2.1.19`。
- 理论与算法：行星 **VSOP87**；月球 **ELP2000-82B**；冥王星为拟合 JPL DE 的级数。地球/月球通过引擎内部的 EMB 分裂得到。
- `AstronomyEngineEphemerisSource` 提供 `heliocentricEclipticKm(body, julianDate)`，返回**日心黄道 J2000 位置的公里值**。`astronomy-engine` 的向量在 J2000 赤道帧（EQJ），通过 `Rotation_EQJ_ECL()` 旋入黄道帧（`rotateVectorEquatorialToEcliptic`），再乘 `AU_KM`。
- 月球：`GeoMoon(time)` 给出地心位置，加上地球日心位置得到日心位置（`moonGeocentricKm` + `earthHeliocentricKm`）。
- 缓存：按 `(body, JD)`、地球、月球分别记忆化，避免同一帧内重复求值；缓存超过 4096/2048 项时清空。
- 声明精度（模块注释）：与 DE 派生位置在**内行星为弧分级别**吻合，外行星更好 —— 远在展陈可视化所需容差之内。

### Mode B — `kepler`（`src/astronomy/OrbitPropagator.ts` + `PlanetElements.ts`）

- 覆盖：约 10 984 个小天体；矮行星 Ceres/Eris/Haumea/Makemake（冥王星走 Mode A）；163 颗天然卫星（月球走 Mode A）。
- 数据：
  - 行星：`public/data/catalog/planet-elements.json` 中 JPL/Standish 近似位置根数（1800–2050）。
  - 小天体：JPL SBDB 密近根数（a/e/i/Ω/ω/M、历元或近日点时刻）。
  - 卫星：JPL 平均轨道要素（`data/sources/jpl-satellite-mean-elements.json` 与 `data/sources/satellites.json`）。
- 算法：两体运动。给定历元时刻的根数，求解开普勒方程得到近焦点系位置，再旋入参考面/黄道面。
- 平均运动：优先使用目录中的恒星周期 `n = 2π/P`（`PropagationInputs.meanMotionRadPerDayOverride`）。原因见 `OrbitPropagator.ts` 注释：用公开周期传播可精确复现公开运动，而 GM 推出的速率对受摄轨道会有几个百分点差异。仅对无周期的双曲轨道才用 `sqrt(GM/|a|³)`。
- 参考面：`referencePlane: 'ecliptic' | 'laplace' | 'body-equator'`。行星与不规则卫星用黄道面；规则卫星用母行星 Laplace 面（由母行星 IAU 极轴构造的平面旋转，`PositionResolver.referencePlaneFor`）。
- 位置模型同样适用于**椭圆、抛物、双曲**轨道：既支持“历元 + 平近点角”，也支持“近日点时刻”定义相位。

## 2. 开普勒方程

实现于 `src/astronomy/KeplerSolver.ts`。公式来源：Meeus《Astronomical Algorithms》第 30 章；NASA/JPL SSD《Approximate Positions of the Planets》(Standish & Williams 1992)。

### 椭圆情形 `M = E − e·sin E`（`solveEccentricAnomaly`）

- e < 1e-12 时直接取 `E = M`。
- 初值 `E₀ = M + e·sin M`（JPL 文档推荐，对 e<1 收敛、e=0 精确）。
- Newton 迭代：`Δ = (M − (E − e·sin E)) / (1 − e·cos E)`。
- 收敛容差 `ANOMALY_TOLERANCE = 1e-13`（弧度），最大 80 次迭代。

### 双曲情形 `M = e·sinh H − H`（`solveHyperbolicAnomaly`）

- 要求 `e > 1`，否则抛 `RangeError`。
- 初值 `H₀ = asinh(M / e)`（Danby 式估计，对目录中 1 ≤ e < 3 的双曲彗星快速收敛）。
- Newton 迭代：`residual = e·sinh H − H − M`，`derivative = e·cosh H − 1`；`|derivative| < 1e-14` 时中断。

`perifocalPositionFromMeanAnomaly` 按 `e < 1`（椭圆）或 `e ≥ 1`（双曲）分支返回近焦点系位置（含 x、y、半径、真近点角与偏近点角/双曲近点角）。双曲情形 `a < 0` 使半径仍为正。

### 近焦点系 → 参考面

`perifocalToReferenceFrame` 使用 `r = Rz(−Ω)·Rx(−I)·Rz(−ω)·r'`（JPL 文档步骤 5 的分量形式）：

```
x = (cosω·cosΩ − sinω·sinΩ·cosI)·x' + (−sinω·cosΩ − cosω·sinΩ·cosI)·y'
y = (cosω·sinΩ + sinω·cosΩ·cosI)·x' + (−sinω·sinΩ + cosω·cosΩ·cosI)·y'
z =  sinω·sinI·x' + cosω·sinI·y'
```

### 其它近焦点量

- `meanMotionRadPerDay(gm, a) = sqrt(gm / |a|³) · 86400`（a 可取负）。
- `perifocalPositionFromMeanAnomaly` 亦用于 `sampleOrbitPath`（采样闭合椭圆）与 `sampleOpenOrbitPath`（双曲两支，真近点角推进到渐近线 `acos(−1/e)·0.985`）。

### 公布的 Mode B 行星精度

`src/astronomy/PlanetElements.ts` 与 `data/sources/planets-jpl-approx.json` 记录 JPL 对 1800–2050 的名义误差（日心黄经 λ / 黄纬 φ，单位角秒；距离 ρ，单位 1000 km）：

| 行星 | λ (″) | φ (″) | ρ (1000 km) |
| --- | --- | --- | --- |
| Mercury | 15 | 1 | 1 |
| Venus | 20 | 1 | 4 |
| EMB | 20 | 8 | 6 |
| Mars | 40 | 2 | 25 |
| Jupiter | 400 | 10 | 600 |
| Saturn | 600 | 25 | 1500 |
| Uranus | 50 | 2 | 1000 |
| Neptune | 10 | 1 | 200 |

## 3. 地月质心分裂

JPL/Standish 表中 `earthMoonBarycenter` 是**地月质心（EMB）**，不是地心。Mode B 用 DE430 的月地质量比 `MOON_EARTH_MASS_RATIO = 0.0123000371` 拆分（`src/astronomy/Constants.ts` 与 `PlanetElements.ts`）：

```
Earth = EMB − r_moon / (1 + μ)
Moon  = EMB + μ · r_moon / (1 + μ)
```

其中 `r_moon` 是地心月球位置：Mode B 用月球自身平均要素（`keplerMoonGeocentricKm`），Mode A 用月球历表。生产运行中地球与月球都走 Mode A（`AstronomyEngineEphemerisSource` 内部用 `HelioVector(Earth)` + `GeoMoon` 完成分裂），Mode B 的拆分主要用于与 Mode A 对照验证。

## 4. 卫星平均要素与相位约定

- 数据来源：`data/sources/satellites.json`（由 `scripts/update-satellites.mjs` 生成），几何（a、e、i、周期）与物理参数来自 NASA/JPL 与 NASA/NSSDC；轨道方向/相位（Ω、ω、M）来自 JPL 平均要素（若公开）。
- **有公开平近点角**的卫星：`orbit.phaseSource = "jpl-mean-elements"`，信息面板显示“轨道相位：JPL 平均轨道要素”。
- **无公开平近点角**的卫星：`orbit.phaseSource = "convention"`，其 node/argPeriapsis/meanAnomaly 取 0 或约定值，**相位无科学含义**；信息面板显示“轨道相位：约定值（无公开平近点角）”。目录统计 `satellitesWithPublishedPhase = 12`（即 164 颗卫星中仅 12 颗来自 JPL 平均要素表）。
- 网格/参考面：规则卫星（倾角 < 20°）用 `laplace`（接近母行星赤道面），不规则卫星用 `ecliptic`（J2000 黄道）。
- 逆行/潮汐锁定：`retrograde` 由 fact sheet 的 “R” 标记或 `e > 1` 判定；卫星 `rotation.synchronous = true`，自转周期 = 轨道周期（潮汐锁定），轴向倾角 0，极轴继承母行星。

**重要限制**：JPL 明确说明卫星平均要素不用于历表计算。实测月球平均要素对历表的最差方向误差为 **14.19°**（见第 6 节），因此月球与地球均走 Mode A；其余卫星的相位约定值只保证可视化合理，不代表真实经度。

## 5. 相位约定（轨道相位与自转相位）

### 轨道相位

- Mode B 卫星：见第 4 节，`phaseSource` 区分公开/约定。
- Mode B 行星与小天体：由 JPL 根数的 M（或近日点时刻）定义，属真实公开值。

### 自转相位（`src/astronomy/Rotation.ts`）

- 自转**速率**与**极轴指向**是真实数据：速率来自 NASA/NSSDC 恒星自转周期（`siderealRotationPeriodHours`，负值表示逆行），极轴来自 IAU WGCCRE / NAIF（`data/sources/planet-orientation.json` 的 `poleRaDeg/poleDecDeg`）。
- 自转**相位**是约定值：`rotationPhaseSource: "convention-zero-at-j2000"`，即 J2000 时本初子午线相位为 0。原因：完整 IAU W0 多项式未随离线包分发。`rotationPhaseRad` 用 `phase(0) + direction·(2π/|P|)·t`。
- 太阳自转用 `SUN_ROTATION`：周期 609.12 h（Carrington 平均高纬速率），极轴 R.A. 286.13°、Dec. 63.87°。
- 实现：`bodyOrientationBodyToEcliptic` 先由极轴构造赤道帧（`planetEquatorialFrame`，含 EQJ→黄道变换），再绕天体 z 轴（极轴）旋转相位。`BodyVisual` 把该矩阵左乘 `ECLIPTIC_TO_SCENE`（`bodyFrameMat3ToScene`）后转成四元数施加到 `frame`，其 +Z 即 IAU 极轴在场景帧中的方向。
- 信息面板对 `convention-zero-at-j2000` 明确说明：“自转相位：以 J2000 为约定零点；自转速率与极轴指向为真实数据。”

## 6. 验证方法与实测误差

### 方法

`src/astronomy/__tests__/EphemerisValidation.test.ts` 对 1900–2049 的 6 个历元（含 1969-07-20 阿波罗 11 号时刻、2026-09-29 等）就 8 颗行星做双重计算：

1. 用 `public/data/catalog/planet-elements.json` 的 JPL/Standish 根数 + 月球平均要素（Mode B Kepler）；
2. 用 `AstronomyEngineEphemerisSource`（Mode A 历表）；

比较两者的**方向角距**与**相对径向误差**。断言阈值取自 JPL 公布的名义精度（1800–2050：黄经 10″–600″，土星距离可达 1.5×10⁶ km）。

### 实测最差误差（运行 `npx vitest run src/astronomy/__tests__/EphemerisValidation.test.ts` 得到）

```
Kepler (Mode B) vs ephemeris (Mode A), 1900-2049
mercury  worst angular 0.0079°  worst radial 0.0024 %
venus    worst angular 0.0035°  worst radial 0.0032 %
earth    worst angular 0.0037°  worst radial 0.0014 %
mars     worst angular 0.0158°  worst radial 0.0089 %
jupiter  worst angular 0.0851°  worst radial 0.0685 %
saturn   worst angular 0.1534°  worst radial 0.1253 %
uranus   worst angular 0.0229°  worst radial 0.0403 %
neptune  worst angular 0.0152°  worst radial 0.0187 %
```

断言（全部通过）：方向 < 0.4°、径向 < 0.5%、内行星（水/金/火）方向 < 0.05°、地球方向 < 0.02°、地球半径在 0.98–1.02 AU、木星历表半径 4.9–5.5 AU、土星 9–10.1 AU。

地月质心分裂的系数为 `μ/(1+μ)`（μ = 月球/地球质量比）。早前误用 `1/(1+μ)` 使地球方向残差达 0.1470°、径向 0.2688 %；修正后为 0.0037° / 0.0014 %。

### 月球几何与精度

同文件 `Moon geometry in Mode B` 组：

- 用 720 采样验证月球平均要素扫出的距离包络恰为 `a(1−e)…a(1+e)`（近地点 384400×0.9446 ≈ 363 100 km，远地点 ≈ 405 700 km），落在真实 356 500–406 700 km 区间内。
- 用 240 采样（约 5 年）对比月球历表，打印结果：

```
Moon mean elements vs ephemeris (240 samples over ~5 years): worst direction error 14.19°
```

断言 `worst < 20°`。JPL 已声明卫星平均要素不用于历表计算 —— 这正是应用让月球走 Mode A 的依据。

### 全套测试

`npm test` 当前运行 4 个测试文件、**60 个用例全部通过**（`Coordinates` 11、`EphemerisValidation` 11、`KeplerSolver` 19、`TimeSystem` 19）。

## 7. 未纳入的模型与说明

- 未使用光行时校正、岁差/章动、引力摄动或 N 体积分；Mode B 为二体近似（对展陈足够，且在卫星端用 JL 平均要素与参考面近似受摄效应）。
- 未使用 SPICE 内核服务，但 `Ephemeris.ts` 通过 `EphemerisSource` 接口预留了替换点（预生成采样历表或 SPICE 服务可无侵入替换）。
- `npm run verify:ephemeris` → `scripts/verify-ephemeris.mjs`：独立的科学验证入口，输出 6 个历元 × 8 颗行星的误差表（径向 / 三维位置 / 角 / 速度），并在超出文档化阈值时以非零码退出；同一模型亦由上述 Vitest 用例覆盖。