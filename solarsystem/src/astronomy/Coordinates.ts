/**
 * Coordinate systems and the single conversion funnel between them.
 *
 * Astronomical frames
 *  - Heliocentric ecliptic J2000 (HEJ2000): +X towards the J2000 vernal equinox,
 *    +Z towards the north ecliptic pole, +Y completing a right-handed triad.
 *  - Equatorial J2000 (EQJ): the frame used by astronomy-engine's vectors.
 *
 * Scene frame (Three.js)
 *  - Right-handed, +Y up. The mapping from HEJ2000 is
 *        scene.x =  ecl.x
 *        scene.y =  ecl.z
 *        scene.z = -ecl.y
 *    which is a pure rotation (determinant +1): the ecliptic plane becomes the
 *    scene's XZ plane and the north ecliptic pole becomes +Y.
 *
 * All positions inside the engine are kept in kilometres (float64) in these
 * frames; the renderer converts to float32 scene units relative to the camera
 * origin (floating origin, see docs/coordinate-system.md).
 */
import { DEG, TWO_PI } from './Units'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function scaleVec3(a: Vec3, factor: number): Vec3 {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor }
}

export function lengthVec3(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
}

export function distanceBetween(a: Vec3, b: Vec3): number {
  return lengthVec3(subtractVec3(a, b))
}

export function normalizeVec3(a: Vec3): Vec3 {
  const length = lengthVec3(a)
  return length === 0 ? ORIGIN : scaleVec3(a, 1 / length)
}

export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

/** Column-major 3x3 matrix, matching the memory layout used by gl-matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

export const IDENTITY_MAT3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9)
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) {
      out[column * 3 + row] =
        a[row] * b[column * 3] + a[3 + row] * b[column * 3 + 1] + a[6 + row] * b[column * 3 + 2]
    }
  }
  return out as unknown as Mat3
}

export function applyMat3(matrix: Mat3, vector: Vec3): Vec3 {
  return {
    x: matrix[0] * vector.x + matrix[3] * vector.y + matrix[6] * vector.z,
    y: matrix[1] * vector.x + matrix[4] * vector.y + matrix[7] * vector.z,
    z: matrix[2] * vector.x + matrix[5] * vector.y + matrix[8] * vector.z,
  }
}

export function transposeMat3(matrix: Mat3): Mat3 {
  return [
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ]
}

/** Rotation about the x-axis by `angle` radians. */
export function rotationX(angle: number): Mat3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [1, 0, 0, 0, c, s, 0, -s, c]
}

export function rotationY(angle: number): Mat3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c, 0, -s, 0, 1, 0, s, 0, c]
}

export function rotationZ(angle: number): Mat3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c, s, 0, -s, c, 0, 0, 0, 1]
}

/** Obliquity of the ecliptic rotation: equatorial J2000 -> ecliptic J2000. */
export function equatorialToEclipticRotation(obliquityRad: number): Mat3 {
  return rotationX(obliquityRad)
}

/** Ecliptic J2000 -> scene frame (see the module header for the derivation). */
export const ECLIPTIC_TO_SCENE: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0]

/** Scene frame -> ecliptic J2000. */
export const SCENE_TO_ECLIPTIC: Mat3 = transposeMat3(ECLIPTIC_TO_SCENE)

export function eclipticToScene(vector: Vec3): Vec3 {
  return applyMat3(ECLIPTIC_TO_SCENE, vector)
}

export function sceneToEcliptic(vector: Vec3): Vec3 {
  return applyMat3(SCENE_TO_ECLIPTIC, vector)
}

/**
 * Rotation from the J2000 equatorial frame to the body's equatorial frame,
 * given the body's north pole (IAU definition: right ascension and declination of
 * the pole, IAU WGCCRE reports).
 *
 * The body frame has +Z along the rotation axis and +X in the body's equatorial
 * plane along the intersection with the J2000 equator (the ascending node of the
 * body equator on the J2000 equator).
 */
export function bodyEquatorialFrameFromPole(poleRaRad: number, poleDecRad: number): Mat3 {
  const cosDec = Math.cos(poleDecRad)
  const sinDec = Math.sin(poleDecRad)
  const cosRa = Math.cos(poleRaRad)
  const sinRa = Math.sin(poleRaRad)

  // z-axis: the pole itself, expressed in the J2000 equatorial frame.
  const zAxis: Vec3 = { x: cosDec * cosRa, y: cosDec * sinRa, z: sinDec }

  // The body-frame x-axis lies along the ascending node of the body's equator on
  // the J2000 equator, i.e. along Z_eq x z.
  let xAxis = crossVec3({ x: 0, y: 0, z: 1 }, zAxis)
  if (lengthVec3(xAxis) < 1e-9) {
    // The pole coincides with the J2000 pole (the Earth): the body equator is the
    // J2000 equator, so the vernal equinox is the natural x-axis.
    xAxis = { x: 1, y: 0, z: 0 }
  } else {
    xAxis = normalizeVec3(xAxis)
  }
  const yAxis = crossVec3(zAxis, xAxis)

  // Column-major layout: the columns are the body-frame basis vectors in EQJ.
  return [
    xAxis.x, xAxis.y, xAxis.z,
    yAxis.x, yAxis.y, yAxis.z,
    zAxis.x, zAxis.y, zAxis.z,
  ]
}

/** Longitude of the ascending node convention: atan2(y, x) folded into [0, 2π). */
export function ascendingNodeLongitude(nodeRad: number): number {
  const value = nodeRad % TWO_PI
  return value < 0 ? value + TWO_PI : value
}

/** Rotates a vector into a reference plane defined by a pole direction. */
export function planeRotationFromPole(poleRaDeg: number, poleDecDeg: number): Mat3 {
  return bodyEquatorialFrameFromPole(poleRaDeg * DEG, poleDecDeg * DEG)
}

/** Angular separation between two directions, radians. */
export function angularSeparation(a: Vec3, b: Vec3): number {
  const na = normalizeVec3(a)
  const nb = normalizeVec3(b)
  const cosine = Math.min(1, Math.max(-1, dotVec3(na, nb)))
  return Math.acos(cosine)
}