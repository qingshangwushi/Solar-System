/**
 * HDR 色调映射和后期处理（任务 P2-5）。
 *
 * 实现 HDR 色调映射、泛光、颜色分级等功能。
 */

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
  const linearAngle = params.linearAngle ?? 0.10;
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