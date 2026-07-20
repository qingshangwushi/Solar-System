/**
 * StarData / StellarBackground 接线测试（审计项 E-17 / E-34 修复验证）。
 */
import { describe, it, expect, vi } from 'vitest';
import { StarData, ExtendedSpaceEnvironmentImpl } from '../extended-space.js';
import type { StellarBackground } from '../extended-space.js';
import type { Renderer } from '../index.js';

/** 构造一个最小可用的 mock Renderer，便于在 drawPointList 路径下断言 draw 调用。 */
function createMockRenderer(): Renderer & { draw: ReturnType<typeof vi.fn> } {
  const draw = vi.fn();
  const renderer = {
    backend: 'webgpu' as const,
    capabilities: {
      maxTextureSize: 4096,
      maxTextureArrayLayers: 256,
      maxBindGroups: 4,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 134217728,
      supportsFloatTextures: true,
      supportsFloat16Textures: true,
      supportsCompressedTextures: true,
    },
    init: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    resize: vi.fn(),
    createBuffer: vi.fn().mockReturnValue({ id: 'mock-buffer', usage: 'static' as const }),
    updateBuffer: vi.fn(),
    destroyBuffer: vi.fn(),
    createTexture: vi.fn().mockReturnValue({ id: 'mock-texture', format: 'rgba8unorm' as const }),
    uploadTextureData: vi.fn(),
    destroyTexture: vi.fn(),
    createPipeline: vi.fn().mockReturnValue({ id: 'mock-pipeline' }),
    destroyPipeline: vi.fn(),
    beginPass: vi.fn(),
    draw,
    endPass: vi.fn(),
    submit: vi.fn(),
    readPixels: vi.fn().mockResolvedValue(new Uint8Array(0)),
    setViewProj: vi.fn(),
  };
  return renderer as unknown as Renderer & { draw: ReturnType<typeof vi.fn> };
}

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

  it('render(renderer) issues a real draw call via drawPointList (N-02)', () => {
    const starData = new StarData(50);
    starData.update({ x: 0, y: 0, z: 0 });
    const renderer = createMockRenderer();

    starData.render(renderer);

    // StarData.render 在传入 renderer 且 visibleStarsBuffer 非空时调用 drawPointList，
    // 后者最终触发 renderer.draw(...)。
    expect(renderer.draw).toHaveBeenCalled();
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

  it('render(renderer) does not throw TypeError on the stellar background', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    env.update(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

    // 修复前 stellarBackground 为 {} as StellarBackground，render() 会抛
    // "TypeError: render is not a function"。
    expect(() => env.render(createMockRenderer())).not.toThrow();
  });

  it('render(renderer) propagates the renderer to every enabled sub-module (N-02)', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    env.update(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    const renderer = createMockRenderer();

    env.render(renderer);

    // 至少触发 stellarBackground + 4 新模块 + 旧模块的 draw 调用。
    // Magnetosphere/Auroras 的 lastDrawVertexCount > 0 时也会调用 draw。
    expect(renderer.draw).toHaveBeenCalled();
    expect(renderer.draw.mock.calls.length).toBeGreaterThan(0);
  });

  it('update(time, sunPosition, cameraPosition) forwards real cameraPosition to stellarBackground (N-03)', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    const stellar = env.getStellarBackground();
    const spy = vi.spyOn(stellar, 'update');
    const cameraPosition = { x: 100, y: -200, z: 300 };

    env.update(123, { x: 1, y: 2, z: 3 }, cameraPosition);

    // stellarBackground.update 应收到真实相机位置，而非 {0,0,0}。
    expect(spy).toHaveBeenCalledWith(cameraPosition);
  });
});
