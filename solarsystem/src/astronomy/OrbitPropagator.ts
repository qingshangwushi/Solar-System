/**
 * Mode B — Keplerian propagation for catalogued objects.
 *
 * Used for the ~11 000 minor bodies, the dwarf planets without a dedicated
 * ephemeris, and the 163 natural satellites that are not covered by Mode A.
 * Positions are computed from real osculating elements; nothing is animated or
 * randomised. Two-body motion is exact for the elements given at the epoch, which
 * is the standard treatment for catalog completeness (see docs/astronomical-model.md).
 *
 * Either an epoch + mean anomaly or a perihelion passage time may define the
 * phase, which makes the same code path valid for elliptic, parabolic and
 * hyperbolic orbits.
 */
import {
  meanMotionRadPerDay,
  normalizeMeanAnomaly,
  perifocalPositionFromMeanAnomaly,
  perifocalToReferenceFrame,
  semiMajorAxisFromPerihelion,
  type OrbitalElementSet,
} from './KeplerSolver'
import { DEG, TWO_PI } from './Units'
import { applyMat3, multiplyMat3, type Mat3, type Vec3 } from './Coordinates'
import { J2000_JD } from './Constants'

export type ReferencePlane = 'ecliptic' | 'laplace' | 'body-equator'

export interface KeplerOrbitDefinition {
  /** Semi-major axis, km. Negative for hyperbolic orbits. */
  semiMajorAxisKm: number
  eccentricity: number
  inclinationDeg: number
  longitudeAscendingNodeDeg: number
  argumentOfPeriapsisDeg: number
  /** Mean anomaly at `epochJD`, degrees. */
  meanAnomalyDeg?: number | null
  /** Epoch of the elements, Julian Date. */
  epochJD?: number | null
  /** Julian Date of perihelion passage; takes precedence over epoch + M when set. */
  perihelionJD?: number | null
  /** Plane the elements are referred to. */
  referencePlane?: ReferencePlane
  /** Extra radial offset applied after propagation (not used by the catalog). */
  radialOffsetKm?: number
}

export interface PropagationInputs {
  /** Gravitational parameter of the central body, km^3/s^2. */
  gmKm3S2?: number
  /**
   * Explicit mean motion, rad/day. Preferred whenever the catalogued sidereal
   * period is available: propagating with the published period reproduces the
   * documented motion exactly, whereas a GM-derived rate would differ from the
   * tabulated period by up to a few percent for perturbed orbits.
   */
  meanMotionRadPerDayOverride?: number
  /** Rotation from the reference plane into the ecliptic frame (Laplace planes). */
  referencePlaneToEcliptic?: Mat3
}

/** Mean motion actually used for a propagation call, rad/day. */
export function resolveMeanMotion(definition: KeplerOrbitDefinition, inputs: PropagationInputs): number {
  if (inputs.meanMotionRadPerDayOverride && inputs.meanMotionRadPerDayOverride !== 0) {
    return inputs.meanMotionRadPerDayOverride
  }
  if (!inputs.gmKm3S2) {
    throw new Error('propagation requires either a gravitational parameter or an explicit mean motion')
  }
  // The two-body rate from GM is the only option for unbound (hyperbolic) orbits,
  // which have no period; for elliptic orbits it agrees with the tabulated period.
  return meanMotionRadPerDay(inputs.gmKm3S2, effectiveSemiMajorAxisKm(definition))
}

export function elementsFromDefinition(definition: KeplerOrbitDefinition): OrbitalElementSet {
  return {
    semiMajorAxisKm: definition.semiMajorAxisKm,
    eccentricity: definition.eccentricity,
    inclinationRad: definition.inclinationDeg * DEG,
    nodeRad: definition.longitudeAscendingNodeDeg * DEG,
    argumentOfPeriapsisRad: definition.argumentOfPeriapsisDeg * DEG,
  }
}

/** Mean motion in radians per day implied by an orbital period. */
export function meanMotionFromPeriodDays(periodDays: number): number {
  return TWO_PI / periodDays
}

/** Semi-major axis implied by the definition (handles q-only hyperbolic records). */
export function effectiveSemiMajorAxisKm(definition: KeplerOrbitDefinition, perihelionKm?: number | null): number {
  if (definition.semiMajorAxisKm !== 0) return definition.semiMajorAxisKm
  if (perihelionKm === undefined || perihelionKm === null) {
    throw new Error('orbit definition needs either a semi-major axis or a perihelion distance')
  }
  return semiMajorAxisFromPerihelion(perihelionKm, definition.eccentricity)
}

/** Mean anomaly (radians) at the requested instant. */
export function meanAnomalyAt(definition: KeplerOrbitDefinition, inputs: PropagationInputs, julianDate: number): number {
  const motion = resolveMeanMotion(definition, inputs) // rad/day

  if (definition.perihelionJD !== undefined && definition.perihelionJD !== null) {
    return motion * (julianDate - definition.perihelionJD)
  }
  const epoch = definition.epochJD ?? J2000_JD
  const meanAnomaly0 = (definition.meanAnomalyDeg ?? 0) * DEG
  return meanAnomaly0 + motion * (julianDate - epoch)
}

/**
 * Relative position (km) of the orbiting body with respect to the central body,
 * expressed in the heliocentric ecliptic frame.
 */
export function propagateRelativeKm(
  definition: KeplerOrbitDefinition,
  inputs: PropagationInputs,
  julianDate: number,
): Vec3 {
  const semiMajorAxisKm = effectiveSemiMajorAxisKm(definition)
  const meanAnomaly = normalizeMeanAnomaly(meanAnomalyAt(definition, inputs, julianDate), definition.eccentricity)

  const plane = perifocalPositionFromMeanAnomaly(semiMajorAxisKm, definition.eccentricity, meanAnomaly)
  const relic = perifocalToReferenceFrame(plane, elementsFromDefinition(definition))

  const matrix = inputs.referencePlaneToEcliptic
  const rotated = matrix ? applyMat3(matrix, relic) : relic
  if (definition.radialOffsetKm) {
    const scale = 1 + definition.radialOffsetKm / Math.max(1e-9, plane.radius)
    return { x: rotated.x * scale, y: rotated.y * scale, z: rotated.z * scale }
  }
  return rotated
}

/** Distance from the central body at the requested instant, km. */
export function propagateRadiusKm(
  definition: KeplerOrbitDefinition,
  inputs: PropagationInputs,
  julianDate: number,
): number {
  const semiMajorAxisKm = effectiveSemiMajorAxisKm(definition)
  const meanAnomaly = normalizeMeanAnomaly(meanAnomalyAt(definition, inputs, julianDate), definition.eccentricity)
  return perifocalPositionFromMeanAnomaly(semiMajorAxisKm, definition.eccentricity, meanAnomaly).radius
}

/**
 * Samples the closed orbit of an elliptic body as a polyline in the ecliptic
 * frame. The sample count is chosen by the caller from the projected screen size
 * (LOD); the path is exact two-body geometry rather than a decorative circle.
 */
export function sampleOrbitPath(
  definition: KeplerOrbitDefinition,
  inputs: PropagationInputs,
  samples = 256,
): Float64Array {
  const semiMajorAxisKm = effectiveSemiMajorAxisKm(definition)
  if (semiMajorAxisKm <= 0 || definition.eccentricity >= 1) {
    return sampleOpenOrbitPath(definition, inputs, samples)
  }
  const output = new Float64Array(samples * 3)
  const elements = elementsFromDefinition(definition)
  for (let index = 0; index < samples; index++) {
    const meanAnomaly = (index / samples) * TWO_PI
    const plane = perifocalPositionFromMeanAnomaly(semiMajorAxisKm, definition.eccentricity, meanAnomaly)
    const relic = perifocalToReferenceFrame(plane, elements)
    const rotated = inputs.referencePlaneToEcliptic ? applyMat3(inputs.referencePlaneToEcliptic, relic) : relic
    output[index * 3] = rotated.x
    output[index * 3 + 1] = rotated.y
    output[index * 3 + 2] = rotated.z
  }
  return output
}

/**
 * Samples an unbound (hyperbolic) trajectory around perihelion. The true anomaly
 * is marched up to the asymptote, which is the largest angle for which the orbit
 * still has a finite radius.
 */
function sampleOpenOrbitPath(
  definition: KeplerOrbitDefinition,
  inputs: PropagationInputs,
  samples: number,
): Float64Array {
  const semiMajorAxisKm = effectiveSemiMajorAxisKm(definition)
  const eccentricity = definition.eccentricity
  const asymptote = Math.acos(-1 / eccentricity) * 0.985
  const output = new Float64Array(samples * 2 * 3)
  const elements = elementsFromDefinition(definition)
  const periapsis = semiMajorAxisKm * (1 - eccentricity)
  for (let index = 0; index < samples * 2; index++) {
    const sign = index < samples ? -1 : 1
    const fraction = (index % samples) / (samples - 1)
    const trueAnomaly = sign * fraction * asymptote
    const radius = periapsis * (1 + eccentricity) / (1 + eccentricity * Math.cos(trueAnomaly))
    const plane = { x: radius * Math.cos(trueAnomaly), y: radius * Math.sin(trueAnomaly) }
    const relic = perifocalToReferenceFrame(plane, elements)
    const rotated = inputs.referencePlaneToEcliptic ? applyMat3(inputs.referencePlaneToEcliptic, relic) : relic
    output[index * 3] = rotated.x
    output[index * 3 + 1] = rotated.y
    output[index * 3 + 2] = rotated.z
  }
  return output
}

/** Linearly interpolated position from a sampled path (used for GPU-side work). */
export function sampleOrbitPathPoint(path: Float64Array, fraction: number): Vec3 {
  const segments = path.length / 3 - 1
  const position = Math.min(segments - 1e-9, Math.max(0, fraction * segments))
  const index = Math.floor(position)
  const t = position - index
  const a = index * 3
  const b = (index + 1) * 3
  return {
    x: path[a] * (1 - t) + path[b] * t,
    y: path[a + 1] * (1 - t) + path[b + 1] * t,
    z: path[a + 2] * (1 - t) + path[b + 2] * t,
  }
}

export { multiplyMat3 }