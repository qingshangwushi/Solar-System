import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResourceValidatorImpl,
  OpsManagerImpl,
  createResourceValidator,
  createOpsManager,
  type OpsMetricsProvider,
  type ResourceType,
} from '../productization.js';

/**
 * Productization 真实化测试（修复 E-24：替换 Math.random）。
 *
 * 覆盖：
 * - calculateHash 用 crypto.subtle.digest('SHA-256') 生成真实哈希
 * - hashCache 按 path 缓存
 * - fetch 失败回退 'fallback-' 前缀
 * - checkExists 用 fetch HEAD（不再常真）
 * - getSize 用真实文件大小（不再随机）
 * - getStats 接入真实 PerformanceMonitor 数据
 */

/** 构造可控的 fetch stub：HEAD/GET 分别返回不同结果。 */
function setupFetchStub(opts: {
  headOk?: boolean;
  headContentLength?: number;
  getBuffer?: ArrayBuffer;
  getOk?: boolean;
}): typeof fetch {
  const headOk = opts.headOk ?? true;
  const getOk = opts.getOk ?? true;
  const buffer = opts.getBuffer ?? new TextEncoder().encode('hello-world').buffer;
  const headContentLength = opts.headContentLength ?? buffer.byteLength;
  const stub = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'HEAD') {
      return {
        ok: headOk,
        status: headOk ? 200 : 404,
        headers: new Headers(
          headOk ? { 'content-length': String(headContentLength) } : {},
        ),
        arrayBuffer: async () => buffer,
      } as unknown as Response;
    }
    return {
      ok: getOk,
      status: getOk ? 200 : 500,
      headers: new Headers({ 'content-length': String(buffer.byteLength) }),
      arrayBuffer: async () => buffer,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return stub;
}

describe('ResourceValidatorImpl (E-24: replace Math.random)', () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
    } else {
      // @ts-expect-error delete injected stub
      delete globalThis.fetch;
    }
  });

  it('calculateHash should return SHA-256 hex digest of fetched content (64 hex chars)', async () => {
    const content = 'hello-world';
    const buffer = new TextEncoder().encode(content).buffer;
    globalThis.fetch = setupFetchStub({ getBuffer: buffer });

    const validator = new ResourceValidatorImpl();
    // validate 内部会依次调用 checkExists / calculateHash / getSize / validateContent
    const result = await validator.validate('texture', '/assets/tex.png');

    // 期望 status=valid（hash 非 fallback 前缀）
    expect(result.status).toBe('valid');
    expect(result.hash).toBeDefined();
    expect(result.hash).not.toMatch(/^fallback-/);
    // SHA-256 输出 64 位十六进制
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('calculateHash should cache hash by path (fetch called once for repeated paths)', async () => {
    const buffer = new TextEncoder().encode('cache-me').buffer;
    const stub = setupFetchStub({ getBuffer: buffer });
    globalThis.fetch = stub;

    const validator = new ResourceValidatorImpl();
    const r1 = await validator.validate('mesh', '/m/a.glb');
    const r2 = await validator.validate('mesh', '/m/a.glb');

    expect(r1.hash).toBe(r2.hash);
    // GET 调用应该只为 hash 计算发生一次（第二次命中缓存）
    // 注意：checkExists 用 HEAD，getSize 也可能用 HEAD；GET 只在 calculateHash 内
    const getCalls = (stub as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => (c[1]?.method ?? 'GET') === 'GET',
    );
    expect(getCalls.length).toBe(1);
  });

  it('calculateHash should fall back to fallback- prefixed hash when fetch GET rejects', async () => {
    // HEAD 成功（checkExists 通过），但 GET 抛错触发 calculateHash 降级
    const stub = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'HEAD') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': '100' }),
          arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as Response;
      }
      throw new Error('network down');
    }) as unknown as typeof fetch;
    globalThis.fetch = stub;

    const validator = new ResourceValidatorImpl();
    const result = await validator.validate('shader', '/s/x.wgsl');

    expect(result.hash).toBeDefined();
    expect(result.hash).toMatch(/^fallback-[0-9a-f]+$/);
    // fallback hash 视为内容校验失败 → status=warning
    expect(result.status).toBe('warning');
  });

  it('checkExists should return false (HEAD non-2xx) → validate status=invalid', async () => {
    globalThis.fetch = setupFetchStub({ headOk: false });

    const validator = new ResourceValidatorImpl();
    const result = await validator.validate('audio', '/missing.wav');

    expect(result.status).toBe('invalid');
    expect(result.message).toBe('Resource not found');
  });

  it('getSize should return real byte length (not random)', async () => {
    // 真实文件大小：buffer 与 HEAD content-length 一致
    const realSize = 2048;
    const buffer = new TextEncoder().encode('x'.repeat(realSize)).buffer;
    globalThis.fetch = setupFetchStub({
      headContentLength: realSize,
      getBuffer: buffer,
    });

    const validator = new ResourceValidatorImpl();
    const result = await validator.validate('data', '/d/p.json');

    // calculateHash 会 fetch 全量 body 并把真实 byteLength 写入 sizeCache，
    // getSize 返回该缓存值（等于 buffer.byteLength，非随机）
    expect(result.size).toBe(realSize);
    // 不应是旧的随机值范围 [100, 1MB+100]
    expect(result.size).not.toBeGreaterThan(1_000_000);
    expect(result.size).not.toBeLessThan(1);
  });

  it('validateAll should aggregate results across multiple resources', async () => {
    const buffer = new TextEncoder().encode('data').buffer;
    globalThis.fetch = setupFetchStub({ getBuffer: buffer });

    const validator = new ResourceValidatorImpl();
    const report = await validator.validateAll([
      { type: 'texture' as ResourceType, path: '/a.png', id: 'a' },
      { type: 'mesh' as ResourceType, path: '/b.glb', id: 'b' },
    ]);

    expect(report.totalResources).toBe(2);
    expect(report.validCount).toBe(2);
    expect(report.results.length).toBe(2);
    expect(report.results[0]?.resourceId).toBe('a');
  });

  it('createResourceValidator() factory should produce working instance', async () => {
    const buffer = new TextEncoder().encode('factory').buffer;
    globalThis.fetch = setupFetchStub({ getBuffer: buffer });
    const validator = createResourceValidator();
    const result = await validator.validate('texture', '/f.png');
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('OpsManagerImpl.getStats (E-24: real PerformanceMonitor data)', () => {
  it('should reflect real metrics from injected metricsProvider (no Math.random)', () => {
    const provider: OpsMetricsProvider = {
      getFPS: () => 60,
      getFrameTime: () => 16.67,
      getMemoryUsed: () => 100 * 1024 * 1024,
      getGPUTime: () => 5.5,
    };
    const ops = new OpsManagerImpl(provider);
    const stats = ops.getStats();

    expect(stats.avgFPS).toBe(60);
    expect(stats.avgFrameTime).toBeCloseTo(16.67, 2);
    expect(stats.memoryUsage).toBe(100); // 100MB
    expect(stats.gpuMemoryUsage).toBe(256); // GPU 活跃
    // 初始 error/warning 计数应为 0（非随机）
    expect(stats.errorCount).toBe(0);
    expect(stats.warningCount).toBe(0);
    expect(stats.activeUsers).toBe(1);
    expect(stats.peakUsers).toBe(1);
  });

  it('should default to zeros when no metricsProvider injected', () => {
    const ops = new OpsManagerImpl(null);
    const stats = ops.getStats();
    expect(stats.avgFPS).toBe(0);
    expect(stats.avgFrameTime).toBe(0);
    expect(stats.memoryUsage).toBe(0);
    expect(stats.gpuMemoryUsage).toBe(0);
  });

  it('should track real errorCount via runMaintenance failure', async () => {
    const provider: OpsMetricsProvider = {
      getFPS: () => 30,
      getFrameTime: () => 33.3,
      getMemoryUsed: () => 0,
      getGPUTime: () => 0,
    };
    const ops = new OpsManagerImpl(provider);
    // daily-cleanup 任务的 run 会 resolve，不抛错；我们构造一个会失败的任务 ID 触发 catch 分支
    await expect(ops.runMaintenance('non-existent')).rejects.toThrow('Task not found');
    // runMaintenance 在找不到任务时直接抛出，不走 log；errorCount 仍为 0
    expect(ops.getStats().errorCount).toBe(0);
  });

  it('createOpsManager(metricsProvider) should wire provider through', () => {
    const provider: OpsMetricsProvider = {
      getFPS: () => 45,
      getFrameTime: () => 22.2,
      getMemoryUsed: () => 50 * 1024 * 1024,
      getGPUTime: () => 0,
    };
    const ops = createOpsManager(provider);
    const stats = ops.getStats();
    expect(stats.avgFPS).toBe(45);
    expect(stats.memoryUsage).toBe(50);
    // gpuTime=0 → gpuMemoryUsage=0
    expect(stats.gpuMemoryUsage).toBe(0);
  });

  it('setMetricsProvider should swap data source at runtime', () => {
    const ops = new OpsManagerImpl(null);
    expect(ops.getStats().avgFPS).toBe(0);
    ops.setMetricsProvider({
      getFPS: () => 120,
      getFrameTime: () => 8.33,
      getMemoryUsed: () => 0,
      getGPUTime: () => 0,
    });
    expect(ops.getStats().avgFPS).toBe(120);
  });

  it('uptime should be a non-negative integer based on real start time', () => {
    const ops = new OpsManagerImpl(null);
    const stats = ops.getStats();
    expect(stats.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(stats.uptime)).toBe(true);
  });
});
