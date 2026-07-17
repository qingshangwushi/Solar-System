/**
 * RendererFactory 接口契约测试（任务 18 / 修复 R-07 / E-38）。
 *
 * 验证：
 * - WebGpuRendererFactory.create(config: RendererConfig): Promise<Renderer>
 * - WebGpuRendererFactory.isSupported(backend: BackendType): boolean
 * - WebGL2 Factory 同样签名
 * - 两个 Factory 都实现同一 RendererFactory 接口（结构化类型兼容）
 */
import { describe, it, expect } from 'vitest';
import type {
  Renderer,
  RendererFactory,
  RendererConfig,
  BackendType,
} from '@solar-system/renderer-core';
import { WebGpuRendererFactory } from '@solar-system/renderer-webgpu';
import { WebGl2RendererFactory } from '@solar-system/renderer-webgl2';

// ---------------------------------------------------------------------------
// 编译时类型断言：两个具体 Factory 必须可赋值给 RendererFactory 接口。
// 若 E-38 修复被回滚（签名缺失参数），tsc 会报错。
// ---------------------------------------------------------------------------
const _typeCheckWebGpu: RendererFactory = new WebGpuRendererFactory();
const _typeCheckWebGl2: RendererFactory = new WebGl2RendererFactory();
void _typeCheckWebGpu;
void _typeCheckWebGl2;

// 抽取工厂创建/支持检测的签名验证函数（结构化匹配 RendererFactory）
function assertRendererFactoryShape(factory: RendererFactory): void {
  expect(typeof factory.create).toBe('function');
  expect(typeof factory.isSupported).toBe('function');
  // create 接收 1 个参数（RendererConfig），isSupported 接收 1 个参数（BackendType）
  // 通过 Function.length 验证签名参数个数（与 E-38 修复保持一致）
  expect(factory.create.length).toBeGreaterThanOrEqual(1);
  expect(factory.isSupported.length).toBeGreaterThanOrEqual(1);
}

// ---------------------------------------------------------------------------

describe('RendererFactory 接口契约', () => {
  it('WebGpuRendererFactory 实现 RendererFactory 接口且签名匹配', async () => {
    const factory: RendererFactory = new WebGpuRendererFactory();

    assertRendererFactoryShape(factory);

    // isSupported 接收 BackendType，返回 boolean
    expect(factory.isSupported('webgpu')).toBeTypeOf('boolean');
    expect(factory.isSupported('webgl2')).toBe(false);

    // create 接收 RendererConfig，返回 Promise<Renderer>
    const config: RendererConfig = {
      width: 800,
      height: 600,
      pixelRatio: 1,
      backend: 'webgpu',
      antialias: true,
      colorSpace: 'srgb',
    };
    const rendererPromise: Promise<Renderer> = factory.create(config);
    expect(rendererPromise).toBeInstanceOf(Promise);

    const renderer = await rendererPromise;
    expect(renderer).toBeDefined();
    expect(renderer.backend).toBe('webgpu');
    expect(renderer.capabilities).toBeDefined();
  });

  it('WebGl2RendererFactory 实现 RendererFactory 接口且签名匹配', async () => {
    const factory: RendererFactory = new WebGl2RendererFactory();

    assertRendererFactoryShape(factory);

    // isSupported 接收 BackendType，返回 boolean
    expect(factory.isSupported('webgl2')).toBeTypeOf('boolean');
    expect(factory.isSupported('webgpu')).toBe(false);

    // create 接收 RendererConfig，返回 Promise<Renderer>
    const config: RendererConfig = {
      width: 640,
      height: 480,
      pixelRatio: 1,
      backend: 'webgl2',
      antialias: false,
      colorSpace: 'linear',
    };
    const renderer = await factory.create(config);
    expect(renderer).toBeDefined();
    expect(renderer.backend).toBe('webgl2');
    expect(renderer.capabilities).toBeDefined();
  });

  it('两个 Factory 都结构化兼容 RendererFactory 接口（可互换使用）', () => {
    // 把两个具体工厂放进同一 RendererFactory[] 数组，验证结构化类型兼容
    const factories: RendererFactory[] = [
      new WebGpuRendererFactory(),
      new WebGl2RendererFactory(),
    ];
    expect(factories).toHaveLength(2);

    // 通过 BackendType 路由到对应工厂并调用 isSupported
    const backendMap: Partial<Record<BackendType, RendererFactory>> = {
      webgpu: factories[0],
      webgl2: factories[1],
    };

    // webgpu 工厂只对 'webgpu' 返回 true（具体值依赖运行时，但 boolean 类型不变）
    expect(backendMap.webgpu!.isSupported('webgpu')).toBeTypeOf('boolean');
    expect(backendMap.webgl2!.isSupported('webgl2')).toBeTypeOf('boolean');

    // 两个工厂对相同 backend 的 isSupported 至少有一个返回值定义
    // （在 Node 测试环境下两者都可能返回 false，关键是类型与签名一致）
    const allBackends: BackendType[] = ['webgpu', 'webgl2'];
    for (const b of allBackends) {
      for (const f of factories) {
        expect(f.isSupported(b)).toBeTypeOf('boolean');
      }
    }
  });
});
