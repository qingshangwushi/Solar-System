/**
 * Schema 校验测试（设计文档第 13、27、29 节；任务 P0-3 验证）。
 *
 * 用样本 JSON 实例通过 ajv 校验，确保 Schema 定义正确且可被数据包使用。
 */
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  catalogSchema,
  manifestSchema,
  tourSchema,
  contentSchema,
  snapshotSchema,
} from '../schemas.js';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validateCatalog = ajv.compile(catalogSchema);
const validateManifest = ajv.compile(manifestSchema);
const validateTour = ajv.compile(tourSchema);
const validateContent = ajv.compile(contentSchema);
const validateSnapshot = ajv.compile(snapshotSchema);

describe('catalogSchema', () => {
  it('accepts a valid catalog with one body', () => {
    const sample = {
      schema_version: '1.0.0',
      meta: {
        snapshot_date: '2026-07-16',
        source_versions: ['jpl-de440', 'iau-nomenclature-2024'],
      },
      bodies: [
        {
          body_id: 10,
          type: 'star',
          parent_body_id: null,
          name_zh: '太阳',
          name_en: 'Sun',
          aliases: ['Sol'],
          discovery_info: null,
          mean_radius_km: 696340,
          gm_km3_s2: 1.32712440018e11,
          mean_density: 1.408,
          albedo: null,
          rotation_period_days: 25.05,
          orbital_period_days: null,
          pole_ra_deg: 286.13,
          pole_dec_deg: 63.87,
          prime_meridian_model: null,
          ephemeris_provider: 'ssb',
          ephemeris_coverage: [15020, 88128.999988],
          precision: 'P0',
          asset_tier: 'S',
          content_ref: 'content/sun.json',
          sources: ['jpl-de440', 'iau'],
        },
      ],
    };
    expect(validateCatalog(sample)).toBe(true);
  });

  it('accepts a body with null ephemeris_coverage', () => {
    const sample = {
      schema_version: '1.0.0',
      meta: { snapshot_date: '2026-07-16', source_versions: [] },
      bodies: [
        {
          body_id: 0,
          type: 'asteroid',
          name_zh: '测试小行星',
          name_en: 'Test Asteroid',
          aliases: [],
          mean_radius_km: 1.0,
          ephemeris_provider: 'mean_elements',
          ephemeris_coverage: null,
          precision: 'P3',
          asset_tier: 'C',
          sources: [],
        },
      ],
    };
    expect(validateCatalog(sample)).toBe(true);
  });

  it('rejects a body missing required field mean_radius_km', () => {
    const sample = {
      schema_version: '1.0.0',
      meta: { snapshot_date: '2026-07-16', source_versions: [] },
      bodies: [
        {
          body_id: 1,
          type: 'planet',
          name_zh: '水星',
          name_en: 'Mercury',
          aliases: [],
          ephemeris_provider: 'de440',
          precision: 'P1',
          asset_tier: 'A',
          sources: [],
        },
      ],
    };
    expect(validateCatalog(sample)).toBe(false);
  });

  it('rejects invalid precision enum', () => {
    const sample = {
      schema_version: '1.0.0',
      meta: { snapshot_date: '2026-07-16', source_versions: [] },
      bodies: [
        {
          body_id: 1,
          type: 'planet',
          name_zh: '水星',
          name_en: 'Mercury',
          aliases: [],
          mean_radius_km: 2439.7,
          ephemeris_provider: 'de440',
          precision: 'P9',
          asset_tier: 'A',
          sources: [],
        },
      ],
    };
    expect(validateCatalog(sample)).toBe(false);
  });
});

describe('manifestSchema', () => {
  it('accepts a valid manifest entry', () => {
    const sample = {
      schema_version: '1.0.0',
      package_id: 'earth-base',
      package_version: '1.0.0',
      entries: [
        {
          logical_id: 'earth/albedo_ktx2',
          file_path: 'earth/albedo.ktx2',
          package_id: 'earth-base',
          version: '1.0.0',
          size_bytes: 4194304,
          sha256: 'a'.repeat(64),
          mime: 'image/ktx2',
          dependencies: [],
          quality_tier: 'S',
          applicable_backend: 'both',
          decode: 'ktx2',
          gpu_estimated_memory_mb: 64,
          source_ref: 'data-src/earth/blue-marble.tif',
        },
      ],
    };
    expect(validateManifest(sample)).toBe(true);
  });

  it('rejects invalid sha256 pattern', () => {
    const sample = {
      schema_version: '1.0.0',
      package_id: 'earth-base',
      package_version: '1.0.0',
      entries: [
        {
          logical_id: 'earth/albedo',
          file_path: 'earth/albedo.ktx2',
          package_id: 'earth-base',
          version: '1.0.0',
          size_bytes: 100,
          sha256: 'too-short',
          mime: 'image/ktx2',
          dependencies: [],
          quality_tier: 'Base',
          applicable_backend: 'both',
          decode: 'ktx2',
          gpu_estimated_memory_mb: 64,
          source_ref: 'data-src/earth/blue-marble.tif',
        },
      ],
    };
    expect(validateManifest(sample)).toBe(false);
  });

  it('rejects invalid applicable_backend', () => {
    const sample = {
      schema_version: '1.0.0',
      package_id: 'earth-base',
      package_version: '1.0.0',
      entries: [
        {
          logical_id: 'earth/albedo',
          file_path: 'earth/albedo.ktx2',
          package_id: 'earth-base',
          version: '1.0.0',
          size_bytes: 100,
          sha256: 'a'.repeat(64),
          mime: 'image/ktx2',
          dependencies: [],
          quality_tier: 'S',
          applicable_backend: 'vulkan',
          decode: 'ktx2',
          gpu_estimated_memory_mb: 64,
          source_ref: 'src',
        },
      ],
    };
    expect(validateManifest(sample)).toBe(false);
  });
});

describe('tourSchema', () => {
  it('accepts a valid tour with preserve time_setting', () => {
    const sample = {
      schema_version: '1.0.0',
      id: 'solar-system-scale',
      title_zh: '太阳系尺度对比',
      description_zh: '展示真实尺度下的太阳系',
      required_packages: ['sun-base', 'planets-base'],
      nodes: [
        {
          id: 'node-1',
          time_setting: 'preserve',
          camera_target: 10,
          camera_position: 'auto',
          camera_look_at: 'target',
          reference_frame: 'HeliocentricInertial',
          duration_seconds: 8,
          easing: 'easeInOut',
          scale_mode: 'real',
          layer_visibility: { starfield: true },
          min_quality: 'standard',
          preload: [],
          text_card_zh: '这是真实比例的太阳系',
        },
      ],
      exit_state: { target: null, scale_mode: 'real', rate: 1 },
    };
    expect(validateTour(sample)).toBe(true);
  });

  it('rejects tour missing exit_state', () => {
    const sample = {
      schema_version: '1.0.0',
      id: 'bad-tour',
      title_zh: '错误巡航',
      nodes: [],
    };
    expect(validateTour(sample)).toBe(false);
  });
});

describe('contentSchema', () => {
  it('accepts a valid content card', () => {
    const sample = {
      schema_version: '1.0.0',
      body_id: 10,
      basic_params: {
        size: '半径 696,340 km',
        mass_or_gm: 'GM = 1.327×10^11 km³/s²',
        density: '1.408 g/cm³',
        gravity: '274 m/s²',
        temperature_range: '光球约 5778 K',
        orbital_period: '不适用',
        rotation_period: '约 25.05 天（赤道）',
        satellite_count: null,
        asset_tier: 'S',
        precision: 'P0',
      },
      sections: [
        {
          key: 'structure',
          title_zh: '内部结构',
          body_zh: '太阳由核心、辐射区、对流区、光球、色球和日冕组成。',
          reality_tier: 'R1',
        },
      ],
      sources: ['nasa-sdo'],
      procedural_appearance_note: null,
    };
    expect(validateContent(sample)).toBe(true);
  });

  it('rejects content with invalid reality_tier', () => {
    const sample = {
      schema_version: '1.0.0',
      body_id: 10,
      basic_params: {
        size: '696340 km',
        asset_tier: 'S',
        precision: 'P0',
      },
      sections: [
        {
          key: 'structure',
          title_zh: '结构',
          body_zh: '内容',
          reality_tier: 'R9',
        },
      ],
      sources: [],
    };
    expect(validateContent(sample)).toBe(false);
  });
});

describe('snapshotSchema', () => {
  it('accepts a valid snapshot', () => {
    const sample = {
      simulation_time_utc: { mjd: 61237, scale: 'Utc', uncertainty: { predicted: false, predicted_delta_t: false } },
      simulation_time_tdb: { mjd: 61237.0, scale: 'Tdb', uncertainty: { predicted: false, predicted_delta_t: false } },
      reference_epoch: 2451545.0,
      bodies: [
        {
          body_id: 10,
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          frame: 'SolarSystemBarycentricInertial',
          orientation: { w: 1, x: 0, y: 0, z: 0 },
          angular_velocity: { x: 0, y: 0, z: 0 },
          illumination: {
            sun_direction: { x: 0, y: 0, z: 1 },
            illuminated_fraction: 1.0,
          },
          precision: 'P0',
          flags: { is_nan_position: false, is_degraded: false, is_predicted_time: false },
        },
      ],
    };
    expect(validateSnapshot(sample)).toBe(true);
  });

  it('rejects snapshot with illuminated_fraction out of range', () => {
    const sample = {
      simulation_time_utc: { mjd: 61237, scale: 'Utc', uncertainty: { predicted: false, predicted_delta_t: false } },
      simulation_time_tdb: { mjd: 61237, scale: 'Tdb', uncertainty: { predicted: false, predicted_delta_t: false } },
      reference_epoch: 2451545.0,
      bodies: [
        {
          body_id: 10,
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          frame: 'SolarSystemBarycentricInertial',
          orientation: { w: 1, x: 0, y: 0, z: 0 },
          angular_velocity: { x: 0, y: 0, z: 0 },
          illumination: { sun_direction: { x: 0, y: 0, z: 1 }, illuminated_fraction: 1.5 },
          precision: 'P0',
          flags: { is_nan_position: false, is_degraded: false, is_predicted_time: false },
        },
      ],
    };
    expect(validateSnapshot(sample)).toBe(false);
  });
});
