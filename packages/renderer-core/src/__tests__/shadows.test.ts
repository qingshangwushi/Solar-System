import { describe, it, expect } from 'vitest';
import {
  computeShadowCone,
  computeEclipseGeometry,
  computeLunarEclipse,
  computeShadowOnSurface,
  computeShadowMapParams,
} from '../shadows.js';

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