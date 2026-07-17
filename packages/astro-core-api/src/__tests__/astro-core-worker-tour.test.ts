/**
 * 巡航状态机测试（E-26）。
 *
 * 验证：
 * - tour.load 校验 tour_id 并初始化状态（不再返回 TOUR_RESOURCES_MISSING）；
 * - tour.play/pause/seek/exit/getCurrentNode 操作状态机；
 * - 未加载状态时调用控制方法返回 INVALID_ARGUMENT；
 * - tour.validateResources 总是返回 ok:true（资源假定就绪）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  processRequest,
  snapshotTourState,
  __resetWorkerStateForTests,
} from '../astro-core-worker.js';
import type { WorkerRequest, WorkerRequestPayload } from '../protocol.js';
import type { TourPlaybackState } from '../index.js';

/** 构造 RPC 请求信封。 */
function makeReq(payload: WorkerRequestPayload): WorkerRequest {
  return { request_id: `r-${Math.random().toString(36).slice(2)}`, payload };
}

describe('tour 状态机（E-26）', () => {
  beforeEach(() => {
    __resetWorkerStateForTests();
  });

  it('tour.load 空 tour_id 返回 INVALID_ARGUMENT', () => {
    const resp = processRequest(makeReq({ method: 'tour.load', tour_id: '' }));
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INVALID_ARGUMENT');
    }
    expect(snapshotTourState()).toBeNull();
  });

  it('tour.load 合法 tour_id 初始化状态（playing=false, progress=0, currentNodeIndex=0）', () => {
    const resp = processRequest(makeReq({ method: 'tour.load', tour_id: 'solar-tour-1' }));
    expect(resp.ok).toBe(true);
    const st = snapshotTourState();
    expect(st).not.toBeNull();
    expect(st?.tourId).toBe('solar-tour-1');
    expect(st?.playing).toBe(false);
    expect(st?.progress).toBe(0);
    expect(st?.currentNodeIndex).toBe(0);
  });

  it('tour.validateResources 返回 ok:true, missing_packages:[]（不再报 TOUR_RESOURCES_MISSING）', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-1' }));
    const resp = processRequest(makeReq({ method: 'tour.validateResources' }));
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      const result = resp.result as { ok: boolean; missing_packages: string[] };
      expect(result.ok).toBe(true);
      expect(result.missing_packages).toEqual([]);
    }
  });

  it('tour.play 未加载时返回 INVALID_ARGUMENT', () => {
    const resp = processRequest(makeReq({ method: 'tour.play' }));
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INVALID_ARGUMENT');
    }
  });

  it('tour.play 已加载时设置 playing=true', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-2' }));
    const resp = processRequest(makeReq({ method: 'tour.play' }));
    expect(resp.ok).toBe(true);
    expect(snapshotTourState()?.playing).toBe(true);
  });

  it('tour.pause 设置 playing=false', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-3' }));
    processRequest(makeReq({ method: 'tour.play' }));
    expect(snapshotTourState()?.playing).toBe(true);
    const resp = processRequest(makeReq({ method: 'tour.pause' }));
    expect(resp.ok).toBe(true);
    expect(snapshotTourState()?.playing).toBe(false);
  });

  it('tour.seek 进度钳制到 [0,1]（负值→0）', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-4' }));
    const resp = processRequest(makeReq({ method: 'tour.seek', progress: -0.5 }));
    expect(resp.ok).toBe(true);
    expect(snapshotTourState()?.progress).toBe(0);
  });

  it('tour.seek 进度钳制到 [0,1]（>1→1）', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-5' }));
    const resp = processRequest(makeReq({ method: 'tour.seek', progress: 1.5 }));
    expect(resp.ok).toBe(true);
    expect(snapshotTourState()?.progress).toBe(1);
  });

  it('tour.seek 正常进度原样设置', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-6' }));
    const resp = processRequest(makeReq({ method: 'tour.seek', progress: 0.42 }));
    expect(resp.ok).toBe(true);
    expect(snapshotTourState()?.progress).toBeCloseTo(0.42, 10);
  });

  it('tour.seek 未加载时返回 INVALID_ARGUMENT', () => {
    const resp = processRequest(makeReq({ method: 'tour.seek', progress: 0.5 }));
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INVALID_ARGUMENT');
    }
  });

  it('tour.getCurrentNode 未加载时返回 INVALID_ARGUMENT', () => {
    const resp = processRequest(makeReq({ method: 'tour.getCurrentNode' }));
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INVALID_ARGUMENT');
    }
  });

  it('tour.getCurrentNode 返回 TourPlaybackState', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-7' }));
    processRequest(makeReq({ method: 'tour.play' }));
    processRequest(makeReq({ method: 'tour.seek', progress: 0.3 }));
    const resp = processRequest(makeReq({ method: 'tour.getCurrentNode' }));
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      const result = resp.result as TourPlaybackState;
      expect(result.tour_id).toBe('t-7');
      expect(result.is_playing).toBe(true);
      expect(result.progress).toBeCloseTo(0.3, 10);
      expect(result.current_node_index).toBe(0);
      expect(typeof result.current_node_id).toBe('string');
    }
  });

  it('tour.exit 清空状态', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-8' }));
    expect(snapshotTourState()).not.toBeNull();
    const resp = processRequest(makeReq({ method: 'tour.exit' }));
    expect(resp.ok).toBe(true);
    expect(snapshotTourState()).toBeNull();
  });

  it('tour.exit 后再 play 返回 INVALID_ARGUMENT', () => {
    processRequest(makeReq({ method: 'tour.load', tour_id: 't-9' }));
    processRequest(makeReq({ method: 'tour.exit' }));
    const resp = processRequest(makeReq({ method: 'tour.play' }));
    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('INVALID_ARGUMENT');
    }
  });
});
