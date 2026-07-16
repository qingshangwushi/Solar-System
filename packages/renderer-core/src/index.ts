/**
 * 渲染后端抽象层（任务 P0-12）。
 *
 * 定义统一的渲染器接口，支持 WebGPU 和 WebGL2 后端。
 *
 * 设计文档参考：
 * - 第 6.3 节：渲染后端抽象（FR-RENDER-001, FR-RENDER-002）
 * - 第 6.4 节：双后端支持（FR-RENDER-003）
 * - 第 6.6 节：着色器管理（FR-SHADER-001）
 * - 第 6.7 节：纹理管理（FR-TEXTURE-001）
 */

import type { Vec3d, Quat64 } from '@solar-system/schemas';
import type { CameraType } from './camera.js';

export type BackendType = 'webgpu' | 'webgl2';

export type RendererConfig = {
  width: number;
  height: number;
  pixelRatio: number;
  backend: BackendType;
  antialias: boolean;
  colorSpace: 'srgb' | 'linear';
};

export type ClearOptions = {
  color?: [number, number, number, number];
  depth?: boolean;
  stencil?: boolean;
};

export type PrimitiveType = 'points' | 'lines' | 'line_strip' | 'triangles' | 'triangle_strip';

export type VertexAttribute = {
  name: string;
  format: 'float32x3' | 'float32x2' | 'float32';
  offset: number;
  stride: number;
};

export type BufferUsage = 'static' | 'dynamic' | 'stream';

export type BufferDescriptor = {
  size: number;
  usage: BufferUsage;
  data?: ArrayBuffer;
};

export type TextureFormat =
  | 'rgba8unorm'
  | 'rgba16float'
  | 'rgb10a2unorm'
  | 'depth24plus-stencil8'
  | 'depth32float';

export type TextureUsage = 'texture' | 'render_target';

export type TextureDescriptor = {
  width: number;
  height: number;
  format: TextureFormat;
  usage: TextureUsage;
  mipmap?: boolean;
};

export type ShaderStage = 'vertex' | 'fragment' | 'compute';

export type ShaderDescriptor = {
  stage: ShaderStage;
  source: string;
  entryPoint?: string;
};

export type UniformBinding = {
  name: string;
  offset: number;
  size: number;
};

export type PipelineDescriptor = {
  vertexShader: ShaderDescriptor;
  fragmentShader: ShaderDescriptor;
  vertexAttributes: VertexAttribute[];
  topology: PrimitiveType;
  depthTest?: boolean;
  depthWrite?: boolean;
  cullMode?: 'none' | 'front' | 'back';
  blendMode?: 'none' | 'alpha' | 'additive';
};

export type RenderPassDescriptor = {
  colorAttachments: Array<{
    texture: TextureHandle;
    clear?: [number, number, number, number];
    loadOp?: 'clear' | 'load' | 'discard';
    storeOp?: 'store' | 'discard';
  }>;
  depthStencilAttachment?: {
    texture: TextureHandle;
    depthClear?: number;
    depthLoadOp?: 'clear' | 'load' | 'discard';
    depthStoreOp?: 'store' | 'discard';
  };
};

export type DrawCall = {
  vertexBuffer: BufferHandle;
  indexBuffer?: BufferHandle;
  pipeline: PipelineHandle;
  uniformBuffer?: BufferHandle;
  textureBindings?: Array<{ texture: TextureHandle; slot: number }>;
  vertexCount: number;
  indexCount?: number;
  instanceCount?: number;
};

export type BufferHandle = { id: string; usage: BufferUsage };
export type TextureHandle = { id: string; format: TextureFormat };
export type PipelineHandle = { id: string };

export interface Renderer {
  readonly backend: BackendType;
  readonly capabilities: RendererCapabilities;

  init(canvas: HTMLCanvasElement): Promise<void>;
  destroy(): void;

  resize(width: number, height: number): void;

  createBuffer(desc: BufferDescriptor): BufferHandle;
  updateBuffer(handle: BufferHandle, data: ArrayBuffer, offset?: number): void;
  destroyBuffer(handle: BufferHandle): void;

  createTexture(desc: TextureDescriptor): TextureHandle;
  uploadTextureData(handle: TextureHandle, data: ArrayBufferView): void;
  destroyTexture(handle: TextureHandle): void;

  createPipeline(desc: PipelineDescriptor): PipelineHandle;
  destroyPipeline(handle: PipelineHandle): void;

  beginPass(desc: RenderPassDescriptor): void;
  draw(call: DrawCall): void;
  endPass(): void;

  submit(): void;

  readPixels(
    texture: TextureHandle,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<Uint8Array>;
}

export type RendererCapabilities = {
  maxTextureSize: number;
  maxTextureArrayLayers: number;
  maxBindGroups: number;
  maxUniformBufferBindingSize: number;
  maxStorageBufferBindingSize: number;
  supportsFloatTextures: boolean;
  supportsFloat16Textures: boolean;
  supportsCompressedTextures: boolean;
};

export interface SceneGraph {
  readonly root: SceneNode;

  createNode(name: string): SceneNode;
  removeNode(node: SceneNode): void;

  traverse(callback: (node: SceneNode) => void): void;
  findNode(name: string): SceneNode | null;
}

export interface SceneNode {
  readonly name: string;
  readonly children: SceneNode[];

  position: Vec3d;
  rotation: Quat64;
  scale: Vec3d;

  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;

  localToWorldMatrix: Float64Array;
  worldToLocalMatrix: Float64Array;

  addChild(node: SceneNode): void;
  removeChild(node: SceneNode): void;
  setParent(parent: SceneNode | null): void;
  getParent(): SceneNode | null;

  updateTransform(): void;
}

export interface CameraNode extends SceneNode {
  readonly type: CameraType;

  fov: number;
  aspect: number;
  near: number;
  far: number;

  projectionMatrix: Float64Array;
  viewMatrix: Float64Array;
  viewProjectionMatrix: Float64Array;

  updateProjection(): void;
}

export interface LightNode extends SceneNode {
  readonly type: 'directional' | 'point' | 'spot';

  intensity: number;
  color: [number, number, number];

  range?: number;
  angle?: number;
}

export interface RenderableNode extends SceneNode {
  material: Material;
  geometry: Geometry;

  needsUpdate: boolean;
}

export type MaterialType =
  | 'unlit'
  | 'pbr'
  | 'emissive'
  | 'terrain'
  | 'atmosphere'
  | 'particle';

export interface Material {
  readonly type: MaterialType;
  readonly properties: Record<string, unknown>;

  setProperty(name: string, value: unknown): void;
  getProperty(name: string): unknown;
}

export interface Geometry {
  readonly vertexCount: number;
  readonly indexCount?: number;

  vertexBuffer: BufferHandle;
  indexBuffer?: BufferHandle;
}

export interface RendererFactory {
  create(config: RendererConfig): Promise<Renderer>;
  isSupported(backend: BackendType): boolean;
}

export const rendererFactories: Partial<Record<BackendType, RendererFactory>> = {};

export function registerRendererFactory(backend: BackendType, factory: RendererFactory): void {
  rendererFactories[backend] = factory;
}

export async function createRenderer(config: RendererConfig): Promise<Renderer> {
  const factory = rendererFactories[config.backend];
  if (!factory) {
    throw new Error(`No renderer factory registered for backend: ${config.backend}`);
  }
  return factory.create(config);
}

export { FloatingOrigin, LocalReferenceFrame, HighLowSplitter } from './floating-origin.js';
export { BaseSceneNode, PerspectiveCamera, OrthographicCamera, OrbitController, FlyController } from './camera.js';
export type { CameraType, NavigationMode } from './camera.js';
export { BaseCelestialBody, Sun, Earth, Moon, SunMaterialImpl, EarthMaterialImpl, MoonMaterialImpl, AtmosphereMaterialImpl, SphereGeometry } from './celestial-bodies.js';
export type { CelestialBodyType } from './celestial-bodies.js';
export { TileCoordImpl, TileBoundsImpl, TerrainTileImpl, QuadTreeNodeImpl, TerrainLODControllerImpl, AtmosphereRendererImpl, AtmosphereParamsImpl } from './terrain.js';
export type { TileId, TileLevel, TileCoord, TileBounds, Tile, TerrainTile, QuadTreeNode, TerrainLODController, AtmosphereRenderer, AtmosphereParams } from './terrain.js';
export { LogarithmicScaleMapping, PiecewiseScaleMapping, ScaleManager, convertUnit, toMeters, fromMeters, formatDistance, formatTime, ASTRONOMICAL_UNIT, LIGHT_YEAR, PARSEC } from './scale-mapping.js';
export type { DistanceUnit, ScaleConfig, ScaleMapping } from './scale-mapping.js';
export { StarData, AsteroidBeltImpl, KuiperBeltImpl, OortCloudImpl, SolarWindImpl, MagnetosphereImpl, AurorasImpl, ExtendedSpaceEnvironmentImpl, createExtendedSpaceEnvironment, ASTEROID_BELT_RADIUS_RANGE, ASTEROID_BELT_THICKNESS, KUIPER_BELT_RADIUS_RANGE, KUIPER_BELT_THICKNESS, OORT_CLOUD_INNER_RADIUS, OORT_CLOUD_OUTER_RADIUS, SOLAR_WIND_SPEED } from './extended-space.js';
export type { Star, Asteroid, Comet, Particle, ExtendedSpaceEnvironment, StellarBackground, AsteroidBelt, KuiperBelt, OortCloud, SolarWind, Magnetosphere, Auroras } from './extended-space.js';
export { EventsServiceImpl, CruiseServiceImpl, PureViewingModeImpl, createEventsService, createCruiseService, createPureViewingMode, EVENT_TYPES, CRUISES } from './events-cruises.js';
export type { EventType, CelestialEvent, CruiseWaypoint, Cruise, EventSearchOptions, EventsService, CruiseService, PureViewingMode } from './events-cruises.js';
export { ResourceValidatorImpl, UpdateManagerImpl, TestRunnerImpl, OpsManagerImpl, createResourceValidator, createUpdateManager, createTestRunner, createOpsManager } from './productization.js';
export { RenderLoop } from './render-loop.js';
export type {
  RenderLoopBodyId,
  RenderLoopCamera,
  RenderLoopBodyRenderer,
  RenderLoopOptions,
  RequestAnimationFrameLike,
  CancelAnimationFrameLike,
} from './render-loop.js';
export type { ResourceType, ValidationStatus, ResourceValidationResult, ValidationReport, ResourceValidator, UpdateInfo, UpdateStatus, UpdateManager, TestResult, TestSuiteResult, TestReport, TestEnvironment, TestRunner, MaintenanceTask, OperationalStats, HealthCheckResult, OpsManager } from './productization.js';
