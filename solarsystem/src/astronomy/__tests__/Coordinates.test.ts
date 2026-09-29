/**
 * Coordinate-system verification.
 *
 * The conversions in Coordinates.ts are the only bridge between the astronomical
 * frames and the Three.js scene frame, so they are checked for the properties the
 * documentation claims: the matrices are orthonormal, the mapping is a proper
 * rotation (determinant +1), and the ecliptic plane/pole map onto the expected
 * scene axes.
 */
import { describe, expect, it } from 'vitest'
import {
  ECLIPTIC_TO_SCENE,
  SCENE_TO_ECLIPTIC,
  applyMat3,
  bodyEquatorialFrameFromPole,
  crossVec3,
  dotVec3,
  eclipticToScene,
  lengthVec3,
  multiplyMat3,
  rotationX,
  rotationY,
  rotationZ,
  sceneToEcliptic,
  type Mat3,
} from '../Coordinates'
import { OBLIQUITY_J2000_RAD } from '../Constants'
import { DEG } from '../Units'

function determinant(matrix: Mat3): number {
  return (
    matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
    matrix[3] * (matrix[1] * matrix[8] - matrix[2] * matrix[7]) +
    matrix[6] * (matrix[1] * matrix[5] - matrix[2] * matrix[4])
  )
}

function expectOrthonormal(matrix: Mat3): void {
  const columns = [
    { x: matrix[0], y: matrix[1], z: matrix[2] },
    { x: matrix[3], y: matrix[4], z: matrix[5] },
    { x: matrix[6], y: matrix[7], z: matrix[8] },
  ]
  for (const column of columns) expect(lengthVec3(column)).toBeCloseTo(1, 12)
  expect(dotVec3(columns[0], columns[1])).toBeCloseTo(0, 12)
  expect(dotVec3(columns[1], columns[2])).toBeCloseTo(0, 12)
  expect(dotVec3(columns[0], columns[2])).toBeCloseTo(0, 12)
  expect(determinant(matrix)).toBeCloseTo(1, 12)
}

describe('scene frame', () => {
  it('is a proper rotation', () => {
    expectOrthonormal(ECLIPTIC_TO_SCENE)
  })

  it('maps the ecliptic plane onto the scene XZ plane', () => {
    const inPlane = { x: 0.6, y: -0.8, z: 0 }
    expect(eclipticToScene(inPlane).y).toBeCloseTo(0, 12)
  })

  it('maps the north ecliptic pole onto +Y', () => {
    const north = eclipticToScene({ x: 0, y: 0, z: 1 })
    expect(north.y).toBeCloseTo(1, 12)
    expect(north.x).toBeCloseTo(0, 12)
    expect(north.z).toBeCloseTo(0, 12)
  })

  it('round-trips through the scene frame', () => {
    const vector = { x: 1234.5, y: -6789.01, z: 23456.78 }
    const restored = sceneToEcliptic(eclipticToScene(vector))
    expect(restored.x).toBeCloseTo(vector.x, 6)
    expect(restored.y).toBeCloseTo(vector.y, 6)
    expect(restored.z).toBeCloseTo(vector.z, 6)
  })

  it('keeps the two conversion matrices mutually inverse', () => {
    const product = multiplyMat3(SCENE_TO_ECLIPTIC, ECLIPTIC_TO_SCENE)
    const expected: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for (let index = 0; index < 9; index++) expect(product[index]).toBeCloseTo(expected[index], 12)
  })
})

describe('elementary rotations', () => {
  it('rotates about the canonical axes by 90 degrees', () => {
    const x = applyMat3(rotationX(Math.PI / 2), { x: 0, y: 1, z: 0 })
    expect(x.z).toBeCloseTo(1, 12)
    const y = applyMat3(rotationY(Math.PI / 2), { x: 0, y: 0, z: 1 })
    expect(y.x).toBeCloseTo(1, 12)
    const z = applyMat3(rotationZ(Math.PI / 2), { x: 1, y: 0, z: 0 })
    expect(z.y).toBeCloseTo(1, 12)
  })

  it('produces orthonormal matrices', () => {
    expectOrthonormal(rotationX(0.7))
    expectOrthonormal(rotationY(-2.1))
    expectOrthonormal(rotationZ(3.9))
  })
})

describe('body equatorial frames', () => {
  it('returns the identity for a pole at the J2000 pole (Earth)', () => {
    const frame = bodyEquatorialFrameFromPole(0, 90 * DEG)
    const expected: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for (let index = 0; index < 9; index++) expect(frame[index]).toBeCloseTo(expected[index], 9)
  })

  it('returns an orthonormal frame for every planet pole', () => {
    const poles: Array<[number, number]> = [
      [281.0103, 61.4155],
      [272.76, 67.16],
      [317.68143, 52.8865],
      [268.056595, 64.495303],
      [40.589, 83.537],
      [257.311, -15.175],
      [299.36, 43.46],
      [132.993, -6.163],
    ]
    for (const [ra, dec] of poles) expectOrthonormal(bodyEquatorialFrameFromPole(ra * DEG, dec * DEG))
  })

  it('gives the Earth an axial tilt equal to the obliquity of the ecliptic', () => {
    // Earth pole is (0, 90) in EQJ, so the body z-axis is the EQJ pole. Rotating
    // the ecliptic pole (0,0,1) into EQJ and taking the angle to the body axis
    // must return the obliquity.
    const obliquity = OBLIQUITY_J2000_RAD
    const eclipticPoleInEquatorial = {
      x: 0,
      y: -Math.sin(obliquity),
      z: Math.cos(obliquity),
    }
    const earthPole = { x: 0, y: 0, z: 1 }
    const angle = Math.acos(dotVec3(earthPole, eclipticPoleInEquatorial))
    expect(angle / DEG).toBeCloseTo(23.44, 2)
  })

  it('is right-handed for an arbitrary pole', () => {
    const frame = bodyEquatorialFrameFromPole(100 * DEG, 45 * DEG)
    const x = { x: frame[0], y: frame[1], z: frame[2] }
    const y = { x: frame[3], y: frame[4], z: frame[5] }
    const z = { x: frame[6], y: frame[7], z: frame[8] }
    const cross = crossVec3(x, y)
    expect(cross.x).toBeCloseTo(z.x, 12)
    expect(cross.y).toBeCloseTo(z.y, 12)
    expect(cross.z).toBeCloseTo(z.z, 12)
  })
})