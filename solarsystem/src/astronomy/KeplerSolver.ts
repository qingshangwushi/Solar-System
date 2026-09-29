/**
 * Keplerian orbit propagation.
 *
 * Formulas
 *  - Kepler's equation and its solution: Meeus, *Astronomical Algorithms* (2nd ed.)
 *    chapter 30; and NASA/JPL SSD, "Approximate Positions of the Planets"
 *    (Standish & Williams 1992), "Solution of Kepler's Equation" section.
 *  - Hyperbolic Kepler equation M = e·sinh H − H, solved with Newton's method.
 *  - Perifocal to heliocentric-ecliptic rotation: JPL "Approximate Positions of the
 *    Planets", step 5: r_ecl = Rz(−Ω)·Rx(−I)·Rz(−ω)·r'.
 *
 * All angles are radians; distances are kilometres unless stated otherwise.
 */
import { TWO_PI, normalizeAngle, wrapPi } from './Units'

/** Convergence tolerance for the eccentric/hyperbolic anomaly iterations (radians). */
const ANOMALY_TOLERANCE = 1e-13
const MAX_ITERATIONS = 80

/**
 * Solves the elliptic Kepler equation M = E − e·sin E.
 * The first guess E₀ = M + e·sin M is the one recommended by the JPL document;
 * it converges for every e < 1 and is exact for e = 0.
 */
export function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
  const mean = wrapPi(meanAnomaly)
  if (eccentricity < 1e-12) return mean

  let eccentricAnomaly = mean + eccentricity * Math.sin(mean)
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const delta = (mean - (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly))) /
      (1 - eccentricity * Math.cos(eccentricAnomaly))
    eccentricAnomaly += delta
    if (Math.abs(delta) < ANOMALY_TOLERANCE) break
  }
  return eccentricAnomaly
}

/**
 * Solves the hyperbolic Kepler equation M = e·sinh H − H.
 * The starting guess follows the standard "Danby" style estimate
 * H₀ = asinh(M / e), which converges rapidly for the eccentricities found in the
 * catalogued hyperbolic comets (1 ≤ e < 3).
 */
export function solveHyperbolicAnomaly(meanAnomaly: number, eccentricity: number): number {
  if (eccentricity <= 1) throw new RangeError(`hyperbolic anomaly requires e > 1, received e = ${eccentricity}`)
  let hyperbolicAnomaly = Math.asinh(meanAnomaly / eccentricity)
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const residual = eccentricity * Math.sinh(hyperbolicAnomaly) - hyperbolicAnomaly - meanAnomaly
    const derivative = eccentricity * Math.cosh(hyperbolicAnomaly) - 1
    if (Math.abs(derivative) < 1e-14) break
    const delta = residual / derivative
    hyperbolicAnomaly -= delta
    if (Math.abs(delta) < ANOMALY_TOLERANCE) break
  }
  return hyperbolicAnomaly
}

export interface OrbitalElementSet {
  /** Semi-major axis in km. Negative for hyperbolic orbits. */
  semiMajorAxisKm: number
  /** Eccentricity. */
  eccentricity: number
  /** Inclination, radians, measured from the reference plane. */
  inclinationRad: number
  /** Longitude of the ascending node, radians. */
  nodeRad: number
  /** Argument of periapsis, radians. */
  argumentOfPeriapsisRad: number
}

export interface PerifocalPosition {
  /** Position in the orbital (perifocal) plane, x towards periapsis. */
  x: number
  y: number
  /** Distance from the focus. */
  radius: number
  /** True anomaly. */
  trueAnomaly: number
  /** Eccentric (elliptic) or hyperbolic anomaly depending on eccentricity. */
  anomaly: number
}

/**
 * Position in the orbital plane for a given mean anomaly.
 * For e < 1 the elliptic relations are used, for e ≥ 1 the hyperbolic ones; both
 * branches return a positive radius because a is negative in the hyperbolic case.
 */
export function perifocalPositionFromMeanAnomaly(
  semiMajorAxisKm: number,
  eccentricity: number,
  meanAnomaly: number,
): PerifocalPosition {
  if (eccentricity < 1) {
    const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, eccentricity)
    const x = semiMajorAxisKm * (Math.cos(eccentricAnomaly) - eccentricity)
    const y = semiMajorAxisKm * Math.sqrt(Math.max(0, 1 - eccentricity * eccentricity)) * Math.sin(eccentricAnomaly)
    const radius = semiMajorAxisKm * (1 - eccentricity * Math.cos(eccentricAnomaly))
    const trueAnomaly = Math.atan2(Math.sqrt(Math.max(0, 1 - eccentricity * eccentricity)) * Math.sin(eccentricAnomaly), Math.cos(eccentricAnomaly) - eccentricity)
    return { x, y, radius, trueAnomaly, anomaly: eccentricAnomaly }
  }

  const hyperbolicAnomaly = solveHyperbolicAnomaly(meanAnomaly, eccentricity)
  const x = semiMajorAxisKm * (Math.cosh(hyperbolicAnomaly) - eccentricity)
  const y = semiMajorAxisKm * Math.sqrt(eccentricity * eccentricity - 1) * Math.sinh(hyperbolicAnomaly)
  const radius = semiMajorAxisKm * (1 - eccentricity * Math.cosh(hyperbolicAnomaly))
  const trueAnomaly = Math.atan2(Math.sqrt(eccentricity * eccentricity - 1) * Math.sinh(hyperbolicAnomaly), Math.cosh(hyperbolicAnomaly) - eccentricity)
  return { x, y, radius, trueAnomaly, anomaly: hyperbolicAnomaly }
}

export interface Vector3Like {
  x: number
  y: number
  z: number
}

/**
 * Rotates a vector from the perifocal frame into the reference (ecliptic J2000)
 * frame using r = Rz(−Ω)·Rx(−I)·Rz(−ω)·r'. JPL, "Approximate Positions of the
 * Planets", step 5 (the explicit component form is reproduced verbatim).
 */
export function perifocalToReferenceFrame(
  position: { x: number; y: number },
  elements: OrbitalElementSet,
): Vector3Like {
  const cosArgument = Math.cos(elements.argumentOfPeriapsisRad)
  const sinArgument = Math.sin(elements.argumentOfPeriapsisRad)
  const cosNode = Math.cos(elements.nodeRad)
  const sinNode = Math.sin(elements.nodeRad)
  const cosInclination = Math.cos(elements.inclinationRad)
  const sinInclination = Math.sin(elements.inclinationRad)

  const { x, y } = position
  return {
    x:
      (cosArgument * cosNode - sinArgument * sinNode * cosInclination) * x +
      (-sinArgument * cosNode - cosArgument * sinNode * cosInclination) * y,
    y:
      (cosArgument * sinNode + sinArgument * cosNode * cosInclination) * x +
      (-sinArgument * sinNode + cosArgument * cosNode * cosInclination) * y,
    z: sinArgument * sinInclination * x + cosArgument * sinInclination * y,
  }
}

/** Mean motion in radians per day for a two-body orbit. a may be negative. */
export function meanMotionRadPerDay(gmKm3S2: number, semiMajorAxisKm: number): number {
  return Math.sqrt(gmKm3S2 / Math.abs(semiMajorAxisKm) ** 3) * 86400
}

/** Orbital period in days; only defined for a bound (elliptic) orbit. */
export function orbitalPeriodDays(gmKm3S2: number, semiMajorAxisKm: number): number | null {
  if (semiMajorAxisKm <= 0) return null
  return TWO_PI / meanMotionRadPerDay(gmKm3S2, semiMajorAxisKm)
}

/** Semi-major axis (km) derived from a perihelion distance and eccentricity. */
export function semiMajorAxisFromPerihelion(perihelionKm: number, eccentricity: number): number {
  return perihelionKm / (1 - eccentricity)
}

/** Vis-viva orbital speed in km/s. */
export function orbitalSpeedKmS(gmKm3S2: number, radiusKm: number, semiMajorAxisKm: number): number {
  return Math.sqrt(gmKm3S2 * (2 / radiusKm - 1 / semiMajorAxisKm))
}

/**
 * Mean anomaly for a perihelion-passage formulation. Works for both elliptic and
 * hyperbolic orbits because the mean motion uses |a|³.
 */
export function meanAnomalyFromPerihelion(
  gmKm3S2: number,
  semiMajorAxisKm: number,
  secondsSincePerihelion: number,
): number {
  const motion = meanMotionRadPerDay(gmKm3S2, semiMajorAxisKm) / 86400 // rad/s
  return motion * secondsSincePerihelion
}

/** Normalizes the elliptic mean anomaly; hyperbolic mean anomaly is unbounded. */
export function normalizeMeanAnomaly(meanAnomaly: number, eccentricity: number): number {
  return eccentricity < 1 ? normalizeAngle(meanAnomaly) : meanAnomaly
}