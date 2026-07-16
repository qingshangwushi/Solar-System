import { describe, it, expect } from 'vitest';
import {
  multiplyMatrix,
  transposeMatrix,
  matrixToQuaternion,
  quaternionToMatrix,
  quaternionMultiply,
  quaternionInverse,
  rotateVectorQuaternion,
  eulerToQuaternion,
  quaternionToEuler,
  computePrecessionMatrix,
  computeNutationMatrix,
  computeGmst,
  computeSiderealTime,
  computeEciToEcefMatrix,
  computeEquatorialToEclipticMatrix,
  transformFrame,
  computeBodyFixedOrientation,
} from '../reference-frame.js';

describe('RotationMatrix', () => {
  it('should multiply two matrices', () => {
    const a = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
    const b = { m00: 2, m01: 0, m02: 0, m10: 0, m11: 3, m12: 0, m20: 0, m21: 0, m22: 4 };
    const result = multiplyMatrix(a, b);
    expect(result.m00).toBe(2);
    expect(result.m11).toBe(3);
    expect(result.m22).toBe(4);
  });

  it('should transpose matrix', () => {
    const m = { m00: 1, m01: 2, m02: 3, m10: 4, m11: 5, m12: 6, m20: 7, m21: 8, m22: 9 };
    const t = transposeMatrix(m);
    expect(t.m01).toBe(4);
    expect(t.m10).toBe(2);
    expect(t.m21).toBe(6);
  });
});

describe('Matrix <-> Quaternion', () => {
  it('should convert matrix to quaternion', () => {
    const m = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
    const q = matrixToQuaternion(m);
    expect(Math.abs(q.w)).toBeCloseTo(1, 6);
  });

  it('should convert quaternion to matrix', () => {
    const q = { w: 1, x: 0, y: 0, z: 0 };
    const m = quaternionToMatrix(q);
    expect(m.m00).toBeCloseTo(1, 6);
    expect(m.m11).toBeCloseTo(1, 6);
    expect(m.m22).toBeCloseTo(1, 6);
  });

  it('should be round-trip consistent', () => {
    const angle = Math.PI / 6;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m = { m00: c, m01: -s, m02: 0, m10: s, m11: c, m12: 0, m20: 0, m21: 0, m22: 1 };
    const q = matrixToQuaternion(m);
    const mBack = quaternionToMatrix(q);
    expect(mBack.m00).toBeCloseTo(m.m00, 5);
    expect(mBack.m11).toBeCloseTo(m.m11, 5);
    expect(mBack.m22).toBeCloseTo(m.m22, 5);
  });
});

describe('Quaternion', () => {
  it('should multiply quaternions', () => {
    const q1 = { w: 1, x: 0, y: 0, z: 0 };
    const q2 = { w: 1, x: 0, y: 0, z: 0 };
    const result = quaternionMultiply(q1, q2);
    expect(result.w).toBe(1);
  });

  it('should invert quaternion', () => {
    const q = { w: 0.5, x: 0.5, y: 0.5, z: 0.5 };
    const qInv = quaternionInverse(q);
    const result = quaternionMultiply(q, qInv);
    expect(Math.abs(result.w)).toBeCloseTo(1, 5);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  it('should rotate vector using quaternion', () => {
    const q = { w: Math.cos(Math.PI / 4), x: 0, y: Math.sin(Math.PI / 4), z: 0 };
    const v = { x: 1, y: 0, z: 0 };
    const result = rotateVectorQuaternion(q, v);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(-1, 5);
  });
});

describe('Euler <-> Quaternion', () => {
  it('should convert euler angles to quaternion', () => {
    const q = eulerToQuaternion(0, 0, 0);
    expect(q.w).toBe(1);
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
  });

  it('should be round-trip consistent', () => {
    const q = eulerToQuaternion(0.1, 0.2, 0.3);
    const euler = quaternionToEuler(q);
    expect(euler.alpha).toBeCloseTo(0.1, 5);
    expect(euler.delta).toBeCloseTo(0.2, 5);
    expect(euler.gamma).toBeCloseTo(0.3, 5);
  });
});

describe('Reference Frame Computations', () => {
  it('should compute precession matrix', () => {
    const m = computePrecessionMatrix(58849.0);
    expect(typeof m.m00).toBe('number');
    expect(!isNaN(m.m00)).toBe(true);
  });

  it('should compute nutation matrix', () => {
    const m = computeNutationMatrix(58849.0);
    expect(typeof m.m00).toBe('number');
    expect(!isNaN(m.m00)).toBe(true);
  });

  it('should compute GMST', () => {
    const gmst = computeGmst(58849.0);
    expect(gmst).toBeGreaterThanOrEqual(0);
    expect(gmst).toBeLessThan(24);
  });

  it('should compute sidereal time', () => {
    const lmst = computeSiderealTime(58849.0, 120);
    expect(lmst).toBeGreaterThanOrEqual(0);
    expect(lmst).toBeLessThan(24);
  });

  it('should compute ECI to ECEF matrix', () => {
    const m = computeEciToEcefMatrix(58849.0);
    expect(typeof m.m00).toBe('number');
    expect(!isNaN(m.m00)).toBe(true);
  });

  it('should compute equatorial to ecliptic matrix', () => {
    const m = computeEquatorialToEclipticMatrix(58849.0);
    expect(typeof m.m00).toBe('number');
    expect(!isNaN(m.m00)).toBe(true);
  });
});

describe('Frame Transform', () => {
  it('should transform vector between frames', () => {
    const pos = { x: 1, y: 0, z: 0 };
    const result = transformFrame(pos, 'SolarSystemBarycentricInertial', 'HeliocentricInertial', 58849.0, 58849.0);
    expect(typeof result.x).toBe('number');
    expect(!isNaN(result.x)).toBe(true);
  });

  it('should return same vector for same frame', () => {
    const pos = { x: 1, y: 2, z: 3 };
    const result = transformFrame(pos, 'BodyBarycentric', 'BodyBarycentric', 58849.0, 58849.0);
    expect(result.x).toBe(1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(3);
  });
});

describe('Body Fixed Orientation', () => {
  it('should compute body fixed orientation', () => {
    const q = computeBodyFixedOrientation(58849.0, 0, 90, 0);
    expect(typeof q.w).toBe('number');
    expect(!isNaN(q.w)).toBe(true);
  });
});
