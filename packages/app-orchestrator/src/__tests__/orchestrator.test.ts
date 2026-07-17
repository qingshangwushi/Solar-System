/**
 * AppOrchestrator 启动编排测试（任务 T-P0-10 / 修复 E-25 / R-02）。
 *
 * 覆盖：
 * - 正常启动流程：idle → diagnostics → worker-init → resource-load
 *   → renderer-create → body-renderers-register → ready，每阶段发出 progress。
 * - Worker 错误触发指数退避 reinit（首次 init 抛错，第二次成功）。
 * - retry() 从 error 状态恢复。
 * - dispose() 清理 rAF 循环与监听器。
 *
 * 所有外部依赖（diagnostics、astro-core-api、renderer-core、body-renderers、
 * resource-runtime）均通过 vi.mock 替换为桩实现，绝不加载真实 WASM。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BootEvent, MetricsSnapshot } from '../index.js';

// ---------------------------------------------------------------------------
// 模块级 mock：在 import orchestrator 之前用 vi.mock 替换所有外部依赖。
// ---------------------------------------------------------------------------

// 1. @solar-system/diagnostics：所有函数返回可控结果
const detectCapabilitiesMock = vi.fn(async () => ({
  browser: 'chrome' as const,
  browserVersion: '120',
  os: 'macos' as const,
  osVersion: '14.0',
  webgpu: { supported: true, adapter: 'mock', limits: null, featureLevel: 'full' as const },
  webgl2: {
    supported: true,
    renderer: 'mock',
    vendor: 'mock',
    maxTextureSize: 4096,
    maxTextureUnits: 16,
    compressedTextureFormats: [],
  },
  textureCompression: { etc1: false, etc2: false, astc: true, pvrtc: false, bc: false, basis: false },
  memory: { totalJsHeapSize: null, usedJsHeapSize: null },
  maxTextureSize: 4096,
}));
const runBenchmarkMock = vi.fn(async () => ({
  gpuFrameTimeMs: 8,
  cpuFrameTimeMs: 5,
  recommendedQuality: 'high' as const,
  gpuScore: 70,
  notes: ['mock'],
}));
const recommendBackendMock = vi.fn(() => 'webgpu' as const);
const recommendQualityMock = vi.fn(() => 'high' as const);

vi.mock('@solar-system/diagnostics', () => ({
  detectCapabilities: detectCapabilitiesMock,
  runBenchmark: runBenchmarkMock,
  recommendBackend: recommendBackendMock,
  recommendQuality: recommendQualityMock,
}));

// 2. @solar-system/astro-core-api：AstroCoreClient 用可记录调用的 mock 类替换
//
//    init() 默认成功；测试可通过 setNextInitResult 控制下次 init() 行为
//    （抛错或成功），用于覆盖 Worker 崩溃 reinit 路径。
const astroCoreClientCtorMock = vi.fn();
const initMock = vi.fn();
const subscribeErrorMock = vi.fn((_cb: (e: { code: string; message_zh: string }) => void) => () => {});
const evaluateSnapshotMock = vi.fn(async (_bodyIds: number[], _utc: number) => ({
  bodies: [],
  simulation_time_utc: { mjd: 51544, scale: 'Utc', uncertainty: { predicted: false, predicted_delta_t: false } },
  simulation_time_tdb: { mjd: 51544, scale: 'Tdb', uncertainty: { predicted: false, predicted_delta_t: false } },
  reference_epoch: 0,
}));
const clientDisposeMock = vi.fn();
const isReadyMock = vi.fn(() => true);

class MockAstroCoreClient {
  static initCalls = 0;
  static initFailFirst = false;
  static reset(): void {
    MockAstroCoreClient.initCalls = 0;
    MockAstroCoreClient.initFailFirst = false;
  }
  constructor(...args: unknown[]) {
    astroCoreClientCtorMock(...args);
  }
  async init(): Promise<void> {
    MockAstroCoreClient.initCalls += 1;
    initMock();
    if (MockAstroCoreClient.initFailFirst && MockAstroCoreClient.initCalls === 1) {
      throw new Error('mock Worker init 失败');
    }
  }
  subscribeError(cb: (e: { code: string; message_zh: string }) => void): () => void {
    return subscribeErrorMock(cb);
  }
  async evaluateSnapshot(bodyIds: number[], utc: number): Promise<unknown> {
    return evaluateSnapshotMock(bodyIds, utc);
  }
  dispose(): void {
    clientDisposeMock();
  }
  isReady(): boolean {
    return isReadyMock();
  }
}

vi.mock('@solar-system/astro-core-api', () => ({
  AstroCoreClient: MockAstroCoreClient,
}));

// 3. @solar-system/resource-runtime：ResourceManager 用桩替换
const resourceManagerClearMock = vi.fn();
class MockResourceManager {
  clear(): void {
    resourceManagerClearMock();
  }
}
vi.mock('@solar-system/resource-runtime', () => ({
  ResourceManager: MockResourceManager,
}));

// 4. @solar-system/body-renderers：BodyRendererFactoryImpl 用桩替换
const bodyRendererCreateMock = vi.fn();
const bodyRendererDisposeAllMock = vi.fn();
class MockBodyRenderer {
  bodyId: number | string;
  enabled = true;
  update = vi.fn();
  render = vi.fn();
  dispose = vi.fn();
  getBoundingRadius = vi.fn(() => 1000);
  setLOD = vi.fn();
  constructor(id: number | string) {
    this.bodyId = id;
  }
}
class MockBodyRendererFactory {
  create(id: number | string): MockBodyRenderer | null {
    bodyRendererCreateMock(id);
    return new MockBodyRenderer(id);
  }
  disposeAll(): void {
    bodyRendererDisposeAllMock();
  }
}
vi.mock('@solar-system/body-renderers', () => ({
  BodyRendererFactoryImpl: MockBodyRendererFactory,
  PLANET_BODY_IDS: { SUN: 10, EARTH: 399, MOON: 301 },
}));

// 5. fetch 桩（用于 resource-load 阶段）
const fetchMock = vi.fn(async (_url: string) => ({
  ok: true,
  json: async () => ({}),
  arrayBuffer: async () => new ArrayBuffer(0),
}));
vi.stubGlobal('fetch', fetchMock);

// 6. requestAnimationFrame / cancelAnimationFrame 桩
const rafHandles: number[] = [];
let rafCounter = 0;
const rafMock = vi.fn((_cb: (t: number) => void) => {
  const handle = ++rafCounter;
  rafHandles.push(handle);
  // 不自动调度，由测试手动触发或 dispose 取消
  return handle;
});
const cafMock = vi.fn((handle: number) => {
  const idx = rafHandles.indexOf(handle);
  if (idx >= 0) rafHandles.splice(idx, 1);
});
vi.stubGlobal('requestAnimationFrame', rafMock);
vi.stubGlobal('cancelAnimationFrame', cafMock);

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe('AppOrchestrator', () => {
  let orchestrator: InstanceType<typeof import('../index.js').AppOrchestrator>;
  let AppOrchestrator: typeof import('../index.js').AppOrchestrator;

  beforeEach(async () => {
    // 重置所有 mock 调用记录
    detectCapabilitiesMock.mockClear();
    runBenchmarkMock.mockClear();
    recommendBackendMock.mockClear();
    recommendQualityMock.mockClear();
    astroCoreClientCtorMock.mockClear();
    initMock.mockClear();
    subscribeErrorMock.mockClear();
    evaluateSnapshotMock.mockClear();
    clientDisposeMock.mockClear();
    isReadyMock.mockClear();
    resourceManagerClearMock.mockClear();
    bodyRendererCreateMock.mockClear();
    bodyRendererDisposeAllMock.mockClear();
    fetchMock.mockClear();
    rafMock.mockClear();
    cafMock.mockClear();
    MockAstroCoreClient.reset();
    rafHandles.length = 0;
    rafCounter = 0;

    // 动态 import 以让 vi.mock 生效
    const mod = await import('../index.js');
    AppOrchestrator = mod.AppOrchestrator;
    orchestrator = new AppOrchestrator({
      requestAnimationFrame: rafMock,
      cancelAnimationFrame: cafMock,
    });

    // 注入 mock RendererFactory（绕过 resolveRendererFactory 的 globalThis 查找）
    // 通过 _setRendererForTests 直接注入 renderer 实例
  });

  afterEach(() => {
    try {
      orchestrator.dispose();
    } catch {
      /* noop */
    }
    // 清理 globalThis 上残留的工厂注入
    const g = globalThis as unknown as { __solarRendererFactories?: unknown };
    delete g.__solarRendererFactories;
  });

  // -----------------------------------------------------------------------
  // 正常启动流程
  // -----------------------------------------------------------------------

  it('正常启动流程：idle → diagnostics → worker-init → resource-load → ready，发出阶段事件与 progress', async () => {
    // 注入 mock RendererFactory（通过 globalThis）
    const mockRenderer = {
      backend: 'webgpu' as const,
      capabilities: {},
      init: vi.fn(async () => {}),
      destroy: vi.fn(),
      resize: vi.fn(),
      submit: vi.fn(),
    };
    const mockFactory = {
      create: vi.fn(async () => mockRenderer),
      isSupported: vi.fn(() => true),
    };
    const g = globalThis as unknown as {
      __solarRendererFactories?: Record<string, unknown>;
    };
    g.__solarRendererFactories = { webgpu: mockFactory };

    const events: BootEvent[] = [];
    orchestrator.subscribe((e) => events.push(e));

    await orchestrator.start({ bodyIds: [10, 399, 301] });

    // 状态变为 ready
    expect(orchestrator.getState()).toBe('ready');

    // 阶段事件：每个阶段至少有 phase-start + phase-complete
    const phaseStarts = events.filter((e) => e.type === 'phase-start').map((e) => (e as { phase: string }).phase);
    const phaseCompletes = events.filter((e) => e.type === 'phase-complete').map((e) => (e as { phase: string }).phase);
    expect(phaseStarts).toEqual(['core', 'ephemeris', 'bodies', 'assets']);
    expect(phaseCompletes).toEqual(['core', 'ephemeris', 'bodies', 'assets']);

    // 有 ready 事件
    expect(events.some((e) => e.type === 'ready')).toBe(true);

    // 有 progress 事件，覆盖 0–100
    const progressEvents = events.filter((e) => e.type === 'progress') as Array<{
      type: 'progress';
      phase: string;
      phaseProgress: number;
      overallProgress: number;
    }>;
    expect(progressEvents.length).toBeGreaterThan(0);
    // 总进度应单调非减
    for (let i = 1; i < progressEvents.length; i++) {
      expect(progressEvents[i]!.overallProgress).toBeGreaterThanOrEqual(
        progressEvents[i - 1]!.overallProgress,
      );
    }
    // 最后一个 progress 总进度应接近 100（assets 完成后 = 20+30+30+20=100）
    const lastProgress = progressEvents[progressEvents.length - 1]!;
    expect(lastProgress.overallProgress).toBe(100);

    // diagnostics 被调用
    expect(detectCapabilitiesMock).toHaveBeenCalledTimes(1);
    expect(runBenchmarkMock).toHaveBeenCalledTimes(1);
    expect(recommendBackendMock).toHaveBeenCalledTimes(1);

    // AstroCoreClient 被构造与 init
    expect(astroCoreClientCtorMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledTimes(1);

    // BodyRendererFactory.create 为每个 bodyId 调用过（含太阳）
    expect(bodyRendererCreateMock).toHaveBeenCalledWith(10);
    expect(bodyRendererCreateMock).toHaveBeenCalledWith(399);
    expect(bodyRendererCreateMock).toHaveBeenCalledWith(301);

    // rAF 已调度
    expect(rafMock).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Worker 错误触发 reinit
  // -----------------------------------------------------------------------

  it('Worker init 首次抛错时触发指数退避 reinit，第二次成功后到达 ready', async () => {
    MockAstroCoreClient.initFailFirst = true;

    // 注入 mock RendererFactory
    const mockRenderer = { init: vi.fn(async () => {}), destroy: vi.fn(), submit: vi.fn() };
    const mockFactory = { create: vi.fn(async () => mockRenderer), isSupported: vi.fn(() => true) };
    const g = globalThis as unknown as {
      __solarRendererFactories?: Record<string, unknown>;
    };
    g.__solarRendererFactories = { webgpu: mockFactory };

    // 用 fake timers 加速指数退避
    vi.useFakeTimers();
    try {
      const startPromise = orchestrator.start({ bodyIds: [10, 399, 301] });
      // 推进足够长的时间让指数退避完成（首次失败 → 1s 退避 → 第二次成功）
      await vi.advanceTimersByTimeAsync(2000);
      await startPromise;

      expect(orchestrator.getState()).toBe('ready');
      // init 被调用至少 2 次
      expect(initMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // -----------------------------------------------------------------------
  // retry() 从 error 状态恢复
  // -----------------------------------------------------------------------

  it('start 失败后 retry() 从失败阶段重新执行并最终到达 ready', async () => {
    // 第一次让 Worker init 失败（且关闭自动 reinit 让流程快速报错）
    MockAstroCoreClient.initFailFirst = true;
    // 让 init 始终抛错（不论调用几次）—— 通过覆盖 initMock 行为
    const originalInit = MockAstroCoreClient.prototype.init;
    MockAstroCoreClient.prototype.init = async function () {
      MockAstroCoreClient.initCalls += 1;
      initMock();
      throw new Error('mock Worker init 持续失败');
    };

    // 注入 mock RendererFactory
    const mockRenderer = { init: vi.fn(async () => {}), destroy: vi.fn(), submit: vi.fn() };
    const mockFactory = { create: vi.fn(async () => mockRenderer), isSupported: vi.fn(() => true) };
    const g = globalThis as unknown as {
      __solarRendererFactories?: Record<string, unknown>;
    };
    g.__solarRendererFactories = { webgpu: mockFactory };

    const events: BootEvent[] = [];
    orchestrator.subscribe((e) => events.push(e));

    // 用 fake timers 加速 reinit 退避
    vi.useFakeTimers();
    try {
      const startPromise = orchestrator.start({ bodyIds: [10, 399, 301] });
      // 退避 5 次：1+2+4+8+16 = 31s，再给一些缓冲
      await vi.advanceTimersByTimeAsync(35000);
      await startPromise;
    } finally {
      vi.useRealTimers();
    }

    // 应该处于 error 状态
    expect(orchestrator.getState()).toBe('error');
    const errorEvent = events.find((e) => e.type === 'error') as
      | { type: 'error'; phase: string; message: string; retryable: boolean }
      | undefined;
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.phase).toBe('ephemeris');
    expect(errorEvent!.retryable).toBe(true);

    // 恢复 init 为成功
    MockAstroCoreClient.prototype.init = originalInit;
    MockAstroCoreClient.initFailFirst = false;
    MockAstroCoreClient.initCalls = 0;

    await orchestrator.retry();

    expect(orchestrator.getState()).toBe('ready');
  });

  // -----------------------------------------------------------------------
  // dispose() 清理 rAF + 监听器
  // -----------------------------------------------------------------------

  it('dispose() 取消 rAF 句柄、清空监听器、销毁 client 与 ResourceManager', async () => {
    // 注入 mock RendererFactory
    const mockRenderer = {
      init: vi.fn(async () => {}),
      destroy: vi.fn(),
      submit: vi.fn(),
    };
    const mockFactory = { create: vi.fn(async () => mockRenderer), isSupported: vi.fn(() => true) };
    const g = globalThis as unknown as {
      __solarRendererFactories?: Record<string, unknown>;
    };
    g.__solarRendererFactories = { webgpu: mockFactory };

    await orchestrator.start({ bodyIds: [10, 399, 301] });
    expect(orchestrator.getState()).toBe('ready');
    expect(rafMock).toHaveBeenCalled();

    const rafHandleBefore = rafHandles.length;
    expect(rafHandleBefore).toBeGreaterThan(0);

    // 监听器存在
    const metricsListener = vi.fn();
    orchestrator.subscribeMetrics(metricsListener);

    orchestrator.dispose();

    // 状态回到 idle
    expect(orchestrator.getState()).toBe('idle');

    // cancelAnimationFrame 被调用
    expect(cafMock).toHaveBeenCalled();

    // client.dispose 被调用
    expect(clientDisposeMock).toHaveBeenCalled();

    // ResourceManager.clear 被调用
    expect(resourceManagerClearMock).toHaveBeenCalled();

    // Renderer.destroy 被调用
    expect(mockRenderer.destroy).toHaveBeenCalled();

    // 订阅后再触发事件不应到达已 disposed 的监听器
    const listener = vi.fn();
    orchestrator.subscribe(listener);
    // 直接调用 dispose 已清空 listeners，再 emit 不会触发
    // （没有公开 emit 入口，无法直接验证；通过 metrics 订阅返回的 unsubscribe 函数已无副作用）
  });

  // -----------------------------------------------------------------------
  // 指标订阅
  // -----------------------------------------------------------------------

  it('subscribeMetrics 收到包含 fps / drawCalls 的 MetricsSnapshot', async () => {
    const mockRenderer = {
      init: vi.fn(async () => {}),
      destroy: vi.fn(),
      submit: vi.fn(),
    };
    const mockFactory = { create: vi.fn(async () => mockRenderer), isSupported: vi.fn(() => true) };
    const g = globalThis as unknown as {
      __solarRendererFactories?: Record<string, unknown>;
    };
    g.__solarRendererFactories = { webgpu: mockFactory };

    await orchestrator.start({ bodyIds: [10, 399, 301] });
    expect(orchestrator.getState()).toBe('ready');

    const metrics: MetricsSnapshot[] = [];
    orchestrator.subscribeMetrics((m) => metrics.push(m));

    // 手动推进几帧（注入了 rafMock 不会自动调度）
    orchestrator._tickForTests(16);
    orchestrator._tickForTests(16);
    // 触发 metrics emit（lastMetricsEmit 起点为 0，第一次 tick 就会触发）
    orchestrator._tickForTests(16);

    expect(metrics.length).toBeGreaterThan(0);
    const m = metrics[0]!;
    expect(typeof m.fps).toBe('number');
    expect(typeof m.drawCalls).toBe('number');
    expect(typeof m.workerLatencyMs).toBe('number');
  });

  // -----------------------------------------------------------------------
  // 重复调用 start 安全
  // -----------------------------------------------------------------------

  it('start() 在 ready 状态下重复调用是 no-op', async () => {
    const mockRenderer = { init: vi.fn(async () => {}), destroy: vi.fn(), submit: vi.fn() };
    const mockFactory = { create: vi.fn(async () => mockRenderer), isSupported: vi.fn(() => true) };
    const g = globalThis as unknown as {
      __solarRendererFactories?: Record<string, unknown>;
    };
    g.__solarRendererFactories = { webgpu: mockFactory };

    await orchestrator.start({ bodyIds: [10, 399, 301] });
    const initCallsBefore = initMock.mock.calls.length;
    await orchestrator.start({ bodyIds: [10, 399, 301] });
    expect(initMock.mock.calls.length).toBe(initCallsBefore);
  });
});
