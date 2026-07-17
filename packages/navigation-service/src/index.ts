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
      entries.push({ fullPinyin, firstLetter, bodyId: body.bodyId });
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
            pinyinEntry.firstLetter.toLowerCase() === normalizedQuery)
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
