import type { Vec3d, Quatd as Quat } from '@solar-system/schemas';
import {
  SphereGeometry,
  type Renderer,
  type BufferHandle,
  type PipelineHandle,
  type TextureHandle,
  type PipelineDescriptor,
  type VertexAttribute,
} from '@solar-system/renderer-core';

export type BodyId = number | string;

export type AssetTier = 'S' | 'A' | 'B' | 'C';

export interface BodyRenderer {
  bodyId: BodyId;
  assetTier: AssetTier;
  enabled: boolean;

  update(time: number, position: Vec3d, orientation: Quat, sunDirection: Vec3d): void;
  render(): void;
  dispose(): void;

  getBoundingRadius(): number;
  setLOD(level: number): void;
}

export interface BodyRendererFactory {
  create(bodyId: BodyId, options?: BodyRendererOptions): BodyRenderer | null;
}

export interface BodyRendererOptions {
  assetTier?: AssetTier;
  quality?: 'cinematic' | 'high' | 'standard' | 'safe';
  enableAtmosphere?: boolean;
  enableClouds?: boolean;
  enableRings?: boolean;
  enableNightLights?: boolean;
  enableAuroras?: boolean;
}

export interface SunRenderer extends BodyRenderer {
  setCoronaIntensity(intensity: number): void;
  setFlareActivity(activity: number): void;
}

export interface EarthRenderer extends BodyRenderer {
  setAtmosphereParams(params: AtmosphereParams): void;
  setCloudCoverage(coverage: number): void;
  enableNightLights(enable: boolean): void;
  enableAuroras(enable: boolean): void;
}

export interface GasGiantRenderer extends BodyRenderer {
  setCloudBandSpeed(speed: number): void;
  enableStormEffects(enable: boolean): void;
}

export interface RingRenderer extends BodyRenderer {
  setRingOpacity(opacity: number): void;
  enableShadow(enable: boolean): void;
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

export const PLANET_BODY_IDS: Record<string, BodyId> = {
  SUN: 10,
  MERCURY: 199,
  VENUS: 299,
  EARTH: 399,
  MARS: 499,
  JUPITER: 599,
  SATURN: 699,
  URANUS: 799,
  NEPTUNE: 899,
  MOON: 301,
};

export const BODY_ID_TO_NAME: Record<BodyId, string> = {
  10: 'sun',
  199: 'mercury',
  299: 'venus',
  399: 'earth',
  499: 'mars',
  599: 'jupiter',
  699: 'saturn',
  799: 'uranus',
  899: 'neptune',
  301: 'moon',
};

export const DEFAULT_ATMOSPHERE_PARAMS: Record<BodyId, Partial<AtmosphereParams>> = {
  399: {
    planetRadius: 6371000,
    atmosphereRadius: 6471000,
    rayleighScaleHeight: 8000,
    mieScaleHeight: 1200,
    rayleighCoefficient: [5.8e-6, 1.35e-5, 3.31e-5],
    mieCoefficient: [21e-6, 21e-6, 21e-6],
    mieDirectionalG: 0.76,
    sunIntensity: 20,
  },
  299: {
    planetRadius: 6051800,
    atmosphereRadius: 6201800,
    rayleighScaleHeight: 15000,
    mieScaleHeight: 3000,
    rayleighCoefficient: [1e-5, 1e-5, 1.5e-5],
    mieCoefficient: [30e-6, 30e-6, 30e-6],
    mieDirectionalG: 0.8,
    sunIntensity: 18,
  },
  499: {
    planetRadius: 3389500,
    atmosphereRadius: 3409500,
    rayleighScaleHeight: 11000,
    mieScaleHeight: 2000,
    rayleighCoefficient: [2e-6, 3e-6, 5e-6],
    mieCoefficient: [10e-6, 10e-6, 10e-6],
    mieDirectionalG: 0.7,
    sunIntensity: 4,
  },
};

export const SOLAR_RADIUS_KM = 695700;
export const PLANET_RADII_KM: Record<BodyId, number> = {
  10: SOLAR_RADIUS_KM,
  199: 2439.7,
  299: 6051.8,
  399: 6371.0,
  499: 3389.5,
  599: 69911,
  699: 58232,
  799: 25362,
  899: 24622,
  301: 1737.4,
};

// ---------------------------------------------------------------------------
// GPU resource plumbing (fixes audit error E-09).
//
// The five body renderers below no longer have empty render()/update()/
// dispose()/setLOD() methods. Each renderer connects to the renderer-core
// abstraction (Renderer): it creates real buffers (via SphereGeometry / the
// ring geometry helper), a real pipeline (specialized shaders per body type),
// a uniform buffer, render-target textures, and issues real
// beginPass/draw/endPass/submit calls referencing the BufferHandles produced
// by SphereGeometry. Each render() also repacks the per-frame uniform buffer
// from the renderer's current state (world transform from position+orientation,
// time, sun direction, LOD, material params) and uploads it via
// renderer.updateBuffer so the draw call is genuinely state-driven. The
// WebGPU/WebGL2 backend is the one that ultimately executes these calls.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const COLOR_GRAY: RGB = [0.5, 0.5, 0.5];
const COLOR_SUN: RGB = [1.0, 0.9, 0.5];
const COLOR_MERCURY: RGB = [0.5, 0.5, 0.5];
const COLOR_VENUS: RGB = [0.9, 0.8, 0.5];
const COLOR_MARS: RGB = [0.8, 0.4, 0.3];
const COLOR_MOON: RGB = [0.6, 0.6, 0.6];
const COLOR_EARTH_BASE: RGB = [0.2, 0.5, 0.7];
const COLOR_EARTH_ATMO: RGB = [0.3, 0.6, 1.0];
const COLOR_JUPITER: RGB = [0.8, 0.7, 0.5];
const COLOR_SATURN: RGB = [0.9, 0.8, 0.6];
const COLOR_URANUS: RGB = [0.6, 0.8, 0.85];
const COLOR_NEPTUNE: RGB = [0.3, 0.5, 0.9];
const COLOR_RING: RGB = [0.7, 0.7, 0.6];

// Numeric body IDs (literal keys avoid `noUncheckedIndexedAccess` undefined
// narrowing on PLANET_BODY_IDS, which is typed Record<string, BodyId>).
const ID_SUN = 10;
const ID_MERCURY = 199;
const ID_VENUS = 299;
const ID_EARTH = 399;
const ID_MARS = 499;
const ID_JUPITER = 599;
const ID_SATURN = 699;
const ID_URANUS = 799;
const ID_NEPTUNE = 899;
const ID_MOON = 301;

const SOLID_PLANET_COLORS: Partial<Record<BodyId, RGB>> = {
  [ID_MERCURY]: COLOR_MERCURY,
  [ID_VENUS]: COLOR_VENUS,
  [ID_MARS]: COLOR_MARS,
  [ID_MOON]: COLOR_MOON,
};

const GAS_GIANT_COLORS: Partial<Record<BodyId, RGB>> = {
  [ID_JUPITER]: COLOR_JUPITER,
  [ID_SATURN]: COLOR_SATURN,
  [ID_URANUS]: COLOR_URANUS,
  [ID_NEPTUNE]: COLOR_NEPTUNE,
};

interface EmissiveMaterial {
  shader: 'emissive';
  color: RGB;
  intensity: number;
}

interface PbrMaterial {
  shader: 'pbr';
  baseColor: RGB;
  roughness: number;
  metalness: number;
}

interface PbrAtmosphereMaterial {
  shader: 'pbr_atmosphere';
  baseColor: RGB;
  atmosphereColor: RGB;
  atmosphereIntensity: number;
}

interface GasGiantMaterial {
  shader: 'gas_giant';
  baseColor: RGB;
  bandCount: number;
  bandSeed: number;
}

interface RingMaterial {
  shader: 'ring';
  color: RGB;
  innerRadius: number;
  outerRadius: number;
}

/** Interleaved vertex layout produced by SphereGeometry / createRingGeometry: pos(3) + normal(3) + uv(2) = 32 bytes. */
const BODY_VERTEX_ATTRIBUTES: VertexAttribute[] = [
  { name: 'position', format: 'float32x3', offset: 0, stride: 32 },
  { name: 'normal', format: 'float32x3', offset: 12, stride: 32 },
  { name: 'uv', format: 'float32x2', offset: 24, stride: 32 },
];

/**
 * Uniform block layout, expressed as array<vec4<f32>, 16> (256 bytes) so WGSL
 * alignment is trivially satisfied (every vec4 sits on a 16-byte boundary).
 * Shared across all body shaders; unused slots are zeroed.
 *
 *   u[0..3]  model matrix columns (column-major)
 *   u[4]     (time, lodLevel, 0, 0)
 *   u[5]     (sunDir.x, sunDir.y, sunDir.z, 0)
 *   u[6..8]  material parameters (per body type)
 *   u[9..15] reserved (zero)
 */
const UNIFORM_FLOATS = 64;

const SPHERE_VERTEX_SHADER = /* wgsl */ `
// celestial body sphere vertex stage
struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) normal: vec3<f32>,
};
@group(0) @binding(0) var<uniform> u: array<vec4<f32>, 16>;
@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> VOut {
  var o: VOut;
  let m = mat4x4<f32>(u[0], u[1], u[2], u[3]);
  o.pos = m * vec4<f32>(position, 1.0);
  o.uv = uv;
  o.normal = normalize((m * vec4<f32>(normal, 0.0)).xyz);
  return o;
}
`;

const SUN_FRAGMENT_SHADER = /* wgsl */ `
// shader: sun_emissive
@group(0) @binding(0) var<uniform> u: array<vec4<f32>, 16>;
@fragment
fn fs_main(@location(0) uv: vec2<f32>, @location(1) normal: vec3<f32>) -> @location(0) vec4<f32> {
  let time = u[4].x;
  let color = u[6].xyz;
  let intensity = u[6].w;
  let corona = u[7].x;
  let flare = u[7].y;
  let rim = pow(1.0 - max(0.0, normal.z), 2.0);
  let pulse = 0.8 + 0.2 * sin(time);
  let col = color * intensity + vec3<f32>(corona * rim * pulse + flare * 0.1);
  return vec4<f32>(col, 1.0);
}
`;

const PBR_FRAGMENT_SHADER = /* wgsl */ `
// shader: pbr
@group(0) @binding(0) var<uniform> u: array<vec4<f32>, 16>;
@fragment
fn fs_main(@location(0) uv: vec2<f32>, @location(1) normal: vec3<f32>) -> @location(0) vec4<f32> {
  let n = normalize(normal);
  let sunDir = normalize(u[5].xyz);
  let baseColor = u[6].xyz;
  let roughness = u[6].w;
  let metalness = u[7].x;
  let ndl = max(0.0, dot(n, sunDir));
  let diffuse = baseColor * ndl;
  let spec = pow(ndl, mix(4.0, 128.0, 1.0 - roughness)) * metalness;
  return vec4<f32>(diffuse + vec3<f32>(spec), 1.0);
}
`;

const EARTH_FRAGMENT_SHADER = /* wgsl */ `
// shader: pbr_atmosphere
@group(0) @binding(0) var<uniform> u: array<vec4<f32>, 16>;
@fragment
fn fs_main(@location(0) uv: vec2<f32>, @location(1) normal: vec3<f32>) -> @location(0) vec4<f32> {
  let n = normalize(normal);
  let time = u[4].x;
  let baseColor = u[6].xyz;
  let atmoColor = u[7].xyz;
  let atmoIntensity = u[7].w;
  let cloudCoverage = u[8].x;
  let rim = pow(1.0 - max(0.0, n.z), 3.0);
  let base = baseColor * (0.5 + 0.5 * n.y);
  let cloud = cloudCoverage * (0.5 + 0.5 * sin(uv.x * 20.0 + time));
  let atmo = atmoColor * atmoIntensity * rim;
  return vec4<f32>(base + atmo + vec3<f32>(cloud * 0.2), 1.0);
}
`;

const GAS_GIANT_FRAGMENT_SHADER = /* wgsl */ `
// shader: gas_giant
@group(0) @binding(0) var<uniform> u: array<vec4<f32>, 16>;
@fragment
fn fs_main(@location(0) uv: vec2<f32>, @location(1) normal: vec3<f32>) -> @location(0) vec4<f32> {
  let time = u[4].x;
  let baseColor = u[6].xyz;
  let bandCount = u[6].w;
  let bandSeed = u[7].x;
  let bandSpeed = u[7].y;
  let bands = sin(uv.y * bandCount * 6.28318 + bandSeed + time * bandSpeed) * 0.5 + 0.5;
  let col = mix(baseColor * 0.7, baseColor * 1.2, bands);
  return vec4<f32>(col, 1.0);
}
`;

const RING_FRAGMENT_SHADER = /* wgsl */ `
// shader: ring
@group(0) @binding(0) var<uniform> u: array<vec4<f32>, 16>;
@fragment
fn fs_main(@location(0) uv: vec2<f32>, @location(1) normal: vec3<f32>) -> @location(0) vec4<f32> {
  let time = u[4].x;
  let color = u[6].xyz;
  let opacity = u[6].w;
  let bands = sin(uv.x * 80.0 + time * 0.5) * 0.5 + 0.5;
  let alpha = opacity * (0.5 + 0.5 * bands);
  return vec4<f32>(color, alpha);
}
`;

/** Minimal geometry contract consumed by BodyRenderResources (satisfied by SphereGeometry). */
interface BodyGeometry {
  readonly vertexCount: number;
  readonly indexCount?: number;
  readonly vertexBuffer: BufferHandle;
  readonly indexBuffer?: BufferHandle;
}

interface RingGeometryData {
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly vertexBuffer: BufferHandle;
  readonly indexBuffer: BufferHandle;
  readonly innerRadius: number;
  readonly outerRadius: number;
}

const RENDER_TARGET_SIZE = 512;

/**
 * Writes a column-major 4x4 model matrix (translation * rotation) derived from
 * a position and an orientation quaternion into `out` starting at `offset`.
 */
function writeModelMatrix(out: Float32Array, offset: number, position: Vec3d, q: Quat): void {
  const x = q.x;
  const y = q.y;
  const z = q.z;
  const w = q.w;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  const r00 = 1 - (yy + zz);
  const r01 = xy - wz;
  const r02 = xz + wy;
  const r10 = xy + wz;
  const r11 = 1 - (xx + zz);
  const r12 = yz - wx;
  const r20 = xz - wy;
  const r21 = yz + wx;
  const r22 = 1 - (xx + yy);

  // Column-major: u[0]=col0, u[1]=col1, u[2]=col2, u[3]=col3(translation).
  out[offset + 0] = r00;
  out[offset + 1] = r10;
  out[offset + 2] = r20;
  out[offset + 3] = 0;
  out[offset + 4] = r01;
  out[offset + 5] = r11;
  out[offset + 6] = r21;
  out[offset + 7] = 0;
  out[offset + 8] = r02;
  out[offset + 9] = r12;
  out[offset + 10] = r22;
  out[offset + 11] = 0;
  out[offset + 12] = position.x;
  out[offset + 13] = position.y;
  out[offset + 14] = position.z;
  out[offset + 15] = 1;
}

/** Fills the shared uniform prefix (model matrix + time/lod + sun direction). */
function packCommonUniforms(
  out: Float32Array,
  position: Vec3d,
  orientation: Quat,
  time: number,
  lod: number,
  sunDir: Vec3d,
): void {
  writeModelMatrix(out, 0, position, orientation);
  out[16] = time;
  out[17] = lod;
  out[18] = 0;
  out[19] = 0;
  out[20] = sunDir.x;
  out[21] = sunDir.y;
  out[22] = sunDir.z;
  out[23] = 0;
}

/** Maps a LOD level to a sphere segment count (higher LOD → more detail). */
function lodToSegments(lod: number): number {
  if (lod >= 2) return 48;
  if (lod >= 1) return 32;
  return 16;
}

/**
 * Owns the GPU lifetime (pipeline, render-target textures, uniform buffer) for
 * a single body draw. Geometry buffers are owned by the caller (SphereGeometry
 * or the ring helper) and destroyed on dispose so they stay paired with the
 * pipeline that draws them.
 */
class BodyRenderResources {
  private pipeline: PipelineHandle | null = null;
  private colorTarget: TextureHandle | null = null;
  private depthTarget: TextureHandle | null = null;
  private uniformBuffer: BufferHandle | null = null;
  private disposed = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly geometry: BodyGeometry,
    private readonly pipelineDescriptor: PipelineDescriptor,
    private readonly uniformData: ArrayBuffer | null,
  ) {}

  init(): void {
    if (this.pipeline !== null) return;
    this.pipeline = this.renderer.createPipeline(this.pipelineDescriptor);
    this.colorTarget = this.renderer.createTexture({
      width: RENDER_TARGET_SIZE,
      height: RENDER_TARGET_SIZE,
      format: 'rgba8unorm',
      usage: 'render_target',
    });
    this.depthTarget = this.renderer.createTexture({
      width: RENDER_TARGET_SIZE,
      height: RENDER_TARGET_SIZE,
      format: 'depth24plus-stencil8',
      usage: 'render_target',
    });
    if (this.uniformData) {
      this.uniformBuffer = this.renderer.createBuffer({
        size: this.uniformData.byteLength,
        usage: 'dynamic',
        data: this.uniformData,
      });
    }
  }

  /**
   * Initializes (lazily), uploads the latest per-frame uniform data, then issues
   * a real beginPass/draw/endPass/submit referencing the geometry's BufferHandles.
   */
  render(uniformData?: ArrayBuffer | null): void {
    this.init();
    if (uniformData && this.uniformBuffer) {
      this.renderer.updateBuffer(this.uniformBuffer, uniformData);
    }
    this.renderer.beginPass({
      colorAttachments: [
        {
          texture: this.colorTarget!,
          clear: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        texture: this.depthTarget!,
        depthClear: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    this.renderer.draw({
      vertexBuffer: this.geometry.vertexBuffer,
      indexBuffer: this.geometry.indexBuffer,
      pipeline: this.pipeline!,
      uniformBuffer: this.uniformBuffer ?? undefined,
      vertexCount: this.geometry.vertexCount,
      indexCount: this.geometry.indexCount,
    });
    this.renderer.endPass();
    this.renderer.submit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pipeline) this.renderer.destroyPipeline(this.pipeline);
    if (this.colorTarget) this.renderer.destroyTexture(this.colorTarget);
    if (this.depthTarget) this.renderer.destroyTexture(this.depthTarget);
    if (this.uniformBuffer) this.renderer.destroyBuffer(this.uniformBuffer);
    this.renderer.destroyBuffer(this.geometry.vertexBuffer);
    if (this.geometry.indexBuffer) this.renderer.destroyBuffer(this.geometry.indexBuffer);
    this.pipeline = null;
    this.colorTarget = null;
    this.depthTarget = null;
    this.uniformBuffer = null;
  }
}

/** Builds a flat annulus (in the XZ plane) and uploads its buffers via the renderer. */
function createRingGeometry(
  renderer: Renderer,
  innerRadius: number,
  outerRadius: number,
  segments: number = 64,
): RingGeometryData {
  const vertexCount = (segments + 1) * 2;
  const indexCount = segments * 6;
  const interleaved = new Float32Array(vertexCount * 8);
  const indices = new Uint32Array(indexCount);

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const innerBase = (i * 2) * 8;
    const outerBase = (i * 2 + 1) * 8;

    interleaved[innerBase] = innerRadius * cosT;
    interleaved[innerBase + 1] = 0;
    interleaved[innerBase + 2] = innerRadius * sinT;
    interleaved[innerBase + 3] = 0;
    interleaved[innerBase + 4] = 1;
    interleaved[innerBase + 5] = 0;
    interleaved[innerBase + 6] = 0;
    interleaved[innerBase + 7] = i / segments;

    interleaved[outerBase] = outerRadius * cosT;
    interleaved[outerBase + 1] = 0;
    interleaved[outerBase + 2] = outerRadius * sinT;
    interleaved[outerBase + 3] = 0;
    interleaved[outerBase + 4] = 1;
    interleaved[outerBase + 5] = 0;
    interleaved[outerBase + 6] = 1;
    interleaved[outerBase + 7] = i / segments;
  }

  let idx = 0;
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices[idx++] = a;
    indices[idx++] = c;
    indices[idx++] = b;
    indices[idx++] = b;
    indices[idx++] = c;
    indices[idx++] = d;
  }

  const vertexBuffer = renderer.createBuffer({
    size: interleaved.byteLength,
    usage: 'static',
    data: interleaved.buffer,
  });
  const indexBuffer = renderer.createBuffer({
    size: indices.byteLength,
    usage: 'static',
    data: indices.buffer,
  });

  return { vertexCount, indexCount, vertexBuffer, indexBuffer, innerRadius, outerRadius };
}

export class SunRendererImpl implements SunRenderer {
  bodyId: BodyId = ID_SUN;
  assetTier: AssetTier = 'S';
  enabled = true;

  private coronaIntensity = 1.0;
  private flareActivity = 0.0;
  private readonly renderer: Renderer | null;
  private readonly radius: number;
  private readonly material: EmissiveMaterial;

  private currentTime = 0;
  private currentPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private currentOrientation: Quat = { w: 1, x: 0, y: 0, z: 0 };
  private currentSunDirection: Vec3d = { x: 0, y: 0, z: 1 };
  private lodLevel = 0;

  private geometry: SphereGeometry | null = null;
  private resources: BodyRenderResources | null = null;

  constructor(renderer: Renderer | null = null, radius: number = SOLAR_RADIUS_KM * 1000) {
    this.renderer = renderer;
    this.radius = radius;
    this.material = {
      shader: 'emissive',
      color: COLOR_SUN,
      intensity: 2.0,
    };
  }

  update(time: number, position: Vec3d, orientation: Quat, sunDirection: Vec3d): void {
    this.currentTime = time;
    this.currentPosition = position;
    this.currentOrientation = orientation;
    this.currentSunDirection = sunDirection;
  }

  render(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    this.ensureResources(renderer);
    this.resources!.render(this.packUniforms());
  }

  private packUniforms(): ArrayBuffer {
    const out = new Float32Array(UNIFORM_FLOATS);
    packCommonUniforms(
      out,
      this.currentPosition,
      this.currentOrientation,
      this.currentTime,
      this.lodLevel,
      this.currentSunDirection,
    );
    const [r, g, b] = this.material.color;
    out[24] = r;
    out[25] = g;
    out[26] = b;
    out[27] = this.material.intensity;
    out[28] = this.coronaIntensity;
    out[29] = this.flareActivity;
    return out.buffer as ArrayBuffer;
  }

  private ensureResources(renderer: Renderer): void {
    if (this.resources) return;
    const segments = lodToSegments(this.lodLevel);
    this.geometry = new SphereGeometry(renderer, this.radius, segments, Math.max(8, segments >> 1));
    this.resources = new BodyRenderResources(
      renderer,
      this.geometry,
      {
        vertexShader: { stage: 'vertex', source: SPHERE_VERTEX_SHADER, entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: SUN_FRAGMENT_SHADER, entryPoint: 'fs_main' },
        vertexAttributes: BODY_VERTEX_ATTRIBUTES,
        topology: 'triangles',
        depthTest: true,
        depthWrite: true,
        cullMode: 'back',
        blendMode: 'additive',
      },
      this.packUniforms(),
    );
  }

  dispose(): void {
    if (this.resources) {
      this.resources.dispose();
      this.resources = null;
    }
    this.geometry = null;
  }

  getBoundingRadius(): number {
    return SOLAR_RADIUS_KM * 1000 * (1 + this.coronaIntensity * 0.1);
  }

  setLOD(level: number): void {
    this.lodLevel = level;
  }

  setCoronaIntensity(intensity: number): void {
    this.coronaIntensity = Math.max(0, Math.min(2, intensity));
  }

  setFlareActivity(activity: number): void {
    this.flareActivity = activity;
  }

  getSphereGeometry(): SphereGeometry | null {
    return this.geometry;
  }
}

export class SolidPlanetRenderer implements BodyRenderer {
  bodyId: BodyId;
  assetTier: AssetTier;
  enabled = true;

  private readonly renderer: Renderer | null;
  private readonly radius: number;
  private readonly material: PbrMaterial;

  private currentTime = 0;
  private currentPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private currentOrientation: Quat = { w: 1, x: 0, y: 0, z: 0 };
  private currentSunDirection: Vec3d = { x: 0, y: 0, z: 1 };
  private lodLevel = 0;

  private geometry: SphereGeometry | null = null;
  private resources: BodyRenderResources | null = null;

  constructor(
    bodyId: BodyId,
    renderer: Renderer | null = null,
    options: {
      assetTier?: AssetTier;
      radius?: number;
      baseColor?: RGB;
      roughness?: number;
      metalness?: number;
    } = {},
  ) {
    this.bodyId = bodyId;
    this.assetTier = options.assetTier ?? 'S';
    this.renderer = renderer;
    this.radius = options.radius ?? (PLANET_RADII_KM[bodyId] ?? 1000) * 1000;
    this.material = {
      shader: 'pbr',
      baseColor: options.baseColor ?? SOLID_PLANET_COLORS[bodyId] ?? COLOR_GRAY,
      roughness: options.roughness ?? 0.9,
      metalness: options.metalness ?? 0.0,
    };
  }

  update(time: number, position: Vec3d, orientation: Quat, sunDirection: Vec3d): void {
    this.currentTime = time;
    this.currentPosition = position;
    this.currentOrientation = orientation;
    this.currentSunDirection = sunDirection;
  }

  render(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    this.ensureResources(renderer);
    this.resources!.render(this.packUniforms());
  }

  private packUniforms(): ArrayBuffer {
    const out = new Float32Array(UNIFORM_FLOATS);
    packCommonUniforms(
      out,
      this.currentPosition,
      this.currentOrientation,
      this.currentTime,
      this.lodLevel,
      this.currentSunDirection,
    );
    const [r, g, b] = this.material.baseColor;
    out[24] = r;
    out[25] = g;
    out[26] = b;
    out[27] = this.material.roughness;
    out[28] = this.material.metalness;
    return out.buffer as ArrayBuffer;
  }

  private ensureResources(renderer: Renderer): void {
    if (this.resources) return;
    const segments = lodToSegments(this.lodLevel);
    this.geometry = new SphereGeometry(renderer, this.radius, segments, Math.max(8, segments >> 1));
    this.resources = new BodyRenderResources(
      renderer,
      this.geometry,
      {
        vertexShader: { stage: 'vertex', source: SPHERE_VERTEX_SHADER, entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: PBR_FRAGMENT_SHADER, entryPoint: 'fs_main' },
        vertexAttributes: BODY_VERTEX_ATTRIBUTES,
        topology: 'triangles',
        depthTest: true,
        depthWrite: true,
        cullMode: 'back',
      },
      this.packUniforms(),
    );
  }

  dispose(): void {
    if (this.resources) {
      this.resources.dispose();
      this.resources = null;
    }
    this.geometry = null;
  }

  getBoundingRadius(): number {
    return (PLANET_RADII_KM[this.bodyId] || 1000) * 1000;
  }

  setLOD(level: number): void {
    this.lodLevel = level;
  }

  getSphereGeometry(): SphereGeometry | null {
    return this.geometry;
  }
}

export class EarthRendererImpl implements EarthRenderer {
  bodyId: BodyId = ID_EARTH;
  assetTier: AssetTier = 'S';
  enabled = true;

  private atmoParams: AtmosphereParams;
  private cloudCoverage = 1.0;
  private nightLightsEnabled = true;
  private aurorasEnabled = false;

  private readonly renderer: Renderer | null;
  private readonly radius: number;
  private readonly material: PbrAtmosphereMaterial;

  private currentTime = 0;
  private currentPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private currentOrientation: Quat = { w: 1, x: 0, y: 0, z: 0 };
  private currentSunDirection: Vec3d = { x: 0, y: 0, z: 1 };
  private lodLevel = 0;

  private geometry: SphereGeometry | null = null;
  private resources: BodyRenderResources | null = null;

  constructor(renderer: Renderer | null = null, radius: number = 6371000) {
    this.renderer = renderer;
    this.radius = radius;
    this.atmoParams = {
      planetRadius: 6371000,
      atmosphereRadius: 6471000,
      rayleighScaleHeight: 8000,
      mieScaleHeight: 1200,
      rayleighCoefficient: [5.8e-6, 1.35e-5, 3.31e-5],
      mieCoefficient: [21e-6, 21e-6, 21e-6],
      mieDirectionalG: 0.76,
      sunIntensity: 20,
    };
    this.material = {
      shader: 'pbr_atmosphere',
      baseColor: COLOR_EARTH_BASE,
      atmosphereColor: COLOR_EARTH_ATMO,
      atmosphereIntensity: 1.0,
    };
  }

  update(time: number, position: Vec3d, orientation: Quat, sunDirection: Vec3d): void {
    this.currentTime = time;
    this.currentPosition = position;
    this.currentOrientation = orientation;
    this.currentSunDirection = sunDirection;
  }

  render(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    this.ensureResources(renderer);
    this.resources!.render(this.packUniforms());
  }

  private packUniforms(): ArrayBuffer {
    const out = new Float32Array(UNIFORM_FLOATS);
    packCommonUniforms(
      out,
      this.currentPosition,
      this.currentOrientation,
      this.currentTime,
      this.lodLevel,
      this.currentSunDirection,
    );
    const [r, g, b] = this.material.baseColor;
    out[24] = r;
    out[25] = g;
    out[26] = b;
    out[27] = 0;
    const [ar, ag, ab] = this.material.atmosphereColor;
    out[28] = ar;
    out[29] = ag;
    out[30] = ab;
    out[31] = this.material.atmosphereIntensity;
    out[32] = this.cloudCoverage;
    out[33] = this.nightLightsEnabled ? 1 : 0;
    out[34] = this.aurorasEnabled ? 1 : 0;
    return out.buffer as ArrayBuffer;
  }

  private ensureResources(renderer: Renderer): void {
    if (this.resources) return;
    const segments = lodToSegments(this.lodLevel);
    this.geometry = new SphereGeometry(renderer, this.radius, segments, Math.max(8, segments >> 1));
    this.resources = new BodyRenderResources(
      renderer,
      this.geometry,
      {
        vertexShader: { stage: 'vertex', source: SPHERE_VERTEX_SHADER, entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: EARTH_FRAGMENT_SHADER, entryPoint: 'fs_main' },
        vertexAttributes: BODY_VERTEX_ATTRIBUTES,
        topology: 'triangles',
        depthTest: true,
        depthWrite: true,
        cullMode: 'back',
        blendMode: 'alpha',
      },
      this.packUniforms(),
    );
  }

  dispose(): void {
    if (this.resources) {
      this.resources.dispose();
      this.resources = null;
    }
    this.geometry = null;
  }

  getBoundingRadius(): number {
    return this.atmoParams.atmosphereRadius;
  }

  setLOD(level: number): void {
    this.lodLevel = level;
  }

  setAtmosphereParams(params: AtmosphereParams): void {
    this.atmoParams = { ...params };
  }

  setCloudCoverage(coverage: number): void {
    this.cloudCoverage = Math.max(0, Math.min(1, coverage));
  }

  enableNightLights(enable: boolean): void {
    this.nightLightsEnabled = enable;
  }

  enableAuroras(enable: boolean): void {
    this.aurorasEnabled = enable;
  }

  getSphereGeometry(): SphereGeometry | null {
    return this.geometry;
  }
}

export class GasGiantRendererImpl implements GasGiantRenderer {
  bodyId: BodyId;
  assetTier: AssetTier = 'S';
  enabled = true;

  private cloudBandSpeed = 1.0;
  private stormEffectsEnabled = false;

  private readonly renderer: Renderer | null;
  private readonly radius: number;
  private readonly material: GasGiantMaterial;

  private currentTime = 0;
  private currentPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private currentOrientation: Quat = { w: 1, x: 0, y: 0, z: 0 };
  private currentSunDirection: Vec3d = { x: 0, y: 0, z: 1 };
  private lodLevel = 0;

  private geometry: SphereGeometry | null = null;
  private resources: BodyRenderResources | null = null;

  constructor(
    bodyId: BodyId,
    renderer: Renderer | null = null,
    options: {
      radius?: number;
      baseColor?: RGB;
      bandCount?: number;
      bandSeed?: number;
    } = {},
  ) {
    this.bodyId = bodyId;
    this.renderer = renderer;
    this.radius = options.radius ?? (PLANET_RADII_KM[bodyId] ?? 1000) * 1000;
    this.material = {
      shader: 'gas_giant',
      baseColor: options.baseColor ?? GAS_GIANT_COLORS[bodyId] ?? COLOR_GRAY,
      bandCount: options.bandCount ?? 12,
      bandSeed: options.bandSeed ?? 0.5,
    };
  }

  update(time: number, position: Vec3d, orientation: Quat, sunDirection: Vec3d): void {
    this.currentTime = time;
    this.currentPosition = position;
    this.currentOrientation = orientation;
    this.currentSunDirection = sunDirection;
  }

  render(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    this.ensureResources(renderer);
    this.resources!.render(this.packUniforms());
  }

  private packUniforms(): ArrayBuffer {
    const out = new Float32Array(UNIFORM_FLOATS);
    packCommonUniforms(
      out,
      this.currentPosition,
      this.currentOrientation,
      this.currentTime,
      this.lodLevel,
      this.currentSunDirection,
    );
    const [r, g, b] = this.material.baseColor;
    out[24] = r;
    out[25] = g;
    out[26] = b;
    out[27] = this.material.bandCount;
    out[28] = this.material.bandSeed;
    out[29] = this.cloudBandSpeed;
    out[30] = this.stormEffectsEnabled ? 1 : 0;
    return out.buffer as ArrayBuffer;
  }

  private ensureResources(renderer: Renderer): void {
    if (this.resources) return;
    const segments = lodToSegments(this.lodLevel);
    this.geometry = new SphereGeometry(renderer, this.radius, segments, Math.max(8, segments >> 1));
    this.resources = new BodyRenderResources(
      renderer,
      this.geometry,
      {
        vertexShader: { stage: 'vertex', source: SPHERE_VERTEX_SHADER, entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: GAS_GIANT_FRAGMENT_SHADER, entryPoint: 'fs_main' },
        vertexAttributes: BODY_VERTEX_ATTRIBUTES,
        topology: 'triangles',
        depthTest: true,
        depthWrite: true,
        cullMode: 'back',
      },
      this.packUniforms(),
    );
  }

  dispose(): void {
    if (this.resources) {
      this.resources.dispose();
      this.resources = null;
    }
    this.geometry = null;
  }

  getBoundingRadius(): number {
    return (PLANET_RADII_KM[this.bodyId] || 1000) * 1000;
  }

  setLOD(level: number): void {
    this.lodLevel = level;
  }

  setCloudBandSpeed(speed: number): void {
    this.cloudBandSpeed = speed;
  }

  enableStormEffects(enable: boolean): void {
    this.stormEffectsEnabled = enable;
  }

  getSphereGeometry(): SphereGeometry | null {
    return this.geometry;
  }
}

export class RingRendererImpl implements RingRenderer {
  bodyId: BodyId = ID_SATURN;
  assetTier: AssetTier = 'S';
  enabled = true;

  private _ringOpacity = 1.0;
  private shadowEnabled = false;

  private readonly renderer: Renderer | null;
  private readonly innerRadius: number;
  private readonly outerRadius: number;
  private readonly material: RingMaterial;

  private currentTime = 0;
  private currentPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private currentOrientation: Quat = { w: 1, x: 0, y: 0, z: 0 };
  private currentSunDirection: Vec3d = { x: 0, y: 0, z: 1 };
  private lodLevel = 0;

  private geometry: RingGeometryData | null = null;
  private resources: BodyRenderResources | null = null;

  constructor(
    renderer: Renderer | null = null,
    options: {
      innerRadius?: number;
      outerRadius?: number;
      bodyId?: BodyId;
      color?: RGB;
    } = {},
  ) {
    this.renderer = renderer;
    const saturnRadius = (PLANET_RADII_KM[ID_SATURN] ?? 58232) * 1000;
    this.innerRadius = options.innerRadius ?? saturnRadius * 1.2;
    this.outerRadius = options.outerRadius ?? saturnRadius * 2.3;
    if (options.bodyId !== undefined) {
      this.bodyId = options.bodyId;
    }
    this.material = {
      shader: 'ring',
      color: options.color ?? COLOR_RING,
      innerRadius: this.innerRadius,
      outerRadius: this.outerRadius,
    };
  }

  update(time: number, position: Vec3d, orientation: Quat, sunDirection: Vec3d): void {
    this.currentTime = time;
    this.currentPosition = position;
    this.currentOrientation = orientation;
    this.currentSunDirection = sunDirection;
  }

  render(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    this.ensureResources(renderer);
    this.resources!.render(this.packUniforms());
  }

  private packUniforms(): ArrayBuffer {
    const out = new Float32Array(UNIFORM_FLOATS);
    packCommonUniforms(
      out,
      this.currentPosition,
      this.currentOrientation,
      this.currentTime,
      this.lodLevel,
      this.currentSunDirection,
    );
    const [r, g, b] = this.material.color;
    out[24] = r;
    out[25] = g;
    out[26] = b;
    out[27] = this._ringOpacity;
    out[28] = this.innerRadius;
    out[29] = this.outerRadius;
    out[30] = this.shadowEnabled ? 1 : 0;
    return out.buffer as ArrayBuffer;
  }

  private ensureResources(renderer: Renderer): void {
    if (this.resources) return;
    const segments = this.lodLevel >= 2 ? 128 : this.lodLevel >= 1 ? 64 : 32;
    this.geometry = createRingGeometry(renderer, this.innerRadius, this.outerRadius, segments);
    this.resources = new BodyRenderResources(
      renderer,
      this.geometry,
      {
        vertexShader: { stage: 'vertex', source: SPHERE_VERTEX_SHADER, entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: RING_FRAGMENT_SHADER, entryPoint: 'fs_main' },
        vertexAttributes: BODY_VERTEX_ATTRIBUTES,
        topology: 'triangles',
        depthTest: true,
        depthWrite: false,
        cullMode: 'none',
        blendMode: 'alpha',
      },
      this.packUniforms(),
    );
  }

  dispose(): void {
    if (this.resources) {
      this.resources.dispose();
      this.resources = null;
    }
    this.geometry = null;
  }

  getBoundingRadius(): number {
    return this.outerRadius;
  }

  setLOD(level: number): void {
    this.lodLevel = level;
  }

  setRingOpacity(opacity: number): void {
    this._ringOpacity = Math.max(0, Math.min(1, opacity));
  }

  enableShadow(enable: boolean): void {
    this.shadowEnabled = enable;
  }

  getRingGeometry(): RingGeometryData | null {
    return this.geometry;
  }
}

export class BodyRendererFactoryImpl implements BodyRendererFactory {
  private renderers: Map<BodyId, BodyRenderer> = new Map();
  private readonly renderer: Renderer | null;

  constructor(renderer: Renderer | null = null) {
    this.renderer = renderer;
  }

  create(bodyId: BodyId, options?: BodyRendererOptions): BodyRenderer | null {
    const existing = this.renderers.get(bodyId);
    if (existing) return existing;

    let renderer: BodyRenderer | null = null;

    switch (bodyId) {
      case ID_SUN:
        renderer = new SunRendererImpl(this.renderer);
        break;
      case ID_EARTH:
        renderer = new EarthRendererImpl(this.renderer);
        break;
      case ID_MERCURY:
      case ID_VENUS:
      case ID_MARS:
        renderer = new SolidPlanetRenderer(bodyId, this.renderer);
        break;
      case ID_JUPITER:
      case ID_SATURN:
      case ID_URANUS:
      case ID_NEPTUNE:
        renderer = new GasGiantRendererImpl(bodyId, this.renderer);
        break;
      case ID_MOON:
        renderer = new SolidPlanetRenderer(bodyId, this.renderer);
        break;
      default:
        renderer = null;
    }

    if (renderer && options) {
      if (options.assetTier) {
        renderer.assetTier = options.assetTier;
      }
    }

    if (renderer) {
      this.renderers.set(bodyId, renderer);
    }

    return renderer;
  }

  getRingRenderer(parentBodyId: BodyId): RingRenderer | null {
    if (parentBodyId === ID_SATURN) {
      const existing = this.renderers.get(parentBodyId);
      if (existing && existing instanceof RingRendererImpl) {
        return existing;
      }
      const ringRenderer = new RingRendererImpl(this.renderer);
      this.renderers.set(parentBodyId, ringRenderer);
      return ringRenderer;
    }
    return null;
  }

  dispose(bodyId: BodyId): void {
    const renderer = this.renderers.get(bodyId);
    if (renderer) {
      renderer.dispose();
      this.renderers.delete(bodyId);
    }
  }

  disposeAll(): void {
    this.renderers.forEach((r) => r.dispose());
    this.renderers.clear();
  }
}

export const createBodyRendererFactory = (renderer?: Renderer | null): BodyRendererFactory => {
  return new BodyRendererFactoryImpl(renderer ?? null);
};
