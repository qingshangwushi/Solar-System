/**
 * WASM 加载与 Worker 封装测试（任务 P0-9 验证）。
 *
 * 验证：
 * 1. WASM 在 Node 中可加载并响应 evaluateState；
 * 2. 注册星历后可求值天体状态；
 * 3. 轨道采样返回 Float64Array；
 * 4. AstroCoreClient 崩溃重初始化逻辑。
 *
 * 注意：若 wasm-pack 产物缺失（CI 沙箱无 wasm32 工具链），
 * 直接 WASM 子集会整体跳过；客户端逻辑仍独立运行。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AstroCoreWasmInstance } from '@solar-system/astro-core-wasm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, '..', '..', '..', 'astro-core-wasm', 'pkg');
const wasmBinaryPath = join(pkgDir, 'astro_core_bg.wasm');

/** WASM 产物是否就绪（CI 沙箱可能缺 wasm32 工具链，跳过对应子集）。 */
const wasmAvailable = existsSync(wasmBinaryPath);

/** 直接通过 initSync 加载 WASM（Node 环境，绕过 fetch/import.meta.url）。 */
async function loadWasmDirect(): Promise<{
  AstroCoreWasm: new () => AstroCoreWasmInstance;
}> {
  const wasmBytes = readFileSync(wasmBinaryPath);
  // 动态导入生成的 JS 模块
  const mod = await import(/* @vite-ignore */ join(pkgDir, 'astro_core.js'));
  // initSync 接受 BufferSource（wasm 字节）
  mod.initSync(wasmBytes);
  return mod as { AstroCoreWasm: new () => AstroCoreWasmInstance };
}

/** 线性星历 JSON（与 Rust 测试 linear_eph 一致）。 */
function linearEphemerisJson(bodyId: number, t0: number, t1: number): string {
  const mid = 0.5 * (t0 + t1);
  const half = 0.5 * (t1 - t0);
  return JSON.stringify({
    body_id: bodyId,
    frame: 'HeliocentricInertial',
    precision: 'P4',
    segments: [
      {
        t_start: t0,
        t_end: t1,
        coef_x: [2.0 * mid + 1.0, 2.0 * half],
        coef_y: [0.0, 0.0],
        coef_z: [0.0, 0.0],
      },
    ],
  });
}

describe.runIf(wasmAvailable)('astro-core WASM 直接加载', () => {
  it('initSync 加载 WASM 并构造 AstroCoreWasm', async () => {
    const mod = await loadWasmDirect();
    const wasm = new mod.AstroCoreWasm();
    expect(wasm).toBeDefined();
    expect(typeof wasm.evaluateState).toBe('function');
    expect(typeof wasm.sampleOrbit).toBe('function');
    wasm.free();
  });

  it('evaluateState 对未注册天体抛出错误（安全失败，不输出伪高精度）', async () => {
    const mod = await loadWasmDirect();
    const wasm = new mod.AstroCoreWasm();
    // 天体 999 未注册星历 → 应抛出 UNSUPPORTED
    expect(() => wasm.evaluateState(999n, 51560.0)).toThrow();
    wasm.free();
  });

  it('注册星历后 evaluateState 返回天体状态', async () => {
    const mod = await loadWasmDirect();
    const wasm = new mod.AstroCoreWasm();
    // 注册 body 399 在 [51544, 51576] 的线性星历
    wasm.registerEphemeris(linearEphemerisJson(399, 51544.0, 51544.0 + 32.0));
    const state = wasm.evaluateState(399n, 51544.0 + 16.0) as {
      body_id: number;
      position: { x: number; y: number; z: number };
      precision: string;
      flags: { is_nan_position: boolean };
    };
    expect(state.body_id).toBe(399);
    expect(state.position).toBeDefined();
    expect(state.flags.is_nan_position).toBe(false);
    // f(tdb) = 2*tdb + 1，tdb ≈ utc + 64.184s/86400 ≈ utc + 0.000743
    const tdb = 51544.0 + 16.0 + 64.184 / 86400;
    expect(state.position.x).toBeCloseTo(2.0 * tdb + 1.0, 4);
    wasm.free();
  });

  it('sampleOrbit 返回平铺 Float64Array', async () => {
    const mod = await loadWasmDirect();
    const wasm = new mod.AstroCoreWasm();
    wasm.registerEphemeris(linearEphemerisJson(399, 51544.0, 51544.0 + 32.0));
    const samples = wasm.sampleOrbit(399n, 51544.0, 51544.0 + 10.0, 2.0);
    expect(samples).toBeInstanceOf(Float64Array);
    // 每个采样点 4 个 float64（t, x, y, z），10 天 / 2 天步长 = 6 个点
    expect(samples.length).toBeGreaterThanOrEqual(5 * 4);
    expect(samples.length % 4).toBe(0);
    wasm.free();
  });

  it('timeRangeMin/Max 返回 1900-2100 范围', async () => {
    const mod = await loadWasmDirect();
    const wasm = new mod.AstroCoreWasm();
    const min = wasm.timeRangeMin();
    const max = wasm.timeRangeMax();
    // 1900-01-01 MJD ≈ 15020
    expect(min).toBeLessThan(15100);
    // 2100-12-31 MJD ≈ 88128
    expect(max).toBeGreaterThan(88000);
    wasm.free();
  });
});

describe('AstroCoreClient 崩溃重初始化', () => {
  /** 模拟 Worker。 */
  class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    listeners = new Map<string, Set<(e: MessageEvent) => void>>();
    terminated = false;
    received: unknown[] = [];

    constructor() {
      FakeWorker.instances.push(this);
    }

    addEventListener(type: string, handler: (e: MessageEvent) => void): void {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(handler);
    }

    postMessage(msg: unknown): void {
      if (this.terminated) return;
      this.received.push(msg);
      // 模拟 init 后回复 worker_ready
      if (typeof msg === 'object' && msg !== null && 'kind' in msg) {
        const ctrl = msg as { kind: string };
        if (ctrl.kind === 'init' || ctrl.kind === 'reinit') {
          setTimeout(() => {
            this.emit('message', { kind: 'worker_ready' });
          }, 10);
        }
      }
    }

    emit(type: string, data: unknown): void {
      const handlers = this.listeners.get(type);
      if (handlers) {
        for (const h of handlers) h({ data } as MessageEvent);
      }
    }

    terminate(): void {
      this.terminated = true;
    }
  }

  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('init 后客户端就绪，可订阅错误', async () => {
    const { AstroCoreClient } = await import('../astro-core-client.js');
    const client = new AstroCoreClient({
      wasmUrl: '/fake/wasm.js',
      autoReinit: false,
    });
    const errors: { code: string; message_zh: string }[] = [];
    client.subscribeError((e) => errors.push(e));
    await client.init();
    expect(client.isReady()).toBe(true);
    expect(errors).toHaveLength(0);
    client.dispose();
  });

  it('Worker 崩溃后自动重初始化', async () => {
    const { AstroCoreClient } = await import('../astro-core-client.js');
    const client = new AstroCoreClient({
      wasmUrl: '/fake/wasm.js',
      autoReinit: true,
    });
    await client.init();
    expect(client.isReady()).toBe(true);
    const firstWorker = FakeWorker.instances[0]!;

    // 模拟 Worker 崩溃
    firstWorker.emit('error', { message: '模拟崩溃' } as unknown as ErrorEvent);
    // 等待重初始化完成（首次退避 1000ms + init 延迟 10ms）
    await new Promise((r) => setTimeout(r, 1500));
    // 应创建了新 Worker
    expect(FakeWorker.instances.length).toBeGreaterThanOrEqual(2);
    const secondWorker = FakeWorker.instances[1]!;
    expect(secondWorker).not.toBe(firstWorker);
    expect(firstWorker.terminated).toBe(true);
    client.dispose();
  });

  it('dispose 后不再重初始化', async () => {
    const { AstroCoreClient } = await import('../astro-core-client.js');
    const client = new AstroCoreClient({
      wasmUrl: '/fake/wasm.js',
      autoReinit: true,
    });
    await client.init();
    client.dispose();
    const countBefore = FakeWorker.instances.length;
    // 即使触发错误也不应重初始化
    const w = FakeWorker.instances[0]!;
    w.emit('error', { message: '销毁后错误' } as unknown as ErrorEvent);
    await new Promise((r) => setTimeout(r, 200));
    expect(FakeWorker.instances.length).toBe(countBefore);
  });
});
