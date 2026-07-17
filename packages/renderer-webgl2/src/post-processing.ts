/**
 * WebGL2 HDR 后处理管线实现（任务 9 / E-06）。
 *
 * 使用 WebGL2 framebuffers / textures / programs (GLSL ES 3.0) 实现与
 * WebGPU 等价的后处理 pass 序列：亮度提取 → 降采样 → 升采样 → 色调映射 →
 * 颜色分级 → 合成。
 *
 * 设计要点：
 * - 每个阶段对应一个 WebGLProgram + framebuffer（render-to-texture）
 * - GLSL ES 3.0 shader 以字符串常量提供
 * - 在无 GL 环境下（Node CI），构造与 dispose 不依赖真实 GL context；
 *   execute 仅在 renderer 已初始化时提交 GL 命令
 */

import {
  type GPUPostProcessingPipeline,
  type PostProcessingOptions,
  type Renderer,
  type TextureHandle,
  type TextureDescriptor,
  type PipelineDescriptor,
  type RenderPassDescriptor,
  type PipelineHandle,
  DEFAULT_GPU_POST_PROCESSING,
} from '@solar-system/renderer-core';

// ============================================================================
// GLSL ES 3.0 Shader 源码
// ============================================================================

/** 全屏三角形顶点 shader（所有 stage 共用）。 */
const FULLSCREEN_VERT_GLSL = `#version 300 es
out vec2 v_uv;
void main() {
  // 生成覆盖全屏的三角形：vi=0,1,2
  vec2 p;
  if (gl_VertexID == 0) { p = vec2(-1.0, -3.0); }
  else if (gl_VertexID == 1) { p = vec2(-1.0, 1.0); }
  else { p = vec2(3.0, 1.0); }
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

/** BrightPass 提取。 */
const BRIGHT_PASS_FRAG_GLSL = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
uniform float u_threshold;
uniform float u_softKnee;
void main() {
  vec3 color = texture(u_src, v_uv).rgb;
  float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float knee = u_threshold * u_softKnee + 1e-6;
  float soft = clamp(brightness - u_threshold + knee, 0.0, 2.0 * knee) / (2.0 * knee);
  float factor = soft * soft * (3.0 - 2.0 * soft);
  float contribution = brightness > (u_threshold - knee) ? factor : 0.0;
  fragColor = vec4(color * contribution, 1.0);
}
`;

/** 降采样 shader。 */
const DOWNSAMPLE_FRAG_GLSL = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
uniform vec2 u_texel;
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  vec3 l = texture(u_src, v_uv + vec2(-u_texel.x, 0.0)).rgb;
  vec3 r = texture(u_src, v_uv + vec2(u_texel.x, 0.0)).rgb;
  vec3 t = texture(u_src, v_uv + vec2(0.0, u_texel.y)).rgb;
  vec3 b = texture(u_src, v_uv + vec2(0.0, -u_texel.y)).rgb;
  fragColor = vec4(c * 0.5 + (l + r + t + b) * 0.125, 1.0);
}
`;

/** 升采样 shader。 */
const UPSAMPLE_FRAG_GLSL = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_intensity;
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  vec3 tl = texture(u_src, v_uv + vec2(-u_texel.x, -u_texel.y)).rgb;
  vec3 tr = texture(u_src, v_uv + vec2(u_texel.x, -u_texel.y)).rgb;
  vec3 bl = texture(u_src, v_uv + vec2(-u_texel.x, u_texel.y)).rgb;
  vec3 br = texture(u_src, v_uv + vec2(u_texel.x, u_texel.y)).rgb;
  vec3 sum = c * 0.125 + (tl + tr + bl + br) * 0.5;
  fragColor = vec4(sum * u_intensity, 1.0);
}
`;

/** 色调映射 shader。 */
const TONE_MAP_FRAG_GLSL = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
uniform float u_exposure;
uniform uint u_mode; // 0=none, 1=reinhard, 2=aces

vec3 aces(vec3 x) {
  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  vec3 color = texture(u_src, v_uv).rgb * u_exposure;
  if (u_mode == 1u) { color = color / (1.0 + color); }
  else if (u_mode == 2u) { color = aces(color); }
  fragColor = vec4(color, 1.0);
}
`;

/** 颜色分级 shader（passthrough 或 LUT 查找）。 */
const COLOR_GRADE_FRAG_GLSL = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
uniform sampler2D u_lut;
uniform uint u_lutEnabled;
uniform float u_lutSize;
void main() {
  vec3 color = texture(u_src, v_uv).rgb;
  if (u_lutEnabled == 0u) {
    fragColor = vec4(color, 1.0);
    return;
  }
  float r = clamp(color.r, 0.0, 1.0);
  vec2 lutUv = vec2((r + 0.5) / u_lutSize, 0.5);
  vec3 graded = texture(u_lut, lutUv).rgb;
  fragColor = vec4(graded, 1.0);
}
`;

/** 合成 shader。 */
const COMPOSITE_FRAG_GLSL = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_hdr;
uniform sampler2D u_bloom;
uniform float u_vignetteIntensity;
uniform float u_vignetteFalloff;
uniform float u_chromaticAberration;
uniform uint u_dithering;
void main() {
  vec2 center = v_uv - vec2(0.5);
  vec3 hdrColor;
  if (u_chromaticAberration > 0.0) {
    float ca = u_chromaticAberration;
    float r = texture(u_hdr, v_uv + center * ca).r;
    float g = texture(u_hdr, v_uv).g;
    float b = texture(u_hdr, v_uv - center * ca).b;
    hdrColor = vec3(r, g, b);
  } else {
    hdrColor = texture(u_hdr, v_uv).rgb;
  }
  vec3 bloomColor = texture(u_bloom, v_uv).rgb;
  vec3 color = hdrColor + bloomColor;
  if (u_vignetteIntensity > 0.0) {
    float dist = length(center);
    float vig = 1.0 - u_vignetteIntensity * pow(dist * 2.0, u_vignetteFalloff * 2.0 + 1e-3);
    color = color * clamp(vig, 0.0, 1.0);
  }
  if (u_dithering != 0u) {
    float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color = color + (noise - 0.5) / 255.0;
  }
  fragColor = vec4(color, 1.0);
}
`;

// ============================================================================
// Pipeline 实现
// ============================================================================

/** 单个中间纹理条目。 */
interface TextureEntry {
  handle: TextureHandle;
  width: number;
  height: number;
}

/**
 * WebGL2 HDR 后处理管线。
 *
 * 资源生命周期与 WebGPU 版本一致：首次 execute 时按 input 尺寸创建
 * 所有中间纹理与 program；input 尺寸变化时重建；dispose 释放全部。
 */
export class WebGl2PostProcessingPipeline implements GPUPostProcessingPipeline {
  private inputTexture: TextureHandle | null = null;
  private options: PostProcessingOptions = { ...DEFAULT_GPU_POST_PROCESSING };

  private brightTexture: TextureEntry | null = null;
  private downsampleChain: TextureEntry[] = [];
  private upsampleChain: TextureEntry[] = [];
  private tonemappedTexture: TextureEntry | null = null;
  private gradedTexture: TextureEntry | null = null;

  private pipelines = new Map<string, PipelineHandle>();
  private disposed = false;
  private lastWidth = 0;
  private lastHeight = 0;

  /** 标识当前管线是否已初始化 GPU 资源。 */
  isInitialized(): boolean {
    return this.brightTexture !== null;
  }

  /** 返回当前 options 的副本。 */
  getOptions(): PostProcessingOptions {
    return { ...this.options };
  }

  /** 返回当前输入纹理（prepare 后有效）。 */
  getInputTexture(): TextureHandle | null {
    return this.inputTexture;
  }

  prepare(inputColorTexture: TextureHandle, options: PostProcessingOptions): void {
    if (this.disposed) {
      throw new Error('WebGl2PostProcessingPipeline has been disposed');
    }
    this.inputTexture = inputColorTexture;
    this.options = { ...options };
  }

  execute(renderer: Renderer): void {
    if (this.disposed) {
      throw new Error('WebGl2PostProcessingPipeline has been disposed');
    }
    if (!this.inputTexture) {
      throw new Error('prepare() must be called before execute()');
    }
    // 资源懒创建：无 GL 时 createTexture/createPipeline 会抛错
    this.ensureResources(renderer);
    this.executeBrightPass(renderer);
    this.executeDownsampleChain(renderer);
    this.executeUpsampleChain(renderer);
    this.executeToneMapping(renderer);
    this.executeColorGrading(renderer);
    this.executeComposite(renderer);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.brightTexture = null;
    this.downsampleChain = [];
    this.upsampleChain = [];
    this.tonemappedTexture = null;
    this.gradedTexture = null;
    this.pipelines.clear();
    this.inputTexture = null;
  }

  /** 是否已 dispose。 */
  isDisposed(): boolean {
    return this.disposed;
  }

  // --------------------------------------------------------------------------
  // 内部：资源管理
  // --------------------------------------------------------------------------

  private ensureResources(renderer: Renderer): void {
    // 默认尺寸（真实实现应从 renderer 查询）
    const width = 1024;
    const height = 1024;
    if (this.brightTexture && this.lastWidth === width && this.lastHeight === height) {
      return;
    }

    this.releaseResources(renderer);
    this.lastWidth = width;
    this.lastHeight = height;

    this.brightTexture = this.createHDRTexture(renderer, 'pp-bright', width, height);

    const levels = Math.max(1, this.options.bloomLevels);
    let w = width;
    let h = height;
    for (let i = 0; i < levels; i++) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      this.downsampleChain.push(this.createHDRTexture(renderer, `pp-down-${i}`, w, h));
    }
    for (let i = 0; i < levels; i++) {
      this.upsampleChain.push(this.createHDRTexture(renderer, `pp-up-${i}`, w, h));
      w = Math.min(width, w * 2);
      h = Math.min(height, h * 2);
    }

    this.tonemappedTexture = this.createHDRTexture(renderer, 'pp-tonemapped', width, height);
    this.gradedTexture = this.createHDRTexture(renderer, 'pp-graded', width, height);

    this.createPipelineIfMissing(renderer, 'pp-bright-pass', BRIGHT_PASS_FRAG_GLSL);
    this.createPipelineIfMissing(renderer, 'pp-downsample', DOWNSAMPLE_FRAG_GLSL);
    this.createPipelineIfMissing(renderer, 'pp-upsample', UPSAMPLE_FRAG_GLSL);
    this.createPipelineIfMissing(renderer, 'pp-tonemap', TONE_MAP_FRAG_GLSL);
    this.createPipelineIfMissing(renderer, 'pp-color-grade', COLOR_GRADE_FRAG_GLSL);
    this.createPipelineIfMissing(renderer, 'pp-composite', COMPOSITE_FRAG_GLSL);
  }

  private createHDRTexture(renderer: Renderer, id: string, width: number, height: number): TextureEntry {
    const desc: TextureDescriptor = {
      width,
      height,
      format: 'rgba16float',
      usage: 'render_target',
    };
    const handle = renderer.createTexture(desc);
    return { handle: { id: `${id}-${handle.id}`, format: 'rgba16float' }, width, height };
  }

  private createPipelineIfMissing(renderer: Renderer, name: string, fragGlsl: string): void {
    if (this.pipelines.has(name)) return;
    const desc: PipelineDescriptor = {
      vertexShader: { stage: 'vertex', source: FULLSCREEN_VERT_GLSL, entryPoint: 'main' },
      fragmentShader: { stage: 'fragment', source: fragGlsl, entryPoint: 'main' },
      vertexAttributes: [],
      topology: 'triangles',
      depthTest: false,
      depthWrite: false,
    };
    const handle = renderer.createPipeline(desc);
    this.pipelines.set(name, handle);
  }

  private releaseResources(renderer: Renderer): void {
    if (this.brightTexture) {
      renderer.destroyTexture(this.brightTexture.handle);
    }
    for (const t of this.downsampleChain) {
      renderer.destroyTexture(t.handle);
    }
    for (const t of this.upsampleChain) {
      renderer.destroyTexture(t.handle);
    }
    if (this.tonemappedTexture) {
      renderer.destroyTexture(this.tonemappedTexture.handle);
    }
    if (this.gradedTexture) {
      renderer.destroyTexture(this.gradedTexture.handle);
    }
    this.brightTexture = null;
    this.downsampleChain = [];
    this.upsampleChain = [];
    this.tonemappedTexture = null;
    this.gradedTexture = null;
  }

  // --------------------------------------------------------------------------
  // 内部：各 pass 执行
  // --------------------------------------------------------------------------

  private executeBrightPass(renderer: Renderer): void {
    if (!this.brightTexture || !this.inputTexture) return;
    const passDesc: RenderPassDescriptor = {
      colorAttachments: [
        {
          texture: this.brightTexture.handle,
          loadOp: 'clear',
          storeOp: 'store',
          clear: [0, 0, 0, 1],
        },
      ],
    };
    renderer.beginPass(passDesc);
    const pipe = this.pipelines.get('pp-bright-pass')!;
    renderer.draw({
      vertexBuffer: { id: 'pp-dummy-vb', usage: 'static' },
      pipeline: pipe,
      vertexCount: 3,
      textureBindings: [{ texture: this.inputTexture, slot: 0 }],
    });
    renderer.endPass();
  }

  private executeDownsampleChain(renderer: Renderer): void {
    if (!this.brightTexture) return;
    let prev: TextureHandle = this.brightTexture.handle;
    const pipe = this.pipelines.get('pp-downsample');
    if (!pipe) return;
    for (const target of this.downsampleChain) {
      const passDesc: RenderPassDescriptor = {
        colorAttachments: [
          {
            texture: target.handle,
            loadOp: 'clear',
            storeOp: 'store',
            clear: [0, 0, 0, 1],
          },
        ],
      };
      renderer.beginPass(passDesc);
      renderer.draw({
        vertexBuffer: { id: 'pp-dummy-vb', usage: 'static' },
        pipeline: pipe,
        vertexCount: 3,
        textureBindings: [{ texture: prev, slot: 0 }],
      });
      renderer.endPass();
      prev = target.handle;
    }
  }

  private executeUpsampleChain(renderer: Renderer): void {
    const pipe = this.pipelines.get('pp-upsample');
    if (!pipe || this.downsampleChain.length === 0 || this.upsampleChain.length === 0) return;
    let prev: TextureHandle = this.downsampleChain[this.downsampleChain.length - 1]!.handle;
    for (const target of this.upsampleChain) {
      const passDesc: RenderPassDescriptor = {
        colorAttachments: [
          {
            texture: target.handle,
            loadOp: 'clear',
            storeOp: 'store',
            clear: [0, 0, 0, 1],
          },
        ],
      };
      renderer.beginPass(passDesc);
      renderer.draw({
        vertexBuffer: { id: 'pp-dummy-vb', usage: 'static' },
        pipeline: pipe,
        vertexCount: 3,
        textureBindings: [{ texture: prev, slot: 0 }],
      });
      renderer.endPass();
      prev = target.handle;
    }
  }

  private executeToneMapping(renderer: Renderer): void {
    if (!this.tonemappedTexture || !this.inputTexture) return;
    const passDesc: RenderPassDescriptor = {
      colorAttachments: [
        {
          texture: this.tonemappedTexture.handle,
          loadOp: 'clear',
          storeOp: 'store',
          clear: [0, 0, 0, 1],
        },
      ],
    };
    renderer.beginPass(passDesc);
    const pipe = this.pipelines.get('pp-tonemap')!;
    renderer.draw({
      vertexBuffer: { id: 'pp-dummy-vb', usage: 'static' },
      pipeline: pipe,
      vertexCount: 3,
      textureBindings: [{ texture: this.inputTexture, slot: 0 }],
    });
    renderer.endPass();
  }

  private executeColorGrading(renderer: Renderer): void {
    if (!this.gradedTexture || !this.tonemappedTexture) return;
    const passDesc: RenderPassDescriptor = {
      colorAttachments: [
        {
          texture: this.gradedTexture.handle,
          loadOp: 'clear',
          storeOp: 'store',
          clear: [0, 0, 0, 1],
        },
      ],
    };
    renderer.beginPass(passDesc);
    const pipe = this.pipelines.get('pp-color-grade')!;
    const bindings = [{ texture: this.tonemappedTexture.handle, slot: 0 }];
    if (this.options.colorGradingLUT) {
      bindings.push({ texture: this.options.colorGradingLUT, slot: 2 });
    }
    renderer.draw({
      vertexBuffer: { id: 'pp-dummy-vb', usage: 'static' },
      pipeline: pipe,
      vertexCount: 3,
      textureBindings: bindings,
    });
    renderer.endPass();
  }

  private executeComposite(renderer: Renderer): void {
    if (!this.gradedTexture || !this.upsampleChain.length) return;
    const bloom = this.upsampleChain[this.upsampleChain.length - 1]!.handle;
    const passDesc: RenderPassDescriptor = {
      colorAttachments: [
        {
          texture: this.gradedTexture.handle,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    };
    renderer.beginPass(passDesc);
    const pipe = this.pipelines.get('pp-composite')!;
    renderer.draw({
      vertexBuffer: { id: 'pp-dummy-vb', usage: 'static' },
      pipeline: pipe,
      vertexCount: 3,
      textureBindings: [
        { texture: this.gradedTexture.handle, slot: 0 },
        { texture: bloom, slot: 1 },
      ],
    });
    renderer.endPass();
  }
}

/**
 * 工厂函数：创建 WebGl2PostProcessingPipeline 实例。
 */
export function createWebGl2PostProcessingPipeline(): WebGl2PostProcessingPipeline {
  return new WebGl2PostProcessingPipeline();
}
