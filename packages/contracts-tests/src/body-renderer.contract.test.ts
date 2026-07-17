/**
 * BodyRenderer 接口契约测试（任务 18 / 修复 R-07）。
 *
 * 验证 `@solar-system/body-renderers` 中 `BodyRenderer` 接口：
 * - MockBodyRenderer 实现 BodyRenderer 接口（编译时 + 运行时）
 * - update(time, position, orientation, sunDirection) 签名匹配
 * - render() 签名匹配（无参）
 * - dispose 生命周期
 */
import { describe, it, expect } from 'vitest';
import type {
  BodyRenderer,
  BodyId,
  AssetTier,
} from '@solar-system/body-renderers';
import type { Vec3d, Quatd } from '@solar-system/schemas';

// ---------------------------------------------------------------------------
// MockBodyRenderer：完整实现 BodyRenderer 接口。
// ---------------------------------------------------------------------------

class MockBodyRenderer implements BodyRenderer {
  bodyId: BodyId;
  assetTier: AssetTier;
  enabled: boolean;

  updateCalls = 0;
  renderCalls = 0;
  disposeCalls = 0;
  setLODCalls = 0;
  private disposed = false;

  private lastTime = 0;
  private lastPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private lastOrientation: Quatd = { w: 1, x: 0, y: 0, z: 0 };
  private lastSunDirection: Vec3d = { x: 0, y: 0, z: 1 };
  private lodLevel = 0;

  constructor(bodyId: BodyId = 10, assetTier: AssetTier = 'S') {
    this.bodyId = bodyId;
    this.assetTier = assetTier;
    this.enabled = true;
  }

  update(time: number, position: Vec3d, orientation: Quatd, sunDirection: Vec3d): void {
    if (this.disposed) throw new Error('BodyRenderer disposed');
    this.updateCalls += 1;
    this.lastTime = time;
    this.lastPosition = position;
    this.lastOrientation = orientation;
    this.lastSunDirection = sunDirection;
  }

  render(): void {
    if (this.disposed) throw new Error('BodyRenderer disposed');
    if (!this.enabled) return;
    this.renderCalls += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeCalls += 1;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  getBoundingRadius(): number {
    return 1000;
  }

  setLOD(level: number): void {
    this.setLODCalls += 1;
    this.lodLevel = level;
  }

  getLOD(): number {
    return this.lodLevel;
  }

  getLastTime(): number {
    return this.lastTime;
  }

  getLastPosition(): Vec3d {
    return this.lastPosition;
  }

  getLastOrientation(): Quatd {
    return this.lastOrientation;
  }

  getLastSunDirection(): Vec3d {
    return this.lastSunDirection;
  }
}

// ---------------------------------------------------------------------------
// 编译时类型断言
// ---------------------------------------------------------------------------
const _typeCheck: BodyRenderer = new MockBodyRenderer(399, 'S');
void _typeCheck;

// ---------------------------------------------------------------------------

describe('BodyRenderer 接口契约', () => {
  it('MockBodyRenderer 实现 BodyRenderer 接口且所有成员存在', () => {
    const r: BodyRenderer = new MockBodyRenderer(399, 'S');

    // 属性
    expect(r.bodyId).toBe(399);
    expect(r.assetTier).toBe('S');
    expect(r.enabled).toBe(true);

    // 方法存在
    expect(typeof r.update).toBe('function');
    expect(typeof r.render).toBe('function');
    expect(typeof r.dispose).toBe('function');
    expect(typeof r.getBoundingRadius).toBe('function');
    expect(typeof r.setLOD).toBe('function');

    // getBoundingRadius 返回 number
    expect(r.getBoundingRadius()).toBeTypeOf('number');
    expect(r.getBoundingRadius()).toBeGreaterThan(0);
  });

  it('update(time, position, orientation, sunDirection) 签名匹配并能保留状态', () => {
    const r = new MockBodyRenderer(10, 'S');

    // update 接收 4 个参数：time, position, orientation, sunDirection
    expect(r.update.length).toBe(4);

    const time = 51544.5;
    const position: Vec3d = { x: 1.0, y: 2.0, z: 3.0 };
    const orientation: Quatd = { w: 0.7071, x: 0.0, y: 0.7071, z: 0.0 };
    const sunDirection: Vec3d = { x: -1.0, y: 0.0, z: 0.0 };

    r.update(time, position, orientation, sunDirection);

    expect(r.updateCalls).toBe(1);
    expect(r.getLastTime()).toBe(time);
    expect(r.getLastPosition()).toEqual(position);
    expect(r.getLastOrientation()).toEqual(orientation);
    expect(r.getLastSunDirection()).toEqual(sunDirection);

    // setLOD(level: number): void
    r.setLOD(2);
    expect(r.setLODCalls).toBe(1);
    expect(r.getLOD()).toBe(2);
  });

  it('render() 与 dispose() 生命周期：dispose 后 render 抛错', () => {
    const r = new MockBodyRenderer(301, 'A');

    // render 无参
    expect(r.render.length).toBe(0);

    // 正常 render
    r.render();
    expect(r.renderCalls).toBe(1);

    // enabled=false 时 render 为 no-op
    r.enabled = false;
    r.render();
    expect(r.renderCalls).toBe(1);

    // 恢复 enabled，render 应再次执行
    r.enabled = true;
    r.render();
    expect(r.renderCalls).toBe(2);

    // dispose 后 render 应抛错
    r.dispose();
    expect(r.disposeCalls).toBe(1);
    expect(r.isDisposed()).toBe(true);
    expect(() => r.render()).toThrow(/disposed/);
    expect(() => r.update(0, { x: 0, y: 0, z: 0 }, { w: 1, x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toThrow(/disposed/);
  });
});
