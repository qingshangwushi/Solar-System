/**
 * Body renderers GPU draw-call tests (Task T-P0-07 / fix E-09).
 *
 * Verifies that each of the five body renderers no longer has an empty
 * render()/update()/dispose()/setLOD() path and actually drives the
 * renderer-core abstraction (Renderer):
 *
 * 1. render() invokes beginPass → draw → endPass → submit (non-empty).
 * 2. Each sphere-based renderer creates a SphereGeometry whose radius matches
 *    the constructor argument.
 * 3. RingRendererImpl creates a flat-annulus ring geometry whose
 *    inner/outer radii match the constructor-derived defaults.
 * 4. update() / dispose() / setLOD() do not throw.
 *
 * A MockRenderer records every createBuffer/createTexture/createPipeline/
 * beginPass/draw/endPass/submit/destroy* call so assertions can inspect the
 * real GPU plumbing without a WebGPU/WebGL2 backend.
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  BufferDescriptor,
  BufferHandle,
  DrawCall,
  PipelineDescriptor,
  PipelineHandle,
  RenderPassDescriptor,
  Renderer,
  TextureDescriptor,
  TextureHandle,
} from '@solar-system/renderer-core';
import {
  PLANET_BODY_IDS,
  PLANET_RADII_KM,
  SOLAR_RADIUS_KM,
  SunRendererImpl,
  SolidPlanetRenderer,
  EarthRendererImpl,
  GasGiantRendererImpl,
  RingRendererImpl,
} from '../index.js';

interface MockRendererCalls {
  createBuffer: ReturnType<typeof vi.fn>;
  createTexture: ReturnType<typeof vi.fn>;
  createPipeline: ReturnType<typeof vi.fn>;
  beginPass: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  endPass: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
  destroyBuffer: ReturnType<typeof vi.fn>;
  destroyTexture: ReturnType<typeof vi.fn>;
  destroyPipeline: ReturnType<typeof vi.fn>;
}

function createMockRenderer(): { renderer: Renderer; calls: MockRendererCalls } {
  let bufCounter = 0;
  let texCounter = 0;
  let pipeCounter = 0;

  const createBuffer = vi.fn((desc: BufferDescriptor): BufferHandle => ({
    id: `buf-${bufCounter++}`,
    usage: desc.usage,
  }));
  const createTexture = vi.fn((desc: TextureDescriptor): TextureHandle => ({
    id: `tex-${texCounter++}`,
    format: desc.format,
  }));
  const createPipeline = vi.fn((_desc: PipelineDescriptor): PipelineHandle => ({
    id: `pipe-${pipeCounter++}`,
  }));
  const beginPass = vi.fn((_desc: RenderPassDescriptor): void => {});
  const draw = vi.fn((_call: DrawCall): void => {});
  const endPass = vi.fn((): void => {});
  const submit = vi.fn((): void => {});
  const destroyBuffer = vi.fn((_handle: BufferHandle): void => {});
  const destroyTexture = vi.fn((_handle: TextureHandle): void => {});
  const destroyPipeline = vi.fn((_handle: PipelineHandle): void => {});

  const calls: MockRendererCalls = {
    createBuffer,
    createTexture,
    createPipeline,
    beginPass,
    draw,
    endPass,
    submit,
    destroyBuffer,
    destroyTexture,
    destroyPipeline,
  };

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
    init: vi.fn(async () => {}),
    destroy: vi.fn(),
    resize: vi.fn(),
    createBuffer,
    updateBuffer: vi.fn(),
    destroyBuffer,
    createTexture,
    uploadTextureData: vi.fn(),
    destroyTexture,
    createPipeline,
    destroyPipeline,
    beginPass,
    draw,
    endPass,
    submit,
    readPixels: vi.fn(async () => new Uint8Array(0)),
  } as unknown as Renderer;

  return { renderer, calls };
}

const IDENTITY_QUAT = { w: 1, x: 0, y: 0, z: 0 };
const ZERO_VEC = { x: 0, y: 0, z: 0 };
const SUN_DIR = { x: 0, y: 0, z: 1 };

// ---------------------------------------------------------------------------
// SunRendererImpl
// ---------------------------------------------------------------------------

describe('SunRendererImpl', () => {
  it('render() invokes beginPass, draw, endPass and submit exactly once (non-empty)', () => {
    const { renderer, calls } = createMockRenderer();
    const sun = new SunRendererImpl(renderer);

    sun.render();

    expect(calls.beginPass).toHaveBeenCalledTimes(1);
    expect(calls.draw).toHaveBeenCalledTimes(1);
    expect(calls.endPass).toHaveBeenCalledTimes(1);
    expect(calls.submit).toHaveBeenCalledTimes(1);
  });

  it('draw() references real BufferHandles produced by SphereGeometry', () => {
    const { renderer, calls } = createMockRenderer();
    const sun = new SunRendererImpl(renderer);

    sun.render();

    const drawCall = calls.draw.mock.calls[0]![0] as DrawCall;
    expect(drawCall.vertexBuffer.id).toMatch(/^buf-/);
    expect(drawCall.indexBuffer?.id).toMatch(/^buf-/);
    expect(drawCall.pipeline.id).toMatch(/^pipe-/);
    expect(drawCall.uniformBuffer?.id).toMatch(/^buf-/);
    expect(drawCall.vertexCount).toBeGreaterThan(0);
    expect(drawCall.indexCount).toBeGreaterThan(0);
  });

  it('creates a SphereGeometry with the solar radius (km → m)', () => {
    const { renderer } = createMockRenderer();
    const sun = new SunRendererImpl(renderer);

    sun.render();

    const geo = sun.getSphereGeometry();
    expect(geo).not.toBeNull();
    expect(geo!.radius).toBe(SOLAR_RADIUS_KM * 1000);
  });

  it('update(), setLOD() and dispose() do not throw', () => {
    const { renderer } = createMockRenderer();
    const sun = new SunRendererImpl(renderer);

    expect(() => sun.update(1234.5, ZERO_VEC, IDENTITY_QUAT, SUN_DIR)).not.toThrow();
    expect(() => sun.setLOD(2)).not.toThrow();
    expect(() => sun.dispose()).not.toThrow();
  });

  it('dispose() releases pipeline, textures, uniform and geometry buffers', () => {
    const { renderer, calls } = createMockRenderer();
    const sun = new SunRendererImpl(renderer);

    sun.render();
    sun.dispose();

    // 1 pipeline + (vertex+index+uniform) buffers destroyed; 2 textures destroyed.
    expect(calls.destroyPipeline).toHaveBeenCalledTimes(1);
    expect(calls.destroyTexture).toHaveBeenCalledTimes(2);
    expect(calls.destroyBuffer.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// SolidPlanetRenderer
// ---------------------------------------------------------------------------

describe('SolidPlanetRenderer', () => {
  it('render() invokes beginPass, draw, endPass and submit exactly once (non-empty)', () => {
    const { renderer, calls } = createMockRenderer();
    const planet = new SolidPlanetRenderer(PLANET_BODY_IDS.MERCURY!, renderer);

    planet.render();

    expect(calls.beginPass).toHaveBeenCalledTimes(1);
    expect(calls.draw).toHaveBeenCalledTimes(1);
    expect(calls.endPass).toHaveBeenCalledTimes(1);
    expect(calls.submit).toHaveBeenCalledTimes(1);
  });

  it('creates a SphereGeometry whose radius matches the planet radius (km → m)', () => {
    const { renderer } = createMockRenderer();
    const planet = new SolidPlanetRenderer(PLANET_BODY_IDS.MARS!, renderer);

    planet.render();

    const geo = planet.getSphereGeometry();
    expect(geo).not.toBeNull();
    const expected = (PLANET_RADII_KM[PLANET_BODY_IDS.MARS!] ?? 1000) * 1000;
    expect(geo!.radius).toBe(expected);
  });

  it('uses an explicit radius when provided', () => {
    const { renderer } = createMockRenderer();
    const planet = new SolidPlanetRenderer(PLANET_BODY_IDS.MOON!, renderer, { radius: 1234 });

    planet.render();

    expect(planet.getSphereGeometry()!.radius).toBe(1234);
  });

  it('update(), setLOD() and dispose() do not throw', () => {
    const { renderer } = createMockRenderer();
    const planet = new SolidPlanetRenderer(PLANET_BODY_IDS.MERCURY!, renderer);

    expect(() => planet.update(0, ZERO_VEC, IDENTITY_QUAT, SUN_DIR)).not.toThrow();
    expect(() => planet.setLOD(1)).not.toThrow();
    expect(() => planet.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// EarthRendererImpl
// ---------------------------------------------------------------------------

describe('EarthRendererImpl', () => {
  it('render() invokes beginPass, draw, endPass and submit exactly once (non-empty)', () => {
    const { renderer, calls } = createMockRenderer();
    const earth = new EarthRendererImpl(renderer);

    earth.render();

    expect(calls.beginPass).toHaveBeenCalledTimes(1);
    expect(calls.draw).toHaveBeenCalledTimes(1);
    expect(calls.endPass).toHaveBeenCalledTimes(1);
    expect(calls.submit).toHaveBeenCalledTimes(1);
  });

  it('creates a SphereGeometry with the Earth radius (6371000 m)', () => {
    const { renderer } = createMockRenderer();
    const earth = new EarthRendererImpl(renderer);

    earth.render();

    const geo = earth.getSphereGeometry();
    expect(geo).not.toBeNull();
    expect(geo!.radius).toBe(6371000);
  });

  it('update(), setLOD() and dispose() do not throw', () => {
    const { renderer } = createMockRenderer();
    const earth = new EarthRendererImpl(renderer);

    expect(() => earth.update(99, ZERO_VEC, IDENTITY_QUAT, SUN_DIR)).not.toThrow();
    expect(() => earth.setLOD(0)).not.toThrow();
    expect(() => earth.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GasGiantRendererImpl
// ---------------------------------------------------------------------------

describe('GasGiantRendererImpl', () => {
  it('render() invokes beginPass, draw, endPass and submit exactly once (non-empty)', () => {
    const { renderer, calls } = createMockRenderer();
    const jupiter = new GasGiantRendererImpl(PLANET_BODY_IDS.JUPITER!, renderer);

    jupiter.render();

    expect(calls.beginPass).toHaveBeenCalledTimes(1);
    expect(calls.draw).toHaveBeenCalledTimes(1);
    expect(calls.endPass).toHaveBeenCalledTimes(1);
    expect(calls.submit).toHaveBeenCalledTimes(1);
  });

  it('creates a SphereGeometry whose radius matches the gas-giant radius (km → m)', () => {
    const { renderer } = createMockRenderer();
    const jupiter = new GasGiantRendererImpl(PLANET_BODY_IDS.JUPITER!, renderer);

    jupiter.render();

    const geo = jupiter.getSphereGeometry();
    expect(geo).not.toBeNull();
    const expected = (PLANET_RADII_KM[PLANET_BODY_IDS.JUPITER!] ?? 1000) * 1000;
    expect(geo!.radius).toBe(expected);
  });

  it('update(), setLOD() and dispose() do not throw', () => {
    const { renderer } = createMockRenderer();
    const jupiter = new GasGiantRendererImpl(PLANET_BODY_IDS.JUPITER!, renderer);

    expect(() => jupiter.update(42, ZERO_VEC, IDENTITY_QUAT, SUN_DIR)).not.toThrow();
    expect(() => jupiter.setLOD(3)).not.toThrow();
    expect(() => jupiter.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RingRendererImpl
// ---------------------------------------------------------------------------

describe('RingRendererImpl', () => {
  it('render() invokes beginPass, draw, endPass and submit exactly once (non-empty)', () => {
    const { renderer, calls } = createMockRenderer();
    const ring = new RingRendererImpl(renderer);

    ring.render();

    expect(calls.beginPass).toHaveBeenCalledTimes(1);
    expect(calls.draw).toHaveBeenCalledTimes(1);
    expect(calls.endPass).toHaveBeenCalledTimes(1);
    expect(calls.submit).toHaveBeenCalledTimes(1);
  });

  it('creates a ring geometry with Saturn-derived inner/outer radii', () => {
    const { renderer } = createMockRenderer();
    const ring = new RingRendererImpl(renderer);

    ring.render();

    const geo = ring.getRingGeometry();
    expect(geo).not.toBeNull();
    const saturnRadius = (PLANET_RADII_KM[PLANET_BODY_IDS.SATURN!] ?? 58232) * 1000;
    expect(geo!.innerRadius).toBeCloseTo(saturnRadius * 1.2, 3);
    expect(geo!.outerRadius).toBeCloseTo(saturnRadius * 2.3, 3);
    expect(geo!.indexCount).toBeGreaterThan(0);
    expect(geo!.vertexCount).toBeGreaterThan(0);
  });

  it('draw() references the ring vertex and index buffers', () => {
    const { renderer, calls } = createMockRenderer();
    const ring = new RingRendererImpl(renderer);

    ring.render();

    const drawCall = calls.draw.mock.calls[0]![0] as DrawCall;
    expect(drawCall.vertexBuffer.id).toMatch(/^buf-/);
    expect(drawCall.indexBuffer?.id).toMatch(/^buf-/);
    expect(drawCall.pipeline.id).toMatch(/^pipe-/);
  });

  it('update(), setLOD() and dispose() do not throw', () => {
    const { renderer } = createMockRenderer();
    const ring = new RingRendererImpl(renderer);

    expect(() => ring.update(7, ZERO_VEC, IDENTITY_QUAT, SUN_DIR)).not.toThrow();
    expect(() => ring.setLOD(1)).not.toThrow();
    expect(() => ring.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: render() is idempotent (no re-init on second call)
// ---------------------------------------------------------------------------

describe('lazy initialization is idempotent', () => {
  it('repeated render() calls reuse the same pipeline and do not re-create geometry', () => {
    const { renderer, calls } = createMockRenderer();
    const sun = new SunRendererImpl(renderer);

    sun.render();
    const pipelinesAfterFirst = calls.createPipeline.mock.calls.length;
    const buffersAfterFirst = calls.createBuffer.mock.calls.length;

    sun.render();

    expect(calls.createPipeline.mock.calls.length).toBe(pipelinesAfterFirst);
    expect(calls.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
    // But draw/beginPass/endPass/submit fire once per render().
    expect(calls.draw).toHaveBeenCalledTimes(2);
    expect(calls.beginPass).toHaveBeenCalledTimes(2);
    expect(calls.endPass).toHaveBeenCalledTimes(2);
    expect(calls.submit).toHaveBeenCalledTimes(2);
  });
});
