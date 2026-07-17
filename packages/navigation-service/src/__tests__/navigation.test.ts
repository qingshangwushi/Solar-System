/**
 * NavigationService 测试（修复 E-11 拼音搜索 / E-12 数据驱动 / 任务 T-P2-20 导航 API 补全）。
 *
 * 覆盖：
 * - 现有 API（getBody/getParent/getChildren/getAncestors/getPath/getAllBodyIds/getBodiesByType）
 * - getDirectionToTarget / getScreenEdgeIndicator
 * - markAsViewed / getRecentlyViewed
 * - E-11 拼音搜索：搜索 "mu xing" 命中 "木星"、搜索 "木星" 命中、搜索编号命中
 * - E-12 数据驱动：构造接收外部 BodyEntry[]、buildHierarchy、jumpToParent、listSatellites、setOrbitsVisible、setLabelsVisible
 * - 条目数 ≥ 290（用 mock 数据）
 */
import { describe, it, expect } from 'vitest';
import {
  NavigationServiceImpl,
  SOLAR_SYSTEM_BODIES,
  createNavigationService,
  type BodyEntry,
  type BodyType,
} from '../index.js';

function makeBody(overrides: Partial<BodyEntry> & Pick<BodyEntry, 'bodyId' | 'nameZh' | 'nameEn'>): BodyEntry {
  return {
    type: 'satellite',
    parentBodyId: 10,
    aliases: [],
    assetTier: 'C',
    radiusKm: 10,
    ...overrides,
  };
}

/** 生成 count 个 mock 卫星，附加在八大行星上，确保 catalog 条目数 ≥ 290。 */
function generateMockBodies(count: number): BodyEntry[] {
  const base: BodyEntry[] = [
    makeBody({ bodyId: 10, type: 'star', parentBodyId: null, nameZh: '太阳', nameEn: 'Sun', aliases: [], assetTier: 'S', radiusKm: 695700 }),
    makeBody({ bodyId: 599, type: 'planet', parentBodyId: 10, nameZh: '木星', nameEn: 'Jupiter', aliases: ['朱庇特'], assetTier: 'S', radiusKm: 69911 }),
    makeBody({ bodyId: 699, type: 'planet', parentBodyId: 10, nameZh: '土星', nameEn: 'Saturn', aliases: ['萨图恩'], assetTier: 'S', radiusKm: 58232 }),
  ];
  for (let i = 0; i < count; i++) {
    base.push(
      makeBody({
        bodyId: 100000 + i,
        type: 'satellite',
        parentBodyId: 599,
        nameZh: `卫星${i}`,
        nameEn: `Satellite-${i}`,
        aliases: [],
        assetTier: 'C',
        radiusKm: 1 + i * 0.1,
      })
    );
  }
  return base;
}

describe('NavigationServiceImpl - 基础 API（现有行为不回归）', () => {
  const svc = new NavigationServiceImpl();

  it('默认从 catalog.json 加载 SOLAR_SYSTEM_BODIES', () => {
    expect(SOLAR_SYSTEM_BODIES.length).toBeGreaterThanOrEqual(50);
    expect(svc.getAllBodyIds().length).toBe(SOLAR_SYSTEM_BODIES.length);
  });

  it('getBody 返回已知天体', () => {
    const jupiter = svc.getBody(599);
    expect(jupiter).not.toBeNull();
    expect(jupiter!.nameZh).toBe('木星');
  });

  it('getBody 对未知 id 返回 null', () => {
    expect(svc.getBody(9999999)).toBeNull();
  });

  it('getParent 返回父天体', () => {
    const parent = svc.getParent(501);
    expect(parent).not.toBeNull();
    expect(parent!.nameZh).toBe('木星');
  });

  it('getParent 对太阳（无父）返回 null', () => {
    expect(svc.getParent(10)).toBeNull();
  });

  it('getChildren 按半径降序返回子天体', () => {
    const children = svc.getChildren(599);
    expect(children.length).toBeGreaterThan(0);
    for (let i = 1; i < children.length; i++) {
      expect(children[i]!.radiusKm).toBeLessThanOrEqual(children[i - 1]!.radiusKm);
    }
  });

  it('getAncestors 返回从根到父的路径', () => {
    const ancestors = svc.getAncestors(501);
    expect(ancestors.length).toBe(2);
    expect(ancestors[0]!.bodyId).toBe(10);
    expect(ancestors[1]!.bodyId).toBe(599);
  });

  it('getPath 包含祖先与自身', () => {
    const path = svc.getPath(501);
    expect(path.length).toBe(3);
    expect(path[path.length - 1]!.bodyId).toBe(501);
  });

  it('getAllBodyIds 返回所有 id', () => {
    const ids = svc.getAllBodyIds();
    expect(ids).toContain(10);
    expect(ids).toContain(599);
    expect(ids).toContain('1P');
  });

  it('getBodiesByType 按类型过滤', () => {
    const planets = svc.getBodiesByType('planet');
    expect(planets.length).toBe(8);
    for (const p of planets) {
      expect(p.type).toBe('planet' as BodyType);
    }
  });

  it('markAsViewed + getRecentlyViewed 维护最近浏览', () => {
    svc.markAsViewed(599);
    svc.markAsViewed(699);
    const recent = svc.getRecentlyViewed();
    expect(recent[0]!.bodyId).toBe(699);
    expect(recent[1]!.bodyId).toBe(599);
  });

  it('getDirectionToTarget 返回单位方向向量', () => {
    const dir = svc.getDirectionToTarget({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
    expect(dir.x).toBeCloseTo(0.6);
    expect(dir.y).toBeCloseTo(0.8);
    expect(dir.z).toBeCloseTo(0);
  });

  it('getDirectionToTarget 同点返回零向量', () => {
    const dir = svc.getDirectionToTarget({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 });
    expect(dir).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('getScreenEdgeIndicator 目标在前方时返回 null', () => {
    const indicator = svc.getScreenEdgeIndicator(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      800,
      600
    );
    expect(indicator).toBeNull();
  });

  it('getScreenEdgeIndicator 目标在后方时返回边缘指示', () => {
    const indicator = svc.getScreenEdgeIndicator(
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      800,
      600
    );
    expect(indicator).not.toBeNull();
    expect(indicator!.visible).toBe(true);
  });
});

describe('E-11 拼音搜索修复', () => {
  const svc = new NavigationServiceImpl();

  it('getPinyin 返回真实拼音而非中文本身', () => {
    expect(svc.getPinyin('木星')).toBe('muxing');
    expect(svc.getPinyin('太阳')).toBe('taiyang');
    expect(svc.getPinyin('天王星')).toBe('tianwangxing');
  });

  it('getPinyin 未命中映射时回退为小写英文名', () => {
    expect(svc.getPinyin('Io')).toBe('io');
  });

  it('搜索 "mu xing"（带空格）命中 "木星"', () => {
    const results = svc.search('mu xing');
    const ids = results.map((r) => r.bodyId);
    expect(ids).toContain(599);
    const jupiterResult = results.find((r) => r.bodyId === 599);
    expect(jupiterResult).toBeDefined();
    expect(jupiterResult!.matchType).toBe('pinyin');
  });

  it('搜索 "muxing"（无空格）命中 "木星"', () => {
    const results = svc.search('muxing');
    const ids = results.map((r) => r.bodyId);
    expect(ids).toContain(599);
  });

  it('搜索 "木星"（中文）命中', () => {
    const results = svc.search('木星');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.bodyId).toBe(599);
    expect(results[0]!.matchType).toBe('exact');
  });

  it('搜索编号 "599" 命中木星', () => {
    const results = svc.search('599');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.bodyId).toBe(599);
  });

  it('搜索彗星编号 "1P" 命中哈雷彗星', () => {
    const results = svc.search('1P');
    expect(results.length).toBeGreaterThan(0);
    const halley = results.find((r) => r.bodyId === '1P');
    expect(halley).toBeDefined();
  });

  it('搜索结果按分数降序排列', () => {
    const results = svc.search('星');
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  it('搜索结果最多 20 条', () => {
    const results = svc.search('a');
    expect(results.length).toBeLessThanOrEqual(20);
  });
});

describe('E-12 数据驱动与层级 API', () => {
  it('NavigationServiceImpl 构造接收外部 BodyEntry[]', () => {
    const customBodies = generateMockBodies(5);
    const svc = new NavigationServiceImpl(customBodies);
    expect(svc.getAllBodyIds().length).toBe(customBodies.length);
  });

  it('createNavigationService 工厂接受外部 BodyEntry[]', () => {
    const customBodies = generateMockBodies(3);
    const svc = createNavigationService(customBodies);
    expect(svc.getAllBodyIds().length).toBe(customBodies.length);
  });

  it('支持 ≥ 290 条目（mock 数据）', () => {
    const customBodies = generateMockBodies(290);
    const svc = new NavigationServiceImpl(customBodies);
    expect(svc.getAllBodyIds().length).toBeGreaterThanOrEqual(290);
  });

  it('buildHierarchy 不传参返回所有根节点', () => {
    const svc = new NavigationServiceImpl();
    const roots = svc.buildHierarchy();
    expect(roots.length).toBeGreaterThan(0);
    const sunRoot = roots.find((r) => r.body.bodyId === 10);
    expect(sunRoot).toBeDefined();
    expect(sunRoot!.children.length).toBeGreaterThan(0);
  });

  it('buildHierarchy 传 rootBodyId 返回以该天体为根的子树', () => {
    const svc = new NavigationServiceImpl();
    const jupiterTree = svc.buildHierarchy(599);
    expect(jupiterTree.length).toBe(1);
    expect(jupiterTree[0]!.body.bodyId).toBe(599);
    expect(jupiterTree[0]!.children.length).toBeGreaterThan(0);
    // 子节点都应是木星的卫星
    for (const child of jupiterTree[0]!.children) {
      expect(child.body.parentBodyId).toBe(599);
    }
  });

  it('buildHierarchy 传 null 等价于不传参', () => {
    const svc = new NavigationServiceImpl();
    const rootsNull = svc.buildHierarchy(null);
    const rootsUndefined = svc.buildHierarchy(undefined);
    expect(rootsNull.length).toBe(rootsUndefined.length);
  });

  it('jumpToParent 返回父天体并标记为最近浏览', () => {
    const svc = new NavigationServiceImpl();
    const parent = svc.jumpToParent(501);
    expect(parent).not.toBeNull();
    expect(parent!.bodyId).toBe(599);
    const recent = svc.getRecentlyViewed();
    expect(recent[0]!.bodyId).toBe(599);
  });

  it('jumpToParent 对根天体返回 null', () => {
    const svc = new NavigationServiceImpl();
    expect(svc.jumpToParent(10)).toBeNull();
  });

  it('listSatellites 返回子卫星', () => {
    const svc = new NavigationServiceImpl();
    const sats = svc.listSatellites(599);
    expect(sats.length).toBeGreaterThan(0);
    for (const s of sats) {
      expect(s.type).toBe('satellite' as BodyType);
      expect(s.parentBodyId).toBe(599);
    }
  });

  it('listSatellites 对无卫星天体返回空数组', () => {
    const svc = new NavigationServiceImpl();
    expect(svc.listSatellites(501)).toEqual([]);
  });

  it('setOrbitsVisible / getOrbitsVisible 批量切换轨道可见性', () => {
    const svc = new NavigationServiceImpl();
    expect(svc.getOrbitsVisible(501)).toBe(true);
    svc.setOrbitsVisible([501, 502], false);
    expect(svc.getOrbitsVisible(501)).toBe(false);
    expect(svc.getOrbitsVisible(502)).toBe(false);
    expect(svc.getOrbitsVisible(503)).toBe(true);
    svc.setOrbitsVisible([501], true);
    expect(svc.getOrbitsVisible(501)).toBe(true);
  });

  it('setLabelsVisible / getLabelsVisible 批量切换标签可见性', () => {
    const svc = new NavigationServiceImpl();
    expect(svc.getLabelsVisible(501)).toBe(true);
    svc.setLabelsVisible([501, 502], false);
    expect(svc.getLabelsVisible(501)).toBe(false);
    expect(svc.getLabelsVisible(502)).toBe(false);
    svc.setLabelsVisible([501], true);
    expect(svc.getLabelsVisible(501)).toBe(true);
  });

  it('getOrbitsVisible / getLabelsVisible 对未知 id 默认返回 true', () => {
    const svc = new NavigationServiceImpl();
    expect(svc.getOrbitsVisible(9999999)).toBe(true);
    expect(svc.getLabelsVisible(9999999)).toBe(true);
  });
});
