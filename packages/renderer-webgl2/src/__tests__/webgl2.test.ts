import { describe, it, expect } from 'vitest';
import { WebGl2Renderer, WebGl2RendererFactory } from '../index.js';

describe('WebGL2 Renderer', () => {
  it('应创建后端类型为 webgl2 的渲染器', () => {
    const renderer = new WebGl2Renderer();
    expect(renderer.backend).toBe('webgl2');
    expect(renderer.capabilities.maxTextureSize).toBe(8192);
  });
});

describe('WebGL2 Renderer Factory', () => {
  it('应在 Node 环境中报告不支持', () => {
    const factory = new WebGl2RendererFactory();
    expect(factory.isSupported('webgl2')).toBe(false);
  });

  it('对 webgpu 后端应返回 false', () => {
    const factory = new WebGl2RendererFactory();
    expect(factory.isSupported('webgpu')).toBe(false);
  });

  it('应能创建渲染器实例', async () => {
    const factory = new WebGl2RendererFactory();
    const renderer = await factory.create({
      width: 800,
      height: 600,
      pixelRatio: 1,
      backend: 'webgl2',
      antialias: true,
      colorSpace: 'srgb',
    });
    expect(renderer.backend).toBe('webgl2');
  });
});
