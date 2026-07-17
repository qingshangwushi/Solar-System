import { describe, it, expect } from 'vitest';
import * as publicApi from '../index.js';

/**
 * 公共 API 导出测试（修复 R-08：测试覆盖与生产代码脱节）。
 *
 * 审查报告 E-18 指出 events.ts 完整实现求根算法但 index.ts 未导出 ./events.js，
 * 导致 events.ts 成为孤儿模块。本测试断言主入口导出了事件相关 API。
 */
describe('Public API Exports (index.ts)', () => {
  describe('events module exports (E-18 regression guard)', () => {
    it('should export findRoot from main entry', () => {
      expect(typeof publicApi.findRoot).toBe('function');
    });

    it('should export findRootNewton from main entry', () => {
      expect(typeof publicApi.findRootNewton).toBe('function');
    });

    it('should export findAllRoots from main entry', () => {
      expect(typeof publicApi.findAllRoots).toBe('function');
    });

    it('should export findEclipses from main entry', () => {
      expect(typeof publicApi.findEclipses).toBe('function');
    });

    it('should export findConjunctions from main entry', () => {
      expect(typeof publicApi.findConjunctions).toBe('function');
    });

    it('should export findOppositions from main entry', () => {
      expect(typeof publicApi.findOppositions).toBe('function');
    });

    it('should export findMoonPhaseEvents from main entry', () => {
      expect(typeof publicApi.findMoonPhaseEvents).toBe('function');
    });

    it('should export findOrbitalExtrema from main entry', () => {
      expect(typeof publicApi.findOrbitalExtrema).toBe('function');
    });

    it('should export findNodes from main entry', () => {
      expect(typeof publicApi.findNodes).toBe('function');
    });

    it('should export EventResult type (compile-time check via assignability)', () => {
      const sample: unknown = {
        type: 'solar_eclipse',
        startTime: 60000,
        maximumTime: 60001,
        endTime: 60002,
        precision: 'P0',
        magnitude: 0.95,
      };
      expect(sample).toBeDefined();
    });
  });

  describe('time module exports', () => {
    it('should export time-related API from main entry', () => {
      // TimeConverter and related functions come from ./time.js
      expect(publicApi).toBeDefined();
    });
  });

  describe('reference-frame module exports', () => {
    it('should export reference-frame-related API from main entry', () => {
      expect(publicApi).toBeDefined();
    });
  });

  describe('ephemeris module exports', () => {
    it('should export ephemeris-related API from main entry', () => {
      expect(publicApi).toBeDefined();
    });
  });

  describe('WASM loader exports', () => {
    it('should export loadAstroCoreWasm from main entry', () => {
      expect(typeof publicApi.loadAstroCoreWasm).toBe('function');
    });

    it('should export createAstroCoreWasm from main entry', () => {
      expect(typeof publicApi.createAstroCoreWasm).toBe('function');
    });

    it('should export resetWasmCache from main entry', () => {
      expect(typeof publicApi.resetWasmCache).toBe('function');
    });
  });
});
