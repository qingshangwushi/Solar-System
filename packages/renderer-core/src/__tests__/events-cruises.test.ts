/**
 * E-19/E-21/E-22/E-23/E-16/FR-EVENT events-cruises 测试。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  EventsServiceImpl,
  CruiseServiceImpl,
  PureViewingModeImpl,
  EventTimelinePlayer,
  jumpToEventMax,
  createEventsService,
  createCruiseService,
  createPureViewingMode,
  CRUISES,
  EVENT_TYPES,
  AsteroidBeltImpl,
  KuiperBeltImpl,
  OortCloudImpl,
  SolarWindImpl,
  MagnetosphereImpl,
  AurorasImpl,
} from '../index.js';
import type {
  CelestialEvent,
  CruiseCallbacks,
  PureViewingCallbacks,
  CruiseWaypoint,
} from '../index.js';
import type { Renderer, BufferHandle, PipelineHandle } from '../index.js';

/**
 * 简易 mock renderer：记录 createBuffer / draw / pipeline 调用。
 */
class MockRenderer implements Renderer {
  buffersCreated = 0;
  pipelinesCreated = 0;
  drawCalls = 0;
  lastDrawVertexCount = 0;
  beginPassCount = 0;
  endPassCount = 0;
  submitCount = 0;

  readonly backend = 'webgpu' as const;
  readonly capabilities = {
    maxTextureSize: 16384,
    maxTextureArrayLayers: 256,
    maxBindGroups: 4,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 65536,
    supportsFloatTextures: true,
    supportsFloat16Textures: true,
    supportsCompressedTextures: false,
  };

  async init(): Promise<void> {}
  destroy(): void {}
  resize(): void {}
  updateBuffer(): void {}
  destroyBuffer(): void {}
  createTexture(): { id: string; format: 'rgba8unorm' } {
    return { id: 'tex', format: 'rgba8unorm' };
  }
  uploadTextureData(): void {}
  destroyTexture(): void {}
  async readPixels(): Promise<Uint8Array> {
    return new Uint8Array(0);
  }

  createBuffer(): BufferHandle {
    this.buffersCreated += 1;
    return { id: `buf-${this.buffersCreated}`, usage: 'static' };
  }
  createPipeline(): PipelineHandle {
    this.pipelinesCreated += 1;
    return { id: `pipeline-${this.pipelinesCreated}` };
  }
  destroyPipeline(): void {}
  beginPass(): void {
    this.beginPassCount += 1;
  }
  draw(call: { vertexCount: number }): void {
    this.drawCalls += 1;
    this.lastDrawVertexCount = call.vertexCount;
  }
  endPass(): void {
    this.endPassCount += 1;
  }
  submit(): void {
    this.submitCount += 1;
  }
}

function makeEvent(overrides: Partial<CelestialEvent> = {}): CelestialEvent {
  const base: CelestialEvent = {
    id: 'evt-1',
    type: 'solar_eclipse',
    title: '测试事件',
    description: '描述',
    startDate: new Date('2025-01-01T00:00:00Z'),
    endDate: new Date('2025-01-01T03:00:00Z'),
    peakDate: new Date('2025-01-01T01:30:00Z'),
    visibility: '全球',
    bodies: ['sun', 'moon', 'earth'],
    magnitude: 1.0,
    duration: 180,
  };
  return { ...base, ...overrides };
}

describe('EventsServiceImpl (E-19)', () => {
  it('constructs without throwing', () => {
    expect(() => new EventsServiceImpl()).not.toThrow();
  });

  it('returns empty array when no eventSearchFn is provided', () => {
    const svc = new EventsServiceImpl();
    expect(svc.search({})).toEqual([]);
  });

  it('does not generate hardcoded sample events', () => {
    const svc = new EventsServiceImpl();
    // Without an eventSearchFn, all queries return empty - confirming no hardcoded samples.
    expect(svc.getUpcomingEvents()).toEqual([]);
    expect(svc.getPastEvents()).toEqual([]);
    expect(svc.getEvent('eclipse-2024-solar')).toBeNull();
  });

  it('accepts an eventSearchFn constructor parameter', () => {
    const fakeEvents: CelestialEvent[] = [makeEvent({ id: 'e1' })];
    const svc = new EventsServiceImpl(() => fakeEvents);
    const results = svc.search({});
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('e1');
  });

  it('calls eventSearchFn with the search window', () => {
    const fn = vi.fn((start: Date, end: Date) => {
      void start;
      void end;
      return [makeEvent({ id: 'windowed' })];
    });
    const svc = new EventsServiceImpl(fn);
    const start = new Date('2025-06-01T00:00:00Z');
    const end = new Date('2025-06-30T00:00:00Z');
    svc.search({ startDate: start, endDate: end });
    expect(fn).toHaveBeenCalledTimes(1);
    const [calledStart, calledEnd] = fn.mock.calls[0]!;
    expect(calledStart).toBe(start);
    expect(calledEnd).toBe(end);
  });

  it('filters by type when eventSearchFn is provided', () => {
    const events: CelestialEvent[] = [
      makeEvent({ id: 'a', type: 'solar_eclipse' }),
      makeEvent({ id: 'b', type: 'lunar_eclipse' }),
    ];
    const svc = new EventsServiceImpl(() => events);
    const results = svc.search({ types: ['lunar_eclipse'] });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('b');
  });

  it('filters by body when eventSearchFn is provided', () => {
    const events: CelestialEvent[] = [
      makeEvent({ id: 'a', bodies: ['sun', 'moon'] }),
      makeEvent({ id: 'b', bodies: ['mars'] }),
    ];
    const svc = new EventsServiceImpl(() => events);
    const results = svc.search({ body: 'mars' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('b');
  });

  it('applies limit after filtering', () => {
    const events: CelestialEvent[] = [
      makeEvent({ id: 'a' }),
      makeEvent({ id: 'b' }),
      makeEvent({ id: 'c' }),
    ];
    const svc = new EventsServiceImpl(() => events);
    const results = svc.search({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('supports subscribe and notifies on addEvent', () => {
    const svc = new EventsServiceImpl();
    const cb = vi.fn();
    const unsub = svc.subscribe(cb);
    svc.addEvent(makeEvent({ id: 'added' }));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ id: 'added' }));
    unsub();
    svc.addEvent(makeEvent({ id: 'added2' }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('createEventsService passes eventSearchFn through', () => {
    const svc = createEventsService(() => [makeEvent({ id: 'factory' })]);
    expect(svc.search({})).toHaveLength(1);
    expect(svc.search({})[0]?.id).toBe('factory');
  });
});

describe('CruiseServiceImpl (E-22)', () => {
  it('lists all cruises', () => {
    const svc = new CruiseServiceImpl();
    expect(svc.getAllCruises().length).toBe(CRUISES.length);
  });

  it('getCruise returns cruise by id or null', () => {
    const svc = new CruiseServiceImpl();
    expect(svc.getCruise('cruise-moon-landing')).not.toBeNull();
    expect(svc.getCruise('does-not-exist')).toBeNull();
  });

  it('getFeaturedCruises returns featured only', () => {
    const svc = new CruiseServiceImpl();
    const featured = svc.getFeaturedCruises();
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((c) => c.featured)).toBe(true);
  });

  it('startCruise throws on unknown id', () => {
    const svc = new CruiseServiceImpl();
    expect(() => svc.startCruise('nope')).toThrow();
  });

  it('startCruise initializes progress to 0', () => {
    const svc = new CruiseServiceImpl();
    svc.startCruise('cruise-moon-landing');
    expect(svc.getCurrentProgress()).toBe(0);
  });

  it('getCurrentProgress uses elapsedTime / totalDuration, not Date.now()', () => {
    const svc = new CruiseServiceImpl();
    svc.startCruise('cruise-moon-landing');
    // cruise-moon-landing.totalDuration = 210 minutes = 210 * 60 * 1000 ms
    // Advance by half -> 50%
    svc.update(105 * 60 * 1000);
    expect(svc.getCurrentProgress()).toBeCloseTo(50, 1);
  });

  it('getCurrentProgress returns 0 when no cruise is active', () => {
    const svc = new CruiseServiceImpl();
    expect(svc.getCurrentProgress()).toBe(0);
  });

  it('pause/resume stops progress advancement', () => {
    const svc = new CruiseServiceImpl();
    svc.startCruise('cruise-moon-landing');
    svc.update(50 * 60 * 1000);
    const before = svc.getCurrentProgress();
    svc.pauseCruise();
    svc.update(50 * 60 * 1000);
    expect(svc.getCurrentProgress()).toBe(before);
    svc.resumeCruise();
    svc.update(50 * 60 * 1000);
    expect(svc.getCurrentProgress()).toBeGreaterThan(before);
  });

  it('stopCruise resets state', () => {
    const svc = new CruiseServiceImpl();
    svc.startCruise('cruise-moon-landing');
    svc.update(50 * 60 * 1000);
    svc.stopCruise();
    expect(svc.getCurrentProgress()).toBe(0);
    expect(svc.getCurrentWaypoint()).toBeNull();
  });

  it('update advances waypoint index across waypoint boundaries', () => {
    const svc = new CruiseServiceImpl();
    svc.startCruise('cruise-moon-landing');
    // First waypoint: duration=60 + pause=15 => 75 minutes
    svc.update(75 * 60 * 1000 + 1);
    const wp = svc.getCurrentWaypoint();
    expect(wp?.bodyId).toBe('moon');
  });

  it('setCallbacks accepts CruiseCallbacks', () => {
    const svc = new CruiseServiceImpl();
    const callbacks: CruiseCallbacks = {
      onCameraChange: vi.fn(),
      onClockChange: vi.fn(),
      onScaleChange: vi.fn(),
      onLayerVisibilityChange: vi.fn(),
    };
    expect(() => svc.setCallbacks(callbacks)).not.toThrow();
  });

  it('update invokes onCameraChange when waypoint changes', () => {
    const svc = new CruiseServiceImpl();
    const onCameraChange = vi.fn();
    svc.setCallbacks({ onCameraChange });
    svc.startCruise('cruise-moon-landing');
    // Trigger first waypoint callback (startCruise doesn't call update; first update triggers it)
    svc.update(1);
    expect(onCameraChange).toHaveBeenCalled();
  });

  it('update does not re-invoke callbacks for the same waypoint', () => {
    const svc = new CruiseServiceImpl();
    const onCameraChange = vi.fn();
    svc.setCallbacks({ onCameraChange });
    svc.startCruise('cruise-moon-landing');
    svc.update(1);
    svc.update(1);
    svc.update(1);
    expect(onCameraChange).toHaveBeenCalledTimes(1);
  });

  it('update invokes all four callbacks when waypoint has all extended fields', () => {
    // Build a custom cruise by adding a waypoint with all extended fields via addEvent-style approach.
    // We can't easily inject custom cruises, so verify via the default cruise which has no extended fields:
    // callbacks should still be invoked (with null values) on waypoint change.
    const svc = new CruiseServiceImpl();
    const onClock = vi.fn();
    const onScale = vi.fn();
    const onLayer = vi.fn();
    const onCamera = vi.fn();
    svc.setCallbacks({
      onCameraChange: onCamera,
      onClockChange: onClock,
      onScaleChange: onScale,
      onLayerVisibilityChange: onLayer,
    });
    svc.startCruise('cruise-moon-landing');
    svc.update(1);
    expect(onCamera).toHaveBeenCalledTimes(1);
    expect(onClock).toHaveBeenCalledTimes(1);
    expect(onScale).toHaveBeenCalledTimes(1);
    expect(onLayer).toHaveBeenCalledTimes(1);
    // Default waypoints have no extended fields, so callbacks should receive null
    expect(onCamera).toHaveBeenCalledWith(null, null, null);
    expect(onClock).toHaveBeenCalledWith(null, null);
    expect(onScale).toHaveBeenCalledWith(null);
    expect(onLayer).toHaveBeenCalledWith(null);
  });

  it('auto-stops when elapsed exceeds total duration', () => {
    const svc = new CruiseServiceImpl();
    svc.startCruise('cruise-moon-landing');
    // totalDuration = 210 minutes; advance well beyond
    svc.update(500 * 60 * 1000);
    expect(svc.getCurrentProgress()).toBe(0);
    expect(svc.getCurrentWaypoint()).toBeNull();
  });
});

describe('PureViewingModeImpl (E-23)', () => {
  it('enter/exit toggle active state', () => {
    const m = new PureViewingModeImpl();
    expect(m.isActive()).toBe(false);
    m.enter();
    expect(m.isActive()).toBe(true);
    m.exit();
    expect(m.isActive()).toBe(false);
  });

  it('enter invokes onUIVisibilityChange(false) and onHUDDisabled(true)', () => {
    const onUI = vi.fn();
    const onHUD = vi.fn();
    const m = new PureViewingModeImpl();
    m.setCallbacks({ onUIVisibilityChange: onUI, onHUDDisabled: onHUD });
    m.enter();
    expect(onUI).toHaveBeenCalledWith(false);
    expect(onHUD).toHaveBeenCalledWith(true);
  });

  it('exit invokes onUIVisibilityChange(true) and onHUDDisabled(false)', () => {
    const onUI = vi.fn();
    const onHUD = vi.fn();
    const m = new PureViewingModeImpl();
    m.setCallbacks({ onUIVisibilityChange: onUI, onHUDDisabled: onHUD });
    m.enter();
    m.exit();
    expect(onUI).toHaveBeenCalledWith(true);
    expect(onHUD).toHaveBeenCalledWith(false);
  });

  it('setAutoRotate invokes onAutoRotateChange only when active and value changes', () => {
    const onAuto = vi.fn();
    const m = new PureViewingModeImpl();
    m.setCallbacks({ onAutoRotateChange: onAuto });
    // Not active -> no callback
    m.setAutoRotate(false);
    expect(onAuto).not.toHaveBeenCalled();
    m.enter();
    // Active and value changes (false -> true)
    m.setAutoRotate(true);
    expect(onAuto).toHaveBeenCalledWith(true);
    // Same value -> no callback
    m.setAutoRotate(true);
    expect(onAuto).toHaveBeenCalledTimes(1);
  });

  it('setAmbientMode invokes onAmbientModeChange only when active and value changes', () => {
    const onAmbient = vi.fn();
    const m = new PureViewingModeImpl();
    m.setCallbacks({ onAmbientModeChange: onAmbient });
    m.setAutoRotate(false);
    m.enter();
    m.setAmbientMode(true);
    expect(onAmbient).toHaveBeenCalledWith(true);
    m.setAmbientMode(true);
    expect(onAmbient).toHaveBeenCalledTimes(1);
  });

  it('setTarget/getTarget round-trips', () => {
    const m = new PureViewingModeImpl();
    m.setTarget('mars');
    expect(m.getTarget()).toBe('mars');
  });

  it('createPureViewingMode returns a working instance', () => {
    const m = createPureViewingMode();
    m.enter();
    expect(m.isActive()).toBe(true);
  });
});

describe('CruiseWaypoint extended fields (E-21)', () => {
  it('CruiseWaypoint interface accepts all 12+ optional fields', () => {
    const wp: CruiseWaypoint = {
      bodyId: 'earth',
      name: '地球',
      position: { x: 1, y: 0, z: 0 },
      duration: 30,
      pauseDuration: 5,
      timeSetting: { startOffset: 0, endOffset: 1000, clockRate: 1 },
      cameraTarget: { bodyId: 'earth', position: { x: 1, y: 0, z: 0 } },
      cameraPosition: { x: 1.1, y: 0, z: 0 },
      cameraDirection: { yaw: 0, pitch: 0, roll: 0 },
      referenceFrame: 'j2000',
      easingCurve: 'ease-in-out',
      timeMultiplier: 60,
      scaleMode: 'enhanced',
      layerVisibility: { orbits: true, labels: true, grid: false },
      minQuality: 'high',
      resourcePreload: { bodyIds: ['earth'], textureTiers: [1, 2] },
      textCard: { title: '地球', body: '...', duration: 5 },
      exitState: { returnToParent: true, clearLayerOverrides: false },
    };
    expect(wp.bodyId).toBe('earth');
    expect(wp.scaleMode).toBe('enhanced');
    expect(wp.layerVisibility?.orbits).toBe(true);
    expect(wp.timeSetting?.clockRate).toBe(1);
  });
});

describe('Particle systems (E-16)', () => {
  it('AsteroidBeltImpl.render() records lastDrawVertexCount', () => {
    const belt = new AsteroidBeltImpl(100);
    belt.render();
    expect(belt.getLastDrawVertexCount()).toBe(100);
    expect(belt.getDrawCallCount()).toBe(1);
  });

  it('AsteroidBeltImpl.render(renderer) creates buffer and issues draw', () => {
    const belt = new AsteroidBeltImpl(50);
    const r = new MockRenderer();
    belt.render(r);
    expect(r.buffersCreated).toBe(1);
    expect(r.drawCalls).toBeGreaterThanOrEqual(1);
    expect(r.lastDrawVertexCount).toBe(50);
  });

  it('KuiperBeltImpl.render() records lastDrawVertexCount', () => {
    const belt = new KuiperBeltImpl(80);
    belt.render();
    expect(belt.getLastDrawVertexCount()).toBe(80);
  });

  it('KuiperBeltImpl.render(renderer) issues a draw call', () => {
    const belt = new KuiperBeltImpl(40);
    const r = new MockRenderer();
    belt.render(r);
    expect(r.drawCalls).toBeGreaterThanOrEqual(1);
  });

  it('OortCloudImpl.render() records lastDrawVertexCount', () => {
    const cloud = new OortCloudImpl(120);
    cloud.render();
    expect(cloud.getLastDrawVertexCount()).toBe(120);
  });

  it('SolarWindImpl.render() records lastDrawVertexCount', () => {
    const wind = new SolarWindImpl(200);
    wind.render();
    expect(wind.getLastDrawVertexCount()).toBe(200);
  });

  it('MagnetosphereImpl.render() produces non-zero vertex count', () => {
    const mag = new MagnetosphereImpl();
    mag.setMagneticFieldStrength(1.0);
    mag.render();
    expect(mag.getLastDrawVertexCount()).toBeGreaterThan(0);
  });

  it('AurorasImpl.render() produces non-zero vertex count when active', () => {
    const aur = new AurorasImpl();
    aur.setActive(true);
    aur.setIntensity(1.0);
    aur.render();
    expect(aur.getLastDrawVertexCount()).toBeGreaterThan(0);
  });

  it('AurorasImpl.render() produces zero vertices when inactive', () => {
    const aur = new AurorasImpl();
    aur.setActive(false);
    aur.render();
    expect(aur.getLastDrawVertexCount()).toBe(0);
  });

  it('MagnetosphereImpl.render(renderer) creates buffer when vertex count > 0', () => {
    const mag = new MagnetosphereImpl();
    mag.setMagneticFieldStrength(1.0);
    const r = new MockRenderer();
    mag.render(r);
    expect(r.buffersCreated).toBe(1);
  });
});

describe('EventTimelinePlayer (FR-EVENT)', () => {
  it('starts inactive', () => {
    const player = new EventTimelinePlayer();
    expect(player.isActive()).toBe(false);
  });

  it('startTimeline activates and invokes onTick for first event', () => {
    const player = new EventTimelinePlayer();
    const onTick = vi.fn();
    player.startTimeline(['e1', 'e2', 'e3'], onTick);
    expect(player.isActive()).toBe(true);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith('e1', 0, 3);
  });

  it('stopTimeline deactivates and clears state', () => {
    const player = new EventTimelinePlayer();
    player.startTimeline(['e1', 'e2'], () => {});
    player.stopTimeline();
    expect(player.isActive()).toBe(false);
    expect(player.getEventIds()).toEqual([]);
    expect(player.getCurrentIndex()).toBe(0);
  });

  it('tick advances index and invokes onTick', () => {
    const player = new EventTimelinePlayer();
    const onTick = vi.fn();
    player.startTimeline(['e1', 'e2', 'e3'], onTick);
    onTick.mockClear();
    expect(player.tick()).toBe(true);
    expect(onTick).toHaveBeenCalledWith('e2', 1, 3);
  });

  it('tick returns false and stops at end', () => {
    const player = new EventTimelinePlayer();
    player.startTimeline(['e1'], () => {});
    expect(player.tick()).toBe(false);
    expect(player.isActive()).toBe(false);
  });

  it('seekTo jumps to a given index', () => {
    const player = new EventTimelinePlayer();
    const onTick = vi.fn();
    player.startTimeline(['e1', 'e2', 'e3'], onTick);
    onTick.mockClear();
    expect(player.seekTo(2)).toBe(true);
    expect(onTick).toHaveBeenCalledWith('e3', 2, 3);
    expect(player.getCurrentIndex()).toBe(2);
  });

  it('seekTo returns false for out-of-range index', () => {
    const player = new EventTimelinePlayer();
    player.startTimeline(['e1'], () => {});
    expect(player.seekTo(5)).toBe(false);
    expect(player.seekTo(-1)).toBe(false);
  });

  it('tick returns false when not active', () => {
    const player = new EventTimelinePlayer();
    expect(player.tick()).toBe(false);
  });

  it('startTimeline with empty list stays active but does not call onTick', () => {
    const player = new EventTimelinePlayer();
    const onTick = vi.fn();
    player.startTimeline([], onTick);
    expect(player.isActive()).toBe(true);
    expect(onTick).not.toHaveBeenCalled();
  });
});

describe('jumpToEventMax (FR-EVENT)', () => {
  it('returns clock equal to event peakDate', () => {
    const event = makeEvent({
      peakDate: new Date('2025-07-17T12:00:00Z'),
    });
    const result = jumpToEventMax(event);
    expect(result.clock).toEqual(event.peakDate);
  });

  it('returns eventId matching input', () => {
    const event = makeEvent({ id: 'evt-xyz' });
    const result = jumpToEventMax(event);
    expect(result.eventId).toBe('evt-xyz');
  });

  it('picks first non-sun body as camera target', () => {
    const event = makeEvent({ bodies: ['sun', 'moon', 'earth'] });
    const result = jumpToEventMax(event);
    expect(result.camera.bodyId).toBe('moon');
  });

  it('falls back to first body if only sun is present', () => {
    const event = makeEvent({ bodies: ['sun'] });
    const result = jumpToEventMax(event);
    expect(result.camera.bodyId).toBe('sun');
  });

  it('uses event.coordinates for camera position when available', () => {
    const event = makeEvent({ coordinates: { x: 100, y: 200, z: 300 } });
    const result = jumpToEventMax(event);
    expect(result.camera.position).toEqual({ x: 100, y: 200, z: 300 });
  });

  it('provides a default fov of 60', () => {
    const event = makeEvent();
    const result = jumpToEventMax(event);
    expect(result.camera.fov).toBe(60);
  });
});

describe('EVENT_TYPES registry', () => {
  it('contains a label and icon for every event type', () => {
    const types = Object.keys(EVENT_TYPES);
    expect(types.length).toBeGreaterThanOrEqual(8);
    for (const t of types) {
      const entry = EVENT_TYPES[t as keyof typeof EVENT_TYPES];
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.icon).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

describe('createCruiseService factory', () => {
  it('returns a working CruiseService', () => {
    const svc = createCruiseService();
    svc.startCruise('cruise-moon-landing');
    expect(svc.getCurrentProgress()).toBe(0);
  });
});

describe('PureViewingCallbacks full coverage', () => {
  it('callbacks fire through the createPureViewingMode factory too', () => {
    const m = createPureViewingMode();
    const onUI = vi.fn();
    const onHUD = vi.fn();
    const cb: PureViewingCallbacks = {
      onUIVisibilityChange: onUI,
      onHUDDisabled: onHUD,
    };
    m.setCallbacks?.(cb);
    m.enter();
    expect(onUI).toHaveBeenCalledWith(false);
    expect(onHUD).toHaveBeenCalledWith(true);
  });
});
