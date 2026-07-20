import type { Vec3d, Quatd as Quat } from '@solar-system/schemas';
import {
  SphereGeometry,
  type Renderer,
  type BufferHandle,
  type PipelineHandle,
  type TextureHandle,
  type PipelineDescriptor,
  type VertexAttribute,
  type BackendType,
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

/**
 * Radii (km) for every body in the navigation catalog (Task T-P1-17 / fix E-43).
 * Covers the sun, 8 planets, and all 58+ satellites / dwarf-planets / asteroids /
 * comets so BodyRendererFactoryImpl can look up a radius for any supported body.
 */
export const PLANET_RADII_KM: Record<BodyId, number> = {
  // Star
  10: SOLAR_RADIUS_KM,
  // Planets
  199: 2439.7,
  299: 6051.8,
  399: 6371.0,
  499: 3389.5,
  599: 69911,
  699: 58232,
  799: 25362,
  899: 24622,
  // Earth satellite
  301: 1737.4,
  // Mars satellites
  401: 11.1,
  402: 6.2,
  // Jupiter satellites
  501: 1821.6,
  502: 1560.8,
  503: 2634.1,
  504: 2410.3,
  505: 83.5,
  506: 85,
  // Saturn satellites
  601: 198.2,
  602: 252.1,
  603: 533.1,
  604: 561.4,
  605: 764.3,
  606: 2574.7,
  607: 135,
  608: 735.6,
  // Uranus satellites
  701: 578.9,
  702: 584.7,
  703: 788.9,
  704: 761.4,
  705: 235.8,
  // Neptune satellites
  801: 1353.4,
  802: 170,
  803: 33,
  804: 41,
  805: 75,
  806: 88,
  807: 97,
  808: 210,
  // Pluto satellites
  1343401: 606,
  1343402: 7.5,
  1343403: 23,
  1343404: 12,
  1343405: 34,
  // Dwarf planets
  1: 473,
  134340: 1188.3,
  136199: 1163,
  136472: 715,
  136108: 640,
  // Asteroids
  433: 16.8,
  101955: 0.25,
  951: 8.5,
  243: 14.4,
  25143: 0.18,
  // Comets (string IDs)
  '1P': 11,
  '19P': 4.8,
  '81P': 2.7,
  '9P': 3.0,
};

/**
 * Body ID categories used by BodyRendererFactoryImpl to route bodies that fall
 * outside the explicit switch (sun/earth/planets/moon) to the correct renderer.
 * Mirrors the `type` field of navigation-service catalog entries.
 */
export const SATELLITE_BODY_IDS: ReadonlySet<number> = new Set<number>([
  301, 401, 402, 501, 502, 503, 504, 505, 506,
  601, 602, 603, 604, 605, 606, 607, 608,
  701, 702, 703, 704, 705,
  801, 802, 803, 804, 805, 806, 807, 808,
  1343401, 1343402, 1343403, 1343404, 1343405,
]);

export const DWARF_PLANET_BODY_IDS: ReadonlySet<number> = new Set<number>([
  1, 134340, 136199, 136472, 136108,
]);

export const ASTEROID_BODY_IDS: ReadonlySet<number> = new Set<number>([
  433, 101955, 951, 243, 25143,
]);

export const COMET_BODY_IDS: ReadonlySet<string> = new Set<string>([
  '1P', '19P', '81P', '9P',
]);

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
// E-43: irregular body (asteroid / comet nucleus) surface tints.
const COLOR_ASTEROID: RGB = [0.45, 0.4, 0.35];
const COLOR_COMET: RGB = [0.35, 0.35, 0.4];

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

/**
 * E-43: base colors for asteroid / comet nuclei. Asteroids default to a rocky
 * brown-gray; comet nuclei are darker and bluer. Bodies without an explicit
 * entry fall back to COLOR_ASTEROID inside IrregularBodyRenderer.
 */
const IRREGULAR_BODY_COLORS: Partial<Record<BodyId, RGB>> = {
  '1P': COLOR_COMET,
  '19P': COLOR_COMET,
  '81P': COLOR_COMET,
  '9P': COLOR_COMET,
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
@group(1) @binding(0) var<uniform> viewProj: mat4x4<f32>;
@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> VOut {
  var o: VOut;
  let m = mat4x4<f32>(u[0], u[1], u[2], u[3]);
  o.pos = viewProj * m * vec4<f32>(position, 1.0);
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

// ---------------------------------------------------------------------------
// GLSL ES 3.00 着色器变体（WebGL2 后端使用）
//
// 每个 WGSL 着色器都有对应的 GLSL 版本，逻辑完全一致：
// - 顶点着色器应用 model 矩阵（从 UBO u[0..3]）+ viewProj（u_viewProj uniform）
// - 片段着色器从 UBO 读取材质参数，计算光照/大气/条带等效果
// - UBO 布局：layout(std140, binding=0) uniform BodyUniforms { vec4 u[16]; }
// ---------------------------------------------------------------------------

const GLSL_VERSION = '#version 300 es\nprecision highp float;\n';

const GLSL_VERTEX_SHADER = /* glsl */ `
${GLSL_VERSION}
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 uv;
layout(std140) uniform BodyUniforms {
  vec4 u[16];
};
uniform mat4 u_viewProj;
out vec2 v_uv;
out vec3 v_normal;
void main() {
  mat4 model = mat4(u[0], u[1], u[2], u[3]);
  vec4 worldPos = model * vec4(position, 1.0);
  gl_Position = u_viewProj * worldPos;
  v_uv = uv;
  v_normal = normalize((model * vec4(normal, 0.0)).xyz);
}
`;

const GLSL_SUN_FRAGMENT_SHADER = /* glsl */ `
${GLSL_VERSION}
layout(std140) uniform BodyUniforms {
  vec4 u[16];
};
in vec2 v_uv;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  float time = u[4].x;
  vec3 color = u[6].xyz;
  float intensity = u[6].w;
  float corona = u[7].x;
  float flare = u[7].y;
  float rim = pow(1.0 - max(0.0, v_normal.z), 2.0);
  float pulse = 0.8 + 0.2 * sin(time);
  vec3 col = color * intensity + vec3(corona * rim * pulse + flare * 0.1);
  fragColor = vec4(col, 1.0);
}
`;

const GLSL_PBR_FRAGMENT_SHADER = /* glsl */ `
${GLSL_VERSION}
layout(std140) uniform BodyUniforms {
  vec4 u[16];
};
in vec2 v_uv;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  vec3 n = normalize(v_normal);
  vec3 sunDir = normalize(u[5].xyz);
  vec3 baseColor = u[6].xyz;
  float roughness = u[6].w;
  float metalness = u[7].x;
  float ndl = max(0.0, dot(n, sunDir));
  vec3 diffuse = baseColor * ndl;
  float spec = pow(ndl, mix(4.0, 128.0, 1.0 - roughness)) * metalness;
  fragColor = vec4(diffuse + vec3(spec), 1.0);
}
`;

const GLSL_EARTH_FRAGMENT_SHADER = /* glsl */ `
${GLSL_VERSION}
layout(std140) uniform BodyUniforms {
  vec4 u[16];
};
in vec2 v_uv;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  vec3 n = normalize(v_normal);
  float time = u[4].x;
  vec3 baseColor = u[6].xyz;
  vec3 atmoColor = u[7].xyz;
  float atmoIntensity = u[7].w;
  float cloudCoverage = u[8].x;
  float rim = pow(1.0 - max(0.0, n.z), 3.0);
  vec3 base = baseColor * (0.5 + 0.5 * n.y);
  float cloud = cloudCoverage * (0.5 + 0.5 * sin(v_uv.x * 20.0 + time));
  vec3 atmo = atmoColor * atmoIntensity * rim;
  fragColor = vec4(base + atmo + vec3(cloud * 0.2), 1.0);
}
`;

const GLSL_GAS_GIANT_FRAGMENT_SHADER = /* glsl */ `
${GLSL_VERSION}
layout(std140) uniform BodyUniforms {
  vec4 u[16];
};
in vec2 v_uv;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  float time = u[4].x;
  vec3 baseColor = u[6].xyz;
  float bandCount = u[6].w;
  float bandSeed = u[7].x;
  float bandSpeed = u[7].y;
  float bands = sin(v_uv.y * bandCount * 6.28318 + bandSeed + time * bandSpeed) * 0.5 + 0.5;
  vec3 col = mix(baseColor * 0.7, baseColor * 1.2, bands);
  fragColor = vec4(col, 1.0);
}
`;

const GLSL_RING_FRAGMENT_SHADER = /* glsl */ `
${GLSL_VERSION}
layout(std140) uniform BodyUniforms {
  vec4 u[16];
};
in vec2 v_uv;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  float time = u[4].x;
  vec3 color = u[6].xyz;
  float opacity = u[6].w;
  float bands = sin(v_uv.x * 80.0 + time * 0.5) * 0.5 + 0.5;
  float alpha = opacity * (0.5 + 0.5 * bands);
  fragColor = vec4(color, alpha);
}
`;

/**
 * 着色器种类：顶点 + 各类片段着色器。
 * 每个着色器同时存在 WGSL（WebGPU）与 GLSL ES 3.00（WebGL2）两个版本。
 */
type ShaderKind = 'vertex' | 'sun' | 'pbr' | 'earth' | 'gas_giant' | 'ring';

/** WGSL 着色器表（WebGPU 后端）。 */
const WGSL_SHADERS: Record<ShaderKind, string> = {
  vertex: SPHERE_VERTEX_SHADER,
  sun: SUN_FRAGMENT_SHADER,
  pbr: PBR_FRAGMENT_SHADER,
  earth: EARTH_FRAGMENT_SHADER,
  gas_giant: GAS_GIANT_FRAGMENT_SHADER,
  ring: RING_FRAGMENT_SHADER,
};

/** GLSL ES 3.00 着色器表（WebGL2 后端）。 */
const GLSL_SHADERS: Record<ShaderKind, string> = {
  vertex: GLSL_VERTEX_SHADER,
  sun: GLSL_SUN_FRAGMENT_SHADER,
  pbr: GLSL_PBR_FRAGMENT_SHADER,
  earth: GLSL_EARTH_FRAGMENT_SHADER,
  gas_giant: GLSL_GAS_GIANT_FRAGMENT_SHADER,
  ring: GLSL_RING_FRAGMENT_SHADER,
};

/**
 * 按渲染后端选择着色器源码。
 *
 * WebGPU 使用 WGSL（@vertex/@fragment 语法）；
 * WebGL2 使用 GLSL ES 3.00（#version 300 es，layout 限定符）。
 * 两个版本的着色器逻辑完全一致，仅语法不同。
 *
 * 注意：GLSL ES 3.00 规范要求 `#version 300 es` 必须出现在着色器源码的
 * 第一行。但本文件的 GLSL 着色器模板字面量都以反引号+换行开头，导致
 * `#version` 被推到第二行，编译会失败并报：
 *   `ERROR: 0:2: '#version directive must occur on the first line'`
 * 这里用 replace(/^\n+/) 去除所有前导换行，确保 `#version` 位于第一行。
 * WGSL 没有此约束，但去除前导换行对其也无害。
 */
function selectShader(backend: BackendType, kind: ShaderKind): string {
  const src = backend === 'webgpu' ? WGSL_SHADERS[kind] : GLSL_SHADERS[kind];
  return src.replace(/^\n+/, '');
}

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
        target: 'uniform',
        data: this.uniformData,
      });
    }
  }

  /**
   * Initializes (lazily), uploads the latest per-frame uniform data, then issues
   * a real beginPass/draw/endPass/submit referencing the geometry's BufferHandles.
   *
   * 颜色附件使用 loadOp='load'（保留画布现有内容），使多个 body 渲染器
   * 能在同一画布上叠加绘制；深度附件每次清空以确保 depth test 正确。
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
          loadOp: 'load',
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
    target: 'vertex',
    data: interleaved.buffer,
  });
  const indexBuffer = renderer.createBuffer({
    size: indices.byteLength,
    usage: 'static',
    target: 'index',
    data: indices.buffer,
  });

  return { vertexCount, indexCount, vertexBuffer, indexBuffer, innerRadius, outerRadius };
}

// ---------------------------------------------------------------------------
// E-43: Irregular body geometry (asteroids / comet nuclei).
//
// Builds a UV sphere then perturbs each vertex's radius with a deterministic
// 3D value noise (trilinearly interpolated hash lattice). The result is a
// non-convex, lumpy surface that stands in for the procedurally generated
// shape of small irregular bodies. Vertex layout matches BODY_VERTEX_ATTRIBUTES
// (pos3 + normal3 + uv2 = 32 bytes) so BodyRenderResources can draw it.
// ---------------------------------------------------------------------------

export interface IrregularGeometryData extends BodyGeometry {
  readonly radius: number;
  readonly noiseAmplitude: number;
  readonly noiseSeed: number;
  /** Raw per-vertex positions (length = vertexCount * 3), kept for tests. */
  readonly positions: Float32Array;
}

/** 32-bit hash → [0,1); deterministic value-noise lattice. */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 974711);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

/** Trilinearly interpolated 3D value noise, returns [0,1]. */
function valueNoise3D(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 * (1 - u) + c100 * u;
  const x10 = c010 * (1 - u) + c110 * u;
  const x01 = c001 * (1 - u) + c101 * u;
  const x11 = c011 * (1 - u) + c111 * u;
  const y0 = x00 * (1 - v) + x10 * v;
  const y1 = x01 * (1 - v) + x11 * v;
  return y0 * (1 - w) + y1 * w;
}

/** Fractal Brownian motion summation of value noise; returns [0, ~2]. */
function fbm3D(x: number, y: number, z: number, seed: number, octaves: number = 3): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise3D(x * freq, y * freq, z * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Builds a noise-perturbed sphere. `noiseAmplitude` is a fraction of `radius`
 * (e.g. 0.15 → ±15% radius deformation). The perturbation is sampled from the
 * direction vector so the surface is deterministic and stable across frames.
 */
export function createIrregularGeometry(
  renderer: Renderer,
  radius: number,
  widthSegments: number = 24,
  heightSegments: number = 12,
  noiseAmplitude: number = 0.15,
  noiseSeed: number = 0,
): IrregularGeometryData {
  const vertexCols = widthSegments + 1;
  const vertexRows = heightSegments + 1;
  const vertexCount = vertexCols * vertexRows;
  const indexCount = widthSegments * heightSegments * 6;

  const positions = new Float32Array(vertexCount * 3);
  const interleaved = new Float32Array(vertexCount * 8);
  const indices = new Uint32Array(indexCount);

  const twoPi = Math.PI * 2;
  const amp = radius * noiseAmplitude;

  for (let j = 0; j < vertexRows; j++) {
    const phi = (j / heightSegments) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const v = j / heightSegments;

    for (let i = 0; i < vertexCols; i++) {
      const theta = (i / widthSegments) * twoPi;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const dirX = sinPhi * cosTheta;
      const dirY = cosPhi;
      const dirZ = sinPhi * sinTheta;

      // Sample fbm on the unit direction so the deformation is shape-driven.
      const n = fbm3D(dirX * 2.1, dirY * 2.1, dirZ * 2.1, noiseSeed, 3); // [0,1]
      const r = radius + amp * (n * 2 - 1);

      const px = r * dirX;
      const py = r * dirY;
      const pz = r * dirZ;

      const vertexIndex = j * vertexCols + i;
      const p = vertexIndex * 3;
      const off = vertexIndex * 8;

      positions[p] = px;
      positions[p + 1] = py;
      positions[p + 2] = pz;

      interleaved[off] = px;
      interleaved[off + 1] = py;
      interleaved[off + 2] = pz;
      interleaved[off + 3] = dirX;
      interleaved[off + 4] = dirY;
      interleaved[off + 5] = dirZ;
      interleaved[off + 6] = i / widthSegments;
      interleaved[off + 7] = v;
    }
  }

  let idx = 0;
  for (let j = 0; j < heightSegments; j++) {
    for (let i = 0; i < widthSegments; i++) {
      const a = j * vertexCols + i;
      const b = j * vertexCols + i + 1;
      const c = (j + 1) * vertexCols + i;
      const d = (j + 1) * vertexCols + i + 1;
      indices[idx++] = a;
      indices[idx++] = c;
      indices[idx++] = b;
      indices[idx++] = b;
      indices[idx++] = c;
      indices[idx++] = d;
    }
  }

  const vertexBuffer = renderer.createBuffer({
    size: interleaved.byteLength,
    usage: 'static',
    target: 'vertex',
    data: interleaved.buffer,
  });
  const indexBuffer = renderer.createBuffer({
    size: indices.byteLength,
    usage: 'static',
    target: 'index',
    data: indices.buffer,
  });

  return {
    vertexCount,
    indexCount,
    vertexBuffer,
    indexBuffer,
    radius,
    noiseAmplitude,
    noiseSeed,
    positions,
  };
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
        vertexShader: { stage: 'vertex', source: selectShader(renderer.backend, 'vertex'), entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: selectShader(renderer.backend, 'sun'), entryPoint: 'fs_main' },
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
        vertexShader: { stage: 'vertex', source: selectShader(renderer.backend, 'vertex'), entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: selectShader(renderer.backend, 'pbr'), entryPoint: 'fs_main' },
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
        vertexShader: { stage: 'vertex', source: selectShader(renderer.backend, 'vertex'), entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: selectShader(renderer.backend, 'earth'), entryPoint: 'fs_main' },
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
        vertexShader: { stage: 'vertex', source: selectShader(renderer.backend, 'vertex'), entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: selectShader(renderer.backend, 'gas_giant'), entryPoint: 'fs_main' },
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
        vertexShader: { stage: 'vertex', source: selectShader(renderer.backend, 'vertex'), entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: selectShader(renderer.backend, 'ring'), entryPoint: 'fs_main' },
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

// ---------------------------------------------------------------------------
// E-43: IrregularBodyRenderer for asteroids / comet nuclei.
//
// Uses createIrregularGeometry (noise-perturbed sphere) and drives the same
// BodyRenderResources GPU path as the other body renderers, reusing the PBR
// fragment shader since asteroid / comet surfaces are rocky and lit by the sun.
// ---------------------------------------------------------------------------

export class IrregularBodyRenderer implements BodyRenderer {
  bodyId: BodyId;
  assetTier: AssetTier;
  enabled = true;

  private readonly renderer: Renderer | null;
  private readonly radius: number;
  private readonly noiseAmplitude: number;
  private readonly noiseSeed: number;
  private readonly material: PbrMaterial;

  private currentTime = 0;
  private currentPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private currentOrientation: Quat = { w: 1, x: 0, y: 0, z: 0 };
  private currentSunDirection: Vec3d = { x: 0, y: 0, z: 1 };
  private lodLevel = 0;

  private geometry: IrregularGeometryData | null = null;
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
      noiseAmplitude?: number;
      noiseSeed?: number;
    } = {},
  ) {
    this.bodyId = bodyId;
    this.assetTier = options.assetTier ?? 'B';
    this.renderer = renderer;
    const fallbackRadius = (PLANET_RADII_KM[bodyId] ?? 1) * 1000;
    this.radius = options.radius ?? fallbackRadius;
    // Smaller bodies get lumpier (more irregular) profiles.
    this.noiseAmplitude = options.noiseAmplitude ?? 0.2;
    this.noiseSeed = options.noiseSeed ?? (typeof bodyId === 'number' ? bodyId % 4096 : bodyId.length * 7);
    this.material = {
      shader: 'pbr',
      baseColor: options.baseColor ?? IRREGULAR_BODY_COLORS[bodyId] ?? COLOR_ASTEROID,
      roughness: options.roughness ?? 0.95,
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
    const segments = this.lodLevel >= 2 ? 32 : this.lodLevel >= 1 ? 24 : 16;
    this.geometry = createIrregularGeometry(
      renderer,
      this.radius,
      segments,
      Math.max(8, segments >> 1),
      this.noiseAmplitude,
      this.noiseSeed,
    );
    this.resources = new BodyRenderResources(
      renderer,
      this.geometry,
      {
        vertexShader: { stage: 'vertex', source: selectShader(renderer.backend, 'vertex'), entryPoint: 'vs_main' },
        fragmentShader: { stage: 'fragment', source: selectShader(renderer.backend, 'pbr'), entryPoint: 'fs_main' },
        vertexAttributes: BODY_VERTEX_ATTRIBUTES,
        topology: 'triangles',
        depthTest: true,
        depthWrite: true,
        cullMode: 'none',
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
    // Worst-case bounding radius accounts for the noise bulge.
    return this.radius * (1 + this.noiseAmplitude);
  }

  setLOD(level: number): void {
    this.lodLevel = level;
  }

  getIrregularGeometry(): IrregularGeometryData | null {
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
      default: {
        // E-43: extend coverage to satellites, dwarf-planets, asteroids, comets.
        if (typeof bodyId === 'string') {
          if (COMET_BODY_IDS.has(bodyId)) {
            renderer = new IrregularBodyRenderer(bodyId, this.renderer);
          }
        } else if (ASTEROID_BODY_IDS.has(bodyId)) {
          renderer = new IrregularBodyRenderer(bodyId, this.renderer);
        } else if (SATELLITE_BODY_IDS.has(bodyId) || DWARF_PLANET_BODY_IDS.has(bodyId)) {
          renderer = new SolidPlanetRenderer(bodyId, this.renderer);
        }
        break;
      }
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
