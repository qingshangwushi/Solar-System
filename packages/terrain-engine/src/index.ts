/**
 * 地形引擎（任务 P0-17 / 修复 E-39）。
 *
 * 重构说明：本模块原先与 `@solar-system/renderer-core` 的 `terrain.ts` 存在大段
 * 复制粘贴（TileCoordImpl / TileBoundsImpl / TerrainTileImpl / QuadTreeNodeImpl /
 * TerrainLODControllerImpl / AtmosphereRendererImpl / AtmosphereParamsImpl）。
 * 现将这些共享类型与实现改为从 `@solar-system/renderer-core` 纯 re-export，
 * 消除重复实现，保证单一数据源。
 *
 * 保留为本模块本地定义的仅 `SurfaceCamera*` / `TerrainEngine*` —— 这些是
 * terrain-engine 独有的高层编排 API，renderer-core 暂未导出。待 renderer-core
 * 后续补齐后可进一步收敛为纯 re-export。
 */

import type { Vec3d } from '@solar-system/schemas';
import { TerrainLODControllerImpl, TileCoordImpl } from '@solar-system/renderer-core';

// ---- 共享类型与实现：从 renderer-core re-export（消除 E-39 重复）----
export {
  TileCoordImpl,
  TileBoundsImpl,
  TerrainTileImpl,
  QuadTreeNodeImpl,
  TerrainLODControllerImpl,
  AtmosphereRendererImpl,
  AtmosphereParamsImpl,
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
} from '@solar-system/renderer-core';

// ---- terrain-engine 独有：瓦片面索引类型 ----
export type TileFace = 0 | 1 | 2 | 3 | 4 | 5;

// ---- terrain-engine 独有：地表相机与地形引擎高层 API ----
export interface SurfaceCamera {
  position: Vec3d;
  target: Vec3d;
  up: Vec3d;

  update(deltaTime: number): void;
  setPosition(position: Vec3d): void;
  setTarget(target: Vec3d): void;
  setSpeed(speed: number): void;
  clampToSurface(minHeight: number): void;
  getSurfaceHeight(lat: number, lng: number): number;
  getSurfaceNormal(lat: number, lng: number): Vec3d;
}

export interface TerrainEngine {
  init(bodyId: number): void;
  update(cameraPosition: Vec3d): void;
  getVisibleTiles(): import('@solar-system/renderer-core').TerrainTile[];
  getSurfaceHeight(lat: number, lng: number): number;
  getSurfaceNormal(lat: number, lng: number): Vec3d;
  dispose(): void;
}

export class SurfaceCameraImpl implements SurfaceCamera {
  position: Vec3d = { x: 6471000, y: 0, z: 0 };
  target: Vec3d = { x: 6371000, y: 0, z: 0 };
  up: Vec3d = { x: 0, y: 1, z: 0 };

  private speed = 1000;
  private planetRadius = 6371000;

  update(deltaTime: number): void {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const dz = this.target.z - this.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > 0.01) {
      const moveSpeed = this.speed * deltaTime;
      const moveDistance = Math.min(moveSpeed, distance);

      this.position.x += (dx / distance) * moveDistance;
      this.position.y += (dy / distance) * moveDistance;
      this.position.z += (dz / distance) * moveDistance;
    }

    this.clampToSurface(1000);
  }

  setPosition(position: Vec3d): void {
    this.position = { ...position };
    this.clampToSurface(1000);
  }

  setTarget(target: Vec3d): void {
    this.target = { ...target };
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(1, speed);
  }

  clampToSurface(minHeight: number): void {
    const dist = Math.sqrt(
      this.position.x * this.position.x +
        this.position.y * this.position.y +
        this.position.z * this.position.z,
    );

    if (dist < this.planetRadius + minHeight) {
      const scale = (this.planetRadius + minHeight) / dist;
      this.position.x *= scale;
      this.position.y *= scale;
      this.position.z *= scale;
    }
  }

  getSurfaceHeight(lat: number, lng: number): number {
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;

    const baseHeight = this.planetRadius;
    const roughness = Math.sin(latRad * 5) * Math.cos(lngRad * 3) * 500;
    const features = Math.sin(latRad * 10) * Math.cos(lngRad * 10) * 100;

    return baseHeight + roughness + features;
  }

  getSurfaceNormal(lat: number, lng: number): Vec3d {
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;

    return {
      x: Math.cos(latRad) * Math.cos(lngRad),
      y: Math.sin(latRad),
      z: Math.cos(latRad) * Math.sin(lngRad),
    };
  }
}

export class TerrainEngineImpl implements TerrainEngine {
  private lodController: TerrainLODControllerImpl;
  private surfaceCamera: SurfaceCamera;

  constructor() {
    this.lodController = new TerrainLODControllerImpl();
    this.surfaceCamera = new SurfaceCameraImpl();
  }

  init(_bodyId: number): void {
    this.lodController = new TerrainLODControllerImpl();
  }

  update(cameraPosition: Vec3d): void {
    this.lodController.update(cameraPosition);
  }

  getVisibleTiles(): import('@solar-system/renderer-core').TerrainTile[] {
    return this.lodController.getVisibleTiles();
  }

  getSurfaceHeight(lat: number, lng: number): number {
    return this.surfaceCamera.getSurfaceHeight(lat, lng);
  }

  getSurfaceNormal(lat: number, lng: number): Vec3d {
    return this.surfaceCamera.getSurfaceNormal(lat, lng);
  }

  dispose(): void {}
}

export const createTerrainEngine = (): TerrainEngine => {
  return new TerrainEngineImpl();
};

// 兼容旧导出：TileCoordImpl.fromString 在 renderer-core 已实现，此处仅触发 tree-shake 友好引用
void TileCoordImpl;
