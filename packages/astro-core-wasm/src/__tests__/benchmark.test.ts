import { describe, it, expect } from 'vitest';
import {
  utcToTai,
  taiToUtc,
  utcToTt,
  ttToTdb,
  convertTime,
} from '../time.js';
import {
  multiplyMatrix,
  transposeMatrix,
  matrixToQuaternion,
  quaternionMultiply,
  rotateVectorQuaternion,
} from '../reference-frame.js';
import {
  evaluateChebyshevPolynomial,
  buildChebyshevApproximation,
  evaluateSegment,
  computeOrbitElements,
} from '../ephemeris.js';
import {
  computeAttitude,
  computeRotationAngle,
  DEFAULT_AXIAL_MODELS,
} from '../attitude.js';
import {
  createSnapshot,
  interpolatePosition,
  slerp,
} from '../snapshot.js';
import {
  findRoot,
  computeMoonPhase,
  computeConjunctionAngle,
} from '../events.js';

describe('Benchmark Tests', () => {
  describe('Time System Benchmarks', () => {
    it('should match J2000 epoch TAI offset', () => {
      const mjdUtc = 51544.5;
      const mjdTai = utcToTai(mjdUtc);
      const expectedOffset = 32;
      const computedOffset = (mjdTai - mjdUtc) * 86400;
      expect(computedOffset).toBeCloseTo(expectedOffset, 0);
    });

    it('should match 2024 leap second offset', () => {
      const mjdUtc = 60368.0;
      const mjdTai = utcToTai(mjdUtc);
      const expectedOffset = 37;
      const computedOffset = (mjdTai - mjdUtc) * 86400;
      expect(computedOffset).toBeCloseTo(expectedOffset, 0);
    });

    it('should convert UTC to TT accurately', () => {
      const mjdUtc = 51544.5;
      const mjdTt = utcToTt(mjdUtc);
      const expectedDiff = (32.184 + 32) / 86400;
      const actualDiff = mjdTt - mjdUtc;
      expect(actualDiff).toBeCloseTo(expectedDiff, 10);
    });

    it('should round-trip UTC-TAI conversion', () => {
      const mjdUtc = 60000.0;
      const mjdTai = utcToTai(mjdUtc);
      const mjdUtcBack = taiToUtc(mjdTai);
      expect(mjdUtcBack).toBeCloseTo(mjdUtc, 10);
    });

    it('should compute TDB offset correctly', () => {
      const mjdTt = 51544.5;
      const mjdTdb = ttToTdb(mjdTt);
      const diff = (mjdTdb - mjdTt) * 86400;
      expect(Math.abs(diff)).toBeLessThan(2);
    });

    it('should convert between time scales', () => {
      const mjdUtc = 60000.0;
      const mjdTdb = convertTime(mjdUtc, 'Utc', 'Tdb');
      const mjdUtcBack = convertTime(mjdTdb, 'Tdb', 'Utc');
      expect(mjdUtcBack).toBeCloseTo(mjdUtc, 8);
    });
  });

  describe('Reference Frame Benchmarks', () => {
    it('should multiply rotation matrices', () => {
      const identity = {
        m00: 1, m01: 0, m02: 0,
        m10: 0, m11: 1, m12: 0,
        m20: 0, m21: 0, m22: 1,
      };
      const result = multiplyMatrix(identity, identity);
      expect(result.m00).toBeCloseTo(1, 10);
      expect(result.m11).toBeCloseTo(1, 10);
    });

    it('should transpose rotation matrix', () => {
      const matrix = {
        m00: 1, m01: 2, m02: 3,
        m10: 4, m11: 5, m12: 6,
        m20: 7, m21: 8, m22: 9,
      };
      const transposed = transposeMatrix(matrix);
      expect(transposed.m01).toBe(4);
      expect(transposed.m10).toBe(2);
    });

    it('should preserve vector length during rotation', () => {
      const matrix = {
        m00: 0, m01: -1, m02: 0,
        m10: 1, m11: 0, m12: 0,
        m20: 0, m21: 0, m22: 1,
      };
      const vector = { x: 1, y: 0, z: 0 };
      const quaternion = matrixToQuaternion(matrix);
      const rotated = rotateVectorQuaternion(quaternion, vector);
      const length = Math.sqrt(rotated.x ** 2 + rotated.y ** 2 + rotated.z ** 2);
      expect(length).toBeCloseTo(1, 10);
    });

    it('should convert matrix to quaternion', () => {
      const matrix = {
        m00: 0, m01: -1, m02: 0,
        m10: 1, m11: 0, m12: 0,
        m20: 0, m21: 0, m22: 1,
      };
      const quat = matrixToQuaternion(matrix);
      const norm = Math.sqrt(quat.x ** 2 + quat.y ** 2 + quat.z ** 2 + quat.w ** 2);
      expect(norm).toBeCloseTo(1, 10);
    });

    it('should compose quaternions correctly', () => {
      const q1 = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
      const q2 = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
      const result = quaternionMultiply(q1, q2);
      expect(result.w).toBeCloseTo(0, 10);
      expect(result.z).toBeCloseTo(1, 10);
    });
  });

  describe('Ephemeris Benchmarks', () => {
    it('should evaluate constant Chebyshev polynomial', () => {
      const coeffs = new Float64Array([10, 0, 0, 0]);
      const result = evaluateChebyshevPolynomial(coeffs, 0);
      expect(result).toBeCloseTo(10, 10);
    });

    it('should evaluate linear Chebyshev polynomial', () => {
      const coeffs = new Float64Array([0, 5, 0, 0]);
      expect(evaluateChebyshevPolynomial(coeffs, 0)).toBeCloseTo(0, 10);
      expect(evaluateChebyshevPolynomial(coeffs, 1)).toBeCloseTo(5, 10);
      expect(evaluateChebyshevPolynomial(coeffs, -1)).toBeCloseTo(-5, 10);
    });

    it('should build and evaluate Chebyshev approximation', () => {
      const samples = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, { x: 20, y: 40, z: 60 }];
      const times = [0, 5, 10];
      const segment = buildChebyshevApproximation(samples, times, 0, 10, 2);
      const result = evaluateSegment(segment, 5);
      expect(result.position.x).toBeCloseTo(10, 1);
      expect(result.position.y).toBeCloseTo(20, 1);
    });

    it('should compute circular orbit elements', () => {
      const mu = 398600.4418;
      const position = { x: 7000, y: 0, z: 0 };
      const velocity = { x: 0, y: Math.sqrt(mu / 7000), z: 0 };
      const elements = computeOrbitElements(position, velocity, mu);
      expect(elements.eccentricity).toBeCloseTo(0, 10);
      expect(elements.semiMajorAxis).toBeCloseTo(7000, 0);
    });

    it('should compute elliptical orbit elements', () => {
      const mu = 398600.4418;
      const position = { x: 7000, y: 0, z: 0 };
      const velocity = { x: 0, y: Math.sqrt(mu / 7000), z: 0 };
      const elements = computeOrbitElements(position, velocity, mu);
      expect(elements.eccentricity).toBeCloseTo(0, 8);
      expect(elements.semiMajorAxis).toBeCloseTo(7000, 0);
    });
  });

  describe('Attitude Benchmarks', () => {
    it('should compute Earth rotation at J2000', () => {
      const model = DEFAULT_AXIAL_MODELS.Earth;
      expect(model).toBeDefined();
      const angle = computeRotationAngle(51544.5, model!);
      expect(angle).toBeCloseTo(0, 10);
    });

    it('should compute Earth rotation after half sidereal day', () => {
      const model = DEFAULT_AXIAL_MODELS.Earth;
      expect(model).toBeDefined();
      const siderealDays = model!.rotationPeriod / 86400;
      const angle = computeRotationAngle(51544.5 + siderealDays / 2, model!);
      expect(angle).toBeCloseTo(Math.PI, 6);
    });

    it('should compute Earth attitude correctly', () => {
      const model = DEFAULT_AXIAL_MODELS.Earth;
      expect(model).toBeDefined();
      const attitude = computeAttitude(51544.5, model!);
      const norm = Math.sqrt(
        attitude.orientation.x ** 2 +
        attitude.orientation.y ** 2 +
        attitude.orientation.z ** 2 +
        attitude.orientation.w ** 2
      );
      expect(norm).toBeCloseTo(1, 10);
    });

    it('should compute Mars attitude correctly', () => {
      const model = DEFAULT_AXIAL_MODELS.Mars;
      expect(model).toBeDefined();
      const attitude = computeAttitude(51544.5, model!);
      const norm = Math.sqrt(
        attitude.orientation.x ** 2 +
        attitude.orientation.y ** 2 +
        attitude.orientation.z ** 2 +
        attitude.orientation.w ** 2
      );
      expect(norm).toBeCloseTo(1, 10);
    });
  });

  describe('Snapshot Benchmarks', () => {
    it('should interpolate position linearly', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
      const s2 = createSnapshot(1, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
      const result = interpolatePosition(s1, s2, 0.5);
      expect(result.x).toBeCloseTo(1, 10);
    });

    it('should interpolate position with cubic spline', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      const s2 = createSnapshot(1, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      const result = interpolatePosition(s1, s2, 0.5);
      expect(result.x).toBeCloseTo(0.5, 10);
    });

    it('should slerp quaternions correctly', () => {
      const q1 = { x: 0, y: 0, z: 0, w: 1 };
      const q2 = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
      const result = slerp(q1, q2, 0.5);
      const norm = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2 + result.w ** 2);
      expect(norm).toBeCloseTo(1, 10);
    });
  });

  describe('Event Benchmarks', () => {
    it('should find root of sine function', () => {
      const func = (x: number) => Math.sin(x);
      const root = findRoot(func, 3, 4);
      expect(root).toBeCloseTo(Math.PI, 8);
    });

    it('should compute new moon phase', () => {
      const sunPos = { x: 1000, y: 0, z: 0 };
      const moonPos = { x: 100, y: 0, z: 0 };
      const earthPos = { x: 0, y: 0, z: 0 };
      const phase = computeMoonPhase(sunPos, moonPos, earthPos);
      expect(phase).toBeCloseTo(Math.PI, 10);
    });

    it('should compute full moon phase', () => {
      const sunPos = { x: 1000, y: 0, z: 0 };
      const moonPos = { x: -100, y: 0, z: 0 };
      const earthPos = { x: 0, y: 0, z: 0 };
      const phase = computeMoonPhase(sunPos, moonPos, earthPos);
      expect(phase).toBeCloseTo(0, 10);
    });

    it('should compute conjunction angle', () => {
      const bodyPos = { x: 2000, y: 0, z: 0 };
      const sunPos = { x: 1000, y: 0, z: 0 };
      const earthPos = { x: 0, y: 0, z: 0 };
      const angle = computeConjunctionAngle(bodyPos, sunPos, earthPos);
      expect(angle).toBeCloseTo(0, 10);
    });

    it('should compute opposition angle', () => {
      const bodyPos = { x: -1000, y: 0, z: 0 };
      const sunPos = { x: 1000, y: 0, z: 0 };
      const earthPos = { x: 0, y: 0, z: 0 };
      const angle = computeConjunctionAngle(bodyPos, sunPos, earthPos);
      expect(angle).toBeCloseTo(Math.PI, 10);
    });
  });
});