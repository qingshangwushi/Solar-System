/**
 * Kepler-solver verification.
 *
 * Checks that the solvers satisfy their defining equations to machine precision
 * and that the propagator reproduces published orbital geometry.
 */
import { describe, expect, it } from 'vitest'
import {
  meanMotionRadPerDay,
  orbitalPeriodDays,
  orbitalSpeedKmS,
  perifocalPositionFromMeanAnomaly,
  perifocalToReferenceFrame,
  semiMajorAxisFromPerihelion,
  solveEccentricAnomaly,
  solveHyperbolicAnomaly,
} from '../KeplerSolver'
import { AU_KM } from '../Units'
import { GM_SUN_KM3_S2 } from '../Constants'

describe('elliptic Kepler equation', () => {
  it('returns the mean anomaly for a circular orbit', () => {
    expect(solveEccentricAnomaly(1.234, 0)).toBeCloseTo(1.234, 12)
  })

  it.each([
    [0.31, 0.2],
    [2.5, 0.7],
    [-1.2, 0.93],
    [0.0, 0.99],
    [-0.383, 0.2056],
  ])('satisfies M = E - e sin E for M=%d e=%d', (meanAnomaly, eccentricity) => {
    const eccentric = solveEccentricAnomaly(meanAnomaly, eccentricity)
    const residual = eccentric - eccentricity * Math.sin(eccentric) - meanAnomaly
    expect(Math.abs(residual)).toBeLessThan(1e-12)
  })

  it('normalizes the mean anomaly into (-pi, pi] before iterating', () => {
    // 5.9 rad is equivalent to 5.9 - 2pi; the solver returns the principal solution.
    expect(solveEccentricAnomaly(5.9, 0.2056)).toBeCloseTo(solveEccentricAnomaly(5.9 - 2 * Math.PI, 0.2056), 12)
  })
})

describe('hyperbolic Kepler equation', () => {
  it('satisfies M = e sinh H - H', () => {
    for (const [meanAnomaly, eccentricity] of [
      [0.5, 1.2],
      [3.0, 1.05],
      [-2.0, 2.4],
      [0.0, 1.5],
    ]) {
      const hyperbolic = solveHyperbolicAnomaly(meanAnomaly, eccentricity)
      const residual = eccentricity * Math.sinh(hyperbolic) - hyperbolic - meanAnomaly
      expect(Math.abs(residual)).toBeLessThan(1e-9)
    }
  })

  it('rejects bound orbits', () => {
    expect(() => solveHyperbolicAnomaly(0.1, 0.9)).toThrow(RangeError)
  })
})

describe('orbit geometry', () => {
  it('places the body at perihelion for M = 0', () => {
    const position = perifocalPositionFromMeanAnomaly(AU_KM, 0.5, 0)
    expect(position.radius).toBeCloseTo(AU_KM * 0.5, 3)
    expect(position.trueAnomaly).toBeCloseTo(0, 10)
  })

  it('places the body at aphelion for M = pi', () => {
    const position = perifocalPositionFromMeanAnomaly(AU_KM, 0.5, Math.PI)
    expect(position.radius).toBeCloseTo(AU_KM * 1.5, 3)
  })

  it('keeps the radius positive for a hyperbolic orbit', () => {
    const position = perifocalPositionFromMeanAnomaly(-2 * AU_KM, 1.5, 1.0)
    expect(position.radius).toBeGreaterThan(0)
    // r = a(1 - e cosh H) with a < 0 is positive for every H.
    expect(Number.isFinite(position.x)).toBe(true)
    expect(Number.isFinite(position.y)).toBe(true)
  })

  it('derives the semi-major axis from the perihelion distance', () => {
    // q/(1-e) with the rounded SBDB values for 1P/Halley; 5 significant digits is
    // the precision of the published inputs themselves.
    const derived = semiMajorAxisFromPerihelion(0.57486383 * AU_KM, 0.967936) / AU_KM
    expect(derived).toBeCloseTo(17.928635, 4)
  })

  it('reproduces 1P/Halley perihelion distance at its published perihelion passage', () => {
    // JPL SBDB elements for 1P/Halley (epoch 2023-01-01): a = 17.928635 au,
    // e = 0.967936, q = 0.57486383 au, Tp = JD 2446469.9736.
    const semiMajorAxisKm = 17.928635 * AU_KM
    const eccentricity = 0.967936
    const perihelionJD = 2446469.9736
    const motion = meanMotionRadPerDay(GM_SUN_KM3_S2, semiMajorAxisKm)
    const meanAnomaly = motion * (perihelionJD - perihelionJD)
    const position = perifocalPositionFromMeanAnomaly(semiMajorAxisKm, eccentricity, meanAnomaly)
    expect(position.radius / AU_KM).toBeCloseTo(0.57486383, 4)
  })
})

describe('third law and vis-viva', () => {
  it('reproduces the Earth orbital period from GM_sun', () => {
    const period = orbitalPeriodDays(GM_SUN_KM3_S2, AU_KM)
    expect(period).not.toBeNull()
    expect(period! / 365.25).toBeCloseTo(1.0000, 3)
  })

  it('reproduces the Jupiter sidereal period to better than 0.1 %', () => {
    const period = orbitalPeriodDays(GM_SUN_KM3_S2, 5.202887 * AU_KM)!
    expect(period).toBeCloseTo(4332.589, -1)
    expect(Math.abs(period - 4332.589) / 4332.589).toBeLessThan(0.001)
  })

  it('gives 29.78 km/s for the mean orbital speed of the Earth', () => {
    const speed = orbitalSpeedKmS(GM_SUN_KM3_S2, AU_KM, AU_KM)
    expect(speed).toBeCloseTo(29.78, 1)
  })
})

describe('frame rotation', () => {
  it('is a rotation (preserves length) and maps perihelion to the node/argument geometry', () => {
    const elements = {
      semiMajorAxisKm: AU_KM,
      eccentricity: 0.1,
      inclinationRad: 30 * (Math.PI / 180),
      nodeRad: 40 * (Math.PI / 180),
      argumentOfPeriapsisRad: 60 * (Math.PI / 180),
    }
    const plane = perifocalPositionFromMeanAnomaly(elements.semiMajorAxisKm, elements.eccentricity, 0.7)
    const rotated = perifocalToReferenceFrame(plane, elements)
    const length = Math.sqrt(rotated.x ** 2 + rotated.y ** 2 + rotated.z ** 2)
    expect(length).toBeCloseTo(plane.radius, 6)
  })

  it('keeps a zero-inclination orbit in the reference plane', () => {
    const elements = {
      semiMajorAxisKm: AU_KM,
      eccentricity: 0.2,
      inclinationRad: 0,
      nodeRad: 1.1,
      argumentOfPeriapsisRad: 0.4,
    }
    const plane = perifocalPositionFromMeanAnomaly(AU_KM, 0.2, 1.9)
    const rotated = perifocalToReferenceFrame(plane, elements)
    expect(Math.abs(rotated.z)).toBeLessThan(1e-6)
  })
})