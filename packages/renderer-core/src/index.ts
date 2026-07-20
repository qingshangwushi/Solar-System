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

/**
 * 缓冲区绑定目标类型。
 *
 * WebGL2 / OpenGL ES 3.0 规范要求：缓冲区对象在首次绑定到某个 target 时获得
 * 对应的「类型」，之后不能再绑定到其他 target（否则产生 INVALID_OPERATION）。
 * 因此 `createBuffer` 必须知道缓冲区的最终用途，以便首次绑定到正确的 target。
 *
 * WebGPU 后端不区分 target（通过 binding layout 描述用法），此字段对 WebGPU 无影响。
 */
export type BufferTarget = 'vertex' | 'index' | 'uniform';

export type BufferDescriptor = {
  size: number;
  usage: BufferUsage;
  /** 缓冲区用途；默认 'vertex'。index buffer 必须显式传 'index'，否则 WebGL2 后端会将其绑定为 ARRAY_BUFFER 导致后续无法绑定到 ELEMENT_ARRAY_BUFFER。 */
  target?: BufferTarget;
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
export type PipelineHandle = { id: string; descriptor?: PipelineDescriptor };

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

  /**
   * 设置当前帧的 view-projection 矩阵（列主序 4×4，16 个 float）。
   *
   * 编排器每帧调用一次，渲染后端在 draw() 时将其上传到 shader 的
   * `u_viewProj` uniform，使天体顶点能从模型空间→世界空间→裁剪空间。
   * 若后端未调用此方法，shader 中 u_viewProj 默认为单位矩阵。
   */
  setViewProj(matrix: ArrayLike<number>): void;

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
export { BaseSceneNode, PerspectiveCamera, OrthographicCamera, OrbitController, FlyController, FollowController, SurfaceLowController, CameraTransition, DynamicClipPlane, PresetViewManager, createMinDistanceCollisionChecker, computeScaleAwareSpeed, computeSmallBodyFactor, DEFAULT_SCALE_AWARE_CONFIG } from './camera.js';
export type { CameraType, NavigationMode, CameraController, CollisionChecker, ScaleAwareConfig, PresetViewType, PresetView } from './camera.js';
export { BaseCelestialBody, Sun, Earth, Moon, SunMaterialImpl, EarthMaterialImpl, MoonMaterialImpl, AtmosphereMaterialImpl, SphereGeometry } from './celestial-bodies.js';
export type { CelestialBodyType } from './celestial-bodies.js';
export { TileCoordImpl, TileBoundsImpl, TerrainTileImpl, QuadTreeNodeImpl, TerrainLODControllerImpl, AtmosphereRendererImpl, AtmosphereParamsImpl, SurfaceCameraImpl, IrregularBodyRendererImpl, calculateScreenSpaceError } from './terrain.js';
export type { TileId, TileLevel, TileCoord, TileBounds, Tile, TerrainTile, QuadTreeNode, TerrainLODController, AtmosphereRenderer, AtmosphereParams, ElevationData, TerrainLODConfig } from './terrain.js';
export { LogarithmicScaleMapping, PiecewiseScaleMapping, ScaleManager, convertUnit, toMeters, fromMeters, formatDistance, formatTime, ASTRONOMICAL_UNIT, LIGHT_YEAR, PARSEC } from './scale-mapping.js';
export type { DistanceUnit, ScaleConfig, ScaleMapping, EnhancedModeAnnotation } from './scale-mapping.js';
export { StarData, AsteroidBeltImpl, KuiperBeltImpl, OortCloudImpl, SolarWindImpl, MagnetosphereImpl, AurorasImpl, TrojanGroupImpl, HeliopauseImpl, CurrentSheetImpl, GalaxyImpl, ExtendedSpaceEnvironmentImpl, createExtendedSpaceEnvironment, drawPointList, ASTEROID_BELT_RADIUS_RANGE, ASTEROID_BELT_THICKNESS, KUIPER_BELT_RADIUS_RANGE, KUIPER_BELT_THICKNESS, OORT_CLOUD_INNER_RADIUS, OORT_CLOUD_OUTER_RADIUS, SOLAR_WIND_SPEED, TROJAN_GROUP_DEFAULT_BODY_ID, TROJAN_GROUP_DEFAULT_ORBIT_RADIUS, TROJAN_GROUP_DEFAULT_COUNT_PER_SWARM, HELIOPAUSE_DEFAULT_RADIUS, HELIOPAUSE_DEFAULT_POINT_COUNT, CURRENT_SHEET_DEFAULT_RADIUS, CURRENT_SHEET_DEFAULT_WAVINESS, CURRENT_SHEET_DEFAULT_RADIAL_SEGMENTS, CURRENT_SHEET_DEFAULT_AZIMUTH_SEGMENTS, GALAXY_DEFAULT_STAR_COUNT, GALAXY_DEFAULT_DISTANCE, GALAXY_DEFAULT_TILT } from './extended-space.js';
export type { Star, Asteroid, Comet, Particle, ExtendedSpaceEnvironment, StellarBackground, AsteroidBelt, KuiperBelt, OortCloud, SolarWind, Magnetosphere, Auroras, TrojanGroup, Heliopause, CurrentSheet, Galaxy } from './extended-space.js';
export { EventsServiceImpl, CruiseServiceImpl, PureViewingModeImpl, createEventsService, createCruiseService, createPureViewingMode, EventTimelinePlayer, jumpToEventMax, EVENT_TYPES, CRUISES } from './events-cruises.js';
export type { EventType, CelestialEvent, EventResult, CruiseWaypoint, Cruise, EventSearchOptions, EventsService, CruiseService, PureViewingMode, CruiseCallbacks, PureViewingCallbacks, TimeSetting, CameraTarget, CameraDirection, LayerVisibility, ResourcePreload, TextCard, ExitState, ScaleMode, EventCameraRecommendation, JumpToEventResult } from './events-cruises.js';
export { ResourceValidatorImpl, UpdateManagerImpl, TestRunnerImpl, OpsManagerImpl, DefaultTestExecutor, PackageInstallerImpl, createResourceValidator, createUpdateManager, createTestRunner, createOpsManager, createPackageInstaller } from './productization.js';
export { RenderLoop } from './render-loop.js';
export type {
  RenderLoopBodyId,
  RenderLoopCamera,
  RenderLoopBodyRenderer,
  RenderLoopOptions,
  RequestAnimationFrameLike,
  CancelAnimationFrameLike,
} from './render-loop.js';
export type { ResourceType, ValidationStatus, ResourceValidationResult, ValidationReport, ResourceValidator, UpdateInfo, UpdateStatus, UpdateManager, UpdateManagerConfig, RemoteManifest, TestResult, TestSuiteResult, TestReport, TestEnvironment, TestRunner, TestExecutor, TestExecutorResult, TestRunResult, MaintenanceTask, OperationalStats, HealthCheckResult, OpsManager, PackageInstallStatus, PackageInstallResult, InstalledPackageEntry, PackageInstaller, PackageInstallerConfig } from './productization.js';
export {
  applyToneMapping,
  applyColorGrading,
  applyVignette,
  computeBloomThreshold,
  computeGaussianWeights,
  gaussianBlur1D,
  lerp,
  blendColors,
  DEFAULT_TONE_MAPPING,
  DEFAULT_BLOOM,
  DEFAULT_COLOR_GRADING,
  DEFAULT_VIGNETTE,
  DEFAULT_CHROMATIC_ABERRATION,
  DEFAULT_POST_PROCESSING,
  CPUTextureProxy,
  ToneMappingStage,
  LuminanceExtractionStage,
  BloomDownsampleStage,
  BloomUpsampleStage,
  ColorGradingStage,
  VignetteStage,
  PostProcessingPipelineImpl,
  createDefaultPipeline,
} from './hdr.js';
export type {
  ToneMappingMode,
  ToneMappingParams,
  BloomParams,
  ColorGradingParams,
  ColorAdjustment,
  VignetteParams,
  ChromaticAberrationParams,
  PostProcessingParams,
  PostProcessingTexture,
  PostProcessingRenderer,
  PostProcessingStage,
  PostProcessingPipeline,
} from './hdr.js';
export {
  detectGPU,
  estimateGPUPerformance,
  getQualityLevelFromScore,
  getQualityPreset,
  autoDetectQuality,
  PerformanceMonitor,
  getRecommendedTextureSize,
  getRecommendedShadowResolution,
  getRecommendedParticleCount,
} from './quality.js';
export type {
  QualityLevel,
  GPUVendor,
  GPUInfo,
  QualitySettings,
  PerformanceMetrics,
} from './quality.js';
export {
  computeShadowCone,
  computeEclipseGeometry,
  computeLunarEclipse,
  computeShadowOnSurface,
  computeShadowMapParams,
  computeContactTimes,
  sampleShadowPCF,
  findRoot,
} from './shadows.js';
export type { ShadowCone, EclipseInfo, ShadowParams, ContactPoint, ContactEventType } from './shadows.js';

// E-06 / E-07 新增导出（GPU post-processing pipeline + shadow map pass）
export { DEFAULT_GPU_POST_PROCESSING } from './hdr.js';
export type { PostProcessingOptions, GPUPostProcessingPipeline } from './hdr.js';
export {
  computeContactTimesFromSeparation,
  ArrayShadowMap,
  DEFAULT_SHADOW_MAP_OPTIONS,
} from './shadows.js';
export type {
  ShadowMap,
  ShadowMapSampler,
  ContactTime,
  BoundingBox,
  ShadowMapOptions,
  ShadowMapPass,
} from './shadows.js';
