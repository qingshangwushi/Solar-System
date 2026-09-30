/**
 * Minor-body element layout and propagation.
 *
 * The generated `minor-bodies.bin` payload is a flat Float32Array with a fixed
 * stride; the same layout is used by the orbit worker (bulk propagation for the
 * whole visible cloud) and by the engine (a single object, propagated on demand
 * when the cloud itself is hidden). Keeping one implementation here is what makes
 * the on-demand value identical to the value the worker would have produced — the
 * information panel must never show a different number depending on whether a
 * layer happened to be switched on (P0-4 of docs/e2e-verification-report.md).
 *
 * Layout, 8 float32 values per object:
 *   0 qAu                 perihelion distance, au
 *   1 eccentricity        dimensionless
 *   2 inclination         radians, ecliptic
 *   3 node                radians, longitude of the ascending node
 *   4 argumentOfPeriapsis radians
 *   5 perihelionMjd       Modified Julian Date of perihelion passage
 *   6 reserved (absolute magnitude context)
 *   7 reserved
 */
import { AU_KM, SECONDS_PER_DAY } from './Units'
import {
  perifocalPositionFromMeanAnomaly,
  perifocalToReferenceFrame,
  type OrbitalElementSet,
  type Vector3Like,
} from './KeplerSolver'
import { GM_SUN_KM3_S2 } from './Constants'

export const MINOR_BODY_STRIDE = 8
export const MJD_TO_JD = 2_400_000.5

export interface MinorBodyElements extends OrbitalElementSet {
  /** Perihelion passage as a Julian Date. */
  perihelionJD: number
}

/** Decodes one record of the element buffer. */
export function readMinorBodyElements(
  elements: ArrayLike<number>,
  recordIndex: number,
): MinorBodyElements | null {
  const offset = recordIndex * MINOR_BODY_STRIDE
  if (offset < 0 || offset + MINOR_BODY_STRIDE > elements.length) return null
  const qAu = elements[offset]
  const eccentricity = elements[offset + 1]
  if (!(qAu > 0)) return null
  return {
    // a = q / (1 - e); negative for hyperbolic orbits, so one code path covers both.
    semiMajorAxisKm: (qAu * AU_KM) / (1 - eccentricity),
    eccentricity,
    inclinationRad: elements[offset + 2],
    nodeRad: elements[offset + 3],
    argumentOfPeriapsisRad: elements[offset + 4],
    perihelionJD: elements[offset + 5] + MJD_TO_JD,
  }
}

/** Heliocentric ecliptic J2000 position of one minor body, kilometres. */
export function propagateMinorBodyKm(
  elements: ArrayLike<number>,
  recordIndex: number,
  julianDate: number,
  gmKm3S2: number = GM_SUN_KM3_S2,
): Vector3Like | null {
  const decoded = readMinorBodyElements(elements, recordIndex)
  if (!decoded) return null
  const meanMotionPerSecond = Math.sqrt(gmKm3S2 / Math.abs(decoded.semiMajorAxisKm) ** 3)
  const secondsSincePerihelion = (julianDate - decoded.perihelionJD) * SECONDS_PER_DAY
  const meanAnomaly = meanMotionPerSecond * secondsSincePerihelion
  const plane = perifocalPositionFromMeanAnomaly(decoded.semiMajorAxisKm, decoded.eccentricity, meanAnomaly)
  return perifocalToReferenceFrame(plane, decoded)
}

/**
 * Samples one object's trajectory: a closed ellipse, or both hyperbola branches.
 * Used by the orbit overlay when a minor body is selected.
 */
export function sampleMinorBodyOrbitKm(
  elements: ArrayLike<number>,
  recordIndex: number,
  samples: number,
): Float64Array | null {
  const decoded = readMinorBodyElements(elements, recordIndex)
  if (!decoded) return null
  const count = Math.max(32, samples)
  const points = new Float64Array(decoded.eccentricity < 1 ? count * 3 : count * 2 * 3)
  if (decoded.eccentricity < 1) {
    for (let index = 0; index < count; index++) {
      const meanAnomaly = (index / count) * Math.PI * 2
      const plane = perifocalPositionFromMeanAnomaly(decoded.semiMajorAxisKm, decoded.eccentricity, meanAnomaly)
      const position = perifocalToReferenceFrame(plane, decoded)
      points[index * 3] = position.x
      points[index * 3 + 1] = position.y
      points[index * 3 + 2] = position.z
    }
    return points
  }
  const asymptote = Math.acos(-1 / decoded.eccentricity) * 0.96
  const periapsis = decoded.semiMajorAxisKm * (1 - decoded.eccentricity)
  for (let index = 0; index < count * 2; index++) {
    const sign = index < count ? -1 : 1
    const fraction = (index % count) / (count - 1)
    const trueAnomaly = sign * fraction * asymptote
    const radius = (periapsis * (1 + decoded.eccentricity)) / (1 + decoded.eccentricity * Math.cos(trueAnomaly))
    const position = perifocalToReferenceFrame(
      { x: radius * Math.cos(trueAnomaly), y: radius * Math.sin(trueAnomaly) },
      decoded,
    )
    points[index * 3] = position.x
    points[index * 3 + 1] = position.y
    points[index * 3 + 2] = position.z
  }
  return points
}
