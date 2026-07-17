/**
 * WebGl2ShadowMapPass 单元测试（任务 10 / E-07）。
 *
 * 验证：
 * - 构造与 dispose 不依赖真实 GL（在 Node CI 中可运行）
 * - prepare / execute / getShadowMapTexture / dispose 接口契约
 * - prepare 后光源视图矩阵与正交投影矩阵正确计算
 * - execute 创建深度纹理并调用 sceneDrawFn
 * - dispose 后调用任意方法抛错
 * - SHADOW_PCF_GLSL 常量包含 PCF 函数定义
 */
import { describe, it, expect } from 'vitest';
import {
  WebGl2ShadowMapPass,
  createWebGl2ShadowMapPass,
  SHADOW_PCF_GLSL,
} from '../shadow-map.js';
import {
  DEFAULT_SHADOW_MAP_OPTIONS,
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
  type ShadowMapOptions,
  type BoundingBox,
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
    backend: 'webgl2',
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
      const depth = desc.depthStencilAttachment ? 'depth' : 'nodepth';
      calls.push(`beginPass:${desc.colorAttachments.length}color:${depth}`);
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

describe('WebGl2ShadowMapPass 构造与生命周期', () => {
  it('构造后未初始化（isInitialized 返回 false）', () => {
    const pass = new WebGl2ShadowMapPass();
    expect(pass.isInitialized()).toBe(false);
    expect(pass.isDisposed()).toBe(false);
  });

  it('工厂函数创建实例', () => {
    const pass = createWebGl2ShadowMapPass();
    expect(pass).toBeInstanceOf(WebGl2ShadowMapPass);
  });

  it('getOptions 默认值等于 DEFAULT_SHADOW_MAP_OPTIONS', () => {
    const pass = new WebGl2ShadowMapPass();
    expect(pass.getOptions()).toEqual(DEFAULT_SHADOW_MAP_OPTIONS);
  });

  it('dispose 后 isDisposed 返回 true', () => {
    const pass = new WebGl2ShadowMapPass();
    pass.dispose();
    expect(pass.isDisposed()).toBe(true);
  });

  it('dispose 可重复调用（幂等）', () => {
    const pass = new WebGl2ShadowMapPass();
    pass.dispose();
    expect(() => pass.dispose()).not.toThrow();
  });
});

describe('WebGl2ShadowMapPass prepare 契约', () => {
  const sampleBounds: BoundingBox = {
    min: { x: -100, y: -100, z: -100 },
    max: { x: 100, y: 100, z: 100 },
  };
  const sampleDir = { x: 1, y: -1, z: 0.5 };

  it('prepare 保存 options 副本', () => {
    const pass = new WebGl2ShadowMapPass();
    const opts: ShadowMapOptions = {
      resolution: 4096,
      pcfKernelSize: 5,
      bias: 0.002,
      normalBias: 0.05,
    };
    pass.prepare(sampleDir, sampleBounds, opts);
    expect(pass.getOptions().resolution).toBe(4096);
    expect(pass.getOptions().pcfKernelSize).toBe(5);
  });

  it('prepare 深拷贝 options（修改原对象不影响已保存值）', () => {
    const pass = new WebGl2ShadowMapPass();
    const opts: ShadowMapOptions = { ...DEFAULT_SHADOW_MAP_OPTIONS };
    pass.prepare(sampleDir, sampleBounds, opts);
    opts.resolution = 8192;
    expect(pass.getOptions().resolution).toBe(2048);
  });

  it('prepare 计算光源视图矩阵（4×4，长度 16）', () => {
    const pass = new WebGl2ShadowMapPass();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    const view = pass.getLightViewMatrix();
    expect(view).toHaveLength(16);
    expect(view[12]).toBe(0);
    expect(view[13]).toBe(0);
    expect(view[14]).toBe(0);
    expect(view[15]).toBe(1);
  });

  it('prepare 计算光源投影矩阵（4×4，长度 16，正交投影）', () => {
    const pass = new WebGl2ShadowMapPass();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    const proj = pass.getLightProjMatrix();
    expect(proj).toHaveLength(16);
    expect(proj[0]).toBeGreaterThan(0);
    expect(proj[5]).toBeGreaterThan(0);
    expect(proj[10]).toBeLessThan(0);
    expect(proj[12]).toBe(0);
    expect(proj[13]).toBe(0);
    expect(proj[14]).toBe(0);
    expect(proj[15]).toBe(1);
  });

  it('getLightViewMatrix 返回副本（修改返回值不影响内部状态）', () => {
    const pass = new WebGl2ShadowMapPass();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    const v1 = pass.getLightViewMatrix();
    v1[0] = 999;
    const v2 = pass.getLightViewMatrix();
    expect(v2[0]).not.toBe(999);
  });

  it('getLightProjMatrix 返回副本（修改返回值不影响内部状态）', () => {
    const pass = new WebGl2ShadowMapPass();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    const p1 = pass.getLightProjMatrix();
    p1[0] = 999;
    const p2 = pass.getLightProjMatrix();
    expect(p2[0]).not.toBe(999);
  });

  it('dispose 后调用 prepare 抛错', () => {
    const pass = new WebGl2ShadowMapPass();
    pass.dispose();
    expect(() => pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS)).toThrow();
  });
});

describe('WebGl2ShadowMapPass execute 契约', () => {
  const sampleBounds: BoundingBox = {
    min: { x: -50, y: -50, z: -50 },
    max: { x: 50, y: 50, z: 50 },
  };
  const sampleDir = { x: 0, y: -1, z: 0 };

  it('execute 创建深度纹理（depth32float）', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    let drawCalled = false;
    pass.execute(renderer, () => {
      drawCalled = true;
    });
    const depthTextures = renderer.textures.filter((t) => t.format === 'depth32float');
    expect(depthTextures.length).toBe(1);
    expect(drawCalled).toBe(true);
  });

  it('execute 按 resolution 创建深度纹理', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, {
      ...DEFAULT_SHADOW_MAP_OPTIONS,
      resolution: 1024,
    });
    pass.execute(renderer, () => {});
    const depthCalls = renderer.calls.filter(
      (c) => c === 'createTexture:depth32float:1024x1024',
    );
    expect(depthCalls.length).toBe(1);
  });

  it('execute 调用 beginPass（带深度附件）与 endPass', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    pass.execute(renderer, () => {});
    expect(renderer.calls).toContain('beginPass:0color:depth');
    expect(renderer.calls).toContain('endPass');
  });

  it('execute 调用 sceneDrawFn 在 beginPass 与 endPass 之间', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    const sequence: string[] = [];
    pass.execute(renderer, () => {
      sequence.push('sceneDrawFn');
    });
    const beginIdx = renderer.calls.indexOf('beginPass:0color:depth');
    const endIdx = renderer.calls.indexOf('endPass');
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(beginIdx);
    expect(sequence).toEqual(['sceneDrawFn']);
  });

  it('execute 后 isInitialized 返回 true', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    pass.execute(renderer, () => {});
    expect(pass.isInitialized()).toBe(true);
  });

  it('execute 后 getShadowMapTexture 返回 depth32float 句柄', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    pass.execute(renderer, () => {});
    const tex = pass.getShadowMapTexture();
    expect(tex.format).toBe('depth32float');
    expect(typeof tex.id).toBe('string');
  });

  it('execute 多次调用复用同一深度纹理（resolution 不变）', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    pass.execute(renderer, () => {});
    const tex1 = pass.getShadowMapTexture();
    pass.execute(renderer, () => {});
    const tex2 = pass.getShadowMapTexture();
    expect(tex1.id).toBe(tex2.id);
  });

  it('resolution 变化时重建深度纹理', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, { ...DEFAULT_SHADOW_MAP_OPTIONS, resolution: 1024 });
    pass.execute(renderer, () => {});
    const tex1 = pass.getShadowMapTexture();
    pass.prepare(sampleDir, sampleBounds, { ...DEFAULT_SHADOW_MAP_OPTIONS, resolution: 2048 });
    pass.execute(renderer, () => {});
    const tex2 = pass.getShadowMapTexture();
    expect(tex1.id).not.toBe(tex2.id);
  });

  it('dispose 后调用 execute 抛错', () => {
    const pass = new WebGl2ShadowMapPass();
    const renderer = createMockRenderer();
    pass.prepare(sampleDir, sampleBounds, DEFAULT_SHADOW_MAP_OPTIONS);
    pass.dispose();
    expect(() => pass.execute(renderer, () => {})).toThrow();
  });
});

describe('WebGl2ShadowMapPass getShadowMapTexture 契约', () => {
  it('prepare 前调用 getShadowMapTexture 抛错', () => {
    const pass = new WebGl2ShadowMapPass();
    expect(() => pass.getShadowMapTexture()).toThrow();
  });

  it('prepare 后但 execute 前调用 getShadowMapTexture 抛错', () => {
    const pass = new WebGl2ShadowMapPass();
    pass.prepare(
      { x: 0, y: -1, z: 0 },
      { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      DEFAULT_SHADOW_MAP_OPTIONS,
    );
    expect(() => pass.getShadowMapTexture()).toThrow();
  });
});

describe('SHADOW_PCF_GLSL 着色器常量', () => {
  it('应是非空字符串', () => {
    expect(typeof SHADOW_PCF_GLSL).toBe('string');
    expect(SHADOW_PCF_GLSL.length).toBeGreaterThan(0);
  });

  it('应以 #version 300 es 开头（GLSL ES 3.0）', () => {
    expect(SHADOW_PCF_GLSL.startsWith('#version 300 es')).toBe(true);
  });

  it('应包含 sampleShadowPCF 函数定义', () => {
    expect(SHADOW_PCF_GLSL).toContain('sampleShadowPCF');
    expect(SHADOW_PCF_GLSL).toContain('float sampleShadowPCF');
  });

  it('应包含 PCF 核循环（dy / dx 循环）', () => {
    expect(SHADOW_PCF_GLSL).toContain('for');
    expect(SHADOW_PCF_GLSL).toContain('dy');
    expect(SHADOW_PCF_GLSL).toContain('dx');
  });

  it('应支持 kernelSize 参数', () => {
    expect(SHADOW_PCF_GLSL).toContain('kernelSize');
  });

  it('应支持 bias 参数', () => {
    expect(SHADOW_PCF_GLSL).toContain('bias');
  });

  it('应使用 sampler2DShadow 类型（WebGL2 shadow sampler）', () => {
    expect(SHADOW_PCF_GLSL).toContain('sampler2DShadow');
  });
});
