/**
 * 地形瓦片与 LOD 测试（修复 E-13 / E-14 / E-15）。
 *
 * - E-13：face 4/5 边界重叠修复，六面互不重叠且并集为全球
 * - E-14：LOD 改用屏幕空间误差（SSE）
 * - E-15：接入 bodyId + 真实高程（SurfaceCameraImpl、IrregularBodyRendererImpl、
 *         fallback 父瓦片、skirt 边缘缝合、太阳/气态行星最小距离约束）
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TileCoordImpl,
  TileBoundsImpl,
  TerrainTileImpl,
  QuadTreeNodeImpl,
  TerrainLODControllerImpl,
  calculateScreenSpaceError,
  SurfaceCameraImpl,
  IrregularBodyRendererImpl,
  type QuadTreeNode,
  type TileBounds,
} from '../terrain.js';

// ===========================================================================
// E-13：face 4/5 边界重叠修复
// ===========================================================================
describe('E-13 face 4/5 bounds fix', () => {
  it('face 4 and face 5 bounds do not overlap', () => {
    const controller = new TerrainLODControllerImpl();
    const faces = controller.root.children;
    const face4 = faces[4]!.bounds;
    const face5 = faces[5]!.bounds;

    // face 4 = 南半球东经半区 (0~180)
    expect(face4.minLat).toBe(-90);
    expect(face4.maxLat).toBe(0);
    expect(face4.minLng).toBe(0);
    expect(face4.maxLng).toBe(180);

    // face 5 = 南半球西经半区 (-180~0)
    expect(face5.minLat).toBe(-90);
    expect(face5.maxLat).toBe(0);
    expect(face5.minLng).toBe(-180);
    expect(face5.maxLng).toBe(0);

    // 两者仅在 lng=0 边界相接，内部不重叠
    expect(face4.minLng).toBeGreaterThanOrEqual(face5.maxLng);
  });

  it('six faces are non-overlapping and union covers the entire globe', () => {
    const controller = new TerrainLODControllerImpl();
    const faces = controller.root.children;
    expect(faces.length).toBe(6);

    // 纬度全局范围：lat [-90, 90]
    const allLats = faces.flatMap((f) => [f.bounds.minLat, f.bounds.maxLat]);
    expect(Math.min(...allLats)).toBe(-90);
    expect(Math.max(...allLats)).toBe(90);

    // 任意两面内部不重叠（边界相接允许）
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const a = faces[i]!.bounds;
        const b = faces[j]!.bounds;
        const latOverlap = a.minLat < b.maxLat && b.minLat < a.maxLat;
        const lngOverlap = a.minLng < b.maxLng && b.minLng < a.maxLng;
        expect(latOverlap && lngOverlap).toBe(false);
      }
    }

    // 北半球四面的经度并集 = [-180, 180]
    const nhFaces = faces.filter((f) => f.bounds.minLat >= 0);
    const nhMinLng = Math.min(...nhFaces.map((f) => f.bounds.minLng));
    const nhMaxLng = Math.max(...nhFaces.map((f) => f.bounds.maxLng));
    expect(nhMinLng).toBe(-180);
    expect(nhMaxLng).toBe(180);

    // 南半球两面的经度并集 = [-180, 180]
    const shFaces = faces.filter((f) => f.bounds.maxLat <= 0);
    const shMinLng = Math.min(...shFaces.map((f) => f.bounds.minLng));
    const shMaxLng = Math.max(...shFaces.map((f) => f.bounds.maxLng));
    expect(shMinLng).toBe(-180);
    expect(shMaxLng).toBe(180);
  });

  it('each face has correct bounds matching the cube-sphere partition', () => {
    const controller = new TerrainLODControllerImpl();
    const f = controller.root.children;
    // 北半球：经度四等分
    expect(f[0]!.bounds).toEqual({ minLat: 0, maxLat: 90, minLng: -90, maxLng: 0 } as TileBounds);
    expect(f[1]!.bounds).toEqual({ minLat: 0, maxLat: 90, minLng: 0, maxLng: 90 } as TileBounds);
    expect(f[2]!.bounds).toEqual({ minLat: 0, maxLat: 90, minLng: 90, maxLng: 180 } as TileBounds);
    expect(f[3]!.bounds).toEqual({ minLat: 0, maxLat: 90, minLng: -180, maxLng: -90 } as TileBounds);
    // 南半球：经度二等分
    expect(f[4]!.bounds).toEqual({ minLat: -90, maxLat: 0, minLng: 0, maxLng: 180 } as TileBounds);
    expect(f[5]!.bounds).toEqual({ minLat: -90, maxLat: 0, minLng: -180, maxLng: 0 } as TileBounds);
  });
});

// ===========================================================================
// E-14：LOD 改用屏幕空间误差
// ===========================================================================
describe('E-14 screen space error LOD', () => {
  it('calculateScreenSpaceError computes the correct pixel value', () => {
    // SSE = (geometricError * viewportHeight) / (distance * tan(fov/2) * 2)
    // geometricError=100, distance=1000, viewportHeight=1000, fov=PI/2 → tan(45°)=1
    // SSE = (100 * 1000) / (1000 * 1 * 2) = 50
    const sse = calculateScreenSpaceError(100, 1000, 1000, Math.PI / 2);
    expect(sse).toBeCloseTo(50, 5);
  });

  it('calculateScreenSpaceError returns Infinity for zero or negative distance', () => {
    expect(calculateScreenSpaceError(100, 0, 1000, Math.PI / 2)).toBe(Infinity);
    expect(calculateScreenSpaceError(100, -5, 1000, Math.PI / 2)).toBe(Infinity);
  });

  it('traverse refines for close camera and does not refine for far camera', () => {
    const R = 6371000;

    // 近距离相机：SSE 高 → 细分 → 出现更深层级瓦片
    const close = new TerrainLODControllerImpl({ maxLevel: 2, radius: R });
    close.update({ x: R * 1.001, y: 0, z: 0 });
    const closeTiles = close.getVisibleTiles();
    expect(closeTiles.length).toBeGreaterThan(0);
    const closeMaxLevel = Math.max(...closeTiles.map((t) => t.level));
    expect(closeMaxLevel).toBeGreaterThan(0);

    // 远距离相机：SSE 低 → 不细分 → 仅 level 0
    const far = new TerrainLODControllerImpl({ maxLevel: 2, radius: R });
    far.update({ x: R * 1000, y: 0, z: 0 });
    const farTiles = far.getVisibleTiles();
    expect(farTiles.length).toBe(6);
    const farMaxLevel = Math.max(...farTiles.map((t) => t.level));
    expect(farMaxLevel).toBe(0);
  });

  it('geometricError halves at each subdivision level', () => {
    const base = 6371000;
    const root = new QuadTreeNodeImpl(
      new TileCoordImpl(0, 0, 0, 0),
      new TileBoundsImpl(0, 90, -90, 0),
      null,
      base,
    );
    expect(root.geometricError).toBeCloseTo(base, 5);
    expect(root.baseGeometricError).toBe(base);

    root.subdivide();
    const child = root.children[0] as QuadTreeNode;
    expect(child.geometricError).toBeCloseTo(base / 2, 5);

    child.subdivide();
    const grandchild = child.children[0] as QuadTreeNode;
    expect(grandchild.geometricError).toBeCloseTo(base / 4, 5);

    expect(grandchild.geometricError).toBeLessThan(child.geometricError);
    expect(child.geometricError).toBeLessThan(root.geometricError);
  });
});

// ===========================================================================
// E-15：接入 bodyId + 真实高程
// ===========================================================================
describe('E-15 bodyId + real elevation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---- 多 body 半径 ----
  it('controller accepts Moon bodyId and radius (1737.4km)', () => {
    const moon = new TerrainLODControllerImpl({ bodyId: 1, radius: 1737400 });
    expect(moon.bodyId).toBe(1);
    expect(moon.radius).toBe(1737400);
    // baseGeometricError 默认等于 radius
    expect(moon.baseGeometricError).toBe(1737400);
    // 六面根节点的几何误差 = base / 2^0 = base
    const face0 = moon.root.children[0] as QuadTreeNode;
    expect(face0.geometricError).toBeCloseTo(1737400, 1);
  });

  it('controller accepts Mars bodyId and radius (3389.5km)', () => {
    const mars = new TerrainLODControllerImpl({ bodyId: 2, radius: 3389500 });
    expect(mars.bodyId).toBe(2);
    expect(mars.radius).toBe(3389500);
    expect(mars.baseGeometricError).toBe(3389500);
  });

  it('controller defaults to Earth bodyId=3 and radius=6371km', () => {
    const earth = new TerrainLODControllerImpl();
    expect(earth.bodyId).toBe(3);
    expect(earth.radius).toBe(6371000);
    expect(earth.fov).toBeCloseTo(Math.PI / 3, 5);
    expect(earth.viewportHeight).toBe(1080);
    expect(earth.sseThreshold).toBe(2);
    expect(earth.skirtHeight).toBe(10);
  });

  // ---- loadElevationData ----
  it('loadElevationData fetches url and parses {width, height, data}', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ width: 2, height: 2, data: [0, 100, 200, 300] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const cam = new SurfaceCameraImpl(3, 6371000);
    expect(cam.hasElevationData()).toBe(false);
    await cam.loadElevationData('https://example.com/elev.json');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/elev.json');
    expect(cam.hasElevationData()).toBe(true);
  });

  it('loadElevationData populates data usable by getSurfaceHeight', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ width: 4, height: 4, data: Array.from({ length: 16 }, () => 500) }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const cam = new SurfaceCameraImpl();
    await cam.loadElevationData('elev.bin');
    // 全部为 500，任意采样都应为 500
    expect(cam.getSurfaceHeight(45, 45)).toBeCloseTo(500, 5);
    expect(cam.getSurfaceHeight(-120, -30)).toBeCloseTo(500, 5);
  });

  // ---- 双线性插值 ----
  it('getSurfaceHeight bilinear interpolates at cell center (average of 4 corners)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ width: 2, height: 2, data: [0, 100, 200, 300] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const cam = new SurfaceCameraImpl();
    await cam.loadElevationData('elev.json');
    // 中心点 (lon=0, lat=0) → 四角平均 = (0+100+200+300)/4 = 150
    expect(cam.getSurfaceHeight(0, 0)).toBeCloseTo(150, 5);
  });

  it('getSurfaceHeight interpolates along edges between cells', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ width: 2, height: 2, data: [0, 100, 200, 300] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const cam = new SurfaceCameraImpl();
    await cam.loadElevationData('elev.json');
    // 底边中点 (lon=0, lat=-90) → [0,100] 中点 = 50
    expect(cam.getSurfaceHeight(0, -90)).toBeCloseTo(50, 5);
    // 左边中点 (lon=-180, lat=0) → [0,200] 中点 = 100
    expect(cam.getSurfaceHeight(-180, 0)).toBeCloseTo(100, 5);
    // 右上角 (lon=180, lat=90) → data[3] = 300
    expect(cam.getSurfaceHeight(180, 90)).toBeCloseTo(300, 5);
  });

  it('getSurfaceHeight returns 0 when no elevation data is loaded', () => {
    const cam = new SurfaceCameraImpl();
    expect(cam.hasElevationData()).toBe(false);
    expect(cam.getSurfaceHeight(0, 0)).toBe(0);
    expect(cam.getSurfaceHeight(123, -45)).toBe(0);
  });

  // ---- 太阳最小距离 ----
  it('Sun (bodyId=10) minSafeDistance is 1.5 * radius', () => {
    const sunRadius = 696000000;
    const sun = new SurfaceCameraImpl(10, sunRadius);
    expect(sun.isSun()).toBe(true);
    expect(sun.getMinSafeDistance()).toBeCloseTo(sunRadius * 1.5, 1);
  });

  it('Sun clampCameraDistance enforces the minimum safe distance', () => {
    const sun = new SurfaceCameraImpl(10, 1000);
    // 低于最小距离 → clamp 到 1.5 * 1000 = 1500
    expect(sun.clampCameraDistance(100)).toBe(1500);
    expect(sun.clampCameraDistance(1499)).toBe(1500);
    // 高于最小距离 → 不变
    expect(sun.clampCameraDistance(2000)).toBe(2000);
  });

  // ---- 气态行星 atmosphereRadius ----
  it('gas giant (bodyId=4) atmosphereRadius and minSafeDistance are 1.1 * radius', () => {
    const jupiterRadius = 69911000;
    const jupiter = new SurfaceCameraImpl(4, jupiterRadius);
    expect(jupiter.isGasGiant()).toBe(true);
    expect(jupiter.getAtmosphereRadius()).toBeCloseTo(jupiterRadius * 1.1, 1);
    expect(jupiter.getMinSafeDistance()).toBeCloseTo(jupiterRadius * 1.1, 1);
  });

  it('isGasGiant detects Jupiter/Saturn/Uranus/Neptune and rejects rocky bodies', () => {
    expect(new SurfaceCameraImpl(4, 1000).isGasGiant()).toBe(true); // Jupiter
    expect(new SurfaceCameraImpl(5, 1000).isGasGiant()).toBe(true); // Saturn
    expect(new SurfaceCameraImpl(6, 1000).isGasGiant()).toBe(true); // Uranus
    expect(new SurfaceCameraImpl(7, 1000).isGasGiant()).toBe(true); // Neptune
    expect(new SurfaceCameraImpl(3, 1000).isGasGiant()).toBe(false); // Earth
    expect(new SurfaceCameraImpl(1, 1000).isGasGiant()).toBe(false); // Moon
    expect(new SurfaceCameraImpl(10, 1000).isGasGiant()).toBe(false); // Sun
  });

  // ---- 不规则天体 ----
  it('IrregularBodyRendererImpl generates vertices within the noise amplitude range', () => {
    const radius = 1000;
    const amp = 0.1;
    const renderer = new IrregularBodyRendererImpl(99, radius, amp, 16);
    expect(renderer.positions.length).toBe(renderer.vertexCount * 3);

    const minR = radius * (1 - amp);
    const maxR = radius * (1 + amp);
    let deviated = false;
    for (let i = 0; i < renderer.vertexCount; i++) {
      const x = renderer.positions[i * 3]!;
      const y = renderer.positions[i * 3 + 1]!;
      const z = renderer.positions[i * 3 + 2]!;
      const dist = Math.hypot(x, y, z);
      expect(dist).toBeGreaterThanOrEqual(minR - 1e-6);
      expect(dist).toBeLessThanOrEqual(maxR + 1e-6);
      if (Math.abs(dist - radius) > 1e-3) deviated = true;
    }
    // 至少有顶点偏离基础半径（否则就不是不规则形状）
    expect(deviated).toBe(true);
  });

  it('IrregularBodyRendererImpl vertex count matches segment parameters', () => {
    const segments = 8;
    const renderer = new IrregularBodyRendererImpl(99, 1000, 0.05, segments);
    const widthSegments = Math.max(3, segments);
    const heightSegments = Math.max(2, Math.floor(segments / 2));
    const expected = (widthSegments + 1) * (heightSegments + 1);
    expect(renderer.vertexCount).toBe(expected);
    expect(renderer.positions.length).toBe(expected * 3);
  });

  // ---- fallback 父瓦片 ----
  it('fallback parent tile is added to visibleTiles when children are not loaded', () => {
    const R = 6371000;
    const controller = new TerrainLODControllerImpl({
      maxLevel: 1,
      radius: R,
      viewportHeight: 10000, // 高视口 → 强制 SSE 超过阈值
      sseThreshold: 1,
    });
    // 近距离相机 → 高 SSE → 触发细分
    controller.update({ x: R * 1.001, y: 0, z: 0 });
    const visible = controller.getVisibleTiles();

    // 子瓦片未加载 → level 0 父瓦片作为 fallback 出现
    const level0Tiles = visible.filter((t) => t.level === 0);
    expect(level0Tiles.length).toBeGreaterThan(0);

    // level 1 子瓦片（已达 maxLevel）也出现
    const level1Tiles = visible.filter((t) => t.level === 1);
    expect(level1Tiles.length).toBeGreaterThan(0);
  });

  // ---- skirt 边缘缝合 ----
  it('skirt vertices are offset downward (toward center) by skirtHeight', () => {
    const coord = new TileCoordImpl(0, 0, 0, 0);
    const bounds = new TileBoundsImpl(0, 90, -90, 0);
    const skirtHeight = 10;
    const tile = new TerrainTileImpl(coord, bounds, 32, skirtHeight);
    const radius = 1000;
    const skirt = tile.generateSkirtVertices(radius);

    // 4 个角顶点 × 3 分量
    expect(skirt.length).toBe(12);
    for (let i = 0; i < 4; i++) {
      const x = skirt[i * 3]!;
      const y = skirt[i * 3 + 1]!;
      const z = skirt[i * 3 + 2]!;
      const dist = Math.hypot(x, y, z);
      // 每个 skirt 顶点到原点距离 = radius - skirtHeight
      expect(dist).toBeCloseTo(radius - skirtHeight, 5);
    }
  });
});
