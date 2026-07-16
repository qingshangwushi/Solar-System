/**
 * 浮动原点与局部参考系测试（任务 P0-14 验证）。
 */
import { describe, it, expect } from 'vitest';
import { FloatingOrigin, LocalReferenceFrame, HighLowSplitter } from '../index.js';

describe('FloatingOrigin', () => {
  it('transforms world to local coordinates', () => {
    const origin = new FloatingOrigin();
    origin.position = { x: 1000000, y: 2000000, z: 3000000 };

    const worldPos = { x: 1000100, y: 2000200, z: 3000300 };
    const localPos = origin.transformToLocal(worldPos);

    expect(localPos[0]).toBeCloseTo(100, 5);
    expect(localPos[1]).toBeCloseTo(200, 5);
    expect(localPos[2]).toBeCloseTo(300, 5);
  });

  it('transforms local to world coordinates', () => {
    const origin = new FloatingOrigin();
    origin.position = { x: 1000000, y: 2000000, z: 3000000 };

    const localPos = new Float32Array([100, 200, 300]);
    const worldPos = origin.transformToWorld(localPos);

    expect(worldPos.x).toBeCloseTo(1000100, 5);
    expect(worldPos.y).toBeCloseTo(2000200, 5);
    expect(worldPos.z).toBeCloseTo(3000300, 5);
  });

  it('updates origin when threshold exceeded', () => {
    const origin = new FloatingOrigin();
    origin.position = { x: 0, y: 0, z: 0 };

    const updated = origin.update({ x: 2000000, y: 0, z: 0 }, 1000000);
    expect(updated).toBe(true);
    expect(origin.position.x).toBe(2000000);
  });

  it('does not update origin when within threshold', () => {
    const origin = new FloatingOrigin();
    origin.position = { x: 0, y: 0, z: 0 };

    const updated = origin.update({ x: 500000, y: 0, z: 0 }, 1000000);
    expect(updated).toBe(false);
    expect(origin.position.x).toBe(0);
  });
});

describe('LocalReferenceFrame', () => {
  it('transforms point with identity rotation', () => {
    const frame = new LocalReferenceFrame({ x: 10, y: 20, z: 30 });
    const point = { x: 1, y: 2, z: 3 };
    const result = frame.transformPoint(point);

    expect(result.x).toBe(11);
    expect(result.y).toBe(22);
    expect(result.z).toBe(33);
  });

  it('inverse transform returns original point', () => {
    const frame = new LocalReferenceFrame({ x: 10, y: 20, z: 30 });
    const point = { x: 1, y: 2, z: 3 };
    const transformed = frame.transformPoint(point);
    const result = frame.inverseTransformPoint(transformed);

    expect(result.x).toBeCloseTo(point.x, 10);
    expect(result.y).toBeCloseTo(point.y, 10);
    expect(result.z).toBeCloseTo(point.z, 10);
  });

  it('applies scale', () => {
    const frame = new LocalReferenceFrame({ x: 0, y: 0, z: 0 }, undefined, 2);
    const point = { x: 1, y: 2, z: 3 };
    const result = frame.transformPoint(point);

    expect(result.x).toBe(2);
    expect(result.y).toBe(4);
    expect(result.z).toBe(6);
  });
});

describe('HighLowSplitter', () => {
  it('splits and recombines vector', () => {
    const vec = { x: 1.23456789e15, y: 9.87654321e14, z: -5.55555555e13 };
    const { high, low } = HighLowSplitter.split(vec);
    const result = HighLowSplitter.combine(high, low);

    expect(result.x).toBeCloseTo(vec.x, 10);
    expect(result.y).toBeCloseTo(vec.y, 10);
    expect(result.z).toBeCloseTo(vec.z, 10);
  });

  it('computes difference correctly', () => {
    const a = { x: 100000000, y: 0, z: 0 };
    const b = { x: 99999999, y: 0, z: 0 };
    const diff = HighLowSplitter.difference(a, b);

    expect(diff[0]).toBeCloseTo(1, 3);
  });
});
