# 性能策略 (Performance)

本文说明代码实现的性能预算、LOD 分级、Worker 协议与性能面板字段。**帧率（FPS）取决于运行环境**：本文不虚构真实硬件上的 FPS 数字，只给出代码实现的目标与自适应机制，以及可复算的规模数据。

## 1. 规模数据（可复算）

运行 `node -e` 读取 `public/data/catalog/manifest.json` 的 `catalogFile` 所指的版本化目录（当前 `catalog-v20260929.json`）得到：

| 量 | 值 |
| --- | --- |
| 总天体 | 11 162 |
| 渲染天体（star/planet/dwarfPlanet/moon） | 178 |
| 小天体（GPU 点云） | 10 984 |
| 恒星 | 15 598 |
| 小天体缓冲 | Float32，stride 8，10 984 × 8 = 87 872 个 float ≈ 343 KB |

这些是 CPU/GPU 需要处理的规模上限。小天体以**单个点云一次 draw call** 绘制（`src/render/MinorBodyRenderer.ts`），不存在 per-object 的 Object3D/Mesh/React 组件。

## 2. 画质档位（`src/engine/QualityController.ts`）

```ts
export const QUALITY_PROFILES = {
  ultra:       { pixelRatioCap: 2,    bloom: true,  atmosphere: true,  orbitSamples: 512, maxMinorBodies: 12000, starCount: 16000, labelBudget: 42 },
  high:        { pixelRatioCap: 1.5,  bloom: true,  atmosphere: true,  orbitSamples: 320, maxMinorBodies:  9000, starCount: 12000, labelBudget: 32 },
  medium:      { pixelRatioCap: 1.25, bloom: false, atmosphere: true,  orbitSamples: 192, maxMinorBodies:  5000, starCount:  7000, labelBudget: 24 },
  performance: { pixelRatioCap: 0.85, bloom: false, atmosphere: false, orbitSamples:  96, maxMinorBodies:  2000, starCount:  3500, labelBudget: 16 },
}
```

`shadows` 在所有档位均为 `false`。画质作用于：设备像素比上限、bloom、大气壳、轨道采样密度、小天体绘制上限、恒星数量、标签预算。

- 像素比：`SceneRenderer.applyQuality` 取 `min(devicePixelRatio, profile.pixelRatioCap)`。
- 轨道采样：`OrbitRenderer.update(origin, scale, profile.orbitSamples)`，每条日心轨道的顶点数按 `stride = ceil(total / max(16, lodBudget))` 抽稀。
- 小天体上限：`maxMinorBodies` 是档位预算，实际绘制的是当前筛选子集（`SolarSystemEngine.rebuildMinorSubset`）。
- 恒星预算：`StarFieldRenderer.setStarBudget(profile.starCount)` 通过 `setDrawRange` 限制绘制数量。

## 3. 自适应控制器

`QualityController` 用**时间窗**（而非帧数窗）测帧率，以便极慢机器能在 1–2 秒内降档：

- 窗口 `windowSeconds = 1.6`，最少 `minimumSamples = 12` 个样本。
- `targetFps` 默认 **58**（升档阈值 `upshiftFps`），`minimumFps` 默认 **40**（降档阈值 `downshiftFps`）。构造函数签名：`new QualityController(initial, { targetFps?, minimumFps?, autoAdjust? })`。
- 降档：平均 FPS < 40 时降一级；若平均 FPS < 20（下限的一半）则**直接降到 performance 档**。
- 升档：平均 FPS > 58 + 6 = 64 时升一级。
- 迟滞：两次档位变更间隔至少 2500 ms；手动设定档位后 `manualOverride = true` 锁定自动调整（`releaseManualOverride` 可解除）。
- 档位变化时引擎发出 `status` 事件（`quality adjusted to <level>`），并刷新渲染器与贴图提供者的画质。

命令式 API：`engine.setQualityProfile(level, manual=true)`。

## 4. LOD 分级（`src/render/BodyRenderer.ts`）

`BodyVisual.selectTier(projectedRadiusPixels, cameraDistanceUnits, state)` 按**投影像素半径**（而非固定距离）分级：

| 档 | 条件 | 渲染 |
| --- | --- | --- |
| `point` | 投影半径 < 1.4 px | 隐藏球体与辉光，只显示屏幕空间标记点（`sizeAttenuation:false`，`depthTest:false`） |
| `low` | < 5 px | 无贴图低多边形球（分段 24×18） |
| `standard` | 其余（默认） | 贴图球 + 表面着色器 |
| `close` | `cameraDistanceUnits < radiusUnits·90` 且投影 > 40 px | 追加大气壳、云层、环细节 |

球体分段随画质档：ultra 128×96、high 96×64、medium 64×48、performance 32×24。行星环分段在 `low` 档用 48、否则 128。大气壳由 `ATMOSPHERES` 表按天体 id 配置（金星、地球、火星、木星、土星、天王星、海王星、Titan、Triton、冥王星）。

贴图在物体首次达到“投影半径 ≥ 5 px”时按需请求一次（`SolarSystemEngine.frameStep`），随后 `BodyVisual.applyTextures`。请求的是**离线包内的 2k（2048 px）资源**，画质档位决定加载时的分辨率层级（`TEXTURE_MAX_WIDTH`）：`ultra`/`high` 保持 2048 px，`medium` 降采样到 1024 px，`performance` 降采样到 512 px。声明的地图缺失或请求/解码失败时，回退为由天体 id 哈希生成的确定性程序化贴图，信息面板标注“程序化贴图”，因此贴图失败不会阻塞渲染，也不会被当作实拍影像展示。

`point` 档对象由标签层标识身份，球体隐藏以免遮挡标注。

## 5. Worker 协议（`src/workers/orbit.worker.ts` + `src/engine/OrbitWorkerClient.ts`）

小天体的开普勒传播全部在该 Worker 内执行，主线程每次只收到一个扁平 `Float64Array`（相机相对前的日心千米坐标），因此不会为 11 000 个天体各分配对象，也不阻塞 11 000 次开普勒求解。消息协议：

| 方向 | 消息 | 载荷 |
| --- | --- | --- |
| 主 → Worker | `init` | `{ elements: ArrayBuffer, subset: ArrayBuffer, gmKm3S2 }`（缓冲被转移） |
| Worker → 主 | `ready` | `{ count }` |
| 主 → Worker | `setSubset` | `{ subset: ArrayBuffer }`（转移） |
| 主 → Worker | `update` | `{ requestId, julianDate }` |
| Worker → 主 | `positions` | `{ requestId, positions: ArrayBuffer, count, computeMs }`（转移） |
| 主 → Worker | `orbitPath` | `{ requestId, index, samples }` |
| Worker → 主 | `orbitPath` | `{ requestId, index, positions: ArrayBuffer, computeMs }` |
| 主 → Worker | `dispose` | `{}`（Worker 自行 `close()`） |

要点：

- Worker 内 `a = q/(1−e)`（双曲时 a<0），平均运动 `sqrt(GM/|a|³)`，由近日点时刻 MJD 推出平近点角，`perifocalPositionFromMeanAnomaly` + `perifocalToReferenceFrame` 得到位置。
- 主线程用请求 id 维护 `pending`/`pathPending` 两张表做请求-响应配对。
- **回退**：若 `Worker` 构造失败或 `onerror` 触发，客户端置 `fallbackOnly = true`，改用 `src/astronomy/OrbitPropagator.ts` 在主线程传播（`propagateOnMainThread` / `buildPathOnMainThread`），保证浏览器差异不会导致小行星带空白。
- 引擎每帧调用一次 `worker.update(julianDate)`，仅当儒略日变化超过 1e-7 且无在途请求时才发起，避免堆积。

## 6. 浮动原点与渲染预算

- 全部顶点相机相对，GPU 不见大坐标（`src/engine/FloatingOrigin.ts`，详见 `docs/coordinate-system.md`）。
- `SceneRenderer` 用 `logarithmicDepthBuffer: true`，相机 near 1e-4、far 1e9，fov 42°。
- 后处理仅 `RenderPass` + `UnrealBloomPass(strength 0.55, radius 0.6, threshold 0.85)` + `OutputPass`；无镜头光晕或科幻级调色（`src/engine/Renderer.ts`）。
- `renderer.info.autoReset = false` 并在每帧 `reset()`，使统计覆盖整个合成帧而非最后一遍。
- 贴图缓存上限 48 项，超出时淘汰最旧并 `dispose()`；`TextureProvider.dispose()` 释放全部缓存与程序化贴图。

## 7. 性能面板字段（`src/ui/PerformanceOverlay.tsx` + `src/engine/PerformanceMonitor.ts`）

面板默认隐藏（`showPerformanceOverlay` / `showPerformance` 均为 `false`），仅在开启时采样，因此生产运行中零开销。`PerformanceMonitor` 保存最近 120 帧用于火花线。字段：

| 面板标签 | 快照字段 | 含义 |
| --- | --- | --- |
| `FPS` | `fps` | 窗口平均帧率 |
| `frame` | `frameTimeMs` | 平均帧时间（ms） |
| `jitter` | `jitterMs` | 帧时间标准差（ms） |
| `draw calls` | `drawCalls` | `renderer.info.render.calls` |
| `triangles` | `triangles` | 三角形数 |
| `points` | `points` | 点（小天体 + 恒星）数 |
| 当前渲染天体 | `visibleObjects` | `PositionResolver.size` |
| `labels` | `labels` | `LabelRenderer.count` |
| `texture mem` | `textureMb` | `info.memory.textures × 1.4 MB`（估算） |
| `geometry mem` | `geometryMb` | `info.memory.geometries × 0.25 MB`（估算） |
| `worker` | `workerTimeMs` | 小天体 Worker 传播耗时（EMA 0.8/0.2） |
| 轨道线 | `orbitUpdateMs` | 轨道重写耗时（EMA） |
| `positions` | `positionUpdateMs` | 编目体位置解析耗时（EMA） |
| 画质 | `qualityLevel` | 当前档位 |

`performance` 事件约每 500 ms 发一次。纹理/几何内存是估算值（注释标明），非精确测量。

## 8. 分帧与节流

`SolarSystemEngine.frameStep` 每帧：

- `delta` 上限 0.25 s、下限 1e-4 s，防止卡顿帧“瞬移”仿真，同时保证慢机上相机转场仍能完成。
- `timeChanged` 节流至 ≤ 200 ms；`performance` 节流至 ≤ 500 ms。
- 小天体长度更新仅当儒略日变化 > 1e-7 且无在途请求。
- 位置解析按 `(julianDate, scaleMode)` 缓存，重复调用不重算。

## 9. 说明

- 代码实现的帧率目标是 **58 FPS 升档线 / 40 FPS 降档线**（非 60/30；极低帧率直降 performance 档）。系统没有硬性“30 FPS 下限”常数。
- 真实硬件的 FPS、draw call、三角形数随 GPU、分辨率、像素比与当前视图而变，属环境相关，本文不给出具体实测值。
- 可复算的规模数字：第 1 节所列的目录计数与缓冲大小、第 9 节列出的传播吞吐，以及 `npm test` 的用例数（当前 9 个文件、115 个用例通过，其中天文 5 个文件、UI/状态 4 个文件）。
- **传播吞吐基线**（`src/astronomy/__tests__/Performance.test.ts`，`npm test` 会打印）：在**合成**元素数组（真实 stride-8 布局、物理合法根数，仅种群合成）上对 1 000 / 10 000 / 100 000 / 500 000 个天体各跑一遍完整开普勒传播。本机实测：500 000 个天体 `propagateMinorBodyKm` 约 105–115 ms（约 210–230 ns/对象，≈4.4–4.7×10⁶ 对象/秒）；测试断言每对象 < 25 µs、各规模总时长上限（1k 250 ms、10k 400 ms、100k 1.5 s、500k 6 s），作为复杂度回归（例如意外 O(n²)）的护栏。测试文件整体运行 < 1 s。
- **科学验证方法**：`npm run verify:ephemeris` 既跑内部 Mode A–Mode B 回归比较（含月球），也把两者分别与外部基准 `data/sources/horizons-golden.json`（JPL Horizons 日心黄道 J2000 位置/速度）比较并打印误差；基准缺失时打印 `SKIPPED (no external reference)`。生成与校验细节见 `docs/data-sources.md` 第 8.1 节。