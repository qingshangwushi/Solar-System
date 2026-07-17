/**
 * WebGL2 RendererFactory 契约测试（任务 8 / E-38 / R-07）。
 *
 * 验证：
 * 1. WebGl2RendererFactory.create 接受 RendererConfig 参数并构造后端类型为 'webgl2' 的 Renderer；
 * 2. create 返回的 renderer 暴露传入的 config（通过 getConfig 读取）；
 * 3. isSupported('webgl2') 在 DOM canvas webgl2 context 可用时返回 true、缺失时返回 false；
 * 4. isSupported('webgpu') 始终返回 false（不同后端不应互相支持）。
 *
 * 通过 vi.stubGlobal 模拟 document.createElement + canvas.getContext，使测试不依赖真实浏览器。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WebGl2RendererFactory } from '../index.js';
import type { RendererConfig } from '@solar-system/renderer-core';

const sampleConfig: RendererConfig = {
  width: 1024,
  height: 768,
  pixelRatio: 1.5,
  backend: 'webgl2',
  antialias: false,
  colorSpace: 'linear',
};

/** 创建一个支持 webgl2 的 mock document 环境。 */
function stubDocumentWithWebGL2(supported: boolean): void {
  const mockCanvas = {
    getContext: vi.fn((name: string) => {
      if (name === 'webgl2') {
        return supported ? {} : null;
      }
      return null;
    }),
  };
  vi.stubGlobal('document', {
    createElement: vi.fn(() => mockCanvas),
  });
}

describe('WebGl2RendererFactory 契约（E-38）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('create 接受 RendererConfig 并返回 backend="webgl2" 的 Renderer', async () => {
    const factory = new WebGl2RendererFactory();
    const renderer = await factory.create(sampleConfig);
    expect(renderer).toBeDefined();
    expect(renderer.backend).toBe('webgl2');
  });

  it('create 返回的 renderer 保留传入的 config（getConfig 可读回）', async () => {
    const factory = new WebGl2RendererFactory();
    const renderer = await factory.create(sampleConfig);
    const cfg = (renderer as unknown as { getConfig(): RendererConfig | null }).getConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.width).toBe(1024);
    expect(cfg!.height).toBe(768);
    expect(cfg!.pixelRatio).toBe(1.5);
    expect(cfg!.backend).toBe('webgl2');
    expect(cfg!.antialias).toBe(false);
    expect(cfg!.colorSpace).toBe('linear');
  });

  it('isSupported("webgl2") 在 document 缺失时返回 false', () => {
    const factory = new WebGl2RendererFactory();
    // Node 测试环境默认无 document
    expect(factory.isSupported('webgl2')).toBe(false);
  });

  it('isSupported("webgl2") 在 canvas webgl2 context 不可用时返回 false', () => {
    const factory = new WebGl2RendererFactory();
    stubDocumentWithWebGL2(false);
    expect(factory.isSupported('webgl2')).toBe(false);
  });

  it('isSupported("webgl2") 在 canvas webgl2 context 可用时返回 true', () => {
    const factory = new WebGl2RendererFactory();
    stubDocumentWithWebGL2(true);
    expect(factory.isSupported('webgl2')).toBe(true);
  });

  it('isSupported("webgpu") 始终返回 false（不应支持其他后端）', () => {
    const factory = new WebGl2RendererFactory();
    expect(factory.isSupported('webgpu')).toBe(false);
    // 即便 webgl2 可用，webgpu 仍应返回 false
    stubDocumentWithWebGL2(true);
    expect(factory.isSupported('webgpu')).toBe(false);
  });
});
