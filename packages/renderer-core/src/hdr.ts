/**
 * HDR 色调映射和后期处理（任务 P2-5）。
 *
 * 实现 HDR 色调映射、泛光、颜色分级等功能。
 */

import type {
  BackendType,
  BufferDescriptor,
  BufferHandle,
  DrawCall,
  RenderPassDescriptor,
  TextureDescriptor,
  TextureFormat,
  TextureHandle,
} from './index.js';

export type ToneMappingMode = 'linear' | 'reinhard' | 'filmic' | 'aces' | 'custom';

export interface ToneMappingParams {
  mode: ToneMappingMode;
  exposure: number;
  gamma: number;
  saturation: number;
  contrast: number;
  shoulderStrength?: number;
  linearStrength?: number;
  linearAngle?: number;
  toeStrength?: number;
  toeNumerator?: number;
  toeDenominator?: number;
}

export interface BloomParams {
  enabled: boolean;
  intensity: number;
  threshold: number;
  softKnee: number;
  radius: number;
  iterations: number;
}

export interface ColorGradingParams {
  temperature: number;
  tint: number;
  hueShift: number;
  vibrance: number;
  shadows: ColorAdjustment;
  midtones: ColorAdjustment;
  highlights: ColorAdjustment;
}

export interface ColorAdjustment {
  red: number;
  green: number;
  blue: number;
}

export interface VignetteParams {
  enabled: boolean;
  intensity: number;
  smoothness: number;
  roundness: number;
  color: [number, number, number];
}

export interface ChromaticAberrationParams {
  enabled: boolean;
  intensity: number;
  samples: number;
}

export interface PostProcessingParams {
  toneMapping: ToneMappingParams;
  bloom: BloomParams;
  colorGrading: ColorGradingParams;
  vignette: VignetteParams;
  chromaticAberration: ChromaticAberrationParams;
  dithering: boolean;
}

export const DEFAULT_TONE_MAPPING: ToneMappingParams = {
  mode: 'aces',
  exposure: 1.0,
  gamma: 2.2,
  saturation: 1.0,
  contrast: 1.0,
};

export const DEFAULT_BLOOM: BloomParams = {
  enabled: true,
  intensity: 0.5,
  threshold: 1.0,
  softKnee: 0.5,
  radius: 1.0,
  iterations: 4,
};

export const DEFAULT_COLOR_GRADING: ColorGradingParams = {
  temperature: 0,
  tint: 0,
  hueShift: 0,
  vibrance: 0,
  shadows: { red: 1.0, green: 1.0, blue: 1.0 },
  midtones: { red: 1.0, green: 1.0, blue: 1.0 },
  highlights: { red: 1.0, green: 1.0, blue: 1.0 },
};

export const DEFAULT_VIGNETTE: VignetteParams = {
  enabled: false,
  intensity: 0.5,
  smoothness: 0.5,
  roundness: 1.0,
  color: [0, 0, 0],
};

export const DEFAULT_CHROMATIC_ABERRATION: ChromaticAberrationParams = {
  enabled: false,
  intensity: 0.001,
  samples: 3,
};

export const DEFAULT_POST_PROCESSING: PostProcessingParams = {
  toneMapping: DEFAULT_TONE_MAPPING,
  bloom: DEFAULT_BLOOM,
  colorGrading: DEFAULT_COLOR_GRADING,
  vignette: DEFAULT_VIGNETTE,
  chromaticAberration: DEFAULT_CHROMATIC_ABERRATION,
  dithering: true,
};

export function applyToneMapping(
  color: [number, number, number],
  params: ToneMappingParams,
): [number, number, number] {
  let [r, g, b] = color;

  r *= params.exposure;
  g *= params.exposure;
  b *= params.exposure;

  switch (params.mode) {
    case 'linear':
      break;
    case 'reinhard':
      r = reinhard(r);
      g = reinhard(g);
      b = reinhard(b);
      break;
    case 'filmic':
      const filmicResult = filmicToneMapping([r, g, b], params);
      r = filmicResult[0];
      g = filmicResult[1];
      b = filmicResult[2];
      break;
    case 'aces':
      const acesResult = acesToneMapping([r, g, b]);
      r = acesResult[0];
      g = acesResult[1];
      b = acesResult[2];
      break;
    default:
      break;
  }

  r = Math.pow(r, 1.0 / params.gamma);
  g = Math.pow(g, 1.0 / params.gamma);
  b = Math.pow(b, 1.0 / params.gamma);

  const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const saturation = params.saturation;
  r = gray + saturation * (r - gray);
  g = gray + saturation * (g - gray);
  b = gray + saturation * (b - gray);

  const midpoint = 0.5;
  r = midpoint + params.contrast * (r - midpoint);
  g = midpoint + params.contrast * (g - midpoint);
  b = midpoint + params.contrast * (b - midpoint);

  return [clamp01(r), clamp01(g), clamp01(b)];
}

function reinhard(x: number): number {
  return x / (1.0 + x);
}

function filmicToneMapping(
  color: [number, number, number],
  params: ToneMappingParams,
): [number, number, number] {
  const shoulderStrength = params.shoulderStrength ?? 0.22;
  const linearStrength = params.linearStrength ?? 0.30;
  const toeStrength = params.toeStrength ?? 0.20;
  const toeNumerator = params.toeNumerator ?? 0.01;
  const toeDenominator = params.toeDenominator ?? 0.30;

  const h = shoulderStrength + linearStrength + toeStrength;

  const f = (x: number): number => {
    return (x * (h * x + toeNumerator * toeDenominator) + toeStrength * toeNumerator) /
           (x * (h * x + linearStrength) + toeStrength * toeDenominator) -
           toeNumerator / toeDenominator;
  };

  const whiteScale = 1.0 / f(11.2);

  return [
    f(color[0]) * whiteScale,
    f(color[1]) * whiteScale,
    f(color[2]) * whiteScale,
  ];
}

function acesToneMapping(color: [number, number, number]): [number, number, number] {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;

  const map = (x: number): number => {
    return clamp01((x * (a * x + b)) / (x * (c * x + d) + e));
  };

  return [map(color[0]), map(color[1]), map(color[2])];
}

export function applyColorGrading(
  color: [number, number, number],
  params: ColorGradingParams,
): [number, number, number] {
  let [r, g, b] = color;

  // Apply temperature adjustment (warm/cool)
  const temp = params.temperature / 100.0;
  r += temp * 0.1;
  b -= temp * 0.1;

  // Apply tint adjustment (green/magenta)
  const tint = params.tint / 100.0;
  g += tint * 0.05;

  // Apply hue shift
  if (params.hueShift !== 0) {
    const [h, s, l] = rgbToHsl([r, g, b]);
    const newH = (h + params.hueShift / 360.0 + 1.0) % 1.0;
    [r, g, b] = hslToRgb([newH, s, l]);
  }

  // Apply vibrance
  if (params.vibrance !== 0) {
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const vibranceAmount = params.vibrance * (1.0 - saturation);
    r += (r - gray) * vibranceAmount;
    g += (g - gray) * vibranceAmount;
    b += (b - gray) * vibranceAmount;
  }

  // Apply shadows/midtones/highlights color adjustments
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let shadowsAmount = 0;
  let midtonesAmount = 1;
  let highlightsAmount = 0;

  if (luminance < 0.25) {
    shadowsAmount = 1.0 - luminance / 0.25;
    midtonesAmount = luminance / 0.25;
  } else if (luminance > 0.75) {
    highlightsAmount = (luminance - 0.75) / 0.25;
    midtonesAmount = 1.0 - highlightsAmount;
  } else {
    midtonesAmount = 1.0;
  }

  // Apply color adjustments
  const shadowMult = 1.0 + (params.shadows.red - 1.0) * shadowsAmount +
                      (params.midtones.red - 1.0) * midtonesAmount +
                      (params.highlights.red - 1.0) * highlightsAmount;
  const greenMult = 1.0 + (params.shadows.green - 1.0) * shadowsAmount +
                     (params.midtones.green - 1.0) * midtonesAmount +
                     (params.highlights.green - 1.0) * highlightsAmount;
  const blueMult = 1.0 + (params.shadows.blue - 1.0) * shadowsAmount +
                    (params.midtones.blue - 1.0) * midtonesAmount +
                    (params.highlights.blue - 1.0) * highlightsAmount;

  r *= shadowMult;
  g *= greenMult;
  b *= blueMult;

  return [clamp01(r), clamp01(g), clamp01(b)];
}

export function applyVignette(
  color: [number, number, number],
  uv: [number, number],
  params: VignetteParams,
): [number, number, number] {
  if (!params.enabled) {
    return color;
  }

  const cx = uv[0] - 0.5;
  const cy = uv[1] - 0.5;
  const dist = Math.sqrt(cx * cx + cy * cy);

  const k = params.smoothness * 0.5 + 0.001;
  const roundness = params.roundness;
  const radius = 0.5 * roundness;

  const vig = 1.0 - params.intensity * Math.pow(dist / radius, k);

  return [
    color[0] * vig,
    color[1] * vig,
    color[2] * vig,
  ];
}

export function computeBloomThreshold(
  color: [number, number, number],
  threshold: number,
  softKnee: number,
): [number, number, number] {
  const brightness = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];

  if (brightness < threshold - softKnee) {
    return [0, 0, 0];
  } else if (brightness > threshold + softKnee) {
    return color;
  } else {
    const t = (brightness - threshold + softKnee) / (2.0 * softKnee);
    const factor = t * t * (3.0 - 2.0 * t);
    return [
      color[0] * factor,
      color[1] * factor,
      color[2] * factor,
    ];
  }
}

export function gaussianBlur1D(
  weights: number[],
  offset: number,
): { weights: number[]; offsets: number[] } {
  const offsets: number[] = [];
  for (let i = 0; i < weights.length; i++) {
    offsets.push((i - Math.floor(weights.length / 2)) * offset);
  }
  return { weights, offsets };
}

export function computeGaussianWeights(sigma: number, radius: number): number[] {
  const weights: number[] = [];
  let sum = 0;

  for (let i = -radius; i <= radius; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(weight);
    sum += weight;
  }

  return weights.map((w) => w / sum);
}

function rgbToHsl(rgb: [number, number, number]): [number, number, number] {
  const r = rgb[0];
  const g = rgb[1];
  const b = rgb[2];

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return [h, s, l];
}

function hslToRgb(hsl: [number, number, number]): [number, number, number] {
  const [h, s, l] = hsl;

  if (s === 0) {
    return [l, l, l];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    hue2rgb(p, q, h + 1 / 3),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1 / 3),
  ];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function blendColors(
  color1: [number, number, number],
  color2: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    lerp(color1[0], color2[0], alpha),
    lerp(color1[1], color2[1], alpha),
    lerp(color1[2], color2[2], alpha),
  ];
}

// ============================================================================
// GPU Post-Processing Pipeline (E-06)
// ============================================================================

/**
 * 抽象的 GPU 纹理句柄。具体后端（WebGPU/WebGL2）实现自己的纹理对象。
 */
export interface PostProcessingTexture {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
}

/**
 * 后端渲染器接口（PostProcessing 用）。最小子集，避免与主 Renderer 接口耦合。
 */
export interface PostProcessingRenderer {
  readonly backend: BackendType;
  createBuffer(desc: BufferDescriptor): BufferHandle;
  createTexture(desc: TextureDescriptor): TextureHandle;
  destroyTexture(handle: TextureHandle): void;
  beginPass(desc: RenderPassDescriptor): void;
  draw(call: DrawCall): void;
  endPass(): void;
}

/**
 * 单个后处理阶段。render() 接收 input texture、写入 output texture。
 * 当 renderer 为 null 时，stage 应安全地不执行 GPU 操作（用于测试环境）。
 */
export interface PostProcessingStage {
  readonly name: string;
  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void;
}

/**
 * 后处理管线：维护 stages 数组，依次执行。
 */
export interface PostProcessingPipeline {
  addStage(stage: PostProcessingStage): void;
  removeStage(name: string): void;
  getStages(): PostProcessingStage[];
  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void;
  dispose(): void;
}

/**
 * 简单的 CPU 端纹理代理——保存每个像素的 HDR 颜色，用于在无 GPU 环境下测试 stage 行为。
 */
export class CPUTextureProxy implements PostProcessingTexture {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  data: Float32Array;

  constructor(id: string, width: number, height: number, format: TextureFormat = 'rgba16float') {
    this.id = id;
    this.width = width;
    this.height = height;
    this.format = format;
    this.data = new Float32Array(width * height * 4);
  }

  static fromColor(
    id: string,
    width: number,
    height: number,
    color: [number, number, number],
  ): CPUTextureProxy {
    const tex = new CPUTextureProxy(id, width, height);
    for (let i = 0; i < width * height; i++) {
      tex.data[i * 4 + 0] = color[0];
      tex.data[i * 4 + 1] = color[1];
      tex.data[i * 4 + 2] = color[2];
      tex.data[i * 4 + 3] = 1.0;
    }
    return tex;
  }

  getPixel(x: number, y: number): [number, number, number, number] {
    const idx = (y * this.width + x) * 4;
    return [
      this.data[idx + 0] as number,
      this.data[idx + 1] as number,
      this.data[idx + 2] as number,
      this.data[idx + 3] as number,
    ];
  }

  setPixel(x: number, y: number, color: [number, number, number, number]): void {
    const idx = (y * this.width + x) * 4;
    this.data[idx + 0] = color[0];
    this.data[idx + 1] = color[1];
    this.data[idx + 2] = color[2];
    this.data[idx + 3] = color[3];
  }
}

/**
 * Tone-mapping stage：对 input texture 每个像素应用 applyToneMapping，写入 output。
 * 当 renderer 存在时，记录 GPU draw call；不存在时仅在 CPU 代理上做处理。
 */
export class ToneMappingStage implements PostProcessingStage {
  readonly name = 'tone-mapping';
  private params: ToneMappingParams;

  constructor(params: ToneMappingParams = DEFAULT_TONE_MAPPING) {
    this.params = { ...params };
  }

  getParams(): ToneMappingParams {
    return { ...this.params };
  }

  setParams(params: Partial<ToneMappingParams>): void {
    this.params = { ...this.params, ...params };
  }

  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void {
    if (input instanceof CPUTextureProxy && output instanceof CPUTextureProxy) {
      const inTex = input;
      const outTex = output;
      for (let y = 0; y < inTex.height; y++) {
        for (let x = 0; x < inTex.width; x++) {
          const px = inTex.getPixel(x, y);
          const mapped = applyToneMapping([px[0], px[1], px[2]], this.params);
          outTex.setPixel(x, y, [mapped[0], mapped[1], mapped[2], px[3]]);
        }
      }
    }
    if (renderer) {
      // Real GPU path: would bind a fullscreen triangle pipeline and sample input.
      // Skeleton: issue a placeholder draw to indicate intent.
      renderer.beginPass({
        colorAttachments: [
          {
            texture: { id: output.id, format: output.format },
            loadOp: 'clear',
            storeOp: 'store',
            clear: [0, 0, 0, 1],
          },
        ],
      });
      renderer.draw({
        vertexBuffer: { id: 'pp-fullscreen-quad', usage: 'static' },
        pipeline: { id: 'pp-tonemap' },
        vertexCount: 3,
      });
      renderer.endPass();
    }
  }
}

/**
 * 亮度提取 stage（用于 bloom 的输入）：提取亮度高于 threshold 的部分。
 */
export class LuminanceExtractionStage implements PostProcessingStage {
  readonly name = 'luminance-extraction';
  private threshold: number;
  private softKnee: number;

  constructor(threshold: number = 1.0, softKnee: number = 0.5) {
    this.threshold = threshold;
    this.softKnee = softKnee;
  }

  getThreshold(): number {
    return this.threshold;
  }

  setThreshold(value: number): void {
    this.threshold = value;
  }

  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void {
    if (input instanceof CPUTextureProxy && output instanceof CPUTextureProxy) {
      const inTex = input;
      const outTex = output;
      for (let y = 0; y < inTex.height; y++) {
        for (let x = 0; x < inTex.width; x++) {
          const px = inTex.getPixel(x, y);
          const extracted = computeBloomThreshold(
            [px[0], px[1], px[2]],
            this.threshold,
            this.softKnee,
          );
          outTex.setPixel(x, y, [extracted[0], extracted[1], extracted[2], px[3]]);
        }
      }
    }
    if (renderer) {
      renderer.beginPass({
        colorAttachments: [
          {
            texture: { id: output.id, format: output.format },
            loadOp: 'clear',
            storeOp: 'store',
            clear: [0, 0, 0, 1],
          },
        ],
      });
      renderer.draw({
        vertexBuffer: { id: 'pp-fullscreen-quad', usage: 'static' },
        pipeline: { id: 'pp-luminance-extract' },
        vertexCount: 3,
      });
      renderer.endPass();
    }
  }
}

/**
 * Bloom 下采样 stage：把高分辨率纹理降采样到低分辨率（每级缩小一半）。
 */
export class BloomDownsampleStage implements PostProcessingStage {
  readonly name = 'bloom-downsample';
  private iterations: number;

  constructor(iterations: number = 4) {
    this.iterations = iterations;
  }

  getIterations(): number {
    return this.iterations;
  }

  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void {
    if (input instanceof CPUTextureProxy && output instanceof CPUTextureProxy) {
      const inTex = input;
      const outTex = output;
      const stepX = Math.max(1, Math.floor(inTex.width / outTex.width));
      const stepY = Math.max(1, Math.floor(inTex.height / outTex.height));
      for (let y = 0; y < outTex.height; y++) {
        for (let x = 0; x < outTex.width; x++) {
          const srcX = Math.min(inTex.width - 1, x * stepX);
          const srcY = Math.min(inTex.height - 1, y * stepY);
          const px = inTex.getPixel(srcX, srcY);
          outTex.setPixel(x, y, [px[0], px[1], px[2], px[3]]);
        }
      }
    }
    if (renderer) {
      renderer.beginPass({
        colorAttachments: [
          {
            texture: { id: output.id, format: output.format },
            loadOp: 'clear',
            storeOp: 'store',
            clear: [0, 0, 0, 1],
          },
        ],
      });
      renderer.draw({
        vertexBuffer: { id: 'pp-fullscreen-quad', usage: 'static' },
        pipeline: { id: 'pp-bloom-downsample' },
        vertexCount: 3,
      });
      renderer.endPass();
    }
  }
}

/**
 * Bloom 上采样 stage：把低分辨率纹理升采样并叠加到高分辨率。
 */
export class BloomUpsampleStage implements PostProcessingStage {
  readonly name = 'bloom-upsample';
  private intensity: number;

  constructor(intensity: number = 0.5) {
    this.intensity = intensity;
  }

  getIntensity(): number {
    return this.intensity;
  }

  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void {
    if (input instanceof CPUTextureProxy && output instanceof CPUTextureProxy) {
      const inTex = input;
      const outTex = output;
      for (let y = 0; y < outTex.height; y++) {
        for (let x = 0; x < outTex.width; x++) {
          const srcX = Math.min(inTex.width - 1, Math.floor((x * inTex.width) / outTex.width));
          const srcY = Math.min(inTex.height - 1, Math.floor((y * inTex.height) / outTex.height));
          const px = inTex.getPixel(srcX, srcY);
          const existing = outTex.getPixel(x, y);
          outTex.setPixel(x, y, [
            existing[0] + px[0] * this.intensity,
            existing[1] + px[1] * this.intensity,
            existing[2] + px[2] * this.intensity,
            existing[3],
          ]);
        }
      }
    }
    if (renderer) {
      renderer.beginPass({
        colorAttachments: [
          {
            texture: { id: output.id, format: output.format },
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });
      renderer.draw({
        vertexBuffer: { id: 'pp-fullscreen-quad', usage: 'static' },
        pipeline: { id: 'pp-bloom-upsample' },
        vertexCount: 3,
      });
      renderer.endPass();
    }
  }
}

/**
 * 颜色分级 stage：对每个像素应用 applyColorGrading。
 */
export class ColorGradingStage implements PostProcessingStage {
  readonly name = 'color-grading';
  private params: ColorGradingParams;

  constructor(params: ColorGradingParams = DEFAULT_COLOR_GRADING) {
    this.params = { ...params };
  }

  getParams(): ColorGradingParams {
    return {
      ...this.params,
      shadows: { ...this.params.shadows },
      midtones: { ...this.params.midtones },
      highlights: { ...this.params.highlights },
    };
  }

  setParams(params: Partial<ColorGradingParams>): void {
    this.params = {
      ...this.params,
      ...params,
      shadows: params.shadows ? { ...params.shadows } : this.params.shadows,
      midtones: params.midtones ? { ...params.midtones } : this.params.midtones,
      highlights: params.highlights ? { ...params.highlights } : this.params.highlights,
    };
  }

  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void {
    if (input instanceof CPUTextureProxy && output instanceof CPUTextureProxy) {
      const inTex = input;
      const outTex = output;
      for (let y = 0; y < inTex.height; y++) {
        for (let x = 0; x < inTex.width; x++) {
          const px = inTex.getPixel(x, y);
          const graded = applyColorGrading([px[0], px[1], px[2]], this.params);
          outTex.setPixel(x, y, [graded[0], graded[1], graded[2], px[3]]);
        }
      }
    }
    if (renderer) {
      renderer.beginPass({
        colorAttachments: [
          {
            texture: { id: output.id, format: output.format },
            loadOp: 'clear',
            storeOp: 'store',
            clear: [0, 0, 0, 1],
          },
        ],
      });
      renderer.draw({
        vertexBuffer: { id: 'pp-fullscreen-quad', usage: 'static' },
        pipeline: { id: 'pp-color-grading' },
        vertexCount: 3,
      });
      renderer.endPass();
    }
  }
}

/**
 * 暗角 stage：对每个像素应用 applyVignette。
 */
export class VignetteStage implements PostProcessingStage {
  readonly name = 'vignette';
  private params: VignetteParams;

  constructor(params: VignetteParams = DEFAULT_VIGNETTE) {
    this.params = { ...params, color: [...params.color] as [number, number, number] };
  }

  getParams(): VignetteParams {
    return {
      ...this.params,
      color: [...this.params.color] as [number, number, number],
    };
  }

  setParams(params: Partial<VignetteParams>): void {
    this.params = {
      ...this.params,
      ...params,
      color: params.color ? [...params.color] as [number, number, number] : this.params.color,
    };
  }

  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void {
    if (input instanceof CPUTextureProxy && output instanceof CPUTextureProxy) {
      const inTex = input;
      const outTex = output;
      for (let y = 0; y < inTex.height; y++) {
        for (let x = 0; x < inTex.width; x++) {
          const px = inTex.getPixel(x, y);
          const uv: [number, number] = [
            (x + 0.5) / inTex.width,
            (y + 0.5) / inTex.height,
          ];
          const result = applyVignette([px[0], px[1], px[2]], uv, this.params);
          outTex.setPixel(x, y, [result[0], result[1], result[2], px[3]]);
        }
      }
    }
    if (renderer) {
      renderer.beginPass({
        colorAttachments: [
          {
            texture: { id: output.id, format: output.format },
            loadOp: 'clear',
            storeOp: 'store',
            clear: [0, 0, 0, 1],
          },
        ],
      });
      renderer.draw({
        vertexBuffer: { id: 'pp-fullscreen-quad', usage: 'static' },
        pipeline: { id: 'pp-vignette' },
        vertexCount: 3,
      });
      renderer.endPass();
    }
  }
}

/**
 * 后处理管线实现：维护 stages 列表，依次执行 render()。
 * stage 之间通过交替使用两张中间纹理 ping-pong；最后一步写入 output。
 */
export class PostProcessingPipelineImpl implements PostProcessingPipeline {
  private stages: PostProcessingStage[] = [];
  private intermediateA: CPUTextureProxy | null = null;
  private intermediateB: CPUTextureProxy | null = null;
  private disposed = false;

  addStage(stage: PostProcessingStage): void {
    this.stages.push(stage);
  }

  removeStage(name: string): void {
    this.stages = this.stages.filter((s) => s.name !== name);
  }

  getStages(): PostProcessingStage[] {
    return [...this.stages];
  }

  clearStages(): void {
    this.stages = [];
  }

  render(
    input: PostProcessingTexture,
    output: PostProcessingTexture,
    renderer: PostProcessingRenderer | null,
  ): void {
    if (this.disposed) {
      throw new Error('PostProcessingPipeline has been disposed');
    }
    if (this.stages.length === 0) {
      // No stages: copy input to output (CPU path only).
      if (input instanceof CPUTextureProxy && output instanceof CPUTextureProxy) {
        output.data.set(input.data);
      }
      return;
    }

    // For CPU path, allocate intermediate buffers matching input dimensions.
    const useCpu = input instanceof CPUTextureProxy && output instanceof CPUTextureProxy;
    if (useCpu) {
      const cpuInput = input as CPUTextureProxy;
      if (
        !this.intermediateA ||
        this.intermediateA.width !== cpuInput.width ||
        this.intermediateA.height !== cpuInput.height
      ) {
        this.intermediateA = new CPUTextureProxy(
          'pp-intermediate-a',
          cpuInput.width,
          cpuInput.height,
          cpuInput.format,
        );
        this.intermediateB = new CPUTextureProxy(
          'pp-intermediate-b',
          cpuInput.width,
          cpuInput.height,
          cpuInput.format,
        );
      }
    }

    let current: PostProcessingTexture = input;
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i] as PostProcessingStage;
      const isLast = i === this.stages.length - 1;
      const next: PostProcessingTexture = isLast
        ? output
        : (current === this.intermediateA ? this.intermediateB! : this.intermediateA!);
      stage.render(current, next, renderer);
      current = next;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stages = [];
    this.intermediateA = null;
    this.intermediateB = null;
  }
}

/**
 * 工厂函数：从 PostProcessingParams 构建一条完整的默认管线。
 */
export function createDefaultPipeline(params: PostProcessingParams = DEFAULT_POST_PROCESSING): PostProcessingPipeline {
  const pipeline = new PostProcessingPipelineImpl();
  if (params.bloom.enabled) {
    pipeline.addStage(new LuminanceExtractionStage(params.bloom.threshold, params.bloom.softKnee));
    pipeline.addStage(new BloomDownsampleStage(params.bloom.iterations));
    pipeline.addStage(new BloomUpsampleStage(params.bloom.intensity));
  }
  pipeline.addStage(new ToneMappingStage(params.toneMapping));
  pipeline.addStage(new ColorGradingStage(params.colorGrading));
  if (params.vignette.enabled) {
    pipeline.addStage(new VignetteStage(params.vignette));
  }
  return pipeline;
}