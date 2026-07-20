import type { BodyId } from '@solar-system/body-renderers';
import catalogData from './data/catalog.json';

export type BodyType = 'star' | 'planet' | 'satellite' | 'dwarf-planet' | 'asteroid' | 'comet';

export type AssetTier = 'S' | 'A' | 'B' | 'C';

export interface BodyEntry {
  bodyId: BodyId;
  type: BodyType;
  parentBodyId: BodyId | null;
  nameZh: string;
  nameEn: string;
  aliases: string[];
  assetTier: AssetTier;
  radiusKm: number;
}

export interface NavigationResult {
  bodyId: BodyId;
  nameZh: string;
  nameEn: string;
  type: BodyType;
  parentNameZh?: string;
  matchType: 'exact' | 'prefix' | 'pinyin' | 'alias' | 'fuzzy';
  score: number;
}

export interface HierarchyNode {
  body: BodyEntry;
  children: HierarchyNode[];
}

export interface VisibilityState {
  orbitsVisible: boolean;
  labelsVisible: boolean;
}

export interface NavigationService {
  search(query: string): NavigationResult[];
  /**
   * FR-NAV-003：按天体类型、所属系统、尺寸、轨道区域和资产等级筛选。
   *
   * 同时支持自由文本搜索（query）与多维度筛选（filter）。
   * query 为空字符串时仅按 filter 筛选；filter 为 undefined 时退化为全量。
   */
  searchWithFilter?(query: string, filter?: NavigationFilter): NavigationResult[];
  getBody(bodyId: BodyId): BodyEntry | null;
  getParent(bodyId: BodyId): BodyEntry | null;
  getChildren(bodyId: BodyId): BodyEntry[];
  getAncestors(bodyId: BodyId): BodyEntry[];
  getPath(bodyId: BodyId): BodyEntry[];
  getAllBodyIds(): BodyId[];
  getBodiesByType(type: BodyType): BodyEntry[];
  buildHierarchy(rootBodyId?: BodyId | null): HierarchyNode[];
  jumpToParent(bodyId: BodyId): BodyEntry | null;
  listSatellites(bodyId: BodyId): BodyEntry[];
  setOrbitsVisible(bodyIds: BodyId[], visible: boolean): void;
  setLabelsVisible(bodyIds: BodyId[], visible: boolean): void;
  getOrbitsVisible(bodyId: BodyId): boolean;
  getLabelsVisible(bodyId: BodyId): boolean;
  getDirectionToTarget(currentPosition: Vec3d, targetPosition: Vec3d): Vec3d;
  getScreenEdgeIndicator(
    targetPosition: Vec3d,
    cameraForward: Vec3d,
    cameraUp: Vec3d,
    viewportWidth: number,
    viewportHeight: number
  ): ScreenEdgeIndicator | null;
}

/**
 * 轨道区域分类（FR-NAV-003）。
 *
 * 按天体在太阳系中的位置粗分。
 */
export type OrbitalRegion =
  | 'inner'    // 水星/金星/地球/火星及其卫星
  | 'outer'    // 木星/土星/天王星/海王星及其卫星
  | 'dwarf'    // 矮行星（冥王星/谷神星等）
  | 'asteroid-belt'  // 主带小行星
  | 'kuiper-belt'    // 柯伊伯带天体
  | 'comet';   // 彗星

/**
 * 尺寸分类（FR-NAV-003）。
 */
export type SizeClass =
  | 'giant'    // 半径 ≥ 20000 km（气态巨行星）
  | 'large'    // 2000 ≤ r < 20000 km
  | 'medium'   // 500 ≤ r < 2000 km
  | 'small'    // 100 ≤ r < 500 km
  | 'tiny';    // r < 100 km

/**
 * 导航筛选条件（FR-NAV-003）。
 *
 * 所有字段都是可选的；未指定字段不参与筛选。
 * 多值字段（types/systems/...）使用 OR 关系。
 */
export interface NavigationFilter {
  /** 天体类型筛选（如 ['planet', 'satellite']）。 */
  types?: BodyType[];
  /** 所属系统筛选（如 ['sun'] = 直接绕日的天体；['jupiter'] = 木星系）。 */
  systems?: string[];
  /** 尺寸分类筛选。 */
  sizeClasses?: SizeClass[];
  /** 轨道区域筛选。 */
  orbitalRegions?: OrbitalRegion[];
  /** 资产等级筛选（如 ['S', 'A']）。 */
  assetTiers?: AssetTier[];
  /** 父天体 ID 筛选（精确匹配）。 */
  parentBodyIds?: BodyId[];
  /** 半径上限（km）。 */
  maxRadiusKm?: number;
  /** 半径下限（km）。 */
  minRadiusKm?: number;
  /** 结果数量上限，默认 20。 */
  limit?: number;
}

export interface Vec3d {
  x: number;
  y: number;
  z: number;
}

export interface ScreenEdgeIndicator {
  position: { x: number; y: number };
  angle: number;
  visible: boolean;
}

export interface PinyinIndexEntry {
  fullPinyin: string;
  firstLetter: string;
  /** 拼音首字母串（如 "地球" → "dq"），支持 FR-NAV-002 拼音首字母搜索。 */
  pinyinInitials: string;
  bodyId: BodyId;
}

/**
 * 默认天体目录（从 data/catalog.json 加载，修复 E-12：移除 index.ts 硬编码）。
 */
export const SOLAR_SYSTEM_BODIES: BodyEntry[] = catalogData as unknown as BodyEntry[];

/**
 * 中文 → 拼音映射表（修复 E-11：原表以拼音为键但用中文查找，导致 getPinyin 返回中文本身）。
 *
 * 覆盖主要天体（太阳/八大行星/月球/矮行星/主要卫星/小行星/彗星）。
 */
const PINYIN_MAP: Record<string, string> = {
  // 恒星与行星
  '太阳': 'taiyang',
  '水星': 'shuixing',
  '金星': 'jinxing',
  '地球': 'diqiu',
  '火星': 'huoxing',
  '木星': 'muxing',
  '土星': 'tuxing',
  '天王星': 'tianwangxing',
  '海王星': 'haiwangxing',
  '月球': 'yueqiu',
  // 矮行星
  '冥王星': 'mingwangxing',
  '谷神星': 'gushenxing',
  '阋神星': 'xishenxing',
  '鸟神星': 'niaoshenxing',
  '妊神星': 'renshenxing',
  // 火卫
  '火卫一': 'huoweiyi',
  '火卫二': 'huoweier',
  // 木卫
  '木卫一': 'muweiyi',
  '木卫二': 'muweier',
  '木卫三': 'muweisan',
  '木卫四': 'muweisi',
  '木卫五': 'muweiwu',
  '木卫六': 'muweiliu',
  // 土卫
  '土卫一': 'tuweiyi',
  '土卫二': 'tuweier',
  '土卫三': 'tuweisan',
  '土卫四': 'tuweisi',
  '土卫五': 'tuweiwu',
  '土卫六': 'tuweiliu',
  '土卫七': 'tuweiqi',
  '土卫八': 'tuweiba',
  // 天卫
  '天卫一': 'tianweiyi',
  '天卫二': 'tianweier',
  '天卫三': 'tianweisan',
  '天卫四': 'tianweisi',
  '天卫五': 'tianweiwu',
  // 海卫
  '海卫一': 'haiweiyi',
  '海卫二': 'haiweier',
  '海卫三': 'haiweisan',
  '海卫四': 'haiweisi',
  '海卫五': 'haiweiwu',
  '海卫六': 'haiweiliu',
  '海卫七': 'haiweiqi',
  '海卫八': 'haiweiba',
  // 冥卫
  '冥卫一': 'mingweiyi',
  '冥卫二': 'mingweier',
  '冥卫三': 'mingweisan',
  '冥卫四': 'mingweisi',
  '冥卫五': 'mingweiwu',
  // 小行星
  '爱神星': 'aishenxing',
  '贝努': 'beinu',
  '加斯普拉': 'jiasipula',
  '艾达': 'aida',
  '系川': 'xichuan',
  // 彗星
  '哈雷彗星': 'haleihuixing',
  '博雷利彗星': 'boleilihuixing',
  '怀尔德2号彗星': 'huaierde2haohuixing',
  '坦普尔1号彗星': 'tanpuer1haohuixing',
};

/**
 * 单字 → 拼音首字母映射（用于推导拼音首字母串，支持 FR-NAV-002）。
 *
 * 覆盖目录中出现的所有汉字。数字与拉丁字符原样取小写首字符。
 * 未命中时回退为字符本身的小写形式，保证搜索不中断。
 */
const CHAR_INITIAL_MAP: Record<string, string> = {
  // 天体名常用字
  '太': 't', '阳': 'y', '水': 's', '星': 'x', '金': 'j', '地': 'd', '球': 'q',
  '火': 'h', '木': 'm', '土': 't', '天': 't', '王': 'w', '海': 'h', '月': 'y',
  '冥': 'm', '谷': 'g', '神': 's', '阋': 'x', '鸟': 'n', '妊': 'r',
  '卫': 'w', '一': 'y', '二': 'e', '三': 's', '四': 's', '五': 'w', '六': 'l',
  '七': 'q', '八': 'b',
  '爱': 'a', '贝': 'b', '加': 'j', '斯': 's', '普': 'p', '拉': 'l', '艾': 'a',
  '达': 'd', '系': 'x', '川': 'c',
  '哈': 'h', '雷': 'l', '彗': 'h', '博': 'b', '怀': 'h', '尔': 'e', '德': 'd',
  '号': 'h', '坦': 't',
};

/**
 * 提取中文天体名的拼音首字母串。
 * 逐字符查 CHAR_INITIAL_MAP，未命中回退为字符小写。
 * 数字与拉丁字符原样取小写首字符。
 * 例：'地球' → 'dq'，'天王星' → 'twx'，'怀尔德2号彗星' → 'hed2hx'。
 */
function getPinyinInitials(chineseName: string): string {
  let initials = '';
  for (const ch of chineseName) {
    if (CHAR_INITIAL_MAP[ch]) {
      initials += CHAR_INITIAL_MAP[ch];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      initials += ch.toLowerCase();
    } else {
      // 未知汉字：回退为字符小写形式（不会匹配有效查询，但不中断索引构建）
      initials += ch.toLowerCase();
    }
  }
  return initials;
}

export class NavigationServiceImpl implements NavigationService {
  private bodies: Map<BodyId, BodyEntry>;
  private pinyinIndex: PinyinIndexEntry[];
  private recentlyViewed: BodyId[] = [];
  private visibilityStates: Map<BodyId, VisibilityState> = new Map();

  constructor(bodies: BodyEntry[] = SOLAR_SYSTEM_BODIES) {
    this.bodies = new Map();
    for (const body of bodies) {
      this.bodies.set(body.bodyId, body);
      this.visibilityStates.set(body.bodyId, { orbitsVisible: true, labelsVisible: true });
    }
    this.pinyinIndex = this.buildPinyinIndex(bodies);
  }

  private buildPinyinIndex(bodies: BodyEntry[]): PinyinIndexEntry[] {
    const entries: PinyinIndexEntry[] = [];
    for (const body of bodies) {
      const fullPinyin = this.getPinyin(body.nameZh);
      const firstLetter = fullPinyin.charAt(0).toUpperCase();
      const pinyinInitials = getPinyinInitials(body.nameZh);
      entries.push({ fullPinyin, firstLetter, pinyinInitials, bodyId: body.bodyId });
    }
    return entries;
  }

  /**
   * 返回中文天体名的真实拼音（修复 E-11：原实现返回中文本身）。
   * 未命中映射表时回退为小写英文名，保证索引可被搜索。
   */
  getPinyin(chineseName: string): string {
    return PINYIN_MAP[chineseName] ?? chineseName.toLowerCase();
  }

  search(query: string): NavigationResult[] {
    // 修复 E-11：去除所有空格，使 "mu xing" → "muxing" 能命中"木星"
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, '');
    const results: NavigationResult[] = [];

    for (const body of this.bodies.values()) {
      const parent = body.parentBodyId ? this.bodies.get(body.parentBodyId) : null;
      let matchType: NavigationResult['matchType'] = 'fuzzy';
      let score = 0;

      const normalizedNameZh = body.nameZh;
      const normalizedNameEn = body.nameEn.toLowerCase();

      // 编号命中（bodyId 字符串匹配，如 "599" 或 "1P"）
      const bodyIdStr = String(body.bodyId).toLowerCase();
      if (bodyIdStr === normalizedQuery) {
        matchType = 'exact';
        score = 100;
      } else if (normalizedNameZh === normalizedQuery) {
        matchType = 'exact';
        score = 100;
      } else if (normalizedNameEn === normalizedQuery) {
        matchType = 'exact';
        score = 95;
      } else if (normalizedNameZh.startsWith(normalizedQuery)) {
        matchType = 'prefix';
        score = 90;
      } else if (normalizedNameEn.startsWith(normalizedQuery)) {
        matchType = 'prefix';
        score = 85;
      } else if (body.aliases.some((alias) => alias.toLowerCase() === normalizedQuery)) {
        matchType = 'alias';
        score = 80;
      } else if (body.aliases.some((alias) => alias.toLowerCase().startsWith(normalizedQuery))) {
        matchType = 'alias';
        score = 75;
      } else if (normalizedNameZh.includes(normalizedQuery) || normalizedNameEn.includes(normalizedQuery)) {
        matchType = 'fuzzy';
        score = 50;
      } else {
        const pinyinEntry = this.pinyinIndex.find((e) => e.bodyId === body.bodyId);
        if (
          pinyinEntry &&
          (pinyinEntry.fullPinyin.includes(normalizedQuery) ||
            pinyinEntry.firstLetter.toLowerCase() === normalizedQuery ||
            pinyinEntry.pinyinInitials.includes(normalizedQuery) ||
            pinyinEntry.pinyinInitials.startsWith(normalizedQuery))
        ) {
          matchType = 'pinyin';
          score = 40;
        }
      }

      if (score > 0) {
        if (this.recentlyViewed.includes(body.bodyId)) {
          score += 10;
        }
        if (body.assetTier === 'S') {
          score += 5;
        }
        if (body.type === 'planet') {
          score += 3;
        }

        results.push({
          bodyId: body.bodyId,
          nameZh: body.nameZh,
          nameEn: body.nameEn,
          type: body.type,
          parentNameZh: parent?.nameZh,
          matchType,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 20);
  }

  /**
   * FR-NAV-003：按天体类型、所属系统、尺寸、轨道区域和资产等级筛选。
   *
   * 实现策略：
   * 1. 若 query 非空，先调用 search(query) 得到候选集合（最多 20 条）
   * 2. 若 query 为空，候选集合为全部 bodies
   * 3. 应用 NavigationFilter 中的每个字段（types/systems/sizeClasses/...）
   * 4. 按 score 降序，截取 filter.limit（默认 50）
   *
   * 注意：filter 中所有字段为 AND 关系；同一字段内多值为 OR 关系。
   */
  searchWithFilter(query: string, filter?: NavigationFilter): NavigationResult[] {
    // 1. 候选集合
    let candidates: NavigationResult[];
    if (query && query.trim().length > 0) {
      candidates = this.search(query);
    } else {
      // 空 query：全量候选，分数统一为 0
      candidates = [];
      for (const body of this.bodies.values()) {
        const parent = body.parentBodyId ? this.bodies.get(body.parentBodyId) : null;
        candidates.push({
          bodyId: body.bodyId,
          nameZh: body.nameZh,
          nameEn: body.nameEn,
          type: body.type,
          parentNameZh: parent?.nameZh,
          matchType: 'fuzzy',
          score: 0,
        });
      }
    }

    if (!filter) {
      return candidates.slice(0, 20);
    }

    // 2. 应用筛选
    const filtered = candidates.filter((r) => {
      const body = this.bodies.get(r.bodyId);
      if (!body) return false;

      // 类型筛选
      if (filter.types && filter.types.length > 0) {
        if (!filter.types.includes(body.type)) return false;
      }

      // 资产等级筛选
      if (filter.assetTiers && filter.assetTiers.length > 0) {
        if (!filter.assetTiers.includes(body.assetTier)) return false;
      }

      // 父天体 ID 筛选
      if (filter.parentBodyIds && filter.parentBodyIds.length > 0) {
        if (body.parentBodyId === null || !filter.parentBodyIds.includes(body.parentBodyId)) {
          return false;
        }
      }

      // 半径范围筛选
      if (filter.minRadiusKm !== undefined && body.radiusKm < filter.minRadiusKm) {
        return false;
      }
      if (filter.maxRadiusKm !== undefined && body.radiusKm > filter.maxRadiusKm) {
        return false;
      }

      // 尺寸分类筛选
      if (filter.sizeClasses && filter.sizeClasses.length > 0) {
        const sizeClass = this.classifySize(body.radiusKm);
        if (!filter.sizeClasses.includes(sizeClass)) return false;
      }

      // 所属系统筛选（按母星英文名小写匹配）
      if (filter.systems && filter.systems.length > 0) {
        const parent = body.parentBodyId ? this.bodies.get(body.parentBodyId) : null;
        const systemName = parent ? parent.nameEn.toLowerCase() : 'sun';
        // 顶层天体（绕日）属于 'sun' 系统
        const systemKey = body.parentBodyId === null ? 'sun' : systemName;
        if (!filter.systems.includes(systemKey)) return false;
      }

      // 轨道区域筛选
      if (filter.orbitalRegions && filter.orbitalRegions.length > 0) {
        const region = this.classifyOrbitalRegion(body);
        if (!filter.orbitalRegions.includes(region)) return false;
      }

      return true;
    });

    // 3. 排序与截断
    filtered.sort((a, b) => b.score - a.score);
    const limit = filter.limit ?? 50;
    return filtered.slice(0, limit);
  }

  /**
   * 根据半径分类尺寸（FR-NAV-003）。
   *
   * - giant: ≥ 20000 km（气态巨行星）
   * - large: 2000 ≤ r < 20000 km
   * - medium: 500 ≤ r < 2000 km
   * - small: 100 ≤ r < 500 km
   * - tiny: r < 100 km
   */
  private classifySize(radiusKm: number): SizeClass {
    if (radiusKm >= 20000) return 'giant';
    if (radiusKm >= 2000) return 'large';
    if (radiusKm >= 500) return 'medium';
    if (radiusKm >= 100) return 'small';
    return 'tiny';
  }

  /**
   * 根据天体类型与母星分类轨道区域（FR-NAV-003）。
   *
   * - inner: 水星/金星/地球/火星及其卫星
   * - outer: 木星/土星/天王星/海王星及其卫星
   * - dwarf: 矮行星
   * - asteroid-belt: 主带小行星
   * - kuiper-belt: 柯伊伯带天体
   * - comet: 彗星
   */
  private classifyOrbitalRegion(body: BodyEntry): OrbitalRegion {
    if (body.type === 'comet') return 'comet';
    if (body.type === 'asteroid') return 'asteroid-belt';
    if (body.type === 'dwarf-planet') return 'dwarf';

    // 行星与卫星按母星区域分
    const parent = body.parentBodyId ? this.bodies.get(body.parentBodyId) : null;
    if (body.type === 'planet') {
      // bodyId 199/299/399/499 = 内行星；599/699/799/899 = 外行星
      if ([199, 299, 399, 499].includes(body.bodyId as number)) return 'inner';
      if ([599, 699, 799, 899].includes(body.bodyId as number)) return 'outer';
    }
    if (body.type === 'satellite' && parent) {
      // 通过母星判断
      if ([199, 299, 399, 499].includes(parent.bodyId as number)) return 'inner';
      if ([599, 699, 799, 899].includes(parent.bodyId as number)) return 'outer';
      if (parent.bodyId === 134340) return 'dwarf';
    }
    return 'inner';
  }

  getBody(bodyId: BodyId): BodyEntry | null {
    return this.bodies.get(bodyId) || null;
  }

  getParent(bodyId: BodyId): BodyEntry | null {
    const body = this.bodies.get(bodyId);
    if (!body || !body.parentBodyId) return null;
    return this.bodies.get(body.parentBodyId) || null;
  }

  getChildren(bodyId: BodyId): BodyEntry[] {
    const children: BodyEntry[] = [];
    for (const body of this.bodies.values()) {
      if (body.parentBodyId === bodyId) {
        children.push(body);
      }
    }
    children.sort((a, b) => b.radiusKm - a.radiusKm);
    return children;
  }

  getAncestors(bodyId: BodyId): BodyEntry[] {
    const ancestors: BodyEntry[] = [];
    let current = this.bodies.get(bodyId);
    while (current && current.parentBodyId) {
      const parent = this.bodies.get(current.parentBodyId);
      if (parent) {
        ancestors.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }
    return ancestors;
  }

  getPath(bodyId: BodyId): BodyEntry[] {
    const ancestors = this.getAncestors(bodyId);
    const body = this.bodies.get(bodyId);
    if (body) {
      return [...ancestors, body];
    }
    return ancestors;
  }

  getAllBodyIds(): BodyId[] {
    return Array.from(this.bodies.keys());
  }

  getBodiesByType(type: BodyType): BodyEntry[] {
    const result: BodyEntry[] = [];
    for (const body of this.bodies.values()) {
      if (body.type === type) {
        result.push(body);
      }
    }
    return result;
  }

  /**
   * 构建层级树（修复 E-12 / 任务 T-P2-20）。
   *
   * 不传 rootBodyId 时返回所有顶层天体（parentBodyId 为 null）作为根节点。
   * 传入 rootBodyId 时返回以该天体为根的子树。
   */
  buildHierarchy(rootBodyId?: BodyId | null): HierarchyNode[] {
    const buildNode = (bodyId: BodyId): HierarchyNode | null => {
      const body = this.bodies.get(bodyId);
      if (!body) return null;
      const children = this.getChildren(bodyId);
      return {
        body,
        children: children
          .map((c) => buildNode(c.bodyId))
          .filter((n): n is HierarchyNode => n !== null),
      };
    };

    if (rootBodyId === undefined) {
      const roots: HierarchyNode[] = [];
      for (const body of this.bodies.values()) {
        if (body.parentBodyId === null) {
          const node = buildNode(body.bodyId);
          if (node) roots.push(node);
        }
      }
      return roots;
    }

    if (rootBodyId === null) {
      return this.buildHierarchy(undefined);
    }

    const node = buildNode(rootBodyId);
    return node ? [node] : [];
  }

  /**
   * 跳转到指定天体的父天体（修复 E-12 / 任务 T-P2-20）。
   * 同时标记父天体为最近浏览，返回父天体条目；无父天体时返回 null。
   */
  jumpToParent(bodyId: BodyId): BodyEntry | null {
    const parent = this.getParent(bodyId);
    if (parent) {
      this.markAsViewed(parent.bodyId);
    }
    return parent;
  }

  /**
   * 列出指定天体的所有卫星（即 type 为 satellite 的直接子节点）。
   */
  listSatellites(bodyId: BodyId): BodyEntry[] {
    return this.getChildren(bodyId).filter((b) => b.type === 'satellite');
  }

  /**
   * 批量设置轨道可见性（修复 E-12 / 任务 T-P2-20）。
   */
  setOrbitsVisible(bodyIds: BodyId[], visible: boolean): void {
    for (const id of bodyIds) {
      const state = this.visibilityStates.get(id);
      if (state) {
        state.orbitsVisible = visible;
      } else if (visible) {
        this.visibilityStates.set(id, { orbitsVisible: visible, labelsVisible: true });
      }
    }
  }

  /**
   * 批量设置标签可见性（修复 E-12 / 任务 T-P2-20）。
   */
  setLabelsVisible(bodyIds: BodyId[], visible: boolean): void {
    for (const id of bodyIds) {
      const state = this.visibilityStates.get(id);
      if (state) {
        state.labelsVisible = visible;
      } else if (visible) {
        this.visibilityStates.set(id, { orbitsVisible: true, labelsVisible: visible });
      }
    }
  }

  getOrbitsVisible(bodyId: BodyId): boolean {
    return this.visibilityStates.get(bodyId)?.orbitsVisible ?? true;
  }

  getLabelsVisible(bodyId: BodyId): boolean {
    return this.visibilityStates.get(bodyId)?.labelsVisible ?? true;
  }

  markAsViewed(bodyId: BodyId): void {
    const index = this.recentlyViewed.indexOf(bodyId);
    if (index !== -1) {
      this.recentlyViewed.splice(index, 1);
    }
    this.recentlyViewed.unshift(bodyId);
    if (this.recentlyViewed.length > 10) {
      this.recentlyViewed.pop();
    }
  }

  getRecentlyViewed(): BodyEntry[] {
    return this.recentlyViewed.map((id) => this.bodies.get(id)).filter(Boolean) as BodyEntry[];
  }

  getDirectionToTarget(currentPosition: Vec3d, targetPosition: Vec3d): Vec3d {
    const dx = targetPosition.x - currentPosition.x;
    const dy = targetPosition.y - currentPosition.y;
    const dz = targetPosition.z - currentPosition.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-10) {
      return { x: 0, y: 0, z: 0 };
    }

    return { x: dx / length, y: dy / length, z: dz / length };
  }

  getScreenEdgeIndicator(
    targetPosition: Vec3d,
    cameraForward: Vec3d,
    cameraUp: Vec3d,
    viewportWidth: number,
    viewportHeight: number
  ): ScreenEdgeIndicator | null {
    const dot =
      targetPosition.x * cameraForward.x +
      targetPosition.y * cameraForward.y +
      targetPosition.z * cameraForward.z;

    if (dot > 0) {
      return null;
    }

    const rightX = cameraForward.y * cameraUp.z - cameraForward.z * cameraUp.y;
    const rightY = cameraForward.z * cameraUp.x - cameraForward.x * cameraUp.z;
    const rightZ = cameraForward.x * cameraUp.y - cameraForward.y * cameraUp.x;

    const rightLength = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
    if (rightLength < 1e-10) {
      return null;
    }

    const rightNormX = rightX / rightLength;
    const rightNormY = rightY / rightLength;
    const rightNormZ = rightZ / rightLength;

    const targetLength = Math.sqrt(
      targetPosition.x * targetPosition.x +
        targetPosition.y * targetPosition.y +
        targetPosition.z * targetPosition.z
    );

    if (targetLength < 1e-10) {
      return null;
    }

    const targetNormX = targetPosition.x / targetLength;
    const targetNormY = targetPosition.y / targetLength;
    const targetNormZ = targetPosition.z / targetLength;

    const screenX = targetNormX * rightNormX + targetNormY * rightNormY + targetNormZ * rightNormZ;
    const screenY = targetNormX * cameraUp.x + targetNormY * cameraUp.y + targetNormZ * cameraUp.z;

    const angle = Math.atan2(screenY, screenX);
    const halfWidth = viewportWidth / 2;
    const halfHeight = viewportHeight / 2;

    let x: number, y: number;
    const tanAngle = Math.tan(angle);
    const aspect = viewportWidth / viewportHeight;

    if (Math.abs(tanAngle) < aspect) {
      x = halfWidth * Math.sign(screenX);
      y = x * tanAngle;
    } else {
      y = halfHeight * Math.sign(screenY);
      x = y / tanAngle;
    }

    x = Math.max(-halfWidth + 20, Math.min(halfWidth - 20, x));
    y = Math.max(-halfHeight + 20, Math.min(halfHeight - 20, y));

    return {
      position: { x: x + halfWidth, y: halfHeight - y },
      angle: angle + Math.PI / 2,
      visible: true,
    };
  }
}

export const createNavigationService = (bodies?: BodyEntry[]): NavigationService => {
  return new NavigationServiceImpl(bodies);
};
