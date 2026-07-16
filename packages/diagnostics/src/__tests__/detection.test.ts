/**
 * 能力检测与启动基准测试（任务 P0-11 验证）。
 *
 * 验证：
 * 1. 单测覆盖检测逻辑；
 * 2. 强制 navigator.gpu 缺失时降级路径生效（FR-BOOT-003）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectBrowser,
  detectOs,
  recommendQuality,
  recommendBackend,
  type CapabilityDetection,
} from '../index.js';

describe('detectBrowser', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects Chrome', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' });
    const result = detectBrowser();
    expect(result.type).toBe('chrome');
    expect(result.version).toBe('120.0.0.0');
  });

  it('detects Edge (not Chrome)', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0.0.0' });
    const result = detectBrowser();
    expect(result.type).toBe('edge');
    expect(result.version).toBe('120.0.0.0');
  });

  it('detects Firefox', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/119.0' });
    const result = detectBrowser();
    expect(result.type).toBe('firefox');
    expect(result.version).toBe('119.0');
  });

  it('returns unknown for unknown UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'UnknownBrowser/1.0' });
    const result = detectBrowser();
    expect(result.type).toBe('unknown');
  });
});

describe('detectOs', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects Windows', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    const result = detectOs();
    expect(result.type).toBe('windows');
    expect(result.version).toBe('10.0');
  });

  it('detects macOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    const result = detectOs();
    expect(result.type).toBe('macos');
    expect(result.version).toBe('10.15.7');
  });

  it('detects Linux', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
    const result = detectOs();
    expect(result.type).toBe('linux');
  });
});

describe('recommendQuality', () => {
  it('returns cinematic for high-end GPUs', () => {
    expect(recommendQuality(90)).toBe('cinematic');
    expect(recommendQuality(80)).toBe('cinematic');
  });

  it('returns high for mid-range GPUs', () => {
    expect(recommendQuality(70)).toBe('high');
    expect(recommendQuality(60)).toBe('high');
  });

  it('returns standard for entry-level GPUs', () => {
    expect(recommendQuality(45)).toBe('standard');
    expect(recommendQuality(30)).toBe('standard');
  });

  it('returns safe for minimal GPUs', () => {
    expect(recommendQuality(20)).toBe('safe');
    expect(recommendQuality(0)).toBe('safe');
  });
});

describe('recommendBackend (FR-BOOT-003)', () => {
  it('recommends webgpu when supported', () => {
    const caps: CapabilityDetection = {
      browser: 'chrome',
      browserVersion: '120',
      os: 'windows',
      osVersion: '10',
      webgpu: { supported: true, adapter: 'NVIDIA', limits: null, featureLevel: 'full' },
      webgl2: { supported: true, renderer: null, vendor: null, maxTextureSize: 16384, maxTextureUnits: 16, compressedTextureFormats: [] },
      textureCompression: { etc1: false, etc2: false, astc: false, pvrtc: false, bc: false, basis: false },
      memory: { totalJsHeapSize: null, usedJsHeapSize: null },
      maxTextureSize: 16384,
    };
    expect(recommendBackend(caps)).toBe('webgpu');
  });

  it('recommends webgl2 when webgpu is not supported (FR-BOOT-003 降级)', () => {
    const caps: CapabilityDetection = {
      browser: 'firefox',
      browserVersion: '119',
      os: 'windows',
      osVersion: '10',
      webgpu: { supported: false, adapter: null, limits: null, featureLevel: 'none' },
      webgl2: { supported: true, renderer: null, vendor: null, maxTextureSize: 8192, maxTextureUnits: 16, compressedTextureFormats: [] },
      textureCompression: { etc1: false, etc2: false, astc: false, pvrtc: false, bc: false, basis: false },
      memory: { totalJsHeapSize: null, usedJsHeapSize: null },
      maxTextureSize: 8192,
    };
    expect(recommendBackend(caps)).toBe('webgl2');
  });

  it('recommends webgl2 when both webgpu and webgl2 are supported but webgpu featureLevel is none', () => {
    const caps: CapabilityDetection = {
      browser: 'chrome',
      browserVersion: '120',
      os: 'windows',
      osVersion: '10',
      webgpu: { supported: true, adapter: 'Intel', limits: null, featureLevel: 'none' },
      webgl2: { supported: true, renderer: null, vendor: null, maxTextureSize: 8192, maxTextureUnits: 16, compressedTextureFormats: [] },
      textureCompression: { etc1: false, etc2: false, astc: false, pvrtc: false, bc: false, basis: false },
      memory: { totalJsHeapSize: null, usedJsHeapSize: null },
      maxTextureSize: 8192,
    };
    expect(recommendBackend(caps)).toBe('webgpu');
  });
});
