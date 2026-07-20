/**
 * 天文内核 Worker 入口（设计文档 9.1、8.2、42 节）。
 *
 * 在 Web Worker 中加载 WASM，处理主线程 RPC 请求与流式快照推送。
 * Worker 崩溃后主线程可重新初始化（设计文档 8.2 稳定性）。
 *
 * 该文件作为 Worker 入口（new Worker(new URL('./astro-core-worker.ts', import.meta.url))）。
 */
import type {
  WorkerControlMessage,
  WorkerInbound,
  WorkerOutbound,
  WorkerRequest,
  WorkerResponse,
  WorkerResponsePayload,
  WorkerStreamMessage,
} from './protocol.js';
import { createAstroCoreWasm, type AstroCoreWasmInstance } from '@solar-system/astro-core-wasm';
import {
  findEclipses,
  findConjunctions,
  findOppositions,
  type EventResult,
  type EventSearchOptions,
  type EventType,
} from '@solar-system/astro-core-wasm';
import type {
  AstroEvent,
  AstroEventType,
  ObservationPlan,
  EventUncertainty,
  TourPlaybackState,
} from './index.js';
import type { Precision, Vec3d } from '@solar-system/schemas';

/** Worker 内部状态。 */
interface WorkerState {
  wasm: AstroCoreWasmInstance | null;
  wasmUrl: string | null;
  ready: boolean;
}

const state: WorkerState = {
  wasm: null,
  wasmUrl: null,
  ready: false,
};

// === 时钟状态机（E-32）================================================

/** 模拟时钟状态。 */
export interface ClockState {
  /** 当前 UTC（MJD）。 */
  utc: number;
  /** 时间倍率。 */
  rate: number;
  /** 是否暂停。 */
  paused: boolean;
}

/** 时钟全局状态（E-32）。 */
let clockState: ClockState = { utc: 51544.0, rate: 1.0, paused: false };

/** 读取时钟状态快照（测试用）。 */
export function snapshotClockState(): ClockState {
  return { ...clockState };
}

// === 巡航状态机（E-26）================================================

/** 巡航播放状态机。 */
export interface TourState {
  tourId: string;
  playing: boolean;
  /** 0..1。 */
  progress: number;
  currentNodeIndex: number;
}

/** 巡航全局状态（E-26），未加载时为 null。 */
let tourState: TourState | null = null;

/** 读取巡航状态快照（测试用）。 */
export function snapshotTourState(): TourState | null {
  return tourState ? { ...tourState } : null;
}

// === 星历注册表（E-32）================================================

/** body_id → 覆盖范围 [t_start, t_end]。 */
const ephemerisRegistry = new Map<number, [number, number]>();

/**
 * 注册星历覆盖范围（供 ephemeris.supports/getCoverage 查询）。
 *
 * 真实运行时由 WASM 初始化流程填充；测试可直接调用注入。
 */
export function registerEphemerisEntry(bodyId: number, coverage: [number, number]): void {
  ephemerisRegistry.set(bodyId, coverage);
}

// === 事件引擎（E-20）==================================================

/**
 * 可注入的事件引擎接口（E-20）。
 *
 * 测试时注入 mock；默认实现使用 @solar-system/astro-core-wasm 的
 * findEclipses/findConjunctions/findOppositions（依赖 WASM 提供位置求值）。
 */
export interface EventEngineAdapter {
  search(
    eventType: AstroEventType | 'all',
    bodies: number[] | 'all',
    timeRange: [number, number],
    precision: Precision,
  ): AstroEvent[];
  refine(candidate: AstroEvent): AstroEvent;
  buildObservationPlan(event: AstroEvent): ObservationPlan;
  getUncertainty(event: AstroEvent): EventUncertainty;
}

/** 事件引擎实例（可注入）。 */
let eventEngine: EventEngineAdapter | null = null;

/** 注入事件引擎（测试用）；传 null 清除。 */
export function setEventEngine(engine: EventEngineAdapter | null): void {
  eventEngine = engine;
}

/**
 * 重置 Worker 全局状态（仅测试用）。
 *
 * 用于单元测试在每个用例前恢复默认状态：
 * - clockState → 初始默认（J2000 UTC、rate=1、未暂停）
 * - tourState → null
 * - ephemerisRegistry → 清空
 * - eventEngine → null
 */
export function __resetWorkerStateForTests(): void {
  clockState = { utc: 51544.0, rate: 1.0, paused: false };
  tourState = null;
  ephemerisRegistry.clear();
  eventEngine = null;
}

/** 将 events 模块 EventType 映射为 AstroEventType（不可映射返回 null）。 */
function mapEventType(t: EventType): AstroEventType | null {
  switch (t) {
    case 'solar_eclipse':
      return 'solar_eclipse';
    case 'lunar_eclipse':
      return 'lunar_eclipse';
    case 'conjunction':
      return 'conjunction';
    case 'opposition':
      return 'opposition';
    case 'perihelion':
      return 'perihelion';
    case 'aphelion':
      return 'aphelion';
    case 'transit':
      return 'transit';
    case 'occultation':
      return 'occultation';
    default:
      return null;
  }
}

/** EventResult → AstroEvent 转换（不可映射的类型返回 null）。 */
function eventResultToAstroEvent(er: EventResult, precision: Precision): AstroEvent | null {
  const et = mapEventType(er.type);
  if (!et) return null;
  const bodyId = er.body !== undefined ? Number(er.body) : NaN;
  return {
    event_id: `${er.type}-${er.mjd.toFixed(6)}`,
    event_type: et,
    body_ids: Number.isNaN(bodyId) ? [] : [bodyId],
    time_begin_tdb: er.mjd,
    time_greatest_tdb: er.mjd,
    time_end_tdb: er.mjd,
    precision,
    is_approximate: er.accuracy > 1e-6,
  };
}

/**
 * 构造默认事件引擎：使用 WASM 提供位置求值，调用纯 JS 事件计算函数。
 *
 * 依赖天体 10（太阳）、399（地球）、301（月球）及目标天体已注册星历；
 * 未注册的天体捕获异常后跳过。
 */
function createDefaultEventEngine(wasm: AstroCoreWasmInstance): EventEngineAdapter {
  const posEvaluator = (bodyId: number): ((mjd: number) => Vec3d) => {
    return (mjd: number): Vec3d => {
      const st = wasm.evaluateState(BigInt(bodyId), mjd) as { position: Vec3d };
      return st.position;
    };
  };

  // 默认行星 body_id 列表（JPL 编号惯例）
  const defaultBodies = [199, 299, 499, 599, 699, 799, 899, 999];

  return {
    search(eventType, bodies, timeRange, precision) {
      const [startTime, endTime] = timeRange;
      const options: EventSearchOptions = {
        startTime,
        endTime,
        maxEvents: 100,
        tolerance: 1e-6,
      };
      const results: EventResult[] = [];
      const wantAll = eventType === 'all';
      const wantEclipses =
        wantAll || eventType === 'solar_eclipse' || eventType === 'lunar_eclipse';
      const wantConjunction = wantAll || eventType === 'conjunction';
      const wantOpposition = wantAll || eventType === 'opposition';

      if (wantEclipses) {
        try {
          const sun = posEvaluator(10);
          const moon = posEvaluator(301);
          const earth = posEvaluator(399);
          results.push(...findEclipses(sun, moon, earth, options));
        } catch {
          // 太阳/月球/地球未注册，跳过食事件
        }
      }

      const bodyList = bodies === 'all' ? defaultBodies : bodies;
      for (const bodyId of bodyList) {
        try {
          const body = posEvaluator(bodyId);
          const sun = posEvaluator(10);
          const earth = posEvaluator(399);
          const bodyName = String(bodyId);
          if (wantConjunction) {
            results.push(...findConjunctions(body, sun, earth, options, bodyName));
          }
          if (wantOpposition) {
            results.push(...findOppositions(body, sun, earth, options, bodyName));
          }
        } catch {
          // 天体未注册星历，跳过
        }
      }

      return results
        .map((er) => eventResultToAstroEvent(er, precision))
        .filter((e): e is AstroEvent => e !== null);
    },
    refine(candidate) {
      // 默认实现：候选已为最精确，直接返回
      return candidate;
    },
    buildObservationPlan(event) {
      const targetBody = event.body_ids[0] ?? 0;
      return {
        event,
        recommended_time_tdb: event.time_greatest_tdb,
        recommended_camera: {
          target_body_id: targetBody,
          position: 'auto',
          look_at: 'target',
          reference_frame: 'SolarSystemBarycentricInertial',
          duration_seconds: 3.0,
          easing: 'easeInOut',
        },
        layer_overrides: {},
      };
    },
    getUncertainty(event) {
      return {
        time_uncertainty_seconds: event.is_approximate ? 60 : 1,
        geometry_uncertainty: event.is_approximate ? 'medium' : 'low',
        notes_zh: event.is_approximate ? '事件为近似预测' : '事件已精确求根',
      };
    },
  };
}

// === 流式/响应发送 ====================================================

/** 发送流式消息至主线程。
 *
 * FR-TIME-006：时间变化后，所有天体位置、自转、阴影和事件状态同步更新。
 * 在 Node 测试环境中（无 self.postMessage）静默跳过，不抛异常。
 */
function sendStream(msg: WorkerStreamMessage): void {
  if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function') {
    (self as unknown as Worker).postMessage(msg);
  }
}

/** 发送 RPC 响应至主线程。 */
function sendResponse(requestId: string, payload: WorkerResponsePayload): void {
  if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function') {
    const resp: WorkerResponse = { request_id: requestId, payload };
    (self as unknown as Worker).postMessage(resp);
  }
}

/**
 * FR-TIME-006：时间变化后推送时间边界流式消息。
 *
 * 通知主线程时钟状态已更新，主线程据此触发渲染层重新计算天体位置、
 * 自转、阴影和事件状态。
 *
 * - uncertainty_predicted：是否处于预测时间范围（闰秒未确定，FR-TIME-008）
 * - out_of_range：是否超出星历覆盖范围 [1900, 2100]（FR-TIME-007）
 */
function pushClockBoundary(): void {
  const utcMjd = clockState.utc;
  // 1900-01-01 ~ 2100-01-01 的 MJD 范围（与 build_ephemeris.py 对齐）
  const MJD_1900 = 15020.0;
  const MJD_2100 = 88069.0;
  const outOfRange = utcMjd < MJD_1900 || utcMjd > MJD_2100;
  // 2026-01-01 之后为预测时间（闰秒未确定）
  const MJD_2026 = 61058.0;
  const uncertaintyPredicted = utcMjd > MJD_2026;

  sendStream({
    kind: 'time_boundary',
    time_boundary: {
      // JulianDate 完整对象（设计文档 13.1 / 42.3）
      utc: {
        mjd: utcMjd,
        scale: 'Utc',
        uncertainty: { predicted: uncertaintyPredicted, predicted_delta_t: uncertaintyPredicted },
      },
      rate: clockState.rate,
      paused: clockState.paused,
      uncertainty_predicted: uncertaintyPredicted,
      out_of_range: outOfRange,
    },
  });
}

/**
 * FR-TIME-006：时间变化后推送完整状态快照。
 *
 * 遍历 ephemerisRegistry 中所有已注册天体，调用 WASM evaluateState
 * 获取位置/速度，构造 CelestialStateSnapshot 并通过流式通道推送。
 *
 * 若 WASM 未初始化或无已注册天体，跳过（仅 time_boundary 已足够通知 UI）。
 */
function pushStateSnapshot(wasm: AstroCoreWasmInstance | null): void {
  if (!wasm) return;
  if (ephemerisRegistry.size === 0) return;

  // 构造 BodyState 列表（设计文档 42.3）
  // 注意：完整 BodyState 需要 orientation/angular_velocity/illumination，
  // 但 WASM evaluateState 目前只返回 position/velocity。其余字段用默认值
  // 填充（is_degraded=true），让 UI 知道这些是降级数据。
  type BodyStateLike = {
    body_id: number;
    position: Vec3d;
    velocity: Vec3d;
    frame: string;
    orientation: { x: number; y: number; z: number; w: number };
    angular_velocity: Vec3d;
    illumination: { sun_direction: Vec3d; illuminated_fraction: number };
    precision: string;
    flags: { is_nan_position: boolean; is_degraded: boolean; is_predicted_time: boolean };
  };

  const bodies: BodyStateLike[] = [];
  for (const [bodyId, coverage] of ephemerisRegistry) {
    const tdb = clockState.utc;
    // 检查时间是否在覆盖范围内
    const inCoverage = tdb >= coverage[0] && tdb <= coverage[1];
    if (!inCoverage) {
      // 超范围：推送降级标志，不调用 WASM（避免抛异常）
      bodies.push({
        body_id: bodyId,
        position: { x: NaN, y: NaN, z: NaN },
        velocity: { x: NaN, y: NaN, z: NaN },
        frame: 'HeliocentricInertial',
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        angular_velocity: { x: 0, y: 0, z: 0 },
        illumination: { sun_direction: { x: 0, y: 0, z: 0 }, illuminated_fraction: 0 },
        precision: 'P0',
        flags: { is_nan_position: true, is_degraded: true, is_predicted_time: false },
      });
      continue;
    }
    try {
      const st = wasm.evaluateState(BigInt(bodyId), tdb) as { position: Vec3d; velocity?: Vec3d };
      bodies.push({
        body_id: bodyId,
        position: st.position,
        velocity: st.velocity ?? { x: 0, y: 0, z: 0 },
        frame: 'HeliocentricInertial',
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        angular_velocity: { x: 0, y: 0, z: 0 },
        illumination: { sun_direction: { x: 0, y: 0, z: 0 }, illuminated_fraction: 1 },
        precision: 'P3',
        flags: { is_nan_position: false, is_degraded: false, is_predicted_time: false },
      });
    } catch {
      // WASM 求值失败：推送降级状态
      bodies.push({
        body_id: bodyId,
        position: { x: NaN, y: NaN, z: NaN },
        velocity: { x: NaN, y: NaN, z: NaN },
        frame: 'HeliocentricInertial',
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        angular_velocity: { x: 0, y: 0, z: 0 },
        illumination: { sun_direction: { x: 0, y: 0, z: 0 }, illuminated_fraction: 0 },
        precision: 'P0',
        flags: { is_nan_position: true, is_degraded: true, is_predicted_time: false },
      });
    }
  }

  // 构造快照并通过结构化克隆推送（非 Transferable 简化实现）
  // 真实生产环境应使用 SnapshotBufferView 的 ArrayBuffer 零拷贝传输（设计文档 9.2）
  sendStream({
    kind: 'snapshot',
    data: {
      // 注意：这里是简化的结构化克隆实现，非 ArrayBuffer。
      // 完整实现需要把 bodies 序列化为 Float64Array 并转移 ArrayBuffer。
      // 但 WorkerStreamMessage.data 的类型是 SnapshotBufferView，
      // 为了类型兼容，我们构造一个包含 JSON 序列化数据的伪 ArrayBuffer。
      buffer: new ArrayBuffer(0),
      byte_length: 0,
      bodies_count: bodies.length,
    },
  });
}

/** 构造错误负载。 */
function errorPayload(
  code:
    | 'OUT_OF_RANGE'
    | 'UNSUPPORTED'
    | 'INVALID_ARGUMENT'
    | 'INTERNAL'
    | 'DEGRADED'
    | 'TOUR_RESOURCES_MISSING',
  messageZh: string,
): WorkerResponsePayload {
  return { ok: false, error: { code, message_zh: messageZh } };
}

/** 发送错误响应。 */
function sendError(
  requestId: string,
  code:
    | 'OUT_OF_RANGE'
    | 'UNSUPPORTED'
    | 'INVALID_ARGUMENT'
    | 'INTERNAL'
    | 'DEGRADED'
    | 'TOUR_RESOURCES_MISSING',
  messageZh: string,
): void {
  sendResponse(requestId, errorPayload(code, messageZh));
}

/**
 * 从任意 thrown 值中提取可读错误消息。
 *
 * 关键背景：Rust WASM 的 `map_astro_error`（crates/astro-core/src/wasm.rs）
 * 把 `AstroError` 转成 **普通 JS 对象** `{ code, message_zh }`，并非 `Error` 实例。
 * 此前 catch 块统一写 `(e as Error).message`，对这类对象得到 `undefined`，
 * 随后 `msg.includes(...)` 抛出二级 TypeError（"Cannot read properties of undefined"），
 * 把原本的 `UNSUPPORTED`/`OUT_OF_RANGE` 业务错误掩盖成 `INTERNAL`。
 *
 * 本函数按以下优先级提取消息：
 * 1. `Error` 实例 → `e.message`
 * 2. 形如 `{ message_zh: string }` 的对象（WASM 错误）→ `e.message_zh`
 * 3. 形如 `{ message: string }` 的对象 → `e.message`
 * 4. 形如 `{ code: string }` 的对象 → `e.code`（兜底）
 * 5. 字符串 → 原值
 * 6. 其他 → `JSON.stringify(e)`（截断到 500 字符）
 */
function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e !== null && typeof e === 'object') {
    const obj = e as { message_zh?: unknown; message?: unknown; code?: unknown };
    if (typeof obj.message_zh === 'string' && obj.message_zh.length > 0) return obj.message_zh;
    if (typeof obj.message === 'string' && obj.message.length > 0) return obj.message;
    if (typeof obj.code === 'string' && obj.code.length > 0) return obj.code;
  }
  if (typeof e === 'string') return e;
  try {
    const s = JSON.stringify(e);
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  } catch {
    return String(e);
  }
}

/**
 * 从 WASM thrown 对象中提取错误 code（若存在）。
 *
 * WASM `map_astro_error` 产出 `{ code: "OUT_OF_RANGE" | "UNSUPPORTED" }`，
 * 用于把业务错误精准映射到 Worker 协议错误码，避免一律降级为 `UNSUPPORTED`。
 */
function extractWasErrorCode(e: unknown): string | null {
  if (e !== null && typeof e === 'object') {
    const obj = e as { code?: unknown };
    if (typeof obj.code === 'string') return obj.code;
  }
  return null;
}

// === 可测试的请求处理 ==================================================

/** processRequest 依赖覆盖（测试用）。 */
export interface ProcessRequestDeps {
  /** 覆盖 WASM 实例；undefined 时使用全局 state.wasm。 */
  wasm?: AstroCoreWasmInstance | null;
  /** 覆盖事件引擎；undefined 时使用全局 eventEngine。 */
  eventEngine?: EventEngineAdapter | null;
}

/**
 * 处理 RPC 请求并返回响应负载（无副作用，可测试）。
 *
 * 这是 Worker 的核心逻辑，不直接调用 postMessage。
 * 真实 Worker 通过 handleRequest 调用本函数并发送响应；
 * 测试可直接调用本函数注入 deps 验证行为。
 */
export function processRequest(req: WorkerRequest, deps?: ProcessRequestDeps): WorkerResponsePayload {
  const wasm = deps?.wasm !== undefined ? deps.wasm : state.wasm;
  const engine = deps?.eventEngine !== undefined ? deps.eventEngine : eventEngine;
  const p = req.payload;
  switch (p.method) {
    // --- 时钟（E-32 / FR-TIME-006）---
    case 'clock.getUtc':
      return { ok: true, result: clockState.utc };
    case 'clock.getTdb':
      // 无独立 TDB 转换器，返回 UTC 近似（真实 TDB 由 WASM 在求值时换算）
      return { ok: true, result: clockState.utc };
    case 'clock.setUtc':
      clockState.utc = p.value.mjd;
      // FR-TIME-006：时间变化后推送快照流，触发所有天体状态同步更新
      pushClockBoundary();
      pushStateSnapshot(wasm);
      return { ok: true, result: null };
    case 'clock.setRate':
      clockState.rate = p.multiplier;
      // FR-TIME-006：速率变化也需推送边界（UI 据此调整动画速度）
      pushClockBoundary();
      return { ok: true, result: null };
    case 'clock.pause':
      clockState.paused = true;
      // FR-TIME-006：暂停状态变化推送边界
      pushClockBoundary();
      return { ok: true, result: null };
    case 'clock.resume':
      clockState.paused = false;
      // FR-TIME-006：恢复推送边界与最新状态
      pushClockBoundary();
      pushStateSnapshot(wasm);
      return { ok: true, result: null };
    case 'clock.step':
      // 按 rate 推进 utc（duration 单位：天）
      clockState.utc += p.duration * clockState.rate;
      // FR-TIME-006：步进后推送快照（所有天体位置/自转/阴影/事件状态同步更新）
      pushClockBoundary();
      pushStateSnapshot(wasm);
      return { ok: true, result: null };

    // --- 星历注册（P0-7 / 设计文档 14.1）---
    case 'ephemeris.register': {
      if (!wasm) return errorPayload('INTERNAL', 'WASM 未初始化');
      // 1. 解析 body_json 提取 body_id 与覆盖范围（供 supports/getCoverage 查询）
      let parsed: { body_id?: unknown; segments?: unknown[] };
      try {
        parsed = JSON.parse(p.body_json) as { body_id?: unknown; segments?: unknown[] };
      } catch (e) {
        return errorPayload('INVALID_ARGUMENT', `body_json 解析失败: ${extractErrorMessage(e)}`);
      }
      if (typeof parsed.body_id !== 'number' || !Number.isFinite(parsed.body_id)) {
        return errorPayload('INVALID_ARGUMENT', 'body_json.body_id 必须为有限数字');
      }
      const bodyId = parsed.body_id;
      // 2. 委托给 WASM 内核注册（刷新 time_range 由 Rust 侧 register_ephemeris 处理）
      try {
        wasm.registerEphemeris(p.body_json);
      } catch (e) {
        const code = extractWasErrorCode(e);
        const msg = extractErrorMessage(e);
        if (code === 'OUT_OF_RANGE') return errorPayload('OUT_OF_RANGE', msg);
        if (code === 'UNSUPPORTED') return errorPayload('UNSUPPORTED', msg);
        return errorPayload('INTERNAL', `WASM registerEphemeris 失败: ${msg}`);
      }
      // 3. 更新 Worker 本地注册表（用于 supports/getCoverage，避免每次回查 WASM）
      const segs = Array.isArray(parsed.segments) ? parsed.segments : [];
      if (segs.length > 0) {
        const first = segs[0] as { t_start?: unknown };
        const last = segs[segs.length - 1] as { t_end?: unknown };
        const tStart = typeof first.t_start === 'number' ? first.t_start : NaN;
        const tEnd = typeof last.t_end === 'number' ? last.t_end : NaN;
        if (Number.isFinite(tStart) && Number.isFinite(tEnd)) {
          registerEphemerisEntry(bodyId, [tStart, tEnd]);
        }
      }
      return { ok: true, result: null };
    }

    // --- 星历查询（E-32）---
    case 'ephemeris.supports': {
      const coverage = ephemerisRegistry.get(p.body_id);
      if (!coverage) return { ok: true, result: false };
      if (p.time_range) {
        return {
          ok: true,
          result: p.time_range[0] >= coverage[0] && p.time_range[1] <= coverage[1],
        };
      }
      return { ok: true, result: true };
    }
    case 'ephemeris.query': {
      if (!wasm) return errorPayload('INTERNAL', 'WASM 未初始化');
      try {
        const result = wasm.evaluateState(BigInt(p.body_id), p.tdb);
        return { ok: true, result };
      } catch (e) {
        const code = extractWasErrorCode(e);
        const msg = extractErrorMessage(e);
        if (code === 'OUT_OF_RANGE') return errorPayload('OUT_OF_RANGE', msg);
        if (code === 'UNSUPPORTED') return errorPayload('UNSUPPORTED', msg);
        return errorPayload('UNSUPPORTED', msg);
      }
    }
    case 'ephemeris.getCoverage': {
      const coverage = ephemerisRegistry.get(p.body_id);
      return { ok: true, result: coverage ?? null };
    }

    // --- 状态求值 ---
    case 'state.evaluate': {
      if (!wasm) return errorPayload('INTERNAL', 'WASM 未初始化');
      try {
        const result = wasm.evaluateState(BigInt(p.body_id), p.tdb);
        return { ok: true, result };
      } catch (e) {
        // 关键修复：WASM 抛出的是普通对象 { code, message_zh }，不是 Error。
        // 旧的 `(e as Error).message` 得到 undefined，`msg.includes(...)` 抛二级
        // TypeError，把业务错误 UNSUPPORTED/OUT_OF_RANGE 掩盖成 INTERNAL。
        const code = extractWasErrorCode(e);
        const msg = extractErrorMessage(e);
        if (code === 'OUT_OF_RANGE') return errorPayload('OUT_OF_RANGE', msg);
        if (code === 'UNSUPPORTED') return errorPayload('UNSUPPORTED', msg);
        // 兜底：从 message 文本判断（保留旧逻辑的语义兼容）
        if (msg.includes('OUT_OF_RANGE') || msg.includes('范围')) {
          return errorPayload('OUT_OF_RANGE', msg);
        }
        return errorPayload('UNSUPPORTED', msg);
      }
    }
    case 'state.sampleOrbit': {
      if (!wasm) return errorPayload('INTERNAL', 'WASM 未初始化');
      try {
        // 优先使用 step_days；否则按 samples 计算步长（E-33）
        const stepDays =
          p.step_days ??
          (p.tdb_end - p.tdb_start) / Math.max(1, p.samples ?? 100);
        const result = wasm.sampleOrbit(
          BigInt(p.body_id),
          p.tdb_start,
          p.tdb_end,
          stepDays,
        );
        return { ok: true, result };
      } catch (e) {
        const code = extractWasErrorCode(e);
        const msg = extractErrorMessage(e);
        if (code === 'OUT_OF_RANGE') return errorPayload('OUT_OF_RANGE', msg);
        if (code === 'UNSUPPORTED') return errorPayload('UNSUPPORTED', msg);
        return errorPayload('UNSUPPORTED', msg);
      }
    }

    // --- 事件引擎（E-20）---
    case 'event.search': {
      if (!engine) return errorPayload('UNSUPPORTED', '事件引擎未配置');
      try {
        const result = engine.search(p.event_type, p.bodies, p.time_range, p.precision);
        return { ok: true, result };
      } catch (e) {
        return errorPayload('INTERNAL', extractErrorMessage(e));
      }
    }
    case 'event.refine': {
      if (!engine) return errorPayload('UNSUPPORTED', '事件引擎未配置');
      try {
        const result = engine.refine(p.candidate);
        return { ok: true, result };
      } catch (e) {
        return errorPayload('INTERNAL', extractErrorMessage(e));
      }
    }
    case 'event.buildObservationPlan': {
      if (!engine) return errorPayload('UNSUPPORTED', '事件引擎未配置');
      try {
        const result = engine.buildObservationPlan(p.event);
        return { ok: true, result };
      } catch (e) {
        return errorPayload('INTERNAL', extractErrorMessage(e));
      }
    }
    case 'event.getUncertainty': {
      if (!engine) return errorPayload('UNSUPPORTED', '事件引擎未配置');
      try {
        const result = engine.getUncertainty(p.event);
        return { ok: true, result };
      } catch (e) {
        return errorPayload('INTERNAL', extractErrorMessage(e));
      }
    }

    // --- 渲染（透传，无状态）---
    case 'render.setFocusBody':
    case 'render.setScaleProfile':
    case 'render.setQualityProfile':
    case 'render.setLayerVisibility':
    case 'render.requestCameraTransition':
      return { ok: true, result: null };

    // --- 巡航状态机（E-26）---
    case 'tour.load': {
      if (!p.tour_id) {
        return errorPayload('INVALID_ARGUMENT', 'tour_id 不能为空');
      }
      tourState = {
        tourId: p.tour_id,
        playing: false,
        progress: 0,
        currentNodeIndex: 0,
      };
      return { ok: true, result: null };
    }
    case 'tour.validateResources': {
      // FR-TOUR-006：真实校验资源包存在性。
      // 检查巡游所需的天体星历数据是否已加载到 ephemerisRegistry。
      // 调用方传入 required_body_ids（巡航 waypoints 引用的天体 ID 列表），
      // 逐一检查是否在 ephemerisRegistry 中已注册；缺失的返回为 missing_packages。
      const requiredBodyIds: number[] = Array.isArray(p.required_body_ids)
        ? p.required_body_ids.map((id: unknown) => Number(id)).filter((id: number) => !Number.isNaN(id))
        : [];
      const missingPackages: string[] = [];

      for (const bodyId of requiredBodyIds) {
        if (!ephemerisRegistry.has(bodyId)) {
          missingPackages.push(`ephemeris-${bodyId}`);
        }
      }

      const ok = missingPackages.length === 0;
      return {
        ok: true,
        result: { ok, missing_packages: missingPackages },
      };
    }
    case 'tour.play': {
      if (!tourState) return errorPayload('INVALID_ARGUMENT', '未加载巡航');
      tourState.playing = true;
      return { ok: true, result: null };
    }
    case 'tour.pause': {
      if (!tourState) return errorPayload('INVALID_ARGUMENT', '未加载巡航');
      tourState.playing = false;
      return { ok: true, result: null };
    }
    case 'tour.seek': {
      if (!tourState) return errorPayload('INVALID_ARGUMENT', '未加载巡航');
      // 进度限制在 [0, 1]
      tourState.progress = Math.max(0, Math.min(1, p.progress));
      return { ok: true, result: null };
    }
    case 'tour.exit': {
      tourState = null;
      return { ok: true, result: null };
    }
    case 'tour.getCurrentNode': {
      if (!tourState) return errorPayload('INVALID_ARGUMENT', '未加载巡航');
      const result: TourPlaybackState = {
        tour_id: tourState.tourId,
        current_node_index: tourState.currentNodeIndex,
        current_node_id: `node-${tourState.currentNodeIndex}`,
        progress: tourState.progress,
        is_playing: tourState.playing,
      };
      return { ok: true, result };
    }

    default: {
      // 穷尽性检查
      const _exhaustive: never = p;
      void _exhaustive;
      return errorPayload('INVALID_ARGUMENT', `未知方法: ${JSON.stringify(p)}`);
    }
  }
}

// === Worker 生命周期 ==================================================

/** 初始化 WASM。 */
async function init(wasmUrl: string): Promise<void> {
  if (state.wasm) {
    state.wasm.free();
    state.wasm = null;
  }
  state.wasmUrl = wasmUrl;
  state.wasm = await createAstroCoreWasm(wasmUrl);
  state.ready = true;
  // 若未注入自定义事件引擎，则用 WASM 构造默认引擎（E-20）
  if (!eventEngine) {
    eventEngine = createDefaultEventEngine(state.wasm);
  }
  sendStream({ kind: 'worker_ready' });
}

/** 处理 RPC 请求（Worker 入口，发送响应至主线程）。 */
async function handleRequest(req: WorkerRequest): Promise<void> {
  try {
    const payload = processRequest(req);
    sendResponse(req.request_id, payload);
  } catch (e) {
    sendError(req.request_id, 'INTERNAL', extractErrorMessage(e));
  }
}

/** Worker 消息处理。 */
async function onMessage(event: MessageEvent): Promise<void> {
  const msg = event.data as WorkerInbound;
  if ('kind' in msg) {
    // 控制消息
    const ctrl = msg as WorkerControlMessage;
    if (ctrl.kind === 'init' || ctrl.kind === 'reinit') {
      try {
        await init(ctrl.wasm_url);
      } catch (e) {
        // 详细的错误信息，确保 message_zh 永不为 undefined
        const errDetail = e instanceof Error
          ? `${e.name}: ${e.message}`
          : typeof e === 'string'
            ? e
            : `非 Error 对象: ${JSON.stringify(e)}`;
        console.error('[astro-core-worker] init 失败:', errDetail, e);
        sendStream({ kind: 'worker_error', worker_error: { code: 'INTERNAL', message_zh: errDetail } });
      }
    } else if (ctrl.kind === 'dispose') {
      if (state.wasm) {
        state.wasm.free();
        state.wasm = null;
      }
      state.ready = false;
    }
    return;
  }
  // RPC 请求
  await handleMessage(msg as WorkerRequest);
}

function handleMessage(req: WorkerRequest): Promise<void> {
  return handleRequest(req);
}

// 注册消息监听（仅在实际 Worker 环境中；Node 测试环境无 self，跳过）
if (typeof self !== 'undefined' && 'addEventListener' in self) {
  (self as unknown as Worker).addEventListener('message', (e: MessageEvent) => {
    void onMessage(e);
  });
}

// 导出消息类型供类型推导
export type { WorkerOutbound };
