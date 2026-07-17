/**
 * NavigationService 接口契约测试（任务 18 / 修复 R-07）。
 *
 * 验证 `@solar-system/navigation-service` 中 `NavigationService` 接口：
 * - createNavigationService() 返回符合 NavigationService 接口的对象
 * - search / getBody / getParent / getChildren / getAllBodyIds 等方法签名
 * - getBodiesByType / buildHierarchy / jumpToParent 等导航方法
 */
import { describe, it, expect } from 'vitest';
import {
  createNavigationService,
  type NavigationService,
  type BodyEntry,
  type BodyType,
  type HierarchyNode,
  type NavigationResult,
} from '@solar-system/navigation-service';
import type { BodyId } from '@solar-system/body-renderers';

// ---------------------------------------------------------------------------
// 编译时类型断言：createNavigationService() 返回值必须可赋值给 NavigationService。
// ---------------------------------------------------------------------------
const _typeCheck: NavigationService = createNavigationService();
void _typeCheck;

// ---------------------------------------------------------------------------

describe('NavigationService 接口契约', () => {
  it('createNavigationService 返回符合 NavigationService 接口的对象', () => {
    const svc: NavigationService = createNavigationService();

    // 所有接口方法存在
    expect(typeof svc.search).toBe('function');
    expect(typeof svc.getBody).toBe('function');
    expect(typeof svc.getParent).toBe('function');
    expect(typeof svc.getChildren).toBe('function');
    expect(typeof svc.getAncestors).toBe('function');
    expect(typeof svc.getPath).toBe('function');
    expect(typeof svc.getAllBodyIds).toBe('function');
    expect(typeof svc.getBodiesByType).toBe('function');
    expect(typeof svc.buildHierarchy).toBe('function');
    expect(typeof svc.jumpToParent).toBe('function');
    expect(typeof svc.listSatellites).toBe('function');
    expect(typeof svc.setOrbitsVisible).toBe('function');
    expect(typeof svc.setLabelsVisible).toBe('function');
    expect(typeof svc.getOrbitsVisible).toBe('function');
    expect(typeof svc.getLabelsVisible).toBe('function');
    expect(typeof svc.getDirectionToTarget).toBe('function');
    expect(typeof svc.getScreenEdgeIndicator).toBe('function');

    // 方法签名：参数个数符合接口约定
    expect(svc.search.length).toBe(1); // (query: string)
    expect(svc.getBody.length).toBe(1); // (bodyId: BodyId)
    expect(svc.getBodiesByType.length).toBe(1); // (type: BodyType)
  });

  it('getAllBodyIds / getBodiesByType / getBody 签名与返回类型匹配', () => {
    const svc: NavigationService = createNavigationService();

    // getAllBodyIds(): BodyId[]
    const ids: BodyId[] = svc.getAllBodyIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
    // BodyId 是 number | string；至少应包含太阳（10）
    expect(ids).toContain(10);

    // getBodiesByType(type: BodyType): BodyEntry[]
    const allTypes: BodyType[] = [
      'star',
      'planet',
      'satellite',
      'dwarf-planet',
      'asteroid',
      'comet',
    ];
    let totalBodies = 0;
    for (const t of allTypes) {
      const bodies: BodyEntry[] = svc.getBodiesByType(t);
      expect(Array.isArray(bodies)).toBe(true);
      for (const b of bodies) {
        // BodyEntry 字段约束
        expect(b.type).toBe(t);
        expect(typeof b.bodyId).toMatch(/^(number|string)$/);
        expect(typeof b.nameZh).toBe('string');
        expect(typeof b.nameEn).toBe('string');
        expect(Array.isArray(b.aliases)).toBe(true);
      }
      totalBodies += bodies.length;
    }
    expect(totalBodies).toBeGreaterThan(0);

    // getBody(bodyId): BodyEntry | null
    const sun: BodyEntry | null = svc.getBody(10);
    expect(sun).not.toBeNull();
    expect(sun?.nameZh).toBe('太阳');
    expect(sun?.type).toBe('star');

    // 不存在的 bodyId 返回 null
    const missing: BodyEntry | null = svc.getBody(9999999);
    expect(missing).toBeNull();
  });

  it('search / buildHierarchy / jumpToParent 签名与返回类型匹配', () => {
    const svc: NavigationService = createNavigationService();

    // search(query: string): NavigationResult[]
    const results: NavigationResult[] = svc.search('地球');
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      const r = results[0]!;
      expect(typeof r.bodyId).toMatch(/^(number|string)$/);
      expect(typeof r.nameZh).toBe('string');
      expect(typeof r.nameEn).toBe('string');
      expect(typeof r.score).toBe('number');
      expect(['exact', 'prefix', 'pinyin', 'alias', 'fuzzy']).toContain(r.matchType);
    }

    // buildHierarchy(rootBodyId?: BodyId | null): HierarchyNode[]
    const fullTree: HierarchyNode[] = svc.buildHierarchy();
    expect(Array.isArray(fullTree)).toBe(true);
    expect(fullTree.length).toBeGreaterThan(0);

    const sunTree: HierarchyNode[] = svc.buildHierarchy(10);
    expect(sunTree).toHaveLength(1);
    expect(sunTree[0]!.body.bodyId).toBe(10);
    expect(Array.isArray(sunTree[0]!.children)).toBe(true);

    // buildHierarchy(null) 等价于 buildHierarchy()
    const nullTree: HierarchyNode[] = svc.buildHierarchy(null);
    expect(nullTree.length).toBe(fullTree.length);

    // jumpToParent(bodyId): BodyEntry | null
    // 地球的 parent 是太阳
    const parent: BodyEntry | null = svc.jumpToParent(399);
    expect(parent).not.toBeNull();
    expect(parent?.bodyId).toBe(10);

    // 太阳无 parent
    const rootParent: BodyEntry | null = svc.jumpToParent(10);
    expect(rootParent).toBeNull();
  });
});
