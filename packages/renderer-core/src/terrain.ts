/**
 * 地球大气与地形瓦片骨架（任务 P0-17）。
 */

import type { Vec3d } from '@solar-system/schemas';

export type TileId = string;

export type TileLevel = number;

export interface TileCoord {
  face: number;
  level: TileLevel;
  x: number;
  y: number;
}

export interface TileBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface Tile {
  readonly id: TileId;
  readonly coord: TileCoord;
  readonly bounds: TileBounds;
  readonly level: TileLevel;
  readonly parentId?: TileId;
  readonly childrenIds: TileId[];
  readonly vertexBuffer?: string;
  readonly indexBuffer?: string;
  readonly textureBuffer?: string;
  readonly normalBuffer?: string;
  readonly elevationBuffer?: string;

  loaded: boolean;
  loading: boolean;
  visible: boolean;
  error?: Error;

  priority: number;
  distance: number;

  getLODLevel(): number;
  isLeaf(): boolean;
  needsRefinement(): boolean;
}

export interface TerrainTile extends Tile {
  readonly elevationRange: [number, number];
  readonly resolution: number;
  readonly textureUrl?: string;
  readonly elevationUrl?: string;
}

export interface QuadTreeNode {
  readonly coord: TileCoord;
  readonly bounds: TileBounds;
  readonly level: TileLevel;
  readonly geometricError: number;
  readonly baseGeometricError: number;
  readonly parent: QuadTreeNode | null;
  readonly children: QuadTreeNode[];
  readonly tile: TerrainTile;

  isLeaf(): boolean;
  hasChildren(): boolean;
  subdivide(): void;
  getNeighbors(): QuadTreeNode[];
  getAncestors(): QuadTreeNode[];
}

export class TileCoordImpl implements TileCoord {
  face: number;
  level: TileLevel;
  x: number;
  y: number;

  constructor(face: number, level: TileLevel, x: number, y: number) {
    this.face = face;
    this.level = level;
    this.x = x;
    this.y = y;
  }

  toString(): string {
    return `${this.face}-${this.level}-${this.x}-${this.y}`;
  }

  static fromString(str: string): TileCoordImpl {
    const parts = str.split('-');
    return new TileCoordImpl(
      parseInt(parts[0] as string, 10),
      parseInt(parts[1] as string, 10),
      parseInt(parts[2] as string, 10),
      parseInt(parts[3] as string, 10),
    );
  }
}

export class TileBoundsImpl implements TileBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;

  constructor(minLat: number, maxLat: number, minLng: number, maxLng: number) {
    this.minLat = minLat;
    this.maxLat = maxLat;
    this.minLng = minLng;
    this.maxLng = maxLng;
  }
}

export class TerrainTileImpl implements TerrainTile {
  readonly id: TileId;
  readonly coord: TileCoord;
  readonly bounds: TileBounds;
  readonly level: TileLevel;
  readonly parentId?: TileId;
  childrenIds: TileId[] = [];
  readonly vertexBuffer?: string;
  readonly indexBuffer?: string;
  readonly textureBuffer?: string;
  readonly normalBuffer?: string;
  readonly elevationBuffer?: string;

  loaded = false;
  loading = false;
  visible = false;
  error?: Error;

  priority = 0;
  distance = 0;

  readonly elevationRange: [number, number];
  readonly resolution: number;
  readonly textureUrl?: string;
  readonly elevationUrl?: string;
  readonly skirtHeight: number;

  constructor(coord: TileCoord, bounds: TileBounds, resolution: number = 32, skirtHeight: number = 10) {
    this.id = coord.toString();
    this.coord = coord;
    this.bounds = bounds;
    this.level = coord.level;
    this.resolution = resolution;
    this.skirtHeight = skirtHeight;
    this.elevationRange = [-10911, 8848];
  }

  getLODLevel(): number {
    return this.level;
  }

  isLeaf(): boolean {
    return this.childrenIds.length === 0;
  }

  needsRefinement(): boolean {
    return this.distance < 100000 && !this.isLeaf();
  }

  /**
   * 生成 skirt（裙边）顶点：将瓦片四角顶点沿径向向行星中心方向
   * 偏移 skirtHeight，用于缝合相邻瓦片边缘、消除裂缝。
   * 返回扁平化的 [x,y,z, x,y,z, ...] 数组。
   */
  generateSkirtVertices(radius: number = 6371000): number[] {
    const { minLat, maxLat, minLng, maxLng } = this.bounds;
    const corners: ReadonlyArray<readonly [number, number]> = [
      [maxLat, minLng],
      [maxLat, maxLng],
      [minLat, maxLng],
      [minLat, minLng],
    ];
    const skirt: number[] = [];
    for (const [lat, lng] of corners) {
      const latRad = (lat * Math.PI) / 180;
      const lngRad = (lng * Math.PI) / 180;
      const x = radius * Math.cos(latRad) * Math.cos(lngRad);
      const y = radius * Math.sin(latRad);
      const z = radius * Math.cos(latRad) * Math.sin(lngRad);
      const len = Math.hypot(x, y, z);
      const factor = len > 0 ? (len - this.skirtHeight) / len : 1;
      skirt.push(x * factor, y * factor, z * factor);
    }
    return skirt;
  }
}

export class QuadTreeNodeImpl implements QuadTreeNode {
  readonly coord: TileCoord;
  readonly bounds: TileBounds;
  readonly level: TileLevel;
  readonly geometricError: number;
  readonly baseGeometricError: number;
  parent: QuadTreeNode | null;
  children: QuadTreeNode[] = [];
  readonly tile: TerrainTile;

  constructor(
    coord: TileCoord,
    bounds: TileBounds,
    parent: QuadTreeNode | null = null,
    baseGeometricError: number = 6371000,
  ) {
    this.coord = coord;
    this.bounds = bounds;
    this.level = coord.level;
    this.baseGeometricError = baseGeometricError;
    this.geometricError = baseGeometricError / Math.pow(2, Math.max(0, coord.level));
    this.parent = parent;
    this.tile = new TerrainTileImpl(coord, bounds);
  }

  isLeaf(): boolean {
    return this.children.length === 0;
  }

  hasChildren(): boolean {
    return this.children.length > 0;
  }

  subdivide(): void {
    if (this.isLeaf()) {
      const { minLat, maxLat, minLng, maxLng } = this.bounds;
      const midLat = (minLat + maxLat) / 2;
      const midLng = (minLng + maxLng) / 2;
      const nextLevel = this.level + 1;

      const childCoords = [
        new TileCoordImpl(this.coord.face, nextLevel, this.coord.x * 2, this.coord.y * 2),
        new TileCoordImpl(this.coord.face, nextLevel, this.coord.x * 2 + 1, this.coord.y * 2),
        new TileCoordImpl(this.coord.face, nextLevel, this.coord.x * 2, this.coord.y * 2 + 1),
        new TileCoordImpl(this.coord.face, nextLevel, this.coord.x * 2 + 1, this.coord.y * 2 + 1),
      ];

      const childBounds = [
        new TileBoundsImpl(midLat, maxLat, minLng, midLng),
        new TileBoundsImpl(midLat, maxLat, midLng, maxLng),
        new TileBoundsImpl(minLat, midLat, minLng, midLng),
        new TileBoundsImpl(minLat, midLat, midLng, maxLng),
      ];

      const newChildren = childCoords.map(
        (coord, i) => new QuadTreeNodeImpl(coord, childBounds[i] as TileBounds, this, this.baseGeometricError),
      );
      this.children = newChildren;
      const tileImpl = this.tile as TerrainTileImpl;
      tileImpl.childrenIds = this.children.map((c) => c.tile.id);
    }
  }

  getNeighbors(): QuadTreeNode[] {
    const neighbors: QuadTreeNode[] = [];
    const parent = this.parent;
    if (!parent) return neighbors;

    const siblings = parent.children;
    const idx = siblings.indexOf(this);

    if (idx !== -1) {
      const x = idx % 2;
      const y = Math.floor(idx / 2);

      if (x === 0 && siblings[idx + 1]) neighbors.push(siblings[idx + 1] as QuadTreeNode);
      if (x === 1 && siblings[idx - 1]) neighbors.push(siblings[idx - 1] as QuadTreeNode);
      if (y === 0 && siblings[idx + 2]) neighbors.push(siblings[idx + 2] as QuadTreeNode);
      if (y === 1 && siblings[idx - 2]) neighbors.push(siblings[idx - 2] as QuadTreeNode);
    }

    return neighbors;
  }

  getAncestors(): QuadTreeNode[] {
    const ancestors: QuadTreeNode[] = [];
    let current: QuadTreeNode | null = this.parent;
    while (current) {
      ancestors.push(current);
      current = current.parent;
    }
    return ancestors;
  }
}

/**
 * 计算屏幕空间误差（Screen Space Error, SSE）。
 *
 * 公式：SSE = (geometricError * viewportHeight) / (distance * tan(fov/2) * 2)
 *
 * - geometricError: 瓦片的几何误差（米）
 * - distance: 相机到瓦片的距离（米）
 * - viewportHeight: 视口高度（像素）
 * - fov: 垂直视场角（弧度）
 *
 * 返回值单位为像素。距离为 0 或 fov 异常时返回 Infinity。
 */
export function calculateScreenSpaceError(
  geometricError: number,
  distance: number,
  viewportHeight: number,
  fov: number,
): number {
  if (distance <= 0) return Infinity;
  const tanHalfFov = Math.tan(fov / 2);
  if (tanHalfFov <= 0) return Infinity;
  return (geometricError * viewportHeight) / (distance * tanHalfFov * 2);
}

export interface TerrainLODConfig {
  maxLevel?: TileLevel;
  minLevel?: TileLevel;
  /** 垂直视场角（弧度），默认 60°。 */
  fov?: number;
  /** 视口高度（像素），默认 1080。 */
  viewportHeight?: number;
  /** SSE 阈值（像素），超过则细分，默认 2。 */
  sseThreshold?: number;
  /** 基础几何误差（米），默认等于行星半径。 */
  baseGeometricError?: number;
  /** 天体 ID。 */
  bodyId?: number;
  /** 行星半径（米），默认地球 6371000。 */
  radius?: number;
  /** skirt 高度（米），默认 10。 */
  skirtHeight?: number;
}

export interface TerrainLODController {
  readonly root: QuadTreeNode;
  readonly maxLevel: TileLevel;
  readonly minLevel: TileLevel;

  update(cameraPosition: Vec3d): void;
  getVisibleTiles(): TerrainTile[];
  getLoadedTiles(): TerrainTile[];
  getLoadingTiles(): TerrainTile[];
}

export class TerrainLODControllerImpl implements TerrainLODController {
  readonly root: QuadTreeNode;
  readonly maxLevel: TileLevel;
  readonly minLevel: TileLevel;
  readonly bodyId: number;
  readonly radius: number;
  readonly fov: number;
  readonly viewportHeight: number;
  readonly sseThreshold: number;
  readonly baseGeometricError: number;
  readonly skirtHeight: number;

  private visibleTiles: TerrainTile[] = [];
  private loadedTiles: Map<TileId, TerrainTile> = new Map();
  private loadingTiles: Set<TileId> = new Set();

  constructor(config: TerrainLODConfig = {}) {
    this.maxLevel = config.maxLevel ?? 15;
    this.minLevel = config.minLevel ?? 0;
    this.bodyId = config.bodyId ?? 3;
    this.radius = config.radius ?? 6371000;
    this.fov = config.fov ?? Math.PI / 3;
    this.viewportHeight = config.viewportHeight ?? 1080;
    this.sseThreshold = config.sseThreshold ?? 2;
    this.baseGeometricError = config.baseGeometricError ?? this.radius;
    this.skirtHeight = config.skirtHeight ?? 10;
    this.root = this.createRoot();
  }

  private createRoot(): QuadTreeNode {
    const rootNodes: QuadTreeNode[] = [];
    for (let face = 0; face < 6; face++) {
      const coord = new TileCoordImpl(face, 0, 0, 0);
      const bounds = this.getFaceBounds(face);
      rootNodes.push(new QuadTreeNodeImpl(coord, bounds, null, this.baseGeometricError));
    }

    const dummyRoot = new QuadTreeNodeImpl(
      new TileCoordImpl(-1, -1, 0, 0),
      new TileBoundsImpl(-90, 90, -180, 180),
      null,
      this.baseGeometricError,
    );
    rootNodes.forEach((node) => {
      const nodeImpl = node as QuadTreeNodeImpl;
      nodeImpl.parent = dummyRoot;
      dummyRoot.children.push(node);
    });

    return dummyRoot;
  }

  /**
   * 返回六面体某个面的经纬度边界。
   *
   * E-13 修复：face 4 与 face 5 此前完全重叠（均为 -180~180），
   * 现拆分为南半球东经半区与西经半区，确保六面互不重叠且并集为全球。
   *
   * - face 0/1/2/3：北半球（lat 0~90），按经度四等分
   * - face 4：南半球（lat -90~0），东经 0~180
   * - face 5：南半球（lat -90~0），西经 -180~0
   */
  private getFaceBounds(face: number): TileBounds {
    const bounds: Record<number, TileBounds> = {
      0: new TileBoundsImpl(0, 90, -90, 0),
      1: new TileBoundsImpl(0, 90, 0, 90),
      2: new TileBoundsImpl(0, 90, 90, 180),
      3: new TileBoundsImpl(0, 90, -180, -90),
      4: new TileBoundsImpl(-90, 0, 0, 180),
      5: new TileBoundsImpl(-90, 0, -180, 0),
    };
    return bounds[face] || new TileBoundsImpl(-90, 90, -180, 180);
  }

  update(cameraPosition: Vec3d): void {
    this.visibleTiles = [];
    // 直接遍历 root（dummy 容器）的 6 个面根节点，避免远距离时
    // dummy 节点 SSE 低于阈值导致整棵树不被访问。
    this.root.children.forEach((child) => this.traverse(child, cameraPosition));
  }

  /**
   * 基于 SSE 的遍历（E-14）。
   *
   * 计算瓦片的屏幕空间误差，若 SSE > 阈值且未达最大层级则细分；
   * 否则将瓦片加入 visibleTiles。
   *
   * E-15 fallback：当决定细分但子瓦片尚未加载完成时，把父瓦片
   * 也加入 visibleTiles，确保始终有可渲染内容。
   */
  private traverse(node: QuadTreeNode, cameraPosition: Vec3d): void {
    const distance = this.calculateDistance(node, cameraPosition);
    node.tile.distance = distance;
    node.tile.priority = 1 / (distance + 1);

    const sse = calculateScreenSpaceError(node.geometricError, distance, this.viewportHeight, this.fov);
    const shouldRefine = sse > this.sseThreshold && node.level < this.maxLevel;

    if (shouldRefine && node.isLeaf()) {
      node.subdivide();
    }

    if (shouldRefine && node.hasChildren()) {
      const allChildrenLoaded = node.children.every((c) => c.tile.loaded);
      if (!allChildrenLoaded && node.level >= this.minLevel) {
        this.visibleTiles.push(node.tile);
      }
      node.children.forEach((child) => this.traverse(child, cameraPosition));
    } else {
      if (node.level >= this.minLevel) {
        this.visibleTiles.push(node.tile);
      }
    }
  }

  private calculateDistance(node: QuadTreeNode, cameraPosition: Vec3d): number {
    const { minLat, maxLat, minLng, maxLng } = node.bounds;
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const latRad = (centerLat * Math.PI) / 180;
    const lngRad = (centerLng * Math.PI) / 180;
    const radius = this.radius;

    const tileCenter = {
      x: radius * Math.cos(latRad) * Math.cos(lngRad),
      y: radius * Math.sin(latRad),
      z: radius * Math.cos(latRad) * Math.sin(lngRad),
    };

    const dx = cameraPosition.x - tileCenter.x;
    const dy = cameraPosition.y - tileCenter.y;
    const dz = cameraPosition.z - tileCenter.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  getVisibleTiles(): TerrainTile[] {
    return this.visibleTiles;
  }

  getLoadedTiles(): TerrainTile[] {
    return Array.from(this.loadedTiles.values());
  }

  getLoadingTiles(): TerrainTile[] {
    return this.visibleTiles.filter((tile) => this.loadingTiles.has(tile.id));
  }

  markLoaded(tileId: TileId): void {
    const tile = this.findTile(tileId);
    if (tile) {
      tile.loaded = true;
      tile.loading = false;
      this.loadedTiles.set(tileId, tile);
      this.loadingTiles.delete(tileId);
    }
  }

  markLoading(tileId: TileId): void {
    const tile = this.findTile(tileId);
    if (tile) {
      tile.loading = true;
      this.loadingTiles.add(tileId);
    }
  }

  private findTile(tileId: TileId): TerrainTile | undefined {
    let result: TerrainTile | undefined;
    const find = (node: QuadTreeNode): void => {
      if (node.tile.id === tileId) {
        result = node.tile;
        return;
      }
      node.children.forEach(find);
    };
    find(this.root);
    return result;
  }
}

/**
 * 高程数据（E-15）：{width, height, data}，data 为按行存储的高度值数组。
 */
export interface ElevationData {
  width: number;
  height: number;
  data: number[];
}

/**
 * 地表相机（E-15）：加载真实高程数据并双线性插值采样地表高度。
 *
 * 同时根据 bodyId 提供相机最小安全距离约束：
 * - 太阳（bodyId=10）：clamp 到 1.5 * radius
 * - 气态行星（bodyId=4/5/6/7）：clamp 到 atmosphereRadius（radius * 1.1）
 */
export class SurfaceCameraImpl {
  readonly bodyId: number;
  readonly radius: number;
  private elevationData: ElevationData | null = null;

  static readonly SUN_BODY_ID = 10;
  static readonly GAS_GIANT_BODY_IDS: ReadonlySet<number> = new Set([4, 5, 6, 7]);

  constructor(bodyId: number = 3, radius: number = 6371000) {
    this.bodyId = bodyId;
    this.radius = radius;
  }

  isSun(): boolean {
    return this.bodyId === SurfaceCameraImpl.SUN_BODY_ID;
  }

  isGasGiant(): boolean {
    return SurfaceCameraImpl.GAS_GIANT_BODY_IDS.has(this.bodyId);
  }

  /** 最小安全距离：太阳 1.5*radius，气态行星 atmosphereRadius=1.1*radius，其余为 radius。 */
  getMinSafeDistance(): number {
    if (this.isSun()) return 1.5 * this.radius;
    if (this.isGasGiant()) return this.radius * 1.1;
    return this.radius;
  }

  /** atmosphereRadius（气态行星大气上限），非气态行星等于 radius。 */
  getAtmosphereRadius(): number {
    if (this.isGasGiant()) return this.radius * 1.1;
    return this.radius;
  }

  clampCameraDistance(distance: number): number {
    return Math.max(distance, this.getMinSafeDistance());
  }

  hasElevationData(): boolean {
    return this.elevationData !== null;
  }

  /**
   * 加载高程数据：fetch elevationUrl → 解析 {width, height, data}。
   */
  async loadElevationData(elevationUrl: string): Promise<void> {
    const response = await fetch(elevationUrl);
    const json = (await response.json()) as ElevationData;
    const rawData: unknown[] = Array.isArray(json.data) ? json.data : [];
    this.elevationData = {
      width: json.width,
      height: json.height,
      data: rawData.map((v) => Number(v)),
    };
  }

  /**
   * 用已加载的高程数据双线性插值返回 (lon, lat) 处的高度。
   * 未加载数据时返回 0。
   */
  getSurfaceHeight(lon: number, lat: number): number {
    if (!this.elevationData) return 0;
    const { width, height, data } = this.elevationData;
    if (width <= 0 || height <= 0) return 0;

    const u = (lon + 180) / 360;
    const v = (lat + 90) / 180;

    const fx = u * (width - 1);
    const fy = v * (height - 1);

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);

    const tx = fx - x0;
    const ty = fy - y0;

    const i00 = y0 * width + x0;
    const i10 = y0 * width + x1;
    const i01 = y1 * width + x0;
    const i11 = y1 * width + x1;

    const h00 = data[i00] ?? 0;
    const h10 = data[i10] ?? 0;
    const h01 = data[i01] ?? 0;
    const h11 = data[i11] ?? 0;

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;

    return h0 * (1 - ty) + h1 * ty;
  }
}

/**
 * 不规则天体渲染器（E-15）：程序化生成噪声扰动球面顶点数组。
 *
 * 构造时基于参数化球面采样，对每个顶点的径向距离叠加确定性伪噪声，
 * 生成不规则形状的顶点位置数组（扁平 [x,y,z, ...]）。
 */
export class IrregularBodyRendererImpl {
  readonly bodyId: number;
  readonly radius: number;
  readonly noiseAmplitude: number;
  readonly positions: number[];
  readonly vertexCount: number;

  constructor(bodyId: number, radius: number, noiseAmplitude: number = 0.1, segments: number = 16) {
    this.bodyId = bodyId;
    this.radius = radius;
    this.noiseAmplitude = noiseAmplitude;
    this.positions = [];

    const widthSegments = Math.max(3, segments);
    const heightSegments = Math.max(2, Math.floor(segments / 2));

    for (let y = 0; y <= heightSegments; y++) {
      const v = y / heightSegments;
      const phi = v * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let x = 0; x <= widthSegments; x++) {
        const u = x / widthSegments;
        const theta = u * Math.PI * 2;

        const nx = sinPhi * Math.cos(theta);
        const ny = cosPhi;
        const nz = sinPhi * Math.sin(theta);

        const noise = this.pseudoNoise(nx, ny, nz) * noiseAmplitude * radius;
        const r = radius + noise;

        this.positions.push(nx * r, ny * r, nz * r);
      }
    }

    this.vertexCount = (widthSegments + 1) * (heightSegments + 1);
  }

  /** 确定性伪噪声，返回 [-1, 1] 范围的值。 */
  private pseudoNoise(x: number, y: number, z: number): number {
    const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  }
}

export interface AtmosphereRenderer {
  update(time: number, sunDirection: Vec3d, cameraPosition: Vec3d): void;
  render(): void;
  setParams(params: AtmosphereParams): void;
}

export interface AtmosphereParams {
  planetRadius: number;
  atmosphereRadius: number;
  rayleighScaleHeight: number;
  mieScaleHeight: number;
  rayleighCoefficient: [number, number, number];
  mieCoefficient: [number, number, number];
  mieDirectionalG: number;
  sunIntensity: number;
}

export class AtmosphereParamsImpl implements AtmosphereParams {
  planetRadius: number = 6371000;
  atmosphereRadius: number = 6471000;
  rayleighScaleHeight: number = 8000;
  mieScaleHeight: number = 1200;
  rayleighCoefficient: [number, number, number] = [5.8e-6, 1.35e-5, 3.31e-5];
  mieCoefficient: [number, number, number] = [21e-6, 21e-6, 21e-6];
  mieDirectionalG: number = 0.76;
  sunIntensity: number = 20;

  constructor(params?: Partial<AtmosphereParams>) {
    if (params) {
      Object.assign(this, params);
    }
  }
}

export class AtmosphereRendererImpl implements AtmosphereRenderer {
  private atmoParams: AtmosphereParams;
  private timeValue: number = 0;
  private sunDirectionValue: Vec3d = { x: 1, y: 0, z: 0 };
  private cameraPositionValue: Vec3d = { x: 0, y: 0, z: 0 };

  constructor(params?: Partial<AtmosphereParams>) {
    this.atmoParams = new AtmosphereParamsImpl(params);
  }

  update(time: number, sunDirection: Vec3d, cameraPosition: Vec3d): void {
    this.timeValue = time;
    this.sunDirectionValue = { ...sunDirection };
    this.cameraPositionValue = { ...cameraPosition };
  }

  render(): void {
    void this.atmoParams;
    void this.timeValue;
    void this.sunDirectionValue;
    void this.cameraPositionValue;
  }

  setParams(params: AtmosphereParams): void {
    this.atmoParams = { ...params };
  }
}
