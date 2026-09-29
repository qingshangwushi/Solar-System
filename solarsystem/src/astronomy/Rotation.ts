/**
 * Rotation layer.
 *
 * Each body rotates about its IAU north pole with the sidereal rotation period
 * published in the NASA/NSSDC fact sheets. The pole is a real IAU/NAIF constant;
 * the angle at J2000 is a documented convention ("phase 0 at J2000"), because a
 * prime-meridian constant requires the full IAU W0 polynomial which is not
 * bundled offline. The rate and axis are therefore scientific, the epoch phase is
 * conventional and always disclosed in the information panel.
 */
import { hoursToSeconds, TWO_PI } from './Units'
import { applyMat3, multiplyMat3, rotationZ, type Mat3, type Vec3 } from './Coordinates'
import { planetEquatorialFrame } from './Ephemeris'

export interface RotationParameters {
  /** Sidereal rotation period, hours (negative for retrograde rotation). */
  periodHours: number | null
  /** IAU north-pole orientation. */
  poleRaDeg: number
  poleDecDeg: number
  /** Rotation angle at J2000 (convention: zero). */
  phaseAtJ2000Rad?: number
}

/**
 * Quaternion-free body orientation: returns the rotation that takes a vector
 * expressed in the body's equatorial frame into the ecliptic frame, evaluated at
 * `secondsSinceJ2000`. The texture's prime meridian rides with phase(0) = 0.
 */
export function bodyOrientationEclipticToBody(
  parameters: RotationParameters,
  secondsSinceJ2000: number,
): Mat3 {
  const poleFrameEcliptic = planetEquatorialFrame(parameters.poleRaDeg, parameters.poleDecDeg)
  // poleFrameEcliptic maps body-frame -> ecliptic; invert by transposing.
  const eclipticToBody = transpose3(poleFrameEcliptic)
  const phase = rotationPhaseRad(parameters, secondsSinceJ2000)
  // body frame: rotate about the body z-axis (the pole) by the phase.
  const spin = rotationZ(phase)
  // composition: ecliptic -> body-frame reference orientation, then spin about pole.
  return multiplyMat3(spin, eclipticToBody)
}

/** Body-frame -> ecliptic at a given instant (rotation applied to the scene group). */
export function bodyOrientationBodyToEcliptic(
  parameters: RotationParameters,
  secondsSinceJ2000: number,
): Mat3 {
  return transpose3(bodyOrientationEclipticToBody(parameters, secondsSinceJ2000))
}

/** Body-frame -> ecliptic at a given instant. */
export function bodyFrameToEclipticAt(
  parameters: RotationParameters,
  secondsSinceJ2000: number,
  vector: Vec3,
): Vec3 {
  const matrix = bodyOrientationBodyToEcliptic(parameters, secondsSinceJ2000)
  return applyMat3(matrix, vector)
}

export function rotationPhaseRad(parameters: RotationParameters, secondsSinceJ2000: number): number {
  const periodHours = parameters.periodHours ?? 0
  if (periodHours === 0) return 0
  const spin = (TWO_PI / hoursToSeconds(Math.abs(periodHours))) * secondsSinceJ2000
  const direction = periodHours < 0 ? -1 : 1
  return (parameters.phaseAtJ2000Rad ?? 0) + direction * spin
}

/** Generic column-major transpose. */
export function transpose3(matrix: Mat3): Mat3 {
  return [
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ]
}

export interface SunRotationConstants {
  periodHours: number
  poleRaDeg: number
  poleDecDeg: number
}

export const SUN_ROTATION: SunRotationConstants = {
  periodHours: 609.12, // Carrington sidereal rotation, mean high-latitude rate
  poleRaDeg: 286.13,
  poleDecDeg: 63.87,
}