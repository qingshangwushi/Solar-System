/**
 * 相机与导航基础（任务 P0-15）。
 */

import type { Vec3d, Quat64 } from '@solar-system/schemas';
import type { SceneNode } from './index.js';

export type CameraType = 'perspective' | 'orthographic' | 'fisheye';
export type NavigationMode = 'orbit' | 'fly' | 'pan';

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

    result[0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
    result[1] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
    result[2] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
    result[3] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;

    result[4] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
    result[5] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
    result[6] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
    result[7] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;

    result[8] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
    result[9] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
    result[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
    result[11] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;

    result[12] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;
    result[13] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;
    result[14] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;
    result[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;
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

    result[0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
    result[1] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
    result[2] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
    result[3] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;

    result[4] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
    result[5] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
    result[6] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
    result[7] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;

    result[8] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
    result[9] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
    result[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
    result[11] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;

    result[12] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;
    result[13] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;
    result[14] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;
    result[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;
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

  constructor(camera: CameraNode) {
    this.camera = camera;
    this.updateCamera();
  }

  rotate(theta: number, phi: number): void {
    this.theta += theta;
    this.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.phi + phi));
    this.updateCamera();
  }

  zoom(delta: number): void {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * (1 - delta)));
    this.updateCamera();
  }

  pan(dx: number, dy: number): void {
    const right = { x: -Math.sin(this.theta), y: 0, z: -Math.cos(this.theta) };
    const up = {
      x: Math.cos(this.theta) * Math.cos(this.phi),
      y: Math.sin(this.phi),
      z: -Math.sin(this.theta) * Math.cos(this.phi),
    };

    const scale = this.distance * 0.001;
    this.target.x += right.x * dx * scale + up.x * dy * scale;
    this.target.y += right.y * dx * scale + up.y * dy * scale;
    this.target.z += right.z * dx * scale + up.z * dy * scale;
    this.updateCamera();
  }

  update(_deltaTime: number): void {
    this.updateCamera();
  }

  private updateCamera(): void {
    const x = this.target.x + this.distance * Math.sin(this.phi) * Math.cos(this.theta);
    const y = this.target.y + this.distance * Math.cos(this.phi);
    const z = this.target.z + this.distance * Math.sin(this.phi) * Math.sin(this.theta);

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

  constructor(camera: CameraNode) {
    this.camera = camera;
  }

  rotate(theta: number, phi: number): void {
    this.angularVelocity.y += theta * this.sensitivity;
    this.angularVelocity.x += phi * this.sensitivity;
  }

  zoom(delta: number): void {
    this.speed = Math.max(0.1, Math.min(1000, this.speed * (1 - delta)));
  }

  pan(dx: number, dy: number): void {
    this.velocity.x -= dx * this.speed * 0.01;
    this.velocity.y += dy * this.speed * 0.01;
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

    const dt = deltaTime;
    this.camera.position.x += (forward.x * this.speed + right.x * this.velocity.x + up.x * this.velocity.y) * dt;
    this.camera.position.y += (forward.y * this.speed + right.y * this.velocity.x + up.y * this.velocity.y) * dt;
    this.camera.position.z += (forward.z * this.speed + right.z * this.velocity.x + up.z * this.velocity.y) * dt;

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
