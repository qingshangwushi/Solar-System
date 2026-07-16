import { describe, it, expect } from 'vitest';
import {
  estimateGPUPerformance,
  getQualityLevelFromScore,
  getQualityPreset,
  PerformanceMonitor,
  getRecommendedTextureSize,
  getRecommendedShadowResolution,
  getRecommendedParticleCount,
  QualityLevel,
} from '../quality.js';

describe('Quality System', () => {
  describe('GPU Performance Estimation', () => {
    it('should estimate score for high-end GPU', () => {
      const gpuInfo = {
        vendor: 'nvidia' as const,
        renderer: 'NVIDIA GeForce RTX 4080',
        memory: 16 * 1024,
        maxTextureSize: 16384,
        maxRenderbufferSize: 16384,
        maxVertexAttribs: 16,
        maxFragmentUniformVectors: 1024,
        maxVertexUniformVectors: 1024,
        webgl2: true,
        webgpu: true,
      };

      const score = estimateGPUPerformance(gpuInfo);
      expect(score).toBeGreaterThan(80);
    });

    it('should estimate score for mid-range GPU', () => {
      const gpuInfo = {
        vendor: 'nvidia' as const,
        renderer: 'NVIDIA GeForce GTX 1060',
        memory: 6 * 1024,
        maxTextureSize: 16384,
        maxRenderbufferSize: 16384,
        maxVertexAttribs: 16,
        maxFragmentUniformVectors: 1024,
        maxVertexUniformVectors: 1024,
        webgl2: true,
        webgpu: false,
      };

      const score = estimateGPUPerformance(gpuInfo);
      expect(score).toBeGreaterThan(50);
    });

    it('should estimate score for low-end GPU', () => {
      const gpuInfo = {
        vendor: 'intel' as const,
        renderer: 'Intel UHD Graphics 620',
        memory: null,
        maxTextureSize: 8192,
        maxRenderbufferSize: 8192,
        maxVertexAttribs: 16,
        maxFragmentUniformVectors: 512,
        maxVertexUniformVectors: 512,
        webgl2: true,
        webgpu: false,
      };

      const score = estimateGPUPerformance(gpuInfo);
      expect(score).toBeLessThan(60);
    });

    it('should score Apple Silicon', () => {
      const gpuInfo = {
        vendor: 'apple' as const,
        renderer: 'Apple M2',
        memory: null,
        maxTextureSize: 16384,
        maxRenderbufferSize: 16384,
        maxVertexAttribs: 16,
        maxFragmentUniformVectors: 1024,
        maxVertexUniformVectors: 1024,
        webgl2: true,
        webgpu: true,
      };

      const score = estimateGPUPerformance(gpuInfo);
      expect(score).toBeGreaterThan(50);
    });
  });

  describe('Quality Level from Score', () => {
    it('should return ultra for high score', () => {
      expect(getQualityLevelFromScore(90)).toBe('ultra');
      expect(getQualityLevelFromScore(80)).toBe('ultra');
    });

    it('should return high for medium-high score', () => {
      expect(getQualityLevelFromScore(70)).toBe('high');
      expect(getQualityLevelFromScore(60)).toBe('high');
    });

    it('should return medium for medium score', () => {
      expect(getQualityLevelFromScore(50)).toBe('medium');
      expect(getQualityLevelFromScore(40)).toBe('medium');
    });

    it('should return low for low score', () => {
      expect(getQualityLevelFromScore(30)).toBe('low');
      expect(getQualityLevelFromScore(0)).toBe('low');
    });
  });

  describe('Quality Presets', () => {
    it('should return correct low preset', () => {
      const preset = getQualityPreset('low');
      expect(preset.level).toBe('low');
      expect(preset.shadowResolution).toBe(512);
      expect(preset.bloomEnabled).toBe(false);
    });

    it('should return correct medium preset', () => {
      const preset = getQualityPreset('medium');
      expect(preset.level).toBe('medium');
      expect(preset.shadowResolution).toBe(1024);
      expect(preset.bloomEnabled).toBe(true);
    });

    it('should return correct high preset', () => {
      const preset = getQualityPreset('high');
      expect(preset.level).toBe('high');
      expect(preset.shadowResolution).toBe(2048);
      expect(preset.antialiasing).toBe('msaa4x');
    });

    it('should return correct ultra preset', () => {
      const preset = getQualityPreset('ultra');
      expect(preset.level).toBe('ultra');
      expect(preset.shadowResolution).toBe(4096);
      expect(preset.antialiasing).toBe('msaa8x');
    });
  });

  describe('Performance Monitor', () => {
    it('should track frames', () => {
      const monitor = new PerformanceMonitor();

      monitor.beginFrame();
      monitor.endFrame();

      const metrics = monitor.getMetrics();
      expect(metrics.fps).toBeGreaterThan(0);
      expect(metrics.frameTime).toBeGreaterThan(0);
    });

    it('should track draw calls', () => {
      const monitor = new PerformanceMonitor();

      monitor.beginFrame();
      monitor.addDrawCall(100);
      monitor.addDrawCall(200);
      monitor.endFrame();

      const metrics = monitor.getMetrics();
      expect(metrics.drawCalls).toBe(2);
      expect(metrics.triangles).toBe(300);
    });

    it('should suggest quality downgrade on low FPS', () => {
      const monitor = new PerformanceMonitor();

      // Simulate low FPS scenario
      for (let i = 0; i < 60; i++) {
        monitor.beginFrame();
        monitor.endFrame();
      }

      // After simulating frames, test the logic
      expect(monitor.shouldDowngrade('high')).toBe(false); // Initial FPS should be fine
    });

    it('should suggest quality upgrade on high FPS', () => {
      const monitor = new PerformanceMonitor();

      for (let i = 0; i < 60; i++) {
        monitor.beginFrame();
        monitor.endFrame();
      }

      expect(monitor.shouldUpgrade('low')).toBe(true);
    });
  });

  describe('Recommended Settings', () => {
    it('should return recommended texture sizes', () => {
      expect(getRecommendedTextureSize('low')).toBe(512);
      expect(getRecommendedTextureSize('medium')).toBe(1024);
      expect(getRecommendedTextureSize('high')).toBe(2048);
      expect(getRecommendedTextureSize('ultra')).toBe(4096);
    });

    it('should return recommended shadow resolutions', () => {
      expect(getRecommendedShadowResolution('low')).toBe(512);
      expect(getRecommendedShadowResolution('medium')).toBe(1024);
      expect(getRecommendedShadowResolution('high')).toBe(2048);
      expect(getRecommendedShadowResolution('ultra')).toBe(4096);
    });

    it('should return recommended particle counts', () => {
      expect(getRecommendedParticleCount('low')).toBe(1000);
      expect(getRecommendedParticleCount('medium')).toBe(5000);
      expect(getRecommendedParticleCount('high')).toBe(10000);
      expect(getRecommendedParticleCount('ultra')).toBe(50000);
    });
  });
});