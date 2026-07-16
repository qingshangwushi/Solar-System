/**
 * JSON Schema 定义（ajv 校验用，设计文档第 13、27、29 节）。
 *
 * 运行时数据通过版本化 Schema 交付。这些 Schema 用于校验静态数据包。
 */
import type {
  Catalog,
  Manifest,
  Tour,
  ContentCard,
  CelestialStateSnapshot,
} from './index.js';

const vec3d = {
  type: 'object',
  required: ['x', 'y', 'z'],
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  additionalProperties: false,
} as const;

const quat64 = {
  type: 'object',
  required: ['w', 'x', 'y', 'z'],
  properties: {
    w: { type: 'number' },
    x: { type: 'number' },
    y: { type: 'number' },
    z: { type: 'number' },
  },
  additionalProperties: false,
} as const;

const precision = { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'P4'] } as const;
const assetTier = { type: 'string', enum: ['S', 'A', 'B', 'C'] } as const;
const realityTier = { type: 'string', enum: ['R1', 'R2', 'R3', 'R4'] } as const;
const referenceFrame = {
  type: 'string',
  enum: [
    'SolarSystemBarycentricInertial',
    'HeliocentricInertial',
    'BodyBarycentric',
    'BodyFixed',
    'SurfaceLocalEnu',
    'ObserverRelative',
  ],
} as const;

/** 天体目录 JSON Schema。 */
export const catalogSchema = {
  type: 'object',
  required: ['schema_version', 'meta', 'bodies'],
  properties: {
    schema_version: { type: 'string' },
    meta: {
      type: 'object',
      required: ['snapshot_date', 'source_versions'],
      properties: {
        snapshot_date: { type: 'string' },
        source_versions: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    bodies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['body_id', 'type', 'name_zh', 'name_en', 'mean_radius_km', 'precision', 'asset_tier', 'ephemeris_provider', 'sources'],
        properties: {
          body_id: { type: 'integer', minimum: 0 },
          type: { type: 'string' },
          parent_body_id: { type: ['integer', 'null'] },
          name_zh: { type: 'string' },
          name_en: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          discovery_info: { type: ['string', 'null'] },
          mean_radius_km: { type: 'number', minimum: 0 },
          gm_km3_s2: { type: ['number', 'null'] },
          mean_density: { type: ['number', 'null'] },
          albedo: { type: ['number', 'null'] },
          rotation_period_days: { type: ['number', 'null'] },
          orbital_period_days: { type: ['number', 'null'] },
          pole_ra_deg: { type: ['number', 'null'] },
          pole_dec_deg: { type: ['number', 'null'] },
          prime_meridian_model: { type: ['string', 'null'] },
          ephemeris_provider: { type: 'string' },
          ephemeris_coverage: {
            type: ['array', 'null'],
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
          precision,
          asset_tier: assetTier,
          content_ref: { type: ['string', 'null'] },
          sources: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

/** 资源清单 JSON Schema。 */
export const manifestSchema = {
  type: 'object',
  required: ['schema_version', 'package_id', 'package_version', 'entries'],
  properties: {
    schema_version: { type: 'string' },
    package_id: { type: 'string' },
    package_version: { type: 'string' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'logical_id',
          'file_path',
          'package_id',
          'version',
          'size_bytes',
          'sha256',
          'mime',
          'dependencies',
          'quality_tier',
          'applicable_backend',
          'decode',
          'gpu_estimated_memory_mb',
          'source_ref',
        ],
        properties: {
          logical_id: { type: 'string' },
          file_path: { type: 'string' },
          package_id: { type: 'string' },
          version: { type: 'string' },
          size_bytes: { type: 'integer', minimum: 0 },
          sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
          mime: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
          quality_tier: { type: 'string', enum: ['S', 'A', 'B', 'C', 'Base'] },
          applicable_backend: { type: 'string', enum: ['webgpu', 'webgl2', 'both'] },
          decode: { type: 'string' },
          gpu_estimated_memory_mb: { type: 'number', minimum: 0 },
          source_ref: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

/** 巡航配置 JSON Schema。 */
export const tourSchema = {
  type: 'object',
  required: ['schema_version', 'id', 'title_zh', 'nodes', 'exit_state'],
  properties: {
    schema_version: { type: 'string' },
    id: { type: 'string' },
    title_zh: { type: 'string' },
    description_zh: { type: 'string' },
    required_packages: { type: 'array', items: { type: 'string' } },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'camera_target', 'reference_frame', 'duration_seconds', 'easing', 'scale_mode', 'layer_visibility', 'min_quality', 'preload'],
        properties: {
          id: { type: 'string' },
          time_setting: {
            type: ['object', 'string'],
            enum: ['preserve'],
          },
          camera_target: { type: 'integer', minimum: 0 },
          camera_position: {
            oneOf: [vec3d, { type: 'string', enum: ['auto'] }],
          },
          camera_look_at: {
            oneOf: [vec3d, { type: 'string', enum: ['target'] }],
          },
          reference_frame: referenceFrame,
          duration_seconds: { type: 'number', minimum: 0 },
          easing: { type: 'string', enum: ['linear', 'easeInOut', 'easeIn', 'easeOut'] },
          scale_mode: { type: 'string', enum: ['real', 'enhanced', 'preserve'] },
          layer_visibility: { type: 'object' },
          min_quality: { type: 'string', enum: ['cinematic', 'high', 'standard', 'safe'] },
          preload: { type: 'array', items: { type: 'string' } },
          text_card_zh: { type: ['string', 'null'] },
        },
        additionalProperties: false,
      },
    },
    exit_state: {
      type: 'object',
      required: ['scale_mode', 'rate'],
      properties: {
        target: { type: ['integer', 'null'] },
        scale_mode: { type: 'string', enum: ['real', 'enhanced'] },
        rate: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

/** 科普内容 JSON Schema。 */
export const contentSchema = {
  type: 'object',
  required: ['schema_version', 'body_id', 'basic_params', 'sections', 'sources'],
  properties: {
    schema_version: { type: 'string' },
    body_id: { type: 'integer', minimum: 0 },
    basic_params: {
      type: 'object',
      required: ['size', 'asset_tier', 'precision'],
      properties: {
        size: { type: 'string' },
        mass_or_gm: { type: 'string' },
        density: { type: 'string' },
        gravity: { type: 'string' },
        temperature_range: { type: 'string' },
        orbital_period: { type: 'string' },
        rotation_period: { type: 'string' },
        satellite_count: { type: ['string', 'null'] },
        asset_tier: assetTier,
        precision,
      },
      additionalProperties: false,
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'title_zh', 'body_zh', 'reality_tier'],
        properties: {
          key: { type: 'string' },
          title_zh: { type: 'string' },
          body_zh: { type: 'string' },
          reality_tier: realityTier,
        },
        additionalProperties: false,
      },
    },
    sources: { type: 'array', items: { type: 'string' } },
    procedural_appearance_note: { type: ['string', 'null'] },
  },
  additionalProperties: false,
} as const;

/** 天体状态快照 JSON Schema。 */
export const snapshotSchema = {
  type: 'object',
  required: ['simulation_time_utc', 'simulation_time_tdb', 'reference_epoch', 'bodies'],
  properties: {
    simulation_time_utc: { type: 'object' },
    simulation_time_tdb: { type: 'object' },
    reference_epoch: { type: 'number' },
    bodies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['body_id', 'position', 'velocity', 'frame', 'orientation', 'angular_velocity', 'illumination', 'precision', 'flags'],
        properties: {
          body_id: { type: 'integer', minimum: 0 },
          position: vec3d,
          velocity: vec3d,
          frame: referenceFrame,
          orientation: quat64,
          angular_velocity: vec3d,
          illumination: {
            type: 'object',
            required: ['sun_direction', 'illuminated_fraction'],
            properties: {
              sun_direction: vec3d,
              illuminated_fraction: { type: 'number', minimum: 0, maximum: 1 },
            },
            additionalProperties: false,
          },
          precision,
          flags: {
            type: 'object',
            required: ['is_nan_position', 'is_degraded', 'is_predicted_time'],
            properties: {
              is_nan_position: { type: 'boolean' },
              is_degraded: { type: 'boolean' },
              is_predicted_time: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

export type {
  Catalog,
  Manifest,
  Tour,
  ContentCard,
  CelestialStateSnapshot,
};
