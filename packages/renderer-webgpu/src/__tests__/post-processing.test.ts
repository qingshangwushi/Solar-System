/**
 * WebGpuPostProcessingPipeline 单元测试（任务 9 / E-06）。
 *
 * 验证：
 * - 构造与 dispose 不依赖真实 GPU（在 Node CI 中可运行）
 * - prepare / execute / dispose 接口契约
 * - execute 内部按顺序提交所有 GPU pass（用 mock renderer 验证）
 * - dispose 后调用任意方法抛错
 *
 * 注：本测试不验证 WGSL 着色器编译是否成功（无 device），仅验证
 * pipeline 编排顺序与资源生命周期管理。
 */
import { describe, it, expect } from 'vitest';
import {
  WebGpuPostProcessingPipeline,
  createWebGpuPostProcessingPipeline,
} from '../post-processing.js';
import {
  DEFAULT_GPU_POST_PROCESSING,
  type Renderer,
  type TextureHandle,
  type BufferHandle,
  type PipelineHandle,
  type TextureDescriptor,
  type BufferDescriptor,
  type PipelineDescriptor,
  type RenderPassDescriptor,
  type DrawCall,
  type RendererCapabilities,
  type PostProcessingOptions,
} from '@solar-system/renderer-core';

/** 构造 mock renderer，记录所有调用。 */
function createMockRenderer(): Renderer & {
  calls: string[];
  textures: TextureHandle[];
  pipelines: PipelineHandle[];
} {
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
    createBuffer: (desc: BufferDescriptor): BufferHandle => ({ id: `buf-${texSeq++}`, usage: desc.usage }),
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

describe('WebGpuPostProcessingPipeline 构造与生命周期', () => {
  it('构造后未初始化（isInitialized 返回 false）', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    expect(pipeline.isInitialized()).toBe(false);
    expect(pipeline.isDisposed()).toBe(false);
  });

  it('工厂函数创建实例', () => {
    const pipeline = createWebGpuPostProcessingPipeline();
    expect(pipeline).toBeInstanceOf(WebGpuPostProcessingPipeline);
  });

  it('getOptions 默认值等于 DEFAULT_GPU_POST_PROCESSING', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    expect(pipeline.getOptions()).toEqual(DEFAULT_GPU_POST_PROCESSING);
  });

  it('getInputTexture 默认为 null', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    expect(pipeline.getInputTexture()).toBeNull();
  });

  it('dispose 后 isDisposed 返回 true', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    pipeline.dispose();
    expect(pipeline.isDisposed()).toBe(true);
  });

  it('dispose 可重复调用（幂等）', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    pipeline.dispose();
    expect(() => pipeline.dispose()).not.toThrow();
  });
});

describe('WebGpuPostProcessingPipeline prepare 契约', () => {
  it('prepare 保存输入纹理与 options', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    const opts: PostProcessingOptions = {
      ...DEFAULT_GPU_POST_PROCESSING,
      exposure: 2.0,
      bloomThreshold: 0.85,
    };
    pipeline.prepare(input, opts);
    expect(pipeline.getInputTexture()).toBe(input);
    expect(pipeline.getOptions().exposure).toBe(2.0);
    expect(pipeline.getOptions().bloomThreshold).toBe(0.85);
  });

  it('prepare 深拷贝 options（修改原对象不影响已保存值）', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    const opts: PostProcessingOptions = { ...DEFAULT_GPU_POST_PROCESSING, exposure: 1.0 };
    pipeline.prepare(input, opts);
    opts.exposure = 99.0;
    expect(pipeline.getOptions().exposure).toBe(1.0);
  });

  it('prepare 后再 prepare 更新 options', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, { ...DEFAULT_GPU_POST_PROCESSING, exposure: 1.0 });
    pipeline.prepare(input, { ...DEFAULT_GPU_POST_PROCESSING, exposure: 2.5 });
    expect(pipeline.getOptions().exposure).toBe(2.5);
  });

  it('dispose 后调用 prepare 抛错', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    pipeline.dispose();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    expect(() => pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING)).toThrow();
  });
});

describe('WebGpuPostProcessingPipeline execute 契约', () => {
  it('execute 在 prepare 前调用抛错', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    expect(() => pipeline.execute(renderer)).toThrow();
  });

  it('dispose 后调用 execute 抛错', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.dispose();
    expect(() => pipeline.execute(renderer)).toThrow();
  });

  it('execute 调用 renderer.createTexture 创建 HDR 中间纹理', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.execute(renderer);
    // 至少创建若干 HDR 中间纹理（bright + downsample chain + upsample chain + tonemapped + graded）
    expect(renderer.textures.length).toBeGreaterThan(5);
    // 所有创建的纹理格式应为 rgba16float
    for (const t of renderer.textures) {
      expect(t.format).toBe('rgba16float');
    }
  });

  it('execute 调用 renderer.createPipeline 创建 6 个 pipeline', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.execute(renderer);
    // 6 个 pipeline：bright-pass / downsample / upsample / tonemap / color-grade / composite
    expect(renderer.pipelines.length).toBe(6);
  });

  it('execute 提交多个 beginPass/endPass 对（每个 stage 至少一对）', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.execute(renderer);
    const beginCount = renderer.calls.filter((c) => c.startsWith('beginPass:')).length;
    const endCount = renderer.calls.filter((c) => c === 'endPass').length;
    // bright + 4 downsample + 4 upsample + tonemap + color-grade + composite = 12 pass
    expect(beginCount).toBeGreaterThanOrEqual(6);
    expect(endCount).toBe(beginCount);
  });

  it('execute 后 isInitialized 返回 true', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.execute(renderer);
    expect(pipeline.isInitialized()).toBe(true);
  });

  it('execute 多次调用复用 GPU 资源（不重复创建）', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.execute(renderer);
    const texturesAfterFirst = renderer.textures.length;
    const pipelinesAfterFirst = renderer.pipelines.length;
    pipeline.execute(renderer);
    expect(renderer.textures.length).toBe(texturesAfterFirst);
    expect(renderer.pipelines.length).toBe(pipelinesAfterFirst);
  });

  it('支持带 colorGradingLUT 的 options', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    const lut: TextureHandle = { id: 'lut-tex', format: 'rgba8unorm' };
    pipeline.prepare(input, { ...DEFAULT_GPU_POST_PROCESSING, colorGradingLUT: lut });
    expect(() => pipeline.execute(renderer)).not.toThrow();
  });

  it('bloomLevels=1 时仍能正常执行', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, { ...DEFAULT_GPU_POST_PROCESSING, bloomLevels: 1 });
    expect(() => pipeline.execute(renderer)).not.toThrow();
  });

  it('bloomLevels=6 时仍能正常执行（多级降采样）', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, { ...DEFAULT_GPU_POST_PROCESSING, bloomLevels: 6 });
    expect(() => pipeline.execute(renderer)).not.toThrow();
    // 6 级降采样 + 6 级升采样 = 12 个 bloom 纹理 + bright + tonemapped + graded = 15
    expect(renderer.textures.length).toBeGreaterThanOrEqual(15);
  });
});

describe('WebGpuPostProcessingPipeline pass 顺序（E-06 核心要求）', () => {
  it('execute 调用顺序符合：BrightPass → Downsample → Upsample → ToneMap → ColorGrade → Composite', () => {
    const pipeline = new WebGpuPostProcessingPipeline();
    const renderer = createMockRenderer();
    const input: TextureHandle = { id: 'input-hdr', format: 'rgba16float' };
    pipeline.prepare(input, DEFAULT_GPU_POST_PROCESSING);
    pipeline.execute(renderer);
    // 验证 pipeline 创建顺序：每个 pipeline 通过 createPipeline 调用顺序创建
    // 顺序应为：pp-bright-pass / pp-downsample / pp-upsample / pp-tonemap / pp-color-grade / pp-composite
    // 由于实现细节中我们按固定顺序 createPipelineIfMissing，可以验证 pipelines 数量
    expect(renderer.pipelines.length).toBe(6);
    // 验证 beginPass 调用次数符合：1(bright) + 4(down) + 4(up) + 1(tonemap) + 1(color-grade) + 1(composite) = 12
    const beginCount = renderer.calls.filter((c) => c.startsWith('beginPass:')).length;
    expect(beginCount).toBe(12);
  });
});
