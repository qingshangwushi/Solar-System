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
  type BufferTarget,
  type TextureDescriptor,
  type TextureHandle,
  type PipelineDescriptor,
  type PipelineHandle,
  type RenderPassDescriptor,
  type DrawCall,
  type BackendType,
  type RendererFactory,
  type RendererConfig,
  registerRendererFactory,
} from '@solar-system/renderer-core';

class WebGl2Renderer implements Renderer {
  readonly backend: BackendType = 'webgl2';
  capabilities: RendererCapabilities;

  private gl: WebGL2RenderingContext | null = null;
  private loseExt: WEBGL_lose_context | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private contextLost = false;

  /** 用户注册的上下文丢失回调（可选）。 */
  onContextLost: (() => void) | null = null;
  /** 用户注册的上下文恢复回调（可选）。 */
  onContextRestored: (() => void) | null = null;

  private buffers = new Map<string, WebGLBuffer>();
  /**
   * 每个 buffer 的绑定 target（vertex/index/uniform）。
   *
   * OpenGL ES 3.0 规范 section 2.9.1：buffer 对象在首次绑定到某个 target 时获得
   * 对应的「类型」，之后不能再绑定到其他 target。createBuffer 时根据 BufferDescriptor.target
   * 首次绑定到正确的 GL target，此处记录 target 以便 updateBuffer 复用同一个 target。
   */
  private bufferTargets = new Map<string, BufferTarget>();
  /** 默认 VAO（Vertex Array Object）。SwiftShader 等严格 WebGL2 实现要求显式绑定
   *  VAO 才能进行顶点属性配置与绘制；默认 VAO (0) 在这些实现上会导致 bindBuffer /
   *  vertexAttribPointer / drawElements 报 GL_INVALID_OPERATION。 */
  private defaultVao: WebGLVertexArrayObject | null = null;
  private textures = new Map<string, WebGLTexture>();
  private programs = new Map<string, WebGLProgram>();
  /** pipeline id → 关联的 PipelineDescriptor（用于 draw() 设置顶点属性）。 */
  private pipelineDescs = new Map<string, PipelineDescriptor>();
  /** 工厂创建时传入的渲染配置（可选），用于设置 canvas 尺寸、抗锯齿等。 */
  private config: RendererConfig | null = null;
  /** 当前帧的 view-projection 矩阵（列主序 4×4，由编排器每帧设置）。 */
  private viewProjMatrix = new Float32Array(16);
  /** uniform buffer binding point（binding=0，对应 GLSL layout(std140, binding=0)）。 */
  private static readonly UBO_BINDING = 0;

  constructor(config?: RendererConfig) {
    this.config = config ?? null;
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
    // viewProj 默认为单位矩阵，未调用 setViewProj 时 shader 仍能正常绘制。
    this.viewProjMatrix[0] = 1;
    this.viewProjMatrix[5] = 1;
    this.viewProjMatrix[10] = 1;
    this.viewProjMatrix[15] = 1;
  }

  /** 返回工厂创建时传入的配置（如有），便于外部读取。 */
  getConfig(): RendererConfig | null {
    return this.config;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    // 应用工厂传入的 RendererConfig：抗锯齿通过 context attributes 传入
    const contextAttributes: WebGLContextAttributes = {};
    if (this.config) {
      contextAttributes.antialias = this.config.antialias;
      canvas.width = this.config.width;
      canvas.height = this.config.height;
    }
    const gl = canvas.getContext('webgl2', contextAttributes);
    if (!gl) {
      throw new Error('WebGL2 is not supported');
    }

    this.gl = gl;
    this.canvas = canvas;
    this.contextLost = false;

    // 注册 WEBGL_lose_context 扩展，便于主动触发/恢复上下文丢失
    this.loseExt = gl.getExtension('WEBGL_lose_context');

    // 注册 webglcontextlost / webglcontextrestored 事件监听
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.setupDefaultState(gl);
    this.capabilities = this.getDeviceCapabilities(gl);
  }

  /** 默认 GL 状态（init 与 context restored 后均调用）。 */
  private setupDefaultState(gl: WebGL2RenderingContext): void {
    // 创建并绑定默认 VAO。SwiftShader / 严格 WebGL2 实现要求显式 VAO 才能让
    // vertexAttribPointer / drawElements 正常工作；默认 VAO (0) 会触发 GL_INVALID_OPERATION。
    if (!this.defaultVao) {
      this.defaultVao = gl.createVertexArray();
    }
    if (this.defaultVao) {
      gl.bindVertexArray(this.defaultVao);
    }

    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  private handleContextLost = (event: Event): void => {
    // 必须 preventDefault 才能后续恢复
    event.preventDefault();
    this.contextLost = true;

    // 清空所有 GPU 资源句柄（上下文丢失后这些句柄已无效）
    this.buffers.clear();
    this.bufferTargets.clear();
    this.textures.clear();
    this.programs.clear();
    this.pipelineDescs.clear();
    this.defaultVao = null;

    if (this.onContextLost) {
      this.onContextLost();
    }
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
    const gl = this.gl;
    if (gl) {
      // 重新获取 lose_context 扩展（上下文恢复后扩展可能需要重新查询）
      this.loseExt = gl.getExtension('WEBGL_lose_context');
      this.setupDefaultState(gl);
    }
    if (this.onContextRestored) {
      this.onContextRestored();
    }
  };

  /** 当前上下文是否处于丢失状态。 */
  isContextLost(): boolean {
    return this.contextLost;
  }

  /** 主动触发上下文丢失（用于测试或主动重置）。 */
  triggerContextLoss(): void {
    if (this.loseExt) {
      this.loseExt.loseContext();
    }
  }

  /** 主动恢复上下文（与 triggerContextLoss 配对）。 */
  restoreContext(): void {
    if (this.loseExt) {
      this.loseExt.restoreContext();
    }
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
    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    }

    if (!this.gl) {
      this.canvas = null;
      this.loseExt = null;
      this.contextLost = false;
      return;
    }

    this.buffers.forEach((buf) => this.gl!.deleteBuffer(buf));
    this.textures.forEach((tex) => this.gl!.deleteTexture(tex));
    this.programs.forEach((prog) => this.gl!.deleteProgram(prog));
    if (this.defaultVao) {
      this.gl.deleteVertexArray(this.defaultVao);
      this.defaultVao = null;
    }

    this.buffers.clear();
    this.bufferTargets.clear();
    this.textures.clear();
    this.programs.clear();
    this.pipelineDescs.clear();

    this.gl = null;
    this.loseExt = null;
    this.canvas = null;
    this.contextLost = false;
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

    // 根据 BufferDescriptor.target 选择首次绑定的 GL target。
    // OpenGL ES 3.0 规范 section 2.9.1：buffer 对象首次绑定到某 target 时获得对应
    // 「类型」，之后不能再绑定到其他 target。若 index buffer 先绑定到 ARRAY_BUFFER，
    // 后续 draw() 中 bindBuffer(ELEMENT_ARRAY_BUFFER) 会触发 GL_INVALID_OPERATION。
    const target = desc.target ?? 'vertex';
    const glTarget = this.getGlBufferTarget(target);
    const usage = this.getBufferUsage(desc.usage);

    this.gl.bindBuffer(glTarget, buffer);

    if (desc.data) {
      this.gl.bufferData(glTarget, desc.data, usage);
    } else {
      this.gl.bufferData(glTarget, desc.size, usage);
    }

    this.gl.bindBuffer(glTarget, null);
    this.buffers.set(id, buffer);
    this.bufferTargets.set(id, target);

    return { id, usage: desc.usage };
  }

  /** 将 BufferTarget 映射为 WebGL2 GL 枚举。 */
  private getGlBufferTarget(target: BufferTarget): number {
    const gl = this.gl!;
    switch (target) {
      case 'vertex':
        return gl.ARRAY_BUFFER;
      case 'index':
        return gl.ELEMENT_ARRAY_BUFFER;
      case 'uniform':
        return gl.UNIFORM_BUFFER;
      default:
        return gl.ARRAY_BUFFER;
    }
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

    // 复用 createBuffer 时记录的 target，避免把 index/uniform buffer 绑定到错误的 target。
    const target = this.bufferTargets.get(handle.id) ?? 'vertex';
    const glTarget = this.getGlBufferTarget(target);

    this.gl.bindBuffer(glTarget, buffer);
    this.gl.bufferSubData(glTarget, offset ?? 0, data);
    this.gl.bindBuffer(glTarget, null);
  }

  destroyBuffer(handle: BufferHandle): void {
    if (!this.gl) return;

    const buffer = this.buffers.get(handle.id);
    if (buffer) {
      this.gl.deleteBuffer(buffer);
      this.buffers.delete(handle.id);
      this.bufferTargets.delete(handle.id);
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

    // GLSL ES 3.00 核心规范不支持 `layout(binding=N)` 限定符（这是桌面 GL 扩展）。
    // SwiftShader 等严格实现的 WebGL2 后端会因此报：
    //   'binding' : invalid layout qualifier: not supported
    // 解决方案：着色器中仅写 `layout(std140) uniform BodyUniforms { ... }`，
    // 在程序链接成功后通过 gl.uniformBlockBinding 显式将 uniform block 绑定到
    // 绑定点 0（与 draw() 中的 gl.bindBufferBase(UNIFORM_BUFFER, 0, ubo) 对应）。
    // 对不包含 BodyUniforms block 的管线（如后处理管线）此调用为 no-op。
    const blockIndex = this.gl.getUniformBlockIndex(program, 'BodyUniforms');
    if (blockIndex !== this.gl.INVALID_INDEX) {
      this.gl.uniformBlockBinding(program, blockIndex, WebGl2Renderer.UBO_BINDING);
    }

    this.programs.set(id, program);
    this.pipelineDescs.set(id, desc);

    return { id, descriptor: desc };
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
    this.pipelineDescs.delete(handle.id);
  }

  beginPass(desc: RenderPassDescriptor): void {
    if (!this.gl) throw new Error('Renderer not initialized');

    // 默认状态（每次 beginPass 重置 depth，避免上一 pass 的状态泄漏）
    this.gl.clearDepth(1.0);
    this.gl.enable(this.gl.DEPTH_TEST);

    // 颜色附件：尊重 loadOp（load=保留现有像素，clear=清空，discard=丢弃）
    if (desc.colorAttachments.length > 0 && desc.colorAttachments[0]) {
      const attachment = desc.colorAttachments[0];
      const loadOp = attachment.loadOp ?? 'clear';
      if (loadOp === 'clear') {
        const clear = attachment.clear ?? [0, 0, 0, 0];
        this.gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
      // loadOp === 'load' → 保留现有画布内容（不清空），让多个 body 叠加绘制
      // loadOp === 'discard' → 内容不重要，可不清空
    }

    // 深度附件：每次 beginPass 默认清空深度，确保 depth test 正确
    if (desc.depthStencilAttachment) {
      const depthClear = desc.depthStencilAttachment.depthClear;
      const depthLoadOp = desc.depthStencilAttachment.depthLoadOp ?? 'clear';
      if (depthLoadOp === 'clear') {
        if (depthClear !== undefined) {
          this.gl.clearDepth(depthClear);
        }
        this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
      }
    }
  }

  draw(call: DrawCall): void {
    if (!this.gl) throw new Error('Renderer not initialized');

    const gl = this.gl;
    const program = this.programs.get(call.pipeline.id);
    if (!program) throw new Error(`Pipeline not found: ${call.pipeline.id}`);

    const vertexBuffer = this.buffers.get(call.vertexBuffer.id);
    if (!vertexBuffer) throw new Error(`Vertex buffer not found: ${call.vertexBuffer.id}`);

    // 绑定默认 VAO。SwiftShader 等严格 WebGL2 实现要求显式 VAO 才能让
    // vertexAttribPointer / drawElements 正常工作。VAO 封装了 ARRAY_BUFFER 绑定状态
    // 之外的顶点属性配置与 ELEMENT_ARRAY_BUFFER 绑定。
    if (this.defaultVao) {
      gl.bindVertexArray(this.defaultVao);
    }

    // 获取 pipeline 描述符，用于正确设置顶点属性（stride / offset / format）
    const pipelineDesc = this.pipelineDescs.get(call.pipeline.id) ?? call.pipeline.descriptor;

    gl.useProgram(program);

    // 上传 view-projection 矩阵到 shader 的 u_viewProj uniform（每帧由编排器设置）
    const viewProjLoc = gl.getUniformLocation(program, 'u_viewProj');
    if (viewProjLoc) {
      gl.uniformMatrix4fv(viewProjLoc, false, this.viewProjMatrix);
    }

    // 绑定 uniform buffer（UBO）到 binding=0，对应 GLSL layout(std140, binding=0) uniform block
    if (call.uniformBuffer) {
      const ubo = this.buffers.get(call.uniformBuffer.id);
      if (ubo) {
        gl.bindBufferBase(gl.UNIFORM_BUFFER, WebGl2Renderer.UBO_BINDING, ubo);
      }
    }

    // 绑定顶点缓冲并按 PipelineDescriptor.vertexAttributes 配置顶点属性
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    if (pipelineDesc) {
      for (let i = 0; i < pipelineDesc.vertexAttributes.length; i++) {
        const attr = pipelineDesc.vertexAttributes[i]!;
        const size = attr.format === 'float32x3' ? 3 : attr.format === 'float32x2' ? 2 : 1;
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, size, gl.FLOAT, false, attr.stride, attr.offset);
      }
    } else {
      // 回退：仅启用 location 0（position），stride=0（紧密排列）
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    }

    // 绘制
    if (call.indexBuffer) {
      const indexBuffer = this.buffers.get(call.indexBuffer.id);
      if (indexBuffer) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.drawElements(gl.TRIANGLES, call.indexCount ?? call.vertexCount, gl.UNSIGNED_INT, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, call.vertexCount);
      }
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, call.vertexCount);
    }

    // 清理顶点属性状态
    if (pipelineDesc) {
      for (let i = 0; i < pipelineDesc.vertexAttributes.length; i++) {
        gl.disableVertexAttribArray(i);
      }
    } else {
      gl.disableVertexAttribArray(0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if (call.uniformBuffer) {
      gl.bindBufferBase(gl.UNIFORM_BUFFER, WebGl2Renderer.UBO_BINDING, null);
    }
    gl.useProgram(null);
  }

  /** 设置当前帧的 view-projection 矩阵（列主序 4×4，16 个 float）。 */
  setViewProj(matrix: ArrayLike<number>): void {
    const src = matrix;
    for (let i = 0; i < 16 && i < src.length; i++) {
      this.viewProjMatrix[i] = src[i] as number;
    }
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
  create(config: RendererConfig): Promise<Renderer> {
    return Promise.resolve(new WebGl2Renderer(config));
  }

  isSupported(backend: BackendType): boolean {
    return (
      backend === 'webgl2' &&
      typeof document !== 'undefined' &&
      document.createElement('canvas').getContext('webgl2') !== null
    );
  }
}

registerRendererFactory('webgl2', new WebGl2RendererFactory());

export { WebGl2Renderer, WebGl2RendererFactory };

// E-06 / E-07：GPU 后处理管线 + Shadow Map 通道
export {
  WebGl2PostProcessingPipeline,
  createWebGl2PostProcessingPipeline,
} from './post-processing.js';
export {
  WebGl2ShadowMapPass,
  createWebGl2ShadowMapPass,
  SHADOW_PCF_GLSL,
} from './shadow-map.js';
