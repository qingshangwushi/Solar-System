import type { BodyId } from '@solar-system/body-renderers';

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

export interface NavigationService {
  search(query: string): NavigationResult[];
  getBody(bodyId: BodyId): BodyEntry | null;
  getParent(bodyId: BodyId): BodyEntry | null;
  getChildren(bodyId: BodyId): BodyEntry[];
  getAncestors(bodyId: BodyId): BodyEntry[];
  getPath(bodyId: BodyId): BodyEntry[];
  getAllBodyIds(): BodyId[];
  getBodiesByType(type: BodyType): BodyEntry[];
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

export const SOLAR_SYSTEM_BODIES: BodyEntry[] = [
  { bodyId: 10, type: 'star', parentBodyId: null, nameZh: '太阳', nameEn: 'Sun', aliases: [], assetTier: 'S', radiusKm: 695700 },
  { bodyId: 199, type: 'planet', parentBodyId: 10, nameZh: '水星', nameEn: 'Mercury', aliases: ['墨丘利'], assetTier: 'S', radiusKm: 2439.7 },
  { bodyId: 299, type: 'planet', parentBodyId: 10, nameZh: '金星', nameEn: 'Venus', aliases: ['维纳斯'], assetTier: 'S', radiusKm: 6051.8 },
  { bodyId: 399, type: 'planet', parentBodyId: 10, nameZh: '地球', nameEn: 'Earth', aliases: ['盖亚'], assetTier: 'S', radiusKm: 6371.0 },
  { bodyId: 301, type: 'satellite', parentBodyId: 399, nameZh: '月球', nameEn: 'Moon', aliases: ['月亮', 'Luna'], assetTier: 'S', radiusKm: 1737.4 },
  { bodyId: 499, type: 'planet', parentBodyId: 10, nameZh: '火星', nameEn: 'Mars', aliases: ['玛尔斯', '红色星球'], assetTier: 'S', radiusKm: 3389.5 },
  { bodyId: 401, type: 'satellite', parentBodyId: 499, nameZh: '火卫一', nameEn: 'Phobos', aliases: [], assetTier: 'A', radiusKm: 11.1 },
  { bodyId: 402, type: 'satellite', parentBodyId: 499, nameZh: '火卫二', nameEn: 'Deimos', aliases: [], assetTier: 'A', radiusKm: 6.2 },
  { bodyId: 599, type: 'planet', parentBodyId: 10, nameZh: '木星', nameEn: 'Jupiter', aliases: ['朱庇特'], assetTier: 'S', radiusKm: 69911 },
  { bodyId: 501, type: 'satellite', parentBodyId: 599, nameZh: '木卫一', nameEn: 'Io', aliases: ['艾奥'], assetTier: 'A', radiusKm: 1821.6 },
  { bodyId: 502, type: 'satellite', parentBodyId: 599, nameZh: '木卫二', nameEn: 'Europa', aliases: ['欧罗巴'], assetTier: 'A', radiusKm: 1560.8 },
  { bodyId: 503, type: 'satellite', parentBodyId: 599, nameZh: '木卫三', nameEn: 'Ganymede', aliases: ['盖尼米德'], assetTier: 'A', radiusKm: 2634.1 },
  { bodyId: 504, type: 'satellite', parentBodyId: 599, nameZh: '木卫四', nameEn: 'Callisto', aliases: ['卡利斯托'], assetTier: 'A', radiusKm: 2410.3 },
  { bodyId: 505, type: 'satellite', parentBodyId: 599, nameZh: '木卫五', nameEn: 'Amalthea', aliases: ['阿玛尔忒亚'], assetTier: 'B', radiusKm: 83.5 },
  { bodyId: 506, type: 'satellite', parentBodyId: 599, nameZh: '木卫六', nameEn: 'Himalia', aliases: ['希玛利亚'], assetTier: 'B', radiusKm: 85 },
  { bodyId: 699, type: 'planet', parentBodyId: 10, nameZh: '土星', nameEn: 'Saturn', aliases: ['萨图恩'], assetTier: 'S', radiusKm: 58232 },
  { bodyId: 601, type: 'satellite', parentBodyId: 699, nameZh: '土卫一', nameEn: 'Mimas', aliases: ['米玛斯'], assetTier: 'A', radiusKm: 198.2 },
  { bodyId: 602, type: 'satellite', parentBodyId: 699, nameZh: '土卫二', nameEn: 'Enceladus', aliases: ['恩克拉多斯'], assetTier: 'A', radiusKm: 252.1 },
  { bodyId: 603, type: 'satellite', parentBodyId: 699, nameZh: '土卫三', nameEn: 'Tethys', aliases: ['忒堤斯'], assetTier: 'A', radiusKm: 533.1 },
  { bodyId: 604, type: 'satellite', parentBodyId: 699, nameZh: '土卫四', nameEn: 'Dione', aliases: ['狄俄涅'], assetTier: 'A', radiusKm: 561.4 },
  { bodyId: 605, type: 'satellite', parentBodyId: 699, nameZh: '土卫五', nameEn: 'Rhea', aliases: ['瑞亚'], assetTier: 'A', radiusKm: 764.3 },
  { bodyId: 606, type: 'satellite', parentBodyId: 699, nameZh: '土卫六', nameEn: 'Titan', aliases: ['泰坦'], assetTier: 'S', radiusKm: 2574.7 },
  { bodyId: 607, type: 'satellite', parentBodyId: 699, nameZh: '土卫七', nameEn: 'Hyperion', aliases: ['亥伯龙'], assetTier: 'B', radiusKm: 135 },
  { bodyId: 608, type: 'satellite', parentBodyId: 699, nameZh: '土卫八', nameEn: 'Iapetus', aliases: ['伊阿珀托斯'], assetTier: 'A', radiusKm: 735.6 },
  { bodyId: 799, type: 'planet', parentBodyId: 10, nameZh: '天王星', nameEn: 'Uranus', aliases: ['乌拉诺斯'], assetTier: 'S', radiusKm: 25362 },
  { bodyId: 701, type: 'satellite', parentBodyId: 799, nameZh: '天卫一', nameEn: 'Ariel', aliases: ['艾瑞尔'], assetTier: 'A', radiusKm: 578.9 },
  { bodyId: 702, type: 'satellite', parentBodyId: 799, nameZh: '天卫二', nameEn: 'Umbriel', aliases: ['乌姆布里尔'], assetTier: 'A', radiusKm: 584.7 },
  { bodyId: 703, type: 'satellite', parentBodyId: 799, nameZh: '天卫三', nameEn: 'Titania', aliases: ['泰坦尼亚'], assetTier: 'A', radiusKm: 788.9 },
  { bodyId: 704, type: 'satellite', parentBodyId: 799, nameZh: '天卫四', nameEn: 'Oberon', aliases: ['奥伯龙'], assetTier: 'A', radiusKm: 761.4 },
  { bodyId: 705, type: 'satellite', parentBodyId: 799, nameZh: '天卫五', nameEn: 'Miranda', aliases: ['米兰达'], assetTier: 'A', radiusKm: 235.8 },
  { bodyId: 899, type: 'planet', parentBodyId: 10, nameZh: '海王星', nameEn: 'Neptune', aliases: ['尼普顿'], assetTier: 'S', radiusKm: 24622 },
  { bodyId: 801, type: 'satellite', parentBodyId: 899, nameZh: '海卫一', nameEn: 'Triton', aliases: ['特里同'], assetTier: 'A', radiusKm: 1353.4 },
  { bodyId: 802, type: 'satellite', parentBodyId: 899, nameZh: '海卫二', nameEn: 'Nereid', aliases: ['涅瑞伊得'], assetTier: 'B', radiusKm: 170 },
  { bodyId: 803, type: 'satellite', parentBodyId: 899, nameZh: '海卫三', nameEn: 'Naiad', aliases: ['那伊阿得'], assetTier: 'B', radiusKm: 33 },
  { bodyId: 804, type: 'satellite', parentBodyId: 899, nameZh: '海卫四', nameEn: 'Thalassa', aliases: ['塔拉萨'], assetTier: 'B', radiusKm: 41 },
  { bodyId: 805, type: 'satellite', parentBodyId: 899, nameZh: '海卫五', nameEn: 'Despina', aliases: ['德斯皮娜'], assetTier: 'B', radiusKm: 75 },
  { bodyId: 806, type: 'satellite', parentBodyId: 899, nameZh: '海卫六', nameEn: 'Galatea', aliases: ['伽拉忒亚'], assetTier: 'B', radiusKm: 88 },
  { bodyId: 807, type: 'satellite', parentBodyId: 899, nameZh: '海卫七', nameEn: 'Larissa', aliases: ['拉里斯萨'], assetTier: 'B', radiusKm: 97 },
  { bodyId: 808, type: 'satellite', parentBodyId: 899, nameZh: '海卫八', nameEn: 'Proteus', aliases: ['普罗透斯'], assetTier: 'B', radiusKm: 210 },
  { bodyId: 134340, type: 'dwarf-planet', parentBodyId: 10, nameZh: '冥王星', nameEn: 'Pluto', aliases: ['普鲁托'], assetTier: 'A', radiusKm: 1188.3 },
  { bodyId: 1343401, type: 'satellite', parentBodyId: 134340, nameZh: '冥卫一', nameEn: 'Charon', aliases: ['卡戎'], assetTier: 'A', radiusKm: 606 },
  { bodyId: 1343402, type: 'satellite', parentBodyId: 134340, nameZh: '冥卫二', nameEn: 'Styx', aliases: ['斯堤克斯'], assetTier: 'B', radiusKm: 7.5 },
  { bodyId: 1343403, type: 'satellite', parentBodyId: 134340, nameZh: '冥卫三', nameEn: 'Nix', aliases: ['尼克斯'], assetTier: 'B', radiusKm: 23 },
  { bodyId: 1343404, type: 'satellite', parentBodyId: 134340, nameZh: '冥卫四', nameEn: 'Kerberos', aliases: ['刻耳柏洛斯'], assetTier: 'B', radiusKm: 12 },
  { bodyId: 1343405, type: 'satellite', parentBodyId: 134340, nameZh: '冥卫五', nameEn: 'Hydra', aliases: ['许德拉'], assetTier: 'B', radiusKm: 34 },
  { bodyId: 1, type: 'dwarf-planet', parentBodyId: 10, nameZh: '谷神星', nameEn: 'Ceres', aliases: [], assetTier: 'A', radiusKm: 473 },
  { bodyId: 136199, type: 'dwarf-planet', parentBodyId: 10, nameZh: '阋神星', nameEn: 'Eris', aliases: [], assetTier: 'A', radiusKm: 1163 },
  { bodyId: 136472, type: 'dwarf-planet', parentBodyId: 10, nameZh: '鸟神星', nameEn: 'Makemake', aliases: [], assetTier: 'A', radiusKm: 715 },
  { bodyId: 136108, type: 'dwarf-planet', parentBodyId: 10, nameZh: '妊神星', nameEn: 'Haumea', aliases: [], assetTier: 'A', radiusKm: 640 },
  { bodyId: 433, type: 'asteroid', parentBodyId: 10, nameZh: '爱神星', nameEn: 'Eros', aliases: [], assetTier: 'B', radiusKm: 16.8 },
  { bodyId: 101955, type: 'asteroid', parentBodyId: 10, nameZh: '贝努', nameEn: 'Bennu', aliases: [], assetTier: 'B', radiusKm: 0.25 },
  { bodyId: 951, type: 'asteroid', parentBodyId: 10, nameZh: '加斯普拉', nameEn: 'Gaspra', aliases: [], assetTier: 'B', radiusKm: 8.5 },
  { bodyId: 243, type: 'asteroid', parentBodyId: 10, nameZh: '艾达', nameEn: 'Ida', aliases: [], assetTier: 'B', radiusKm: 14.4 },
  { bodyId: 25143, type: 'asteroid', parentBodyId: 10, nameZh: '系川', nameEn: 'Itokawa', aliases: [], assetTier: 'B', radiusKm: 0.18 },
  { bodyId: '1P', type: 'comet', parentBodyId: 10, nameZh: '哈雷彗星', nameEn: 'Halley', aliases: ['1P/Halley'], assetTier: 'A', radiusKm: 11 },
  { bodyId: '19P', type: 'comet', parentBodyId: 10, nameZh: '博雷利彗星', nameEn: 'Borrelly', aliases: [], assetTier: 'B', radiusKm: 4.8 },
  { bodyId: '81P', type: 'comet', parentBodyId: 10, nameZh: '怀尔德2号彗星', nameEn: 'Wild 2', aliases: [], assetTier: 'B', radiusKm: 2.7 },
  { bodyId: '9P', type: 'comet', parentBodyId: 10, nameZh: '坦普尔1号彗星', nameEn: 'Tempel 1', aliases: [], assetTier: 'B', radiusKm: 3.0 },
];

const PINYIN_MAP: Record<string, string> = {
  taiyang: '太阳',
  mercury: '水星',
  shuixing: '水星',
  venus: '金星',
  jinxing: '金星',
  earth: '地球',
  diqiu: '地球',
  mars: '火星',
  huoxing: '火星',
  jupiter: '木星',
  muxing: '木星',
  saturn: '土星',
  tuxing: '土星',
  uranus: '天王星',
  tianwangxing: '天王星',
  neptune: '海王星',
  haiwangxing: '海王星',
  moon: '月球',
  yueqiu: '月球',
  yueliang: '月球',
  pluto: '冥王星',
  mingwangxing: '冥王星',
  ceres: '谷神星',
  gushenxing: '谷神星',
  eris: '阋神星',
  xishenxing: '阋神星',
  makemake: '鸟神星',
  niaoshenxing: '鸟神星',
  haumea: '妊神星',
  renshenxing: '妊神星',
};

export class NavigationServiceImpl implements NavigationService {
  private bodies: Map<BodyId, BodyEntry>;
  private pinyinIndex: PinyinIndexEntry[];
  private recentlyViewed: BodyId[] = [];
  
  constructor(bodies: BodyEntry[] = SOLAR_SYSTEM_BODIES) {
    this.bodies = new Map();
    for (const body of bodies) {
      this.bodies.set(body.bodyId, body);
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
  
  private getPinyin(chineseName: string): string {
    return PINYIN_MAP[chineseName] ? chineseName : chineseName;
  }
  
  search(query: string): NavigationResult[] {
    const normalizedQuery = query.toLowerCase().trim();
    const results: NavigationResult[] = [];
    
    for (const body of this.bodies.values()) {
      const parent = body.parentBodyId ? this.bodies.get(body.parentBodyId) : null;
      let matchType: NavigationResult['matchType'] = 'fuzzy';
      let score = 0;
      
      if (body.nameZh === normalizedQuery || body.nameZh.toLowerCase() === normalizedQuery) {
        matchType = 'exact';
        score = 100;
      } else if (body.nameEn.toLowerCase() === normalizedQuery) {
        matchType = 'exact';
        score = 95;
      } else if (body.nameZh.startsWith(normalizedQuery)) {
        matchType = 'prefix';
        score = 90;
      } else if (body.nameEn.toLowerCase().startsWith(normalizedQuery)) {
        matchType = 'prefix';
        score = 85;
      } else if (body.aliases.some((alias) => alias.toLowerCase() === normalizedQuery)) {
        matchType = 'alias';
        score = 80;
      } else if (body.aliases.some((alias) => alias.toLowerCase().startsWith(normalizedQuery))) {
        matchType = 'alias';
        score = 75;
      } else if (body.nameZh.includes(normalizedQuery) || body.nameEn.toLowerCase().includes(normalizedQuery)) {
        matchType = 'fuzzy';
        score = 50;
      } else {
        const pinyinEntry = this.pinyinIndex.find((e) => e.bodyId === body.bodyId);
        if (pinyinEntry && (pinyinEntry.fullPinyin.includes(normalizedQuery) || pinyinEntry.firstLetter.toLowerCase() === normalizedQuery)) {
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
    const dot = targetPosition.x * cameraForward.x +
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
