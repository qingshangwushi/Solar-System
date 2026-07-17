/**
 * Renderer 接口契约测试（任务 18 / 修复 R-07）。
 *
 * 验证 `@solar-system/renderer-core` 中 `Renderer` 接口的：
 * - MockRenderer 实现通过 TypeScript 类型检查（编译时）
 * - 所有方法存在且签名匹配（运行时 smoke）
 * - beginPass / draw / endPass / submit 生命周期可正确调用
 */
import { describe, it, expect } from 'vitest';
import type {
  Renderer,
  BackendType,
  RendererCapabilities,
  BufferDescriptor,
  BufferHandle,
  TextureDescriptor,
  TextureHandle,
  PipelineDescriptor,
  PipelineHandle,
  RenderPassDescriptor,
  DrawCall,
} from '@solar-system/renderer-core';

// ---------------------------------------------------------------------------
// MockRenderer：完整实现 Renderer 接口。
// 所有方法记录调用次数 / 入参，便于运行时 smoke。
// ---------------------------------------------------------------------------

class MockRenderer implements Renderer {
  readonly backend: BackendType = 'webgpu';
  readonly capabilities: RendererCapabilities = {
    maxTextureSize: 4096,
    maxTextureArrayLayers: 256,
    maxBindGroups: 4,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 16777216,
    supportsFloatTextures: true,
    supportsFloat16Textures: true,
    supportsCompressedTextures: false,
  };

  beginPassCalls = 0;
  drawCalls = 0;
  endPassCalls = 0;
  submitCalls = 0;
  destroyCalls = 0;
  private destroyed = false;

  async init(_canvas: HTMLCanvasElement): Promise<void> {
    /* noop */
  }

  destroy(): void {
    this.destroyed = true;
    this.destroyCalls += 1;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  resize(_width: number, _height: number): void {
    /* noop */
  }

  createBuffer(desc: BufferDescriptor): BufferHandle {
    return { id: `mock-buffer-${desc.size}`, usage: desc.usage };
  }

  updateBuffer(_handle: BufferHandle, _data: ArrayBuffer, _offset?: number): void {
    /* noop */
  }

  destroyBuffer(_handle: BufferHandle): void {
    /* noop */
  }

  createTexture(desc: TextureDescriptor): TextureHandle {
    return { id: `mock-texture-${desc.width}x${desc.height}`, format: desc.format };
  }

  uploadTextureData(_handle: TextureHandle, _data: ArrayBufferView): void {
    /* noop */
  }

  destroyTexture(_handle: TextureHandle): void {
    /* noop */
  }

  createPipeline(_desc: PipelineDescriptor): PipelineHandle {
    return { id: 'mock-pipeline' };
  }

  destroyPipeline(_handle: PipelineHandle): void {
    /* noop */
  }

  beginPass(_desc: RenderPassDescriptor): void {
    if (this.destroyed) throw new Error('Renderer destroyed');
    this.beginPassCalls += 1;
  }

  draw(_call: DrawCall): void {
    if (this.beginPassCalls === 0) throw new Error('draw called before beginPass');
    this.drawCalls += 1;
  }

  endPass(): void {
    if (this.beginPassCalls === 0) throw new Error('endPass called before beginPass');
    this.endPassCalls += 1;
  }

  submit(): void {
    if (this.destroyed) throw new Error('Renderer destroyed');
    this.submitCalls += 1;
  }

  async readPixels(
    _texture: TextureHandle,
    _x: number,
    _y: number,
    width: number,
    height: number,
  ): Promise<Uint8Array> {
    return new Uint8Array(width * height * 4);
  }
}

// ---------------------------------------------------------------------------
// 编译时类型断言：MockRenderer 必须可赋值给 Renderer。
// 若 Renderer 接口签名变更导致 MockRenderer 缺失方法，tsc 会报错。
// ---------------------------------------------------------------------------
const _typeCheck: Renderer = new MockRenderer();
void _typeCheck;

// ---------------------------------------------------------------------------

describe('Renderer 接口契约', () => {
  it('MockRenderer 实现 Renderer 接口且所有方法存在', () => {
    const r: Renderer = new MockRenderer();

    // 接口要求的所有方法都应存在且为 function
    expect(typeof r.init).toBe('function');
    expect(typeof r.destroy).toBe('function');
    expect(typeof r.resize).toBe('function');
    expect(typeof r.createBuffer).toBe('function');
    expect(typeof r.updateBuffer).toBe('function');
    expect(typeof r.destroyBuffer).toBe('function');
    expect(typeof r.createTexture).toBe('function');
    expect(typeof r.uploadTextureData).toBe('function');
    expect(typeof r.destroyTexture).toBe('function');
    expect(typeof r.createPipeline).toBe('function');
    expect(typeof r.destroyPipeline).toBe('function');
    expect(typeof r.beginPass).toBe('function');
    expect(typeof r.draw).toBe('function');
    expect(typeof r.endPass).toBe('function');
    expect(typeof r.submit).toBe('function');
    expect(typeof r.readPixels).toBe('function');

    // readonly 属性
    expect(r.backend).toBe('webgpu');
    expect(r.capabilities).toBeDefined();
    expect(r.capabilities.maxTextureSize).toBeGreaterThan(0);
  });

  it('createBuffer / createTexture / createPipeline 返回带 id 的 handle', () => {
    const r = new MockRenderer();

    const buf = r.createBuffer({ size: 256, usage: 'static' });
    expect(buf.id).toBe('mock-buffer-256');
    expect(buf.usage).toBe('static');

    const tex = r.createTexture({
      width: 64,
      height: 64,
      format: 'rgba8unorm',
      usage: 'texture',
    });
    expect(tex.id).toContain('mock-texture-64x64');
    expect(tex.format).toBe('rgba8unorm');

    const pipe = r.createPipeline({
      vertexShader: { stage: 'vertex', source: '' },
      fragmentShader: { stage: 'fragment', source: '' },
      vertexAttributes: [],
      topology: 'triangles',
    });
    expect(pipe.id).toBe('mock-pipeline');
  });

  it('beginPass → draw → endPass → submit 生命周期可正确串联', async () => {
    const r = new MockRenderer();

    // 在 beginPass 之前 draw 应抛错
    expect(() =>
      r.draw({
        vertexBuffer: { id: 'vb', usage: 'static' },
        pipeline: { id: 'pipe' },
        vertexCount: 3,
      }),
    ).toThrow(/before beginPass/);

    r.beginPass({
      colorAttachments: [
        {
          texture: { id: 'tex', format: 'rgba8unorm' },
          clear: [0, 0, 0, 1],
        },
      ],
    });
    expect(r.beginPassCalls).toBe(1);

    r.draw({
      vertexBuffer: { id: 'vb', usage: 'static' },
      pipeline: { id: 'pipe' },
      vertexCount: 3,
    });
    expect(r.drawCalls).toBe(1);

    r.endPass();
    expect(r.endPassCalls).toBe(1);

    r.submit();
    expect(r.submitCalls).toBe(1);

    // destroy 后 submit 应抛错
    r.destroy();
    expect(r.destroyCalls).toBe(1);
    expect(() => r.submit()).toThrow(/destroyed/);

    // readPixels 返回正确长度的 Uint8Array
    const r2 = new MockRenderer();
    const pixels = await r2.readPixels(
      { id: 'tex', format: 'rgba8unorm' },
      0,
      0,
      4,
      4,
    );
    expect(pixels.length).toBe(64);
  });
});
