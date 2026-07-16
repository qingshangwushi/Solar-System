import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AXIAL_MODELS,
  computeAttitude,
  computeRotationAngle,
  computeSubpoint,
  createRotationMatrixFromPole,
  matrixToQuaternion,
  quaternionMultiply,
  rotateVectorByQuaternion,
  getAxialModel,
  degToRad,
  radToDeg,
} from '../attitude.js';

describe('Attitude System', () => {
  describe('Angle Conversion', () => {
    it('should convert degrees to radians', () => {
      expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
      expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
      expect(degToRad(0)).toBe(0);
    });

    it('should convert radians to degrees', () => {
      expect(radToDeg(Math.PI)).toBeCloseTo(180, 10);
      expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 10);
      expect(radToDeg(0)).toBe(0);
    });
  });

  describe('Rotation Matrix from Pole', () => {
    it('should create rotation matrix for Earth pole', () => {
      const matrix = createRotationMatrixFromPole(0, 90);
      expect(matrix.r00).toBeCloseTo(0, 10);
      expect(matrix.r01).toBeCloseTo(1, 10);
      expect(matrix.r02).toBeCloseTo(0, 10);
      expect(matrix.r22).toBeCloseTo(0, 10);
    });

    it('should create rotation matrix for equator pole', () => {
      const matrix = createRotationMatrixFromPole(0, 0);
      expect(matrix.r22).toBeCloseTo(1, 10);
    });
  });

  describe('Matrix to Quaternion', () => {
    it('should convert identity matrix to identity quaternion', () => {
      const matrix = {
        r00: 1, r01: 0, r02: 0,
        r10: 0, r11: 1, r12: 0,
        r20: 0, r21: 0, r22: 1,
      };
      const quat = matrixToQuaternion(matrix);
      expect(quat.w).toBeCloseTo(1, 10);
      expect(quat.x).toBeCloseTo(0, 10);
      expect(quat.y).toBeCloseTo(0, 10);
      expect(quat.z).toBeCloseTo(0, 10);
    });

    it('should convert 90 degree rotation matrix to quaternion', () => {
      const matrix = {
        r00: 0, r01: -1, r02: 0,
        r10: 1, r11: 0, r12: 0,
        r20: 0, r21: 0, r22: 1,
      };
      const quat = matrixToQuaternion(matrix);
      const norm = Math.sqrt(quat.x ** 2 + quat.y ** 2 + quat.z ** 2 + quat.w ** 2);
      expect(norm).toBeCloseTo(1, 10);
    });
  });

  describe('Quaternion Operations', () => {
    it('should multiply two quaternions', () => {
      const q1 = { x: 0, y: 0, z: 0, w: 1 };
      const q2 = { x: 0, y: 0, z: 0, w: 1 };
      const result = quaternionMultiply(q1, q2);
      expect(result.w).toBeCloseTo(1, 10);
      expect(result.x).toBeCloseTo(0, 10);
    });

    it('should rotate vector by quaternion', () => {
      const vec = { x: 1, y: 0, z: 0 };
      const quat = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
      const result = rotateVectorByQuaternion(vec, quat);
      expect(result.x).toBeCloseTo(0, 10);
      expect(result.y).toBeCloseTo(1, 10);
      expect(result.z).toBeCloseTo(0, 10);
    });
  });

  describe('Rotation Angle', () => {
    it('should compute rotation angle at J2000', () => {
      const model = DEFAULT_AXIAL_MODELS.Earth;
      const angle = computeRotationAngle(51544.5, model);
      expect(angle).toBeCloseTo(0, 10);
    });

    it('should compute rotation angle after one sidereal day', () => {
      const model = DEFAULT_AXIAL_MODELS.Earth;
      const siderealDays = model.rotationPeriod / 86400;
      const angle = computeRotationAngle(51544.5 + siderealDays, model);
      expect(angle).toBeCloseTo(2 * Math.PI, 6);
    });
  });

  describe('Attitude Computation', () => {
    it('should compute Earth attitude', () => {
      const model = DEFAULT_AXIAL_MODELS.Earth;
      const attitude = computeAttitude(51544.5, model);
      const norm = Math.sqrt(
        attitude.orientation.x ** 2 +
        attitude.orientation.y ** 2 +
        attitude.orientation.z ** 2 +
        attitude.orientation.w ** 2
      );
      expect(norm).toBeCloseTo(1, 10);
      expect(attitude.polePosition.z).toBeCloseTo(1, 10);
    });

    it('should compute Mars attitude', () => {
      const model = DEFAULT_AXIAL_MODELS.Mars;
      const attitude = computeAttitude(51544.5, model);
      const norm = Math.sqrt(
        attitude.orientation.x ** 2 +
        attitude.orientation.y ** 2 +
        attitude.orientation.z ** 2 +
        attitude.orientation.w ** 2
      );
      expect(norm).toBeCloseTo(1, 10);
    });

    it('should compute Moon attitude (tidally locked)', () => {
      const model = DEFAULT_AXIAL_MODELS.Moon;
      const attitude = computeAttitude(51544.5, model);
      const norm = Math.sqrt(
        attitude.orientation.x ** 2 +
        attitude.orientation.y ** 2 +
        attitude.orientation.z ** 2 +
        attitude.orientation.w ** 2
      );
      expect(norm).toBeCloseTo(1, 10);
    });
  });

  describe('Subpoint Computation', () => {
    it('should compute subpoint for observer along positive x-axis', () => {
      const model = DEFAULT_AXIAL_MODELS.Earth;
      const bodyPosition = { x: 0, y: 0, z: 0 };
      const observerPosition = { x: 10000, y: 0, z: 0 };
      const subpoint = computeSubpoint(bodyPosition, observerPosition, model, 51544.5);
      const norm = Math.sqrt(subpoint.x ** 2 + subpoint.y ** 2 + subpoint.z ** 2);
      expect(norm).toBeCloseTo(1, 10);
    });
  });

  describe('Axial Models', () => {
    it('should get Earth axial model', () => {
      const model = getAxialModel('Earth');
      expect(model).toBeDefined();
      expect(model!.obliquity).toBeCloseTo(23.439281, 5);
    });

    it('should get Venus axial model (retrograde rotation)', () => {
      const model = getAxialModel('Venus');
      expect(model).toBeDefined();
      expect(model!.angleRate).toBeLessThan(0);
    });

    it('should get Uranus axial model (extreme obliquity)', () => {
      const model = getAxialModel('Uranus');
      expect(model).toBeDefined();
      expect(Math.abs(model!.obliquity)).toBeGreaterThan(90);
    });

    it('should return undefined for unknown body', () => {
      const model = getAxialModel('Unknown');
      expect(model).toBeUndefined();
    });
  });
});