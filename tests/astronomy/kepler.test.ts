import { describe, expect, it } from "vitest";
import { propagateKepler } from "../../src/astronomy/kepler";
import type { OrbitalElements } from "../../src/astronomy/types";

const epochJD = 2_451_545;

function elements(overrides: Partial<OrbitalElements> = {}): OrbitalElements {
  return {
    epochJD,
    semiMajorAxisKm: 1000,
    eccentricity: 0,
    inclinationRad: 0,
    longitudeAscendingNodeRad: 0,
    argumentOfPeriapsisRad: 0,
    meanAnomalyRad: 0,
    elementFrame: "ECLIPJ2000",
    ...overrides,
  };
}

describe("Kepler propagation", () => {
  it("propagates a circular orbit by its calculated period", () => {
    const muKm3S2 = 10;
    const periodSeconds = 2 * Math.PI * Math.sqrt(1000 ** 3 / muKm3S2);
    const position = propagateKepler(elements(), epochJD + periodSeconds / 4 / 86_400, muKm3S2);

    expect(Math.abs(position.x)).toBeLessThan(0.001);
    expect(position.y).toBeCloseTo(1000, 3);
    expect(Math.abs(position.z)).toBeLessThan(0.001);
  });

  it("reaches the correct periapsis and apoapsis of an eccentric orbit", () => {
    const orbit = elements({ eccentricity: 0.2 });
    const periodSeconds = 2 * Math.PI * Math.sqrt(1000 ** 3 / 10);
    const periapsis = propagateKepler(orbit, epochJD, 10);
    const apoapsis = propagateKepler(orbit, epochJD + periodSeconds / 2 / 86_400, 10);

    expect(Math.hypot(periapsis.x, periapsis.y, periapsis.z)).toBeCloseTo(800, 5);
    expect(Math.hypot(apoapsis.x, apoapsis.y, apoapsis.z)).toBeCloseTo(1200, 5);
  });

  it("rotates a quarter orbit by the specified inclination", () => {
    const periodSeconds = 2 * Math.PI * Math.sqrt(1000 ** 3 / 10);
    const position = propagateKepler(elements({ inclinationRad: Math.PI / 2 }), epochJD + periodSeconds / 4 / 86_400, 10);

    expect(Math.abs(position.x)).toBeLessThan(0.001);
    expect(Math.abs(position.y)).toBeLessThan(0.001);
    expect(position.z).toBeCloseTo(1000, 3);
  });

  it("propagates a hyperbolic orbit to its finite periapsis", () => {
    const orbit = elements({ semiMajorAxisKm: -1000, eccentricity: 1.5 });
    const position = propagateKepler(orbit, epochJD, 10);

    expect(position.x).toBeCloseTo(500, 6);
    expect(position.y).toBeCloseTo(0, 6);
    expect([position.x, position.y, position.z].every(Number.isFinite)).toBe(true);
  });

  it("rejects invalid eccentricity, semi-major axis, and gravitational parameter", () => {
    expect(() => propagateKepler(elements({ eccentricity: -0.1 }), epochJD, 10)).toThrow(RangeError);
    expect(() => propagateKepler(elements({ semiMajorAxisKm: 0 }), epochJD, 10)).toThrow(RangeError);
    expect(() => propagateKepler(elements(), epochJD, 0)).toThrow(RangeError);
  });
});
