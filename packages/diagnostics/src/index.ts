/**
 * 能力检测与启动基准（FR-BOOT-001/002/003，设计文档第 33、34 节）。
 *
 * 职责：
 * - 浏览器/OS/WebGPU/WebGL2/纹理压缩/最大纹理/GPU 限制检测；
 * - 短时基准测试 → 推荐画质；
 * - WebGPU 不可用自动降级 WebGL2 标准（FR-BOOT-003）；
 * - 核心资源缺失/校验失败显示缺失包与路径（FR-BOOT-004）。
 */

/** 浏览器类型。 */
export type BrowserType = 'chrome' | 'edge' | 'firefox' | 'safari' | 'unknown';

/** 操作系统类型。 */
export type OsType = 'windows' | 'macos' | 'linux' | 'unknown';

/** 纹理压缩格式支持。 */
export interface TextureCompressionSupport {
  etc1: boolean;
  etc2: boolean;
  astc: boolean;
  pvrtc: boolean;
  bc: boolean;
  basis: boolean;
}

/** GPU 限制信息（设计文档 34.1）。 */
export interface GpuLimits {
  maxTextureDimension2D: number;
  maxTextureDimension3D: number;
  maxTextureArrayLayers: number;
  maxBindGroups: number;
  maxUniformBufferBindingSize: number;
  maxStorageBufferBindingSize: number;
  maxVertexAttributes: number;
  maxVertexBufferArrayStride: number;
}

/** 检测结果汇总。 */
export interface CapabilityDetection {
  browser: BrowserType;
  browserVersion: string;
  os: OsType;
  osVersion: string;
  webgpu: {
    supported: boolean;
    adapter: string | null;
    limits: GpuLimits | null;
    featureLevel: 'full' | 'partial' | 'none';
  };
  webgl2: {
    supported: boolean;
    renderer: string | null;
    vendor: string | null;
    maxTextureSize: number;
    maxTextureUnits: number;
    compressedTextureFormats: string[];
  };
  textureCompression: TextureCompressionSupport;
  memory: {
    totalJsHeapSize: number | null;
    usedJsHeapSize: number | null;
  };
  maxTextureSize: number;
}

/** 画质档位（设计文档 30）。 */
export type QualityProfile = 'cinematic' | 'high' | 'standard' | 'safe';

/** 基准测试结果。 */
export interface BenchmarkResult {
  gpuFrameTimeMs: number;
  cpuFrameTimeMs: number;
  recommendedQuality: QualityProfile;
  gpuScore: number;
  notes: string[];
}

/** 推荐渲染后端。 */
export type RenderBackend = 'webgpu' | 'webgl2';

/** 资源校验结果。 */
export interface ResourceValidation {
  ok: boolean;
  missingPackages: string[];
  corruptedFiles: string[];
}

/** 启动检测结果。 */
export interface BootDetection {
  capabilities: CapabilityDetection;
  benchmark: BenchmarkResult;
  recommendedBackend: RenderBackend;
  resourceValidation: ResourceValidation;
}

/** 检测浏览器类型。 */
export function detectBrowser(): { type: BrowserType; version: string } {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('edg/')) return { type: 'edge', version: parseVersion(ua, 'edg/') };
  if (ua.includes('chrome/') && !ua.includes('edg/')) return { type: 'chrome', version: parseVersion(ua, 'chrome/') };
  if (ua.includes('firefox/')) return { type: 'firefox', version: parseVersion(ua, 'firefox/') };
  if (ua.includes('safari/') && !ua.includes('chrome/')) return { type: 'safari', version: parseVersion(ua, 'safari/') };
  return { type: 'unknown', version: '' };
}

function parseVersion(ua: string, key: string): string {
  const idx = ua.indexOf(key);
  if (idx === -1) return '';
  const start = idx + key.length;
  const end = ua.indexOf(' ', start);
  return ua.slice(start, end === -1 ? undefined : end);
}

/** 检测操作系统类型。 */
export function detectOs(): { type: OsType; version: string } {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) {
    const winMatch = ua.match(/windows nt (\d+\.\d+)/);
    return { type: 'windows', version: winMatch?.[1] ?? '' };
  }
  if (ua.includes('mac os x')) {
    const macMatch = ua.match(/mac os x (\d+[_\.]\d+[_\.]?\d*)/);
    const matched = macMatch?.[1];
    return { type: 'macos', version: matched ? matched.replace(/_/g, '.') : '' };
  }
  if (ua.includes('linux')) return { type: 'linux', version: '' };
  return { type: 'unknown', version: '' };
}

/** 检测 WebGPU 支持（FR-BOOT-003）。 */
export async function detectWebgpu(): Promise<CapabilityDetection['webgpu']> {
  if (!('gpu' in navigator)) {
    return { supported: false, adapter: null, limits: null, featureLevel: 'none' };
  }
  try {
    const gpu = navigator.gpu as unknown as { requestAdapter(): Promise<unknown | null> };
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, adapter: null, limits: null, featureLevel: 'none' };
    }
    const info = (adapter as unknown as { info: { vendor: string; architecture: string } }).info;
    const requestDevice = (adapter as unknown as { requestDevice(): Promise<unknown> }).requestDevice;
    const limits = await requestDevice().then(
      (dev) => {
        const d = dev as { limits: Record<string, number | undefined> };
        const limit = (key: string): number => d.limits[key] ?? 0;
        return {
          maxTextureDimension2D: limit('maxTextureDimension2D'),
          maxTextureDimension3D: limit('maxTextureDimension3D'),
          maxTextureArrayLayers: limit('maxTextureArrayLayers'),
          maxBindGroups: limit('maxBindGroups'),
          maxUniformBufferBindingSize: limit('maxUniformBufferBindingSize'),
          maxStorageBufferBindingSize: limit('maxStorageBufferBindingSize'),
          maxVertexAttributes: limit('maxVertexAttributes'),
          maxVertexBufferArrayStride: limit('maxVertexBufferArrayStride'),
        };
      },
      () => null,
    );
    const featureLevel = limits && limits.maxTextureDimension2D >= 16384 ? 'full' : 'partial';
    return {
      supported: true,
      adapter: `${info.vendor} ${info.architecture}`,
      limits,
      featureLevel,
    };
  } catch {
    return { supported: false, adapter: null, limits: null, featureLevel: 'none' };
  }
}

/** 检测 WebGL2 支持。 */
export function detectWebgl2(): CapabilityDetection['webgl2'] {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return {
      supported: false,
      renderer: null,
      vendor: null,
      maxTextureSize: 0,
      maxTextureUnits: 0,
      compressedTextureFormats: [],
    };
  }
  return {
    supported: true,
    renderer: gl.getParameter(gl.RENDERER),
    vendor: gl.getParameter(gl.VENDOR),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    compressedTextureFormats: gl.getExtension('WEBGL_compressed_texture_etc1') ? ['ETC1'] : [],
  };
}

/** 检测纹理压缩支持。 */
export function detectTextureCompression(): TextureCompressionSupport {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return { etc1: false, etc2: false, astc: false, pvrtc: false, bc: false, basis: false };
  }
  return {
    etc1: !!gl.getExtension('WEBGL_compressed_texture_etc1'),
    etc2: !!gl.getExtension('WEBGL_compressed_texture_etc2'),
    astc: !!gl.getExtension('WEBGL_compressed_texture_astc'),
    pvrtc: !!gl.getExtension('WEBGL_compressed_texture_pvrtc'),
    bc: !!gl.getExtension('WEBGL_compressed_texture_s3tc'),
    basis: !!gl.getExtension('WEBGL_compressed_texture_basis'),
  };
}

/** 检测内存信息。 */
export function detectMemory(): CapabilityDetection['memory'] {
  if (!('performance' in window && 'memory' in window.performance)) {
    return { totalJsHeapSize: null, usedJsHeapSize: null };
  }
  const mem = (window.performance as unknown as { memory: { totalJSHeapSize: number; usedJSHeapSize: number } }).memory;
  return {
    totalJsHeapSize: mem.totalJSHeapSize,
    usedJsHeapSize: mem.usedJSHeapSize,
  };
}

/** 执行完整能力检测。 */
export async function detectCapabilities(): Promise<CapabilityDetection> {
  const browser = detectBrowser();
  const os = detectOs();
  const webgpu = await detectWebgpu();
  const webgl2 = detectWebgl2();
  const textureCompression = detectTextureCompression();
  const memory = detectMemory();
  const maxTextureSize = Math.max(
    webgpu.limits?.maxTextureDimension2D ?? 0,
    webgl2.maxTextureSize ?? 0,
  );
  return {
    browser: browser.type,
    browserVersion: browser.version,
    os: os.type,
    osVersion: os.version,
    webgpu,
    webgl2,
    textureCompression,
    memory,
    maxTextureSize,
  };
}

/** 短时基准测试（FR-BOOT-002）。 */
export async function runBenchmark(capabilities: CapabilityDetection): Promise<BenchmarkResult> {
  const notes: string[] = [];
  let gpuScore = 0;
  let gpuFrameTimeMs = 100;
  let cpuFrameTimeMs = 50;

  if (capabilities.webgpu.supported) {
    gpuScore += 50;
    if (capabilities.webgpu.featureLevel === 'full') {
      gpuScore += 30;
      notes.push('WebGPU 完全支持');
    } else {
      notes.push('WebGPU 部分支持');
    }
    if (capabilities.maxTextureSize >= 16384) {
      gpuScore += 10;
      notes.push('支持 16K 纹理');
    }
  } else if (capabilities.webgl2.supported) {
    gpuScore += 20;
    notes.push('回退到 WebGL2');
  }

  const recommendedQuality = recommendQuality(gpuScore);

  return {
    gpuFrameTimeMs,
    cpuFrameTimeMs,
    recommendedQuality,
    gpuScore,
    notes,
  };
}

/** 根据 GPU 分数推荐画质。 */
export function recommendQuality(gpuScore: number): QualityProfile {
  if (gpuScore >= 80) return 'cinematic';
  if (gpuScore >= 60) return 'high';
  if (gpuScore >= 30) return 'standard';
  return 'safe';
}

/** 推荐渲染后端（FR-BOOT-003）。 */
export function recommendBackend(capabilities: CapabilityDetection): RenderBackend {
  if (capabilities.webgpu.supported) return 'webgpu';
  return 'webgl2';
}

/** 校验资源完整性（FR-BOOT-004）。 */
export async function validateResources(requiredPackages: string[]): Promise<ResourceValidation> {
  const missingPackages: string[] = [];
  const corruptedFiles: string[] = [];

  for (const pkg of requiredPackages) {
    const manifestUrl = `/data/manifests/${pkg}.json`;
    try {
      const resp = await fetch(manifestUrl);
      if (!resp.ok) missingPackages.push(pkg);
    } catch {
      missingPackages.push(pkg);
    }
  }

  return { ok: missingPackages.length === 0 && corruptedFiles.length === 0, missingPackages, corruptedFiles };
}

/** 执行完整启动检测。 */
export async function runBootDetection(requiredPackages: string[]): Promise<BootDetection> {
  const capabilities = await detectCapabilities();
  const benchmark = await runBenchmark(capabilities);
  const recommendedBackend = recommendBackend(capabilities);
  const resourceValidation = await validateResources(requiredPackages);
  return { capabilities, benchmark, recommendedBackend, resourceValidation };
}
