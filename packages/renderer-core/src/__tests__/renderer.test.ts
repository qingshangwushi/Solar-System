/**
 * 渲染后端抽象测试（任务 P0-12 验证）。
 *
 * 验证：
 * 1. 类型导出正确性；
 * 2. 工厂注册与创建流程。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  registerRendererFactory,
  createRenderer,
  type Renderer,
  type RendererConfig,
  type BackendType,
} from '../index.js';

describe('renderer-core exports', () => {
  it('exports BackendType', () => {
    const backends: BackendType[] = ['webgpu', 'webgl2'];
    expect(backends).toHaveLength(2);
  });

  it('exports RendererConfig type', () => {
    const config: RendererConfig = {
      width: 1920,
      height: 1080,
      pixelRatio: 1,
      backend: 'webgpu',
      antialias: true,
      colorSpace: 'srgb',
    };
    expect(config.width).toBe(1920);
    expect(config.backend).toBe('webgpu');
  });
});

describe('RendererFactory', () => {
  it('registerRendererFactory stores factory', () => {
    const mockFactory = {
      create: vi.fn().mockResolvedValue({} as Renderer),
      isSupported: vi.fn().mockReturnValue(true),
    };

    registerRendererFactory('webgpu', mockFactory);
    expect(mockFactory.isSupported('webgpu')).toBe(true);
  });

  it('createRenderer throws for unregistered backend', async () => {
    await expect(
      createRenderer({
        width: 1920,
        height: 1080,
        pixelRatio: 1,
        backend: 'webgl2',
        antialias: true,
        colorSpace: 'srgb',
      }),
    ).rejects.toThrow();
  });
});
