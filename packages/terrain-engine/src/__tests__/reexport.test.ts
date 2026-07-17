import { describe, it, expect } from 'vitest';
import * as terrainEngine from '../index.js';
import * as rendererCore from '@solar-system/renderer-core';

/**
 * E-39 回归测试：terrain-engine 与 renderer-core 共享符号必须为同一引用。
 *
 * 断言 terrain-engine 不再复制粘贴 renderer-core 的实现，而是 re-export 同一引用，
 * 保证单一数据源。覆盖 7 个值/类导出 + 4 个类型导出（编译期）+ 本地独有 API。
 */

describe('terrain-engine re-export from renderer-core (E-39)', () => {
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

describe('terrain-engine local-only API (SurfaceCamera / TerrainEngine)', () => {
  it('should export SurfaceCameraImpl class', () => {
    expect(typeof terrainEngine.SurfaceCameraImpl).toBe('function');
    const cam = new terrainEngine.SurfaceCameraImpl();
    expect(cam.position).toBeDefined();
    expect(cam.target).toBeDefined();
  });

  it('should export TerrainEngineImpl class', () => {
    expect(typeof terrainEngine.TerrainEngineImpl).toBe('function');
    const engine = new terrainEngine.TerrainEngineImpl();
    expect(typeof engine.update).toBe('function');
    expect(typeof engine.getSurfaceHeight).toBe('function');
  });

  it('createTerrainEngine() should return a TerrainEngineImpl instance', () => {
    const engine = terrainEngine.createTerrainEngine();
    expect(engine).toBeInstanceOf(terrainEngine.TerrainEngineImpl);
  });

  it('TerrainEngineImpl should integrate re-exported TerrainLODControllerImpl', () => {
    const engine = new terrainEngine.TerrainEngineImpl();
    engine.update({ x: 0, y: 0, z: 0 });
    // update 后 getVisibleTiles 应返回数组（来自 re-exported controller）
    const tiles = engine.getVisibleTiles();
    expect(Array.isArray(tiles)).toBe(true);
  });

  it('SurfaceCameraImpl.getSurfaceHeight should return numeric height', () => {
    const cam = new terrainEngine.SurfaceCameraImpl();
    const h = cam.getSurfaceHeight(35.0, 139.0);
    expect(typeof h).toBe('number');
    expect(h).toBeGreaterThan(6000000);
  });

  it('TileFace type should be exported (compile-time check)', () => {
    const face: terrainEngine.TileFace = 3;
    expect(face).toBe(3);
  });
});
