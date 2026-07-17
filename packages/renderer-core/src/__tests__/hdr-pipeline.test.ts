/**
 * GPU 后处理管线接口契约测试（任务 9 / E-06）。
 *
 * 验证：
 * - PostProcessingOptions 默认值正确
 * - GPUPostProcessingPipeline 接口契约（prepare/execute/dispose）
 * - options 通过 prepare 正确传播
 * - dispose 后调用方法抛错
 * - mock renderer 接受 prepare/execute 调用
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GPU_POST_PROCESSING,
} from '../hdr.js';
import type {
  PostProcessingOptions,
  GPUPostProcessingPipeline,
  Renderer,
  TextureHandle,
  BufferHandle,
  PipelineHandle,
  TextureDescriptor,
  BufferDescriptor,
  PipelineDescriptor,
  RenderPassDescriptor,
  DrawCall,
  RendererCapabilities,
} from '../index.js';

/** 构造 mock renderer（仅记录调用，不执行真实 GPU 操作）。 */
function createMockRenderer(): Renderer & { calls: string[]; textures: TextureHandle[]; pipelines: PipelineHandle[] } {
  const calls: string[] = [];
  const textures: TextureHandle[] = [];
  const pipelines: PipelineHandle[] = [];
  let texSeq = 0;
  let pipeSeq = 0;
  const caps: RendererCapabilities = {
    maxTextureSize: 8192,
    maxTextureArrayLayers: 256,
    maxBindGroups: 8,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 16777216,
    supportsFloatTextures: true,
    supportsFloat16Textures: true,
    supportsCompressedTextures: false,
  };
  const renderer: Renderer = {
    backend: 'webgpu',
    capabilities: caps,
    init: async () => {},
    destroy: () => {},
    resize: () => {},
    createBuffer: (_desc: BufferDescriptor): BufferHandle => ({ id: `buf-${texSeq++}`, usage: _desc.usage }),
    updateBuffer: () => {},
    destroyBuffer: () => {},
    createTexture: (desc: TextureDescriptor): TextureHandle => {
      const h: TextureHandle = { id: `tex-${texSeq++}`, format: desc.format };
      textures.push(h);
      calls.push(`createTexture:${desc.format}:${desc.width}x${desc.height}`);
      return h;
    },
    uploadTextureData: () => {},
    destroyTexture: (h: TextureHandle) => {
      calls.push(`destroyTexture:${h.id}`);
    },
    createPipeline: (_desc: PipelineDescriptor): PipelineHandle => {
      const h: PipelineHandle = { id: `pipe-${pipeSeq++}` };
      pipelines.push(h);
      calls.push('createPipeline');
      return h;
    },
    destroyPipeline: () => {
      calls.push('destroyPipeline');
    },
    beginPass: (desc: RenderPassDescriptor): void => {
      calls.push(`beginPass:${desc.colorAttachments.length}color`);
    },
    draw: (call: DrawCall): void => {
      calls.push(`draw:${call.pipeline.id}:${call.vertexCount}`);
    },
    endPass: (): void => {
      calls.push('endPass');
    },
    submit: (): void => {
      calls.push('submit');
    },
    readPixels: async (): Promise<Uint8Array> => new Uint8Array(0),
  };
  return Object.assign(renderer, { calls, textures, pipelines });
}

/** 一个最小化的 GPUPostProcessingPipeline mock 实现，用于契约测试。 */
class MockPostProcessingPipeline implements GPUPostProcessingPipeline {
  preparedInput: TextureHandle | null = null;
  preparedOptions: PostProcessingOptions | null = null;
  executeCount = 0;
  disposed = false;

  prepare(inputColorTexture: TextureHandle, options: PostProcessingOptions): void {
    if (this.disposed) throw new Error('disposed');
    this.preparedInput = inputColorTexture;
    this.preparedOptions = { ...options };
  }
  execute(_renderer: Renderer): void {
    if (this.disposed) throw new Error('disposed');
    if (!this.preparedInput) throw new Error('not prepared');
    this.executeCount++;
  }
  dispose(): void {
    this.disposed = true;
  }
}

describe('PostProcessingOptions 默认值', () => {
  it('默认 exposure 应为 1.0', () => {
    expect(DEFAULT_GPU_POST_PROCESSING.exposure).toBe(1.0);
  });
  it('默认 bloomThreshold 应为 1.0', () => {
    expect(DEFAULT_GPU_POST_PROCESSING.bloomThreshold).toBe(1.0);
  });
  it('默认 bloomStrength 应为 0.5', () => {
    expect(DEFAULT_GPU_POST_PROCESSING.bloomStrength).toBe(0.5);
  });
  it('默认 bloomLevels 应为 4', () => {
    expect(DEFAULT_GPU_POST_PROCESSING.bloomLevels).toBe(4);
  });
  it('默认 toneMappingType 应为 aces', () => {
    expect(DEFAULT_GPU_POST_PROCESSING.toneMappingType).toBe('aces');
  });
  it('默认 vignetteIntensity 应为 0', () => {
    expect(DEFAULT_GPU_POST_PROCESSING.vignetteIntensity).toBe(0);
  });
  it('默认 dithering 应为 true', () => {
    expect(DEFAULT_GPU_POST_PROCESSING.dithering).toBe(true);
  });
  it('默认 colorGradingLUT 应为 undefined', () => {
    expect(DEFAULT_GPU_POST_PROCESSING.colorGradingLUT).toBeUndefined();
  });
});

describe('GPUPostProcessingPipeline 接口契约', () => {
  it('MockPostProcessingPipeline 实现 GPUPostProcessingPipeline 接口', () => {
    const pipeline: GPUPostProcessingPipeline = new MockPostProcessingPipeline();
    expect(typeof pipeline.prepare).toBe('function');
    expect(typeof pipeline.execute).toBe('function');
    expect(typeof pipeline.dispose).toBe('function');
  });

  it('prepare 应保存输入纹理与 options', () => {
    const pipeline = new MockPostProcessingPipeline();
    const input: TextureHandle = { id: 'input-tex', format: 'rgba16float' };
    const options: PostProcessingOptions = {
      ...DEFAULT_GPU_POST_PROCESSING,
      exposure: 2.5,
      bloomThreshold: 0.8,
    };
    pipeline.prepare(input, options);
    expect(pipeline.preparedInput).toBe(input);
    expect(pipeline.preparedOptions?.exposure).toBe(2.5);
    expect(pipeline.preparedOptions?.bloomThreshold).toBe(0.8);
  });

  it('prepare 应深拷贝 options（修改原对象不影响已保存值）', () => {
    const pipeline = new MockPostProcessingPipeline();
    const input: TextureHandle = { id: 'input-tex', format: 'rgba16float' };
    const options: PostProcessingOptions = {
      ...DEFAULT_GPU_POST_PROCESSING,
      exposure: 1.0,
    };
    pipeline.prepare(input, options);
    options.exposure = 99.0;
    expect(pipeline.preparedOptions?.exposure).toBe(1.0);
  });

  it('execute 在 prepare 前调用应抛错', () => {
    const pipeline = new MockPostProcessingPipeline();
    const renderer = createMockRenderer();
    expect(() => pipeline.execute(renderer)).toThrow();
  });

  it('execute 在 prepare 后调用应成功并计数', () => {
    const pipeline = new MockPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-tex', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.execute(renderer);
    expect(pipeline.executeCount).toBe(1);
  });

  it('dispose 后调用 prepare 应抛错', () => {
    const pipeline = new MockPostProcessingPipeline();
    pipeline.dispose();
    expect(pipeline.disposed).toBe(true);
    const input: TextureHandle = { id: 'input-tex', format: 'rgba16float' };
    expect(() => pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING)).toThrow();
  });

  it('dispose 后调用 execute 应抛错', () => {
    const pipeline = new MockPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-tex', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.dispose();
    expect(() => pipeline.execute(renderer)).toThrow();
  });

  it('多次 prepare 应更新 options', () => {
    const pipeline = new MockPostProcessingPipeline();
    const input: TextureHandle = { id: 'input-tex', format: 'rgba16float' };
    pipeline.prepare(input, { ...DEFAULT_GPU_POST_PROCESSING, exposure: 1.0 });
    pipeline.prepare(input, { ...DEFAULT_GPU_POST_PROCESSING, exposure: 2.0 });
    expect(pipeline.preparedOptions?.exposure).toBe(2.0);
  });

  it('支持带 colorGradingLUT 的 options', () => {
    const pipeline = new MockPostProcessingPipeline();
    const input: TextureHandle = { id: 'input-tex', format: 'rgba16float' };
    const lut: TextureHandle = { id: 'lut-tex', format: 'rgba8unorm' };
    pipeline.prepare(input, { ...DEFAULT_GPU_POST_PROCESSING, colorGradingLUT: lut });
    expect(pipeline.preparedOptions?.colorGradingLUT).toBe(lut);
  });
});

describe('Mock Renderer 契约', () => {
  it('createTexture 返回带 format 的句柄', () => {
    const renderer = createMockRenderer();
    const handle = renderer.createTexture({
      width: 1024,
      height: 1024,
      format: 'rgba16float',
      usage: 'render_target',
    });
    expect(handle.id).toMatch(/^tex-\d+$/);
    expect(handle.format).toBe('rgba16float');
  });

  it('createPipeline 返回带 id 的句柄', () => {
    const renderer = createMockRenderer();
    const handle = renderer.createPipeline({
      vertexShader: { stage: 'vertex', source: '' },
      fragmentShader: { stage: 'fragment', source: '' },
      vertexAttributes: [],
      topology: 'triangles',
    });
    expect(handle.id).toMatch(/^pipe-\d+$/);
  });

  it('beginPass / draw / endPass 记录调用', () => {
    const renderer = createMockRenderer();
    const tex = renderer.createTexture({
      width: 1, height: 1, format: 'rgba8unorm', usage: 'render_target',
    });
    const pipe = renderer.createPipeline({
      vertexShader: { stage: 'vertex', source: '' },
      fragmentShader: { stage: 'fragment', source: '' },
      vertexAttributes: [],
      topology: 'triangles',
    });
    const vb = renderer.createBuffer({ size: 64, usage: 'static' });

    renderer.beginPass({
      colorAttachments: [{ texture: tex, loadOp: 'clear', storeOp: 'store' }],
    });
    renderer.draw({ vertexBuffer: vb, pipeline: pipe, vertexCount: 3 });
    renderer.endPass();

    expect(renderer.calls).toContain('beginPass:1color');
    expect(renderer.calls.some((c) => c.startsWith('draw:'))).toBe(true);
    expect(renderer.calls).toContain('endPass');
  });
});
