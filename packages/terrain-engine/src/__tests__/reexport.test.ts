import { describe, it, expect } from 'vitest';
import * as terrainEngine from '../index.js';
import * as rendererCore from '@solar-system/renderer-core';

/**
 * E-39 / N-01 / N-04 回归测试：terrain-engine 与 renderer-core 共享符号必须为同一引用。
 *
 * 断言 terrain-engine 不再复制粘贴 renderer-core 的实现，而是 re-export 同一引用，
 * 保证单一数据源。覆盖：
 *   - 7 个原始共享类导出（TileCoordImpl / TileBoundsImpl / TerrainTileImpl /
 *     QuadTreeNodeImpl / TerrainLODControllerImpl / AtmosphereRendererImpl /
 *     AtmosphereParamsImpl）
 *   - 3 个新增共享导出（SurfaceCameraImpl / IrregularBodyRendererImpl /
 *     calculateScreenSpaceError）—— 修复 N-01
 *   - 类型导出（编译期检查，包括 ElevationData / TerrainLODConfig）—— 修复 N-04
 *   - terrain-engine 独有 TileFace 类型
 */

describe('terrain-engine re-export from renderer-core (E-39 / N-01 / N-04)', () => {
  it('TileCoordImpl should be the same reference as renderer-core', () => {
    expect(terrainEngine.TileCoordImpl).toBe(rendererCore.TileCoordImpl);
  });

  it('TileBoundsImpl should be the same reference as renderer-core', () => {
    expect(terrainEngine.TileBoundsImpl).toBe(rendererCore.TileBoundsImpl);
  });

  it('TerrainTileImpl should be the same reference as renderer-core', () => {
    expect(terrainEngine.TerrainTileImpl).toBe(rendererCore.TerrainTileImpl);
  });

  it('QuadTreeNodeImpl should be the same reference as renderer-core', () => {
    expect(terrainEngine.QuadTreeNodeImpl).toBe(rendererCore.QuadTreeNodeImpl);
  });

  it('TerrainLODControllerImpl should be the same reference as renderer-core', () => {
    expect(terrainEngine.TerrainLODControllerImpl).toBe(rendererCore.TerrainLODControllerImpl);
  });

  it('AtmosphereRendererImpl should be the same reference as renderer-core', () => {
    expect(terrainEngine.AtmosphereRendererImpl).toBe(rendererCore.AtmosphereRendererImpl);
  });

  it('AtmosphereParamsImpl should be the same reference as renderer-core', () => {
    expect(terrainEngine.AtmosphereParamsImpl).toBe(rendererCore.AtmosphereParamsImpl);
  });

  // ---- N-01 新增：SurfaceCameraImpl / IrregularBodyRendererImpl / calculateScreenSpaceError ----

  it('SurfaceCameraImpl should be the same reference as renderer-core (N-01)', () => {
    expect(terrainEngine.SurfaceCameraImpl).toBe(rendererCore.SurfaceCameraImpl);
  });

  it('IrregularBodyRendererImpl should be the same reference as renderer-core (N-01)', () => {
    expect(terrainEngine.IrregularBodyRendererImpl).toBe(rendererCore.IrregularBodyRendererImpl);
  });

  it('calculateScreenSpaceError should be the same reference as renderer-core (N-01)', () => {
    expect(terrainEngine.calculateScreenSpaceError).toBe(rendererCore.calculateScreenSpaceError);
  });

  it('re-exported TileCoordImpl should construct and stringify consistently', () => {
    const coord = new terrainEngine.TileCoordImpl(0, 2, 1, 1);
    expect(coord.toString()).toBe('0-2-1-1');
    // 同一引用：terrain-engine 与 renderer-core 构造的实例 instanceof 互通
    expect(coord).toBeInstanceOf(rendererCore.TileCoordImpl);
  });

  it('re-exported TerrainLODControllerImpl should be constructible', () => {
    const controller = new terrainEngine.TerrainLODControllerImpl({ maxLevel: 5, minLevel: 0 });
    expect(controller).toBeInstanceOf(rendererCore.TerrainLODControllerImpl);
    expect(controller.maxLevel).toBe(5);
    expect(controller.minLevel).toBe(0);
  });

  it('re-exported AtmosphereParamsImpl should accept partial params', () => {
    const params = new terrainEngine.AtmosphereParamsImpl({ planetRadius: 7000000 });
    expect(params).toBeInstanceOf(rendererCore.AtmosphereParamsImpl);
    expect(params.planetRadius).toBe(7000000);
  });
});

describe('terrain-engine re-exported SurfaceCameraImpl (N-01 / E-15)', () => {
  it('should construct with bodyId and radius', () => {
    const cam = new terrainEngine.SurfaceCameraImpl(3, 6371000);
    expect(cam).toBeInstanceOf(rendererCore.SurfaceCameraImpl);
    expect(cam.bodyId).toBe(3);
    expect(cam.radius).toBe(6371000);
  });

  it('should default to Earth bodyId=3 and radius=6371000', () => {
    const cam = new terrainEngine.SurfaceCameraImpl();
    expect(cam.bodyId).toBe(3);
    expect(cam.radius).toBe(6371000);
  });

  it('getSurfaceHeight returns 0 when no elevation data loaded', () => {
    const cam = new terrainEngine.SurfaceCameraImpl();
    expect(cam.hasElevationData()).toBe(false);
    expect(cam.getSurfaceHeight(139.0, 35.0)).toBe(0);
  });

  it('clampCameraDistance enforces min safe distance for Earth', () => {
    const cam = new terrainEngine.SurfaceCameraImpl(3, 6371000);
    // Earth: min safe distance = radius = 6371000
    expect(cam.getMinSafeDistance()).toBe(6371000);
    expect(cam.clampCameraDistance(5000000)).toBe(6371000);
    expect(cam.clampCameraDistance(7000000)).toBe(7000000);
  });

  it('Sun bodyId gets 1.5*radius min safe distance', () => {
    const sun = new terrainEngine.SurfaceCameraImpl(10, 696000000);
    expect(sun.isSun()).toBe(true);
    expect(sun.getMinSafeDistance()).toBe(1.5 * 696000000);
  });

  it('Gas giant bodyId gets 1.1*radius atmosphere radius', () => {
    const jupiter = new terrainEngine.SurfaceCameraImpl(5, 69911000);
    expect(jupiter.isGasGiant()).toBe(true);
    expect(jupiter.getAtmosphereRadius()).toBe(1.1 * 69911000);
  });
});

describe('terrain-engine re-exported IrregularBodyRendererImpl (N-01)', () => {
  it('should construct with bodyId, radius, and noise amplitude', () => {
    const renderer = new terrainEngine.IrregularBodyRendererImpl(1, 1000, 0.2, 16);
    expect(renderer).toBeInstanceOf(rendererCore.IrregularBodyRendererImpl);
    expect(renderer.bodyId).toBe(1);
    expect(renderer.radius).toBe(1000);
    expect(renderer.noiseAmplitude).toBe(0.2);
  });

  it('should generate positions array with 3 components per vertex', () => {
    const renderer = new terrainEngine.IrregularBodyRendererImpl(1, 1000, 0.1, 16);
    expect(renderer.positions.length).toBe(renderer.vertexCount * 3);
    expect(renderer.vertexCount).toBeGreaterThan(0);
  });

  it('positions should be within radius +/- noiseAmplitude*radius range', () => {
    const radius = 1000;
    const amp = 0.1;
    const renderer = new terrainEngine.IrregularBodyRendererImpl(1, radius, amp, 16);
    const maxR = radius * (1 + amp);
    const minR = radius * (1 - amp);
    for (let i = 0; i < renderer.positions.length; i += 3) {
      const x = renderer.positions[i]!;
      const y = renderer.positions[i + 1]!;
      const z = renderer.positions[i + 2]!;
      const r = Math.sqrt(x * x + y * y + z * z);
      expect(r).toBeGreaterThanOrEqual(minR);
      expect(r).toBeLessThanOrEqual(maxR);
    }
  });
});

describe('terrain-engine re-exported calculateScreenSpaceError (N-01)', () => {
  it('should return Infinity for zero distance', () => {
    expect(terrainEngine.calculateScreenSpaceError(100, 0, 1080, Math.PI / 3)).toBe(Infinity);
  });

  it('should return Infinity for negative distance', () => {
    expect(terrainEngine.calculateScreenSpaceError(100, -10, 1080, Math.PI / 3)).toBe(Infinity);
  });

  it('should compute positive SSE for valid inputs', () => {
    const sse = terrainEngine.calculateScreenSpaceError(1000, 100000, 1080, Math.PI / 3);
    expect(sse).toBeGreaterThan(0);
    expect(Number.isFinite(sse)).toBe(true);
  });

  it('should match the formula (geometricError * viewportHeight) / (distance * tanHalfFov * 2)', () => {
    const geometricError = 500;
    const distance = 200000;
    const viewportHeight = 1080;
    const fov = Math.PI / 3;
    const expected = (geometricError * viewportHeight) / (distance * Math.tan(fov / 2) * 2);
    expect(terrainEngine.calculateScreenSpaceError(geometricError, distance, viewportHeight, fov)).toBeCloseTo(
      expected,
      10,
    );
  });
});

describe('terrain-engine re-exported types (compile-time checks)', () => {
  it('ElevationData type should be usable (N-04)', () => {
    const elevation: terrainEngine.ElevationData = {
      width: 2,
      height: 2,
      data: [0, 100, 200, 300],
    };
    expect(elevation.data).toHaveLength(4);
    expect(elevation.width).toBe(2);
  });

  it('TerrainLODConfig type should accept partial config (N-04)', () => {
    const config: terrainEngine.TerrainLODConfig = {
      maxLevel: 10,
      radius: 6371000,
      bodyId: 3,
    };
    expect(config.maxLevel).toBe(10);
  });

  it('TileFace type should be exported (terrain-engine local)', () => {
    const face: terrainEngine.TileFace = 3;
    expect(face).toBe(3);
  });
});
