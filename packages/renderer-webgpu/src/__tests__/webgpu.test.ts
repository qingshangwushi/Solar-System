import { describe, it, expect } from 'vitest';
import { WebGpuRenderer, WebGpuRendererFactory } from '../index.js';

describe('WebGPU Renderer', () => {
  it('应创建后端类型为 webgpu 的渲染器', () => {
    const renderer = new WebGpuRenderer();
    expect(renderer.backend).toBe('webgpu');
    expect(renderer.capabilities.maxTextureSize).toBe(16384);
  });
});

describe('WebGPU Renderer Factory', () => {
  it('应在 Node 环境中报告不支持', () => {
    const factory = new WebGpuRendererFactory();
    expect(factory.isSupported()).toBe(false);
  });

  it('应能创建渲染器实例', async () => {
    const factory = new WebGpuRendererFactory();
    const renderer = await factory.create();
    expect(renderer.backend).toBe('webgpu');
  });
});
