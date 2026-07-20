/**
 * 应用启动编排器（任务 T-P0-10 / 修复 E-25 / R-02）。
 *
 * AppOrchestrator 把诊断、Worker 初始化、资源加载、渲染器创建、
 * 天体渲染器注册、渲染主循环这几件事串成一条线性状态机：
 *
 *   idle → diagnostics → worker-init → resource-load
 *        → renderer-create → body-renderers-register → ready
 *
 * 每个阶段：
 * - 进入时 emit `phase-start`，结束时 emit `phase-complete`；
 * - 阶段内部 emit `progress`（0–100 的阶段内进度 + 加权总进度）；
 * - 失败时 emit `error`（带 retryable 标志与失败阶段信息）。
 *
 * 阶段权重与 `apps/web/src/App.tsx` 的 BOOT_PHASES 保持一致：
 *   core 20 / ephemeris 30 / bodies 30 / assets 20
 *
 * R-02 修复：进入 ready 后启动 rAF 循环，每帧调用
 * `AstroCoreClient.evaluateSnapshot(bodyIds, utc)` 获取 `CelestialStateSnapshot`，
 * 将 `BodyState` 分发到对应 `BodyRenderer.update(time, position, orientation, sunDirection)`，
 * 然后依次 `renderer.beginPass()` / `bodyRenderer.render()` / `renderer.endPass()` /
 * `renderer.submit()`，关闭“天体状态→渲染器”数据流断裂。
 *
 * Worker 崩溃复用 `astro-core-client.ts` 已有的指数退避 reinit 逻辑
 * （1s/2s/4s/8s/16s，最多 5 次）；本编排器额外监听 Worker 错误事件，
 * 在重试彻底失败后把状态机迁移到 `error`。
 */
import type { CelestialStateSnapshot, Vec3d, Quat64 } from '@solar-system/schemas';
import type { AstroCoreClient, WorkerErrorListener } from '@solar-system/astro-core-api';
import {
  detectCapabilities,
  runBenchmark,
  recommendBackend,
  type CapabilityDetection,
  type BenchmarkResult,
  type RenderBackend,
  type QualityProfile,
} from '@solar-system/diagnostics';
import {
  AstroCoreClient as AstroCoreClientImpl,
  parseSsphToJson,
  SsphParseError,
} from '@solar-system/astro-core-api';
import { ResourceManager } from '@solar-system/resource-runtime';
import type {
  Renderer,
  RendererFactory,
  RendererConfig,
  BackendType,
  CameraController,
  NavigationMode,
} from '@solar-system/renderer-core';
import {
  PerspectiveCamera,
  OrbitController,
  FlyController,
  rendererFactories,
} from '@solar-system/renderer-core';
import {
  BodyRendererFactoryImpl,
  type BodyRenderer,
  type BodyRendererFactory,
  type BodyId,
  PLANET_BODY_IDS,
} from '@solar-system/body-renderers';

// ---------------------------------------------------------------------------
// 公共类型
// ---------------------------------------------------------------------------

/** 编排器状态。 */
export type OrchestratorState =
  | 'idle'
  | 'diagnostics'
  | 'worker-init'
  | 'resource-load'
  | 'renderer-create'
  | 'body-renderers-register'
  | 'ready'
  | 'error';

/** 启动阶段标识（与 BOOT_PHASES 一一对应）。 */
export type BootPhase =
  | 'core'
  | 'ephemeris'
  | 'bodies'
  | 'assets'
  | 'ready';

/** 阶段权重（与 apps/web/src/App.tsx 的 BOOT_PHASES 一致）。 */
export const BOOT_PHASE_WEIGHTS: Record<BootPhase, number> = {
  core: 20,
  ephemeris: 30,
  bodies: 30,
  assets: 20,
  ready: 0,
};

/**
 * 启动事件（discriminated union）。
 *
 * - `phase-start` / `phase-complete`：进入 / 离开某阶段
 * - `progress`：阶段内进度 + 总进度
 * - `ready`：启动完成
 * - `error`：启动失败（带 retryable 标志与失败阶段信息）
 */
export type BootEvent =
  | { type: 'phase-start'; phase: BootPhase }
  | { type: 'phase-complete'; phase: BootPhase }
  | { type: 'progress'; phase: BootPhase; phaseProgress: number; overallProgress: number }
  | { type: 'ready' }
  | { type: 'error'; phase: BootPhase; message: string; retryable: boolean };

/** 启动选项。 */
export interface BootOptions {
  /** 渲染画布（可后续通过 attachCanvas 注入）。 */
  canvas?: HTMLCanvasElement;
  /** 默认渲染的天体 ID（默认太阳 + 地球 + 月球）。 */
  bodyIds?: number[];
  /** 期望渲染后端；不指定则由 diagnostics 推断。 */
  preferredBackend?: RenderBackend;
  /** 期望画质档位；不指定则由 diagnostics 推断。 */
  preferredQuality?: QualityProfile;
  /** WASM 模块 URL（默认 `/wasm/astro_core.js`）。 */
  wasmUrl?: string;
  /** 资源基址（默认 `/data`）。 */
  dataBaseUrl?: string;
  /** 初始时间倍率（默认 1.0 = 1 模拟天/实际秒）。 */
  timeRate?: number;
  /** 初始模拟时间（UTC MJD；默认 J2000=51544.0）。 */
  simulationTimeMjd?: number;
  /** 初始导航模式（默认 'orbit'）。 */
  navigationMode?: NavigationMode;
}

/** 相机状态快照（供 UI 展示 / 调试）。 */
export interface CameraStateSnapshot {
  mode: NavigationMode;
  position: Vec3d;
  target: Vec3d;
  distance: number;
  fov: number;
}

/** 性能指标快照（每 ~500ms 推送一次）。 */
export interface MetricsSnapshot {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  textures: number;
  shaders: number;
  workerLatencyMs: number;
}

// ---------------------------------------------------------------------------
// 内部常量
// ---------------------------------------------------------------------------

/** 默认可见天体集合：太阳 / 地球 / 月球（最小可见集）。 */
const DEFAULT_BODY_IDS: number[] = [
  PLANET_BODY_IDS.SUN as number,
  PLANET_BODY_IDS.EARTH as number,
  PLANET_BODY_IDS.MOON as number,
];

/** 太阳 body_id（用于计算 sunDirection）。 */
const SUN_BODY_ID = 10;

/** 默认 WASM URL。 */
const DEFAULT_WASM_URL = '/wasm/astro_core.js';

/** 默认数据基址。 */
const DEFAULT_DATA_BASE_URL = '/data';

/** Worker 崩溃 reinit 最大尝试次数（与 astro-core-client 内部一致）。 */
const MAX_WORKER_REINIT_ATTEMPTS = 5;

/** rAF 类型别名（兼容 Node 测试环境）。 */
type Raf = (cb: (t: number) => void) => number;
type Caf = (h: number) => void;

// ---------------------------------------------------------------------------
// AppOrchestrator
// ---------------------------------------------------------------------------

/**
 * 应用启动编排器。
 *
 * 用法：
 * ```ts
 * const orchestrator = new AppOrchestrator();
 * orchestrator.subscribe(event => updateBootProgress(event));
 * await orchestrator.start({ canvas, bodyIds: [10, 399, 301] });
 * ```
 */
export class AppOrchestrator {
  private state: OrchestratorState = 'idle';
  private failedPhase: BootPhase | null = null;
  private lastError: string | null = null;

  private readonly listeners = new Set<(event: BootEvent) => void>();
  private readonly metricsListeners = new Set<(metrics: MetricsSnapshot) => void>();

  private canvas: HTMLCanvasElement | null = null;
  private bodyIds: number[] = DEFAULT_BODY_IDS.slice();
  private preferredBackend?: RenderBackend;
  private preferredQuality?: QualityProfile;
  private wasmUrl: string = DEFAULT_WASM_URL;
  private dataBaseUrl: string = DEFAULT_DATA_BASE_URL;

  // 阶段产物
  private capabilities: CapabilityDetection | null = null;
  private benchmark: BenchmarkResult | null = null;
  private chosenBackend: RenderBackend = 'webgl2';
  private chosenQuality: QualityProfile = 'standard';
  private client: AstroCoreClient | null = null;
  private resourceManager: ResourceManager | null = null;
  private renderer: Renderer | null = null;
  /** 标记 renderer 是否已通过 init(canvas) 完成初始化（P0 修复：attachCanvas 必须触发 init）。 */
  private rendererInitialized = false;
  private bodyRendererFactory: BodyRendererFactory | null = null;
  private readonly bodyRenderers = new Map<BodyId, BodyRenderer>();

  // 相机（P0 修复：编排器必须持有相机并每帧更新，否则用户无法观察场景）
  private camera: PerspectiveCamera | null = null;
  private cameraController: CameraController | null = null;
  private navigationMode: NavigationMode = 'orbit';

  // Worker 错误监听器（保存引用以便 dispose 时取消订阅）
  private workerErrorListener: WorkerErrorListener | null = null;
  private workerReinitFailures = 0;

  // rAF 循环
  private rafHandle: number | null = null;
  private rafLoopRunning = false;
  private lastFrameTimestamp = 0;
  private simulationTimeMjd = 51544.0; // J2000
  private timeRate = 1.0; // 模拟时间倍率（每实际秒推进多少天）
  /** 时间是否暂停。 */
  private timePaused = false;
  /** 最近一次异步拉取到的快照（rAF 同步帧使用上一帧结果）。 */
  private latestSnapshot: CelestialStateSnapshot | null = null;

  // 性能指标采样
  private frameTimeSamples: number[] = [];
  private lastMetricsEmit = 0;
  private drawCallCount = 0;
  private triangleCount = 0;
  private textureCount = 0;
  private shaderCount = 0;
  private lastWorkerLatencyMs = 0;

  private readonly raf: Raf;
  private readonly caf: Caf;

  private disposed = false;

  constructor(options?: { requestAnimationFrame?: Raf; cancelAnimationFrame?: Caf }) {
    this.raf =
      options?.requestAnimationFrame ??
      ((cb) =>
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(cb)
          : (setTimeout(() => cb(Date.now()), 16) as unknown as number));
    this.caf =
      options?.cancelAnimationFrame ??
      ((h) =>
        typeof cancelAnimationFrame === 'function'
          ? cancelAnimationFrame(h)
          : clearTimeout(h));
  }

  // -----------------------------------------------------------------------
  // 公共 API
  // -----------------------------------------------------------------------

  /** 当前状态。 */
  getState(): OrchestratorState {
    return this.state;
  }

  /** 启动编排流程。重复调用安全（已 idle 之外的状态会直接 resolve）。 */
  async start(options?: BootOptions): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'error') return;
    this.disposed = false;
    this.applyOptions(options);
    await this.runFlow();
  }

  /** 从错误状态重试：从失败的阶段继续（若已开始过诊断则从 worker-init 起）。 */
  async retry(): Promise<void> {
    if (this.state !== 'error') return;
    // 简化策略：从失败阶段开始重跑
    await this.runFlow(this.failedPhase ?? 'core');
  }

  /** 订阅启动事件。返回取消订阅函数。 */
  subscribe(listener: (event: BootEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 订阅性能指标。返回取消订阅函数。 */
  subscribeMetrics(listener: (metrics: MetricsSnapshot) => void): () => void {
    this.metricsListeners.add(listener);
    return () => this.metricsListeners.delete(listener);
  }

  /** 附加渲染画布（在 SceneViewport mount 后调用）。 */
  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    // 确保 canvas 有非零尺寸（部分浏览器在初始 mount 时 width/height=0）
    if (canvas.width === 0 || canvas.height === 0) {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width)) || 800;
      canvas.height = Math.max(1, Math.floor(rect.height)) || 600;
    }
    if (this.renderer && !this.rendererInitialized) {
      // P0 修复：renderer 在 phaseRendererAndBodyRenderers 中创建但未 init，
      // 此处真正把 canvas 绑定到 renderer（init 内部创建 device/context）。
      void this.renderer.init(canvas).then(() => {
        this.rendererInitialized = true;
        this.updateCameraAspect();
      }).catch((e) => {
        this.lastError = `渲染器初始化失败：${(e as Error).message}`;
        this.failedPhase = 'assets';
        this.transitionTo('error');
        this.emit({
          type: 'error',
          phase: 'assets',
          message: this.lastError,
          retryable: !this.disposed,
        });
      });
    } else if (this.renderer && this.rendererInitialized) {
      this.renderer.resize(canvas.width, canvas.height);
      this.updateCameraAspect();
    }
  }

  /** 更新相机 aspect ratio（基于当前 canvas 尺寸）。 */
  private updateCameraAspect(): void {
    if (!this.camera || !this.canvas) return;
    const w = this.canvas.width || 800;
    const h = this.canvas.height || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjection();
  }

  // -----------------------------------------------------------------------
  // 公共 API：时间控制（FR-TIME-001/002/003）
  // -----------------------------------------------------------------------

  /** 获取当前模拟时间（UTC MJD）。 */
  getSimulationTime(): number {
    return this.simulationTimeMjd;
  }

  /** 设置模拟时间（UTC MJD）。 */
  setSimulationTime(mjd: number): void {
    if (!Number.isFinite(mjd)) return;
    this.simulationTimeMjd = mjd;
    // 同步到 Worker 时钟（如果 Worker 已就绪）
    if (this.client) {
      void this.client.clockSetUtc(mjd).catch(() => {
        /* 单次时钟同步失败忽略 */
      });
    }
  }

  /** 获取当前时间倍率。 */
  getTimeRate(): number {
    return this.timeRate;
  }

  /** 设置时间倍率（每实际秒推进多少模拟天）。可为负数（倒退）。 */
  setTimeRate(rate: number): void {
    if (!Number.isFinite(rate)) return;
    this.timeRate = rate;
    if (this.client) {
      void this.client.clockSetRate(rate).catch(() => {
        /* noop */
      });
    }
  }

  /** 时间是否暂停。 */
  isTimePaused(): boolean {
    return this.timePaused;
  }

  /** 暂停时间推进。 */
  pauseTime(): void {
    this.timePaused = true;
    if (this.client) {
      void this.client.clockPause().catch(() => {
        /* noop */
      });
    }
  }

  /** 恢复时间推进。 */
  resumeTime(): void {
    this.timePaused = false;
    if (this.client) {
      void this.client.clockResume().catch(() => {
        /* noop */
      });
    }
  }

  // -----------------------------------------------------------------------
  // 公共 API：相机/导航控制（设计 23）
  // -----------------------------------------------------------------------

  /** 旋转相机（orbit 模式下改变 theta/phi；fly 模式下改变朝向）。 */
  rotateCamera(theta: number, phi: number): void {
    if (!this.cameraController) return;
    this.cameraController.rotate(theta, phi);
  }

  /** 缩放相机（wheel 事件调用）。delta>0 拉近，delta<0 拉远。 */
  zoomCamera(delta: number): void {
    if (!this.cameraController) return;
    this.cameraController.zoom(delta);
  }

  /** 平移相机目标点。 */
  panCamera(dx: number, dy: number): void {
    if (!this.cameraController) return;
    this.cameraController.pan(dx, dy);
  }

  /** 切换导航模式（设计 23.2：orbit / fly / pan）。 */
  setNavigationMode(mode: NavigationMode): void {
    if (mode === this.navigationMode) return;
    this.navigationMode = mode;
    if (!this.camera) return;
    // 重新构造对应模式的控制器，保留 target/distance
    const prev = this.cameraController;
    if (mode === 'orbit') {
      this.cameraController = new OrbitController(this.camera);
    } else if (mode === 'fly') {
      this.cameraController = new FlyController(this.camera);
    } else {
      // 'pan' 复用 OrbitController（实现层面 pan 通过 pan() 调用触发）
      this.cameraController = new OrbitController(this.camera);
    }
    if (prev && this.cameraController) {
      this.cameraController.target = prev.target;
      this.cameraController.distance = prev.distance;
    }
  }

  /** 获取当前导航模式。 */
  getNavigationMode(): NavigationMode {
    return this.navigationMode;
  }

  /** 获取相机状态快照（供 UI 展示）。 */
  getCameraState(): CameraStateSnapshot | null {
    if (!this.camera || !this.cameraController) return null;
    return {
      mode: this.navigationMode,
      position: { ...this.camera.position },
      target: { ...this.cameraController.target },
      distance: this.cameraController.distance,
      fov: this.camera.fov,
    };
  }

  /** 销毁：停止 rAF、释放监听器与底层资源。 */
  dispose(): void {
    this.disposed = true;
    this.stopRafLoop();
    this.listeners.clear();
    this.metricsListeners.clear();
    if (this.client) {
      try {
        this.client.dispose();
      } catch {
        /* noop */
      }
      this.client = null;
    }
    if (this.bodyRendererFactory) {
      try {
        // BodyRendererFactoryImpl.disposeAll 存在；如非 Impl 则逐个 dispose
        const f = this.bodyRendererFactory as unknown as {
          disposeAll?: () => void;
        };
        if (typeof f.disposeAll === 'function') f.disposeAll();
      } catch {
        /* noop */
      }
    }
    for (const r of this.bodyRenderers.values()) {
      try {
        r.dispose();
      } catch {
        /* noop */
      }
    }
    this.bodyRenderers.clear();
    if (this.renderer) {
      try {
        this.renderer.destroy();
      } catch {
        /* noop */
      }
      this.renderer = null;
    }
    if (this.resourceManager) {
      try {
        this.resourceManager.clear();
      } catch {
        /* noop */
      }
      this.resourceManager = null;
    }
    this.rendererInitialized = false;
    this.camera = null;
    this.cameraController = null;
    this.timePaused = false;
    this.state = 'idle';
  }

  // -----------------------------------------------------------------------
  // 内部：流程编排
  // -----------------------------------------------------------------------

  private applyOptions(options?: BootOptions): void {
    if (!options) return;
    if (options.canvas) this.canvas = options.canvas;
    if (options.bodyIds && options.bodyIds.length > 0) {
      this.bodyIds = options.bodyIds.slice();
    }
    if (options.preferredBackend) this.preferredBackend = options.preferredBackend;
    if (options.preferredQuality) this.preferredQuality = options.preferredQuality;
    if (options.wasmUrl) this.wasmUrl = options.wasmUrl;
    if (options.dataBaseUrl) this.dataBaseUrl = options.dataBaseUrl;
    if (typeof options.timeRate === 'number' && Number.isFinite(options.timeRate)) {
      this.timeRate = options.timeRate;
    }
    if (typeof options.simulationTimeMjd === 'number' && Number.isFinite(options.simulationTimeMjd)) {
      this.simulationTimeMjd = options.simulationTimeMjd;
    }
    if (options.navigationMode) this.navigationMode = options.navigationMode;
  }

  /** 执行启动流程，可从指定阶段恢复。 */
  private async runFlow(resumeFrom?: BootPhase | null): Promise<void> {
    const phases: BootPhase[] = ['core', 'ephemeris', 'bodies', 'assets'];
    const startIdx = resumeFrom ? Math.max(0, phases.indexOf(resumeFrom)) : 0;

    try {
      for (let i = startIdx; i < phases.length; i++) {
        const phase = phases[i]!;
        await this.runPhase(phase);
      }
      this.transitionTo('ready');
      this.emit({ type: 'ready' });
      this.startRafLoop();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.lastError = message;
      // 任意阶段失败都判定 retryable（除非 dispose 导致）
      const retryable = !this.disposed;
      this.transitionTo('error');
      this.emit({
        type: 'error',
        phase: this.failedPhase ?? 'core',
        message,
        retryable,
      });
    }
  }

  /** 单个阶段的执行体：进入 → 子步骤（progress） → 离开。 */
  private async runPhase(phase: BootPhase): Promise<void> {
    this.emit({ type: 'phase-start', phase });
    // 把 OrchestratorState 同步到当前阶段（便于 UI / 测试观察）
    switch (phase) {
      case 'core':
        this.transitionTo('diagnostics');
        break;
      case 'ephemeris':
        this.transitionTo('worker-init');
        break;
      case 'bodies':
        this.transitionTo('resource-load');
        break;
      case 'assets':
        this.transitionTo('renderer-create');
        break;
      case 'ready':
        this.transitionTo('ready');
        break;
    }
    await this.emitProgress(phase, 0);
    try {
      switch (phase) {
        case 'core':
          await this.phaseDiagnostics(phase);
          break;
        case 'ephemeris':
          await this.phaseWorkerInit(phase);
          break;
        case 'bodies':
          await this.phaseResourceLoad(phase);
          break;
        case 'assets':
          await this.phaseRendererAndBodyRenderers(phase);
          break;
      }
      await this.emitProgress(phase, 100);
    } catch (e) {
      this.failedPhase = phase;
      throw e;
    }
    this.emit({ type: 'phase-complete', phase });
  }

  // ---- core 阶段：诊断 + 推荐后端/画质 ----
  private async phaseDiagnostics(phase: BootPhase): Promise<void> {
    this.capabilities = await detectCapabilities();
    await this.emitProgress(phase, 50);
    this.benchmark = await runBenchmark(this.capabilities);
    this.chosenBackend = this.preferredBackend ?? recommendBackend(this.capabilities);
    this.chosenQuality = this.preferredQuality ?? this.benchmark.recommendedQuality;
    await this.emitProgress(phase, 80);
  }

  // ---- ephemeris 阶段：Worker + WASM 初始化 ----
  private async phaseWorkerInit(phase: BootPhase): Promise<void> {
    this.client = new AstroCoreClientImpl({
      wasmUrl: this.wasmUrl,
      autoReinit: true,
    });
    // 订阅 Worker 错误事件：超出最大重试次数后把状态机迁移到 error
    this.workerErrorListener = (err) => {
      this.workerReinitFailures += 1;
      if (this.workerReinitFailures > MAX_WORKER_REINIT_ATTEMPTS) {
        this.lastError = `Worker 反复崩溃：${err.message_zh}`;
        this.failedPhase = 'ephemeris';
        this.transitionTo('error');
        this.emit({
          type: 'error',
          phase: 'ephemeris',
          message: this.lastError,
          retryable: !this.disposed,
        });
        this.stopRafLoop();
      }
    };
    this.client.subscribeError(this.workerErrorListener);
    await this.emitProgress(phase, 50);
    // AstroCoreClient.init 内部会 spawn Worker + 加载 WASM + 等待 worker_ready；
    // 失败时（含指数退避耗尽）由其自身抛出，这里捕获后转换为编排器错误。
    try {
      await this.client.init();
    } catch (e) {
      // 复用 astro-core-client 已有的指数退避 reinit 逻辑：让 init 抛错时
      // 这里也尝试最多 MAX_WORKER_REINIT_ATTEMPTS 次。每次按 1s/2s/4s/8s/16s 退避。
      let attempt = 0;
      let lastErr = e;
      while (attempt < MAX_WORKER_REINIT_ATTEMPTS && !this.disposed) {
        const delay = Math.min(1000 * 2 ** attempt, 16000);
        await new Promise((r) => setTimeout(r, delay));
        attempt += 1;
        try {
          // 重新构造客户端（旧客户端已无法恢复）
          try {
            this.client!.dispose();
          } catch {
            /* noop */
          }
          this.client = new AstroCoreClientImpl({
            wasmUrl: this.wasmUrl,
            autoReinit: true,
          });
          this.client.subscribeError(this.workerErrorListener);
          await this.client.init();
          return;
        } catch (e2) {
          lastErr = e2;
        }
      }
      throw lastErr;
    }
  }

  // ---- bodies 阶段：加载 catalog.json + ephemeris binaries ----
  private async phaseResourceLoad(phase: BootPhase): Promise<void> {
    this.resourceManager = new ResourceManager();
    await this.emitProgress(phase, 30);
    // 加载 catalog.json
    try {
      const catalogResp = await fetch(`${this.dataBaseUrl}/catalog.json`);
      if (catalogResp.ok) {
        await catalogResp.json();
      }
    } catch {
      // catalog 缺失不阻塞启动（最小可见集仍可渲染）
    }
    await this.emitProgress(phase, 60);
    // 加载每个 bodyId 对应的星历二进制（命名约定：ephemeris-<id>.bin），
    // 解析为 JSON 并注册到 WASM 内核（P0-7 / 设计文档 14.1）。
    //
    // 关键背景：SSPH 二进制由 Python 管线用“简化 ID”写出
    // （0=太阳, 3=地球, 301=月球），但运行时按 NAIF ID 索引天体
    // （10=太阳, 399=地球, 301=月球）。此处用文件名中的 NAIF ID
    // 覆盖二进制内的 body_id，使注册到 WASM 的 body_id 与 catalog/编排器一致。
    const ids = this.bodyIds;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      try {
        const resp = await fetch(`${this.dataBaseUrl}/ephemeris-${id}.bin`);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          // 用 NAIF ID 覆盖二进制内的简化 body_id
          const bodyJson = parseSsphToJson(buf, id);
          if (this.client) {
            await this.client.registerEphemeris(bodyJson);
          }
        }
      } catch (e) {
        // SSPH 解析失败或 WASM 注册失败：记录日志但不阻塞启动
        // （最小可见集仍可渲染，只是该天体状态为默认 origin）
        const msg = e instanceof SsphParseError
          ? `SSPH 解析失败 body_id=${id}: ${e.message}`
          : e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.warn(`[orchestrator] ephemeris-${id}.bin 注册失败: ${msg}`);
      }
      await this.emitProgress(phase, 60 + Math.floor((40 * (i + 1)) / ids.length));
    }
  }

  // ---- assets 阶段：渲染器创建 + 天体渲染器注册 ----
  private async phaseRendererAndBodyRenderers(phase: BootPhase): Promise<void> {
    // 1. 选择 RendererFactory
    const backend: BackendType = this.chosenBackend;
    const factory = this.resolveRendererFactory(backend);
    if (!factory) {
      throw new Error(`无可用的渲染后端工厂：${backend}；请确认 apps/web/src/main.tsx 已 import @solar-system/renderer-webgpu 与 @solar-system/renderer-webgl2`);
    }
    await this.emitProgress(phase, 30);
    // 2. 创建 Renderer（attach 到 canvas 若已提供）
    const config: RendererConfig = {
      width: this.canvas?.width ?? 800,
      height: this.canvas?.height ?? 600,
      pixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
      backend,
      antialias: true,
      colorSpace: 'srgb',
    };
    const renderer = await factory.create(config);
    this.renderer = renderer;
    // P0 修复：renderer.init(canvas) 必须在 canvas 可用时才调用。
    // App.tsx 的 React 渲染时序决定了 SceneViewport.mount 在 'ready' 之后才触发，
    // 因此此处不调用 init；attachCanvas 会在 canvas 可用时负责调用 init 并设置 rendererInitialized。
    if (this.canvas) {
      try {
        await renderer.init(this.canvas);
        this.rendererInitialized = true;
      } catch (e) {
        // 同步 init 失败：让 attachCanvas 重试
        this.rendererInitialized = false;
        throw e;
      }
    }
    await this.emitProgress(phase, 60);
    // 3. 创建 BodyRendererFactory 并按 bodyIds 注册渲染器
    this.bodyRendererFactory = new BodyRendererFactoryImpl(renderer);
    for (const id of this.bodyIds) {
      const r = this.bodyRendererFactory.create(id, {
        quality: this.chosenQuality,
      });
      if (r) {
        this.bodyRenderers.set(id, r);
      }
    }
    // 4. 确保 bodyIds 中包含太阳（用于 sunDirection 计算）
    if (!this.bodyIds.includes(SUN_BODY_ID)) {
      const sunR = this.bodyRendererFactory.create(SUN_BODY_ID, {
        quality: this.chosenQuality,
      });
      if (sunR) this.bodyRenderers.set(SUN_BODY_ID, sunR);
    }
    // 5. 创建相机与控制器（P0 修复：编排器必须持有相机并每帧更新）
    const canvasW = this.canvas?.width ?? 800;
    const canvasH = this.canvas?.height ?? 600;
    this.camera = new PerspectiveCamera('main-camera', 60, canvasW / canvasH, 0.1, 1e12);
    this.camera.updateProjection();
    if (this.navigationMode === 'fly') {
      this.cameraController = new FlyController(this.camera);
    } else {
      // orbit / pan 均使用 OrbitController（pan 通过 pan() 调用触发）
      this.cameraController = new OrbitController(this.camera);
    }
    // P0-8 修复：OrbitController 构造函数会以默认 distance=10 调用 updateCamera()，
    // 覆盖 camera.position。这里必须在控制器创建之后显式设置 target 与 distance，
    // 使相机位于太阳外侧、能完整看到太阳圆面。
    //   target  = 太阳质心（原点）
    //   distance= 2×10⁹ m ≈ 2.9 R_sun，太阳在 60° FOV 中约占 1/4 画面
    this.cameraController.target = { x: 0, y: 0, z: 0 };
    this.cameraController.distance = 2e9;
  }

  /** 解析渲染后端工厂（在 renderer-webgpu / renderer-webgl2 包未注入时返回 null）。 */
  private resolveRendererFactory(backend: BackendType): RendererFactory | null {
    // P0 修复：renderer-webgpu / renderer-webgl2 在 import 时通过 renderer-core 的
    // registerRendererFactory 把工厂注册到 rendererFactories（模块级 Map）。
    // 此前本方法只查 globalThis.__solarRendererFactories（一个未被任何后端写入的注册表），
    // 导致 resolveRendererFactory 永远返回 null，编排器抛 "无可用的渲染后端工厂"。
    if (rendererFactories[backend]) {
      return rendererFactories[backend]!;
    }
    // 回退：测试环境可能通过 globalThis 注入
    try {
      const registry = (globalThis as unknown as {
        __solarRendererFactories?: Partial<Record<BackendType, RendererFactory>>;
      }).__solarRendererFactories;
      if (registry && registry[backend]) {
        return registry[backend]!;
      }
    } catch {
      /* noop */
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // rAF 循环：snapshot → BodyRenderer.update → renderer.submit
  // -----------------------------------------------------------------------

  private startRafLoop(): void {
    if (this.rafLoopRunning) return;
    this.rafLoopRunning = true;
    this.lastFrameTimestamp = 0;
    this.lastMetricsEmit = 0;
    this.frameTimeSamples = [];
    this.rafHandle = this.raf(this.tick);
  }

  private stopRafLoop(): void {
    this.rafLoopRunning = false;
    if (this.rafHandle !== null) {
      try {
        this.caf(this.rafHandle);
      } catch {
        /* noop */
      }
      this.rafHandle = null;
    }
  }

  private tick = (timestamp: number): void => {
    if (!this.rafLoopRunning || this.disposed) return;
    const deltaTimeMs = this.lastFrameTimestamp === 0 ? 16 : timestamp - this.lastFrameTimestamp;
    this.lastFrameTimestamp = timestamp;
    this.frame(deltaTimeMs);
    this.rafHandle = this.raf(this.tick);
  };

  /** 单帧：更新时间 → 触发 evaluateSnapshot → 用最新快照分发 BodyState → 渲染 → 收集指标。 */
  private frame(deltaTimeMs: number): void {
    const renderer = this.renderer;
    const client = this.client;
    if (!renderer || !client) return;

    // 1. 推进模拟时间（暂停时不推进）
    if (!this.timePaused) {
      const deltaTimeDays = (deltaTimeMs / 1000) * this.timeRate;
      this.simulationTimeMjd += deltaTimeDays;
    }
    const utc = this.simulationTimeMjd;

    // 2. 更新相机控制器（每帧推进，便于 fly 模式惯性衰减；orbit 模式仅同步矩阵）
    if (this.camera && this.cameraController) {
      try {
        this.cameraController.update(deltaTimeMs);
        this.camera.updateView();
      } catch {
        /* noop */
      }
    }

    // 3. 异步触发 evaluateSnapshot（R-02 修复的核心调用）。
    //    由于 rAF 回调不能 await，本帧使用上一帧拿到的快照；首次为 null
    //    时 BodyRenderer.update 不被调用，渲染器仅以默认状态绘制一帧。
    const registeredIds = Array.from(this.bodyRenderers.keys()).filter(
      (id): id is number => typeof id === 'number',
    );
    const workerStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    client
      .evaluateSnapshot(registeredIds, utc)
      .then((s) => {
        this.latestSnapshot = s as CelestialStateSnapshot;
      })
      .catch(() => {
        /* 单帧快照失败忽略；保留上一帧快照 */
      })
      .finally(() => {
        const workerEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.lastWorkerLatencyMs = workerEnd - workerStart;
      });

    // 4. 分发 BodyState → BodyRenderer.update
    const snapshot = this.latestSnapshot;
    const bodies = snapshot?.bodies ?? [];
    const sunState = bodies.find((b) => b.body_id === SUN_BODY_ID);
    const sunPosition: Vec3d = sunState?.position ?? { x: 0, y: 0, z: 0 };
    for (const body of bodies) {
      const r = this.bodyRenderers.get(body.body_id);
      if (!r) continue;
      const sunDirection = this.computeSunDirection(sunPosition, body.position);
      r.update(utc, body.position, body.orientation as Quat64, sunDirection);
    }

    // 5. P0 修复：每帧先做一次 "canvas 清屏" pass，确保 canvas 实际被绘制。
    //    各 BodyRenderer 内部把自己的绘制提交到 offscreen render target，
    //    若编排器不显式触发一次以 canvas 为 color attachment 的 pass，画面将永远停留在首帧。
    //    WebGPU beginPass 在 colorAttachments[0].texture.id 未命中 this.textures 时
    //    回落到 canvas.getCurrentTexture()；WebGL2 beginPass 始终操作当前绑定的 framebuffer（默认 canvas）。
    //    仅在 renderer 已 init（即 attachCanvas 已被调用且 init 成功）时执行；
    //    测试用 mock renderer 可能未 init，跳过以避免 beginPass 抛错。
    if (this.rendererInitialized) {
      try {
        renderer.beginPass({
          colorAttachments: [
            {
              // 故意使用一个不存在的 texture id，触发 WebGPU fallback 到 canvas
              texture: { id: '__canvas__', format: 'rgba8unorm' },
              clear: [0.02, 0.02, 0.05, 1.0], // 深空蓝黑
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        renderer.endPass();
      } catch {
        /* 单帧清屏失败忽略 */
      }
    }

    // 6. 渲染：每个 BodyRenderer.render()（内部自管理 beginPass/draw/endPass/submit）
    //    仅在 renderer 已 init 时调用，避免 mock 测试环境无 beginPass 等方法时抛错。
    this.drawCallCount = 0;
    this.triangleCount = 0;
    if (this.rendererInitialized) {
      // 6a. 上传本帧的 view-projection 矩阵到渲染后端。
      //     BodyRenderer 的顶点着色器需要 viewProj 将模型空间顶点变换到裁剪
      //     空间；缺失会导致 WebGL2 后端退化到单位矩阵，所有天体顶点都落在
      //     NDC 之外而不可见（P0-8 的关键根因之一）。
      if (this.camera) {
        try {
          renderer.setViewProj(this.camera.viewProjectionMatrix);
        } catch {
          /* mock renderer 可能未实现 setViewProj，忽略 */
        }
      }
      for (const r of this.bodyRenderers.values()) {
        if (!r.enabled) continue;
        try {
          r.render();
          this.drawCallCount += 1;
          this.triangleCount += this.estimateTriangles(r);
        } catch {
          /* 单个 renderer 失败不阻塞帧 */
        }
      }
    }
    try {
      renderer.submit();
    } catch {
      /* noop */
    }

    // 7. 性能指标采样
    this.frameTimeSamples.push(deltaTimeMs);
    if (this.frameTimeSamples.length > 60) this.frameTimeSamples.shift();
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.lastMetricsEmit === 0 || now - this.lastMetricsEmit >= 500) {
      this.emitMetrics();
      this.lastMetricsEmit = now;
    }
  }

  /** 计算从 body 指向 sun 的单位方向向量。 */
  private computeSunDirection(sunPos: Vec3d, bodyPos: Vec3d): Vec3d {
    const dx = sunPos.x - bodyPos.x;
    const dy = sunPos.y - bodyPos.y;
    const dz = sunPos.z - bodyPos.z;
    const len = Math.hypot(dx, dy, dz);
    if (len === 0) return { x: 0, y: 0, z: 1 };
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  /** 估算 BodyRenderer 的三角形数（基于 bounding radius / LOD 的粗略估计）。 */
  private estimateTriangles(r: BodyRenderer): number {
    try {
      const radius = r.getBoundingRadius();
      // 球体 16 段约 16*8*2 = 256 三角形；按半径对数缩放给出粗略估计
      return Math.max(256, Math.floor(radius / 1000));
    } catch {
      return 256;
    }
  }

  private emitMetrics(): void {
    if (this.metricsListeners.size === 0) return;
    const samples = this.frameTimeSamples;
    const avgFrameTime =
      samples.length === 0
        ? 0
        : samples.reduce((sum, v) => sum + v, 0) / samples.length;
    const fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
    const snapshot: MetricsSnapshot = {
      fps,
      frameTimeMs: avgFrameTime,
      drawCalls: this.drawCallCount,
      triangles: this.triangleCount,
      textures: this.textureCount,
      shaders: this.shaderCount,
      workerLatencyMs: this.lastWorkerLatencyMs,
    };
    for (const l of this.metricsListeners) {
      try {
        l(snapshot);
      } catch {
        /* noop */
      }
    }
  }

  // -----------------------------------------------------------------------
  // 内部：事件 / 状态
  // -----------------------------------------------------------------------

  private transitionTo(state: OrchestratorState): void {
    this.state = state;
  }

  private emit(event: BootEvent): void {
    if (this.disposed) return;
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* noop */
      }
    }
  }

  /** 发出阶段内进度事件，并按权重计算总进度。 */
  private async emitProgress(phase: BootPhase, phaseProgress: number): Promise<void> {
    const phases: BootPhase[] = ['core', 'ephemeris', 'bodies', 'assets'];
    const idx = phases.indexOf(phase);
    const beforeWeight = phases
      .slice(0, idx)
      .reduce((sum, p) => sum + BOOT_PHASE_WEIGHTS[p], 0);
    const phaseWeight = BOOT_PHASE_WEIGHTS[phase];
    const overall = beforeWeight + (phaseWeight * phaseProgress) / 100;
    this.emit({ type: 'progress', phase, phaseProgress, overallProgress: overall });
    // 让出 microtask，便于监听器处理
    await Promise.resolve();
  }

  // -----------------------------------------------------------------------
  // 测试访问器（仅供测试使用，不属于公共 API）
  // -----------------------------------------------------------------------

  /** @internal 仅供测试访问内部 client。 */
  _getClientForTests(): AstroCoreClient | null {
    return this.client;
  }

  /** @internal 仅供测试访问内部 renderer。 */
  _getRendererForTests(): Renderer | null {
    return this.renderer;
  }

  /** @internal 仅供测试访问内部 bodyRenderers。 */
  _getBodyRenderersForTests(): Map<BodyId, BodyRenderer> {
    return this.bodyRenderers;
  }

  /** @internal 仅供测试强制推进一帧。 */
  _tickForTests(deltaTimeMs: number): void {
    this.frame(deltaTimeMs);
  }

  /** @internal 仅供测试设置已注入的渲染器工厂（绕过 resolveRendererFactory）。 */
  _setRendererForTests(renderer: Renderer): void {
    this.renderer = renderer;
  }

  /** @internal 仅供测试设置已注入的 body renderer。 */
  _setBodyRendererForTests(id: BodyId, r: BodyRenderer): void {
    this.bodyRenderers.set(id, r);
  }

  /** @internal 仅供测试设置已注入的 client。 */
  _setClientForTests(client: AstroCoreClient): void {
    this.client = client;
  }
}

// ---------------------------------------------------------------------------
// 工厂注入 API：renderer-webgpu / renderer-webgl2 在 import 时调用
// registerRendererFactory 注入后端工厂；编排器通过 globalThis 读取。
// ---------------------------------------------------------------------------

/**
 * 注入渲染后端工厂（由 renderer-webgpu / renderer-webgl2 在启动时调用）。
 */
export function registerRendererFactory(backend: BackendType, factory: RendererFactory): void {
  const g = globalThis as unknown as {
    __solarRendererFactories?: Partial<Record<BackendType, RendererFactory>>;
  };
  if (!g.__solarRendererFactories) {
    g.__solarRendererFactories = {};
  }
  g.__solarRendererFactories[backend] = factory;
}

// ---------------------------------------------------------------------------
// 默认导出（便于 App.tsx 单一 import）
// ---------------------------------------------------------------------------

export default AppOrchestrator;
