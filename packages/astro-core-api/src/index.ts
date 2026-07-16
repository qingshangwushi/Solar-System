/**
 * 天文内核 API 契约（设计文档第 42 节）。
 *
 * 本包仅定义接口与类型，不含实现。实现由 Rust/WASM + Web Worker 提供
 * （设计文档 9.1：天文内核 = Rust/WASM + Web Worker，与渲染解耦）。
 *
 * 架构原则（设计文档 9.3）：
 * - React 不参与逐帧天体状态更新；
 * - 天文内核不引用 Three.js 类型；
 * - 渲染引擎不自行推算天体轨道。
 */
export type {
  ReferenceFrame,
  Precision,
  AssetTier,
  RealityTier,
  TimeScale,
  TimeUncertainty,
  JulianDate,
  Vec3d,
  Quat64,
  Illumination,
  StateFlags,
  BodyState,
  CelestialStateSnapshot,
  BodyRecord,
  Catalog,
  ManifestEntry,
  Manifest,
  TourNode,
  Tour,
  ContentSection,
  ContentCard,
} from '@solar-system/schemas';

export type {
  WorkerRequest,
  WorkerResponse,
  WorkerStreamMessage,
  WorkerControlMessage,
  WorkerInbound,
  WorkerOutbound,
  WorkerRpcMap,
  WorkerRequestMethod,
  WorkerError,
  SnapshotBufferView,
} from './protocol.js';

export { AstroCoreClient } from './astro-core-client.js';
export type {
  AstroCoreClientOptions,
  SnapshotListener,
  TimeBoundaryListener as ClientTimeBoundaryListener,
  ReadyListener,
  WorkerErrorListener,
} from './astro-core-client.js';

import type {
  ReferenceFrame,
  Precision,
  JulianDate,
  Vec3d,
  CelestialStateSnapshot,
  AssetTier,
} from '@solar-system/schemas';

/** 时间边界订阅回调（设计文档 42.1 subscribeTimeBoundary）。 */
export type TimeBoundaryListener = (boundary: TimeBoundary) => void;

/** 时间边界事件。 */
export interface TimeBoundary {
  utc: JulianDate;
  rate: number;
  paused: boolean;
  /** 未来闰秒预测标记（FR-TIME-008）。 */
  uncertainty_predicted: boolean;
  /** 超出 1900-2100 范围时为 true（FR-TIME-007）。 */
  out_of_range: boolean;
}

/**
 * 模拟时钟接口（设计文档 42.1）。
 *
 * 内部使用连续时间尺度（TT/TDB）计算，避免 UTC 跳秒导致轨道不连续（设计文档 11）。
 */
export interface SimulationClock {
  getUtcTime(): JulianDate;
  getTdbTime(): JulianDate;
  setUtcTime(value: JulianDate): void;
  setRate(multiplier: number): void;
  pause(): void;
  resume(): void;
  step(duration: number): void;
  subscribeTimeBoundary(listener: TimeBoundaryListener): () => void;
}

/** 星历覆盖范围 [tdb_start, tdb_end]。 */
export type EphemerisCoverage = readonly [number, number] | null;

/** 星历查询结果。 */
export type EphemerisResult =
  | { kind: 'ok'; position: Vec3d; velocity: Vec3d; precision: Precision }
  | { kind: 'out_of_range'; precision: Precision }
  | { kind: 'unsupported' };

/**
 * 星历提供器接口（设计文档 42.2）。
 *
 * 高倍率时按目标时刻直接计算状态，不使用帧累计近似（FR-TIME-005）。
 */
export interface EphemerisProvider {
  supports(bodyId: number, timeRange: EphemerisCoverage): boolean;
  getPosition(bodyId: number, referenceFrame: ReferenceFrame, tdb: number): Vec3d;
  getVelocity(bodyId: number, referenceFrame: ReferenceFrame, tdb: number): Vec3d;
  getPrecision(bodyId: number, tdb: number): Precision;
  getCoverage(bodyId: number): EphemerisCoverage;
  /** 批量查询（供 Worker 协议使用，避免多次往返）。 */
  query(bodyId: number, referenceFrame: ReferenceFrame, tdb: number): EphemerisResult;
}

/** 相机过渡命令（设计文档 23.3 六阶段过渡）。 */
export interface CameraTransitionCommand {
  target_body_id: number;
  position: Vec3d | 'auto';
  look_at: Vec3d | 'target';
  reference_frame: ReferenceFrame;
  duration_seconds: number;
  easing: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
}

/** 尺度档位（设计文档 17）。 */
export type ScaleProfile = 'real' | 'enhanced';

/** 画质档位（设计文档 30）。 */
export type QualityProfile = 'cinematic' | 'high' | 'standard' | 'safe';

/** 图层标识（设计文档 18.1 渲染图节点）。 */
export type RenderLayer =
  | 'starfield'
  | 'distant_bodies'
  | 'main_target_opaque'
  | 'terrain'
  | 'shadow_eclipse'
  | 'atmosphere'
  | 'volume_cloud'
  | 'transparent_rings'
  | 'aurora_magnetosphere'
  | 'space_particles'
  | 'bloom'
  | 'tone_mapping'
  | 'anti_aliasing'
  | 'ui_composite';

/** 低频状态（供 React/UI 订阅，设计文档 42.4 readLowFrequencyStatus）。 */
export interface LowFrequencyStatus {
  focus_body_id: number;
  scale_profile: ScaleProfile;
  quality_profile: QualityProfile;
  layer_visibility: Partial<Record<RenderLayer, boolean>>;
  camera_transition_active: boolean;
}

/**
 * 渲染状态桥接口（设计文档 42.4）。
 *
 * 渲染引擎从该桥读取快照与编排命令，不自行推算天体轨道（设计文档 9.3 原则 3）。
 * React 通过 readLowFrequencyStatus 订阅低频状态，不参与逐帧更新。
 */
export interface RenderBridge {
  submitSnapshot(snapshot: CelestialStateSnapshot): void;
  setFocusBody(bodyId: number): void;
  setScaleProfile(profile: ScaleProfile): void;
  setQualityProfile(profile: QualityProfile): void;
  setLayerVisibility(layer: RenderLayer, visible: boolean): void;
  requestCameraTransition(command: CameraTransitionCommand): void;
  readLowFrequencyStatus(): LowFrequencyStatus;
}

/** 资源句柄（retain/release 引用计数，设计文档 29.3）。 */
export interface ResourceHandle {
  readonly resource_id: string;
  readonly logical_id: string;
  readonly quality: AssetTier | 'Base';
  readonly backend: 'webgpu' | 'webgl2' | 'both';
}

/** GPU 预算（设计文档 29.5）。 */
export interface GpuBudget {
  limit_mb: number;
  used_mb: number;
  /** 0..1。 */
  pressure: number;
}

/** 资源请求优先级（设计文档 29.4）。 */
export type ResourcePriority = 'critical' | 'high' | 'normal' | 'low' | 'prefetch';

/** 资源解析结果。 */
export type ResourceResolution =
  | { kind: 'resolved'; handle: ResourceHandle }
  | { kind: 'missing'; missing_packages: string[] }
  | { kind: 'loading'; request_id: string };

/**
 * 资源管理器接口（设计文档 42.5）。
 *
 * 显存预算：影视 5—6GB / 标准 1.5—2.5GB（设计文档 29.5）。
 * 同时只一个主目标最高 LOD（设计文档 29.5）。
 */
export interface ResourceManager {
  resolve(logicalId: string, quality: AssetTier | 'Base', backend: 'webgpu' | 'webgl2' | 'both'): ResourceResolution;
  request(resource: ResourceHandle, priority: ResourcePriority): string;
  cancel(requestId: string): void;
  retain(resourceId: string): void;
  release(resourceId: string): void;
  getGpuBudget(): GpuBudget;
  evictUntilWithinBudget(): void;
}

/** 事件类型（设计文档 16.1）。 */
export type AstroEventType =
  | 'solar_eclipse'
  | 'lunar_eclipse'
  | 'transit'
  | 'occultation'
  | 'conjunction'
  | 'opposition'
  | 'greatest_elongation'
  | 'perihelion'
  | 'aphelion'
  | 'satellite_eclipse'
  | 'satellite_transit'
  | 'ring_shadow';

/** 事件相位（设计文档 16.2）。 */
export type EventPhase = 'begin' | 'greatest' | 'end';

/** 事件记录。 */
export interface AstroEvent {
  event_id: string;
  event_type: AstroEventType;
  body_ids: number[];
  time_begin_tdb: number;
  time_greatest_tdb: number;
  time_end_tdb: number;
  precision: Precision;
  /** 无法满足高精度时显示预测或近似标签（FR-EVENT-007）。 */
  is_approximate: boolean;
}

/** 事件观察计划（FR-EVENT-005 一键跳转）。 */
export interface ObservationPlan {
  event: AstroEvent;
  recommended_time_tdb: number;
  recommended_camera: CameraTransitionCommand;
  layer_overrides: Partial<Record<RenderLayer, boolean>>;
}

/** 事件不确定性信息。 */
export interface EventUncertainty {
  time_uncertainty_seconds: number;
  geometry_uncertainty: 'low' | 'medium' | 'high';
  notes_zh: string;
}

/**
 * 事件引擎接口（设计文档 42.6）。
 *
 * 事件计算不依赖在线 API（FR-EVENT-008）。
 */
export interface EventEngine {
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

/** 巡航节点播放状态。 */
export interface TourPlaybackState {
  tour_id: string;
  current_node_index: number;
  current_node_id: string;
  progress: number;
  is_playing: boolean;
}

/**
 * 巡航播放器接口（设计文档 42.7）。
 *
 * 巡航配置为静态只读文件（FR-TOUR-003）；用户不得编辑或保存（FR-TOUR-004）。
 */
export interface TourPlayer {
  load(tourId: string): Promise<void>;
  validateResources(): { ok: boolean; missing_packages: string[] };
  play(): void;
  pause(): void;
  seek(progress: number): void;
  exit(): void;
  getCurrentNode(): TourPlaybackState;
}
