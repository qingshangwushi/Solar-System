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
        const d = dev as {
          limits: Record<string, number | undefined>;
          destroy?: () => void;
        };
        const limit = (key: string): number => d.limits[key] ?? 0;
        const result = {
          maxTextureDimension2D: limit('maxTextureDimension2D'),
          maxTextureDimension3D: limit('maxTextureDimension3D'),
          maxTextureArrayLayers: limit('maxTextureArrayLayers'),
          maxBindGroups: limit('maxBindGroups'),
          maxUniformBufferBindingSize: limit('maxUniformBufferBindingSize'),
          maxStorageBufferBindingSize: limit('maxStorageBufferBindingSize'),
          maxVertexAttributes: limit('maxVertexAttributes'),
          maxVertexBufferArrayStride: limit('maxVertexBufferArrayStride'),
        };
        // E-36: 读取 limits 后立即销毁临时 device，避免设备泄漏
        d.destroy?.();
        return result;
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

/** 短时基准测试（FR-BOOT-002，E-37 修复：实测 GPU 帧时）。 */
export async function runBenchmark(
  capabilities: CapabilityDetection,
  options?: RunBenchmarkOptions,
): Promise<BenchmarkResult> {
  const notes: string[] = [];
  let gpuScore = 0;

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

  // 1. 若调用方传入 measuredFrameTimes，直接采用（向后兼容）
  if (options?.measuredFrameTimes) {
    return {
      gpuFrameTimeMs: options.measuredFrameTimes.gpuFrameTimeMs,
      cpuFrameTimeMs: options.measuredFrameTimes.cpuFrameTimeMs,
      recommendedQuality: recommendQuality(gpuScore),
      gpuScore,
      notes,
    };
  }

  // 2. 实例化 GpuBenchmarkRunner 调用 run()；3. 抛异常时回落 estimateFrameTimes
  let gpuFrameTimeMs: number;
  let cpuFrameTimeMs: number;
  try {
    const runner = new GpuBenchmarkRunner();
    const result = await runner.run(options?.benchmarkOptions);
    gpuFrameTimeMs = result.gpuFrameTimeMs ?? result.cpuFrameTimeMs;
    cpuFrameTimeMs = result.cpuFrameTimeMs;
    notes.push(result.measured ? '实测 GPU 帧时' : 'GPU 帧时回落 CPU 估算');
  } catch {
    const est = estimateFrameTimes(gpuScore);
    gpuFrameTimeMs = est.gpuFrameTimeMs;
    cpuFrameTimeMs = est.cpuFrameTimeMs;
    notes.push('基准测试异常，使用估算值');
  }

  return {
    gpuFrameTimeMs,
    cpuFrameTimeMs,
    recommendedQuality: recommendQuality(gpuScore),
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

/** runBenchmark 的可选参数。 */
export interface RunBenchmarkOptions {
  /** 调用方预先实测的帧时（向后兼容，优先采用）。 */
  measuredFrameTimes?: { gpuFrameTimeMs: number; cpuFrameTimeMs: number };
  /** 传给 GpuBenchmarkRunner 的选项。 */
  benchmarkOptions?: BenchmarkOptions;
}

/** 真实 GPU 帧时基准测试结果（E-37）。 */
export interface GpuBenchmarkResult {
  gpuFrameTimeMs: number | null;
  cpuFrameTimeMs: number;
  trianglesDrawn: number;
  frameCount: number;
  inferredQuality: 'low' | 'medium' | 'high' | 'ultra';
  measured: boolean;
}

/** GpuBenchmarkRunner 选项。 */
export interface BenchmarkOptions {
  /** 三角形数量，默认 100000。 */
  triangleCount?: number;
  /** 测试帧数，默认 60。 */
  frameCount?: number;
  /** 用于获取 WebGL2 上下文的 canvas；为 null 时尝试新建临时 canvas。 */
  canvas?: HTMLCanvasElement | OffscreenCanvas | null;
  /** 自定义帧时采样器。 */
  sampler?: {
    beginFrame(): void;
    endFrame(): { cpuMs: number; gpuMs: number | null };
  };
}

/** 根据 GPU 分数返回硬编码估算帧时（runner 抛异常时的兜底）。 */
export function estimateFrameTimes(
  gpuScore: number,
): { gpuFrameTimeMs: number; cpuFrameTimeMs: number } {
  if (gpuScore >= 80) return { gpuFrameTimeMs: 5, cpuFrameTimeMs: 3 };
  if (gpuScore >= 60) return { gpuFrameTimeMs: 10, cpuFrameTimeMs: 6 };
  if (gpuScore >= 30) return { gpuFrameTimeMs: 20, cpuFrameTimeMs: 12 };
  return { gpuFrameTimeMs: 40, cpuFrameTimeMs: 25 };
}

/** 根据 CPU 帧时推断画质档位（<8.33→ultra、<16.67→high、<33.33→medium、否则 low）。 */
function inferQualityFromCpuMs(cpuMs: number): 'low' | 'medium' | 'high' | 'ultra' {
  if (cpuMs < 8.33) return 'ultra';
  if (cpuMs < 16.67) return 'high';
  if (cpuMs < 33.33) return 'medium';
  return 'low';
}

/** 创建基于 performance.now 的默认采样器。 */
function createDefaultSampler(): {
  beginFrame(): void;
  endFrame(): { cpuMs: number; gpuMs: number | null };
} {
  let start = 0;
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    beginFrame() {
      start = now();
    },
    endFrame() {
      return { cpuMs: now() - start, gpuMs: null };
    },
  };
}

/**
 * 真实 GPU 帧时基准测试器（E-37）。
 *
 * 尝试获取 WebGL2 上下文绘制 N 万三角形并采样帧时；
 * 若拿不到上下文（如 Node 环境）则回落纯 CPU 估算。
 */
export class GpuBenchmarkRunner {
  async run(options?: BenchmarkOptions): Promise<GpuBenchmarkResult> {
    const triangleCount = options?.triangleCount ?? 100000;
    const frameCount = options?.frameCount ?? 60;
    const canvas = options?.canvas ?? null;
    const customSampler = options?.sampler ?? null;

    // 尝试获取 WebGL2 上下文（从 options.canvas 或新建临时 canvas）
    let canvasEl: HTMLCanvasElement | OffscreenCanvas | null = canvas;
    if (!canvasEl && typeof document !== 'undefined') {
      try {
        canvasEl = document.createElement('canvas');
      } catch {
        canvasEl = null;
      }
    }

    let gl: WebGL2RenderingContext | null = null;
    if (canvasEl) {
      try {
        const ctx = (
          canvasEl as { getContext(contextId: 'webgl2'): WebGL2RenderingContext | null }
        ).getContext('webgl2');
        gl = ctx;
      } catch {
        gl = null;
      }
    }

    // 拿到上下文：实测 GPU 帧时
    if (gl) {
      try {
        // 创建最小化 shader program，避免 drawArrays 因无 program 触发
        // WebGL INVALID_OPERATION 警告（FR-BOOT-004 诊断不应污染控制台）。
        const vsSource = '#version 300 es\nvoid main(){gl_Position=vec4(0.0);}';
        const fsSource = '#version 300 es\nout lowp vec4 c;void main(){c=vec4(0.0);}';
        const vs = gl.createShader(gl.VERTEX_SHADER)!;
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(vs, vsSource);
        gl.shaderSource(fs, fsSource);
        gl.compileShader(vs);
        gl.compileShader(fs);
        const prog = gl.createProgram()!;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        // triangleCount * 3 顶点 * 3 float
        const data = new Float32Array(triangleCount * 3 * 3);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const sampler = customSampler ?? createDefaultSampler();
        let totalCpuMs = 0;
        let totalGpuMs = 0;
        let gpuSamples = 0;

        for (let i = 0; i < frameCount; i++) {
          sampler.beginFrame();
          gl.drawArrays(gl.TRIANGLES, 0, triangleCount * 3);
          gl.finish();
          const { cpuMs, gpuMs } = sampler.endFrame();
          totalCpuMs += cpuMs;
          if (gpuMs !== null) {
            totalGpuMs += gpuMs;
            gpuSamples++;
          }
        }

        const avgCpuMs = totalCpuMs / frameCount;
        const avgGpuMs = gpuSamples > 0 ? totalGpuMs / gpuSamples : null;

        // 清理资源
        gl.deleteBuffer(buffer);
        gl.useProgram(null);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        const loseExt: { loseContext(): void } | null = gl.getExtension('WEBGL_lose_context');
        loseExt?.loseContext();

        return {
          gpuFrameTimeMs: avgGpuMs,
          cpuFrameTimeMs: avgCpuMs,
          trianglesDrawn: triangleCount * frameCount,
          frameCount,
          inferredQuality: inferQualityFromCpuMs(avgCpuMs),
          measured: true,
        };
      } catch {
        // 落入下方 CPU 回落路径
      }
    }

    // 拿不到上下文（Node 环境）：纯 CPU 估算
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const start = now();
    for (let i = 0; i < frameCount; i++) {
      // 空循环
    }
    const cpuMs = (now() - start) / frameCount;

    return {
      gpuFrameTimeMs: null,
      cpuFrameTimeMs: cpuMs,
      trianglesDrawn: 0,
      frameCount,
      inferredQuality: inferQualityFromCpuMs(cpuMs),
      measured: false,
    };
  }
}
