/**
 * Worker 双向消息协议（设计文档 9.1、42 节）。
 *
 * 主线程 ↔ 天文内核 Worker 通信协议：
 * - 请求/响应：同步式 RPC（带请求 id 关联）。
 * - 流式快照：Worker 主动推送 CelestialStateSnapshot，使用可转移 ArrayBuffer 零拷贝传输
 *   （设计文档 9.2：Web Worker 通信封装）。
 *
 * 协议设计原则：
 * - 主线程不阻塞；所有计算在 Worker 内进行；
 * - 快照通过 Transferable 传输，避免结构化克隆大对象（设计文档 8.3 可维护性）；
 * - Worker 崩溃后可重新初始化（设计文档 8.2 稳定性）。
 */
import type {
  CelestialStateSnapshot,
  Precision,
  ReferenceFrame,
  Vec3d,
  JulianDate,
} from '@solar-system/schemas';
import type {
  AstroEvent,
  AstroEventType,
  CameraTransitionCommand,
  QualityProfile,
  RenderLayer,
  ScaleProfile,
  TourPlaybackState,
} from './index.js';

/** 请求方法名（与设计文档 42 节接口一一对应）。 */
export type WorkerRequestMethod =
  | 'clock.getUtc'
  | 'clock.getTdb'
  | 'clock.setUtc'
  | 'clock.setRate'
  | 'clock.pause'
  | 'clock.resume'
  | 'clock.step'
  | 'ephemeris.supports'
  | 'ephemeris.query'
  | 'ephemeris.getCoverage'
  | 'state.evaluate'
  | 'state.sampleOrbit'
  | 'event.search'
  | 'event.refine'
  | 'event.buildObservationPlan'
  | 'event.getUncertainty'
  | 'render.setFocusBody'
  | 'render.setScaleProfile'
  | 'render.setQualityProfile'
  | 'render.setLayerVisibility'
  | 'render.requestCameraTransition'
  | 'tour.load'
  | 'tour.validateResources'
  | 'tour.play'
  | 'tour.pause'
  | 'tour.seek'
  | 'tour.exit'
  | 'tour.getCurrentNode';

/** 请求负载（按方法分发的判别联合）。 */
export type WorkerRequestPayload =
  | { method: 'clock.setUtc'; value: JulianDate }
  | { method: 'clock.setRate'; multiplier: number }
  | { method: 'clock.step'; duration: number }
  | { method: 'ephemeris.supports'; body_id: number; time_range: [number, number] | null }
  | {
      method: 'ephemeris.query';
      body_id: number;
      reference_frame: ReferenceFrame;
      tdb: number;
    }
  | { method: 'ephemeris.getCoverage'; body_id: number }
  | { method: 'state.evaluate'; body_id: number; tdb: number }
  | {
      method: 'state.sampleOrbit';
      body_id: number;
      tdb_start: number;
      tdb_end: number;
      samples: number;
      reference_frame: ReferenceFrame;
    }
  | {
      method: 'event.search';
      event_type: AstroEventType | 'all';
      bodies: number[] | 'all';
      time_range: [number, number];
      precision: Precision;
    }
  | { method: 'event.refine'; candidate: AstroEvent }
  | { method: 'event.buildObservationPlan'; event: AstroEvent }
  | { method: 'event.getUncertainty'; event: AstroEvent }
  | { method: 'render.setFocusBody'; body_id: number }
  | { method: 'render.setScaleProfile'; profile: ScaleProfile }
  | { method: 'render.setQualityProfile'; profile: QualityProfile }
  | { method: 'render.setLayerVisibility'; layer: RenderLayer; visible: boolean }
  | { method: 'render.requestCameraTransition'; command: CameraTransitionCommand }
  | { method: 'tour.load'; tour_id: string }
  | { method: 'tour.seek'; progress: number }
  | {
      method:
        | 'clock.getUtc'
        | 'clock.getTdb'
        | 'clock.pause'
        | 'clock.resume'
        | 'tour.validateResources'
        | 'tour.play'
        | 'tour.pause'
        | 'tour.exit'
        | 'tour.getCurrentNode';
    };

/** 主线程 → Worker 请求信封。 */
export interface WorkerRequest {
  /** 请求 id，用于关联响应。 */
  request_id: string;
  payload: WorkerRequestPayload;
}

/** 响应负载（成功/失败判别联合）。 */
export type WorkerResponsePayload =
  | { ok: true; result: unknown }
  | { ok: false; error: WorkerError };

/** Worker 错误。 */
export interface WorkerError {
  code:
    | 'OUT_OF_RANGE'
    | 'UNSUPPORTED'
    | 'INVALID_ARGUMENT'
    | 'INTERNAL'
    | 'DEGRADED'
    | 'TOUR_RESOURCES_MISSING';
  message_zh: string;
}

/** Worker → 主线程响应信封。 */
export interface WorkerResponse {
  /** 关联的请求 id。 */
  request_id: string;
  payload: WorkerResponsePayload;
}

/** Worker 主动推送的事件类型（流式，无需请求 id 关联）。 */
export type WorkerStreamKind =
  | 'snapshot'
  | 'time_boundary'
  | 'tour_playback'
  | 'worker_ready'
  | 'worker_error';

/** Worker → 主线程流式消息信封。 */
export interface WorkerStreamMessage {
  kind: WorkerStreamKind;
  /** 快照数据（snapshot 类型时使用，可转移 ArrayBuffer 视图）。 */
  data?: SnapshotBufferView;
  /** 时间边界（time_boundary 类型时使用）。 */
  time_boundary?: {
    utc: JulianDate;
    rate: number;
    paused: boolean;
    uncertainty_predicted: boolean;
    out_of_range: boolean;
  };
  /** 巡航播放状态（tour_playback 类型时使用）。 */
  tour_playback?: TourPlaybackState;
  /** Worker 致命错误（worker_error 类型时使用）。 */
  worker_error?: WorkerError;
}

/**
 * 快照缓冲区视图（可转移 ArrayBuffer 零拷贝，设计文档 8.3）。
 *
 * 二进制布局（Float64Array，小端）：
 * - 头部 4 个 float64：simulation_time_tdb、reference_epoch、bodies_count、reserved
 * - 每个 body 13 个 float64：body_id(高 32 位填充)、position(3)、velocity(3)、
 *   orientation(4)、angular_velocity(3) —— 共 14 个？以实际序列化为准。
 *
 * 实际字段布局由 WASM 端定义；此处仅声明传输契约。
 */
export interface SnapshotBufferView {
  /** 可转移的 ArrayBuffer（所有权转移至接收方）。 */
  buffer: ArrayBuffer;
  /** 字节长度。 */
  byte_length: number;
  /** body 数量。 */
  bodies_count: number;
}

/** 主线程 → Worker 控制消息（非 RPC，控制 Worker 生命周期）。 */
export type WorkerControlMessage =
  | { kind: 'init'; wasm_url: string }
  | { kind: 'reinit'; wasm_url: string }
  | { kind: 'dispose' };

/** Worker 接收的所有消息类型。 */
export type WorkerInbound = WorkerRequest | WorkerControlMessage;

/** 主线程接收的所有消息类型。 */
export type WorkerOutbound = WorkerResponse | WorkerStreamMessage;

/** RPC 结果解析辅助类型：根据方法推断响应类型。 */
export interface WorkerRpcMap {
  'clock.getUtc': { result: JulianDate };
  'clock.getTdb': { result: JulianDate };
  'clock.setUtc': { result: null };
  'clock.setRate': { result: null };
  'clock.pause': { result: null };
  'clock.resume': { result: null };
  'clock.step': { result: null };
  'ephemeris.supports': { result: boolean };
  'ephemeris.query': {
    result:
      | { kind: 'ok'; position: Vec3d; velocity: Vec3d; precision: Precision }
      | { kind: 'out_of_range'; precision: Precision }
      | { kind: 'unsupported' };
  };
  'ephemeris.getCoverage': { result: [number, number] | null };
  'state.evaluate': { result: CelestialStateSnapshot };
  'state.sampleOrbit': { result: Vec3d[] };
  'event.search': { result: AstroEvent[] };
  'event.refine': { result: AstroEvent };
  'event.buildObservationPlan': {
    result: {
      event: AstroEvent;
      recommended_time_tdb: number;
      recommended_camera: CameraTransitionCommand;
      layer_overrides: Partial<Record<RenderLayer, boolean>>;
    };
  };
  'event.getUncertainty': {
    result: { time_uncertainty_seconds: number; geometry_uncertainty: 'low' | 'medium' | 'high'; notes_zh: string };
  };
  'render.setFocusBody': { result: null };
  'render.setScaleProfile': { result: null };
  'render.setQualityProfile': { result: null };
  'render.setLayerVisibility': { result: null };
  'render.requestCameraTransition': { result: null };
  'tour.load': { result: null };
  'tour.validateResources': { result: { ok: boolean; missing_packages: string[] } };
  'tour.play': { result: null };
  'tour.pause': { result: null };
  'tour.seek': { result: null };
  'tour.exit': { result: null };
  'tour.getCurrentNode': { result: TourPlaybackState };
}
