import { describe, it, expect } from 'vitest';
import {
  createSnapshot,
  cloneSnapshot,
  interpolatePosition,
  interpolateVelocity,
  slerp,
  interpolateOrientation,
  sampleOrbitUniformly,
  sampleOrbitAdaptive,
  sampleAttitudeUniformly,
  findNearestSnapshot,
  findSnapshotsAround,
  validateSnapshot,
} from '../snapshot.js';

describe('State Snapshot', () => {
  describe('Create and Clone', () => {
    it('should create a snapshot', () => {
      const snapshot = createSnapshot(
        51544.5,
        { x: 1, y: 2, z: 3 },
        { x: 0.1, y: 0.2, z: 0.3 },
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 0, y: 0, z: 0.001 },
      );
      expect(snapshot.mjd).toBe(51544.5);
      expect(snapshot.position.x).toBe(1);
      expect(snapshot.velocity.x).toBe(0.1);
      expect(snapshot.orientation!.w).toBe(1);
      expect(snapshot.angularVelocity!.z).toBe(0.001);
      expect(snapshot.valid).toBe(true);
    });

    it('should clone a snapshot', () => {
      const original = createSnapshot(
        51544.5,
        { x: 1, y: 2, z: 3 },
        { x: 0.1, y: 0.2, z: 0.3 },
      );
      const cloned = cloneSnapshot(original);
      expect(cloned.mjd).toBe(original.mjd);
      expect(cloned.position).toEqual(original.position);
      expect(cloned.velocity).toEqual(original.velocity);
      cloned.position.x = 99;
      expect(original.position.x).toBe(1);
    });
  });

  describe('Position Interpolation', () => {
    it('should interpolate position at start', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const s2 = createSnapshot(1, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const result = interpolatePosition(s1, s2, 0);
      expect(result.x).toBeCloseTo(0, 10);
    });

    it('should interpolate position at end', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const s2 = createSnapshot(1, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const result = interpolatePosition(s1, s2, 1);
      expect(result.x).toBeCloseTo(1, 10);
    });

    it('should interpolate position at midpoint with constant velocity', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
      const s2 = createSnapshot(1, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
      const result = interpolatePosition(s1, s2, 0.5);
      expect(result.x).toBeCloseTo(1, 10);
    });

    it('should return zero for invalid snapshots', () => {
      const s1 = { mjd: 0, position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, valid: false };
      const s2 = createSnapshot(1, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      const result = interpolatePosition(s1, s2, 0.5);
      expect(result.x).toBe(0);
    });
  });

  describe('Velocity Interpolation', () => {
    it('should interpolate velocity at start', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const s2 = createSnapshot(1, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const result = interpolateVelocity(s1, s2, 0);
      expect(result.x).toBeCloseTo(1, 10);
    });

    it('should interpolate velocity at end', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const s2 = createSnapshot(1, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const result = interpolateVelocity(s1, s2, 1);
      expect(result.x).toBeCloseTo(1, 10);
    });
  });

  describe('Quaternion Slerp', () => {
    it('should slerp from identity to rotated quaternion', () => {
      const q1 = { x: 0, y: 0, z: 0, w: 1 };
      const q2 = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
      const result = slerp(q1, q2, 0.5);
      const norm = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2 + result.w ** 2);
      expect(norm).toBeCloseTo(1, 10);
    });

    it('should return q1 when t=0', () => {
      const q1 = { x: 0, y: 0, z: 0, w: 1 };
      const q2 = { x: 0, y: 0, z: 1, w: 0 };
      const result = slerp(q1, q2, 0);
      expect(result.w).toBeCloseTo(1, 10);
    });

    it('should return q2 when t=1', () => {
      const q1 = { x: 0, y: 0, z: 0, w: 1 };
      const q2 = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
      const result = slerp(q1, q2, 1);
      expect(result.z).toBeCloseTo(q2.z, 10);
    });
  });

  describe('Orientation Interpolation', () => {
    it('should interpolate orientation at start', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
      const s2 = createSnapshot(1, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) });
      const result = interpolateOrientation(s1, s2, 0);
      expect(result!.w).toBeCloseTo(1, 10);
    });

    it('should return undefined for missing orientation', () => {
      const s1 = createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      const s2 = createSnapshot(1, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
      const result = interpolateOrientation(s1, s2, 0.5);
      expect(result).toBeUndefined();
    });
  });

  describe('Orbit Sampling', () => {
    it('should sample orbit uniformly', () => {
      const evaluator = (mjd: number) => ({
        position: { x: mjd, y: mjd * 2, z: mjd * 3 },
        velocity: { x: 1, y: 2, z: 3 },
      });
      const samples = sampleOrbitUniformly(evaluator, 0, 10, 11);
      expect(samples.length).toBe(11);
      expect(samples[0].mjd).toBe(0);
      expect(samples[10].mjd).toBe(10);
      expect(samples[5].position.x).toBe(5);
    });

    it('should sample orbit adaptively', () => {
      const evaluator = (mjd: number) => ({
        position: { x: mjd, y: mjd * 2, z: mjd * 3 },
        velocity: { x: 1, y: 2, z: 3 },
      });
      const samples = sampleOrbitAdaptive(evaluator, 0, 10, 0.1);
      expect(samples.length).toBeGreaterThanOrEqual(2);
      expect(samples[0].mjd).toBe(0);
      expect(samples[samples.length - 1].mjd).toBe(10);
    });
  });

  describe('Attitude Sampling', () => {
    it('should sample attitude uniformly', () => {
      const evaluator = (mjd: number) => ({
        orientation: { x: 0, y: 0, z: Math.sin(mjd), w: Math.cos(mjd) },
        angularVelocity: { x: 0, y: 0, z: 1 },
      });
      const samples = sampleAttitudeUniformly(evaluator, 0, 1, 5);
      expect(samples.length).toBe(5);
      expect(samples[0].mjd).toBe(0);
      expect(samples[4].mjd).toBe(1);
    });
  });

  describe('Snapshot Search', () => {
    it('should find nearest snapshot', () => {
      const snapshots = [
        createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        createSnapshot(10, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        createSnapshot(20, { x: 20, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      ];
      const result = findNearestSnapshot(snapshots, 12);
      expect(result!.mjd).toBe(10);
    });

    it('should find snapshots around time', () => {
      const snapshots = [
        createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        createSnapshot(10, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        createSnapshot(20, { x: 20, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      ];
      const result = findSnapshotsAround(snapshots, 12);
      expect(result.before!.mjd).toBe(10);
      expect(result.after!.mjd).toBe(20);
    });

    it('should handle time before first snapshot', () => {
      const snapshots = [
        createSnapshot(10, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        createSnapshot(20, { x: 20, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      ];
      const result = findSnapshotsAround(snapshots, 5);
      expect(result.before).toBeUndefined();
      expect(result.after!.mjd).toBe(10);
    });

    it('should handle time after last snapshot', () => {
      const snapshots = [
        createSnapshot(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        createSnapshot(10, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      ];
      const result = findSnapshotsAround(snapshots, 15);
      expect(result.before!.mjd).toBe(10);
      expect(result.after).toBeUndefined();
    });
  });

  describe('Snapshot Validation', () => {
    it('should validate valid snapshot', () => {
      const snapshot = createSnapshot(
        51544.5,
        { x: 1, y: 2, z: 3 },
        { x: 0.1, y: 0.2, z: 0.3 },
        { x: 0, y: 0, z: 0, w: 1 },
      );
      expect(validateSnapshot(snapshot)).toBe(true);
    });

    it('should invalidate snapshot with NaN position', () => {
      const snapshot = {
        mjd: 51544.5,
        position: { x: NaN, y: 2, z: 3 },
        velocity: { x: 0.1, y: 0.2, z: 0.3 },
        valid: true,
      };
      expect(validateSnapshot(snapshot)).toBe(false);
    });

    it('should invalidate snapshot with non-unit quaternion', () => {
      const snapshot = createSnapshot(
        51544.5,
        { x: 1, y: 2, z: 3 },
        { x: 0.1, y: 0.2, z: 0.3 },
        { x: 1, y: 1, z: 1, w: 1 },
      );
      expect(validateSnapshot(snapshot)).toBe(false);
    });
  });
});