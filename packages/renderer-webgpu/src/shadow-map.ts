/**
 * WebGPU Shadow Map 渲染通道实现（任务 10 / E-07）。
 *
 * 实现真正的 GPU 深度纹理渲染：
 * - prepare：计算光源视图矩阵 + 正交投影矩阵，创建/复用深度纹理
 * - execute：以光源视角渲染场景到深度纹理（仅深度写入）
 * - getShadowMapTexture：返回深度纹理供场景渲染时 PCF 采样
 *
 * PCF 采样由场景渲染器的 fragment shader 完成（读取 shadow map 纹理）。
 * 此处提供 WGSL shadow-aware 场景渲染 shader 源码常量供调用方使用。
 */

import {
  type ShadowMapPass,
  type ShadowMapOptions,
  type BoundingBox,
  type Renderer,
  type TextureHandle,
  type TextureDescriptor,
  type RenderPassDescriptor,
  DEFAULT_SHADOW_MAP_OPTIONS,
} from '@solar-system/renderer-core';
import type { Vec3d } from '@solar-system/schemas';

// ============================================================================
// WGSL Shader 源码
// ============================================================================

/**
 * 场景渲染时使用的 shadow-aware fragment shader 片段（PCF 采样）。
 * 调用方可将此片段嵌入到自己的场景 shader 中。
 */
export const SHADOW_PCF_WGSL = `
fn sampleShadowPCF(
  shadowMap: texture_2d<f32>,
  samp: sampler,
  uv: vec2<f32>,
  depth: f32,
  texelSize: vec2<f32>,
  kernelSize: i32,
  bias: f32,
) -> f32 {
  if (kernelSize <= 1) {
    let sd = textureSample(shadowMap, samp, uv).r;
    return select(0.0, 1.0, sd > depth + bias);
  }
  let half = kernelSize / 2;
  var visible = 0.0;
  var total = 0.0;
  for (var dy = -half; dy <= half; dy = dy + 1) {
    for (var dx = -half; dx <= half; dx = dx + 1) {
      let offset = vec2<f32>(f32(dx), f32(dy)) * texelSize;
      let sd = textureSample(shadowMap, samp, uv + offset).r;
      if (sd > depth + bias) {
        visible = visible + 1.0;
      }
      total = total + 1.0;
    }
  }
  return select(1.0, visible / total, total > 0.0);
}
`;

// ============================================================================
// ShadowMapPass 实现
// ============================================================================

/**
 * WebGPU shadow map 渲染通道。
 *
 * 资源生命周期：
 * - 首次 prepare 时按 resolution 创建深度纹理
 * - resolution 变化时重建深度纹理
 * - dispose 释放 GPU 资源
 */
export class WebGpuShadowMapPass implements ShadowMapPass {
  private lightDirection: Vec3d = { x: 0, y: -1, z: 0 };
  private shadowCastBounds: BoundingBox = {
    min: { x: -1, y: -1, z: -1 },
    max: { x: 1, y: 1, z: 1 },
  };
  private options: ShadowMapOptions = { ...DEFAULT_SHADOW_MAP_OPTIONS };

  private depthTexture: TextureHandle | null = null;
  private lastResolution = 0;
  private disposed = false;

  /** 光源视图矩阵（行主序，4×4）。 */
  private lightViewMatrix: number[] = new Array(16).fill(0);
  /** 光源投影矩阵（行主序，4×4，正交投影）。 */
  private lightProjMatrix: number[] = new Array(16).fill(0);

  /** 标识当前通道是否已初始化 GPU 资源。 */
  isInitialized(): boolean {
    return this.depthTexture !== null;
  }

  /** 返回光源视图矩阵。 */
  getLightViewMatrix(): number[] {
    return [...this.lightViewMatrix];
  }

  /** 返回光源投影矩阵。 */
  getLightProjMatrix(): number[] {
    return [...this.lightProjMatrix];
  }

  /** 返回当前选项的副本。 */
  getOptions(): ShadowMapOptions {
    return { ...this.options };
  }

  prepare(
    lightDirection: Vec3d,
    shadowCastBounds: BoundingBox,
    options: ShadowMapOptions,
  ): void {
    if (this.disposed) {
      throw new Error('WebGpuShadowMapPass has been disposed');
    }
    this.lightDirection = { ...lightDirection };
    this.shadowCastBounds = {
      min: { ...shadowCastBounds.min },
      max: { ...shadowCastBounds.max },
    };
    this.options = { ...options };
    this.computeLightMatrices();
  }

  execute(renderer: Renderer, sceneDrawFn: () => void): void {
    if (this.disposed) {
      throw new Error('WebGpuShadowMapPass has been disposed');
    }
    // 确保深度纹理存在
    this.ensureDepthTexture(renderer);

    // 开始 shadow map render pass：仅深度附件，无颜色
    if (!this.depthTexture) return;
    const passDesc: RenderPassDescriptor = {
      colorAttachments: [],
      depthStencilAttachment: {
        texture: this.depthTexture,
        depthClear: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    renderer.beginPass(passDesc);
    try {
      // 调用方提供的场景绘制函数；调用方应使用 lightViewMatrix/lightProjMatrix
      // 作为本次渲染的 VP。仅写入深度，不写颜色。
      sceneDrawFn();
    } finally {
      renderer.endPass();
    }
  }

  getShadowMapTexture(): TextureHandle {
    if (!this.depthTexture) {
      throw new Error('Shadow map not prepared; call prepare() first');
    }
    return this.depthTexture;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.depthTexture = null;
  }

  /** 是否已 dispose。 */
  isDisposed(): boolean {
    return this.disposed;
  }

  // --------------------------------------------------------------------------
  // 内部
  // --------------------------------------------------------------------------

  /** 计算光源视图矩阵 + 正交投影矩阵。 */
  private computeLightMatrices(): void {
    // 光源方向归一化
    const dir = this.lightDirection;
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    const nx = len > 1e-10 ? dir.x / len : 0;
    const ny = len > 1e-10 ? dir.y / len : -1;
    const nz = len > 1e-10 ? dir.z / len : 0;

    // 光源位置：从包围盒中心沿反方向退足够远
    const cx = (this.shadowCastBounds.min.x + this.shadowCastBounds.max.x) / 2;
    const cy = (this.shadowCastBounds.min.y + this.shadowCastBounds.max.y) / 2;
    const cz = (this.shadowCastBounds.min.z + this.shadowCastBounds.max.z) / 2;
    const dx = this.shadowCastBounds.max.x - this.shadowCastBounds.min.x;
    const dy = this.shadowCastBounds.max.y - this.shadowCastBounds.min.y;
    const dz = this.shadowCastBounds.max.z - this.shadowCastBounds.min.z;
    const radius = Math.max(dx, dy, dz) / 2;
    const lightPos = { x: cx - nx * radius * 2, y: cy - ny * radius * 2, z: cz - nz * radius * 2 };

    // lookAt(lightPos, center, up)
    // forward = normalize(center - lightPos) = (nx, ny, nz)
    // up 选择 (0,1,0) 或 (0,0,1) 防止与 forward 平行
    const upY = Math.abs(ny) < 0.99 ? 1 : 0;
    const upZ = upY === 0 ? 1 : 0;
    // right = normalize(cross(forward, up))
    const rx = ny * upZ - nz * upY;
    const ry = nz * upY - nx * upZ;
    const rz = nx * upY - ny * upZ;
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const rnx = rLen > 1e-10 ? rx / rLen : 1;
    const rny = rLen > 1e-10 ? ry / rLen : 0;
    const rnz = rLen > 1e-10 ? rz / rLen : 0;
    // realUp = cross(right, forward)
    const ux = rny * nz - rnz * ny;
    const uy = rnz * nx - rnx * nz;
    const uz = rnx * ny - rny * nx;

    // View matrix (row-major)
    this.lightViewMatrix = [
      rnx, rny, rnz, -(rnx * lightPos.x + rny * lightPos.y + rnz * lightPos.z),
      ux, uy, uz, -(ux * lightPos.x + uy * lightPos.y + uz * lightPos.z),
      -nx, -ny, -nz, (nx * lightPos.x + ny * lightPos.y + nz * lightPos.z),
      0, 0, 0, 1,
    ];

    // Orthographic projection (row-major)
    const orthoSize = radius;
    const near = 0.1;
    const far = radius * 4;
    const l = -orthoSize, r = orthoSize, b = -orthoSize, t = orthoSize, n = near, f = far;
    this.lightProjMatrix = [
      2 / (r - l), 0, 0, -(r + l) / (r - l),
      0, 2 / (t - b), 0, -(t + b) / (t - b),
      0, 0, -2 / (f - n), -(f + n) / (f - n),
      0, 0, 0, 1,
    ];
  }

  private ensureDepthTexture(renderer: Renderer): void {
    const res = this.options.resolution;
    if (this.depthTexture && this.lastResolution === res) return;

    if (this.depthTexture) {
      renderer.destroyTexture(this.depthTexture);
      this.depthTexture = null;
    }

    const desc: TextureDescriptor = {
      width: res,
      height: res,
      format: 'depth32float',
      usage: 'render_target',
    };
    this.depthTexture = renderer.createTexture(desc);
    this.lastResolution = res;
  }
}

/**
 * 工厂函数：创建 WebGpuShadowMapPass 实例。
 */
export function createWebGpuShadowMapPass(): WebGpuShadowMapPass {
  return new WebGpuShadowMapPass();
}
