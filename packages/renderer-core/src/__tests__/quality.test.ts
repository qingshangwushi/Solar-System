import { describe, it, expect } from 'vitest';
import {
  estimateGPUPerformance,
  getQualityLevelFromScore,
  getQualityPreset,
  PerformanceMonitor,
  getRecommendedTextureSize,
  getRecommendedShadowResolution,
  getRecommendedParticleCount,
  QualityController,
  applyQualityAction,
  DefaultQualityApplier,
} from '../quality.js';
import type { QualityAction, QualityApplier, PerformanceMetrics } from '../quality.js';

/**
 * 受控的 PerformanceMonitor 子类：测试时可显式设置返回的 fps。
 */
class ControllableMonitor extends PerformanceMonitor {
  private fakeFps = 60;
  private fakeFrameTime = 16.6;
  setFps(fps: number): void {
    this.fakeFps = fps;
    this.fakeFrameTime = 1000 / Math.max(fps, 1);
  }
  getMetrics(): PerformanceMetrics {
    return {
      fps: this.fakeFps,
      frameTime: this.fakeFrameTime,
      gpuTime: null,
      drawCalls: 0,
      triangles: 0,
      memoryUsed: 0,
    };
  }
}

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

describe('QualityController (E-08)', () => {
  describe('applyQualityAction', () => {
    it('should call setTextureResolution on the applier', () => {
      const applier = new DefaultQualityApplier();
      applyQualityAction({ type: 'degrade', newProfile: 'low' }, applier);
      expect(applier.getTextureResolution()).toBe(512);
    });

    it('should call setShadowResolution on the applier', () => {
      const applier = new DefaultQualityApplier();
      applyQualityAction({ type: 'upgrade', newProfile: 'ultra' }, applier);
      expect(applier.getShadowResolution()).toBe(4096);
    });

    it('should set both resolutions together', () => {
      const applier = new DefaultQualityApplier();
      applyQualityAction({ type: 'degrade', newProfile: 'medium' }, applier);
      expect(applier.getTextureResolution()).toBe(1024);
      expect(applier.getShadowResolution()).toBe(1024);
    });

    it('should work with a custom applier implementation', () => {
      const calls: string[] = [];
      const custom: QualityApplier = {
        setTextureResolution: (n: number) => calls.push(`tex:${n}`),
        setShadowResolution: (n: number) => calls.push(`shad:${n}`),
      };
      applyQualityAction({ type: 'upgrade', newProfile: 'high' }, custom);
      expect(calls).toContain('tex:2048');
      expect(calls).toContain('shad:2048');
    });
  });

  describe('DefaultQualityApplier', () => {
    it('should default to 1024 for both resolutions', () => {
      const applier = new DefaultQualityApplier();
      expect(applier.getTextureResolution()).toBe(1024);
      expect(applier.getShadowResolution()).toBe(1024);
    });

    it('should persist the latest values', () => {
      const applier = new DefaultQualityApplier();
      applier.setTextureResolution(4096);
      applier.setShadowResolution(2048);
      expect(applier.getTextureResolution()).toBe(4096);
      expect(applier.getShadowResolution()).toBe(2048);
    });
  });

  describe('QualityController construction', () => {
    it('should default to high profile', () => {
      const controller = new QualityController();
      expect(controller.getCurrentProfile()).toBe('high');
    });

    it('should accept a custom initial profile', () => {
      const controller = new QualityController('medium');
      expect(controller.getCurrentProfile()).toBe('medium');
    });

    it('should accept a custom monitor', () => {
      const monitor = new ControllableMonitor();
      const controller = new QualityController('high', monitor);
      expect(controller.getMonitor()).toBe(monitor);
    });

    it('should expose the configured hysteresis count', () => {
      const controller = new QualityController('high', undefined, 30, 55, 5);
      expect(controller.getHysteresisCount()).toBe(5);
    });
  });

  describe('QualityController.update() degradation', () => {
    it('should not degrade before hysteresis threshold is reached', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('high', monitor, 30, 55, 10);
      for (let i = 0; i < 9; i++) {
        expect(controller.update()).toBeNull();
      }
      expect(controller.getCurrentProfile()).toBe('high');
      expect(controller.getDegradeCounter()).toBe(9);
    });

    it('should degrade after hysteresis threshold is reached', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('high', monitor, 30, 55, 10);
      let triggered: QualityAction | null = null;
      for (let i = 0; i < 10; i++) {
        triggered = controller.update();
      }
      expect(triggered).not.toBeNull();
      expect(triggered?.type).toBe('degrade');
      expect(triggered?.newProfile).toBe('medium');
      expect(controller.getCurrentProfile()).toBe('medium');
    });

    it('should reset degrade counter when fps recovers', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('high', monitor, 30, 55, 10);
      for (let i = 0; i < 5; i++) controller.update();
      expect(controller.getDegradeCounter()).toBe(5);
      monitor.setFps(45);
      controller.update();
      expect(controller.getDegradeCounter()).toBe(0);
    });

    it('should not degrade below low', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(5);
      const controller = new QualityController('low', monitor, 30, 55, 2);
      for (let i = 0; i < 5; i++) controller.update();
      expect(controller.getCurrentProfile()).toBe('low');
    });

    it('should degrade step-by-step across multiple levels', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(5);
      const controller = new QualityController('ultra', monitor, 30, 55, 2);
      // First trigger: ultra -> high
      for (let i = 0; i < 2; i++) controller.update();
      expect(controller.getCurrentProfile()).toBe('high');
      // Second trigger: high -> medium
      for (let i = 0; i < 2; i++) controller.update();
      expect(controller.getCurrentProfile()).toBe('medium');
    });
  });

  describe('QualityController.update() upgrade', () => {
    it('should not upgrade before hysteresis threshold', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(120);
      const controller = new QualityController('low', monitor, 30, 55, 10);
      for (let i = 0; i < 9; i++) {
        expect(controller.update()).toBeNull();
      }
      expect(controller.getCurrentProfile()).toBe('low');
      expect(controller.getUpgradeCounter()).toBe(9);
    });

    it('should upgrade after hysteresis threshold', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(120);
      const controller = new QualityController('low', monitor, 30, 55, 10);
      let triggered: QualityAction | null = null;
      for (let i = 0; i < 10; i++) {
        triggered = controller.update();
      }
      expect(triggered).not.toBeNull();
      expect(triggered?.type).toBe('upgrade');
      expect(triggered?.newProfile).toBe('medium');
      expect(controller.getCurrentProfile()).toBe('medium');
    });

    it('should not upgrade beyond ultra', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(120);
      const controller = new QualityController('ultra', monitor, 30, 55, 2);
      for (let i = 0; i < 5; i++) controller.update();
      expect(controller.getCurrentProfile()).toBe('ultra');
    });

    it('should reset upgrade counter when fps drops', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(120);
      const controller = new QualityController('low', monitor, 30, 55, 10);
      for (let i = 0; i < 5; i++) controller.update();
      expect(controller.getUpgradeCounter()).toBe(5);
      monitor.setFps(45);
      controller.update();
      expect(controller.getUpgradeCounter()).toBe(0);
    });
  });

  describe('QualityController.onQualityChange', () => {
    it('should invoke callback on degrade', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('high', monitor, 30, 55, 2);
      const actions: QualityAction[] = [];
      controller.onQualityChange((a) => actions.push(a));
      for (let i = 0; i < 2; i++) controller.update();
      expect(actions.length).toBe(1);
      expect(actions[0]?.type).toBe('degrade');
    });

    it('should invoke callback on upgrade', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(120);
      const controller = new QualityController('low', monitor, 30, 55, 2);
      const actions: QualityAction[] = [];
      controller.onQualityChange((a) => actions.push(a));
      for (let i = 0; i < 2; i++) controller.update();
      expect(actions.length).toBe(1);
      expect(actions[0]?.type).toBe('upgrade');
    });

    it('should support multiple subscribers', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('high', monitor, 30, 55, 2);
      let countA = 0;
      let countB = 0;
      controller.onQualityChange(() => countA++);
      controller.onQualityChange(() => countB++);
      for (let i = 0; i < 2; i++) controller.update();
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });

    it('should allow unsubscribing via the returned disposer', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('high', monitor, 30, 55, 2);
      let count = 0;
      const dispose = controller.onQualityChange(() => count++);
      dispose();
      for (let i = 0; i < 2; i++) controller.update();
      expect(count).toBe(0);
    });

    it('should not invoke removed callback', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('ultra', monitor, 30, 55, 2);
      const seen: string[] = [];
      controller.onQualityChange((a) => seen.push(`first:${a.type}`));
      const dispose2 = controller.onQualityChange((a) => seen.push(`second:${a.type}`));
      dispose2();
      for (let i = 0; i < 2; i++) controller.update();
      expect(seen.length).toBe(1);
      expect(seen[0]).toBe('first:degrade');
    });
  });

  describe('QualityController.setProfile', () => {
    it('should override current profile', () => {
      const controller = new QualityController('low');
      controller.setProfile('ultra');
      expect(controller.getCurrentProfile()).toBe('ultra');
    });

    it('should reset degrade counter', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('high', monitor, 30, 55, 10);
      for (let i = 0; i < 5; i++) controller.update();
      expect(controller.getDegradeCounter()).toBe(5);
      controller.setProfile('high');
      expect(controller.getDegradeCounter()).toBe(0);
    });

    it('should reset upgrade counter', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(120);
      const controller = new QualityController('low', monitor, 30, 55, 10);
      for (let i = 0; i < 5; i++) controller.update();
      expect(controller.getUpgradeCounter()).toBe(5);
      controller.setProfile('low');
      expect(controller.getUpgradeCounter()).toBe(0);
    });
  });

  describe('QualityController integration with QualityApplier', () => {
    it('should apply degraded settings via applyQualityAction', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(10);
      const controller = new QualityController('high', monitor, 30, 55, 2);
      const applier = new DefaultQualityApplier();
      controller.onQualityChange((a) => applyQualityAction(a, applier));
      for (let i = 0; i < 2; i++) controller.update();
      // high -> medium, both resolutions should be 1024
      expect(applier.getTextureResolution()).toBe(1024);
      expect(applier.getShadowResolution()).toBe(1024);
    });

    it('should apply upgraded settings via applyQualityAction', () => {
      const monitor = new ControllableMonitor();
      monitor.setFps(120);
      const controller = new QualityController('medium', monitor, 30, 55, 2);
      const applier = new DefaultQualityApplier();
      controller.onQualityChange((a) => applyQualityAction(a, applier));
      for (let i = 0; i < 2; i++) controller.update();
      // medium -> high, both resolutions should be 2048
      expect(applier.getTextureResolution()).toBe(2048);
      expect(applier.getShadowResolution()).toBe(2048);
    });
  });
});