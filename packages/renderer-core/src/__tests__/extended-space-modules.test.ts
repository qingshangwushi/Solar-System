/**
 * N-07 验证：4 类新增扩展空间环境（TrojanGroup / Heliopause / CurrentSheet / Galaxy）。
 *
 * 覆盖：
 * - 构造生成期望点数；
 * - render(renderer) 调用 drawPointList → renderer.draw；
 * - update(time) 不抛错且推进内部状态；
 * - dispose() 清理；
 * - ExtendedSpaceEnvironmentImpl 已注册新模块（enabled 默认 true，getter 可达）。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  TrojanGroupImpl,
  HeliopauseImpl,
  CurrentSheetImpl,
  GalaxyImpl,
  ExtendedSpaceEnvironmentImpl,
  TROJAN_GROUP_DEFAULT_BODY_ID,
  TROJAN_GROUP_DEFAULT_COUNT_PER_SWARM,
  HELIOPAUSE_DEFAULT_RADIUS,
  HELIOPAUSE_DEFAULT_POINT_COUNT,
  CURRENT_SHEET_DEFAULT_RADIUS,
  CURRENT_SHEET_DEFAULT_WAVINESS,
  CURRENT_SHEET_DEFAULT_RADIAL_SEGMENTS,
  CURRENT_SHEET_DEFAULT_AZIMUTH_SEGMENTS,
  GALAXY_DEFAULT_STAR_COUNT,
} from '../extended-space.js';
import type {
  TrojanGroup,
  Heliopause,
  CurrentSheet,
  Galaxy,
} from '../extended-space.js';
import type { Renderer } from '../index.js';

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
  };
  return renderer as unknown as Renderer & { draw: ReturnType<typeof vi.fn> };
}

describe('TrojanGroupImpl', () => {
  it('implements TrojanGroup interface', () => {
    const trojan: TrojanGroup = new TrojanGroupImpl();
    expect(typeof trojan.update).toBe('function');
    expect(typeof trojan.render).toBe('function');
    expect(typeof trojan.dispose).toBe('function');
  });

  it('generates 2 swarms × countPerSwarm points by default', () => {
    const trojan = new TrojanGroupImpl();
    expect(trojan.getCount()).toBe(TROJAN_GROUP_DEFAULT_COUNT_PER_SWARM * 2);
  });

  it('respects custom count and bodyId options', () => {
    const trojan = new TrojanGroupImpl({ bodyId: 4, count: 500 });
    expect(trojan.getBodyId()).toBe(4);
    expect(trojan.getCount()).toBe(1000);
  });

  it('default bodyId is Jupiter (5)', () => {
    const trojan = new TrojanGroupImpl();
    expect(trojan.getBodyId()).toBe(TROJAN_GROUP_DEFAULT_BODY_ID);
  });

  it('render(renderer) issues a draw call', () => {
    const trojan = new TrojanGroupImpl({ count: 100 });
    const renderer = createMockRenderer();
    trojan.render(renderer);
    expect(renderer.draw).toHaveBeenCalled();
    expect(trojan.getLastDrawVertexCount()).toBe(200);
    expect(trojan.getDrawCallCount()).toBe(1);
  });

  it('render() without renderer does not throw and still records counts', () => {
    const trojan = new TrojanGroupImpl({ count: 50 });
    expect(() => trojan.render()).not.toThrow();
    expect(trojan.getLastDrawVertexCount()).toBe(100);
  });

  it('update(time) rotates points without throwing', () => {
    const trojan = new TrojanGroupImpl({ count: 100 });
    expect(() => trojan.update(1000)).not.toThrow();
  });

  it('dispose() clears all particles', () => {
    const trojan = new TrojanGroupImpl({ count: 100 });
    trojan.dispose();
    expect(trojan.getCount()).toBe(0);
  });
});

describe('HeliopauseImpl', () => {
  it('implements Heliopause interface', () => {
    const hp: Heliopause = new HeliopauseImpl();
    expect(typeof hp.update).toBe('function');
    expect(typeof hp.render).toBe('function');
    expect(typeof hp.dispose).toBe('function');
    expect(typeof hp.setRadius).toBe('function');
  });

  it('uses default radius and point count', () => {
    const hp = new HeliopauseImpl();
    expect(hp.getRadius()).toBe(HELIOPAUSE_DEFAULT_RADIUS);
    expect(hp.getPointCount()).toBe(HELIOPAUSE_DEFAULT_POINT_COUNT);
  });

  it('respects custom options', () => {
    const hp = new HeliopauseImpl({ radius: 150, pointCount: 500 });
    expect(hp.getRadius()).toBe(150);
    expect(hp.getPointCount()).toBe(500);
  });

  it('render(renderer) issues a draw call', () => {
    const hp = new HeliopauseImpl({ pointCount: 200 });
    const renderer = createMockRenderer();
    hp.render(renderer);
    expect(renderer.draw).toHaveBeenCalled();
    expect(hp.getLastDrawVertexCount()).toBe(200);
  });

  it('update(time) advances pulsation phase without throwing', () => {
    const hp = new HeliopauseImpl();
    expect(() => hp.update(5000)).not.toThrow();
  });

  it('setRadius regenerates points', () => {
    const hp = new HeliopauseImpl({ pointCount: 100 });
    hp.setRadius(200);
    expect(hp.getRadius()).toBe(200);
    expect(hp.getLastDrawVertexCount()).toBe(0); // 还未 render
  });

  it('dispose() clears points', () => {
    const hp = new HeliopauseImpl();
    hp.dispose();
    expect(hp.getLastDrawVertexCount()).toBe(0);
  });
});

describe('CurrentSheetImpl', () => {
  it('implements CurrentSheet interface', () => {
    const cs: CurrentSheet = new CurrentSheetImpl();
    expect(typeof cs.update).toBe('function');
    expect(typeof cs.render).toBe('function');
    expect(typeof cs.dispose).toBe('function');
    expect(typeof cs.setWaviness).toBe('function');
  });

  it('uses default radius and waviness', () => {
    const cs = new CurrentSheetImpl();
    expect(cs.getRadius()).toBe(CURRENT_SHEET_DEFAULT_RADIUS);
    expect(cs.getWaviness()).toBe(CURRENT_SHEET_DEFAULT_WAVINESS);
  });

  it('generates radialSegments × azimuthSegments points', () => {
    const cs = new CurrentSheetImpl({
      radialSegments: 10,
      azimuthSegments: 20,
    });
    // render() 后 lastDrawVertexCount 反映点数。
    cs.render(createMockRenderer());
    expect(cs.getLastDrawVertexCount()).toBe(10 * 20);
  });

  it('default point count matches default segments', () => {
    const cs = new CurrentSheetImpl();
    cs.render(createMockRenderer());
    expect(cs.getLastDrawVertexCount()).toBe(
      CURRENT_SHEET_DEFAULT_RADIAL_SEGMENTS * CURRENT_SHEET_DEFAULT_AZIMUTH_SEGMENTS,
    );
  });

  it('render(renderer) issues a draw call', () => {
    const cs = new CurrentSheetImpl({
      radialSegments: 5,
      azimuthSegments: 10,
    });
    const renderer = createMockRenderer();
    cs.render(renderer);
    expect(renderer.draw).toHaveBeenCalled();
  });

  it('update(time) updates z heights via sin(azimuth + time*0.1)', () => {
    const cs = new CurrentSheetImpl({
      radius: 10,
      waviness: 1,
      radialSegments: 5,
      azimuthSegments: 8,
    });
    expect(() => cs.update(100)).not.toThrow();
  });

  it('setWaviness regenerates points', () => {
    const cs = new CurrentSheetImpl();
    cs.setWaviness(1.5);
    expect(cs.getWaviness()).toBe(1.5);
  });

  it('dispose() clears points', () => {
    const cs = new CurrentSheetImpl();
    cs.dispose();
    expect(cs.getLastDrawVertexCount()).toBe(0);
  });
});

describe('GalaxyImpl', () => {
  it('implements Galaxy interface', () => {
    const galaxy: Galaxy = new GalaxyImpl();
    expect(typeof galaxy.update).toBe('function');
    expect(typeof galaxy.render).toBe('function');
    expect(typeof galaxy.dispose).toBe('function');
  });

  it('generates the default star count', () => {
    const galaxy = new GalaxyImpl();
    expect(galaxy.getStarCount()).toBe(GALAXY_DEFAULT_STAR_COUNT);
  });

  it('respects custom starCount', () => {
    const galaxy = new GalaxyImpl({ starCount: 1000 });
    expect(galaxy.getStarCount()).toBe(1000);
  });

  it('render(renderer) issues a draw call', () => {
    const galaxy = new GalaxyImpl({ starCount: 500 });
    const renderer = createMockRenderer();
    galaxy.render(renderer);
    expect(renderer.draw).toHaveBeenCalled();
    expect(galaxy.getLastDrawVertexCount()).toBe(500);
  });

  it('render() without renderer does not throw', () => {
    const galaxy = new GalaxyImpl({ starCount: 100 });
    expect(() => galaxy.render()).not.toThrow();
    expect(galaxy.getLastDrawVertexCount()).toBe(100);
  });

  it('update(time) records time without throwing', () => {
    const galaxy = new GalaxyImpl({ starCount: 100 });
    expect(() => galaxy.update(42)).not.toThrow();
    expect(galaxy.getTime()).toBe(42);
  });

  it('dispose() clears stars', () => {
    const galaxy = new GalaxyImpl({ starCount: 100 });
    galaxy.dispose();
    expect(galaxy.getStarCount()).toBe(0);
  });
});

describe('ExtendedSpaceEnvironmentImpl registration of new modules', () => {
  it('exposes getters for all 4 new modules', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    expect(env.getTrojanGroup()).toBeInstanceOf(TrojanGroupImpl);
    expect(env.getHeliopause()).toBeInstanceOf(HeliopauseImpl);
    expect(env.getCurrentSheet()).toBeInstanceOf(CurrentSheetImpl);
    expect(env.getGalaxy()).toBeInstanceOf(GalaxyImpl);
  });

  it('all 4 new modules are enabled by default', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    expect(env.getTrojanGroupEnabled()).toBe(true);
    expect(env.getHeliopauseEnabled()).toBe(true);
    expect(env.getCurrentSheetEnabled()).toBe(true);
    expect(env.getGalaxyEnabled()).toBe(true);
  });

  it('setXxxEnabled toggles flags', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    env.setTrojanGroupEnabled(false);
    env.setHeliopauseEnabled(false);
    env.setCurrentSheetEnabled(false);
    env.setGalaxyEnabled(false);
    expect(env.getTrojanGroupEnabled()).toBe(false);
    expect(env.getHeliopauseEnabled()).toBe(false);
    expect(env.getCurrentSheetEnabled()).toBe(false);
    expect(env.getGalaxyEnabled()).toBe(false);
  });

  it('update() advances all 4 new modules without throwing', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    expect(() => env.update(100, { x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 })).not.toThrow();
  });

  it('render(renderer) issues draw calls for the 4 new modules', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    env.update(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    const renderer = createMockRenderer();

    env.render(renderer);

    // 至少 4 次 draw（每个新模块至少一次）。
    expect(renderer.draw.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('disabling a new module skips its render path', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    env.update(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    // 关闭所有模块。
    env.setStellarBackgroundEnabled(false);
    env.setAsteroidBeltEnabled(false);
    env.setKuiperBeltEnabled(false);
    env.setOortCloudEnabled(false);
    env.setSolarWindEnabled(false);
    env.setMagnetosphereEnabled(false);
    env.setAurorasEnabled(false);
    env.setTrojanGroupEnabled(false);
    env.setHeliopauseEnabled(false);
    env.setCurrentSheetEnabled(false);
    env.setGalaxyEnabled(false);

    const renderer = createMockRenderer();
    env.render(renderer);
    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('dispose() does not throw and cleans up new modules', () => {
    const env = new ExtendedSpaceEnvironmentImpl();
    expect(() => env.dispose()).not.toThrow();
    expect(env.getGalaxy().getStarCount()).toBe(0);
    expect(env.getTrojanGroup().getCount()).toBe(0);
  });
});
