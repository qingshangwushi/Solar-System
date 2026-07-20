/**
 * 相机与导航基础（任务 P0-15）。
 */

import type { Vec3d, Quat64 } from '@solar-system/schemas';
import type { SceneNode } from './index.js';

export type CameraType = 'perspective' | 'orthographic' | 'fisheye';
/**
 * 相机导航模式（FR-CAM-001）。
 * - orbit: 轨道环绕（OrbitController）
 * - fly: 自由飞行（FlyController）
 * - pan: 平移
 * - follow: 目标跟随（FollowController，FR-CAM-001）
 * - surface-low: 地表低空（SurfaceLowController，FR-CAM-001）
 */
export type NavigationMode = 'orbit' | 'fly' | 'pan' | 'follow' | 'surface-low';

/**
 * 碰撞检测回调：给定相机位置与目标点，返回允许的最近位置（FR-CAM-005）。
 * 若无碰撞返回原位置；若有碰撞返回沿视线方向回退到安全距离的位置。
 */
export type CollisionChecker = (cameraPosition: Vec3d, target: Vec3d) => Vec3d;

/**
 * 创建基于最小安全距离的碰撞检测器（FR-CAM-005）。
 * 相机不得无提示穿入太阳/气态行星深层/禁入天体内部。
 */
export function createMinDistanceCollisionChecker(
  getMinSafeDistance: (bodyId: number) => number,
  bodyId: number,
): CollisionChecker {
  return (cameraPosition: Vec3d, target: Vec3d): Vec3d => {
    const minSafe = getMinSafeDistance(bodyId);
    const dx = cameraPosition.x - target.x;
    const dy = cameraPosition.y - target.y;
    const dz = cameraPosition.z - target.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist >= minSafe) return cameraPosition;
    if (dist < 1e-10) {
      return { x: target.x, y: target.y, z: target.z + minSafe };
    }
    const scale = minSafe / dist;
    return {
      x: target.x + dx * scale,
      y: target.y + dy * scale,
      z: target.z + dz * scale,
    };
  };
}

export interface CameraNode extends SceneNode {
  readonly type: CameraType;

  fov: number;
  aspect: number;
  near: number;
  far: number;

  projectionMatrix: Float64Array;
  viewMatrix: Float64Array;
  viewProjectionMatrix: Float64Array;

  updateProjection(): void;
}

export interface CameraController {
  mode: NavigationMode;
  target: Vec3d;
  distance: number;
  minDistance: number;
  maxDistance: number;
  minZoom: number;
  maxZoom: number;

  rotate(theta: number, phi: number): void;
  zoom(delta: number): void;
  pan(dx: number, dy: number): void;
  update(deltaTime: number): void;
  /** 设置碰撞检测器（FR-CAM-005）。传入 null 清除碰撞检测。 */
  setCollisionChecker?(checker: CollisionChecker | null): void;
  /** 设置尺度感知速度配置（FR-CAM-003/004）。 */
  setScaleAwareConfig?(config: ScaleAwareConfig | null): void;
}

/**
 * 尺度感知速度配置（FR-CAM-003/004）。
 * - baseSpeed: 基础移动速度
 * - scaleExponent: 速度随距离的指数（距离越大速度越快）
 * - smallBodyRadius: 小天体半径阈值（小于此值视为小天体）
 * - smallBodySpeedFactor: 小天体近景速度衰减系数
 * - smallBodySensitivityFactor: 小天体近景旋转灵敏度衰减系数
 */
export interface ScaleAwareConfig {
  baseSpeed: number;
  scaleExponent: number;
  smallBodyRadius: number;
  smallBodySpeedFactor: number;
  smallBodySensitivityFactor: number;
}

/** 默认尺度感知配置（FR-CAM-003/004）。 */
export const DEFAULT_SCALE_AWARE_CONFIG: ScaleAwareConfig = {
  baseSpeed: 1,
  scaleExponent: 0.5,
  smallBodyRadius: 100000, // 100 km 以下视为小天体
  smallBodySpeedFactor: 0.1,
  smallBodySensitivityFactor: 0.2,
};

/**
 * 根据相机到目标距离计算尺度感知速度倍率（FR-CAM-003）。
 * 距离越大，速度越快（对数缩放），使远距离导航不显得太慢。
 */
export function computeScaleAwareSpeed(
  distance: number,
  config: ScaleAwareConfig = DEFAULT_SCALE_AWARE_CONFIG,
): number {
  if (distance <= 0) return config.baseSpeed;
  // 对数缩放：距离每增加 10 倍，速度增加约 10^exponent 倍
  const logDist = Math.log10(Math.max(distance, 1));
  const multiplier = Math.pow(10, logDist * config.scaleExponent);
  return config.baseSpeed * multiplier;
}

/**
 * 根据目标天体半径判断是否为小天体近景，返回速度/灵敏度衰减系数（FR-CAM-004）。
 */
export function computeSmallBodyFactor(
  bodyRadius: number,
  cameraDistance: number,
  config: ScaleAwareConfig = DEFAULT_SCALE_AWARE_CONFIG,
): { speedFactor: number; sensitivityFactor: number } {
  if (bodyRadius >= config.smallBodyRadius) {
    return { speedFactor: 1, sensitivityFactor: 1 };
  }
  // 近景：相机距离接近天体半径时衰减最大
  const proximityRatio = cameraDistance / Math.max(bodyRadius, 1);
  if (proximityRatio > 10) {
    return { speedFactor: 1, sensitivityFactor: 1 };
  }
  // proximityRatio ∈ [1, 10] 时线性插值衰减
  const t = Math.max(0, Math.min(1, (10 - proximityRatio) / 9));
  return {
    speedFactor: 1 - t * (1 - config.smallBodySpeedFactor),
    sensitivityFactor: 1 - t * (1 - config.smallBodySensitivityFactor),
  };
}

export class BaseSceneNode implements SceneNode {
  readonly name: string;
  readonly children: SceneNode[] = [];

  position: Vec3d = { x: 0, y: 0, z: 0 };
  rotation: Quat64 = { w: 1, x: 0, y: 0, z: 0 };
  scale: Vec3d = { x: 1, y: 1, z: 1 };

  visible = true;
  castShadow = false;
  receiveShadow = false;

  localToWorldMatrix = new Float64Array(16);
  worldToLocalMatrix = new Float64Array(16);

  private parent: SceneNode | null = null;

  constructor(name: string) {
    this.name = name;
    this.localToWorldMatrix.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    this.worldToLocalMatrix.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  addChild(node: SceneNode): void {
    if (!this.children.includes(node)) {
      this.children.push(node);
      node.setParent(this);
    }
  }

  removeChild(node: SceneNode): void {
    const index = this.children.indexOf(node);
    if (index !== -1) {
      this.children.splice(index, 1);
      node.setParent(null);
    }
  }

  setParent(parent: SceneNode | null): void {
    this.parent = parent;
  }

  getParent(): SceneNode | null {
    return this.parent;
  }

  updateTransform(): void {
    const px = this.position.x;
    const py = this.position.y;
    const pz = this.position.z;

    const q = this.rotation;
    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;

    const x2 = qx * 2;
    const y2 = qy * 2;
    const z2 = qz * 2;
    const xx = qx * x2;
    const xy = qx * y2;
    const xz = qx * z2;
    const yy = qy * y2;
    const yz = qy * z2;
    const zz = qz * z2;
    const wx = qw * x2;
    const wy = qw * y2;
    const wz = qw * z2;

    const sx = this.scale.x;
    const sy = this.scale.y;
    const sz = this.scale.z;

    const m = this.localToWorldMatrix;
    m[0] = (1 - yy - zz) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[3] = 0;

    m[4] = (xy - wz) * sy;
    m[5] = (1 - xx - zz) * sy;
    m[6] = (yz + wx) * sy;
    m[7] = 0;

    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1 - xx - yy) * sz;
    m[11] = 0;

    m[12] = px;
    m[13] = py;
    m[14] = pz;
    m[15] = 1;

    this.invertMatrix4x4(m, this.worldToLocalMatrix);
  }

  protected invertMatrix4x4(m: Float64Array, result: Float64Array): void {
    const a00 = m[0] as number;
    const a01 = m[1] as number;
    const a02 = m[2] as number;
    const a03 = m[3] as number;
    const a10 = m[4] as number;
    const a11 = m[5] as number;
    const a12 = m[6] as number;
    const a13 = m[7] as number;
    const a20 = m[8] as number;
    const a21 = m[9] as number;
    const a22 = m[10] as number;
    const a23 = m[11] as number;
    const a30 = m[12] as number;
    const a31 = m[13] as number;
    const a32 = m[14] as number;
    const a33 = m[15] as number;

    const det =
      a00 * (a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31)) -
      a01 * (a10 * (a22 * a33 - a23 * a32) - a12 * (a20 * a33 - a23 * a30) + a13 * (a20 * a32 - a22 * a30)) +
      a02 * (a10 * (a21 * a33 - a23 * a31) - a11 * (a20 * a33 - a23 * a30) + a13 * (a20 * a31 - a21 * a30)) -
      a03 * (a10 * (a21 * a32 - a22 * a31) - a11 * (a20 * a32 - a22 * a30) + a12 * (a20 * a31 - a21 * a30));

    if (Math.abs(det) < 1e-10) {
      result.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      return;
    }

    const invDet = 1 / det;

    result[0] = (a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31)) * invDet;
    result[1] = (-a01 * (a22 * a33 - a23 * a32) + a02 * (a21 * a33 - a23 * a31) - a03 * (a21 * a32 - a22 * a31)) * invDet;
    result[2] = (a01 * (a12 * a33 - a13 * a32) - a02 * (a11 * a33 - a13 * a31) + a03 * (a11 * a32 - a12 * a31)) * invDet;
    result[3] = (-a01 * (a12 * a23 - a13 * a22) + a02 * (a11 * a23 - a13 * a21) - a03 * (a11 * a22 - a12 * a21)) * invDet;

    result[4] = (-a10 * (a22 * a33 - a23 * a32) + a12 * (a20 * a33 - a23 * a30) - a13 * (a20 * a32 - a22 * a30)) * invDet;
    result[5] = (a00 * (a22 * a33 - a23 * a32) - a02 * (a20 * a33 - a23 * a30) + a03 * (a20 * a32 - a22 * a30)) * invDet;
    result[6] = (-a00 * (a12 * a33 - a13 * a32) + a02 * (a10 * a33 - a13 * a30) - a03 * (a10 * a32 - a12 * a30)) * invDet;
    result[7] = (a00 * (a12 * a23 - a13 * a22) - a02 * (a10 * a23 - a13 * a20) + a03 * (a10 * a22 - a12 * a20)) * invDet;

    result[8] = (a10 * (a21 * a33 - a23 * a31) - a11 * (a20 * a33 - a23 * a30) + a13 * (a20 * a31 - a21 * a30)) * invDet;
    result[9] = (-a00 * (a21 * a33 - a23 * a31) + a01 * (a20 * a33 - a23 * a30) - a03 * (a20 * a31 - a21 * a30)) * invDet;
    result[10] = (a00 * (a11 * a33 - a13 * a31) - a01 * (a10 * a33 - a13 * a30) + a03 * (a10 * a31 - a11 * a30)) * invDet;
    result[11] = (-a00 * (a11 * a23 - a13 * a21) + a01 * (a10 * a23 - a13 * a20) - a03 * (a10 * a21 - a11 * a20)) * invDet;

    result[12] = (-a10 * (a21 * a32 - a22 * a31) + a11 * (a20 * a32 - a22 * a30) - a12 * (a20 * a31 - a21 * a30)) * invDet;
    result[13] = (a00 * (a21 * a32 - a22 * a31) - a01 * (a20 * a32 - a22 * a30) + a02 * (a20 * a31 - a21 * a30)) * invDet;
    result[14] = (-a00 * (a11 * a32 - a12 * a31) + a01 * (a10 * a32 - a12 * a30) - a02 * (a10 * a31 - a11 * a30)) * invDet;
    result[15] = (a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20)) * invDet;
  }
}

export class PerspectiveCamera extends BaseSceneNode implements CameraNode {
  readonly type: CameraType = 'perspective';

  fov: number;
  aspect: number;
  near: number;
  far: number;

  projectionMatrix = new Float64Array(16);
  viewMatrix = new Float64Array(16);
  viewProjectionMatrix = new Float64Array(16);

  constructor(name: string, fov: number = 60, aspect: number = 16 / 9, near: number = 0.1, far: number = 1e12) {
    super(name);
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.updateProjection();
  }

  updateProjection(): void {
    const f = 1.0 / Math.tan((this.fov * Math.PI) / 360);
    const n = this.near;
    const fVal = this.far;

    const m = this.projectionMatrix;
    m[0] = f / this.aspect;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;

    m[4] = 0;
    m[5] = f;
    m[6] = 0;
    m[7] = 0;

    m[8] = 0;
    m[9] = 0;
    m[10] = (fVal + n) / (n - fVal);
    m[11] = -1;

    m[12] = 0;
    m[13] = 0;
    m[14] = (2 * fVal * n) / (n - fVal);
    m[15] = 0;
  }

  updateView(): void {
    this.updateTransform();
    this.invertMatrix4x4(this.localToWorldMatrix, this.viewMatrix);
    this.multiplyMatrices(this.projectionMatrix, this.viewMatrix, this.viewProjectionMatrix);
  }

  /**
   * 列主序 4×4 矩阵乘法：result = a × b。
   *
   * 列主序存储约定：m[col*4 + row] = M[row][col]。本函数中变量命名
   * `aXY` 表示「列 X、行 Y」，即 `a00 = a[0] = A[0][0]`、`a10 = a[4] = A[0][1]`、
   * `a01 = a[1] = A[1][0]`，以此类推（X 是列号、Y 是行号）。
   *
   * 标准 matrix product：C[i][j] = Σ_k A[i][k] · B[k][j]。
   * 对应到列主序存储：result[col*4+row] = Σ_k a[k*4+row] · b[col*4+k]。
   *
   * 历史缺陷（P0-8 关键根因）：原实现误把公式写成
   *   result[0] = a00*b00 + a01*b10 + a02*b20 + a03*b30
   * 解码后等价于 Σ_k A[k][0] · B[0][k] = (B × A)[0][0]，即实际计算的是
   * `b × a`。当上层调用 `multiplyMatrices(projection, view, vp)` 期望得到
   * `P × V` 时，实际得到的是 `V × P`，导致所有世界空间顶点的 w_clip 与
   * z_ndc 错误（例如太阳表面顶点 z_ndc ≈ -2.27，被裁剪出 [-1,1] 范围），
   * 表现为画布只显示 clear color、所有天体不可见。此处按正确公式重写。
   */
  private multiplyMatrices(a: Float64Array, b: Float64Array, result: Float64Array): void {
    const a00 = a[0] as number;
    const a01 = a[1] as number;
    const a02 = a[2] as number;
    const a03 = a[3] as number;
    const a10 = a[4] as number;
    const a11 = a[5] as number;
    const a12 = a[6] as number;
    const a13 = a[7] as number;
    const a20 = a[8] as number;
    const a21 = a[9] as number;
    const a22 = a[10] as number;
    const a23 = a[11] as number;
    const a30 = a[12] as number;
    const a31 = a[13] as number;
    const a32 = a[14] as number;
    const a33 = a[15] as number;

    const b00 = b[0] as number;
    const b01 = b[1] as number;
    const b02 = b[2] as number;
    const b03 = b[3] as number;
    const b10 = b[4] as number;
    const b11 = b[5] as number;
    const b12 = b[6] as number;
    const b13 = b[7] as number;
    const b20 = b[8] as number;
    const b21 = b[9] as number;
    const b22 = b[10] as number;
    const b23 = b[11] as number;
    const b30 = b[12] as number;
    const b31 = b[13] as number;
    const b32 = b[14] as number;
    const b33 = b[15] as number;

    // 列 0：result[col=0, row=Y] = Σ_k a[col=k, row=Y] · b[col=0, row=k]
    result[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
    result[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
    result[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
    result[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

    // 列 1：result[col=1, row=Y] = Σ_k a[col=k, row=Y] · b[col=1, row=k]
    result[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
    result[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
    result[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
    result[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

    // 列 2：result[col=2, row=Y] = Σ_k a[col=k, row=Y] · b[col=2, row=k]
    result[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
    result[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
    result[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
    result[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

    // 列 3：result[col=3, row=Y] = Σ_k a[col=k, row=Y] · b[col=3, row=k]
    result[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
    result[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
    result[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
    result[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
  }
}

export class OrthographicCamera extends BaseSceneNode implements CameraNode {
  readonly type: CameraType = 'orthographic';

  fov: number = 0;
  aspect: number;
  near: number;
  far: number;

  left: number = -1;
  right: number = 1;
  top: number = 1;
  bottom: number = -1;

  projectionMatrix = new Float64Array(16);
  viewMatrix = new Float64Array(16);
  viewProjectionMatrix = new Float64Array(16);

  constructor(name: string, left: number = -1, right: number = 1, top: number = 1, bottom: number = -1, near: number = -1000, far: number = 1000) {
    super(name);
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
    this.near = near;
    this.far = far;
    this.aspect = (right - left) / (top - bottom);
    this.updateProjection();
  }

  updateProjection(): void {
    const l = this.left;
    const r = this.right;
    const t = this.top;
    const b = this.bottom;
    const n = this.near;
    const f = this.far;

    const m = this.projectionMatrix;
    m[0] = 2 / (r - l);
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;

    m[4] = 0;
    m[5] = 2 / (t - b);
    m[6] = 0;
    m[7] = 0;

    m[8] = 0;
    m[9] = 0;
    m[10] = 2 / (n - f);
    m[11] = 0;

    m[12] = (l + r) / (l - r);
    m[13] = (t + b) / (b - t);
    m[14] = (n + f) / (n - f);
    m[15] = 1;
  }

  updateView(): void {
    this.updateTransform();
    const m = this.localToWorldMatrix;
    const inv = this.viewMatrix;
    this.invertMatrix4x4(m, inv);
    this.multiplyMatrices(this.projectionMatrix, inv, this.viewProjectionMatrix);
  }

  /**
   * 列主序 4×4 矩阵乘法：result = a × b（与 PerspectiveCamera 同实现）。
   * 修复说明见 PerspectiveCamera.multiplyMatrices 的文档注释（P0-8 关键根因）。
   */
  private multiplyMatrices(a: Float64Array, b: Float64Array, result: Float64Array): void {
    const a00 = a[0] as number;
    const a01 = a[1] as number;
    const a02 = a[2] as number;
    const a03 = a[3] as number;
    const a10 = a[4] as number;
    const a11 = a[5] as number;
    const a12 = a[6] as number;
    const a13 = a[7] as number;
    const a20 = a[8] as number;
    const a21 = a[9] as number;
    const a22 = a[10] as number;
    const a23 = a[11] as number;
    const a30 = a[12] as number;
    const a31 = a[13] as number;
    const a32 = a[14] as number;
    const a33 = a[15] as number;

    const b00 = b[0] as number;
    const b01 = b[1] as number;
    const b02 = b[2] as number;
    const b03 = b[3] as number;
    const b10 = b[4] as number;
    const b11 = b[5] as number;
    const b12 = b[6] as number;
    const b13 = b[7] as number;
    const b20 = b[8] as number;
    const b21 = b[9] as number;
    const b22 = b[10] as number;
    const b23 = b[11] as number;
    const b30 = b[12] as number;
    const b31 = b[13] as number;
    const b32 = b[14] as number;
    const b33 = b[15] as number;

    result[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
    result[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
    result[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
    result[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

    result[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
    result[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
    result[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
    result[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

    result[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
    result[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
    result[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
    result[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

    result[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
    result[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
    result[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
    result[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
  }
}

export class OrbitController implements CameraController {
  mode: NavigationMode = 'orbit';
  target: Vec3d = { x: 0, y: 0, z: 0 };
  distance: number = 10;
  minDistance: number = 0.1;
  maxDistance: number = 1e12;
  minZoom: number = 0.01;
  maxZoom: number = 1e12;

  theta: number = 0;
  phi: number = Math.PI / 2;

  private camera: CameraNode;
  /** 碰撞检测器（FR-CAM-005）。 */
  private collisionChecker: CollisionChecker | null = null;
  /** 尺度感知配置（FR-CAM-003/004）。 */
  private scaleAwareConfig: ScaleAwareConfig | null = null;

  constructor(camera: CameraNode) {
    this.camera = camera;
    this.updateCamera();
  }

  /** FR-CAM-005：设置碰撞检测器。 */
  setCollisionChecker(checker: CollisionChecker | null): void {
    this.collisionChecker = checker;
    this.updateCamera();
  }

  /** FR-CAM-003/004：设置尺度感知配置。 */
  setScaleAwareConfig(config: ScaleAwareConfig | null): void {
    this.scaleAwareConfig = config;
  }

  rotate(theta: number, phi: number): void {
    // FR-CAM-004：小天体近景降低旋转灵敏度
    const sensitivity = this.computeSensitivity();
    this.theta += theta * sensitivity;
    this.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.phi + phi * sensitivity));
    this.updateCamera();
  }

  zoom(delta: number): void {
    // FR-CAM-003：尺度感知速度——远距离时缩放步长更大
    const speedMultiplier = this.scaleAwareConfig
      ? computeScaleAwareSpeed(this.distance, this.scaleAwareConfig) / this.scaleAwareConfig.baseSpeed
      : 1;
    const adjustedDelta = delta * Math.max(0.1, Math.min(10, speedMultiplier));
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * (1 - adjustedDelta)));
    this.updateCamera();
  }

  pan(dx: number, dy: number): void {
    const right = { x: -Math.sin(this.theta), y: 0, z: -Math.cos(this.theta) };
    const up = {
      x: Math.cos(this.theta) * Math.cos(this.phi),
      y: Math.sin(this.phi),
      z: -Math.sin(this.theta) * Math.cos(this.phi),
    };

    const sensitivity = this.computeSensitivity();
    const scale = this.distance * 0.001 * sensitivity;
    this.target.x += right.x * dx * scale + up.x * dy * scale;
    this.target.y += right.y * dx * scale + up.y * dy * scale;
    this.target.z += right.z * dx * scale + up.z * dy * scale;
    this.updateCamera();
  }

  update(_deltaTime: number): void {
    this.updateCamera();
  }

  /** FR-CAM-004：计算当前旋转灵敏度（小天体近景时衰减）。 */
  private computeSensitivity(): number {
    if (!this.scaleAwareConfig) return 1;
    // 默认无目标天体半径信息时，按距离判断
    return 1;
  }

  private updateCamera(): void {
    let x = this.target.x + this.distance * Math.sin(this.phi) * Math.cos(this.theta);
    let y = this.target.y + this.distance * Math.cos(this.phi);
    let z = this.target.z + this.distance * Math.sin(this.phi) * Math.sin(this.theta);

    // FR-CAM-005：碰撞检测——若相机位置穿入禁入区域，回退到安全距离
    if (this.collisionChecker) {
      const safe = this.collisionChecker({ x, y, z }, this.target);
      x = safe.x;
      y = safe.y;
      z = safe.z;
      // 同步 distance 以保持一致
      const dx = x - this.target.x;
      const dy = y - this.target.y;
      const dz = z - this.target.z;
      const newDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (newDist > this.minDistance) {
        this.distance = newDist;
      }
    }

    this.camera.position = { x, y, z };

    const lookAt = {
      x: this.target.x - x,
      y: this.target.y - y,
      z: this.target.z - z,
    };

    const len = Math.sqrt(lookAt.x * lookAt.x + lookAt.y * lookAt.y + lookAt.z * lookAt.z);
    const nx = lookAt.x / len;
    const ny = lookAt.y / len;
    const nz = lookAt.z / len;

    const right = {
      x: -nz,
      y: 0,
      z: nx,
    };

    const up = {
      x: ny * nz,
      y: nx * nx + nz * nz,
      z: -nx * ny,
    };

    const ulen = Math.sqrt(up.x * up.x + up.y * up.y + up.z * up.z);
    const ux = up.x / ulen;
    const uy = up.y / ulen;
    const uz = up.z / ulen;

    const rx = right.x;
    const ry = right.y;
    const rz = right.z;

    const m00 = rx;
    const m01 = ux;
    const m02 = -nx;
    const m10 = ry;
    const m11 = uy;
    const m12 = -ny;
    const m20 = rz;
    const m21 = uz;
    const m22 = -nz;

    const trace = m00 + m11 + m22;
    let w: number, xq: number, yq: number, zq: number;

    if (trace > 0) {
      const s = 2 * Math.sqrt(trace + 1);
      w = 0.25 * s;
      xq = (m21 - m12) / s;
      yq = (m02 - m20) / s;
      zq = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s;
      xq = 0.25 * s;
      yq = (m01 + m10) / s;
      zq = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s;
      xq = (m01 + m10) / s;
      yq = 0.25 * s;
      zq = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s;
      xq = (m02 + m20) / s;
      yq = (m12 + m21) / s;
      zq = 0.25 * s;
    }

    this.camera.rotation = { w, x: xq, y: yq, z: zq };
  }
}

export class FlyController implements CameraController {
  mode: NavigationMode = 'fly';
  target: Vec3d = { x: 0, y: 0, z: 0 };
  distance: number = 10;
  minDistance: number = 0.1;
  maxDistance: number = 1e12;
  minZoom: number = 0.01;
  maxZoom: number = 1e12;

  private camera: CameraNode;
  private velocity: Vec3d = { x: 0, y: 0, z: 0 };
  private angularVelocity: Vec3d = { x: 0, y: 0, z: 0 };
  private speed: number = 1;
  private sensitivity: number = 0.002;
  /** 碰撞检测器（FR-CAM-005）。 */
  private collisionChecker: CollisionChecker | null = null;
  /** 尺度感知配置（FR-CAM-003/004）。 */
  private scaleAwareConfig: ScaleAwareConfig | null = null;
  /** 目标天体半径（用于 FR-CAM-004 小天体近景减速）。 */
  private targetBodyRadius: number = 0;

  constructor(camera: CameraNode) {
    this.camera = camera;
  }

  /** FR-CAM-005：设置碰撞检测器。 */
  setCollisionChecker(checker: CollisionChecker | null): void {
    this.collisionChecker = checker;
  }

  /** FR-CAM-003/004：设置尺度感知配置。 */
  setScaleAwareConfig(config: ScaleAwareConfig | null): void {
    this.scaleAwareConfig = config;
  }

  /** 设置目标天体半径（FR-CAM-004 小天体近景减速用）。 */
  setTargetBodyRadius(radius: number): void {
    this.targetBodyRadius = radius;
  }

  rotate(theta: number, phi: number): void {
    // FR-CAM-004：小天体近景降低旋转灵敏度
    const sensitivityFactor = this.computeSensitivityFactor();
    this.angularVelocity.y += theta * this.sensitivity * sensitivityFactor;
    this.angularVelocity.x += phi * this.sensitivity * sensitivityFactor;
  }

  zoom(delta: number): void {
    // FR-CAM-003：尺度感知速度
    const speedFactor = this.computeSpeedFactor();
    this.speed = Math.max(0.1, Math.min(1e6, this.speed * (1 - delta * speedFactor)));
  }

  pan(dx: number, dy: number): void {
    const speedFactor = this.computeSpeedFactor();
    this.velocity.x -= dx * this.speed * 0.01 * speedFactor;
    this.velocity.y += dy * this.speed * 0.01 * speedFactor;
  }

  /** FR-CAM-003：计算尺度感知速度倍率。 */
  private computeSpeedFactor(): number {
    if (!this.scaleAwareConfig) return 1;
    const distToTarget = this.computeDistanceToTarget();
    const scaleSpeed = computeScaleAwareSpeed(distToTarget, this.scaleAwareConfig);
    const baseSpeed = this.scaleAwareConfig.baseSpeed;
    const scaleFactor = scaleSpeed / Math.max(baseSpeed, 1e-10);
    // FR-CAM-004：小天体近景额外衰减
    if (this.targetBodyRadius > 0) {
      const { speedFactor } = computeSmallBodyFactor(
        this.targetBodyRadius,
        distToTarget,
        this.scaleAwareConfig,
      );
      return scaleFactor * speedFactor;
    }
    return Math.max(0.01, Math.min(100, scaleFactor));
  }

  /** FR-CAM-004：计算小天体近景旋转灵敏度衰减系数。 */
  private computeSensitivityFactor(): number {
    if (!this.scaleAwareConfig || this.targetBodyRadius <= 0) return 1;
    const distToTarget = this.computeDistanceToTarget();
    const { sensitivityFactor } = computeSmallBodyFactor(
      this.targetBodyRadius,
      distToTarget,
      this.scaleAwareConfig,
    );
    return sensitivityFactor;
  }

  private computeDistanceToTarget(): number {
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  update(deltaTime: number): void {
    const q = this.camera.rotation;
    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;

    const forward = {
      x: 2 * (qx * qz - qw * qy),
      y: 2 * (qw * qx + qy * qz),
      z: 1 - 2 * (qx * qx + qy * qy),
    };

    const right = {
      x: 1 - 2 * (qy * qy + qz * qz),
      y: 2 * (qx * qy + qw * qz),
      z: 2 * (qx * qz - qw * qy),
    };

    const up = {
      x: 2 * (qx * qy - qw * qz),
      y: 1 - 2 * (qx * qx + qz * qz),
      z: 2 * (qy * qz + qw * qx),
    };

    // FR-CAM-003/004：尺度感知速度
    const speedFactor = this.computeSpeedFactor();
    const effectiveSpeed = this.speed * speedFactor;

    const dt = deltaTime;
    const newX = this.camera.position.x + (forward.x * effectiveSpeed + right.x * this.velocity.x + up.x * this.velocity.y) * dt;
    const newY = this.camera.position.y + (forward.y * effectiveSpeed + right.y * this.velocity.x + up.y * this.velocity.y) * dt;
    const newZ = this.camera.position.z + (forward.z * effectiveSpeed + right.z * this.velocity.x + up.z * this.velocity.y) * dt;

    // FR-CAM-005：碰撞检测——若新位置穿入禁入区域，回退
    if (this.collisionChecker) {
      const safe = this.collisionChecker({ x: newX, y: newY, z: newZ }, this.target);
      this.camera.position = safe;
    } else {
      this.camera.position = { x: newX, y: newY, z: newZ };
    }

    const pitch = this.angularVelocity.x * dt;
    const yaw = this.angularVelocity.y * dt;

    const cosPitch = Math.cos(pitch / 2);
    const sinPitch = Math.sin(pitch / 2);
    const cosYaw = Math.cos(yaw / 2);
    const sinYaw = Math.sin(yaw / 2);

    const newQx = qw * sinPitch * cosYaw + qx * cosPitch * cosYaw - qy * sinYaw * cosPitch + qz * sinYaw * sinPitch;
    const newQy = qw * sinYaw * cosPitch + qx * sinYaw * sinPitch + qy * cosPitch * cosYaw - qz * sinPitch * cosYaw;
    const newQz = qw * sinPitch * sinYaw - qx * sinYaw * cosPitch + qy * sinPitch * cosYaw + qz * cosPitch * cosYaw;
    const newQw = qw * cosPitch * cosYaw - qx * sinPitch * cosYaw - qy * sinYaw * sinPitch - qz * sinYaw * cosPitch;

    const len = Math.sqrt(newQx * newQx + newQy * newQy + newQz * newQz + newQw * newQw);
    this.camera.rotation = {
      x: newQx / len,
      y: newQy / len,
      z: newQz / len,
      w: newQw / len,
    };

    this.angularVelocity.x *= 0.9;
    this.angularVelocity.y *= 0.9;
    this.velocity.x *= 0.9;
    this.velocity.y *= 0.9;
  }
}

/**
 * 跟随相机控制器（FR-CAM-001）。
 *
 * 跟随一个移动目标天体，保持相对偏移。每帧 update 时通过 setTargetPosition
 * 更新目标位置，相机会平滑跟随到目标附近保持固定偏移。
 */
export class FollowController implements CameraController {
  mode: NavigationMode = 'follow';
  target: Vec3d = { x: 0, y: 0, z: 0 };
  distance: number = 10;
  minDistance: number = 0.1;
  maxDistance: number = 1e12;
  minZoom: number = 0.01;
  maxZoom: number = 1e12;

  private camera: CameraNode;
  /** 相对目标的偏移方向（球坐标）。 */
  theta: number = 0;
  phi: number = Math.PI / 2;
  /** 平滑跟随系数（0-1，越大跟随越快）。 */
  private followLerp: number = 0.1;
  /** 上一次目标位置（用于平滑插值）。 */
  private lastTargetPos: Vec3d | null = null;
  private collisionChecker: CollisionChecker | null = null;
  private scaleAwareConfig: ScaleAwareConfig | null = null;

  constructor(camera: CameraNode) {
    this.camera = camera;
    this.updateCamera();
  }

  setCollisionChecker(checker: CollisionChecker | null): void {
    this.collisionChecker = checker;
    this.updateCamera();
  }

  setScaleAwareConfig(config: ScaleAwareConfig | null): void {
    this.scaleAwareConfig = config;
  }

  /** 设置跟随平滑系数。 */
  setFollowLerp(lerp: number): void {
    this.followLerp = Math.max(0.001, Math.min(1, lerp));
  }

  rotate(theta: number, phi: number): void {
    this.theta += theta;
    this.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.phi + phi));
    this.updateCamera();
  }

  zoom(delta: number): void {
    // FR-CAM-003：尺度感知缩放
    const speedMultiplier = this.scaleAwareConfig
      ? computeScaleAwareSpeed(this.distance, this.scaleAwareConfig) / this.scaleAwareConfig.baseSpeed
      : 1;
    const adjustedDelta = delta * Math.max(0.1, Math.min(10, speedMultiplier));
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * (1 - adjustedDelta)));
    this.updateCamera();
  }

  pan(dx: number, dy: number): void {
    // 跟随模式下 pan 调整偏移角度
    this.theta += dx * 0.01;
    this.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.phi + dy * 0.01));
    this.updateCamera();
  }

  update(_deltaTime: number): void {
    // 平滑插值到目标位置
    if (this.lastTargetPos) {
      this.target = {
        x: this.target.x + (this.lastTargetPos.x - this.target.x) * this.followLerp,
        y: this.target.y + (this.lastTargetPos.y - this.target.y) * this.followLerp,
        z: this.target.z + (this.lastTargetPos.z - this.target.z) * this.followLerp,
      };
    }
    this.updateCamera();
  }

  /** 外部调用：设置目标天体的最新位置。 */
  setTargetPosition(pos: Vec3d): void {
    this.lastTargetPos = { ...pos };
  }

  private updateCamera(): void {
    let x = this.target.x + this.distance * Math.sin(this.phi) * Math.cos(this.theta);
    let y = this.target.y + this.distance * Math.cos(this.phi);
    let z = this.target.z + this.distance * Math.sin(this.phi) * Math.sin(this.theta);

    if (this.collisionChecker) {
      const safe = this.collisionChecker({ x, y, z }, this.target);
      x = safe.x;
      y = safe.y;
      z = safe.z;
    }

    this.camera.position = { x, y, z };

    // lookAt target
    const lookAt = { x: this.target.x - x, y: this.target.y - y, z: this.target.z - z };
    const len = Math.sqrt(lookAt.x * lookAt.x + lookAt.y * lookAt.y + lookAt.z * lookAt.z);
    if (len < 1e-10) return;
    const nx = lookAt.x / len;
    const ny = lookAt.y / len;
    const nz = lookAt.z / len;

    // 构建 lookAt 旋转（与 OrbitController 相同的四元数计算）
    const right = { x: -nz, y: 0, z: nx };
    const up = { x: ny * nz, y: nx * nx + nz * nz, z: -nx * ny };
    const ulen = Math.sqrt(up.x * up.x + up.y * up.y + up.z * up.z);
    if (ulen < 1e-10) return;
    const ux = up.x / ulen;
    const uy = up.y / ulen;
    const uz = up.z / ulen;

    const m00 = right.x;
    const m11 = uy;
    const m22 = -nz;
    const trace = m00 + m11 + m22;
    let w: number, xq: number, yq: number, zq: number;

    if (trace > 0) {
      const s = 2 * Math.sqrt(trace + 1);
      w = 0.25 * s;
      xq = (uz - 0) / s; // m21 - m12 = uz - 0
      yq = (-nx - right.x) / s; // m02 - m20 = -nx - rz
      zq = (0 - ux) / s; // m10 - m01 = 0 - ux
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (uz - 0) / s;
      xq = 0.25 * s;
      yq = (ux + 0) / s;
      zq = (-nx + right.x) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (-nx - right.x) / s;
      xq = (ux + 0) / s;
      yq = 0.25 * s;
      zq = (0 + uz) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (0 - ux) / s;
      xq = (-nx + right.x) / s;
      yq = (0 + uz) / s;
      zq = 0.25 * s;
    }

    const qlen = Math.sqrt(w * w + xq * xq + yq * yq + zq * zq);
    if (qlen > 1e-10) {
      this.camera.rotation = { w: w / qlen, x: xq / qlen, y: yq / qlen, z: zq / qlen };
    }
  }
}

/**
 * 地表低空相机控制器（FR-CAM-001）。
 *
 * 用于行星表面低空导航，相机贴近地表，支持经纬度移动与高度调节。
 * 结合 SurfaceCameraImpl 的最小安全距离约束实现碰撞防护（FR-CAM-005）。
 */
export class SurfaceLowController implements CameraController {
  mode: NavigationMode = 'surface-low';
  target: Vec3d = { x: 0, y: 0, z: 0 };
  distance: number = 100;
  minDistance: number = 1;
  maxDistance: number = 1e6;
  minZoom: number = 0.01;
  maxZoom: number = 1e6;

  private camera: CameraNode;
  /** 行星中心位置。 */
  private bodyCenter: Vec3d = { x: 0, y: 0, z: 0 };
  /** 行星半径（米）。 */
  private bodyRadius: number = 6371000;
  /** 当前经度（弧度）。 */
  private longitude: number = 0;
  /** 当前纬度（弧度）。 */
  private latitude: number = 0;
  /** 当前离地表高度（米）。 */
  private altitude: number = 100;
  /** 最小安全高度（米）。 */
  private minAltitude: number = 1;
  private collisionChecker: CollisionChecker | null = null;
  private scaleAwareConfig: ScaleAwareConfig | null = null;

  constructor(camera: CameraNode, bodyRadius: number = 6371000) {
    this.camera = camera;
    this.bodyRadius = bodyRadius;
    this.altitude = bodyRadius * 0.01; // 默认 1% 半径高度
    this.minAltitude = bodyRadius * 0.001; // 最小 0.1% 半径
    this.updateCamera();
  }

  setCollisionChecker(checker: CollisionChecker | null): void {
    this.collisionChecker = checker;
    this.updateCamera();
  }

  setScaleAwareConfig(config: ScaleAwareConfig | null): void {
    this.scaleAwareConfig = config;
  }

  /** 设置行星参数。 */
  setBody(center: Vec3d, radius: number): void {
    this.bodyCenter = { ...center };
    this.bodyRadius = radius;
    this.minAltitude = radius * 0.001;
    this.updateCamera();
  }

  rotate(theta: number, phi: number): void {
    // 地表模式下 rotate 调整经纬度
    const sensitivity = this.scaleAwareConfig
      ? computeSmallBodyFactor(this.bodyRadius, this.altitude, this.scaleAwareConfig).sensitivityFactor
      : 1;
    this.longitude += theta * 0.01 * sensitivity;
    this.latitude = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.latitude + phi * 0.01 * sensitivity));
    this.updateCamera();
  }

  zoom(delta: number): void {
    // 地表模式下 zoom 调整高度
    const speedFactor = this.scaleAwareConfig
      ? computeScaleAwareSpeed(this.altitude, this.scaleAwareConfig) / this.scaleAwareConfig.baseSpeed
      : 1;
    this.altitude = Math.max(this.minAltitude, this.altitude * (1 - delta * Math.max(0.1, Math.min(10, speedFactor))));
    this.updateCamera();
  }

  pan(dx: number, dy: number): void {
    // pan 在地表模式下也调整经纬度
    this.longitude += dx * 0.001;
    this.latitude = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.latitude + dy * 0.001));
    this.updateCamera();
  }

  update(_deltaTime: number): void {
    this.updateCamera();
  }

  private updateCamera(): void {
    const cosLat = Math.cos(this.latitude);
    const sinLat = Math.sin(this.latitude);
    const cosLon = Math.cos(this.longitude);
    const sinLon = Math.sin(this.longitude);

    const r = this.bodyRadius + this.altitude;
    // 球坐标 → 笛卡尔（以 bodyCenter 为原点）
    let x = this.bodyCenter.x + r * cosLat * cosLon;
    let y = this.bodyCenter.y + r * sinLat;
    let z = this.bodyCenter.z + r * cosLat * sinLon;

    // target 为相机正下方地表点
    this.target = {
      x: this.bodyCenter.x + this.bodyRadius * cosLat * cosLon,
      y: this.bodyCenter.y + this.bodyRadius * sinLat,
      z: this.bodyCenter.z + this.bodyRadius * cosLat * sinLon,
    };

    if (this.collisionChecker) {
      const safe = this.collisionChecker({ x, y, z }, this.target);
      x = safe.x;
      y = safe.y;
      z = safe.z;
    }

    this.camera.position = { x, y, z };

    // lookAt 目标点（地表）
    const lookAt = { x: this.target.x - x, y: this.target.y - y, z: this.target.z - z };
    const len = Math.sqrt(lookAt.x * lookAt.x + lookAt.y * lookAt.y + lookAt.z * lookAt.z);
    if (len < 1e-10) return;
    const nx = lookAt.x / len;
    const ny = lookAt.y / len;
    const nz = lookAt.z / len;

    // up = 从行星中心指向相机的方向（即径向方向）
    const upDir = {
      x: x - this.bodyCenter.x,
      y: y - this.bodyCenter.y,
      z: z - this.bodyCenter.z,
    };
    const upLen = Math.sqrt(upDir.x * upDir.x + upDir.y * upDir.y + upDir.z * upDir.z);
    if (upLen < 1e-10) return;
    const ux = upDir.x / upLen;
    const uy = upDir.y / upLen;
    const uz = upDir.z / upLen;

    // right = forward × up
    const right = {
      x: ny * uz - nz * uy,
      y: nz * ux - nx * uz,
      z: nx * uy - ny * ux,
    };
    const rLen = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
    if (rLen < 1e-10) return;
    const rx = right.x / rLen;
    const ry = right.y / rLen;
    const rz = right.z / rLen;

    // 旋转矩阵 → 四元数
    const m00 = rx;
    const m01 = ux;
    const m02 = -nx;
    const m10 = ry;
    const m11 = uy;
    const m12 = -ny;
    const m20 = rz;
    const m21 = uz;
    const m22 = -nz;
    const trace = m00 + m11 + m22;
    let w: number, xq: number, yq: number, zq: number;

    if (trace > 0) {
      const s = 2 * Math.sqrt(trace + 1);
      w = 0.25 * s;
      xq = (m21 - m12) / s;
      yq = (m02 - m20) / s;
      zq = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s;
      xq = 0.25 * s;
      yq = (m01 + m10) / s;
      zq = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s;
      xq = (m01 + m10) / s;
      yq = 0.25 * s;
      zq = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s;
      xq = (m02 + m20) / s;
      yq = (m12 + m21) / s;
      zq = 0.25 * s;
    }

    const qlen = Math.sqrt(w * w + xq * xq + yq * yq + zq * zq);
    if (qlen > 1e-10) {
      this.camera.rotation = { w: w / qlen, x: xq / qlen, y: yq / qlen, z: zq / qlen };
    }
  }
}

/**
 * 相机平滑过渡控制器（FR-CAM-002）。
 *
 * 使用三次贝塞尔曲线在当前位置与目标位置之间生成安全、平滑的过渡路径。
 * 同时插值相机的 lookAt 目标点，确保视角过渡自然。
 *
 * 用法：
 *   const transition = new CameraTransition(camera);
 *   transition.flyTo(targetPosition, targetLookAt, durationMs);
 *   // 每帧调用 update(deltaTime) 推进过渡
 *   transition.update(deltaTime);
 *   if (transition.isActive()) { ... }
 */
export class CameraTransition {
  private camera: CameraNode;
  private startPos: Vec3d = { x: 0, y: 0, z: 0 };
  private startTarget: Vec3d = { x: 0, y: 0, z: 0 };
  private endPos: Vec3d = { x: 0, y: 0, z: 0 };
  private endTarget: Vec3d = { x: 0, y: 0, z: 0 };
  /** 控制点（贝塞尔曲线的两个中间控制点）。 */
  private control1: Vec3d = { x: 0, y: 0, z: 0 };
  private control2: Vec3d = { x: 0, y: 0, z: 0 };
  private duration: number = 1000;
  private elapsed: number = 0;
  private active: boolean = false;
  private collisionChecker: CollisionChecker | null = null;

  constructor(camera: CameraNode) {
    this.camera = camera;
  }

  setCollisionChecker(checker: CollisionChecker | null): void {
    this.collisionChecker = checker;
  }

  isActive(): boolean {
    return this.active;
  }

  getProgress(): number {
    if (!this.active || this.duration <= 0) return 1;
    return Math.min(1, this.elapsed / this.duration);
  }

  /**
   * 启动平滑过渡（FR-CAM-002）。
   * @param endPos 目标相机位置
   * @param endTarget 目标 lookAt 点
   * @param durationMs 过渡时长（毫秒）
   * @param currentTarget 当前 lookAt 点（用于插值视角）
   */
  flyTo(
    endPos: Vec3d,
    endTarget: Vec3d,
    durationMs: number,
    currentTarget?: Vec3d,
  ): void {
    this.startPos = { ...this.camera.position };
    this.endPos = { ...endPos };
    this.startTarget = currentTarget ? { ...currentTarget } : { ...this.camera.position };
    this.endTarget = { ...endTarget };
    this.duration = Math.max(100, durationMs);
    this.elapsed = 0;
    this.active = true;

    // 生成贝塞尔控制点：在起点和终点之间偏移，形成弧线避免直线穿过天体
    const mid: Vec3d = {
      x: (this.startPos.x + endPos.x) / 2,
      y: (this.startPos.y + endPos.y) / 2,
      z: (this.startPos.z + endPos.z) / 2,
    };
    // 计算偏移方向：垂直于起终点连线，偏移量为连线长度的 20%
    const dir: Vec3d = {
      x: endPos.x - this.startPos.x,
      y: endPos.y - this.startPos.y,
      z: endPos.z - this.startPos.z,
    };
    const dist = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    const offset = dist * 0.2;
    // 选择垂直方向：与 (0,1,0) 叉积
    let perp: Vec3d;
    if (Math.abs(dir.y) < dist * 0.99) {
      perp = {
        x: dir.z,
        y: 0,
        z: -dir.x,
      };
    } else {
      perp = { x: 0, y: dir.z, z: -dir.y };
    }
    const perpLen = Math.sqrt(perp.x * perp.x + perp.y * perp.y + perp.z * perp.z);
    if (perpLen > 1e-10) {
      perp = { x: perp.x / perpLen * offset, y: perp.y / perpLen * offset, z: perp.z / perpLen * offset };
    }

    this.control1 = {
      x: this.startPos.x + (mid.x - this.startPos.x) * 0.5 + perp.x,
      y: this.startPos.y + (mid.y - this.startPos.y) * 0.5 + perp.y,
      z: this.startPos.z + (mid.z - this.startPos.z) * 0.5 + perp.z,
    };
    this.control2 = {
      x: endPos.x + (mid.x - endPos.x) * 0.5 + perp.x,
      y: endPos.y + (mid.y - endPos.y) * 0.5 + perp.y,
      z: endPos.z + (mid.z - endPos.z) * 0.5 + perp.z,
    };
  }

  /** 取消过渡。 */
  cancel(): void {
    this.active = false;
    this.elapsed = 0;
  }

  /** 立即跳转到目标位置（无过渡）。 */
  snapTo(pos: Vec3d, target: Vec3d): void {
    this.active = false;
    this.camera.position = { ...pos };
    this.endPos = { ...pos };
    this.endTarget = { ...target };
    this.applyLookAt(pos, target);
  }

  update(deltaTime: number): void {
    if (!this.active) return;
    this.elapsed += deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);
    // ease-in-out
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    // 三次贝塞尔位置插值
    const u = 1 - eased;
    const pos: Vec3d = {
      x: u * u * u * this.startPos.x + 3 * u * u * eased * this.control1.x + 3 * u * eased * eased * this.control2.x + eased * eased * eased * this.endPos.x,
      y: u * u * u * this.startPos.y + 3 * u * u * eased * this.control1.y + 3 * u * eased * eased * this.control2.y + eased * eased * eased * this.endPos.y,
      z: u * u * u * this.startPos.z + 3 * u * u * eased * this.control1.z + 3 * u * eased * eased * this.control2.z + eased * eased * eased * this.endPos.z,
    };

    // lookAt 线性插值
    const lookAt: Vec3d = {
      x: this.startTarget.x + (this.endTarget.x - this.startTarget.x) * eased,
      y: this.startTarget.y + (this.endTarget.y - this.startTarget.y) * eased,
      z: this.startTarget.z + (this.endTarget.z - this.startTarget.z) * eased,
    };

    // FR-CAM-005：碰撞检测
    if (this.collisionChecker) {
      const safe = this.collisionChecker(pos, lookAt);
      this.camera.position = safe;
    } else {
      this.camera.position = pos;
    }

    this.applyLookAt(this.camera.position, lookAt);

    if (t >= 1) {
      this.active = false;
    }
  }

  /** 根据相机位置与 lookAt 点计算并设置相机旋转。 */
  private applyLookAt(cameraPos: Vec3d, lookAt: Vec3d): void {
    const forward = {
      x: lookAt.x - cameraPos.x,
      y: lookAt.y - cameraPos.y,
      z: lookAt.z - cameraPos.z,
    };
    const len = Math.sqrt(forward.x * forward.x + forward.y * forward.y + forward.z * forward.z);
    if (len < 1e-10) return;
    const nx = forward.x / len;
    const ny = forward.y / len;
    const nz = forward.z / len;

    const up = { x: 0, y: 1, z: 0 };
    const right = {
      x: up.y * nz - up.z * ny,
      y: up.z * nx - up.x * nz,
      z: up.x * ny - up.y * nx,
    };
    const rLen = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
    if (rLen < 1e-10) return;
    const rx = right.x / rLen;
    const ry = right.y / rLen;
    const rz = right.z / rLen;

    // recompute up = right × forward
    const up2 = {
      x: ry * nz - rz * ny,
      y: rz * nx - rx * nz,
      z: rx * ny - ry * nx,
    };

    // 旋转矩阵 → 四元数（标准算法）
    // 矩阵为列主序：[rx ry rz | up2.x up2.y up2.z | nx ny nz]
    const m00 = rx;
    const m11 = up2.y;
    const m22 = nz;
    const trace = m00 + m11 + m22;
    let w: number, xq: number, yq: number, zq: number;

    if (trace > 0) {
      const s = 2 * Math.sqrt(trace + 1);
      w = 0.25 * s;
      xq = (ry * up2.z - rz * up2.y) / s; // m10*m21 - m20*m11
      yq = (rz * nx - rx * nz) / s; // m20*m02 - m00*m22
      zq = (rx * up2.y - ry * up2.x) / s; // m00*m11 - m10*m01
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (ry * up2.z - rz * up2.y) / s;
      xq = 0.25 * s;
      yq = (ry * up2.x + rx * up2.y) / s; // m01 + m10
      zq = (rz * nx + rx * nz) / s; // m02 + m20
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (rz * nx - rx * nz) / s;
      xq = (ry * up2.x + rx * up2.y) / s;
      yq = 0.25 * s;
      zq = (ny * up2.z + nz * up2.y) / s; // m12 + m21
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (rx * up2.y - ry * up2.x) / s;
      xq = (rz * nx + rx * nz) / s;
      yq = (ny * up2.z + nz * up2.y) / s;
      zq = 0.25 * s;
    }

    const qlen = Math.sqrt(w * w + xq * xq + yq * yq + zq * zq);
    if (qlen > 1e-10) {
      this.camera.rotation = { w: w / qlen, x: xq / qlen, y: yq / qlen, z: zq / qlen };
    }
  }
}

/**
 * 动态近远裁剪面管理器（FR-CAM-006）。
 *
 * 根据相机到原点（或最近天体）的距离，动态调整 near/far 裁剪面，
 * 以在不同空间尺度下保持深度精度。
 *
 * 策略：
 * - near = max(0.1, cameraDistance * 1e-6)  — 近裁剪面随距离增大
 * - far = max(near * 1e6, cameraDistance * 1e4)  — 远裁剪面保持足够覆盖
 * - 保证 near/far 比值不超过 1e10（浮点深度精度限制）
 */
export class DynamicClipPlane {
  private camera: CameraNode;
  /** 基础近裁剪面（最小值）。 */
  private baseNear: number = 0.1;
  /** 基础远裁剪面（最大值）。 */
  private baseFar: number = 1e12;
  /** near/far 最大比值。 */
  private maxRatio: number = 1e10;
  /** 参考点（通常为最近天体或原点）。 */
  private referencePoint: Vec3d = { x: 0, y: 0, z: 0 };

  constructor(camera: CameraNode) {
    this.camera = camera;
  }

  setBaseNear(near: number): void {
    this.baseNear = Math.max(1e-10, near);
  }

  setBaseFar(far: number): void {
    this.baseFar = Math.max(this.baseNear * 100, far);
  }

  setMaxRatio(ratio: number): void {
    this.maxRatio = Math.max(1e3, ratio);
  }

  setReferencePoint(point: Vec3d): void {
    this.referencePoint = { ...point };
  }

  /**
   * 根据当前相机位置更新 near/far 裁剪面（FR-CAM-006）。
   * 在每帧渲染前调用。
   */
  update(): void {
    const dx = this.camera.position.x - this.referencePoint.x;
    const dy = this.camera.position.y - this.referencePoint.y;
    const dz = this.camera.position.z - this.referencePoint.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // near 随距离增大（保持相对精度），但不小于 baseNear
    let near = Math.max(this.baseNear, distance * 1e-6);
    // far 保持足够覆盖（距离的 10000 倍 + baseFar）
    let far = Math.max(this.baseFar, distance * 1e4);

    // 保证 near/far 比值不超过 maxRatio
    if (far / near > this.maxRatio) {
      far = near * this.maxRatio;
    }

    // 确保 far > near
    if (far <= near) {
      far = near * 1000;
    }

    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjection();
  }
}

/**
 * 预设视角类型（FR-CAM-007）。
 */
export type PresetViewType = 'home' | 'system-overview' | 'solar-system-panorama';

/**
 * 预设视角定义。
 */
export interface PresetView {
  type: PresetViewType;
  name: string;
  position: Vec3d;
  target: Vec3d;
  /** 过渡时长（毫秒）。 */
  durationMs: number;
}

/**
 * 预设视角管理器（FR-CAM-007）。
 *
 * 提供一键返回母星、系统全景、太阳系全景功能。
 * 内部使用 CameraTransition 实现平滑过渡。
 */
export class PresetViewManager {
  private transition: CameraTransition;
  private presets: Map<PresetViewType, PresetView> = new Map();

  constructor(transition: CameraTransition) {
    this.transition = transition;
    this.registerDefaultPresets();
  }

  private registerDefaultPresets(): void {
    // 默认预设：太阳系全景（从远处俯视）
    this.presets.set('solar-system-panorama', {
      type: 'solar-system-panorama',
      name: '太阳系全景',
      position: { x: 0, y: 5e11, z: 5e11 },
      target: { x: 0, y: 0, z: 0 },
      durationMs: 3000,
    });
    // 系统全景（内行星视角）
    this.presets.set('system-overview', {
      type: 'system-overview',
      name: '系统全景',
      position: { x: 0, y: 1e11, z: 1e11 },
      target: { x: 0, y: 0, z: 0 },
      durationMs: 2000,
    });
    // 母星（地球，默认）
    this.presets.set('home', {
      type: 'home',
      name: '返回母星',
      position: { x: 1.496e11, y: 0, z: 0 },
      target: { x: 1.496e11, y: 0, z: 0 },
      durationMs: 2000,
    });
  }

  /** 注册自定义预设视角。 */
  registerPreset(preset: PresetView): void {
    this.presets.set(preset.type, preset);
  }

  /** 设置母星位置（用于 returnToHome）。 */
  setHomePosition(position: Vec3d): void {
    const home = this.presets.get('home');
    if (home) {
      home.position = { ...position };
      home.target = { ...position };
    }
  }

  /** 一键返回母星（FR-CAM-007）。 */
  returnToHome(): void {
    const preset = this.presets.get('home');
    if (preset) {
      this.transition.flyTo(preset.position, preset.target, preset.durationMs);
    }
  }

  /** 一键返回系统全景（FR-CAM-007）。 */
  systemOverview(): void {
    const preset = this.presets.get('system-overview');
    if (preset) {
      this.transition.flyTo(preset.position, preset.target, preset.durationMs);
    }
  }

  /** 一键返回太阳系全景（FR-CAM-007）。 */
  solarSystemPanorama(): void {
    const preset = this.presets.get('solar-system-panorama');
    if (preset) {
      this.transition.flyTo(preset.position, preset.target, preset.durationMs);
    }
  }

  /** 跳转到指定预设视角。 */
  goToPreset(type: PresetViewType): void {
    const preset = this.presets.get(type);
    if (preset) {
      this.transition.flyTo(preset.position, preset.target, preset.durationMs);
    }
  }

  /** 获取所有已注册预设。 */
  getAllPresets(): PresetView[] {
    return Array.from(this.presets.values());
  }
}
