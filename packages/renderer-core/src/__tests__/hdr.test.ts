import { describe, it, expect } from 'vitest';
import {
  applyToneMapping,
  applyColorGrading,
  applyVignette,
  computeBloomThreshold,
  computeGaussianWeights,
  lerp,
  blendColors,
  DEFAULT_TONE_MAPPING,
  DEFAULT_COLOR_GRADING,
  DEFAULT_VIGNETTE,
  DEFAULT_BLOOM,
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
} from '../hdr.js';
import type {
  PostProcessingPipeline,
  PostProcessingRenderer,
  PostProcessingStage,
  PostProcessingTexture,
} from '../hdr.js';

describe('HDR and Post Processing', () => {
  describe('Tone Mapping', () => {
    it('should apply linear tone mapping with gamma', () => {
      const color: [number, number, number] = [0.5, 0.5, 0.5];
      const result = applyToneMapping(color, { ...DEFAULT_TONE_MAPPING, mode: 'linear', gamma: 1.0 });
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[1]).toBeCloseTo(0.5, 5);
      expect(result[2]).toBeCloseTo(0.5, 5);
    });

    it('should apply Reinhard tone mapping', () => {
      const color: [number, number, number] = [2.0, 2.0, 2.0];
      const result = applyToneMapping(color, { ...DEFAULT_TONE_MAPPING, mode: 'reinhard' });
      expect(result[0]).toBeLessThan(1);
      expect(result[1]).toBeLessThan(1);
      expect(result[2]).toBeLessThan(1);
    });

    it('should apply ACES tone mapping', () => {
      const color: [number, number, number] = [2.0, 2.0, 2.0];
      const result = applyToneMapping(color, { ...DEFAULT_TONE_MAPPING, mode: 'aces' });
      expect(result[0]).toBeLessThan(1);
      expect(result[1]).toBeLessThan(1);
      expect(result[2]).toBeLessThan(1);
    });

    it('should apply exposure', () => {
      const color: [number, number, number] = [0.5, 0.5, 0.5];
      const result = applyToneMapping(color, { ...DEFAULT_TONE_MAPPING, exposure: 2.0 });
      expect(result[0]).toBeGreaterThan(0.5);
    });

    it('should apply gamma correction', () => {
      const color: [number, number, number] = [0.25, 0.25, 0.25];
      const result = applyToneMapping(color, { ...DEFAULT_TONE_MAPPING, mode: 'linear', gamma: 2.0 });
      expect(result[0]).toBeCloseTo(0.5, 3);
    });

    it('should clamp colors to valid range', () => {
      const color: [number, number, number] = [10.0, -1.0, 0.5];
      const result = applyToneMapping(color, DEFAULT_TONE_MAPPING);
      expect(result[0]).toBeGreaterThanOrEqual(0);
      expect(result[0]).toBeLessThanOrEqual(1);
      expect(result[1]).toBeGreaterThanOrEqual(0);
      expect(result[1]).toBeLessThanOrEqual(1);
    });
  });

  describe('Color Grading', () => {
    it('should apply temperature adjustment', () => {
      const color: [number, number, number] = [0.5, 0.5, 0.5];
      const result = applyColorGrading(color, { ...DEFAULT_COLOR_GRADING, temperature: 100 });
      expect(result[0]).toBeCloseTo(0.6, 1);
      expect(result[2]).toBeCloseTo(0.4, 1);
    });

    it('should apply vibrance adjustment', () => {
      const color: [number, number, number] = [0.8, 0.2, 0.5];
      const result = applyColorGrading(color, { ...DEFAULT_COLOR_GRADING, vibrance: 0.5 });
      expect(result[0]).toBeGreaterThanOrEqual(0);
    });

    it('should preserve color when no adjustment', () => {
      const color: [number, number, number] = [0.5, 0.5, 0.5];
      const result = applyColorGrading(color, DEFAULT_COLOR_GRADING);
      expect(result[0]).toBeCloseTo(0.5, 3);
    });
  });

  describe('Vignette', () => {
    it('should apply vignette effect', () => {
      const color: [number, number, number] = [1.0, 1.0, 1.0];
      const uv: [number, number] = [0.0, 0.0];
      const result = applyVignette(color, uv, { ...DEFAULT_VIGNETTE, enabled: true, intensity: 0.5 });
      expect(result[0]).toBeLessThan(color[0]);
    });

    it('should not apply vignette when disabled', () => {
      const color: [number, number, number] = [1.0, 1.0, 1.0];
      const uv: [number, number] = [0.0, 0.0];
      const result = applyVignette(color, uv, { ...DEFAULT_VIGNETTE, enabled: false });
      expect(result[0]).toBe(color[0]);
    });

    it('should be stronger at corners', () => {
      const color: [number, number, number] = [1.0, 1.0, 1.0];
      const centerResult = applyVignette(color, [0.5, 0.5], { ...DEFAULT_VIGNETTE, enabled: true, intensity: 0.5 });
      const cornerResult = applyVignette(color, [0.0, 0.0], { ...DEFAULT_VIGNETTE, enabled: true, intensity: 0.5 });
      expect(cornerResult[0]).toBeLessThan(centerResult[0]);
    });
  });

  describe('Bloom Threshold', () => {
    it('should return zero for dark colors', () => {
      const color: [number, number, number] = [0.1, 0.1, 0.1];
      const result = computeBloomThreshold(color, 1.0, 0.1);
      expect(result[0]).toBeCloseTo(0, 5);
    });

    it('should return full color for bright colors', () => {
      const color: [number, number, number] = [2.0, 2.0, 2.0];
      const result = computeBloomThreshold(color, 1.0, 0.1);
      expect(result[0]).toBeCloseTo(color[0], 5);
    });

    it('should apply soft knee transition', () => {
      const color: [number, number, number] = [1.0, 1.0, 1.0];
      const result = computeBloomThreshold(color, 1.0, 0.5);
      expect(result[0]).toBeGreaterThan(0);
      expect(result[0]).toBeLessThan(color[0]);
    });
  });

  describe('Gaussian Weights', () => {
    it('should compute normalized weights', () => {
      const weights = computeGaussianWeights(1.0, 3);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have higher weight at center', () => {
      const weights = computeGaussianWeights(1.0, 3);
      const centerIndex = Math.floor(weights.length / 2);
      expect(weights[centerIndex]).toBe(Math.max(...weights));
    });
  });

  describe('Utility Functions', () => {
    it('should lerp values', () => {
      expect(lerp(0, 1, 0.5)).toBe(0.5);
      expect(lerp(0, 1, 0)).toBe(0);
      expect(lerp(0, 1, 1)).toBe(1);
    });

    it('should blend colors', () => {
      const color1: [number, number, number] = [1.0, 0.0, 0.0];
      const color2: [number, number, number] = [0.0, 0.0, 1.0];
      const result = blendColors(color1, color2, 0.5);
      expect(result[0]).toBeCloseTo(0.5, 5);
      expect(result[2]).toBeCloseTo(0.5, 5);
    });
  });
});

describe('Post-Processing Pipeline (E-06)', () => {
  describe('CPUTextureProxy', () => {
    it('should construct with correct dimensions', () => {
      const tex = new CPUTextureProxy('test', 4, 4);
      expect(tex.width).toBe(4);
      expect(tex.height).toBe(4);
      expect(tex.data.length).toBe(4 * 4 * 4);
    });

    it('should default to rgba16float format', () => {
      const tex = new CPUTextureProxy('test', 2, 2);
      expect(tex.format).toBe('rgba16float');
    });

    it('should produce a texture from a solid color', () => {
      const tex = CPUTextureProxy.fromColor('red', 2, 2, [1, 0, 0]);
      const px = tex.getPixel(0, 0);
      expect(px[0]).toBe(1);
      expect(px[1]).toBe(0);
      expect(px[2]).toBe(0);
      expect(px[3]).toBe(1);
    });

    it('should set and get pixels', () => {
      const tex = new CPUTextureProxy('test', 2, 2);
      tex.setPixel(1, 1, [0.2, 0.4, 0.6, 1]);
      const px = tex.getPixel(1, 1);
      expect(px[0]).toBeCloseTo(0.2, 5);
      expect(px[1]).toBeCloseTo(0.4, 5);
      expect(px[2]).toBeCloseTo(0.6, 5);
    });
  });

  describe('ToneMappingStage', () => {
    it('should expose name "tone-mapping"', () => {
      const stage = new ToneMappingStage();
      expect(stage.name).toBe('tone-mapping');
    });

    it('should apply tone mapping to input texture pixels', () => {
      const stage = new ToneMappingStage({ ...DEFAULT_TONE_MAPPING, mode: 'aces' });
      const input = CPUTextureProxy.fromColor('in', 2, 2, [3.0, 3.0, 3.0]);
      const output = new CPUTextureProxy('out', 2, 2);
      stage.render(input, output, null);
      const px = output.getPixel(0, 0);
      // ACES should bring 3.0 below 1.0
      expect(px[0]).toBeLessThan(1.0);
      expect(px[0]).toBeGreaterThan(0.0);
      expect(px[3]).toBe(1.0);
    });

    it('should preserve alpha channel', () => {
      const stage = new ToneMappingStage({ ...DEFAULT_TONE_MAPPING, mode: 'linear', gamma: 1.0 });
      const input = new CPUTextureProxy('in', 1, 1);
      input.setPixel(0, 0, [0.5, 0.5, 0.5, 0.7]);
      const output = new CPUTextureProxy('out', 1, 1);
      stage.render(input, output, null);
      expect(output.getPixel(0, 0)[3]).toBeCloseTo(0.7, 5);
    });

    it('should set and get params', () => {
      const stage = new ToneMappingStage();
      stage.setParams({ exposure: 2.0 });
      expect(stage.getParams().exposure).toBe(2.0);
    });

    it('should issue GPU draw calls when renderer is provided', () => {
      const calls: string[] = [];
      const renderer: PostProcessingRenderer = {
        backend: 'webgpu',
        createBuffer: () => ({ id: 'b', usage: 'static' }),
        createTexture: () => ({ id: 't', format: 'rgba16float' }),
        destroyTexture: () => {},
        beginPass: () => calls.push('begin'),
        draw: () => calls.push('draw'),
        endPass: () => calls.push('end'),
      };
      const stage = new ToneMappingStage();
      const input = new CPUTextureProxy('in', 1, 1);
      const output = new CPUTextureProxy('out', 1, 1);
      stage.render(input, output, renderer);
      expect(calls).toEqual(['begin', 'draw', 'end']);
    });
  });

  describe('LuminanceExtractionStage', () => {
    it('should expose name "luminance-extraction"', () => {
      const stage = new LuminanceExtractionStage();
      expect(stage.name).toBe('luminance-extraction');
    });

    it('should zero out dark pixels below threshold', () => {
      const stage = new LuminanceExtractionStage(1.0, 0.1);
      const input = CPUTextureProxy.fromColor('in', 1, 1, [0.1, 0.1, 0.1]);
      const output = new CPUTextureProxy('out', 1, 1);
      stage.render(input, output, null);
      const px = output.getPixel(0, 0);
      expect(px[0]).toBeCloseTo(0, 5);
    });

    it('should preserve bright pixels above threshold', () => {
      const stage = new LuminanceExtractionStage(1.0, 0.1);
      const input = CPUTextureProxy.fromColor('in', 1, 1, [2.0, 2.0, 2.0]);
      const output = new CPUTextureProxy('out', 1, 1);
      stage.render(input, output, null);
      const px = output.getPixel(0, 0);
      expect(px[0]).toBeCloseTo(2.0, 5);
    });

    it('should allow threshold updates', () => {
      const stage = new LuminanceExtractionStage(1.0);
      expect(stage.getThreshold()).toBe(1.0);
      stage.setThreshold(2.0);
      expect(stage.getThreshold()).toBe(2.0);
    });
  });

  describe('BloomDownsampleStage', () => {
    it('should expose name "bloom-downsample"', () => {
      const stage = new BloomDownsampleStage(4);
      expect(stage.name).toBe('bloom-downsample');
    });

    it('should downsample a larger input into a smaller output', () => {
      const stage = new BloomDownsampleStage(1);
      const input = CPUTextureProxy.fromColor('in', 4, 4, [0.5, 0.5, 0.5]);
      const output = new CPUTextureProxy('out', 2, 2);
      stage.render(input, output, null);
      const px = output.getPixel(0, 0);
      expect(px[0]).toBeCloseTo(0.5, 5);
      expect(px[1]).toBeCloseTo(0.5, 5);
    });

    it('should expose iterations', () => {
      const stage = new BloomDownsampleStage(3);
      expect(stage.getIterations()).toBe(3);
    });
  });

  describe('BloomUpsampleStage', () => {
    it('should expose name "bloom-upsample"', () => {
      const stage = new BloomUpsampleStage();
      expect(stage.name).toBe('bloom-upsample');
    });

    it('should add upsampled value to existing output', () => {
      const stage = new BloomUpsampleStage(1.0);
      const input = CPUTextureProxy.fromColor('in', 1, 1, [1.0, 0.0, 0.0]);
      const output = CPUTextureProxy.fromColor('out', 1, 1, [0.5, 0.5, 0.5]);
      stage.render(input, output, null);
      const px = output.getPixel(0, 0);
      expect(px[0]).toBeCloseTo(1.5, 5);
      expect(px[1]).toBeCloseTo(0.5, 5);
    });

    it('should expose intensity', () => {
      const stage = new BloomUpsampleStage(0.25);
      expect(stage.getIntensity()).toBe(0.25);
    });
  });

  describe('ColorGradingStage', () => {
    it('should expose name "color-grading"', () => {
      const stage = new ColorGradingStage();
      expect(stage.name).toBe('color-grading');
    });

    it('should apply temperature adjustment to pixels', () => {
      const stage = new ColorGradingStage({ ...DEFAULT_COLOR_GRADING, temperature: 100 });
      const input = CPUTextureProxy.fromColor('in', 1, 1, [0.5, 0.5, 0.5]);
      const output = new CPUTextureProxy('out', 1, 1);
      stage.render(input, output, null);
      const px = output.getPixel(0, 0);
      expect(px[0]).toBeCloseTo(0.6, 1);
      expect(px[2]).toBeCloseTo(0.4, 1);
    });

    it('should set and get params with cloned color adjustments', () => {
      const stage = new ColorGradingStage();
      stage.setParams({ temperature: 50 });
      const params = stage.getParams();
      expect(params.temperature).toBe(50);
      // Ensure deep cloning of nested objects
      params.shadows.red = 999;
      expect(stage.getParams().shadows.red).not.toBe(999);
    });
  });

  describe('VignetteStage', () => {
    it('should expose name "vignette"', () => {
      const stage = new VignetteStage();
      expect(stage.name).toBe('vignette');
    });

    it('should darken corner pixels when enabled', () => {
      const stage = new VignetteStage({ ...DEFAULT_VIGNETTE, enabled: true, intensity: 0.8 });
      const input = CPUTextureProxy.fromColor('in', 4, 4, [1.0, 1.0, 1.0]);
      const output = new CPUTextureProxy('out', 4, 4);
      stage.render(input, output, null);
      const corner = output.getPixel(0, 0);
      const center = output.getPixel(1, 1);
      expect(corner[0]).toBeLessThan(center[0]);
    });

    it('should be a no-op when disabled', () => {
      const stage = new VignetteStage({ ...DEFAULT_VIGNETTE, enabled: false, intensity: 1.0 });
      const input = CPUTextureProxy.fromColor('in', 2, 2, [0.7, 0.7, 0.7]);
      const output = new CPUTextureProxy('out', 2, 2);
      stage.render(input, output, null);
      const px = output.getPixel(0, 0);
      expect(px[0]).toBeCloseTo(0.7, 5);
    });
  });

  describe('PostProcessingPipelineImpl', () => {
    it('should add and list stages', () => {
      const pipeline = new PostProcessingPipelineImpl();
      const stage = new ToneMappingStage();
      pipeline.addStage(stage);
      expect(pipeline.getStages().length).toBe(1);
      expect(pipeline.getStages()[0]).toBe(stage);
    });

    it('should remove stages by name', () => {
      const pipeline = new PostProcessingPipelineImpl();
      pipeline.addStage(new ToneMappingStage());
      pipeline.addStage(new VignetteStage());
      pipeline.removeStage('tone-mapping');
      expect(pipeline.getStages().length).toBe(1);
      expect(pipeline.getStages()[0]?.name).toBe('vignette');
    });

    it('should return a defensive copy of stages', () => {
      const pipeline = new PostProcessingPipelineImpl();
      pipeline.addStage(new ToneMappingStage());
      const stages = pipeline.getStages();
      stages.length = 0;
      expect(pipeline.getStages().length).toBe(1);
    });

    it('should copy input to output when no stages exist (CPU path)', () => {
      const pipeline = new PostProcessingPipelineImpl();
      const input = CPUTextureProxy.fromColor('in', 2, 2, [0.3, 0.6, 0.9]);
      const output = new CPUTextureProxy('out', 2, 2);
      pipeline.render(input, output, null);
      expect(output.getPixel(0, 0)[0]).toBeCloseTo(0.3, 5);
    });

    it('should execute stages in order with ping-pong buffers', () => {
      const pipeline = new PostProcessingPipelineImpl();
      pipeline.addStage(new ToneMappingStage({ ...DEFAULT_TONE_MAPPING, mode: 'aces' }));
      pipeline.addStage(new VignetteStage({ ...DEFAULT_VIGNETTE, enabled: true, intensity: 0.5 }));
      const input = CPUTextureProxy.fromColor('in', 2, 2, [2.0, 2.0, 2.0]);
      const output = new CPUTextureProxy('out', 2, 2);
      pipeline.render(input, output, null);
      // After tone mapping, values should be in [0,1]; vignette should further darken corners
      const px = output.getPixel(0, 0);
      expect(px[0]).toBeGreaterThanOrEqual(0);
      expect(px[0]).toBeLessThanOrEqual(1);
    });

    it('should throw after dispose', () => {
      const pipeline = new PostProcessingPipelineImpl();
      pipeline.dispose();
      const input = new CPUTextureProxy('in', 1, 1);
      const output = new CPUTextureProxy('out', 1, 1);
      expect(() => pipeline.render(input, output, null)).toThrow();
    });

    it('should clear stages', () => {
      const pipeline = new PostProcessingPipelineImpl();
      pipeline.addStage(new ToneMappingStage());
      pipeline.clearStages();
      expect(pipeline.getStages().length).toBe(0);
    });

    it('should reallocate intermediates when input size changes', () => {
      const pipeline = new PostProcessingPipelineImpl();
      pipeline.addStage(new ToneMappingStage({ ...DEFAULT_TONE_MAPPING, mode: 'linear', gamma: 1.0 }));
      const in1 = CPUTextureProxy.fromColor('in1', 2, 2, [0.5, 0.5, 0.5]);
      const out1 = new CPUTextureProxy('out1', 2, 2);
      pipeline.render(in1, out1, null);
      expect(out1.getPixel(0, 0)[0]).toBeCloseTo(0.5, 5);

      const in2 = CPUTextureProxy.fromColor('in2', 4, 4, [0.25, 0.25, 0.25]);
      const out2 = new CPUTextureProxy('out2', 4, 4);
      pipeline.render(in2, out2, null);
      expect(out2.getPixel(0, 0)[0]).toBeCloseTo(0.25, 5);
    });
  });

  describe('createDefaultPipeline', () => {
    it('should build a pipeline from default params', () => {
      const pipeline = createDefaultPipeline();
      expect(pipeline.getStages().length).toBeGreaterThan(0);
      const names = pipeline.getStages().map((s) => s.name);
      expect(names).toContain('tone-mapping');
      expect(names).toContain('color-grading');
      // Default bloom enabled, so luminance-extraction should be present
      expect(names).toContain('luminance-extraction');
    });

    it('should include bloom stages when bloom enabled', () => {
      const pipeline = createDefaultPipeline({ ...DEFAULT_POST_PROCESSING, bloom: { ...DEFAULT_BLOOM, enabled: true } });
      const names = pipeline.getStages().map((s) => s.name);
      expect(names).toContain('luminance-extraction');
      expect(names).toContain('bloom-downsample');
      expect(names).toContain('bloom-upsample');
    });

    it('should skip bloom stages when bloom disabled', () => {
      const pipeline = createDefaultPipeline({ ...DEFAULT_POST_PROCESSING, bloom: { ...DEFAULT_BLOOM, enabled: false } });
      const names = pipeline.getStages().map((s) => s.name);
      expect(names).not.toContain('luminance-extraction');
      expect(names).not.toContain('bloom-downsample');
    });

    it('should include vignette stage when enabled', () => {
      const pipeline = createDefaultPipeline({
        ...DEFAULT_POST_PROCESSING,
        vignette: { ...DEFAULT_VIGNETTE, enabled: true },
      });
      const names = pipeline.getStages().map((s) => s.name);
      expect(names).toContain('vignette');
    });

    it('should skip vignette stage when disabled', () => {
      const pipeline = createDefaultPipeline({
        ...DEFAULT_POST_PROCESSING,
        vignette: { ...DEFAULT_VIGNETTE, enabled: false },
      });
      const names = pipeline.getStages().map((s) => s.name);
      expect(names).not.toContain('vignette');
    });

    it('should produce a usable pipeline', () => {
      const pipeline: PostProcessingPipeline = createDefaultPipeline();
      const input = CPUTextureProxy.fromColor('in', 4, 4, [2.0, 2.0, 2.0]);
      const output = new CPUTextureProxy('out', 4, 4);
      pipeline.render(input, output, null);
      const px = output.getPixel(2, 2);
      expect(px[0]).toBeGreaterThanOrEqual(0);
      expect(px[0]).toBeLessThanOrEqual(1);
    });
  });

  describe('Stage interface conformance', () => {
    it('all stages implement PostProcessingStage', () => {
      const stages: PostProcessingStage[] = [
        new ToneMappingStage(),
        new LuminanceExtractionStage(),
        new BloomDownsampleStage(),
        new BloomUpsampleStage(),
        new ColorGradingStage(),
        new VignetteStage(),
      ];
      for (const stage of stages) {
        expect(typeof stage.name).toBe('string');
        expect(typeof stage.render).toBe('function');
      }
    });

    it('can implement a custom stage and run it through the pipeline', () => {
      const passthrough: PostProcessingStage = {
        name: 'passthrough',
        render(input: PostProcessingTexture, output: PostProcessingTexture) {
          if (input instanceof CPUTextureProxy && output instanceof CPUTextureProxy) {
            output.data.set(input.data);
          }
        },
      };
      const pipeline = new PostProcessingPipelineImpl();
      pipeline.addStage(passthrough);
      const input = CPUTextureProxy.fromColor('in', 2, 2, [0.4, 0.5, 0.6]);
      const output = new CPUTextureProxy('out', 2, 2);
      pipeline.render(input, output, null);
      expect(output.getPixel(0, 0)[0]).toBeCloseTo(0.4, 5);
    });
  });
});
