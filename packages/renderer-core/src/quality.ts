/**
 * 自动画质：GPU 检测与性能分级（任务 P2-7）。
 *
 * 实现 GPU 性能检测、质量等级自动设置、性能监控。
 */

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export type GPUVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';

export interface GPUInfo {
  vendor: GPUVendor;
  renderer: string;
  memory: number | null;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxVertexAttribs: number;
  maxFragmentUniformVectors: number;
  maxVertexUniformVectors: number;
  webgl2: boolean;
  webgpu: boolean;
}

export interface QualitySettings {
  level: QualityLevel;
  shadowResolution: number;
  shadowCascades: number;
  bloomEnabled: boolean;
  bloomIterations: number;
  antialiasing: 'none' | 'msaa2x' | 'msaa4x' | 'msaa8x';
  anisotropicFiltering: number;
  textureResolution: number;
  particleCount: number;
  lodBias: number;
  postProcessing: boolean;
  vsync: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  gpuTime: number | null;
  drawCalls: number;
  triangles: number;
  memoryUsed: number;
}

const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: 'low',
    shadowResolution: 512,
    shadowCascades: 1,
    bloomEnabled: false,
    bloomIterations: 0,
    antialiasing: 'none',
    anisotropicFiltering: 1,
    textureResolution: 512,
    particleCount: 1000,
    lodBias: 2.0,
    postProcessing: false,
    vsync: true,
  },
  medium: {
    level: 'medium',
    shadowResolution: 1024,
    shadowCascades: 2,
    bloomEnabled: true,
    bloomIterations: 2,
    antialiasing: 'msaa2x',
    anisotropicFiltering: 4,
    textureResolution: 1024,
    particleCount: 5000,
    lodBias: 1.0,
    postProcessing: true,
    vsync: true,
  },
  high: {
    level: 'high',
    shadowResolution: 2048,
    shadowCascades: 4,
    bloomEnabled: true,
    bloomIterations: 4,
    antialiasing: 'msaa4x',
    anisotropicFiltering: 8,
    textureResolution: 2048,
    particleCount: 10000,
    lodBias: 0.0,
    postProcessing: true,
    vsync: true,
  },
  ultra: {
    level: 'ultra',
    shadowResolution: 4096,
    shadowCascades: 4,
    bloomEnabled: true,
    bloomIterations: 6,
    antialiasing: 'msaa8x',
    anisotropicFiltering: 16,
    textureResolution: 4096,
    particleCount: 50000,
    lodBias: -1.0,
    postProcessing: true,
    vsync: true,
  },
};

export function detectGPU(gl: WebGL2RenderingContext | WebGLRenderingContext): GPUInfo {
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

  let vendor: GPUVendor = 'unknown';
  let renderer = 'Unknown';

  if (debugInfo) {
    const vendorString = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
    renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;

    const vendorLower = vendorString.toLowerCase();
    const rendererLower = renderer.toLowerCase();

    if (vendorLower.includes('nvidia') || rendererLower.includes('nvidia')) {
      vendor = 'nvidia';
    } else if (vendorLower.includes('amd') || vendorLower.includes('ati') || rendererLower.includes('amd') || rendererLower.includes('radeon')) {
      vendor = 'amd';
    } else if (vendorLower.includes('intel') || rendererLower.includes('intel')) {
      vendor = 'intel';
    } else if (vendorLower.includes('apple') || rendererLower.includes('apple')) {
      vendor = 'apple';
    }
  }

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  const maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;

  let maxFragmentUniformVectors = 0;
  let maxVertexUniformVectors = 0;

  if (gl instanceof WebGL2RenderingContext) {
    maxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_COMPONENTS) as number / 4;
    maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_COMPONENTS) as number / 4;
  } else {
    maxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number;
    maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) as number;
  }

  let memory: number | null = null;
  if (vendor === 'nvidia') {
    const memoryExtension = gl.getExtension('WEBGL_memory_info');
    if (memoryExtension) {
      memory = gl.getParameter(memoryExtension.MEMORY_INFO_DEDICATED_VRAM) as number;
    }
  }

  return {
    vendor,
    renderer,
    memory,
    maxTextureSize,
    maxRenderbufferSize,
    maxVertexAttribs,
    maxFragmentUniformVectors,
    maxVertexUniformVectors,
    webgl2: gl instanceof WebGL2RenderingContext,
    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
  };
}

export function estimateGPUPerformance(gpuInfo: GPUInfo): number {
  let score = 0;

  // Texture size capability (0-30 points)
  if (gpuInfo.maxTextureSize >= 16384) {
    score += 30;
  } else if (gpuInfo.maxTextureSize >= 8192) {
    score += 20;
  } else if (gpuInfo.maxTextureSize >= 4096) {
    score += 10;
  }

  // Vendor scoring (0-25 points)
  switch (gpuInfo.vendor) {
    case 'nvidia':
      if (gpuInfo.renderer.includes('RTX') || gpuInfo.renderer.includes('GTX 30') || gpuInfo.renderer.includes('GTX 40')) {
        score += 25;
      } else if (gpuInfo.renderer.includes('GTX')) {
        score += 20;
      } else {
        score += 15;
      }
      break;
    case 'amd':
      if (gpuInfo.renderer.includes('RX 6') || gpuInfo.renderer.includes('RX 7')) {
        score += 22;
      } else if (gpuInfo.renderer.includes('RX')) {
        score += 15;
      } else {
        score += 10;
      }
      break;
    case 'apple':
      if (gpuInfo.renderer.includes('M3') || gpuInfo.renderer.includes('M4')) {
        score += 20;
      } else if (gpuInfo.renderer.includes('M2')) {
        score += 15;
      } else if (gpuInfo.renderer.includes('M1')) {
        score += 12;
      } else {
        score += 8;
      }
      break;
    case 'intel':
      score += 5;
      break;
    default:
      score += 5;
  }

  // Memory (0-20 points)
  if (gpuInfo.memory) {
    if (gpuInfo.memory >= 8 * 1024) {
      score += 20;
    } else if (gpuInfo.memory >= 6 * 1024) {
      score += 15;
    } else if (gpuInfo.memory >= 4 * 1024) {
      score += 10;
    } else {
      score += 5;
    }
  } else {
    // Estimate based on other factors
    score += 10;
  }

  // WebGL2 / WebGPU support (0-15 points)
  if (gpuInfo.webgpu) {
    score += 15;
  } else if (gpuInfo.webgl2) {
    score += 10;
  }

  // Uniform vectors (0-10 points)
  if (gpuInfo.maxFragmentUniformVectors >= 1024) {
    score += 10;
  } else if (gpuInfo.maxFragmentUniformVectors >= 512) {
    score += 5;
  }

  return score;
}

export function getQualityLevelFromScore(score: number): QualityLevel {
  if (score >= 80) {
    return 'ultra';
  } else if (score >= 60) {
    return 'high';
  } else if (score >= 40) {
    return 'medium';
  } else {
    return 'low';
  }
}

export function getQualityPreset(level: QualityLevel): QualitySettings {
  return { ...QUALITY_PRESETS[level] };
}

export function autoDetectQuality(gl: WebGL2RenderingContext | WebGLRenderingContext): QualitySettings {
  const gpuInfo = detectGPU(gl);
  const score = estimateGPUPerformance(gpuInfo);
  const level = getQualityLevelFromScore(score);
  return getQualityPreset(level);
}

export class PerformanceMonitor {
  private frames: number[] = [];
  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private gpuTimer: GPUTimer | null = null;
  private drawCalls = 0;
  private triangles = 0;

  constructor(gl?: WebGL2RenderingContext) {
    if (gl && gl instanceof WebGL2RenderingContext) {
      this.gpuTimer = new GPUTimer(gl);
    }
  }

  beginFrame(): void {
    this.lastFrameTime = performance.now();
    this.drawCalls = 0;
    this.triangles = 0;
    this.gpuTimer?.begin();
  }

  endFrame(): void {
    const now = performance.now();
    const frameTime = now - this.lastFrameTime;

    this.frames.push(1000 / frameTime);
    this.frameTimes.push(frameTime);

    // Keep last 60 frames
    if (this.frames.length > 60) {
      this.frames.shift();
      this.frameTimes.shift();
    }

    this.gpuTimer?.end();
  }

  addDrawCall(triangles: number): void {
    this.drawCalls++;
    this.triangles += triangles;
  }

  getMetrics(): PerformanceMetrics {
    const avgFPS = this.frames.length > 0
      ? this.frames.reduce((a, b) => a + b, 0) / this.frames.length
      : 0;

    const avgFrameTime = this.frameTimes.length > 0
      ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
      : 0;

    return {
      fps: avgFPS,
      frameTime: avgFrameTime,
      gpuTime: this.gpuTimer?.getGPUTime() ?? null,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      memoryUsed: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
    };
  }

  shouldDowngrade(currentLevel: QualityLevel): boolean {
    const metrics = this.getMetrics();
    return metrics.fps < 30 && currentLevel !== 'low';
  }

  shouldUpgrade(currentLevel: QualityLevel): boolean {
    const metrics = this.getMetrics();
    return metrics.fps > 60 && currentLevel !== 'ultra';
  }

  suggestQualityChange(currentLevel: QualityLevel): QualityLevel | null {
    const levels: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
    const currentIndex = levels.indexOf(currentLevel);

    if (this.shouldDowngrade(currentLevel) && currentIndex > 0) {
      const result = levels[currentIndex - 1];
      return result ?? null;
    }

    if (this.shouldUpgrade(currentLevel) && currentIndex < levels.length - 1) {
      const result = levels[currentIndex + 1];
      return result ?? null;
    }

    return null;
  }
}

class GPUTimer {
  private gl: WebGL2RenderingContext;
  private query: WebGLQuery | null = null;
  private gpuTime = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const timerQuery = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (timerQuery) {
      this.query = gl.createQuery();
    }
  }

  begin(): void {
    if (this.query && this.gl) {
      const timerQuery = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (timerQuery) {
        this.gl.beginQuery(timerQuery.TIME_ELAPSED_EXT, this.query);
      }
    }
  }

  end(): void {
    if (this.query && this.gl) {
      const timerQuery = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (timerQuery) {
        this.gl.endQuery(timerQuery.TIME_ELAPSED_EXT);
      }
    }
  }

  getGPUTime(): number | null {
    if (this.query && this.gl) {
      const timerQuery = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (timerQuery) {
        const disjoint = this.gl.getParameter(timerQuery.GPU_DISJOINT_EXT);
        if (!disjoint) {
          const available = this.gl.getQueryParameter(this.query, this.gl.QUERY_RESULT_AVAILABLE);
          if (available) {
            this.gpuTime = this.gl.getQueryParameter(this.query, this.gl.QUERY_RESULT) / 1000000;
          }
        }
      }
    }
    return this.gpuTime;
  }
}

export function getRecommendedTextureSize(level: QualityLevel): number {
  return QUALITY_PRESETS[level].textureResolution;
}

export function getRecommendedShadowResolution(level: QualityLevel): number {
  return QUALITY_PRESETS[level].shadowResolution;
}

export function getRecommendedParticleCount(level: QualityLevel): number {
  return QUALITY_PRESETS[level].particleCount;
}