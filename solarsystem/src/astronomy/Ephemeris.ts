/**
 * Mode A — high-accuracy ephemeris.
 *
 * Objects: the Sun, the eight planets, the Moon and Pluto. Positions come from
 * astronomy-engine (MIT), which evaluates the VSOP87 planetary theory, the
 * ELP2000-82B lunar theory and a Pluto series fitted to JPL DE ephemerides. The
 * reported agreement with DE-derived positions is at the arcminute level for the
 * inner planets and better than that for the outer ones — far inside the
 * tolerances required for an exhibition visualisation, and validated against the
 * same engine in scripts/verify-ephemeris.mjs.
 *
 * The engine is reached through the `EphemerisSource` interface so that a
 * pre-generated sampled ephemeris or a SPICE kernel service can be substituted
 * without touching the renderer (see docs/astronomical-model.md).
 */
import { AstroTime, Body, GeoMoon, HelioVector, Rotation_EQJ_ECL } from 'astronomy-engine'
import { AU_KM } from './Units'
import { addVec3, applyMat3, bodyEquatorialFrameFromPole, subtractVec3, type Mat3, type Vec3 } from './Coordinates'

/** Identifiers used by the catalog for the ephemeris-driven bodies. */
export type EphemerisBodyId =
  | 'Mercury'
  | 'Venus'
  | 'Earth'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto'
  | 'Moon'

export interface EphemerisSource {
  readonly id: string
  /** Heliocentric ecliptic J2000 position of the body centre, kilometres. */
  heliocentricEclipticKm(body: EphemerisBodyId, julianDate: number): Vec3
}

/**
 * Rotation_EQJ_ECL() returns { rot: 3x3 }, the rotation from the J2000 equatorial
 * frame into the J2000 mean ecliptic frame. astronomy-engine's RotateVector
 * applies the array as v'_i = sum_j rot[j][i] * v_j, i.e. the array is indexed
 * [column][row]; the same convention is used here.
 */
const ECL_ROTATION = (Rotation_EQJ_ECL() as unknown as { rot: number[][] }).rot

/** EQJ -> ecliptic J2000. */
export function rotateVectorEquatorialToEcliptic(vector: Vec3): Vec3 {
  return {
    x: ECL_ROTATION[0][0] * vector.x + ECL_ROTATION[1][0] * vector.y + ECL_ROTATION[2][0] * vector.z,
    y: ECL_ROTATION[0][1] * vector.x + ECL_ROTATION[1][1] * vector.y + ECL_ROTATION[2][1] * vector.z,
    z: ECL_ROTATION[0][2] * vector.x + ECL_ROTATION[1][2] * vector.y + ECL_ROTATION[2][2] * vector.z,
  }
}

function eclipticKmFromEquatorialVector(vector: { x: number; y: number; z: number }): Vec3 {
  const rotated = rotateVectorEquatorialToEcliptic(vector)
  return { x: rotated.x * AU_KM, y: rotated.y * AU_KM, z: rotated.z * AU_KM }
}

const BODY_MAP: Record<EphemerisBodyId, Body> = {
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Earth: Body.Earth,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
  Pluto: Body.Pluto,
  Moon: Body.Earth, // the Moon is handled through GeoMoon + the Earth's heliocentric position
}

/**
 * Live ephemeris backed by astronomy-engine. Results are memoised per (body, JD)
 * because the renderer asks for the same instant many times per frame (bodies,
 * orbit paths, camera targets, labels).
 */
export class AstronomyEngineEphemerisSource implements EphemerisSource {
  readonly id = 'astronomy-engine/VSOP87+ELP2000'

  private readonly cache = new Map<string, Vec3>()
  private readonly earthCache = new Map<number, Vec3>()
  private readonly moonGeocentricCache = new Map<number, Vec3>()
  private cacheHits = 0
  private cacheMisses = 0

  heliocentricEclipticKm(body: EphemerisBodyId, julianDate: number): Vec3 {
    const key = `${body}@${julianDate}`
    const cached = this.cache.get(key)
    if (cached) {
      this.cacheHits++
      return cached
    }
    this.cacheMisses++

    const time = new AstroTime(julianDate - 2451545.0)

    let result: Vec3
    if (body === 'Moon') {
      result = addVec3(this.earthHeliocentricKm(julianDate), this.moonGeocentricKm(julianDate))
    } else if (body === 'Earth') {
      result = this.earthHeliocentricKm(julianDate)
    } else {
      result = eclipticKmFromEquatorialVector(HelioVector(BODY_MAP[body], time))
    }

    if (this.cache.size > 4096) this.cache.clear()
    this.cache.set(key, result)
    return result
  }

  /** Earth centre relative to the Sun. astronomy-engine resolves the EMB split. */
  private earthHeliocentricKm(julianDate: number): Vec3 {
    const cached = this.earthCache.get(julianDate)
    if (cached) return cached
    const time = new AstroTime(julianDate - 2451545.0)
    const value = eclipticKmFromEquatorialVector(HelioVector(Body.Earth, time))
    this.earthCache.set(julianDate, value)
    if (this.earthCache.size > 2048) this.earthCache.clear()
    return value
  }

  /** Moon relative to the Earth's centre (geocentric), kilometres. */
  moonGeocentricKm(julianDate: number): Vec3 {
    const cached = this.moonGeocentricCache.get(julianDate)
    if (cached) return cached
    const time = new AstroTime(julianDate - 2451545.0)
    const value = eclipticKmFromEquatorialVector(GeoMoon(time))
    this.moonGeocentricCache.set(julianDate, value)
    if (this.moonGeocentricCache.size > 2048) this.moonGeocentricCache.clear()
    return value
  }

  /** Geocentric position of an arbitrary ephemeris body, used by the validation script. */
  geocentricEclipticKm(body: EphemerisBodyId, julianDate: number): Vec3 {
    return subtractVec3(
      this.heliocentricEclipticKm(body, julianDate),
      this.earthHeliocentricKm(julianDate),
    )
  }

  get statistics(): { hits: number; misses: number; size: number } {
    return { hits: this.cacheHits, misses: this.cacheMisses, size: this.cache.size }
  }

  clear(): void {
    this.cache.clear()
    this.earthCache.clear()
    this.moonGeocentricCache.clear()
  }
}

/**
 * Rotation matrix from ecliptic J2000 into a planet's equatorial (body) frame,
 * built from the IAU pole. Used for rings, latitudinal features and to express a
 * satellite's Laplace-plane elements.
 */
export function planetEquatorialFrame(poleRaDeg: number, poleDecDeg: number): Mat3 {
  const equatorial = bodyEquatorialFrameFromPole(poleRaDeg * (Math.PI / 180), poleDecDeg * (Math.PI / 180))
  // bodyEquatorialFrameFromPole works in the EQJ frame; convert its basis vectors
  // into the ecliptic frame by rotating each column.
  const columns: Vec3[] = [
    { x: equatorial[0], y: equatorial[1], z: equatorial[2] },
    { x: equatorial[3], y: equatorial[4], z: equatorial[5] },
    { x: equatorial[6], y: equatorial[7], z: equatorial[8] },
  ]
  const eclipticColumns = columns.map((column) => rotateVectorEquatorialToEcliptic(column))
  return [
    eclipticColumns[0].x, eclipticColumns[0].y, eclipticColumns[0].z,
    eclipticColumns[1].x, eclipticColumns[1].y, eclipticColumns[1].z,
    eclipticColumns[2].x, eclipticColumns[2].y, eclipticColumns[2].z,
  ]
}

/** Convenience wrapper: rotate a body-frame vector into the ecliptic frame. */
export function bodyFrameToEcliptic(frame: Mat3, vector: Vec3): Vec3 {
  return applyMat3(frame, vector)
}