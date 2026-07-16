import { describe, it, expect } from 'vitest';
import {
  evaluateChebyshevPolynomial,
  evaluateChebyshevDerivative,
  findSegment,
  evaluateSegment,
  evaluateEphemeris,
  buildChebyshevApproximation,
  computeOrbitElements,
  propagateKepler,
  EphemerisManager,
} from '../ephemeris.js';

describe('Chebyshev Polynomial', () => {
  it('should evaluate Chebyshev polynomial at center', () => {
    const coeffs = new Float64Array([1, 0, 0]);
    const result = evaluateChebyshevPolynomial(coeffs, 0);
    expect(result).toBe(1);
  });

  it('should evaluate Chebyshev polynomial at endpoints', () => {
    const coeffs = new Float64Array([1, 0, 0]);
    expect(evaluateChebyshevPolynomial(coeffs, 1)).toBeCloseTo(1, 10);
    expect(evaluateChebyshevPolynomial(coeffs, -1)).toBeCloseTo(1, 10);
  });

  it('should evaluate linear Chebyshev polynomial', () => {
    const coeffs = new Float64Array([0, 1, 0]);
    expect(evaluateChebyshevPolynomial(coeffs, 0)).toBeCloseTo(0, 10);
    expect(evaluateChebyshevPolynomial(coeffs, 1)).toBeCloseTo(1, 10);
    expect(evaluateChebyshevPolynomial(coeffs, -1)).toBeCloseTo(-1, 10);
  });

  it('should evaluate quadratic Chebyshev polynomial', () => {
    const coeffs = new Float64Array([1, 0, 1]);
    expect(evaluateChebyshevPolynomial(coeffs, 0)).toBeCloseTo(0, 10);
    expect(evaluateChebyshevPolynomial(coeffs, 1)).toBeCloseTo(2, 10);
    expect(evaluateChebyshevPolynomial(coeffs, -1)).toBeCloseTo(2, 10);
  });

  it('should evaluate derivative at center', () => {
    const coeffs = new Float64Array([0, 1, 0]);
    const result = evaluateChebyshevDerivative(coeffs, 0);
    expect(result).toBeCloseTo(2, 10);
  });
});

describe('Segment Search', () => {
  it('should find segment for time in range', () => {
    const segments = [
      { startMjdTdb: 58000, endMjdTdb: 58500, durationDays: 500, coefficients: new Float64Array(), degree: 0 },
      { startMjdTdb: 58500, endMjdTdb: 59000, durationDays: 500, coefficients: new Float64Array(), degree: 0 },
    ];
    const result = findSegment(segments, 58250);
    expect(result).not.toBeNull();
    expect(result?.startMjdTdb).toBe(58000);
  });

  it('should return null for time out of range', () => {
    const segments = [
      { startMjdTdb: 58000, endMjdTdb: 58500, durationDays: 500, coefficients: new Float64Array(), degree: 0 },
    ];
    const result = findSegment(segments, 57000);
    expect(result).toBeNull();
  });
});

describe('Segment Evaluation', () => {
  it('should evaluate simple segment', () => {
    const coeffs = new Float64Array([1, 0, 0, 2, 0, 0, 3, 0, 0]);
    const segment = {
      startMjdTdb: 58000,
      endMjdTdb: 58100,
      durationDays: 100,
      coefficients: coeffs,
      degree: 2,
    };
    const result = evaluateSegment(segment, 58050);
    expect(result.position.x).toBe(1);
    expect(result.position.y).toBe(2);
    expect(result.position.z).toBe(3);
  });
});

describe('Ephemeris Evaluation', () => {
  it('should evaluate ephemeris within range', () => {
    const coeffs = new Float64Array([1, 0, 2, 0, 3, 0]);
    const ephemeris = {
      bodyId: 399,
      centerId: 0,
      referenceFrame: 'SolarSystemBarycentricInertial',
      precision: 'P3',
      segments: [{
        startMjdTdb: 58000,
        endMjdTdb: 58100,
        durationDays: 100,
        coefficients: coeffs,
        degree: 1,
      }],
    };
    const result = evaluateEphemeris(ephemeris, 58050, 'Tdb');
    expect(result.outOfRange).toBe(false);
    expect(result.precision).toBe('P3');
  });

  it('should return out of range for time outside coverage', () => {
    const coeffs = new Float64Array([1, 0, 2, 0, 3, 0]);
    const ephemeris = {
      bodyId: 399,
      centerId: 0,
      referenceFrame: 'SolarSystemBarycentricInertial',
      precision: 'P3',
      segments: [{
        startMjdTdb: 58000,
        endMjdTdb: 58100,
        durationDays: 100,
        coefficients: coeffs,
        degree: 1,
      }],
    };
    const result = evaluateEphemeris(ephemeris, 59000, 'Tdb');
    expect(result.outOfRange).toBe(true);
  });
});

describe('Chebyshev Approximation', () => {
  it('should build approximation for linear function', () => {
    const samples: { x: number; y: number; z: number }[] = [];
    const times: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = 58000 + i * 10;
      times.push(t);
      samples.push({ x: t - 58000, y: 2 * (t - 58000), z: 3 * (t - 58000) });
    }
    const segment = buildChebyshevApproximation(samples, times, 58000, 58100, 2);
    const result = evaluateSegment(segment, 58050);
    expect(result.position.x).toBeCloseTo(50, 2);
    expect(result.position.y).toBeCloseTo(100, 2);
    expect(result.position.z).toBeCloseTo(150, 2);
  });
});

describe('Orbit Elements', () => {
  it('should compute orbit elements for circular orbit', () => {
    const mu = 398600.4418;
    const position = { x: 7000, y: 0, z: 0 };
    const velocity = { x: 0, y: Math.sqrt(mu / 7000), z: 0 };
    const elements = computeOrbitElements(position, velocity, mu);
    expect(elements.semiMajorAxis).toBeCloseTo(7000, 0);
    expect(elements.eccentricity).toBeCloseTo(0, 5);
    expect(elements.periodDays).toBeCloseTo(0.067, 2);
  });
});

describe('Kepler Propagation', () => {
  it('should propagate circular orbit by half period', () => {
    const mu = 398600.4418;
    const a = 7000;
    const elements = {
      semiMajorAxis: a,
      eccentricity: 0,
      inclination: 0,
      ascendingNode: 0,
      argumentPeriapsis: 0,
      meanAnomaly: 0,
    };
    const period = 2 * Math.PI * Math.sqrt(a * a * a / mu);
    const result = propagateKepler(mu, elements, period / 2);
    expect(result.position.x).toBeCloseTo(-a, 0);
    expect(result.position.y).toBeCloseTo(0, 0);
  });
});

describe('Ephemeris Manager', () => {
  it('should register and evaluate ephemeris', () => {
    const manager = new EphemerisManager();
    const coeffs = new Float64Array([1, 0, 2, 0, 3, 0]);
    manager.registerEphemeris({
      bodyId: 399,
      centerId: 0,
      referenceFrame: 'SolarSystemBarycentricInertial',
      precision: 'P3',
      segments: [{
        startMjdTdb: 58000,
        endMjdTdb: 58100,
        durationDays: 100,
        coefficients: coeffs,
        degree: 1,
      }],
    });
    const result = manager.evaluate(399, 58050, 'Tdb');
    expect(result.supported).toBe(true);
    expect(result.outOfRange).toBe(false);
  });

  it('should return unsupported for unknown body', () => {
    const manager = new EphemerisManager();
    const result = manager.evaluate(9999, 58050, 'Tdb');
    expect(result.supported).toBe(false);
  });

  it('should return coverage', () => {
    const manager = new EphemerisManager();
    const coeffs = new Float64Array([1, 0, 2, 0, 3, 0]);
    manager.registerEphemeris({
      bodyId: 399,
      centerId: 0,
      referenceFrame: 'SolarSystemBarycentricInertial',
      precision: 'P3',
      segments: [{
        startMjdTdb: 58000,
        endMjdTdb: 58100,
        durationDays: 100,
        coefficients: coeffs,
        degree: 1,
      }],
    });
    const coverage = manager.getCoverage(399);
    expect(coverage).toEqual([58000, 58100]);
  });

  it('should check support for time range', () => {
    const manager = new EphemerisManager();
    const coeffs = new Float64Array([1, 0, 2, 0, 3, 0]);
    manager.registerEphemeris({
      bodyId: 399,
      centerId: 0,
      referenceFrame: 'SolarSystemBarycentricInertial',
      precision: 'P3',
      segments: [{
        startMjdTdb: 58000,
        endMjdTdb: 58100,
        durationDays: 100,
        coefficients: coeffs,
        degree: 1,
      }],
    });
    expect(manager.supports(399, [58000, 58100])).toBe(true);
    expect(manager.supports(399, [57000, 58100])).toBe(false);
  });
});
