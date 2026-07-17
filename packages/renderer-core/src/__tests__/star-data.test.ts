/**
 * StarData / StellarBackground 接线测试（审计项 E-17 / E-34 修复验证）。
 */
import { describe, it, expect } from 'vitest';
import { StarData, ExtendedSpaceEnvironmentImpl } from '../extended-space.js';
import type { StellarBackground } from '../extended-space.js';

describe('StarData', () => {
  it('implements StellarBackground (all required methods exist)', () => {
    // 编译期检查：StarData 可赋值给 StellarBackground。
    const starData: StellarBackground = new StarData();

    expect(typeof starData.update).toBe('function');
    expect(typeof starData.render).toBe('function');
    expect(typeof starData.dispose).toBe('function');
    expect(typeof starData.setStarDensity).toBe('function');
    expect(typeof starData.setMagnitudeRange).toBe('function');
  });

  it('render() does not throw TypeError after update()', () => {
    const starData = new StarData();
    starData.update({ x: 0, y: 0, z: 0 });

    expect(() => starData.render()).not.toThrow();
  });

  it('update/setStarDensity/setMagnitudeRange/dispose do not throw', () => {
    const starData = new StarData();

    expect(() => starData.update({ x: 1, y: 2, z: 3 })).not.toThrow();
    expect(() => starData.setStarDensity(100)).not.toThrow();
    expect(() => starData.setMagnitudeRange(0, 7)).not.toThrow();
    expect(() => starData.dispose()).not.toThrow();
  });
});

describe('ExtendedSpaceEnvironmentImpl', () => {
  it('constructs without throwing', () => {
    expect(() => new ExtendedSpaceEnvironmentImpl()).not.toThrow();
  });

  it('render() does not throw TypeError on the stellar background', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    env.update(0, { x: 0, y: 0, z: 0 });

    // 修复前 stellarBackground 为 {} as StellarBackground，render() 会抛
    // "TypeError: render is not a function"。
    expect(() => env.render()).not.toThrow();
  });
});
