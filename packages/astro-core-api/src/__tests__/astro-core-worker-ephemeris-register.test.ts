/**
 * ephemeris.register RPC 测试。
 *
 * 验证：
 * - 成功路径：WASM registerEphemeris 被调用，ephemerisRegistry 更新覆盖范围，
 *   ephemeris.supports/getCoverage 立即可查到注册的天体；
 * - WASM 未初始化时返回 INTERNAL；
 * - body_json 不是合法 JSON 时返回 INVALID_ARGUMENT；
 * - body_json 缺失 body_id 字段时返回 INVALID_ARGUMENT；
 * - WASM 抛出业务错误（{ code: 'UNSUPPORTED', message_zh }）时正确映射到协议错误码，
 *   不再因 `(e as Error).message` 为 undefined 而抛二级 TypeError。
 *
 * 同时回归验证 state.evaluate 的非 Error throwable 处理：
 * - WASM 抛出 { code, message_zh } 普通对象时，返回正确的错误码而非 INTERNAL。
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

/** 构造 mock WASM 实例。 */
function makeMockWasm(opts?: {
  registerEphemerisImpl?: (bodyJson: string) => void;
  evaluateStateImpl?: (bodyId: bigint, utcMjd: number) => unknown;
}): AstroCoreWasmInstance {
  return {
    free: vi.fn(),
    registerEphemeris: vi.fn(opts?.registerEphemerisImpl ?? (() => undefined)),
    evaluateState: vi.fn(opts?.evaluateStateImpl ?? (() => ({ position: { x: 0, y: 0, z: 0 } }))),
    evaluateSnapshot: vi.fn(),
    sampleOrbit: vi.fn(),
    timeRangeMin: vi.fn(() => 15020),
    timeRangeMax: vi.fn(() => 88128.999988),
  } as unknown as AstroCoreWasmInstance;
}

/** 构造合法 BodyEphemeris JSON 字符串。 */
function makeBodyJson(bodyId: number, tStart = 15020, tEnd = 88069): string {
  return JSON.stringify({
    body_id: bodyId,
    frame: 'HeliocentricInertial',
    precision: 'P2',
    segments: [
      {
        t_start: tStart,
        t_end: tEnd,
        coef_x: [0.0, 0.0],
        coef_y: [0.0, 0.0],
        coef_z: [0.0, 0.0],
      },
    ],
  });
}

describe('ephemeris.register RPC', () => {
  beforeEach(() => {
    __resetWorkerStateForTests();
  });

  it('成功注册：调用 WASM registerEphemeris 并更新 ephemerisRegistry', () => {
    const wasm = makeMockWasm();
    const bodyJson = makeBodyJson(399, 51544, 51900);
    const resp = processRequest(
      makeReq({ method: 'ephemeris.register', body_json: bodyJson }),
      { wasm },
    );
    expect(resp.ok).toBe(true);
    expect(wasm.registerEphemeris).toHaveBeenCalledTimes(1);
    expect(wasm.registerEphemeris).toHaveBeenCalledWith(bodyJson);
    // ephemerisRegistry 已更新：supports/getCoverage 立即可查
    const supportsResp = processRequest(
      makeReq({ method: 'ephemeris.supports', body_id: 399, time_range: null }),
    );
    expect(supportsResp.ok).toBe(true);
    if (supportsResp.ok) {
      expect(supportsResp.result).toBe(true);
    }
    const coverageResp = processRequest(
      makeReq({ method: 'ephemeris.getCoverage', body_id: 399 }),
    );
    expect(coverageResp.ok).toBe(true);
    if (coverageResp.ok) {
      expect(coverageResp.result).toEqual([51544, 51900]);
    }
  });

  it('WASM 未初始化时返回 INTERNAL', () => {
    const resp = processRequest(
      makeReq({ method: 'ephemeris.register', body_json: makeBodyJson(399) }),
      { wasm: null },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INTERNAL');
      expect(resp.error.message_zh).toContain('WASM');
    }
  });

  it('body_json 非合法 JSON 时返回 INVALID_ARGUMENT', () => {
    const wasm = makeMockWasm();
    const resp = processRequest(
      makeReq({ method: 'ephemeris.register', body_json: '{not valid json' }),
      { wasm },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INVALID_ARGUMENT');
      expect(resp.error.message_zh).toContain('解析失败');
    }
    expect(wasm.registerEphemeris).not.toHaveBeenCalled();
  });

  it('body_json 缺失 body_id 时返回 INVALID_ARGUMENT', () => {
    const wasm = makeMockWasm();
    const badJson = JSON.stringify({ frame: 'HeliocentricInertial', precision: 'P2', segments: [] });
    const resp = processRequest(
      makeReq({ method: 'ephemeris.register', body_json: badJson }),
      { wasm },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INVALID_ARGUMENT');
      expect(resp.error.message_zh).toContain('body_id');
    }
    expect(wasm.registerEphemeris).not.toHaveBeenCalled();
  });

  it('WASM 抛出 { code: "UNSUPPORTED" } 普通对象时正确映射（回归 TypeError bug）', () => {
    // 关键回归：WASM map_astro_error 抛出的是普通对象 { code, message_zh }，不是 Error。
    // 旧代码 `(e as Error).message` 得到 undefined，`msg.includes(...)` 抛二级 TypeError。
    const wasm = makeMockWasm({
      registerEphemerisImpl: () => {
        // 模拟 Rust map_astro_error 的产出
        throw { code: 'UNSUPPORTED', message_zh: '天体 999 无可用星历' };
      },
    });
    const resp = processRequest(
      makeReq({ method: 'ephemeris.register', body_json: makeBodyJson(999) }),
      { wasm },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('UNSUPPORTED');
      expect(resp.error.message_zh).toContain('天体 999');
    }
  });

  it('WASM 抛出 Error 实例时仍正常工作', () => {
    const wasm = makeMockWasm({
      registerEphemerisImpl: () => {
        throw new Error('serde 反序列化失败: missing field');
      },
    });
    const resp = processRequest(
      makeReq({ method: 'ephemeris.register', body_json: makeBodyJson(399) }),
      { wasm },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INTERNAL');
      expect(resp.error.message_zh).toContain('serde');
    }
  });
});

describe('state.evaluate 非 Error throwable 回归', () => {
  beforeEach(() => {
    __resetWorkerStateForTests();
  });

  it('WASM 抛出 { code: "UNSUPPORTED", message_zh } 时返回 UNSUPPORTED（不再 INTERNAL）', () => {
    // 关键回归：此前 catch 块写 `(e as Error).message`，
    // 对普通对象得到 undefined，`undefined.includes(...)` 抛 TypeError，
    // 被 handleRequest 外层 catch 捕获后降级为 INTERNAL。
    // 修复后应正确识别 code 并返回 UNSUPPORTED。
    const wasm = makeMockWasm({
      evaluateStateImpl: () => {
        throw { code: 'UNSUPPORTED', message_zh: '天体 10 无可用星历' };
      },
    });
    const resp = processRequest(
      makeReq({ method: 'state.evaluate', body_id: 10, tdb: 51544 }),
      { wasm },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('UNSUPPORTED');
      expect(resp.error.message_zh).toContain('天体 10');
    }
  });

  it('WASM 抛出 { code: "OUT_OF_RANGE", message_zh } 时返回 OUT_OF_RANGE', () => {
    const wasm = makeMockWasm({
      evaluateStateImpl: () => {
        throw { code: 'OUT_OF_RANGE', message_zh: '时间超出范围' };
      },
    });
    const resp = processRequest(
      makeReq({ method: 'state.evaluate', body_id: 399, tdb: 999999 }),
      { wasm },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('OUT_OF_RANGE');
    }
  });

  it('WASM 抛出 Error 实例时仍正常工作', () => {
    const wasm = makeMockWasm({
      evaluateStateImpl: () => {
        throw new Error('意外错误');
      },
    });
    const resp = processRequest(
      makeReq({ method: 'state.evaluate', body_id: 399, tdb: 51544 }),
      { wasm },
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      // Error 实例无 code，走文本兜底判断，message 不含 OUT_OF_RANGE/范围 → UNSUPPORTED
      expect(resp.error.code).toBe('UNSUPPORTED');
      expect(resp.error.message_zh).toContain('意外错误');
    }
  });
});
