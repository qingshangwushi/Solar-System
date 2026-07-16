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
  DEFAULT_BLOOM,
  DEFAULT_COLOR_GRADING,
  DEFAULT_VIGNETTE,
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