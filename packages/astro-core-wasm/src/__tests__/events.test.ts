import { describe, it, expect } from 'vitest';
import {
  findRoot,
  findRootNewton,
  findAllRoots,
  computeMoonPhase,
  computeConjunctionAngle,
  computeOrbitalRadius,
  dot,
  cross,
  norm,
  normalize,
  EventResult,
} from '../events.js';

describe('Event Algorithms', () => {
  describe('Vector Operations', () => {
    it('should compute dot product', () => {
      const v1 = { x: 1, y: 0, z: 0 };
      const v2 = { x: 1, y: 0, z: 0 };
      expect(dot(v1, v2)).toBe(1);
    });

    it('should compute cross product', () => {
      const v1 = { x: 1, y: 0, z: 0 };
      const v2 = { x: 0, y: 1, z: 0 };
      const result = cross(v1, v2);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(1);
    });

    it('should compute norm', () => {
      const v = { x: 3, y: 4, z: 0 };
      expect(norm(v)).toBe(5);
    });

    it('should normalize vector', () => {
      const v = { x: 2, y: 0, z: 0 };
      const result = normalize(v);
      expect(result.x).toBe(1);
      expect(norm(result)).toBeCloseTo(1, 10);
    });

    it('should handle zero vector normalization', () => {
      const v = { x: 0, y: 0, z: 0 };
      const result = normalize(v);
      expect(result.x).toBe(0);
    });
  });

  describe('Root Finding', () => {
    it('should find root of linear function', () => {
      const func = (x: number) => x - 5;
      const root = findRoot(func, 0, 10);
      expect(root).toBeCloseTo(5, 10);
    });

    it('should find root of quadratic function', () => {
      const func = (x: number) => x * x - 4;
      const root = findRoot(func, 0, 5);
      expect(root).toBeCloseTo(2, 8);
    });

    it('should return null when no root in interval', () => {
      const func = (x: number) => x + 1;
      const root = findRoot(func, 0, 10);
      expect(root).toBeNull();
    });

    it('should find root at boundary', () => {
      const func = (x: number) => x;
      const root = findRoot(func, 0, 10);
      expect(root).toBeCloseTo(0, 10);
    });

    it('should find root using Newton-Raphson', () => {
      const func = (x: number) => x * x - 4;
      const derivative = (x: number) => 2 * x;
      const root = findRootNewton(func, derivative, 1);
      expect(root).toBeCloseTo(2, 10);
    });

    it('should find multiple roots', () => {
      const func = (x: number) => Math.sin(x);
      const roots = findAllRoots(func, 0, 10, 2);
      expect(roots.length).toBe(4);
      expect(roots[0]).toBeCloseTo(0, 5);
      expect(roots[1]).toBeCloseTo(Math.PI, 5);
      expect(roots[2]).toBeCloseTo(2 * Math.PI, 5);
      expect(roots[3]).toBeCloseTo(3 * Math.PI, 5);
    });
  });

  describe('Moon Phase', () => {
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

    it('should compute first quarter phase', () => {
      const sunPos = { x: 1000, y: 0, z: 0 };
      const moonPos = { x: 500, y: 500, z: 0 };
      const earthPos = { x: 0, y: 0, z: 0 };
      const phase = computeMoonPhase(sunPos, moonPos, earthPos);
      expect(phase).toBeCloseTo(Math.PI / 2, 10);
    });
  });

  describe('Conjunction Angle', () => {
    it('should compute conjunction angle for aligned bodies', () => {
      const bodyPos = { x: 2000, y: 0, z: 0 };
      const sunPos = { x: 1000, y: 0, z: 0 };
      const earthPos = { x: 0, y: 0, z: 0 };
      const angle = computeConjunctionAngle(bodyPos, sunPos, earthPos);
      expect(angle).toBeCloseTo(0, 10);
    });

    it('should compute conjunction angle for opposition', () => {
      const bodyPos = { x: -1000, y: 0, z: 0 };
      const sunPos = { x: 1000, y: 0, z: 0 };
      const earthPos = { x: 0, y: 0, z: 0 };
      const angle = computeConjunctionAngle(bodyPos, sunPos, earthPos);
      expect(angle).toBeCloseTo(Math.PI, 10);
    });

    it('should compute conjunction angle for 90 degrees', () => {
      const bodyPos = { x: 0, y: 1000, z: 0 };
      const sunPos = { x: 1000, y: 0, z: 0 };
      const earthPos = { x: 0, y: 0, z: 0 };
      const angle = computeConjunctionAngle(bodyPos, sunPos, earthPos);
      expect(angle).toBeCloseTo(Math.PI / 2, 10);
    });
  });

  describe('Orbital Radius', () => {
    it('should compute orbital radius', () => {
      const bodyPos = { x: 3, y: 4, z: 0 };
      const centralPos = { x: 0, y: 0, z: 0 };
      const radius = computeOrbitalRadius(bodyPos, centralPos);
      expect(radius).toBe(5);
    });

    it('should compute orbital radius with offset central body', () => {
      const bodyPos = { x: 5, y: 5, z: 0 };
      const centralPos = { x: 2, y: 1, z: 0 };
      const radius = computeOrbitalRadius(bodyPos, centralPos);
      expect(radius).toBe(5);
    });
  });
});