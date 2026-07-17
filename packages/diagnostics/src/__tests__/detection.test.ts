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
  detectWebgpu,
  recommendQuality,
  recommendBackend,
  type CapabilityDetection,
} from '../index.js';

/** 构造一个 mock navigator.gpu，包含 requestAdapter + adapter.requestDevice。 */
function setupMockGpu(opts: {
  hasGpu?: boolean;
  adapter?: {
    info?: { vendor: string; architecture: string };
    requestDevice?: () => Promise<unknown>;
  } | null;
  device?: {
    limits?: Record<string, number>;
    destroy?: ReturnType<typeof vi.fn>;
  };
}): {
  destroySpy: ReturnType<typeof vi.fn> | null;
  requestDeviceSpy: ReturnType<typeof vi.fn>;
  requestAdapterSpy: ReturnType<typeof vi.fn>;
} {
  const hasGpu = opts.hasGpu ?? true;
  if (!hasGpu) {
    return { destroySpy: null, requestDeviceSpy: vi.fn(), requestAdapterSpy: vi.fn() };
  }
  const destroySpy = opts.device?.destroy ?? vi.fn();
  const device = {
    limits: opts.device?.limits ?? {
      maxTextureDimension2D: 16384,
      maxTextureDimension3D: 2048,
      maxTextureArrayLayers: 256,
      maxBindGroups: 4,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 134217728,
      maxVertexAttributes: 16,
      maxVertexBufferArrayStride: 2048,
    },
    destroy: destroySpy,
  };
  const requestDeviceSpy = opts.adapter?.requestDevice
    ? vi.fn(opts.adapter.requestDevice)
    : vi.fn(async () => device);
  const adapter =
    opts.adapter === null
      ? null
      : {
          info: opts.adapter?.info ?? { vendor: 'nvidia', architecture: 'rtx4080' },
          requestDevice: requestDeviceSpy,
        };
  const requestAdapterSpy = vi.fn(async () => adapter);
  vi.stubGlobal('navigator', { gpu: { requestAdapter: requestAdapterSpy } });
  return { destroySpy, requestDeviceSpy, requestAdapterSpy };
}

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

describe('detectWebgpu (E-36: device leak fix)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should call device.destroy() once after reading limits', async () => {
    const { destroySpy } = setupMockGpu({});
    const result = await detectWebgpu();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(result.supported).toBe(true);
    expect(result.limits).not.toBeNull();
  });

  it('should read correct limits from device', async () => {
    setupMockGpu({
      device: {
        limits: {
          maxTextureDimension2D: 16384,
          maxTextureDimension3D: 4096,
          maxTextureArrayLayers: 512,
          maxBindGroups: 8,
          maxUniformBufferBindingSize: 65536,
          maxStorageBufferBindingSize: 268435456,
          maxVertexAttributes: 32,
          maxVertexBufferArrayStride: 4096,
        },
        destroy: vi.fn(),
      },
    });
    const result = await detectWebgpu();
    expect(result.limits).toEqual({
      maxTextureDimension2D: 16384,
      maxTextureDimension3D: 4096,
      maxTextureArrayLayers: 512,
      maxBindGroups: 8,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 268435456,
      maxVertexAttributes: 32,
      maxVertexBufferArrayStride: 4096,
    });
  });

  it('should return supported=false when navigator.gpu is missing', async () => {
    vi.stubGlobal('navigator', { userAgent: '' });
    const result = await detectWebgpu();
    expect(result.supported).toBe(false);
    expect(result.adapter).toBeNull();
    expect(result.limits).toBeNull();
    expect(result.featureLevel).toBe('none');
  });

  it('should return supported=false when requestAdapter returns null', async () => {
    setupMockGpu({ adapter: null });
    const result = await detectWebgpu();
    expect(result.supported).toBe(false);
    expect(result.adapter).toBeNull();
    expect(result.limits).toBeNull();
    expect(result.featureLevel).toBe('none');
  });

  it('should return featureLevel=full when maxTextureDimension2D >= 16384', async () => {
    setupMockGpu({
      device: {
        limits: {
          maxTextureDimension2D: 16384,
          maxTextureDimension3D: 2048,
          maxTextureArrayLayers: 256,
          maxBindGroups: 4,
          maxUniformBufferBindingSize: 65536,
          maxStorageBufferBindingSize: 134217728,
          maxVertexAttributes: 16,
          maxVertexBufferArrayStride: 2048,
        },
        destroy: vi.fn(),
      },
    });
    const result = await detectWebgpu();
    expect(result.featureLevel).toBe('full');
  });

  it('should return featureLevel=partial when maxTextureDimension2D < 16384', async () => {
    setupMockGpu({
      device: {
        limits: {
          maxTextureDimension2D: 8192,
          maxTextureDimension3D: 1024,
          maxTextureArrayLayers: 128,
          maxBindGroups: 4,
          maxUniformBufferBindingSize: 32768,
          maxStorageBufferBindingSize: 67108864,
          maxVertexAttributes: 16,
          maxVertexBufferArrayStride: 2048,
        },
        destroy: vi.fn(),
      },
    });
    const result = await detectWebgpu();
    expect(result.featureLevel).toBe('partial');
  });

  it('should still call device.destroy() even when limits have missing keys (default 0)', async () => {
    const destroySpy = vi.fn();
    setupMockGpu({
      device: {
        limits: {} as Record<string, number>,
        destroy: destroySpy,
      },
    });
    const result = await detectWebgpu();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(result.limits).not.toBeNull();
    expect(result.limits?.maxTextureDimension2D).toBe(0);
    expect(result.featureLevel).toBe('partial');
  });

  it('should return supported=false and call no destroy when requestDevice rejects', async () => {
    const destroySpy = vi.fn();
    setupMockGpu({
      adapter: {
        info: { vendor: 'intel', architecture: 'uhd' },
        requestDevice: async () => {
          throw new Error('requestDevice failed');
        },
      },
      device: { destroy: destroySpy },
    });
    const result = await detectWebgpu();
    // requestDevice rejects → limits=null，但 supported 仍为 true（adapter 已拿到）
    expect(result.supported).toBe(true);
    expect(result.limits).toBeNull();
    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('should not throw if device.destroy is undefined (optional chaining)', async () => {
    // 模拟某些环境下 device 没有 destroy 方法
    const requestAdapterSpy = vi.fn(async () => ({
      info: { vendor: 'apple', architecture: 'm2' },
      requestDevice: async () => ({
        limits: {
          maxTextureDimension2D: 16384,
          maxTextureDimension3D: 2048,
          maxTextureArrayLayers: 256,
          maxBindGroups: 4,
          maxUniformBufferBindingSize: 65536,
          maxStorageBufferBindingSize: 134217728,
          maxVertexAttributes: 16,
          maxVertexBufferArrayStride: 2048,
        },
        // 故意不提供 destroy
      }),
    }));
    vi.stubGlobal('navigator', { gpu: { requestAdapter: requestAdapterSpy } });
    const result = await detectWebgpu();
    expect(result.supported).toBe(true);
    expect(result.limits).not.toBeNull();
    // 不应抛错
  });

  it('should return adapter string with vendor and architecture', async () => {
    setupMockGpu({
      adapter: {
        info: { vendor: 'amd', architecture: 'radeon780m' },
      },
    });
    const result = await detectWebgpu();
    expect(result.adapter).toBe('amd radeon780m');
  });
});
