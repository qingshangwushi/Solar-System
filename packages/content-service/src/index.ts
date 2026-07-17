import type { BodyId, AssetTier } from '@solar-system/body-renderers';
import contentData from './data/content.json';

export type RealityTier = 'R1' | 'R2' | 'R3' | 'R4';

export type PrecisionLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface BasicParams {
  size: string;
  massOrGm?: string;
  density?: string;
  gravity?: string;
  temperatureRange?: string;
  orbitalPeriod: string;
  rotationPeriod: string;
  satelliteCount?: string | null;
  assetTier: AssetTier;
  precision: PrecisionLevel;
}

export interface ContentSection {
  key: string;
  titleZh: string;
  bodyZh: string;
  realityTier: RealityTier;
}

export interface ContentCard {
  bodyId: BodyId;
  basicParams: BasicParams;
  sections: ContentSection[];
  sources: string[];
  proceduralAppearanceNote?: string | null;
}

export interface ContentService {
  getContent(bodyId: BodyId): ContentCard | null;
  getAllBodyIds(): BodyId[];
  search(query: string): BodyId[];
  getRealityTierDescription(tier: RealityTier): string;
  getPrecisionDescription(precision: PrecisionLevel): string;
}

export const REALITY_TIER_DESCRIPTIONS: Record<RealityTier, string> = {
  R1: '确定性计算或可重复几何结果',
  R2: '公开观测数据或处理后的观测数据',
  R3: '科学模型和统计推演',
  R4: '为提升观感加入的影视增强',
};

export const PRECISION_DESCRIPTIONS: Record<PrecisionLevel, string> = {
  P0: '数据不足，仅显示目录信息',
  P1: '平均轨道根数或低精度拟合',
  P2: '有限时间段数值星历或较完整摄动模型',
  P3: '高精度星历，适合科学模式',
  P4: '核心天体高精度星历，经过基准对照验证',
};

/**
 * 默认科普内容数据（修复 T-P2-19：内容抽离为 src/data/content.json）。
 *
 * 包含 S/A 等级天体内容，每个条目均带非空 proceduralAppearanceNote，
 * 用于程序化外观生成的备注说明。
 */
export const DEFAULT_CONTENT_DATA: Record<BodyId, ContentCard> =
  contentData as unknown as Record<BodyId, ContentCard>;

export class ContentServiceImpl implements ContentService {
  private contentData: Record<BodyId, ContentCard>;

  constructor(data?: Record<BodyId, ContentCard>) {
    this.contentData = data || DEFAULT_CONTENT_DATA;
  }

  getContent(bodyId: BodyId): ContentCard | null {
    return this.contentData[bodyId] || null;
  }

  getAllBodyIds(): BodyId[] {
    // BodyId 可能是 number 或 string（彗星编号）。JSON 对象键统一为 string，
    // 这里把纯数字键还原为 number，彗星编号（"1P" 等）保持字符串。
    return Object.keys(this.contentData).map((key) =>
      /^[0-9]+$/.test(key) ? Number(key) : key,
    ) as BodyId[];
  }

  search(query: string): BodyId[] {
    const normalizedQuery = query.toLowerCase().trim();
    const results: BodyId[] = [];

    for (const [bodyId, content] of Object.entries(this.contentData)) {
      const sections = content.sections;

      for (const section of sections) {
        if (
          section.titleZh.toLowerCase().includes(normalizedQuery) ||
          section.bodyZh.toLowerCase().includes(normalizedQuery)
        ) {
          results.push(bodyId as BodyId);
          break;
        }
      }
    }

    return results;
  }

  getRealityTierDescription(tier: RealityTier): string {
    return REALITY_TIER_DESCRIPTIONS[tier] || '未知等级';
  }

  getPrecisionDescription(precision: PrecisionLevel): string {
    return PRECISION_DESCRIPTIONS[precision] || '未知精度';
  }

  addContent(content: ContentCard): void {
    this.contentData[content.bodyId] = content;
  }

  removeContent(bodyId: BodyId): void {
    delete this.contentData[bodyId];
  }
}

export const createContentService = (data?: Record<BodyId, ContentCard>): ContentService => {
  return new ContentServiceImpl(data);
};
