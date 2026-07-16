/**
 * WebGL2 渲染后端实现（任务 P0-13）。
 *
 * 实现统一渲染器接口的 WebGL2 具体实现，作为 WebGPU 的降级方案。
 *
 * 设计文档参考：
 * - 第 6.3 节：渲染后端抽象（FR-RENDER-001）
 * - 第 6.4 节：双后端支持（FR-RENDER-003）
 * - 第 6.5 节：WebGL2 后端（FR-WEBGL2-001）
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

class WebGl2Renderer implements Renderer {
  readonly backend: BackendType = 'webgl2';
  capabilities: RendererCapabilities;

  private gl: WebGL2RenderingContext | null = null;

  private buffers = new Map<string, WebGLBuffer>();
  private textures = new Map<string, WebGLTexture>();
  private programs = new Map<string, WebGLProgram>();

  constructor() {
    this.capabilities = {
      maxTextureSize: 8192,
      maxTextureArrayLayers: 256,
      maxBindGroups: 8,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 16777216,
      supportsFloatTextures: true,
      supportsFloat16Textures: false,
      supportsCompressedTextures: false,
    };
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 is not supported');
    }

    this.gl = gl;

    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    this.capabilities = this.getDeviceCapabilities(gl);
  }

  private getDeviceCapabilities(gl: WebGL2RenderingContext): RendererCapabilities {
    return {
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxTextureArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
      maxBindGroups: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      maxUniformBufferBindingSize: gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE),
      maxStorageBufferBindingSize: (gl.getParameter(0x90D2) as number) ?? 16777216,
      supportsFloatTextures: !!gl.getExtension('OES_texture_float'),
      supportsFloat16Textures: !!gl.getExtension('OES_texture_half_float'),
      supportsCompressedTextures: !!gl.getExtension('WEBGL_compressed_texture_etc1'),
    };
  }

  destroy(): void {
    if (!this.gl) return;

    this.buffers.forEach((buf) => this.gl!.deleteBuffer(buf));
    this.textures.forEach((tex) => this.gl!.deleteTexture(tex));
    this.programs.forEach((prog) => this.gl!.deleteProgram(prog));

    this.buffers.clear();
    this.textures.clear();
    this.programs.clear();

    this.gl = null;
  }

  resize(width: number, height: number): void {
    if (!this.gl) return;
    const dpr = window.devicePixelRatio || 1;
    this.gl.canvas.width = width * dpr;
    this.gl.canvas.height = height * dpr;
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
  }

  createBuffer(desc: BufferDescriptor): BufferHandle {
    if (!this.gl) throw new Error('Renderer not initialized');

    const id = `buffer-${Math.random().toString(36).substr(2, 9)}`;
    const buffer = this.gl.createBuffer();

    if (!buffer) throw new Error('Failed to create buffer');

    const usage = this.getBufferUsage(desc.usage);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);

    if (desc.data) {
      this.gl.bufferData(this.gl.ARRAY_BUFFER, desc.data, usage);
    } else {
      this.gl.bufferData(this.gl.ARRAY_BUFFER, desc.size, usage);
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.buffers.set(id, buffer);

    return { id, usage: desc.usage };
  }

  private getBufferUsage(usage: BufferDescriptor['usage']): number {
    const gl = this.gl!;
    switch (usage) {
      case 'static':
        return gl.STATIC_DRAW;
      case 'dynamic':
        return gl.DYNAMIC_DRAW;
      case 'stream':
        return gl.STREAM_DRAW;
      default:
        return gl.STATIC_DRAW;
    }
  }

  updateBuffer(handle: BufferHandle, data: ArrayBuffer, offset?: number): void {
    if (!this.gl) throw new Error('Renderer not initialized');

    const buffer = this.buffers.get(handle.id);
    if (!buffer) throw new Error(`Buffer not found: ${handle.id}`);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, offset ?? 0, data);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  destroyBuffer(handle: BufferHandle): void {
    if (!this.gl) return;

    const buffer = this.buffers.get(handle.id);
    if (buffer) {
      this.gl.deleteBuffer(buffer);
      this.buffers.delete(handle.id);
    }
  }

  createTexture(desc: TextureDescriptor): TextureHandle {
    if (!this.gl) throw new Error('Renderer not initialized');

    const id = `texture-${Math.random().toString(36).substr(2, 9)}`;
    const texture = this.gl.createTexture();

    if (!texture) throw new Error('Failed to create texture');

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

    const internalFormat = this.getInternalFormat(desc.format);
    const format = this.getFormat(desc.format);
    const type = this.getTextureType(desc.format);

    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      internalFormat,
      desc.width,
      desc.height,
      0,
      format,
      type,
      null,
    );

    if (desc.mipmap) {
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
    }

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, desc.mipmap ? this.gl.LINEAR_MIPMAP_LINEAR : this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.textures.set(id, texture);

    return { id, format: desc.format };
  }

  private getInternalFormat(format: TextureDescriptor['format']): number {
    const gl = this.gl!;
    switch (format) {
      case 'rgba8unorm': return gl.RGBA8;
      case 'rgba16float': return gl.RGBA16F;
      case 'rgb10a2unorm': return gl.RGB10_A2;
      case 'depth24plus-stencil8': return gl.DEPTH24_STENCIL8;
      case 'depth32float': return gl.DEPTH_COMPONENT32F;
      default: return gl.RGBA8;
    }
  }

  private getFormat(format: TextureDescriptor['format']): number {
    const gl = this.gl!;
    switch (format) {
      case 'rgba8unorm':
      case 'rgba16float':
        return gl.RGBA;
      case 'rgb10a2unorm':
        return gl.RGBA;
      case 'depth24plus-stencil8':
        return gl.DEPTH_STENCIL;
      case 'depth32float':
        return gl.DEPTH_COMPONENT;
      default:
        return gl.RGBA;
    }
  }

  private getTextureType(format: TextureDescriptor['format']): number {
    const gl = this.gl!;
    switch (format) {
      case 'rgba8unorm':
      case 'rgb10a2unorm':
        return gl.UNSIGNED_BYTE;
      case 'rgba16float':
        return gl.HALF_FLOAT;
      case 'depth24plus-stencil8':
        return gl.UNSIGNED_INT_24_8;
      case 'depth32float':
        return gl.FLOAT;
      default:
        return gl.UNSIGNED_BYTE;
    }
  }

  uploadTextureData(handle: TextureHandle, data: ArrayBufferView): void {
    if (!this.gl) throw new Error('Renderer not initialized');

    const texture = this.textures.get(handle.id);
    if (!texture) throw new Error(`Texture not found: ${handle.id}`);

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

    const format = this.getFormat(handle.format);
    const type = this.getTextureType(handle.format);

    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, format, type, data as unknown as TexImageSource);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  destroyTexture(handle: TextureHandle): void {
    if (!this.gl) return;

    const texture = this.textures.get(handle.id);
    if (texture) {
      this.gl.deleteTexture(texture);
      this.textures.delete(handle.id);
    }
  }

  createPipeline(desc: PipelineDescriptor): PipelineHandle {
    if (!this.gl) throw new Error('Renderer not initialized');

    const id = `pipeline-${Math.random().toString(36).substr(2, 9)}`;

    const vertexShader = this.createShader(desc.vertexShader.source, this.gl.VERTEX_SHADER);
    const fragmentShader = this.createShader(desc.fragmentShader.source, this.gl.FRAGMENT_SHADER);

    const program = this.gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(program);
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      throw new Error(`Program link error: ${error}`);
    }

    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    this.programs.set(id, program);

    return { id };
  }

  private createShader(source: string, type: number): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${error}`);
    }

    return shader;
  }

  destroyPipeline(handle: PipelineHandle): void {
    if (!this.gl) return;

    const program = this.programs.get(handle.id);
    if (program) {
      this.gl.deleteProgram(program);
      this.programs.delete(handle.id);
    }
  }

  beginPass(desc: RenderPassDescriptor): void {
    if (!this.gl) throw new Error('Renderer not initialized');

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clearDepth(1.0);

    if (desc.colorAttachments.length > 0 && desc.colorAttachments[0]) {
      const clear = desc.colorAttachments[0].clear;
      if (clear) {
        this.gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      }
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    if (desc.depthStencilAttachment) {
      const depthClear = desc.depthStencilAttachment.depthClear;
      if (depthClear !== undefined) {
        this.gl.clearDepth(depthClear);
      }
      this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
    }

    this.gl.enable(this.gl.DEPTH_TEST);
  }

  draw(call: DrawCall): void {
    if (!this.gl) throw new Error('Renderer not initialized');

    const program = this.programs.get(call.pipeline.id);
    if (!program) throw new Error(`Pipeline not found: ${call.pipeline.id}`);

    const vertexBuffer = this.buffers.get(call.vertexBuffer.id);
    if (!vertexBuffer) throw new Error(`Vertex buffer not found: ${call.vertexBuffer.id}`);

    this.gl.useProgram(program);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 0, 0);

    if (call.indexBuffer) {
      const indexBuffer = this.buffers.get(call.indexBuffer.id);
      if (indexBuffer) {
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        this.gl.drawElements(this.gl.TRIANGLES, call.indexCount ?? call.vertexCount, this.gl.UNSIGNED_INT, 0);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
      } else {
        this.gl.drawArrays(this.gl.TRIANGLES, 0, call.vertexCount);
      }
    } else {
      this.gl.drawArrays(this.gl.TRIANGLES, 0, call.vertexCount);
    }

    this.gl.disableVertexAttribArray(0);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.useProgram(null);
  }

  endPass(): void {
    if (!this.gl) return;
    this.gl.flush();
  }

  submit(): void {
    if (!this.gl) return;
    this.gl.flush();
  }

  async readPixels(
    texture: TextureHandle,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<Uint8Array> {
    if (!this.gl) throw new Error('Renderer not initialized');

    const tex = this.textures.get(texture.id);
    if (!tex) throw new Error(`Texture not found: ${texture.id}`);

    const framebuffer = this.gl.createFramebuffer();
    if (!framebuffer) throw new Error('Failed to create framebuffer');

    this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, framebuffer);
    this.gl.framebufferTexture2D(
      this.gl.READ_FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      tex,
      0,
    );

    const data = new Uint8Array(width * height * 4);
    this.gl.readPixels(x, y, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, data);

    this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, null);
    this.gl.deleteFramebuffer(framebuffer);

    return data;
  }
}

class WebGl2RendererFactory implements RendererFactory {
  create(): Promise<Renderer> {
    return Promise.resolve(new WebGl2Renderer());
  }

  isSupported(): boolean {
    return typeof document !== 'undefined' && document.createElement('canvas').getContext('webgl2') !== null;
  }
}

registerRendererFactory('webgl2', new WebGl2RendererFactory());

export { WebGl2Renderer, WebGl2RendererFactory };
