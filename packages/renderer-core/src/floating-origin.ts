/**
 * 浮动原点与局部参考系（任务 P0-14）。
 */

import type { Vec3d, Quat64 } from '@solar-system/schemas';

export class FloatingOrigin {
  private origin: Vec3d = { x: 0, y: 0, z: 0 };
  private originHigh: Float32Array = new Float32Array(3);
  private originLow: Float32Array = new Float32Array(3);

  get position(): Vec3d {
    return { ...this.origin };
  }

  set position(newOrigin: Vec3d) {
    this.origin = { ...newOrigin };
    this.splitVector(newOrigin, this.originHigh, this.originLow);
  }

  private splitVector(vec: Vec3d, high: Float32Array, low: Float32Array): void {
    const offset = 134217728.0;
    const f = vec.x;
    let x = f + offset;
    high[0] = x - offset;
    low[0] = f - high[0];
    const f1 = vec.y;
    x = f1 + offset;
    high[1] = x - offset;
    low[1] = f1 - high[1];
    const f2 = vec.z;
    x = f2 + offset;
    high[2] = x - offset;
    low[2] = f2 - high[2];
  }

  transformToLocal(worldPos: Vec3d): Float32Array {
    const result = new Float32Array(3);
    const temp = new Float32Array(3);
    this.splitVector(worldPos, temp, result);

    const highDiff0 = (temp[0] as number) - (this.originHigh[0] as number);
    const lowDiff0 = (result[0] as number) - (this.originLow[0] as number);
    result[0] = highDiff0 + lowDiff0;
    const highDiff1 = (temp[1] as number) - (this.originHigh[1] as number);
    const lowDiff1 = (result[1] as number) - (this.originLow[1] as number);
    result[1] = highDiff1 + lowDiff1;
    const highDiff2 = (temp[2] as number) - (this.originHigh[2] as number);
    const lowDiff2 = (result[2] as number) - (this.originLow[2] as number);
    result[2] = highDiff2 + lowDiff2;

    return result;
  }

  transformToWorld(localPos: Float32Array): Vec3d {
    const temp0 = (this.originHigh[0] as number) + (localPos[0] as number);
    const high0 = temp0;
    const low0 = (localPos[0] as number) - (high0 - (this.originHigh[0] as number));
    const x = high0 + ((this.originLow[0] as number) + low0);

    const temp1 = (this.originHigh[1] as number) + (localPos[1] as number);
    const high1 = temp1;
    const low1 = (localPos[1] as number) - (high1 - (this.originHigh[1] as number));
    const y = high1 + ((this.originLow[1] as number) + low1);

    const temp2 = (this.originHigh[2] as number) + (localPos[2] as number);
    const high2 = temp2;
    const low2 = (localPos[2] as number) - (high2 - (this.originHigh[2] as number));
    const z = high2 + ((this.originLow[2] as number) + low2);

    return { x, y, z };
  }

  update(newOrigin: Vec3d, threshold: number = 1000000): boolean {
    const dx = newOrigin.x - this.origin.x;
    const dy = newOrigin.y - this.origin.y;
    const dz = newOrigin.z - this.origin.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > threshold) {
      this.position = newOrigin;
      return true;
    }
    return false;
  }
}

export class LocalReferenceFrame {
  private origin: Vec3d = { x: 0, y: 0, z: 0 };
  private rotation: Quat64 = { w: 1, x: 0, y: 0, z: 0 };
  private scale: number = 1;

  constructor(origin?: Vec3d, rotation?: Quat64, scale?: number) {
    if (origin) this.origin = origin;
    if (rotation) this.rotation = rotation;
    if (scale !== undefined) this.scale = scale;
  }

  setOrigin(origin: Vec3d): void {
    this.origin = { ...origin };
  }

  setRotation(rotation: Quat64): void {
    this.rotation = { ...rotation };
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  getTransformMatrix(): Float64Array {
    const m = new Float64Array(16);
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

    m[0] = (1 - yy - zz) * this.scale;
    m[1] = (xy + wz) * this.scale;
    m[2] = (xz - wy) * this.scale;
    m[3] = 0;

    m[4] = (xy - wz) * this.scale;
    m[5] = (1 - xx - zz) * this.scale;
    m[6] = (yz + wx) * this.scale;
    m[7] = 0;

    m[8] = (xz + wy) * this.scale;
    m[9] = (yz - wx) * this.scale;
    m[10] = (1 - xx - yy) * this.scale;
    m[11] = 0;

    m[12] = this.origin.x;
    m[13] = this.origin.y;
    m[14] = this.origin.z;
    m[15] = 1;

    return m;
  }

  transformPoint(point: Vec3d): Vec3d {
    const m = this.getTransformMatrix();
    const x = point.x;
    const y = point.y;
    const z = point.z;
    return {
      x: (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number),
      y: (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number),
      z: (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number),
    };
  }

  inverseTransformPoint(point: Vec3d): Vec3d {
    const m = this.getTransformMatrix();
    const invM = this.invertMatrix(m);
    const x = point.x;
    const y = point.y;
    const z = point.z;
    return {
      x: (invM[0] as number) * x + (invM[4] as number) * y + (invM[8] as number) * z + (invM[12] as number),
      y: (invM[1] as number) * x + (invM[5] as number) * y + (invM[9] as number) * z + (invM[13] as number),
      z: (invM[2] as number) * x + (invM[6] as number) * y + (invM[10] as number) * z + (invM[14] as number),
    };
  }

  private invertMatrix(m: Float64Array): Float64Array {
    const inv = new Float64Array(16);
    const a00 = m[0] as number, a01 = m[1] as number, a02 = m[2] as number, a03 = m[3] as number;
    const a10 = m[4] as number, a11 = m[5] as number, a12 = m[6] as number, a13 = m[7] as number;
    const a20 = m[8] as number, a21 = m[9] as number, a22 = m[10] as number, a23 = m[11] as number;
    const a30 = m[12] as number, a31 = m[13] as number, a32 = m[14] as number, a33 = m[15] as number;

    const det =
      a00 * (a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31)) -
      a01 * (a10 * (a22 * a33 - a23 * a32) - a12 * (a20 * a33 - a23 * a30) + a13 * (a20 * a32 - a22 * a30)) +
      a02 * (a10 * (a21 * a33 - a23 * a31) - a11 * (a20 * a33 - a23 * a30) + a13 * (a20 * a31 - a21 * a30)) -
      a03 * (a10 * (a21 * a32 - a22 * a31) - a11 * (a20 * a32 - a22 * a30) + a12 * (a20 * a31 - a21 * a30));

    if (Math.abs(det) < 1e-10) {
      throw new Error('Matrix is singular, cannot invert');
    }

    const invDet = 1 / det;

    inv[0] = (a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31)) * invDet;
    inv[1] = (-a01 * (a22 * a33 - a23 * a32) + a02 * (a21 * a33 - a23 * a31) - a03 * (a21 * a32 - a22 * a31)) * invDet;
    inv[2] = (a01 * (a12 * a33 - a13 * a32) - a02 * (a11 * a33 - a13 * a31) + a03 * (a11 * a32 - a12 * a31)) * invDet;
    inv[3] = (-a01 * (a12 * a23 - a13 * a22) + a02 * (a11 * a23 - a13 * a21) - a03 * (a11 * a22 - a12 * a21)) * invDet;

    inv[4] = (-a10 * (a22 * a33 - a23 * a32) + a12 * (a20 * a33 - a23 * a30) - a13 * (a20 * a32 - a22 * a30)) * invDet;
    inv[5] = (a00 * (a22 * a33 - a23 * a32) - a02 * (a20 * a33 - a23 * a30) + a03 * (a20 * a32 - a22 * a30)) * invDet;
    inv[6] = (-a00 * (a12 * a33 - a13 * a32) + a02 * (a10 * a33 - a13 * a30) - a03 * (a10 * a32 - a12 * a30)) * invDet;
    inv[7] = (a00 * (a12 * a23 - a13 * a22) - a02 * (a10 * a23 - a13 * a20) + a03 * (a10 * a22 - a12 * a20)) * invDet;

    inv[8] = (a10 * (a21 * a33 - a23 * a31) - a11 * (a20 * a33 - a23 * a30) + a13 * (a20 * a31 - a21 * a30)) * invDet;
    inv[9] = (-a00 * (a21 * a33 - a23 * a31) + a01 * (a20 * a33 - a23 * a30) - a03 * (a20 * a31 - a21 * a30)) * invDet;
    inv[10] = (a00 * (a11 * a33 - a13 * a31) - a01 * (a10 * a33 - a13 * a30) + a03 * (a10 * a31 - a11 * a30)) * invDet;
    inv[11] = (-a00 * (a11 * a23 - a13 * a21) + a01 * (a10 * a23 - a13 * a20) - a03 * (a10 * a21 - a11 * a20)) * invDet;

    inv[12] = (-a10 * (a21 * a32 - a22 * a31) + a11 * (a20 * a32 - a22 * a30) - a12 * (a20 * a31 - a21 * a30)) * invDet;
    inv[13] = (a00 * (a21 * a32 - a22 * a31) - a01 * (a20 * a32 - a22 * a30) + a02 * (a20 * a31 - a21 * a30)) * invDet;
    inv[14] = (-a00 * (a11 * a32 - a12 * a31) + a01 * (a10 * a32 - a12 * a30) - a02 * (a10 * a31 - a11 * a30)) * invDet;
    inv[15] = (a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20)) * invDet;

    return inv;
  }
}

export class HighLowSplitter {
  static split(vec: Vec3d): { high: Float32Array; low: Float32Array } {
    const high = new Float32Array(3);
    const low = new Float32Array(3);
    this.splitInto(vec, high, low);
    return { high, low };
  }

  static splitInto(vec: Vec3d, high: Float32Array, low: Float32Array): void {
    const offset = 134217728.0;
    let f = vec.x;
    let x = f + offset;
    high[0] = x - offset;
    low[0] = f - high[0];
    f = vec.y;
    x = f + offset;
    high[1] = x - offset;
    low[1] = f - high[1];
    f = vec.z;
    x = f + offset;
    high[2] = x - offset;
    low[2] = f - high[2];
  }

  static combine(high: Float32Array, low: Float32Array): Vec3d {
    return { x: (high[0] as number) + (low[0] as number), y: (high[1] as number) + (low[1] as number), z: (high[2] as number) + (low[2] as number) };
  }

  static difference(a: Vec3d, b: Vec3d): Float32Array {
    const result = new Float32Array(3);
    const aHigh = new Float32Array(3);
    const aLow = new Float32Array(3);
    const bHigh = new Float32Array(3);
    const bLow = new Float32Array(3);

    this.splitInto(a, aHigh, aLow);
    this.splitInto(b, bHigh, bLow);

    const s0 = (aHigh[0] as number) - (bHigh[0] as number);
    const e0 = ((aHigh[0] as number) - s0) - (bHigh[0] as number) + ((aLow[0] as number) - (bLow[0] as number));
    result[0] = s0 + e0;

    const s1 = (aHigh[1] as number) - (bHigh[1] as number);
    const e1 = ((aHigh[1] as number) - s1) - (bHigh[1] as number) + ((aLow[1] as number) - (bLow[1] as number));
    result[1] = s1 + e1;

    const s2 = (aHigh[2] as number) - (bHigh[2] as number);
    const e2 = ((aHigh[2] as number) - s2) - (bHigh[2] as number) + ((aLow[2] as number) - (bLow[2] as number));
    result[2] = s2 + e2;

    return result;
  }
}
