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

  constructor(coord: TileCoord, bounds: TileBounds, resolution: number = 32) {
    this.id = coord.toString();
    this.coord = coord;
    this.bounds = bounds;
    this.level = coord.level;
    this.resolution = resolution;
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
}

export class QuadTreeNodeImpl implements QuadTreeNode {
  readonly coord: TileCoord;
  readonly bounds: TileBounds;
  readonly level: TileLevel;
  parent: QuadTreeNode | null;
  children: QuadTreeNode[] = [];
  readonly tile: TerrainTile;

  constructor(coord: TileCoord, bounds: TileBounds, parent: QuadTreeNode | null = null) {
    this.coord = coord;
    this.bounds = bounds;
    this.level = coord.level;
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

      const newChildren = childCoords.map((coord, i) => new QuadTreeNodeImpl(coord, childBounds[i] as TileBounds, this));
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

  private visibleTiles: TerrainTile[] = [];
  private loadedTiles: Map<TileId, TerrainTile> = new Map();
  private loadingTiles: Set<TileId> = new Set();

  constructor(maxLevel: TileLevel = 15, minLevel: TileLevel = 0) {
    this.maxLevel = maxLevel;
    this.minLevel = minLevel;
    this.root = this.createRoot();
  }

  private createRoot(): QuadTreeNode {
    const rootNodes: QuadTreeNode[] = [];
    for (let face = 0; face < 6; face++) {
      const coord = new TileCoordImpl(face, 0, 0, 0);
      const bounds = this.getFaceBounds(face);
      rootNodes.push(new QuadTreeNodeImpl(coord, bounds));
    }

    const dummyRoot = new QuadTreeNodeImpl(new TileCoordImpl(-1, -1, 0, 0), new TileBoundsImpl(-90, 90, -180, 180));
    rootNodes.forEach((node) => {
      const nodeImpl = node as QuadTreeNodeImpl;
      nodeImpl.parent = dummyRoot;
      dummyRoot.children.push(node);
    });

    return dummyRoot;
  }

  private getFaceBounds(face: number): TileBounds {
    const bounds: Record<number, TileBounds> = {
      0: new TileBoundsImpl(0, 90, -90, 0),
      1: new TileBoundsImpl(0, 90, 0, 90),
      2: new TileBoundsImpl(0, 90, 90, 180),
      3: new TileBoundsImpl(0, 90, -180, -90),
      4: new TileBoundsImpl(-90, 0, -180, 180),
      5: new TileBoundsImpl(-90, 0, -180, 180),
    };
    return bounds[face] || new TileBoundsImpl(-90, 90, -180, 180);
  }

  update(cameraPosition: Vec3d): void {
    this.visibleTiles = [];
    this.traverse(this.root, cameraPosition);
  }

  private traverse(node: QuadTreeNode, cameraPosition: Vec3d): void {
    const distance = this.calculateDistance(node, cameraPosition);
    node.tile.distance = distance;
    node.tile.priority = 1 / (distance + 1);

    const shouldRefine = distance < 500000 && node.level < this.maxLevel;

    if (shouldRefine && node.isLeaf()) {
      node.subdivide();
    }

    if (shouldRefine && node.hasChildren()) {
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
    const radius = 6371000;

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
