/**
 * 真实 catalog.json 校验测试（任务 T-P0-13 / 修复 E-31/E-12）。
 *
 * 用真实 catalog.json（由 catalog-pipeline 在 data-src/normalized/catalog.json 生成）
 * 进行结构性校验，并断言 bodies ≥ 290。
 *
 * 注意：
 * - catalog.json 可能尚未生成（catalog-pipeline 在 Wave 2 才会产出）。
 *   在文件不存在时，本真实校验套件整体 skip，避免阻塞 CI。
 * - 真实 catalog.json 的字段结构（name_cn / radius_km / parent_id 等）由
 *   catalog-pipeline 生成，与 catalogSchema（name_zh / mean_radius_km / precision /
 *   sources 等）当前为两套并存的表示。catalogSchema 的 oneOf body_id 声明本身
 *   由下方独立 describe 块覆盖，此处仅对真实文件做结构 + 数量校验。
 */
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogSchema } from '../schemas.js';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validateCatalog = ajv.compile(catalogSchema);

// 真实 catalog.json 路径（catalog-pipeline 生成位置：data-src/normalized/catalog.json）。
const __filename_test = fileURLToPath(import.meta.url);
const __dirname_test = path.dirname(__filename_test);
const REAL_CATALOG_PATH = path.resolve(
  __dirname_test,
  '../../../../data-src/normalized/catalog.json'
);

const realCatalogExists = fs.existsSync(REAL_CATALOG_PATH);

interface RealCatalogBody {
  body_id: number | string;
  name_cn: string;
  name_en: string;
  type: string;
  parent_id: number;
  radius_km: number;
  semi_major: number;
  eccentricity: number;
  asset_tier: string;
  [key: string]: unknown;
}

interface RealCatalog {
  schema?: string;
  version?: string;
  generated?: string;
  total?: number;
  type_counts?: Record<string, number>;
  bodies: RealCatalogBody[];
}

function loadRealCatalog(): RealCatalog {
  const raw = fs.readFileSync(REAL_CATALOG_PATH, 'utf-8');
  return JSON.parse(raw) as RealCatalog;
}

// 在真实 catalog.json 不存在时整体 skip，避免阻塞 CI。
describe.skipIf(!realCatalogExists)('真实 catalog.json 校验（data-src/normalized/catalog.json）', () => {
  it('catalog.json 含 ≥ 290 个 body', () => {
    const catalog = loadRealCatalog();
    expect(catalog.bodies.length).toBeGreaterThanOrEqual(290);
  });

  it('catalog.json total 字段与 bodies 数量一致', () => {
    const catalog = loadRealCatalog();
    expect(catalog.total).toBe(catalog.bodies.length);
  });

  it('catalog.json 顶层字段（schema/version/generated/bodies）存在', () => {
    const catalog = loadRealCatalog();
    expect(typeof catalog.schema).toBe('string');
    expect(typeof catalog.version).toBe('string');
    expect(typeof catalog.generated).toBe('string');
    expect(Array.isArray(catalog.bodies)).toBe(true);
  });

  it('catalog.json 每个 body 含必需字段（body_id/type/name_cn/name_en/radius_km）', () => {
    const catalog = loadRealCatalog();
    for (const body of catalog.bodies) {
      expect(body.body_id, JSON.stringify(body)).toBeDefined();
      expect(body.type, JSON.stringify(body)).toBeDefined();
      expect(body.name_cn, JSON.stringify(body)).toBeDefined();
      expect(body.name_en, JSON.stringify(body)).toBeDefined();
      expect(typeof body.radius_km, JSON.stringify(body)).toBe('number');
      expect(typeof body.asset_tier, JSON.stringify(body)).toBe('string');
    }
  });

  it('catalog.json body_id 全部唯一', () => {
    const catalog = loadRealCatalog();
    const seen = new Set<string>();
    for (const body of catalog.bodies) {
      const key = String(body.body_id);
      expect(seen.has(key), `duplicate body_id=${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('catalog.json 支持 integer body_id（含星体与多数天体）', () => {
    const catalog = loadRealCatalog();
    const numericIds = catalog.bodies.filter((b) => typeof b.body_id === 'number');
    expect(numericIds.length).toBeGreaterThan(0);
  });

  it('catalog.json 支持彗星编号 body_id（字符串，匹配 ^[0-9]+[A-Z]$）', () => {
    const catalog = loadRealCatalog();
    const stringIds = catalog.bodies.filter((b) => typeof b.body_id === 'string');
    expect(stringIds.length).toBeGreaterThan(0);
    for (const body of stringIds) {
      expect(String(body.body_id)).toMatch(/^[0-9]+[A-Z]$/);
    }
  });

  it('catalog.json type_counts 与 bodies 实际类型分布一致', () => {
    const catalog = loadRealCatalog();
    const actualCounts: Record<string, number> = {};
    for (const body of catalog.bodies) {
      actualCounts[body.type] = (actualCounts[body.type] ?? 0) + 1;
    }
    expect(catalog.type_counts).toBeDefined();
    for (const [type, count] of Object.entries(catalog.type_counts!)) {
      expect(actualCounts[type], `type=${type}`).toBe(count);
    }
  });
});

// catalogSchema 的 oneOf body_id 声明（不依赖真实 catalog.json，恒执行）。
describe('catalogSchema 彗星编号 oneOf 声明', () => {
  it('catalogSchema.bodies.items.properties.body_id 使用 oneOf 接受 integer 与 string', () => {
    const bodyIdSchema = (catalogSchema as unknown as {
      properties: {
        bodies: {
          items: {
            properties: {
              body_id: { oneOf?: unknown[] };
            };
          };
        };
      };
    }).properties.bodies.items.properties.body_id;
    expect(bodyIdSchema.oneOf).toBeDefined();
    expect(Array.isArray(bodyIdSchema.oneOf)).toBe(true);
    expect(bodyIdSchema.oneOf!.length).toBe(2);
  });

  it('catalogSchema 接受 body_id 为 integer 0（最小有效值）', () => {
    const sample = {
      schema_version: '1.0.0',
      meta: { snapshot_date: '2026-07-16', source_versions: [] },
      bodies: [
        {
          body_id: 0,
          type: 'asteroid',
          name_zh: '测试',
          name_en: 'Test',
          aliases: [],
          mean_radius_km: 1.0,
          ephemeris_provider: 'mean_elements',
          precision: 'P3',
          asset_tier: 'C',
          sources: [],
        },
      ],
    };
    expect(validateCatalog(sample)).toBe(true);
  });

  it('catalogSchema 接受 body_id 为彗星编号字符串 "1P"', () => {
    const sample = {
      schema_version: '1.0.0',
      meta: { snapshot_date: '2026-07-16', source_versions: [] },
      bodies: [
        {
          body_id: '1P',
          type: 'comet',
          name_zh: '哈雷彗星',
          name_en: 'Halley',
          aliases: [],
          mean_radius_km: 11,
          ephemeris_provider: 'mean_elements',
          precision: 'P3',
          asset_tier: 'A',
          sources: [],
        },
      ],
    };
    expect(validateCatalog(sample)).toBe(true);
  });

  it('catalogSchema 拒绝无效的字符串 body_id（"P1"，未匹配 ^[0-9]+[A-Z]$）', () => {
    const sample = {
      schema_version: '1.0.0',
      meta: { snapshot_date: '2026-07-16', source_versions: [] },
      bodies: [
        {
          body_id: 'P1',
          type: 'comet',
          name_zh: '无效',
          name_en: 'Invalid',
          aliases: [],
          mean_radius_km: 1,
          ephemeris_provider: 'mean_elements',
          precision: 'P3',
          asset_tier: 'A',
          sources: [],
        },
      ],
    };
    expect(validateCatalog(sample)).toBe(false);
  });
});
