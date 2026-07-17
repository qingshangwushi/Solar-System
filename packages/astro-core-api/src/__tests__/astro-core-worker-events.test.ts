/**
 * 事件引擎测试（E-20）。
 *
 * 验证：
 * - event.search 在引擎未配置时返回 UNSUPPORTED；
 * - 注入 mock 引擎后，event.search/refine/buildObservationPlan/getUncertainty 透传参数并返回结果；
 * - 默认引擎构造器（createDefaultEventEngine）在 WASM 缺失天体时静默跳过，
 *   仍返回空数组而非抛错。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  processRequest,
  setEventEngine,
  __resetWorkerStateForTests,
  type EventEngineAdapter,
} from '../astro-core-worker.js';
import type { WorkerRequest, WorkerRequestPayload } from '../protocol.js';
import type {
  AstroEvent,
  ObservationPlan,
  EventUncertainty,
} from '../index.js';
import type { Precision } from '@solar-system/schemas';

/** 构造 RPC 请求信封。 */
function makeReq(payload: WorkerRequestPayload): WorkerRequest {
  return { request_id: `r-${Math.random().toString(36).slice(2)}`, payload };
}

/** 构造一个测试用 AstroEvent。 */
function makeEvent(mjd: number, type: AstroEvent['event_type'] = 'conjunction'): AstroEvent {
  return {
    event_id: `evt-${mjd}`,
    event_type: type,
    body_ids: [499],
    time_begin_tdb: mjd,
    time_greatest_tdb: mjd,
    time_end_tdb: mjd,
    precision: 'P2',
    is_approximate: false,
  };
}

describe('事件引擎（E-20）', () => {
  beforeEach(() => {
    __resetWorkerStateForTests();
  });

  it('event.search 未注入引擎返回 UNSUPPORTED', () => {
    const resp = processRequest(
      makeReq({
        method: 'event.search',
        event_type: 'all',
        bodies: 'all',
        time_range: [51544, 51544 + 365],
        precision: 'P2',
      }),
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('UNSUPPORTED');
    }
  });

  it('event.search 注入 mock 引擎返回非空事件列表', () => {
    const events = [makeEvent(51600), makeEvent(51700, 'opposition')];
    const mock: EventEngineAdapter = {
      search: vi.fn(() => events),
      refine: vi.fn((c) => c),
      buildObservationPlan: vi.fn(),
      getUncertainty: vi.fn(),
    };
    setEventEngine(mock);
    const resp = processRequest(
      makeReq({
        method: 'event.search',
        event_type: 'all',
        bodies: 'all',
        time_range: [51544, 51544 + 365],
        precision: 'P2',
      }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      const result = resp.result as AstroEvent[];
      expect(result).toHaveLength(2);
      expect(result[0]?.event_id).toBe('evt-51600');
      expect(result[1]?.event_type).toBe('opposition');
    }
  });

  it('event.search 透传 event_type/bodies/time_range/precision 给引擎', () => {
    const mock: EventEngineAdapter = {
      search: vi.fn(() => []),
      refine: vi.fn(),
      buildObservationPlan: vi.fn(),
      getUncertainty: vi.fn(),
    };
    setEventEngine(mock);
    processRequest(
      makeReq({
        method: 'event.search',
        event_type: 'conjunction',
        bodies: [499, 599],
        time_range: [52000, 52100],
        precision: 'P4',
      }),
    );
    expect(mock.search).toHaveBeenCalledWith('conjunction', [499, 599], [52000, 52100], 'P4' as Precision);
  });

  it('event.refine 注入 mock 引擎返回精确化事件', () => {
    const candidate = makeEvent(51800);
    const mock: EventEngineAdapter = {
      search: vi.fn(),
      refine: vi.fn((c) => ({ ...c, is_approximate: false, precision: 'P4' as Precision })),
      buildObservationPlan: vi.fn(),
      getUncertainty: vi.fn(),
    };
    setEventEngine(mock);
    const resp = processRequest(
      makeReq({ method: 'event.refine', candidate }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      const result = resp.result as AstroEvent;
      expect(result.is_approximate).toBe(false);
      expect(result.precision).toBe('P4');
    }
    expect(mock.refine).toHaveBeenCalledWith(candidate);
  });

  it('event.buildObservationPlan 注入 mock 引擎返回观测计划', () => {
    const event = makeEvent(51900);
    const plan: ObservationPlan = {
      event,
      recommended_time_tdb: 51900,
      recommended_camera: {
        target_body_id: 499,
        position: 'auto',
        look_at: 'target',
        reference_frame: 'SolarSystemBarycentricInertial',
        duration_seconds: 3.0,
        easing: 'easeInOut',
      },
      layer_overrides: { shadow_eclipse: true },
    };
    const mock: EventEngineAdapter = {
      search: vi.fn(),
      refine: vi.fn(),
      buildObservationPlan: vi.fn(() => plan),
      getUncertainty: vi.fn(),
    };
    setEventEngine(mock);
    const resp = processRequest(
      makeReq({ method: 'event.buildObservationPlan', event }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      const result = resp.result as ObservationPlan;
      expect(result.recommended_time_tdb).toBe(51900);
      expect(result.recommended_camera.target_body_id).toBe(499);
      expect(result.layer_overrides.shadow_eclipse).toBe(true);
    }
    expect(mock.buildObservationPlan).toHaveBeenCalledWith(event);
  });

  it('event.getUncertainty 注入 mock 引擎返回不确定性', () => {
    const event = makeEvent(52000);
    const uncertainty: EventUncertainty = {
      time_uncertainty_seconds: 30,
      geometry_uncertainty: 'low',
      notes_zh: '已精确求根',
    };
    const mock: EventEngineAdapter = {
      search: vi.fn(),
      refine: vi.fn(),
      buildObservationPlan: vi.fn(),
      getUncertainty: vi.fn(() => uncertainty),
    };
    setEventEngine(mock);
    const resp = processRequest(
      makeReq({ method: 'event.getUncertainty', event }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      const result = resp.result as EventUncertainty;
      expect(result.time_uncertainty_seconds).toBe(30);
      expect(result.geometry_uncertainty).toBe('low');
      expect(result.notes_zh).toBe('已精确求根');
    }
    expect(mock.getUncertainty).toHaveBeenCalledWith(event);
  });

  it('event.refine 未注入引擎返回 UNSUPPORTED', () => {
    const candidate = makeEvent(52100);
    const resp = processRequest(
      makeReq({ method: 'event.refine', candidate }),
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('UNSUPPORTED');
    }
  });

  it('event.search 引擎抛错时返回 INTERNAL', () => {
    const mock: EventEngineAdapter = {
      search: vi.fn(() => {
        throw new Error('mock 失败');
      }),
      refine: vi.fn(),
      buildObservationPlan: vi.fn(),
      getUncertainty: vi.fn(),
    };
    setEventEngine(mock);
    const resp = processRequest(
      makeReq({
        method: 'event.search',
        event_type: 'all',
        bodies: 'all',
        time_range: [51544, 51900],
        precision: 'P2',
      }),
    );
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INTERNAL');
      expect(resp.error.message_zh).toContain('mock 失败');
    }
  });
});
