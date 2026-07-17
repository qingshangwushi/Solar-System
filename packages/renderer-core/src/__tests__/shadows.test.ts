import { describe, it, expect } from 'vitest';
import {
  computeShadowCone,
  computeEclipseGeometry,
  computeLunarEclipse,
  computeShadowOnSurface,
  computeShadowMapParams,
  computeContactTimes,
  computeContactTimesFromSeparation,
  sampleShadowPCF,
  findRoot,
  ArrayShadowMap,
} from '../shadows.js';
import type { ShadowMapSampler } from '../shadows.js';

describe('Shadow and Eclipse Geometry', () => {
  describe('Shadow Cone', () => {
    it('should compute shadow cone for distant light', () => {
      const casterPos = { x: 0, y: 0, z: 0 };
      const casterRadius = 1737.4; // Moon radius in km
      const lightPos = { x: 384400, y: 0, z: 0 }; // Sun direction
      const lightRadius = 696340; // Sun radius in km

      const cone = computeShadowCone(casterPos, casterRadius, lightPos, lightRadius);

      expect(cone.direction.x).toBeCloseTo(-1, 5);
      expect(cone.umbraLength).toBeGreaterThan(0);
      // Umbra extends further than penumbra for larger light source
      expect(cone.umbraLength).toBeGreaterThan(cone.penumbraLength);
    });

    it('should compute shadow cone apex position', () => {
      const casterPos = { x: 100, y: 0, z: 0 };
      const casterRadius = 1000;
      const lightPos = { x: 0, y: 0, z: 0 };
      const lightRadius = 5000;

      const cone = computeShadowCone(casterPos, casterRadius, lightPos, lightRadius);

      const apexDist = Math.sqrt(
        (cone.apex.x - casterPos.x) ** 2 +
        (cone.apex.y - casterPos.y) ** 2 +
        (cone.apex.z - casterPos.z) ** 2,
      );
      expect(apexDist).toBeGreaterThan(0);
    });

    it('should have umbra longer than penumbra for larger light', () => {
      const casterPos = { x: 0, y: 0, z: 0 };
      const casterRadius = 100;
      const lightPos = { x: 10000, y: 0, z: 0 };
      const lightRadius = 500;

      const cone = computeShadowCone(casterPos, casterRadius, lightPos, lightRadius);

      // Umbra converges to apex, penumbra diverges
      expect(cone.umbraLength).toBeGreaterThan(cone.penumbraLength);
    });
  });

  describe('Solar Eclipse Geometry', () => {
    it('should detect no eclipse when separated', () => {
      // Sun at origin, Moon far from line of sight
      const sunPos = { x: 0, y: 0, z: 0 };
      const sunRadius = 696340;
      const moonPos = { x: 150000000, y: 500000, z: 0 }; // Moon off to the side
      const moonRadius = 1737.4;
      const observerPos = { x: 149600000, y: 0, z: 0 }; // Earth position

      const eclipse = computeEclipseGeometry(sunPos, sunRadius, moonPos, moonRadius, observerPos);

      expect(eclipse.type).toBe('none');
      expect(eclipse.magnitude).toBe(0);
    });

    it('should detect partial eclipse when moon partially covers sun', () => {
      // Create a scenario where moon is between sun and observer, slightly off-center
      const sunPos = { x: 0, y: 0, z: 0 };
      const sunRadius = 1000;
      const moonPos = { x: 999000, y: 50, z: 0 }; // Moon almost blocking sun
      const moonRadius = 900; // Moon slightly smaller than sun
      const observerPos = { x: 1000000, y: 0, z: 0 };

      const eclipse = computeEclipseGeometry(sunPos, sunRadius, moonPos, moonRadius, observerPos);

      expect(eclipse.type).toBe('solar');
      expect(eclipse.magnitude).toBeGreaterThan(0);
    });

    it('should compute obscuration for total eclipse', () => {
      // Moon larger than sun and directly in front
      // Observer at origin, sun behind moon
      const observerPos = { x: 0, y: 0, z: 0 };
      const sunPos = { x: 2000, y: 0, z: 0 }; // Sun far away
      const sunRadius = 50;
      const moonPos = { x: 1000, y: 0, z: 0 }; // Moon closer, blocking sun
      const moonRadius = 60; // Moon larger than sun angular size

      const eclipse = computeEclipseGeometry(sunPos, sunRadius, moonPos, moonRadius, observerPos);

      // When moon is directly between observer and sun
      expect(eclipse.magnitude).toBeGreaterThan(0);
    });
  });

  describe('Lunar Eclipse Geometry', () => {
    it('should detect no lunar eclipse', () => {
      const sunPos = { x: 0, y: 0, z: 0 };
      const sunRadius = 696340;
      const earthPos = { x: 150000000, y: 0, z: 0 };
      const earthRadius = 6371;
      const moonPos = { x: 150384400, y: 100000, z: 0 };
      const moonRadius = 1737.4;

      const eclipse = computeLunarEclipse(sunPos, sunRadius, earthPos, earthRadius, moonPos, moonRadius);

      expect(eclipse.type).toBe('none');
    });

    it('should detect penumbral lunar eclipse', () => {
      const sunPos = { x: 0, y: 0, z: 0 };
      const sunRadius = 696340;
      const earthPos = { x: 150000000, y: 0, z: 0 };
      const earthRadius = 6371;
      const moonPos = { x: 150384400, y: 0, z: 0 };
      const moonRadius = 1737.4;

      const eclipse = computeLunarEclipse(sunPos, sunRadius, earthPos, earthRadius, moonPos, moonRadius);

      expect(eclipse.type).toBe('lunar');
      expect(eclipse.magnitude).toBeGreaterThan(0);
    });
  });

  describe('Shadow on Surface', () => {
    it('should detect point outside shadow', () => {
      const cone = {
        apex: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        umbraRadius: 100,
        penumbraRadius: 200,
        umbraLength: 1000,
        penumbraLength: 500,
      };
      const surfacePoint = { x: 500, y: 500, z: 0 };
      const surfaceNormal = { x: 0, y: 0, z: 1 };

      const result = computeShadowOnSurface(cone, surfacePoint, surfaceNormal);

      expect(result.umbra).toBe(false);
      expect(result.penumbra).toBe(false);
      expect(result.intensity).toBe(1.0);
    });

    it('should detect point in penumbra', () => {
      // Apex at origin, shadow extends in +X direction
      // Penumbra radius at distance 300 should be around 120
      const cone = {
        apex: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        umbraRadius: 50,
        penumbraRadius: 200,
        umbraLength: 2000,
        penumbraLength: 1000,
      };
      // Point at X=300, Y=80 should be in penumbra
      const surfacePoint = { x: 300, y: 80, z: 0 };
      const surfaceNormal = { x: 0, y: 0, z: 1 };

      const result = computeShadowOnSurface(cone, surfacePoint, surfaceNormal);

      expect(result.penumbra).toBe(true);
      // Intensity should be between 0 and 1
      expect(result.intensity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Shadow Map Parameters', () => {
    it('should compute shadow map matrices', () => {
      const lightPos = { x: 0, y: 0, z: 0 };
      const casterPos = { x: 100, y: 0, z: 0 };
      const casterRadius = 10;
      const targetRadius = 50;
      const targetPos = { x: 200, y: 0, z: 0 };

      const params = computeShadowMapParams(lightPos, casterPos, casterRadius, targetRadius, targetPos);

      expect(params.projectionMatrix.length).toBe(16);
      expect(params.viewMatrix.length).toBe(16);
      expect(params.resolution).toBe(2048);
    });
  });
});

describe('findRoot (Bisection)', () => {
  it('should find the root of a linear function', () => {
    const root = findRoot((x) => x - 2, 0, 10);
    expect(root).not.toBeNull();
    expect(root as number).toBeCloseTo(2, 5);
  });

  it('should find the root of a quadratic function', () => {
    // f(x) = x^2 - 4 has roots at x=2 and x=-2; in [0, 5] should find x=2
    const root = findRoot((x) => x * x - 4, 0, 5);
    expect(root).not.toBeNull();
    expect(root as number).toBeCloseTo(2, 4);
  });

  it('should return null when signs at endpoints are the same', () => {
    const root = findRoot((x) => x * x + 1, -1, 1);
    expect(root).toBeNull();
  });

  it('should return the endpoint when f(a) is exactly zero', () => {
    const root = findRoot((x) => x, 0, 1);
    expect(root).toBe(0);
  });

  it('should return the endpoint when f(b) is exactly zero', () => {
    const root = findRoot((x) => x - 1, 0, 1);
    expect(root).toBe(1);
  });

  it('should respect the tolerance parameter', () => {
    const root = findRoot((x) => x - Math.PI, 0, 10, 1e-2);
    expect(root).not.toBeNull();
    expect(Math.abs((root as number) - Math.PI)).toBeLessThan(1e-2);
  });
});

describe('sampleShadowPCF', () => {
  it('should return 1.0 when fully illuminated (depth less than stored)', () => {
    const map = ArrayShadowMap.filled(8, 8, 0.9);
    const visibility = sampleShadowPCF(map, [0.5, 0.5], 0.5, 1);
    expect(visibility).toBe(1.0);
  });

  it('should return 0.0 when fully shadowed (depth greater than stored)', () => {
    const map = ArrayShadowMap.filled(8, 8, 0.1);
    const visibility = sampleShadowPCF(map, [0.5, 0.5], 0.9, 1);
    expect(visibility).toBe(0.0);
  });

  it('should average over a 3x3 kernel', () => {
    // Build a 4x4 map: top-left 2x2 region has depth 0.9 (visible); rest has depth 0.1 (shadow)
    const map = new ArrayShadowMap(4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (x < 2 && y < 2) {
          map.setPixel(x, y, 0.9);
        } else {
          map.setPixel(x, y, 0.1);
        }
      }
    }
    // Sample at center of map with depth=0.5; some neighbors visible, others not
    const visibility = sampleShadowPCF(map, [0.5, 0.5], 0.5, 3, null, 0.0);
    expect(visibility).toBeGreaterThan(0);
    expect(visibility).toBeLessThan(1);
  });

  it('should accept a custom sampler', () => {
    const map = ArrayShadowMap.filled(4, 4, 0.5);
    const sampler: ShadowMapSampler = {
      sampleDepth: () => 0.9,
    };
    const visibility = sampleShadowPCF(map, [0.5, 0.5], 0.5, 3, sampler);
    expect(visibility).toBe(1.0);
  });

  it('should clamp UV coordinates to [0,1]', () => {
    const map = ArrayShadowMap.filled(4, 4, 0.9);
    const visibility = sampleShadowPCF(map, [1.5, -0.5], 0.5, 1);
    expect(visibility).toBe(1.0);
  });

  it('should handle kernelSize=1 as single-sample', () => {
    const map = ArrayShadowMap.filled(8, 8, 0.7);
    const v1 = sampleShadowPCF(map, [0.5, 0.5], 0.5, 1);
    expect(v1).toBe(1.0);
    const v2 = sampleShadowPCF(map, [0.5, 0.5], 0.9, 1);
    expect(v2).toBe(0.0);
  });

  it('should respect bias parameter', () => {
    // depth = 0.5; stored = 0.5 + bias + 0.001 -> stored > depth + bias => visible
    const map = ArrayShadowMap.filled(8, 8, 0.502);
    const v1 = sampleShadowPCF(map, [0.5, 0.5], 0.5, 1, null, 0.001);
    expect(v1).toBe(1.0);
    const v2 = sampleShadowPCF(map, [0.5, 0.5], 0.5, 1, null, 0.005);
    expect(v2).toBe(0.0);
  });
});

describe('ArrayShadowMap', () => {
  it('should construct with given dimensions', () => {
    const map = new ArrayShadowMap(4, 4);
    expect(map.width).toBe(4);
    expect(map.height).toBe(4);
    expect(map.data.length).toBe(16);
  });

  it('should fill with given value via filled()', () => {
    const map = ArrayShadowMap.filled(2, 2, 0.5);
    expect(map.sample(0.25, 0.25)).toBeCloseTo(0.5, 5);
    expect(map.sample(0.75, 0.75)).toBeCloseTo(0.5, 5);
  });

  it('should set and read pixels', () => {
    const map = new ArrayShadowMap(2, 2);
    map.setPixel(0, 0, 0.9);
    map.setPixel(1, 1, 0.1);
    expect(map.sample(0.25, 0.25)).toBeCloseTo(0.9, 5);
    expect(map.sample(0.75, 0.75)).toBeCloseTo(0.1, 5);
  });

  it('should clamp out-of-bounds UVs to edge', () => {
    const map = new ArrayShadowMap(2, 2);
    map.setPixel(0, 0, 0.3);
    map.setPixel(1, 1, 0.7);
    expect(map.sample(-1, -1)).toBeCloseTo(0.3, 5);
    expect(map.sample(2, 2)).toBeCloseTo(0.7, 5);
  });
});

describe('computeContactTimes', () => {
  // Build a separation function that is V-shaped with minimum 0 at t=50
  // sep(t) = |t - 50|
  const vShape = (t: number): number => Math.abs(t - 50);

  it('should return Greatest at the minimum-separation time', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    const greatest = contacts.find((c) => c.type === 'Greatest');
    expect(greatest).toBeDefined();
    expect(greatest?.time).toBeCloseTo(50, 1);
  });

  it('should compute P1 at the time separation crosses radiusP1 from above', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    const p1 = contacts.find((c) => c.type === 'P1');
    expect(p1).toBeDefined();
    expect(p1?.time).toBeCloseTo(20, 1); // |t-50| = 30 => t = 20
  });

  it('should compute P2 at the time separation crosses radiusP1 from below', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    const p2 = contacts.find((c) => c.type === 'P2');
    expect(p2).toBeDefined();
    expect(p2?.time).toBeCloseTo(80, 1); // |t-50| = 30 => t = 80
  });

  it('should compute U1 (total begin) when separation dips below radiusU1', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    const u1 = contacts.find((c) => c.type === 'U1');
    expect(u1).toBeDefined();
    expect(u1?.time).toBeCloseTo(40, 1); // |t-50| = 10 => t = 40
  });

  it('should compute U4 (total end) when separation rises above radiusU1', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    const u4 = contacts.find((c) => c.type === 'U4');
    expect(u4).toBeDefined();
    expect(u4?.time).toBeCloseTo(60, 1);
  });

  it('should include U2 between U1 and Greatest', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    const u2 = contacts.find((c) => c.type === 'U2');
    const u1 = contacts.find((c) => c.type === 'U1');
    const greatest = contacts.find((c) => c.type === 'Greatest');
    expect(u2).toBeDefined();
    expect(u2?.time).toBeGreaterThan(u1?.time as number);
    expect(u2?.time).toBeLessThan(greatest?.time as number);
  });

  it('should include U3 between Greatest and U4', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    const u3 = contacts.find((c) => c.type === 'U3');
    const greatest = contacts.find((c) => c.type === 'Greatest');
    const u4 = contacts.find((c) => c.type === 'U4');
    expect(u3).toBeDefined();
    expect(u3?.time).toBeGreaterThan(greatest?.time as number);
    expect(u3?.time).toBeLessThan(u4?.time as number);
  });

  it('should return contacts in ascending time order', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    for (let i = 1; i < contacts.length; i++) {
      expect(contacts[i]!.time).toBeGreaterThanOrEqual(contacts[i - 1]!.time);
    }
  });

  it('should omit U1/U2/U3/U4 when total eclipse does not occur', () => {
    // V-shape with minimum 0.5 at t=50; radiusU1 = 0.1 so no total eclipse
    const sep = (t: number): number => 0.5 + Math.abs(t - 50) * 0.01;
    const contacts = computeContactTimes(sep, 0, 100, 1.0, 0.1);
    const types = contacts.map((c) => c.type);
    expect(types).not.toContain('U1');
    expect(types).not.toContain('U2');
    expect(types).not.toContain('U3');
    expect(types).not.toContain('U4');
  });

  it('should produce 7 contacts for a total-eclipse V-shape', () => {
    const contacts = computeContactTimes(vShape, 0, 100, 30, 10);
    expect(contacts.length).toBe(7);
    const types = new Set(contacts.map((c) => c.type));
    expect(types.has('P1')).toBe(true);
    expect(types.has('U1')).toBe(true);
    expect(types.has('U2')).toBe(true);
    expect(types.has('Greatest')).toBe(true);
    expect(types.has('U3')).toBe(true);
    expect(types.has('U4')).toBe(true);
    expect(types.has('P2')).toBe(true);
  });

  it('should agree with computeContactTimesFromSeparation', () => {
    const a = computeContactTimes(vShape, 0, 100, 30, 10);
    const b = computeContactTimesFromSeparation(vShape, 0, 100, 30, 10);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.type).toBe(b[i]!.type);
      expect(a[i]!.time).toBeCloseTo(b[i]!.time, 6);
    }
  });

  it('should handle a sinusoidal separation function', () => {
    // Sep = 1 + cos(t) => minimum 0 at t=PI, max 2 at t=0,2PI
    const sep = (t: number): number => 1 + Math.cos(t);
    const contacts = computeContactTimes(sep, 0, 2 * Math.PI, 1.5, 0.5);
    const greatest = contacts.find((c) => c.type === 'Greatest');
    expect(greatest?.time).toBeCloseTo(Math.PI, 1);
  });
});