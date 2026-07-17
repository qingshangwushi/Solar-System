/**
 * 版本化数据 Schema（设计文档第 13、27、29、42 节）。
 *
 * 所有运行时数据通过版本化 Schema 交付（设计文档 9.3 原则 4）。
 * 每个 Schema 带 version 字段，数据包升级时可替换而不修改内核。
 */

/** Schema 版本号。 */
export const SCHEMA_VERSION = '1.0.0' as const;

/** 参考系标识（设计文档 12.1）。 */
export type ReferenceFrame =
  | 'SolarSystemBarycentricInertial'
  | 'HeliocentricInertial'
  | 'BodyBarycentric'
  | 'BodyFixed'
  | 'SurfaceLocalEnu'
  | 'ObserverRelative';

/** 数据精度等级（设计文档 13.4）。 */
export type Precision = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

/** 资产等级（设计文档 2、28）。 */
export type AssetTier = 'S' | 'A' | 'B' | 'C';

/** 真实性等级（设计文档 27.2）。 */
export type RealityTier = 'R1' | 'R2' | 'R3' | 'R4';

/** 时间尺度（设计文档 11.1）。 */
export type TimeScale = 'Utc' | 'Tai' | 'Tt' | 'Tdb';

/** 时间不确定性标记（设计文档 11.3、FR-TIME-008）。 */
export interface TimeUncertainty {
  predicted: boolean;
  predicted_delta_t: boolean;
}

/** 约简儒略日时间点。 */
export interface JulianDate {
  mjd: number;
  scale: TimeScale;
  uncertainty: TimeUncertainty;
}

/** 双精度三维向量。 */
export interface Vec3d {
  x: number;
  y: number;
  z: number;
}

/** 双精度四元数。 */
export interface Quat64 {
  w: number;
  x: number;
  y: number;
  z: number;
}

/** 四元数（别名）。 */
export interface Quatd {
  w: number;
  x: number;
  y: number;
  z: number;
}

/** 3x3旋转矩阵。 */
export interface RotMat3x3 {
  r00: number;
  r01: number;
  r02: number;
  r10: number;
  r11: number;
  r12: number;
  r20: number;
  r21: number;
  r22: number;
}

/** 光照信息（设计文档 42.3 illumination）。 */
export interface Illumination {
  sun_direction: Vec3d;
  illuminated_fraction: number;
}

/** 状态标志（设计文档 42.3 flags）。 */
export interface StateFlags {
  is_nan_position: boolean;
  is_degraded: boolean;
  is_predicted_time: boolean;
}

/** 单个天体状态（设计文档 42.3 bodies[]）。 */
export interface BodyState {
  body_id: number;
  position: Vec3d;
  velocity: Vec3d;
  frame: ReferenceFrame;
  orientation: Quat64;
  angular_velocity: Vec3d;
  illumination: Illumination;
  precision: Precision;
  flags: StateFlags;
}

/** 天体状态快照（设计文档 42.3 CelestialStateSnapshot）。 */
export interface CelestialStateSnapshot {
  simulation_time_utc: JulianDate;
  simulation_time_tdb: JulianDate;
  reference_epoch: number;
  bodies: BodyState[];
}

/** 天体目录记录（设计文档 13.3）。 */
export interface BodyRecord {
  // 修复 E-12 / 支持 E-31：彗星编号如 "1P" 使 body_id 同时接受 number 与 string。
  body_id: number | string;
  type: string;
  parent_body_id: number | null;
  name_zh: string;
  name_en: string;
  aliases: string[];
  discovery_info: string | null;
  mean_radius_km: number;
  gm_km3_s2: number | null;
  mean_density: number | null;
  albedo: number | null;
  rotation_period_days: number | null;
  orbital_period_days: number | null;
  pole_ra_deg: number | null;
  pole_dec_deg: number | null;
  prime_meridian_model: string | null;
  ephemeris_provider: string;
  ephemeris_coverage: [number, number] | null;
  precision: Precision;
  asset_tier: AssetTier;
  content_ref: string | null;
  sources: string[];
}

/** 目录元数据（设计文档 13.1）。 */
export interface CatalogMeta {
  snapshot_date: string;
  source_versions: string[];
}

/** 天体目录（设计文档 13）。 */
export interface Catalog {
  schema_version: string;
  meta: CatalogMeta;
  bodies: BodyRecord[];
}

/** Manifest 资源记录（设计文档 29.2）。 */
export interface ManifestEntry {
  logical_id: string;
  file_path: string;
  package_id: string;
  version: string;
  size_bytes: number;
  sha256: string;
  mime: string;
  dependencies: string[];
  quality_tier: AssetTier | 'Base';
  applicable_backend: 'webgpu' | 'webgl2' | 'both';
  decode: string;
  gpu_estimated_memory_mb: number;
  source_ref: string;
}

/** 资源清单（设计文档 29.2）。 */
export interface Manifest {
  schema_version: string;
  package_id: string;
  package_version: string;
  entries: ManifestEntry[];
}

/** 巡航节点（设计文档 26.2）。 */
export interface TourNode {
  id: string;
  time_setting: { utc_mjd: number; rate: number } | 'preserve';
  camera_target: number;
  camera_position: Vec3d | 'auto';
  camera_look_at: Vec3d | 'target';
  reference_frame: ReferenceFrame;
  duration_seconds: number;
  easing: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
  scale_mode: 'real' | 'enhanced' | 'preserve';
  layer_visibility: Record<string, boolean>;
  min_quality: 'cinematic' | 'high' | 'standard' | 'safe';
  preload: string[];
  text_card_zh: string | null;
}

/** 巡航配置（设计文档 26，只读）。 */
export interface Tour {
  schema_version: string;
  id: string;
  title_zh: string;
  description_zh: string;
  required_packages: string[];
  nodes: TourNode[];
  exit_state: {
    target: number | null;
    scale_mode: 'real' | 'enhanced';
    rate: number;
  };
}

/** 科普主题章节（设计文档 27.1）。 */
export interface ContentSection {
  key: string;
  title_zh: string;
  body_zh: string;
  reality_tier: RealityTier;
}

/** 科普内容数据卡片（设计文档 27）。 */
export interface ContentCard {
  schema_version: string;
  body_id: number;
  basic_params: {
    size: string;
    mass_or_gm: string;
    density: string;
    gravity: string;
    temperature_range: string;
    orbital_period: string;
    rotation_period: string;
    satellite_count: string | null;
    asset_tier: AssetTier;
    precision: Precision;
  };
  sections: ContentSection[];
  sources: string[];
  procedural_appearance_note: string | null;
}

export { SCHEMA_VERSION as SCHEMA_VERSION_STRING };
