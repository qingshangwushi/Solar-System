# 坐标系 (Coordinate Systems)

本文说明四种坐标帧、`src/astronomy/Coordinates.ts` 中的精确转换矩阵、浮动原点/相机相对规则，并给出可复算的数值示例。所有向量约定为右手系。

## 1. 四种帧

| 帧 | 名称 | 轴向定义 | 出现位置 |
| --- | --- | --- | --- |
| HEJ2000 | 日心黄道 J2000 | +X 指向 J2000 春分点，+Z 指向北黄极，+Y 补成右手系 | `BodyState.heliocentricKm`、全部 Mode A/B 输出 |
| EQJ | 赤道 J2000 | `astronomy-engine` 向量的帧 | `Ephemeris.ts` 的 `HelioVector`/`GeoMoon` 输出 |
| 天体固连帧 | IAU/NAIF body frame | +Z 沿自转轴（IAU 北极），+X 位于天体赤道与 J2000 赤道的升交点 | `Rotation.ts`、`planetEquatorialFrame`、行星环与卫星 Laplace 面 |
| 场景帧 | Three.js | 右手、+Y 向上 | 所有 GPU 顶点（相机相对） |

黄赤交角常数：`OBLIQUITY_J2000_RAD = 23.4392911111°`（`src/astronomy/Constants.ts`，IAU 2006 值 23°26′21.406″）。

## 2. 转换矩阵（`src/astronomy/Coordinates.ts`）

矩阵类型为**列主序 3×3**（与 gl-matrix 内存布局一致），`Mat3` 是长度 9 的只读元组；`applyMat3` 按 `v'_i = Σ_j M[3j+i]·v_j` 施加。

### 2.1 赤道 J2000 → 黄道 J2000

```ts
// equatorialToEclipticRotation(ε) = rotationX(ε)
export function rotationX(angle) {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [1, 0, 0, 0, c, s, 0, -s, c]   // 列主序
}
```

作用效果：`(vx, vy, vz) → (vx, c·vy − s·vz, s·vy + c·vz)`。

在 `Ephemeris.ts` 中，实际使用的是 `astronomy-engine` 的 `Rotation_EQJ_ECL()`，其数组按 `rot[column][row]` 索引，`rotateVectorEquatorialToEcliptic` 与引擎的 `RotateVector` 约定一致。

### 2.2 黄道 J2000 ↔ 场景帧

```ts
// scene.x =  ecl.x
// scene.y =  ecl.z
// scene.z = -ecl.y
export const ECLIPTIC_TO_SCENE: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0]
export const SCENE_TO_ECLIPTIC: Mat3 = transposeMat3(ECLIPTIC_TO_SCENE)
```

这是纯旋转（行列式 +1）：黄道面成为场景 XZ 平面，北黄极成为 +Y。

### 2.3 天体固连帧（由 IAU 极轴构造）

`bodyEquatorialFrameFromPole(poleRaRad, poleDecRad)` 返回列主序矩阵，其**列**是天体基向量在 EQJ 中的表示：

```
z轴 (极轴)   = (cosδ·cosα, cosδ·sinα, sinδ)
x轴          = normalize( Z_eq × z轴 ),  Z_eq = (0,0,1)   // 升交点方向
y轴          = z轴 × x轴
```

特殊情形：当极轴与 J2000 极轴重合（地球）时，`|Z_eq × z| < 1e-9`，取 `x轴 = (1,0,0)`（春分点）。

`planeRotationFromPole(raDeg, decDeg)` 是角度版的便捷封装。`planetEquatorialFrame`（`Ephemeris.ts`）在此之上把三列向量从 EQJ 旋入黄道帧，得到“黄道 → 行星赤道”的旋转，用于行星环朝向与卫星 Laplace 面。

### 2.4 场景帧中的黄道旋转组合

**所有渲染坐标都在场景帧内产生**：`ScaleModel.positionKmToUnits()` 先把日心黄道向量乘以 `ECLIPTIC_TO_SCENE` 再做径向映射（旋转与径向缩放可交换），`unitsToKmVector()` 施加逆变换；因此位置、轨道折线、小天体点云、浮动原点全部处于同一帧（Y 向上、黄道面即 XZ 平面）。任何以黄道帧表达的旋转只需**左乘**帧变换：

`BodyRenderer.bodyFrameMat3ToScene(M) = ECLIPTIC_TO_SCENE · M`（`src/render/BodyRenderer.ts`），随后转四元数施加到 `BodyVisual.frame`，其局部 +Z 即天体自转轴。

> 历史记录：首版实现把天体姿态写成共轭 `ECLIPTIC_TO_SCENE · M · SCENE_TO_ECLIPTIC`，而位置并未旋入场景帧，导致极轴被映射进赤道面并随自转相位漂移（12 h 内 45°–180°），行星环平面随之翻转。同时 `uSunDirection` 与星空方向却已旋入场景帧，使光照方向与几何相差 2.2°–88.1°。两处均已在 `docs/e2e-verification-report.md` 的 P0-2/P0-3 中修复。

局部（母天体相对）轨道折线的顶点在黄道帧给出，`OrbitRenderer.setLocalPath()` 施加同一矩阵后再按标量缩放，因此卫星轨迹与其卫星位置严格重合。

### 2.5 其它工具

- `rotationY/rotationZ`：绕 y/z 轴旋转（列主序）。
- `multiplyMat3/transposeMat3/applyMat3`。
- `ascendingNodeLongitude`：`atan2(y,x)` 折入 `[0, 2π)`。
- `angularSeparation(a,b)`：方向夹角（弧度），用于验证。
- `normalizeVec3/lengthVec3/addVec3/subtractVec3/scaleVec3/crossVec3/dotVec3`。

## 3. 浮动原点与相机相对规则

场景跨度远超 float32 的约 7 位有效数字，因此**任何顶点都不以绝对坐标存储**。`src/engine/FloatingOrigin.ts` 的规则：

```
renderPosition = warp(bodyPosition) − warp(cameraPosition)
```

- `warp` 即当前 `ScaleTransform`（线性或展览非线性），全程以 float64 计算，最后才写入 float32 顶点缓冲（`writeFloat32`）。
- `RenderOrigin.updateUnits(cameraAbsoluteUnits)` 保存相机位置的渲染单位；`relative(positionKm, scale, target)` 完成 `warp − origin`；`relativeFromWarped` 供已 warp 的值使用；`parentRelative` 计算父子差。
- 相机对象（three.js `PerspectiveCamera`）**永远位于原点**：`CameraController.applyOrientation()` 用 `lookAt(absolutePosition, lookAt)` 得到朝向，然后 `camera.position.set(0,0,0)`。相机把自身状态保存在 `absolutePosition`（warp 后的渲染单位，可达 1e6 量级）。
- 结果：远离相机的天体在 CPU 端保留绝对精度，靠近相机的天体获得完整 float32 分辨率，GPU 从不接收大坐标。
- `SceneRenderer` 启用 `logarithmicDepthBuffer: true`，使 near=1e-4、far=1e9 的范围可用而不 z-fighting（`src/engine/Renderer.ts`）。
- 拾取与投影同样从浮动原点测量距离（`SolarSystemEngine.project`、`pickBodyAt`），而非从 three.js 相机对象。

卫星层级：`BodyVisual.group`（anchor）只承载相机相对或父级相对的平移；`BodyVisual.frame` 承载半径缩放与朝向。因此卫星的父子层级镜像了天文层级，同时每个坐标都保持很小。

## 4. 数值示例

### 4.1 黄道 → 场景

取黄道向量 `(x, y, z) = (1, 2, 3)`：

```
scene.x =  ecl.x = 1
scene.y =  ecl.z = 3
scene.z = -ecl.y = -2      →  (1, 3, -2)
```

长度保持（√(1+4+9)=√14=3.7417）。逆变换 `SCENE_TO_ECLIPTIC` 返回 `(1,2,3)`。

### 4.2 赤道 → 黄道

ε = 23.4392911111°，`c = cos ε = 0.917482`，`s = sin ε = 0.397777`。对赤道向量 `(vx, vy, vz)`：

```
ecl.x = vx
ecl.y = c·vy − s·vz
ecl.z = s·vy + c·vz
```

验证：北天极 `(0, 0, 1)` → `(0, −0.397777, 0.917482)`，其黄纬 `asin(0.917482) = 66.5607° = 90° − 23.4393°`，与黄赤交角一致。

### 4.3 天体固连帧（土星）

土星 IAU 极轴（`data/sources/planet-orientation.json`）：α = 40.589°，δ = 83.537°。`cosδ = 0.11256`，`sinδ = 0.99365`，`cosα = 0.75934`，`sinα = 0.65074`。

```
z轴 = (0.11256·0.75934, 0.11256·0.65074, 0.99365) ≈ (0.08547, 0.07324, 0.99365)
x轴 = normalize((0,0,1) × z轴) = normalize(−0.07324, 0.08547, 0) ≈ (−0.65074, 0.75934, 0)
y轴 = z轴 × x轴 ≈ (−0.75454, −0.64672, 0.11257)      （模长 ≈ 1）
```

三列即为矩阵列，`planetEquatorialFrame` 再把它们旋入黄道帧。土星环按 `RingGeometry` 布置在 `frame` 的 XY 平面（法线 +Z），恰好落在土星赤道面内。

### 4.4 尺度换算（科学模式）

`KM_PER_UNIT = 1000`（距离与半径同值）：

| 量 | 真实值 | 场景单位 |
| --- | --- | --- |
| 1 AU | 149 597 870.7 km | 149 597.8707 单位 |
| 太阳半径 | 695 700 km | 695.7 单位 |
| 地球半径 | 6 371 km | 6.371 单位 |

在 1 AU 处，太阳张角约 `2·atan(695.7/149597.87)` ≈ 0.53°，地球约 0.0049° —— 行星确实是亚像素的，这与 `ScaleModel.ts` 的注释一致。

### 4.5 尺度换算（展览模式）

距离映射 `units = 0.14·√(r_km)`（r ≤ 50 AU）：

- 1 AU → `0.14·√(149597870.7) ≈ 1712` 单位。
- 水星 a = 0.387 AU → `0.14·√(0.387·149597870.7) ≈ 1066` 单位，舒适地位于太阳渲染半径（约 210.5 单位，见下）之外。
- 海王星 a = 30.07 AU → `0.14·√(30.07·149597870.7) ≈ 9390` 单位。

母天体相对偏移用 `localScaleFactorKmToUnits`（映射的局部导数）：r ≤ 50 AU 时为 `0.14 / (2·√r_km)`，之外为 `2400 / r_km`。

半径映射 `radiusUnits = gain · R_km^0.45 · R_earth^0.55 / 1000`（`R_earth = 6371`）：

| 天体 | 类别增益 | 真实半径(km) | 真实(单位) | 展览(单位) | 放大倍数 |
| --- | --- | --- | --- | --- | --- |
| 地球 | 行星 14 | 6 371 | 6.371 | 89.19 | ×14.0 |
| 木星 | 行星 14 | 69 911 | 69.911 | ≈262.2 | ≈×3.75 |
| 太阳 | 恒星 4 | 695 700 | 695.7 | ≈210.5 | ≈×0.30 |

可见该幂律是**压缩**动态范围：小天体被放大，极大天体（太阳）反而被压缩到真实尺寸以下，从而不会吞没内侧轨道；HUD 的“天体尺寸已视觉增强”标签表示半径整体不按真实比例。信息面板的“radius”一行用 `formatMagnification` 显示每个天体各自的放大倍数（< 1.05 显示“真实尺寸”）。

### 4.6 浮动原点

设某天体 `absoluteUnits = (1.0e6, 2.0e5, −3.0e5)`，相机 `originUnits = (9.9e5, 2.1e5, −2.9e5)`：

```
relative = absolute − origin
         = (1.0e4, −1.0e4, −1.0e4)
```

写入 float32 顶点的是 `(1.0e4, −1.0e4, −1.0e4)` 这样的小坐标；`absoluteUnits` 本身可留 1e6 量级而不进入 GPU。太阳方向的场景表达同理：`sunDirectionScene = normalize(−position)` 映射到场景帧（`SolarSystemEngine.updateSunDirection`）。