/**
 * WebGPU RendererFactory 契约测试（任务 8 / E-38 / R-07）。
 *
 * 验证：
 * 1. WebGpuRendererFactory.create 接受 RendererConfig 参数并构造后端类型为 'webgpu' 的 Renderer；
 * 2. create 返回的 renderer 暴露传入的 config（通过 getConfig 读取）；
 * 3. isSupported('webgpu') 在 navigator.gpu 存在时返回 true、缺失时返回 false；
 * 4. isSupported('webgl2') 始终返回 false（不同后端不应互相支持）。
 *
 * 通过 vi.stubGlobal 模拟 navigator.gpu，使测试不依赖真实 WebGPU 运行时。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WebGpuRendererFactory } from '../index.js';
import type { RendererConfig } from '@solar-system/renderer-core';

const sampleConfig: RendererConfig = {
  width: 1280,
  height: 720,
  pixelRatio: 2,
  backend: 'webgpu',
  antialias: true,
  colorSpace: 'srgb',
};

describe('WebGpuRendererFactory 契约（E-38）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('create 接受 RendererConfig 并返回 backend="webgpu" 的 Renderer', async () => {
    const factory = new WebGpuRendererFactory();
    const renderer = await factory.create(sampleConfig);
    expect(renderer).toBeDefined();
    expect(renderer.backend).toBe('webgpu');
  });

  it('create 返回的 renderer 保留传入的 config（getConfig 可读回）', async () => {
    const factory = new WebGpuRendererFactory();
    const renderer = await factory.create(sampleConfig);
    const cfg = (renderer as unknown as { getConfig(): RendererConfig | null }).getConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.width).toBe(1280);
    expect(cfg!.height).toBe(720);
    expect(cfg!.pixelRatio).toBe(2);
    expect(cfg!.backend).toBe('webgpu');
    expect(cfg!.antialias).toBe(true);
    expect(cfg!.colorSpace).toBe('srgb');
  });

  it('isSupported("webgpu") 在 navigator.gpu 缺失时返回 false', () => {
    const factory = new WebGpuRendererFactory();
    // Node 测试环境默认无 navigator.gpu
    expect(factory.isSupported('webgpu')).toBe(false);
  });

  it('isSupported("webgpu") 在 navigator.gpu 存在时返回 true', () => {
    const factory = new WebGpuRendererFactory();
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: vi.fn(),
        getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm'),
      },
    });
    expect(factory.isSupported('webgpu')).toBe(true);
  });

  it('isSupported("webgl2") 始终返回 false（不应支持其他后端）', () => {
    const factory = new WebGpuRendererFactory();
    expect(factory.isSupported('webgl2')).toBe(false);
    // 即便 navigator.gpu 存在，webgl2 仍应返回 false
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: vi.fn(), getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm') },
    });
    expect(factory.isSupported('webgl2')).toBe(false);
  });

  it('isSupported 对 navigator 完全缺失的环境也安全返回 false', () => {
    const factory = new WebGpuRendererFactory();
    expect(factory.isSupported('webgpu')).toBe(false);
  });
});
