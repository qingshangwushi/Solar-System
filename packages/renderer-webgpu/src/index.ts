/**
 * WebGPU 渲染后端实现（任务 P0-13）。
 */

import {
  type Renderer,
  type RendererCapabilities,
  type BufferDescriptor,
  type BufferHandle,
  type TextureDescriptor,
  type TextureHandle,
  type PipelineDescriptor,
  type PipelineHandle,
  type RenderPassDescriptor,
  type DrawCall,
  type BackendType,
  type RendererFactory,
  registerRendererFactory,
} from '@solar-system/renderer-core';

class WebGpuRenderer implements Renderer {
  readonly backend: BackendType = 'webgpu';
  capabilities: RendererCapabilities;

  private device: unknown = null;
  private context: unknown = null;
  private presentationFormat: string = 'rgba8unorm';

  private buffers = new Map<string, unknown>();
  private textures = new Map<string, unknown>();
  private pipelines = new Map<string, unknown>();

  private currentPass: unknown = null;

  constructor() {
    this.capabilities = {
      maxTextureSize: 16384,
      maxTextureArrayLayers: 256,
      maxBindGroups: 4,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 16777216,
      supportsFloatTextures: true,
      supportsFloat16Textures: true,
      supportsCompressedTextures: true,
    };
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU is not supported');
    }

    const gpu = navigator.gpu as unknown as {
      requestAdapter(options?: unknown): Promise<unknown | null>;
      getPreferredCanvasFormat?: () => string;
    };

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    this.device = await (adapter as unknown as { requestDevice(): Promise<unknown> }).requestDevice();
    this.context = canvas.getContext('webgpu');
    this.presentationFormat = gpu.getPreferredCanvasFormat?.() ?? 'rgba8unorm';

    if (this.context) {
      (this.context as unknown as { configure(config: unknown): void }).configure({
        device: this.device,
        format: this.presentationFormat,
        alphaMode: 'premultiplied',
      });
    }

    const limits = (adapter as unknown as { limits: Record<string, number> }).limits ?? {};
    this.capabilities = {
      maxTextureSize: limits.maxTextureDimension2D ?? 16384,
      maxTextureArrayLayers: limits.maxTextureArrayLayers ?? 256,
      maxBindGroups: limits.maxBindGroups ?? 4,
      maxUniformBufferBindingSize: limits.maxUniformBufferBindingSize ?? 65536,
      maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize ?? 16777216,
      supportsFloatTextures: true,
      supportsFloat16Textures: true,
      supportsCompressedTextures: true,
    };
  }

  destroy(): void {
    this.buffers.forEach((buf) => (buf as unknown as { destroy: () => void }).destroy?.());
    this.textures.forEach((tex) => (tex as unknown as { destroy: () => void }).destroy?.());
    this.pipelines.forEach((pipe) => (pipe as unknown as { destroy: () => void }).destroy?.());

    this.buffers.clear();
    this.textures.clear();
    this.pipelines.clear();

    (this.device as unknown as { destroy: () => void })?.destroy?.();
    this.device = null;
    this.context = null;
  }

  resize(width: number, height: number): void {
    if (!this.context) return;
    const dpr = window.devicePixelRatio || 1;
    (this.context as unknown as { canvas: HTMLCanvasElement }).canvas.width = width * dpr;
    (this.context as unknown as { canvas: HTMLCanvasElement }).canvas.height = height * dpr;
  }

  createBuffer(desc: BufferDescriptor): BufferHandle {
    if (!this.device) throw new Error('Renderer not initialized');

    const id = `buffer-${Math.random().toString(36).substr(2, 9)}`;
    const createBuffer = (this.device as unknown as { createBuffer(config: unknown): unknown }).createBuffer;

    const buffer = createBuffer({
      size: desc.size,
      usage: desc.usage === 'dynamic' ? 12 : 8,
      mappedAtCreation: !!desc.data,
    });

    if (desc.data) {
      const mapped = (buffer as unknown as { getMappedRange(): ArrayBuffer }).getMappedRange();
      new Uint8Array(mapped).set(new Uint8Array(desc.data));
      (buffer as unknown as { unmap(): void }).unmap();
    }

    this.buffers.set(id, buffer);
    return { id, usage: desc.usage };
  }

  updateBuffer(handle: BufferHandle, data: ArrayBuffer, offset?: number): void {
    if (!this.device) throw new Error('Renderer not initialized');

    const buffer = this.buffers.get(handle.id);
    if (!buffer) throw new Error(`Buffer not found: ${handle.id}`);

    const queue = (this.device as unknown as { queue: unknown }).queue;
    (queue as unknown as { writeBuffer(buffer: unknown, offset: number, data: ArrayBuffer): void }).writeBuffer(
      buffer,
      offset ?? 0,
      data,
    );
  }

  destroyBuffer(handle: BufferHandle): void {
    const buffer = this.buffers.get(handle.id);
    if (buffer) {
      (buffer as unknown as { destroy: () => void }).destroy?.();
      this.buffers.delete(handle.id);
    }
  }

  createTexture(desc: TextureDescriptor): TextureHandle {
    if (!this.device) throw new Error('Renderer not initialized');

    const id = `texture-${Math.random().toString(36).substr(2, 9)}`;
    const createTexture = (this.device as unknown as { createTexture(config: unknown): unknown }).createTexture;

    const texture = createTexture({
      size: { width: desc.width, height: desc.height },
      format: desc.format,
      usage: desc.usage === 'render_target' ? 24 : 18,
      mipLevelCount: desc.mipmap ? Math.floor(Math.log2(Math.max(desc.width, desc.height))) + 1 : 1,
    });

    this.textures.set(id, texture);
    return { id, format: desc.format };
  }

  uploadTextureData(handle: TextureHandle, data: ArrayBufferView): void {
    if (!this.device) throw new Error('Renderer not initialized');

    const texture = this.textures.get(handle.id);
    if (!texture) throw new Error(`Texture not found: ${handle.id}`);

    const queue = (this.device as unknown as { queue: unknown }).queue;
    (queue as unknown as { writeTexture(config: unknown, data: ArrayBufferView, layout: unknown, size: unknown): void }).writeTexture(
      { texture },
      data,
      { bytesPerRow: handle.format === 'rgba8unorm' ? handle.id.length * 4 : 0 },
      { width: (texture as unknown as { width: number }).width, height: (texture as unknown as { height: number }).height },
    );
  }

  destroyTexture(handle: TextureHandle): void {
    const texture = this.textures.get(handle.id);
    if (texture) {
      (texture as unknown as { destroy: () => void }).destroy?.();
      this.textures.delete(handle.id);
    }
  }

  createPipeline(desc: PipelineDescriptor): PipelineHandle {
    if (!this.device) throw new Error('Renderer not initialized');

    const id = `pipeline-${Math.random().toString(36).substr(2, 9)}`;
    const createRenderPipeline = (this.device as unknown as { createRenderPipeline(config: unknown): unknown }).createRenderPipeline;

    const pipeline = createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: (this.device as unknown as { createShaderModule(config: unknown): unknown }).createShaderModule({
          code: desc.vertexShader.source,
        }),
        entryPoint: desc.vertexShader.entryPoint ?? 'main',
        buffers: desc.vertexAttributes.map((attr) => ({
          arrayStride: attr.stride,
          attributes: [{ shaderLocation: 0, offset: attr.offset, format: attr.format }],
        })),
      },
      fragment: {
        module: (this.device as unknown as { createShaderModule(config: unknown): unknown }).createShaderModule({
          code: desc.fragmentShader.source,
        }),
        entryPoint: desc.fragmentShader.entryPoint ?? 'main',
        targets: [{ format: this.presentationFormat }],
      },
      primitive: {
        topology: desc.topology === 'triangles' ? 'triangle-list' : 'triangle-list',
        cullMode: desc.cullMode === 'back' ? 'back' : desc.cullMode === 'front' ? 'front' : undefined,
      },
      depthStencil: desc.depthTest
        ? {
            depthWriteEnabled: desc.depthWrite ?? true,
            depthCompare: 'less',
            format: 'depth24plus',
          }
        : undefined,
    });

    this.pipelines.set(id, pipeline);
    return { id };
  }

  destroyPipeline(handle: PipelineHandle): void {
    const pipeline = this.pipelines.get(handle.id);
    if (pipeline) {
      (pipeline as unknown as { destroy: () => void }).destroy?.();
      this.pipelines.delete(handle.id);
    }
  }

  beginPass(desc: RenderPassDescriptor): void {
    if (!this.device || !this.context) throw new Error('Renderer not initialized');

    const colorAttachments = desc.colorAttachments.map((ca) => {
      const texture = this.textures.get(ca.texture.id);
      return {
        view: texture
          ? (texture as unknown as { createView(): unknown }).createView()
          : ((this.context as unknown as { getCurrentTexture(): unknown }).getCurrentTexture() as unknown as { createView(): unknown }).createView(),
        clearValue: ca.clear ?? [0, 0, 0, 1],
        loadOp: ca.loadOp ?? 'clear',
        storeOp: ca.storeOp ?? 'store',
      };
    });

    const commandEncoder = (this.device as unknown as { createCommandEncoder(): unknown }).createCommandEncoder();
    this.currentPass = (commandEncoder as unknown as { beginRenderPass(config: unknown): unknown }).beginRenderPass({
      colorAttachments,
    });
  }

  draw(call: DrawCall): void {
    if (!this.currentPass) throw new Error('No active render pass');

    const pipeline = this.pipelines.get(call.pipeline.id);
    if (!pipeline) throw new Error(`Pipeline not found: ${call.pipeline.id}`);

    const vertexBuffer = this.buffers.get(call.vertexBuffer.id);
    if (!vertexBuffer) throw new Error(`Vertex buffer not found: ${call.vertexBuffer.id}`);

    (this.currentPass as unknown as { setPipeline(pipeline: unknown): void }).setPipeline(pipeline);
    (this.currentPass as unknown as { setVertexBuffer(slot: number, buffer: unknown): void }).setVertexBuffer(0, vertexBuffer);

    if (call.indexBuffer) {
      const indexBuffer = this.buffers.get(call.indexBuffer.id);
      if (indexBuffer) {
        (this.currentPass as unknown as { setIndexBuffer(buffer: unknown, format: string): void }).setIndexBuffer(indexBuffer, 'uint32');
        (this.currentPass as unknown as { drawIndexed(count: number, instances: number): void }).drawIndexed(
          call.indexCount ?? call.vertexCount,
          call.instanceCount ?? 1,
        );
      } else {
        (this.currentPass as unknown as { draw(count: number, instances: number): void }).draw(call.vertexCount, call.instanceCount ?? 1);
      }
    } else {
      (this.currentPass as unknown as { draw(count: number, instances: number): void }).draw(call.vertexCount, call.instanceCount ?? 1);
    }
  }

  endPass(): void {
    if (this.currentPass) {
      (this.currentPass as unknown as { end(): void }).end();
      this.currentPass = null;
    }
  }

  submit(): void {
    if (!this.device) throw new Error('Renderer not initialized');
    const queue = (this.device as unknown as { queue: unknown }).queue;
    (queue as unknown as { submit(commands: unknown[]): void }).submit([]);
  }

  async readPixels(
    texture: TextureHandle,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<Uint8Array> {
    if (!this.device) throw new Error('Renderer not initialized');

    const tex = this.textures.get(texture.id);
    if (!tex) throw new Error(`Texture not found: ${texture.id}`);

    const createBuffer = (this.device as unknown as { createBuffer(config: unknown): unknown }).createBuffer;
    const buffer = createBuffer({
      size: width * height * 4,
      usage: 1,
    });

    const commandEncoder = (this.device as unknown as { createCommandEncoder(): unknown }).createCommandEncoder();
    (commandEncoder as unknown as { copyTextureToBuffer(source: unknown, destination: unknown, size: unknown): void }).copyTextureToBuffer(
      { texture: tex, mipLevel: 0, origin: { x, y, z: 0 } },
      { buffer, bytesPerRow: width * 4 },
      { width, height },
    );

    const queue = (this.device as unknown as { queue: unknown }).queue;
    (queue as unknown as { submit(commands: unknown[]): void }).submit([
      (commandEncoder as unknown as { finish(): unknown }).finish(),
    ]);

    await (buffer as unknown as { mapAsync(mode: number): Promise<void> }).mapAsync(1);
    const data = new Uint8Array((buffer as unknown as { getMappedRange(): ArrayBuffer }).getMappedRange());
    const result = new Uint8Array(data);
    (buffer as unknown as { unmap(): void }).unmap();
    (buffer as unknown as { destroy(): void }).destroy();

    return result;
  }
}

class WebGpuRendererFactory implements RendererFactory {
  create(): Promise<Renderer> {
    return Promise.resolve(new WebGpuRenderer());
  }

  isSupported(): boolean {
    return 'gpu' in navigator;
  }
}

registerRendererFactory('webgpu', new WebGpuRendererFactory());

export { WebGpuRenderer, WebGpuRendererFactory };
