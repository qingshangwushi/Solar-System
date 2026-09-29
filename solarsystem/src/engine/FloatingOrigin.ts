/**
 * Floating origin / camera-relative rendering.
 *
 * The scene spans distances far beyond the ~7 significant digits of a float32, so
 * no vertex is ever stored in absolute coordinates. Every rendered position is
 *
 *     renderPosition = warp(bodyPosition) - warp(cameraPosition)
 *
 * evaluated in float64 and only then cast to float32. Objects that live far from
 * the camera keep their absolute precision on the CPU; objects near the camera get
 * the full float32 resolution, and the GPU never sees a large coordinate.
 *
 * `warp` is the active ScaleTransform, so the same rule covers the linear modes
 * (scientific/visible) and the non-linear exhibition mapping.
 */
import type { Vec3 } from '../astronomy/Coordinates'
import { ORIGIN } from '../astronomy/Coordinates'
import type { ScaleTransform } from '../data/ScaleModel'

export interface MutableVec3 {
  x: number
  y: number
  z: number
}

export class RenderOrigin {
  /** Astronomical position of the rendering origin (the camera), kilometres. */
  originKm: Vec3 = ORIGIN
  /** The same position expressed in render units, cached per update. */
  originUnits: Vec3 = ORIGIN

  update(originKm: Vec3, scale: ScaleTransform): void {
    this.originKm = originKm
    this.originUnits = scale.positionKmToUnits(originKm)
  }

  /**
   * Sets the origin directly from a scene-space position. The engine keeps the
   * camera in the (already warped) render space, so this is the hot path.
   */
  updateUnits(units: MutableVec3): void {
    this.originUnits = { x: units.x, y: units.y, z: units.z }
  }

  /** Warped (render-unit) coordinates of an absolute position. */
  warp(positionKm: Vec3, scale: ScaleTransform): Vec3 {
    return scale.positionKmToUnits(positionKm)
  }

  /** Camera-relative render coordinates of an absolute position. */
  relative(positionKm: Vec3, scale: ScaleTransform, target: MutableVec3): void {
    const warped = scale.positionKmToUnits(positionKm)
    target.x = warped.x - this.originUnits.x
    target.y = warped.y - this.originUnits.y
    target.z = warped.z - this.originUnits.z
  }

  /** Camera-relative coordinates of an already-warped position. */
  relativeFromWarped(warped: Vec3, target: MutableVec3): void {
    target.x = warped.x - this.originUnits.x
    target.y = warped.y - this.originUnits.y
    target.z = warped.z - this.originUnits.z
  }

  /** Offsets of a child relative to its parent, both in render units. */
  static parentRelative(childWarped: Vec3, parentWarped: Vec3, target: MutableVec3): void {
    target.x = childWarped.x - parentWarped.x
    target.y = childWarped.y - parentWarped.y
    target.z = childWarped.z - parentWarped.z
  }
}

/** Writes a float64 vector into a float32 attribute array at a given vertex. */
export function writeFloat32(array: Float32Array, vertexIndex: number, value: MutableVec3): void {
  const offset = vertexIndex * 3
  array[offset] = value.x
  array[offset + 1] = value.y
  array[offset + 2] = value.z
}