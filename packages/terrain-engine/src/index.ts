/**
 * 地形引擎（任务 P0-17 / 修复 E-39 / N-01 / E-15 / N-04）。
 *
 * 重构说明：本模块原先与 `@solar-system/renderer-core` 的 `terrain.ts` 存在大段
 * 复制粘贴（TileCoordImpl / TileBoundsImpl / TerrainTileImpl / QuadTreeNodeImpl /
 * TerrainLODControllerImpl / AtmosphereRendererImpl / AtmosphereParamsImpl），
 * 且独立维护了低质量的 SurfaceCameraImpl（硬编码半径 + sin/cos 假高程）与
 * TerrainEngineImpl（init 忽略 bodyId）。
 *
 * 现将所有共享类型与实现改为从 `@solar-system/renderer-core` 纯 re-export，
 * 消除重复实现，保证单一数据源。本模块仅保留 terrain-engine 独有的 TileFace 类型。
 */

// ---- 共享类型与实现：从 renderer-core re-export（消除 E-39 重复 / N-01 / N-04）----
export {
  TileCoordImpl,
  TileBoundsImpl,
  TerrainTileImpl,
  QuadTreeNodeImpl,
  TerrainLODControllerImpl,
  AtmosphereRendererImpl,
  AtmosphereParamsImpl,
  SurfaceCameraImpl,
  IrregularBodyRendererImpl,
  calculateScreenSpaceError,
} from '@solar-system/renderer-core';

export type {
  TileId,
  TileLevel,
  TileCoord,
  TileBounds,
  Tile,
  TerrainTile,
  QuadTreeNode,
  TerrainLODController,
  AtmosphereRenderer,
  AtmosphereParams,
  ElevationData,
  TerrainLODConfig,
} from '@solar-system/renderer-core';

// ---- terrain-engine 独有：瓦片面索引类型 ----
export type TileFace = 0 | 1 | 2 | 3 | 4 | 5;
