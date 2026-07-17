/**
 * PostProcessingPipeline + ShadowMapPass 接口契约测试（任务 18 / 修复 R-07）。
 *
 * 验证 `@solar-system/renderer-core` 中：
 * - PostProcessingPipeline 接口契约（CPU 参考实现 PostProcessingPipelineImpl）
 * - GPUPostProcessingPipeline 接口契约
 * - ShadowMapPass 接口契约
 * - WebGPU / WebGL2 实现类存在且实现对应接口
 */
import { describe, it, expect } from 'vitest';
import type {
  PostProcessingPipeline,
  PostProcessingStage,
  PostProcessingTexture,
  PostProcessingRenderer,
  GPUPostProcessingPipeline,
  PostProcessingOptions,
  ShadowMapPass,
  ShadowMapOptions,
  BoundingBox,
  Renderer,
  TextureHandle,
} from '@solar-system/renderer-core';
import {
  PostProcessingPipelineImpl,
  createDefaultPipeline,
  DEFAULT_GPU_POST_PROCESSING,
  DEFAULT_SHADOW_MAP_OPTIONS,
  CPUTextureProxy,
} from '@solar-system/renderer-core';
import {
  WebGpuPostProcessingPipeline,
  createWebGpuPostProcessingPipeline,
} from '@solar-system/renderer-webgpu';
import {
  WebGl2PostProcessingPipeline,
  createWebGl2PostProcessingPipeline,
} from '@solar-system/renderer-webgl2';
import {
  WebGpuShadowMapPass,
  createWebGpuShadowMapPass,
} from '@solar-system/renderer-webgpu';
import {
  WebGl2ShadowMapPass,
  createWebGl2ShadowMapPass,
} from '@solar-system/renderer-webgl2';
import type { Vec3d } from '@solar-system/schemas';

// ---------------------------------------------------------------------------
// MockShadowMapPass：完整实现 ShadowMapPass 接口（用于契约对比）。
// ---------------------------------------------------------------------------

class MockShadowMapPass implements ShadowMapPass {
  prepareCalls = 0;
  executeCalls = 0;
  disposeCalls = 0;
  private depthTexture: TextureHandle | null = null;
  private disposed = false;

  prepare(
    _lightDirection: Vec3d,
    _shadowCastBounds: BoundingBox,
    _options: ShadowMapOptions,
  ): void {
    if (this.disposed) throw new Error('disposed');
    this.prepareCalls += 1;
    this.depthTexture = { id: 'mock-shadow-depth', format: 'depth32float' };
  }

  execute(_renderer: Renderer, _sceneDrawFn: () => void): void {
    if (this.disposed) throw new Error('disposed');
    if (!this.depthTexture) throw new Error('not prepared');
    this.executeCalls += 1;
  }

  getShadowMapTexture(): TextureHandle {
    if (!this.depthTexture) throw new Error('not prepared');
    return this.depthTexture;
  }

  dispose(): void {
    this.disposed = true;
    this.disposeCalls += 1;
    this.depthTexture = null;
  }
}

// ---------------------------------------------------------------------------
// MockGPUPostProcessingPipeline：完整实现 GPUPostProcessingPipeline 接口。
// ---------------------------------------------------------------------------

class MockGPUPostProcessingPipeline implements GPUPostProcessingPipeline {
  prepareCalls = 0;
  executeCalls = 0;
  disposeCalls = 0;
  private disposed = false;

  prepare(_inputColorTexture: TextureHandle, _options: PostProcessingOptions): void {
    if (this.disposed) throw new Error('disposed');
    this.prepareCalls += 1;
  }

  execute(_renderer: Renderer): void {
    if (this.disposed) throw new Error('disposed');
    this.executeCalls += 1;
  }

  dispose(): void {
    this.disposed = true;
    this.disposeCalls += 1;
  }
}

// ---------------------------------------------------------------------------
// 编译时类型断言：实现类必须可赋值给接口。
// ---------------------------------------------------------------------------

const _mockShadow: ShadowMapPass = new MockShadowMapPass();
const _mockGpuPp: GPUPostProcessingPipeline = new MockGPUPostProcessingPipeline();

const _webgpuShadow: ShadowMapPass = new WebGpuShadowMapPass();
const _webgl2Shadow: ShadowMapPass = new WebGl2ShadowMapPass();

const _webgpuPp: GPUPostProcessingPipeline = new WebGpuPostProcessingPipeline();
const _webgl2Pp: GPUPostProcessingPipeline = new WebGl2PostProcessingPipeline();

const _cpuPp: PostProcessingPipeline = new PostProcessingPipelineImpl();

void _mockShadow;
void _mockGpuPp;
void _webgpuShadow;
void _webgl2Shadow;
void _webgpuPp;
void _webgl2Pp;
void _cpuPp;

// ---------------------------------------------------------------------------

describe('PostProcessingPipeline + ShadowMapPass 接口契约', () => {
  it('PostProcessingPipeline 接口契约（CPU 参考实现）', () => {
    const pipeline: PostProcessingPipeline = createDefaultPipeline();

    expect(typeof pipeline.addStage).toBe('function');
    expect(typeof pipeline.removeStage).toBe('function');
    expect(typeof pipeline.getStages).toBe('function');
    expect(typeof pipeline.render).toBe('function');
    expect(typeof pipeline.dispose).toBe('function');

    // 初始 stages 数组
    const initialStages: PostProcessingStage[] = pipeline.getStages();
    expect(Array.isArray(initialStages)).toBe(true);

    // 添加一个 mock stage
    const stage: PostProcessingStage = {
      name: 'mock-stage',
      render(
        _input: PostProcessingTexture,
        _output: PostProcessingTexture,
        _renderer: PostProcessingRenderer | null,
      ): void {
        /* noop */
      },
    };
    pipeline.addStage(stage);
    expect(pipeline.getStages().length).toBe(initialStages.length + 1);

    // 移除 stage
    pipeline.removeStage('mock-stage');
    expect(pipeline.getStages().length).toBe(initialStages.length);

    // render 接收 (input, output, renderer)
    const input = new CPUTextureProxy('in', 4, 4);
    const output = new CPUTextureProxy('out', 4, 4);
    expect(() => pipeline.render(input, output, null)).not.toThrow();

    // dispose 不抛错
    expect(() => pipeline.dispose()).not.toThrow();
  });

  it('ShadowMapPass 接口契约（Mock 实现 + WebGPU/WebGL2 实现类存在）', () => {
    // Mock 实现
    const mockPass = new MockShadowMapPass();
    expect(typeof mockPass.prepare).toBe('function');
    expect(typeof mockPass.execute).toBe('function');
    expect(typeof mockPass.getShadowMapTexture).toBe('function');
    expect(typeof mockPass.dispose).toBe('function');

    // 签名参数个数
    expect(mockPass.prepare.length).toBe(3); // (lightDirection, shadowCastBounds, options)
    expect(mockPass.execute.length).toBe(2); // (renderer, sceneDrawFn)

    // 调用 prepare 前 getShadowMapTexture 抛错
    expect(() => mockPass.getShadowMapTexture()).toThrow(/not prepared/);

    // prepare → execute → getShadowMapTexture 生命周期
    const lightDir: Vec3d = { x: 0, y: -1, z: 0 };
    const bounds: BoundingBox = {
      min: { x: -10, y: -10, z: -10 },
      max: { x: 10, y: 10, z: 10 },
    };
    const options: ShadowMapOptions = { ...DEFAULT_SHADOW_MAP_OPTIONS };

    mockPass.prepare(lightDir, bounds, options);
    expect(mockPass.prepareCalls).toBe(1);

    const tex = mockPass.getShadowMapTexture();
    expect(tex).toBeDefined();
    expect(typeof tex.id).toBe('string');

    // execute 需要传入 mock renderer 与 sceneDrawFn
    const noopRenderer = {
      beginPass: () => {},
      endPass: () => {},
    } as unknown as Renderer;
    mockPass.execute(noopRenderer, () => {
      /* scene draw */
    });
    expect(mockPass.executeCalls).toBe(1);

    // dispose
    mockPass.dispose();
    expect(mockPass.disposeCalls).toBe(1);

    // WebGPU / WebGL2 实现类存在且实现 ShadowMapPass
    const webgpuPass: ShadowMapPass = new WebGpuShadowMapPass();
    const webgl2Pass: ShadowMapPass = new WebGl2ShadowMapPass();
    expect(typeof webgpuPass.prepare).toBe('function');
    expect(typeof webgpuPass.execute).toBe('function');
    expect(typeof webgpuPass.getShadowMapTexture).toBe('function');
    expect(typeof webgpuPass.dispose).toBe('function');
    expect(typeof webgl2Pass.prepare).toBe('function');
    expect(typeof webgl2Pass.execute).toBe('function');
    expect(typeof webgl2Pass.getShadowMapTexture).toBe('function');
    expect(typeof webgl2Pass.dispose).toBe('function');

    // 工厂函数也返回 ShadowMapPass
    expect(createWebGpuShadowMapPass()).toBeInstanceOf(WebGpuShadowMapPass);
    expect(createWebGl2ShadowMapPass()).toBeInstanceOf(WebGl2ShadowMapPass);
  });

  it('GPUPostProcessingPipeline 接口契约（WebGPU/WebGL2 实现类存在）', () => {
    // WebGPU 实现
    const webgpuPipeline: GPUPostProcessingPipeline = new WebGpuPostProcessingPipeline();
    expect(typeof webgpuPipeline.prepare).toBe('function');
    expect(typeof webgpuPipeline.execute).toBe('function');
    expect(typeof webgpuPipeline.dispose).toBe('function');

    // WebGL2 实现
    const webgl2Pipeline: GPUPostProcessingPipeline = new WebGl2PostProcessingPipeline();
    expect(typeof webgl2Pipeline.prepare).toBe('function');
    expect(typeof webgl2Pipeline.execute).toBe('function');
    expect(typeof webgl2Pipeline.dispose).toBe('function');

    // 工厂函数
    expect(createWebGpuPostProcessingPipeline()).toBeInstanceOf(WebGpuPostProcessingPipeline);
    expect(createWebGl2PostProcessingPipeline()).toBeInstanceOf(WebGl2PostProcessingPipeline);

    // DEFAULT_GPU_POST_PROCESSING 存在
    expect(DEFAULT_GPU_POST_PROCESSING).toBeDefined();

    // prepare → execute → dispose 生命周期（不依赖真实 GPU）
    const mockPipeline = new MockGPUPostProcessingPipeline();
    const inputTex: TextureHandle = { id: 'input', format: 'rgba16float' };
    const options: PostProcessingOptions = { ...DEFAULT_GPU_POST_PROCESSING };

    mockPipeline.prepare(inputTex, options);
    expect(mockPipeline.prepareCalls).toBe(1);

    // execute 需要 renderer；用 noop 对象
    const noopRenderer = {} as Renderer;
    mockPipeline.execute(noopRenderer);
    expect(mockPipeline.executeCalls).toBe(1);

    mockPipeline.dispose();
    expect(mockPipeline.disposeCalls).toBe(1);

    // 重复 dispose 安全
    expect(() => mockPipeline.dispose()).not.toThrow();
  });
});
