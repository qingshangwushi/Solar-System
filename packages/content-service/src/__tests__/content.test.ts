/**
 * ContentService 测试（任务 T-P2-19：A/S 等级天体内容 + 程序化示意外观）。
 *
 * 覆盖：
 * - DEFAULT_CONTENT_DATA 从 content.json 加载
 * - getContent / getAllBodyIds / search
 * - getRealityTierDescription / getPrecisionDescription
 * - addContent / removeContent
 * - 每个条目均含非空 proceduralAppearanceNote
 * - 构造支持自定义数据
 */
import { describe, it, expect } from 'vitest';
import {
  ContentServiceImpl,
  DEFAULT_CONTENT_DATA,
  REALITY_TIER_DESCRIPTIONS,
  PRECISION_DESCRIPTIONS,
  createContentService,
  type ContentCard,
  type RealityTier,
  type PrecisionLevel,
} from '../index.js';

describe('DEFAULT_CONTENT_DATA - 数据加载', () => {
  it('从 content.json 加载并包含多个天体', () => {
    const ids = Object.keys(DEFAULT_CONTENT_DATA);
    expect(ids.length).toBeGreaterThanOrEqual(10);
  });

  it('包含太阳（bodyId=10）', () => {
    expect(DEFAULT_CONTENT_DATA[10]).toBeDefined();
    expect(DEFAULT_CONTENT_DATA[10]!.basicParams.assetTier).toBe('S');
  });

  it('包含月球（bodyId=301）', () => {
    expect(DEFAULT_CONTENT_DATA[301]).toBeDefined();
    expect(DEFAULT_CONTENT_DATA[301]!.basicParams.size).toContain('1,737');
  });

  it('每个条目都含非空 proceduralAppearanceNote（A/S 等级）', () => {
    for (const [id, card] of Object.entries(DEFAULT_CONTENT_DATA)) {
      expect(
        card.proceduralAppearanceNote,
        `bodyId=${id} 应有非空 proceduralAppearanceNote`
      ).toBeTruthy();
      expect(typeof card.proceduralAppearanceNote).toBe('string');
      expect(card.proceduralAppearanceNote!.length).toBeGreaterThan(0);
    }
  });

  it('每个条目都含至少一个 section', () => {
    for (const [id, card] of Object.entries(DEFAULT_CONTENT_DATA)) {
      expect(
        card.sections.length,
        `bodyId=${id} 应有至少一个 section`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('每个条目的 basicParams 含 size 与 assetTier', () => {
    for (const [id, card] of Object.entries(DEFAULT_CONTENT_DATA)) {
      expect(card.basicParams.size.length, `bodyId=${id} size 应非空`).toBeGreaterThan(0);
      expect(['S', 'A', 'B', 'C']).toContain(card.basicParams.assetTier);
    }
  });
});

describe('ContentServiceImpl - getContent / getAllBodyIds', () => {
  const svc = new ContentServiceImpl();

  it('getContent 返回已知天体', () => {
    const sun = svc.getContent(10);
    expect(sun).not.toBeNull();
    expect(sun!.bodyId).toBe(10);
    expect(sun!.basicParams.assetTier).toBe('S');
  });

  it('getContent 对未知 bodyId 返回 null', () => {
    expect(svc.getContent(9999999)).toBeNull();
  });

  it('getAllBodyIds 返回所有 bodyId', () => {
    const ids = svc.getAllBodyIds();
    expect(ids.length).toBeGreaterThanOrEqual(10);
    expect(ids).toContain(10);
    expect(ids).toContain(301);
  });
});

describe('ContentServiceImpl - search', () => {
  const svc = new ContentServiceImpl();

  it('search 按中文关键词返回匹配的 bodyId', () => {
    const results = svc.search('大气');
    expect(results.length).toBeGreaterThan(0);
  });

  it('search 关键词无匹配时返回空数组', () => {
    const results = svc.search('zzz不存在的关键词zzz');
    expect(results).toEqual([]);
  });
});

describe('ContentServiceImpl - 等级与精度描述', () => {
  it('getRealityTierDescription 返回所有等级描述', () => {
    const tiers: RealityTier[] = ['R1', 'R2', 'R3', 'R4'];
    for (const tier of tiers) {
      const desc = new ContentServiceImpl().getRealityTierDescription(tier);
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it('getPrecisionDescription 返回所有精度描述', () => {
    const levels: PrecisionLevel[] = ['P0', 'P1', 'P2', 'P3', 'P4'];
    for (const level of levels) {
      const desc = new ContentServiceImpl().getPrecisionDescription(level);
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it('REALITY_TIER_DESCRIPTIONS 包含 R1-R4 四个等级', () => {
    expect(Object.keys(REALITY_TIER_DESCRIPTIONS).sort()).toEqual(['R1', 'R2', 'R3', 'R4']);
  });

  it('PRECISION_DESCRIPTIONS 包含 P0-P4 五个等级', () => {
    expect(Object.keys(PRECISION_DESCRIPTIONS).sort()).toEqual(['P0', 'P1', 'P2', 'P3', 'P4']);
  });
});

describe('ContentServiceImpl - 自定义数据与 CRUD', () => {
  it('构造支持自定义数据', () => {
    const custom: Record<number, ContentCard> = {
      999: {
        bodyId: 999,
        basicParams: {
          size: '测试',
          orbitalPeriod: '1 天',
          rotationPeriod: '1 天',
          assetTier: 'C',
          precision: 'P3',
        },
        sections: [],
        sources: [],
        proceduralAppearanceNote: '测试备注',
      },
    };
    const svc = new ContentServiceImpl(custom);
    expect(svc.getContent(999)).not.toBeNull();
    expect(svc.getContent(10)).toBeNull();
  });

  it('addContent / removeContent 修改数据', () => {
    const svc = new ContentServiceImpl();
    const newCard: ContentCard = {
      bodyId: 8888,
      basicParams: {
        size: '新增天体',
        orbitalPeriod: '1 天',
        rotationPeriod: '1 天',
        assetTier: 'C',
        precision: 'P3',
      },
      sections: [],
      sources: [],
    };
    svc.addContent(newCard);
    expect(svc.getContent(8888)).not.toBeNull();
    svc.removeContent(8888);
    expect(svc.getContent(8888)).toBeNull();
  });

  it('createContentService 工厂返回可用实例', () => {
    const svc = createContentService();
    expect(svc.getContent(10)).not.toBeNull();
  });
});
