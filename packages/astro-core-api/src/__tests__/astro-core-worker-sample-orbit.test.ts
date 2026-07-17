/**
 * 轨道采样测试（E-33）。
 *
 * 验证：
 * - state.sampleOrbit 无 WASM 时返回 INTERNAL；
 * - WASM 抛错时返回 UNSUPPORTED；
 * - 优先使用 step_days（即使同时提供 samples）；
 * - 无 step_days 时按 samples 计算步长；
 * - 无 step_days/samples 时默认 100 步；
 * - 返回结果透传 WASM 的 Float64Array。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  processRequest,
  __resetWorkerStateForTests,
} from '../astro-core-worker.js';
import type { WorkerRequest, WorkerRequestPayload } from '../protocol.js';
import type { AstroCoreWasmInstance } from '@solar-system/astro-core-wasm';

/** 构造 RPC 请求信封。 */
function makeReq(payload: WorkerRequestPayload): WorkerRequest {
  return { request_id: `r-${Math.random().toString(36).slice(2)}`, payload };
}

/** 构造 mock WASM 实例（仅 sampleOrbit 真实记录调用）。 */
function makeMockWasm(sampleOrbitImpl?: (bodyId: bigint, t0: number, t1: number, step: number) => Float64Array): {
  wasm: AstroCoreWasmInstance;
  sampleOrbitSpy: ReturnType<typeof vi.fn>;
} {
  const sampleOrbitSpy = vi.fn(
    sampleOrbitImpl ??
      ((_bodyId: bigint, _t0: number, _t1: number, _step: number) =>
        new Float64Array([51544.0, 1.0, 0.0, 0.0, 51546.0, 1.5, 0.0, 0.0])),
  );
  const wasm = {
    free: vi.fn(),
    registerEphemeris: vi.fn(),
    evaluateState: vi.fn(),
    evaluateSnapshot: vi.fn(),
    sampleOrbit: sampleOrbitSpy,
    timeRangeMin: vi.fn(() => 15020),
    timeRangeMax: vi.fn(() => 88128.999988),
  } as unknown as AstroCoreWasmInstance;
  return { wasm, sampleOrbitSpy };
}

describe('轨道采样（E-33）', () => {
  beforeEach(() => {
    __resetWorkerStateForTests();
  });

  it('state.sampleOrbit 无 WASM 时返回 INTERNAL', () => {
    const resp = processRequest(
      makeReq({
        method: 'state.sampleOrbit',
        body_id: 399,
        tdb_start: 51544,
        tdb_end: 51574,
        samples: 10,
        reference_frame: 'SolarSystemBarycentricInertial',
      }),
      { wasm: null },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INTERNAL');
    }
  });

  it('state.sampleOrbit WASM 抛错时返回 UNSUPPORTED', () => {
    const { wasm, sampleOrbitSpy } = makeMockWasm(() => {
      throw new Error('天体 999 不在覆盖范围');
    });
    const resp = processRequest(
      makeReq({
        method: 'state.sampleOrbit',
        body_id: 999,
        tdb_start: 51544,
        tdb_end: 51574,
        step_days: 2.0,
        reference_frame: 'SolarSystemBarycentricInertial',
      }),
      { wasm },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('UNSUPPORTED');
      expect(resp.error.message_zh).toContain('不在覆盖范围');
    }
    expect(sampleOrbitSpy).toHaveBeenCalledOnce();
  });

  it('state.sampleOrbit 优先使用 step_days 透传给 WASM', () => {
    const { wasm, sampleOrbitSpy } = makeMockWasm();
    processRequest(
      makeReq({
        method: 'state.sampleOrbit',
        body_id: 399,
        tdb_start: 51544,
        tdb_end: 51574,
        samples: 10, // 即使提供 samples，也应被 step_days 覆盖
        step_days: 2.5,
        reference_frame: 'SolarSystemBarycentricInertial',
      }),
      { wasm },
    );
    expect(sampleOrbitSpy).toHaveBeenCalledOnce();
    const args = sampleOrbitSpy.mock.calls[0]!;
    expect(args[0]).toBe(399n);
    expect(args[1]).toBe(51544);
    expect(args[2]).toBe(51574);
    expect(args[3]).toBe(2.5); // step_days 优先
  });

  it('state.sampleOrbit 无 step_days 时按 samples 计算步长', () => {
    const { wasm, sampleOrbitSpy } = makeMockWasm();
    processRequest(
      makeReq({
        method: 'state.sampleOrbit',
        body_id: 399,
        tdb_start: 51544,
        tdb_end: 51574,
        samples: 5, // 30 天 / 5 = 6 天/步
        reference_frame: 'SolarSystemBarycentricInertial',
      }),
      { wasm },
    );
    expect(sampleOrbitSpy).toHaveBeenCalledOnce();
    const args = sampleOrbitSpy.mock.calls[0]!;
    expect(args[3]).toBeCloseTo(6.0, 10); // (51574-51544)/5 = 6
  });

  it('state.sampleOrbit 无 step_days/samples 时默认 100 步', () => {
    const { wasm, sampleOrbitSpy } = makeMockWasm();
    processRequest(
      makeReq({
        method: 'state.sampleOrbit',
        body_id: 399,
        tdb_start: 51544,
        tdb_end: 51574,
        // 既不传 step_days 也不传 samples
        reference_frame: 'SolarSystemBarycentricInertial',
      }),
      { wasm },
    );
    expect(sampleOrbitSpy).toHaveBeenCalledOnce();
    const args = sampleOrbitSpy.mock.calls[0]!;
    // 默认 100 步：(51574-51544)/100 = 0.3 天/步
    expect(args[3]).toBeCloseTo(0.3, 10);
  });

  it('state.sampleOrbit 返回 Float64Array', () => {
    const expected = new Float64Array([1, 2, 3, 4]);
    const { wasm } = makeMockWasm(() => expected);
    const resp = processRequest(
      makeReq({
        method: 'state.sampleOrbit',
        body_id: 399,
        tdb_start: 51544,
        tdb_end: 51574,
        step_days: 1.0,
        reference_frame: 'SolarSystemBarycentricInertial',
      }),
      { wasm },
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.result).toBeInstanceOf(Float64Array);
      expect(resp.result as Float64Array).toBe(expected);
    }
  });

  it('state.sampleOrbit body_id 透传为 bigint', () => {
    const { wasm, sampleOrbitSpy } = makeMockWasm();
    processRequest(
      makeReq({
        method: 'state.sampleOrbit',
        body_id: 499,
        tdb_start: 51544,
        tdb_end: 51574,
        step_days: 1.0,
        reference_frame: 'SolarSystemBarycentricInertial',
      }),
      { wasm },
    );
    expect(sampleOrbitSpy).toHaveBeenCalledOnce();
    const args = sampleOrbitSpy.mock.calls[0]!;
    expect(args[0]).toBe(499n);
    expect(typeof args[0]).toBe('bigint');
  });
});
