import { describe, it, expect, beforeEach } from 'vitest';
import {
  DiagnosticPanel,
  formatBytes,
  formatFPS,
  formatFrameTime,
} from '../diagnostic.js';

describe('Diagnostic Panel', () => {
  let panel: DiagnosticPanel;

  beforeEach(() => {
    panel = new DiagnosticPanel({
      enabled: true,
      logErrors: true,
      logWarnings: true,
    });
  });

  describe('Performance Tracking', () => {
    it('should update performance metrics', () => {
      panel.updatePerformance({
        fps: 60,
        frameTime: 16.67,
        gpuTime: 5,
        drawCalls: 100,
        triangles: 10000,
        memoryUsed: 100 * 1024 * 1024,
      });

      const info = panel.getDiagnosticInfo();
      expect(info.performance.fps).toBeCloseTo(60, 0);
      expect(info.performance.drawCalls).toBe(100);
    });

    it('should track multiple frames', () => {
      for (let i = 0; i < 10; i++) {
        panel.updatePerformance({
          fps: 60,
          frameTime: 16.67,
          gpuTime: null,
          drawCalls: 100,
          triangles: 10000,
          memoryUsed: 50 * 1024 * 1024,
        });
      }

      const info = panel.getDiagnosticInfo();
      expect(info.performance.fps).toBeCloseTo(60, 0);
    });

    it('should limit history size', () => {
      const config = { performanceHistorySize: 10 };
      const smallPanel = new DiagnosticPanel(config);

      for (let i = 0; i < 20; i++) {
        smallPanel.updatePerformance({
          fps: 60,
          frameTime: 16.67,
          gpuTime: null,
          drawCalls: 100,
          triangles: 10000,
          memoryUsed: 50 * 1024 * 1024,
        });
      }

      const info = smallPanel.getDiagnosticInfo();
      expect(info.performance.fps).toBeCloseTo(60, 0);
    });
  });

  describe('Error Logging', () => {
    it('should log errors', () => {
      panel.logError(new Error('Test error'));

      const info = panel.getDiagnosticInfo();
      expect(info.errors.length).toBe(1);
      expect(info.errors[0].message).toBe('Test error');
    });

    it('should log critical errors', () => {
      panel.logError(new Error('Critical error'), 'critical');

      const info = panel.getDiagnosticInfo();
      expect(info.errors[0].severity).toBe('critical');
    });

    it('should limit error history', () => {
      for (let i = 0; i < 150; i++) {
        panel.logError(new Error(`Error ${i}`));
      }

      const info = panel.getDiagnosticInfo();
      expect(info.errors.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Warning Logging', () => {
    it('should add warnings', () => {
      panel.addWarning('performance', 'FPS dropped');

      const info = panel.getDiagnosticInfo();
      expect(info.warnings.length).toBe(1);
      expect(info.warnings[0].category).toBe('performance');
    });

    it('should track different warning categories', () => {
      panel.addWarning('performance', 'Low FPS');
      panel.addWarning('memory', 'High memory');
      panel.addWarning('rendering', 'Many draw calls');

      const info = panel.getDiagnosticInfo();
      expect(info.warnings.length).toBe(3);
    });
  });

  describe('Thresholds', () => {
    it('should warn on low FPS', () => {
      panel.updatePerformance({
        fps: 20,
        frameTime: 50,
        gpuTime: null,
        drawCalls: 100,
        triangles: 10000,
        memoryUsed: 50 * 1024 * 1024,
      });

      const info = panel.getDiagnosticInfo();
      expect(info.warnings.some(w => w.message.includes('FPS'))).toBe(true);
    });
  });

  describe('Callbacks', () => {
    it('should notify subscribers', () => {
      let called = false;
      panel.subscribe(() => {
        called = true;
      });

      panel.logError(new Error('Test'));

      expect(called).toBe(true);
    });

    it('should allow unsubscribing', () => {
      let callCount = 0;
      const unsubscribe = panel.subscribe(() => {
        callCount++;
      });

      panel.logError(new Error('Test 1'));
      unsubscribe();
      panel.logError(new Error('Test 2'));

      expect(callCount).toBe(1);
    });
  });

  describe('Configuration', () => {
    it('should be disableable', () => {
      panel.setEnabled(false);

      panel.logError(new Error('Test'));
      panel.updatePerformance({
        fps: 20,
        frameTime: 50,
        gpuTime: null,
        drawCalls: 100,
        triangles: 10000,
        memoryUsed: 50 * 1024 * 1024,
      });

      const info = panel.getDiagnosticInfo();
      expect(info.errors.length).toBe(0);
    });

    it('should clear history', () => {
      panel.logError(new Error('Test'));
      panel.addWarning('performance', 'Warning');
      panel.updatePerformance({
        fps: 60,
        frameTime: 16.67,
        gpuTime: null,
        drawCalls: 100,
        triangles: 10000,
        memoryUsed: 50 * 1024 * 1024,
      });

      panel.clearHistory();

      const info = panel.getDiagnosticInfo();
      expect(info.errors.length).toBe(0);
      expect(info.warnings.length).toBe(0);
    });
  });
});

describe('Format Functions', () => {
  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(2048)).toBe('2.0 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1.00 GB');
    });
  });

  describe('formatFPS', () => {
    it('should format excellent FPS', () => {
      expect(formatFPS(60)).toContain('excellent');
    });

    it('should format good FPS', () => {
      expect(formatFPS(50)).toContain('good');
    });

    it('should format acceptable FPS', () => {
      expect(formatFPS(35)).toContain('acceptable');
    });

    it('should format poor FPS', () => {
      expect(formatFPS(20)).toContain('poor');
    });
  });

  describe('formatFrameTime', () => {
    it('should format fast frame time', () => {
      expect(formatFrameTime(10)).toContain('60 FPS');
    });

    it('should format medium frame time', () => {
      expect(formatFrameTime(20)).toContain('30-60 FPS');
    });

    it('should format slow frame time', () => {
      expect(formatFrameTime(40)).toContain('30 FPS');
    });
  });
});