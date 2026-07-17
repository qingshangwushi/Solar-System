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
  type RendererConfig,
  type PrimitiveType,
  registerRendererFactory,
} from '@solar-system/renderer-core';

/**
 * 计算给定像素格式每个像素占用的字节数。
 * 覆盖 WebGPU 常见的 unorm/snorm/float/uint/sint 格式。
 */
export function bytesPerPixel(format: string): number {
  switch (format) {
    case 'r8unorm':
    case 'r8snorm':
    case 'r8uint':
    case 'r8sint':
      return 1;
    case 'rg8unorm':
    case 'rg8snorm':
    case 'rg8uint':
    case 'rg8sint':
    case 'r16uint':
    case 'r16sint':
    case 'r16float':
      return 2;
    case 'rgba8unorm':
    case 'rgba8unorm-srgb':
    case 'rgba8snorm':
    case 'rgba8uint':
    case 'rgba8sint':
    case 'bgra8unorm':
    case 'bgra8unorm-srgb':
      return 4;
    case 'rgba16uint':
    case 'rgba16sint':
    case 'rgba16float':
      return 8;
    case 'rgba32uint':
    case 'rgba32sint':
    case 'rgba32float':
      return 16;
    default:
      return 4;
  }
}

/**
 * 将 value 向上对齐到 alignment 的最小倍数。
 * WebGPU 要求 writeTexture 的 bytesPerRow 对齐到 256。
 */
export function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * 将统一渲染层的 PrimitiveType 映射到 WebGPU GPUPrimitiveTopology 字符串。
 * 覆盖 points/lines/line_strip/triangles/triangle_strip 完整拓扑集合。
 */
export function mapPrimitiveTopology(topology: PrimitiveType): string {
  switch (topology) {
    case 'points':
      return 'point-list';
    case 'lines':
      return 'line-list';
    case 'line_strip':
      return 'line-strip';
    case 'triangles':
      return 'triangle-list';
    case 'triangle_strip':
      return 'triangle-strip';
    default:
      return 'triangle-list';
  }
}

/** 设备丢失时由 device.lost 回调传入的 info 结构。 */
export interface DeviceLostInfo {
  reason: string;
  message: string;
}

/**
 * WebGPU GPUBufferUsage 本地副本常量。
 * 仅在 globalThis.GPUBufferUsage 不可用时（如 Node 测试环境无 WebGPU 运行时）作为回退使用。
 * 值与 WebGPU 规范定义的 GPUBufferUsage 命名常量一致。
 */
const GPU_BUFFER_USAGE = {
  MAP_READ: 1,
  MAP_WRITE: 2,
  COPY_SRC: 4,
  COPY_DST: 8,
  INDEX: 16,
  VERTEX: 32,
  STORAGE: 64,
  INDIRECT: 128,
  QUERY_RESOLVE: 256,
};

/**
 * WebGPU GPUTextureUsage 本地副本常量。
 * 仅在 globalThis.GPUTextureUsage 不可用时（如 Node 测试环境无 WebGPU 运行时）作为回退使用。
 * 值与 WebGPU 规范定义的 GPUTextureUsage 命名常量一致。
 */
const GPU_TEXTURE_USAGE = {
  COPY_SRC: 1,
  COPY_DST: 2,
  TEXTURE_BINDING: 4,
  STORAGE_BINDING: 8,
  RENDER_ATTACHMENT: 16,
};

interface BufferUsageConstants {
  readonly MAP_READ: number;
  readonly MAP_WRITE: number;
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly INDEX: number;
  readonly VERTEX: number;
  readonly STORAGE: number;
  readonly INDIRECT: number;
  readonly QUERY_RESOLVE: number;
}

interface TextureUsageConstants {
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly TEXTURE_BINDING: number;
  readonly STORAGE_BINDING: number;
  readonly RENDER_ATTACHMENT: number;
}

interface GlobalWithWebGPU {
  GPUBufferUsage?: BufferUsageConstants;
  GPUTextureUsage?: TextureUsageConstants;
}

/**
 * 获取 WebGPU buffer usage 常量：优先使用官方 globalThis.GPUBufferUsage 命名空间，
 * 缺省时回退到本地副本（Node 环境无 WebGPU 运行时）。
 */
export function getBufferUsage(): BufferUsageConstants {
  return (globalThis as unknown as GlobalWithWebGPU).GPUBufferUsage ?? GPU_BUFFER_USAGE;
}

/**
 * 获取 WebGPU texture usage 常量：优先使用官方 globalThis.GPUTextureUsage 命名空间，
 * 缺省时回退到本地副本（Node 环境无 WebGPU 运行时）。
 */
export function getTextureUsage(): TextureUsageConstants {
  return (globalThis as unknown as GlobalWithWebGPU).GPUTextureUsage ?? GPU_TEXTURE_USAGE;
}

class WebGpuRenderer implements Renderer {
  readonly backend: BackendType = 'webgpu';
  capabilities: RendererCapabilities;

  private device: unknown = null;
  private context: unknown = null;
  private presentationFormat: string = 'rgba8unorm';
  private canvas: HTMLCanvasElement | null = null;
  private gpu: {
    requestAdapter(options?: unknown): Promise<unknown | null>;
    getPreferredCanvasFormat?: () => string;
  } | null = null;

  private buffers = new Map<string, unknown>();
  private textures = new Map<string, unknown>();
  private pipelines = new Map<string, unknown>();

  private currentPass: unknown = null;

  private currentCommandEncoder: unknown = null;
  private pendingCommandBuffers: unknown[] = [];
  private textureMetadata = new Map<string, { width: number; height: number; format: string }>();

  /** 设备丢失标志，由 device.lost 回调置位。 */
  private deviceLost = false;
  /** 重建需求标志，外部轮询后在重建完成后通过 clearRebuildFlag 清除。 */
  private rebuildRequired = false;
  /** 用户注册的设备丢失回调（可选）。 */
  onDeviceLost: ((info: DeviceLostInfo) => void) | null = null;
  /** 工厂创建时传入的渲染配置（可选），用于设置 canvas 尺寸、色彩空间、抗锯齿等。 */
  private config: RendererConfig | null = null;

  constructor(config?: RendererConfig) {
    this.config = config ?? null;
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

  /** 返回工厂创建时传入的配置（如有），便于外部读取。 */
  getConfig(): RendererConfig | null {
    return this.config;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU is not supported');
    }

    this.gpu = navigator.gpu as unknown as {
      requestAdapter(options?: unknown): Promise<unknown | null>;
      getPreferredCanvasFormat?: () => string;
    };
    this.canvas = canvas;

    const adapter = await this.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    await this.acquireDevice(adapter);
  }

  /**
   * 内部：从 adapter 获取 device、注册 device.lost 监听、配置 canvas context、读取 adapter limits。
   * init() 与 reinit() 共享该流程。
   */
  private async acquireDevice(adapter: unknown): Promise<void> {
    const device = await (adapter as unknown as { requestDevice(): Promise<unknown> }).requestDevice();
    this.device = device;
    this.deviceLost = false;

    // 注册 device.lost 监听：WebGPU 规范要求 lost 是一个 Promise<DeviceLostInfo>
    const lost = (device as unknown as { lost?: Promise<DeviceLostInfo> }).lost;
    if (lost) {
      lost.then((info: DeviceLostInfo) => this.handleDeviceLost(info));
    }

    if (this.canvas && !this.context) {
      this.context = this.canvas.getContext('webgpu');
    }
    if (this.gpu) {
      this.presentationFormat = this.gpu.getPreferredCanvasFormat?.() ?? 'rgba8unorm';
    }
    if (this.context) {
      // 应用工厂传入的 RendererConfig：canvas 尺寸与色彩空间
      const canvasConfig: Record<string, unknown> = {
        device: this.device,
        format: this.presentationFormat,
        alphaMode: 'premultiplied',
      };
      if (this.config) {
        // WebGPU canvas colorSpace 仅接受 'srgb' / 'display-p3'
        canvasConfig.colorSpace = this.config.colorSpace === 'srgb' ? 'srgb' : 'display-p3';
        const canvasEl = this.canvas as unknown as { width: number; height: number };
        canvasEl.width = this.config.width;
        canvasEl.height = this.config.height;
      }
      (this.context as unknown as { configure(config: unknown): void }).configure(canvasConfig);
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

  /**
   * 设备丢失回调：标记 deviceLost + rebuildRequired，销毁所有 GPU 资源，触发用户回调。
   */
  handleDeviceLost(info: DeviceLostInfo): void {
    this.deviceLost = true;
    this.rebuildRequired = true;

    // 销毁所有 GPU 资源（device 已丢失，资源句柄不可再用）
    this.buffers.forEach((buf) => (buf as unknown as { destroy?: () => void }).destroy?.());
    this.textures.forEach((tex) => (tex as unknown as { destroy?: () => void }).destroy?.());
    this.pipelines.forEach((pipe) => (pipe as unknown as { destroy?: () => void }).destroy?.());
    this.buffers.clear();
    this.textures.clear();
    this.pipelines.clear();
    this.textureMetadata.clear();

    this.device = null;

    if (this.onDeviceLost) {
      this.onDeviceLost(info);
    }
  }

  /**
   * 重新初始化：重新 requestAdapter + requestDevice + context.configure。
   * 通常在 handleDeviceLost 触发后由外部调用以恢复渲染。
   */
  async reinit(): Promise<void> {
    if (!this.gpu) {
      throw new Error('Renderer not initialized');
    }
    if (!this.canvas) {
      throw new Error('Renderer not initialized');
    }

    const adapter = await this.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    await this.acquireDevice(adapter);
    this.rebuildRequired = false;
  }

  /** 当前设备是否处于丢失状态。 */
  isDeviceLost(): boolean {
    return this.deviceLost;
  }

  /** 是否需要重建（设备丢失后置位，由外部在重建流程结束后调用 clearRebuildFlag 清除）。 */
  isRebuildRequired(): boolean {
    return this.rebuildRequired;
  }

  /** 清除重建标志（外部完成重建流程后调用）。 */
  clearRebuildFlag(): void {
    this.rebuildRequired = false;
  }

  destroy(): void {
    this.buffers.forEach((buf) => (buf as unknown as { destroy: () => void }).destroy?.());
    this.textures.forEach((tex) => (tex as unknown as { destroy: () => void }).destroy?.());
    this.pipelines.forEach((pipe) => (pipe as unknown as { destroy: () => void }).destroy?.());

    this.buffers.clear();
    this.textures.clear();
    this.pipelines.clear();
    this.textureMetadata.clear();

    (this.device as unknown as { destroy: () => void })?.destroy?.();
    this.device = null;
    this.context = null;
    this.canvas = null;
    this.gpu = null;
    this.deviceLost = false;
    this.rebuildRequired = false;
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
      usage: desc.usage === 'dynamic' ? getBufferUsage().COPY_SRC | getBufferUsage().COPY_DST : getBufferUsage().COPY_DST,
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
      usage:
        desc.usage === 'render_target'
          ? getTextureUsage().STORAGE_BINDING | getTextureUsage().RENDER_ATTACHMENT
          : getTextureUsage().COPY_DST | getTextureUsage().RENDER_ATTACHMENT,
      mipLevelCount: desc.mipmap ? Math.floor(Math.log2(Math.max(desc.width, desc.height))) + 1 : 1,
    });

    this.textures.set(id, texture);
    this.textureMetadata.set(id, { width: desc.width, height: desc.height, format: desc.format });
    return { id, format: desc.format };
  }

  uploadTextureData(handle: TextureHandle, data: ArrayBufferView): void {
    if (!this.device) throw new Error('Renderer not initialized');

    const texture = this.textures.get(handle.id);
    if (!texture) throw new Error(`Texture not found: ${handle.id}`);

    const meta = this.textureMetadata.get(handle.id);
    if (!meta) throw new Error(`Texture metadata not found: ${handle.id}`);

    const bytesPerRow = alignTo(meta.width * bytesPerPixel(meta.format), 256);

    const queue = (this.device as unknown as { queue: unknown }).queue;
    (queue as unknown as { writeTexture(config: unknown, data: ArrayBufferView, layout: unknown, size: unknown): void }).writeTexture(
      { texture },
      data,
      { bytesPerRow },
      { width: meta.width, height: meta.height },
    );
  }

  destroyTexture(handle: TextureHandle): void {
    const texture = this.textures.get(handle.id);
    if (texture) {
      (texture as unknown as { destroy: () => void }).destroy?.();
      this.textures.delete(handle.id);
      this.textureMetadata.delete(handle.id);
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
        buffers: desc.vertexAttributes.map((attr, i) => ({
          arrayStride: attr.stride,
          attributes: [{ shaderLocation: i, offset: attr.offset, format: attr.format }],
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
        topology: mapPrimitiveTopology(desc.topology),
        cullMode: desc.cullMode ?? 'none',
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
    this.currentCommandEncoder = commandEncoder;
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
    if (this.currentCommandEncoder) {
      const cmdBuffer = (this.currentCommandEncoder as unknown as { finish(): unknown }).finish();
      this.pendingCommandBuffers.push(cmdBuffer);
      this.currentCommandEncoder = null;
    }
  }

  submit(): void {
    if (!this.device) throw new Error('Renderer not initialized');
    const queue = (this.device as unknown as { queue: unknown }).queue;
    (queue as unknown as { submit(commands: unknown[]): void }).submit(this.pendingCommandBuffers);
    this.pendingCommandBuffers = [];
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
      usage: getBufferUsage().MAP_READ,
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
  create(config: RendererConfig): Promise<Renderer> {
    return Promise.resolve(new WebGpuRenderer(config));
  }

  isSupported(backend: BackendType): boolean {
    return backend === 'webgpu' && typeof navigator !== 'undefined' && 'gpu' in navigator;
  }
}

registerRendererFactory('webgpu', new WebGpuRendererFactory());

export { WebGpuRenderer, WebGpuRendererFactory };

// E-06 / E-07：GPU 后处理管线 + Shadow Map 通道
export {
  WebGpuPostProcessingPipeline,
  createWebGpuPostProcessingPipeline,
} from './post-processing.js';
export {
  WebGpuShadowMapPass,
  createWebGpuShadowMapPass,
  SHADOW_PCF_WGSL,
} from './shadow-map.js';
