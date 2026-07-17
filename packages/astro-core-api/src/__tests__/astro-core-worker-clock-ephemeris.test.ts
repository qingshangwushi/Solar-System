/**
 * 时钟状态机与星历查询测试（E-32）。
 *
 * 验证：
 * - clock.getUtc/setUtc/setRate/pause/resume/step 全部功能正常；
 * - ephemeris.supports 查询已注册 body_id 集合，并按 time_range 验证；
 * - ephemeris.getCoverage 返回真实覆盖范围（未注册返回 null）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  processRequest,
  snapshotClockState,
  registerEphemerisEntry,
  __resetWorkerStateForTests,
} from '../astro-core-worker.js';
import type { WorkerRequest, WorkerRequestPayload } from '../protocol.js';
import type { JulianDate } from '@solar-system/schemas';

/** 构造 RPC 请求信封。 */
function makeReq(payload: WorkerRequestPayload): WorkerRequest {
  return { request_id: `r-${Math.random().toString(36).slice(2)}`, payload };
}

describe('clock 状态机（E-32）', () => {
  beforeEach(() => {
    __resetWorkerStateForTests();
  });

  it('clock.getUtc 初始返回 J2000 epoch (51544.0)', () => {
    const resp = processRequest(makeReq({ method: 'clock.getUtc' }));
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.result).toBe(51544.0);
    }
    // 同时验证内部状态
    expect(snapshotClockState().utc).toBe(51544.0);
  });

  it('clock.setUtc 设置 utc 为给定 JulianDate.mjd', () => {
    const newDate: JulianDate = { mjd: 60000.5, scale: 'Utc', uncertainty: { predicted: false, predicted_delta_t: false } };
    const resp = processRequest(makeReq({ method: 'clock.setUtc', value: newDate }));
    expect(resp.ok).toBe(true);
    expect(snapshotClockState().utc).toBe(60000.5);
  });

  it('clock.setRate 设置时间倍率', () => {
    const resp = processRequest(makeReq({ method: 'clock.setRate', multiplier: 10.0 }));
    expect(resp.ok).toBe(true);
    expect(snapshotClockState().rate).toBe(10.0);
  });

  it('clock.pause 设置 paused=true', () => {
    expect(snapshotClockState().paused).toBe(false);
    const resp = processRequest(makeReq({ method: 'clock.pause' }));
    expect(resp.ok).toBe(true);
    expect(snapshotClockState().paused).toBe(true);
  });

  it('clock.resume 设置 paused=false', () => {
    processRequest(makeReq({ method: 'clock.pause' }));
    expect(snapshotClockState().paused).toBe(true);
    const resp = processRequest(makeReq({ method: 'clock.resume' }));
    expect(resp.ok).toBe(true);
    expect(snapshotClockState().paused).toBe(false);
  });

  it('clock.step 按 duration * rate 推进 utc', () => {
    processRequest(makeReq({ method: 'clock.setRate', multiplier: 5.0 }));
    const before = snapshotClockState().utc;
    const resp = processRequest(makeReq({ method: 'clock.step', duration: 2.0 }));
    expect(resp.ok).toBe(true);
    expect(snapshotClockState().utc).toBeCloseTo(before + 2.0 * 5.0, 10);
  });

  it('clock.step 在 rate=0 时不推进', () => {
    processRequest(makeReq({ method: 'clock.setRate', multiplier: 0.0 }));
    const before = snapshotClockState().utc;
    processRequest(makeReq({ method: 'clock.step', duration: 10.0 }));
    expect(snapshotClockState().utc).toBe(before);
  });

  it('clock.getTdb 在无独立转换器时返回 UTC 近似', () => {
    processRequest(makeReq({ method: 'clock.setUtc', value: { mjd: 58000, scale: 'Utc', uncertainty: { predicted: false, predicted_delta_t: false } } }));
    const resp = processRequest(makeReq({ method: 'clock.getTdb' }));
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.result).toBe(58000);
    }
  });
});

describe('ephemeris 查询（E-32）', () => {
  beforeEach(() => {
    __resetWorkerStateForTests();
  });

  it('ephemeris.supports 未注册天体返回 false', () => {
    const resp = processRequest(
      makeReq({ method: 'ephemeris.supports', body_id: 999, time_range: null }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.result).toBe(false);
    }
  });

  it('ephemeris.supports 已注册天体（无 time_range）返回 true', () => {
    registerEphemerisEntry(399, [51544, 51900]);
    const resp = processRequest(
      makeReq({ method: 'ephemeris.supports', body_id: 399, time_range: null }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.result).toBe(true);
    }
  });

  it('ephemeris.supports 带 time_range 在覆盖范围内返回 true', () => {
    registerEphemerisEntry(399, [51544, 51900]);
    const resp = processRequest(
      makeReq({ method: 'ephemeris.supports', body_id: 399, time_range: [51600, 51800] }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.result).toBe(true);
    }
  });

  it('ephemeris.supports 带 time_range 超出覆盖返回 false', () => {
    registerEphemerisEntry(399, [51544, 51900]);
    const resp = processRequest(
      makeReq({ method: 'ephemeris.supports', body_id: 399, time_range: [51500, 52000] }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.result).toBe(false);
    }
  });

  it('ephemeris.getCoverage 已注册返回 [start, end]', () => {
    registerEphemerisEntry(499, [50000, 60000]);
    const resp = processRequest(
      makeReq({ method: 'ephemeris.getCoverage', body_id: 499 }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      const result = resp.result as [number, number] | null;
      expect(result).not.toBeNull();
      expect(result?.[0]).toBe(50000);
      expect(result?.[1]).toBe(60000);
    }
  });

  it('ephemeris.getCoverage 未注册返回 null', () => {
    const resp = processRequest(
      makeReq({ method: 'ephemeris.getCoverage', body_id: 123 }),
    );
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.result).toBeNull();
    }
  });

  it('ephemeris.supports 多个已注册天体可独立查询', () => {
    registerEphemerisEntry(199, [40000, 70000]);
    registerEphemerisEntry(299, [45000, 65000]);
    const r1 = processRequest(
      makeReq({ method: 'ephemeris.supports', body_id: 199, time_range: null }),
    );
    const r2 = processRequest(
      makeReq({ method: 'ephemeris.supports', body_id: 299, time_range: null }),
    );
    const r3 = processRequest(
      makeReq({ method: 'ephemeris.supports', body_id: 399, time_range: null }),
    );
    expect(r1.ok && r1.result).toBe(true);
    expect(r2.ok && r2.result).toBe(true);
    expect(r3.ok && r3.result).toBe(false);
  });
});
