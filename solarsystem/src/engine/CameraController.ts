/**
 * Camera controller.
 *
 * Five modes, as required by the specification:
 *   orbit    — revolve around the tracked body (NASA Eyes / Google Earth idiom)
 *   follow   — track a moving body while keeping a stable viewing geometry
 *   surface  — close approach, framed on the body
 *   free     — WASD/QE + mouse look free flight
 *   overview — automatic framing of the major orbits
 *
 * IMPORTANT — floating origin
 * The controller keeps its own `absolutePosition` in the *warped* (render-unit)
 * space, which can be as large as 1e6 units. The three.js camera is always left at
 * the origin: only its orientation is derived from `absolutePosition`. Every object
 * in the scene is then placed at `warp(position) - absolutePosition`, so the GPU
 * only ever sees small coordinates (see FloatingOrigin and docs/coordinate-system.md).
 *
 * The translation rate is never constant: it is proportional to the distance to the
 * current target, clamped to a range derived from the scale mode. In the linear
 * modes that range is exactly the 10 km/s … 1,000,000 km/s span the specification
 * asks for, because 1 scene unit = 1000 km.
 *
 * Fly-to is a cinematic transition, not a teleport: a pull-back, an eased
 * interplanetary arc and a settle into orbit, all evaluated against the *moving*
 * target so the motion stays smooth while the solar system keeps running.
 */
import { Euler, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { BodyState } from './PositionResolver'

const WORLD_UP = new Vector3(0, 1, 0)
const ORIGIN = new Vector3(0, 0, 0)

export type CameraMode = 'orbit' | 'follow' | 'surface' | 'free' | 'overview'

export interface CameraControllerOptions {
  minSpeedUnitsPerSecond: number
  maxSpeedUnitsPerSecond: number
  rotateSpeed: number
  zoomSpeed: number
}

export const DEFAULT_CAMERA_OPTIONS: CameraControllerOptions = {
  minSpeedUnitsPerSecond: 0.01, // 10 km/s in the linear modes
  maxSpeedUnitsPerSecond: 1000, // 1,000,000 km/s
  rotateSpeed: 0.32,
  zoomSpeed: 0.0016,
}

/**
 * Minimal shape a fly-to needs: an identifier, a position in render units and a
 * radius. Resolved catalog bodies and worker-driven minor bodies both satisfy it.
 */
export interface FlyToTarget {
  id: string
  absoluteUnits: { x: number; y: number; z: number }
  radiusUnits: number
}

interface FlyToState {
  targetId: string
  startPosition: Vector3
  startLookAt: Vector3
  offsetDirection: Vector3
  desiredDistance: number
  duration: number
  elapsed: number
  arcHeight: number
}

export class CameraController {
  private readonly camera: PerspectiveCamera
  private options: CameraControllerOptions

  mode: CameraMode = 'orbit'
  trackedId: string | null = null

  /** Position of the virtual camera in the warped render space (float64 precision). */
  readonly absolutePosition = new Vector3()
  private readonly lookAt = new Vector3()

  private azimuth = 0.9
  private elevation = 0.34
  private distance = 2600

  private readonly freePosition = new Vector3()
  private freeYaw = 0
  private freePitch = 0
  private readonly velocity = new Vector3()
  private freeSpeedBoost = 1

  private readonly targetPosition = new Vector3()
  private readonly panOffset = new Vector3()
  private readonly scratch = new Vector3()
  private readonly scratchB = new Vector3()
  private readonly lookMatrix = new Matrix4()

  private flyToState: FlyToState | null = null
  private reducedMotion = false
  private trackedRadius = 0
  private overviewDistance = 8000
  private flyToCompleted: ((id: string) => void) | null = null

  private readonly keys = new Set<string>()

  constructor(camera: PerspectiveCamera, options: Partial<CameraControllerOptions> = {}) {
    this.camera = camera
    this.options = { ...DEFAULT_CAMERA_OPTIONS, ...options }
    this.absolutePosition.set(0, 1200, 2600)
    this.lookAt.copy(ORIGIN)
    this.applyOrientation()
  }

  setOptions(options: Partial<CameraControllerOptions>): void {
    this.options = { ...this.options, ...options }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
  }

  get isFlying(): boolean {
    return this.flyToState !== null
  }

  /** Progress of an active fly-to, for diagnostics. */
  get flyToProgress(): { targetId: string; elapsed: number; duration: number; desiredDistance: number } | null {
    if (!this.flyToState) return null
    return {
      targetId: this.flyToState.targetId,
      elapsed: this.flyToState.elapsed,
      duration: this.flyToState.duration,
      desiredDistance: this.flyToState.desiredDistance,
    }
  }

  /** Raw orbit distance, in render units (diagnostics). */
  get orbitDistance(): number {
    return this.distance
  }

  get currentDistance(): number {
    return this.absolutePosition.distanceTo(this.targetPosition)
  }

  /** World-space (render-space) position of the current look-at point. */
  get focusPoint(): Vector3 {
    return this.lookAt
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return
    if (mode === 'free') {
      this.freePosition.copy(this.absolutePosition)
      this.scratch.copy(this.lookAt).sub(this.absolutePosition).normalize()
      this.freeYaw = Math.atan2(-this.scratch.x, -this.scratch.z)
      this.freePitch = Math.asin(MathUtils.clamp(this.scratch.y, -1, 1))
      this.velocity.set(0, 0, 0)
    }
    if (mode === 'orbit' || mode === 'follow' || mode === 'surface') {
      // Preserve the current viewing direction when switching between orbit modes.
      const offset = this.scratch.subVectors(this.absolutePosition, this.targetPosition)
      const radius = Math.max(1e-4, offset.length())
      this.azimuth = Math.atan2(offset.x, offset.z)
      this.elevation = Math.asin(MathUtils.clamp(offset.y / radius, -1, 1))
      this.distance = mode === 'surface' ? this.distance * 0.35 : this.distance
    }
    this.mode = mode
  }

  setTrackedRadius(radiusUnits: number): void {
    this.trackedRadius = radiusUnits
  }

  setTrackedBody(state: BodyState | null, frameRadiusUnits?: number): void {
    if (!state) return
    const changed = this.trackedId !== state.id
    this.trackedId = state.id
    if (changed) {
      const radius = frameRadiusUnits ?? state.radiusUnits
      this.distance = Math.max(this.minimumDistance(radius), this.defaultDistance(radius))
    }
  }

  setOverviewDistance(distance: number): void {
    this.overviewDistance = Math.max(1, distance)
  }

  /**
   * Places the camera immediately at a spherical offset from the current target.
   * Used by the overview framing and by the initial view, where a damped transition
   * would leave the first frames mis-framed (a slow drift out of the Sun).
   */
  placeAt(distance: number, azimuth: number, elevation: number): void {
    this.distance = this.overviewDistance = Math.max(1, distance)
    this.azimuth = azimuth
    this.elevation = elevation
    const cosElevation = Math.cos(elevation)
    this.absolutePosition
      .copy(this.targetPosition)
      .add(
        this.scratch
          .set(cosElevation * Math.sin(azimuth), Math.sin(elevation), cosElevation * Math.cos(azimuth))
          .multiplyScalar(this.distance),
      )
    this.lookAt.copy(this.targetPosition)
    this.panOffset.set(0, 0, 0)
    this.applyOrientation()
  }

  /** Current camera distance expressed in multiples of the tracked body's radius. */
  get framingRatio(): number {
    return this.distance / Math.max(1e-9, this.trackedRadius)
  }

  /**
   * Re-places the camera on the same azimuth/elevation at the same number of body
   * radii. Used when the scale mode changes: the physical viewing geometry is
   * preserved so a visitor can compare the scientific and the exhibit scale.
   */
  placeRelativeToTarget(targetUnits: { x: number; y: number; z: number }, framingRatio: number): void {
    this.distance = Math.max(0.02, framingRatio * Math.max(1e-9, this.trackedRadius))
    this.targetPosition.set(targetUnits.x, targetUnits.y, targetUnits.z)
    const cosElevation = Math.cos(this.elevation)
    this.absolutePosition
      .copy(this.targetPosition)
      .add(
        this.scratch
          .set(cosElevation * Math.sin(this.azimuth), Math.sin(this.elevation), cosElevation * Math.cos(this.azimuth))
          .multiplyScalar(this.distance),
      )
    this.lookAt.copy(this.targetPosition)
    this.panOffset.set(0, 0, 0)
    this.applyOrientation()
  }

  setFlyToProgressCallback(callback: (id: string) => void): void {
    this.flyToCompleted = callback
  }

  private minimumDistance(radiusUnits: number): number {
    return Math.max(radiusUnits * 1.35, 0.02)
  }

  private defaultDistance(radiusUnits: number): number {
    return Math.max(radiusUnits * 6, 0.4)
  }

  /** Starts the cinematic transition to a body. */
  flyTo(state: FlyToTarget, options: { distanceFactor?: number; duration?: number } = {}): void {
    const target = new Vector3(state.absoluteUnits.x, state.absoluteUnits.y, state.absoluteUnits.z)
    const startPosition = this.absolutePosition.clone()
    const startLookAt = this.lookAt.clone()

    const approachDirection = new Vector3().subVectors(startPosition, target)
    if (approachDirection.lengthSq() < 1e-8) approachDirection.set(0.4, 0.25, 1)
    approachDirection.normalize()
    // Approach from above the ecliptic: it reads better on a large screen and
    // avoids the target drifting behind the near plane on arrival.
    approachDirection.y += 0.3
    approachDirection.normalize()

    const desiredDistance = Math.max(
      this.minimumDistance(state.radiusUnits),
      state.radiusUnits * (options.distanceFactor ?? 5.5),
    )
    const separation = startPosition.distanceTo(target)
    const duration =
      options.duration ??
      (this.reducedMotion ? 0.35 : MathUtils.clamp(2.2 + Math.log10(1 + separation) * 0.55, 2.2, 7.5))

    this.flyToState = {
      targetId: state.id,
      startPosition,
      startLookAt,
      offsetDirection: approachDirection,
      desiredDistance,
      duration,
      elapsed: 0,
      arcHeight: Math.min(separation * 0.22, this.overviewDistance * 0.6),
    }
    this.trackedId = state.id
    this.trackedRadius = state.radiusUnits
    this.distance = desiredDistance
  }

  cancelFlyTo(): void {
    this.flyToState = null
  }

  /** Points the camera at a body without a transition. */
  snapTo(state: BodyState | null, distance?: number): void {
    if (!state) return
    this.trackedId = state.id
    if (distance !== undefined) this.distance = distance
  }

  /** Applies a drag gesture (mouse or single finger). */
  rotate(deltaX: number, deltaY: number): void {
    if (this.mode === 'free') {
      this.freeYaw -= deltaX * 0.0024
      this.freePitch = MathUtils.clamp(this.freePitch - deltaY * 0.0024, -1.45, 1.45)
      return
    }
    this.azimuth -= deltaX * this.options.rotateSpeed * 0.0045
    this.elevation = MathUtils.clamp(this.elevation + deltaY * this.options.rotateSpeed * 0.0045, -1.45, 1.45)
  }

  zoom(delta: number): void {
    if (this.mode === 'free') {
      // In free flight the wheel adjusts the translation rate, not the distance.
      this.freeSpeedBoost = MathUtils.clamp(this.freeSpeedBoost * (delta > 0 ? 0.9 : 1.1), 0.05, 40)
      return
    }
    const factor = Math.exp(delta * this.options.zoomSpeed)
    const minimum = this.trackedRadius > 0 ? this.minimumDistance(this.trackedRadius) : 0.01
    this.distance = MathUtils.clamp(this.distance * factor, minimum, 1e9)
  }

  /** Two-finger / middle-button pan, in render units. */
  pan(deltaX: number, deltaY: number, viewportHeight: number): void {
    if (this.mode === 'free') return
    const worldPerPixel = (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.distance) / Math.max(1, viewportHeight)
    const right = this.scratch.setFromMatrixColumn(this.camera.matrixWorld, 0)
    const up = this.scratchB.setFromMatrixColumn(this.camera.matrixWorld, 1)
    this.panOffset
      .addScaledVector(right, -deltaX * worldPerPixel)
      .addScaledVector(up, deltaY * worldPerPixel)
  }

  handleKey(code: string, pressed: boolean): void {
    if (pressed) this.keys.add(code)
    else this.keys.delete(code)
  }

  clearKeys(): void {
    this.keys.clear()
  }

  get activeKeys(): ReadonlySet<string> {
    return this.keys
  }

  /** Advances the camera. `states` provides the tracked body's moving position. */
  update(deltaSeconds: number, states: Map<string, BodyState>): void {
    const targetState = this.trackedId ? states.get(this.trackedId) : undefined
    if (targetState) {
      this.trackedRadius = targetState.radiusUnits
      this.targetPosition.set(targetState.absoluteUnits.x, targetState.absoluteUnits.y, targetState.absoluteUnits.z)
    } else {
      this.targetPosition.copy(ORIGIN)
    }

    if (this.flyToState) {
      this.updateFlyTo(deltaSeconds, states)
      return
    }

    switch (this.mode) {
      case 'free':
        this.updateFree(deltaSeconds)
        break
      case 'overview':
        this.distance = MathUtils.damp(this.distance, this.overviewDistance, 1.6, deltaSeconds)
        this.updateOrbitCamera(deltaSeconds, 0.4)
        break
      case 'surface':
        this.updateOrbitCamera(deltaSeconds, 0.6)
        break
      case 'follow':
      case 'orbit':
      default:
        this.updateOrbitCamera(deltaSeconds, 1)
        break
    }
  }

  private updateOrbitCamera(deltaSeconds: number, responsiveness: number): void {
    const cosElevation = Math.cos(this.elevation)
    const offset = this.scratch
      .set(cosElevation * Math.sin(this.azimuth), Math.sin(this.elevation), cosElevation * Math.cos(this.azimuth))
      .multiplyScalar(this.distance)

    const desired = this.scratchB.copy(this.targetPosition).add(offset).add(this.panOffset)
    const damping = 5 * responsiveness + 1.5
    this.absolutePosition.lerp(desired, 1 - Math.exp(-damping * deltaSeconds))
    this.lookAt.lerp(this.targetPosition, 1 - Math.exp(-8 * deltaSeconds))
    this.applyOrientation()
  }

  private updateFree(deltaSeconds: number): void {
    const speed = MathUtils.clamp(
      this.options.minSpeedUnitsPerSecond + this.freePosition.length() * 0.6,
      this.options.minSpeedUnitsPerSecond,
      this.options.maxSpeedUnitsPerSecond,
    ) * this.freeSpeedBoost

    const input = this.scratchB.set(0, 0, 0)
    if (this.keys.has('KeyW')) input.z -= 1
    if (this.keys.has('KeyS')) input.z += 1
    if (this.keys.has('KeyA')) input.x -= 1
    if (this.keys.has('KeyD')) input.x += 1
    if (this.keys.has('KeyQ')) input.y -= 1
    if (this.keys.has('KeyE')) input.y += 1

    const orientation = new Quaternion().setFromEuler(new Euler(this.freePitch, this.freeYaw, 0, 'YXZ'))
    const forward = this.scratch.set(0, 0, -1).applyQuaternion(orientation)
    const right = new Vector3().crossVectors(forward, WORLD_UP).normalize()

    const motion = new Vector3()
      .addScaledVector(forward, -input.z)
      .addScaledVector(right, input.x)
      .addScaledVector(WORLD_UP, input.y)
    if (motion.lengthSq() > 0) motion.normalize()
    this.velocity.lerp(motion.multiplyScalar(speed), 1 - Math.exp(-6 * deltaSeconds))
    this.freePosition.addScaledVector(this.velocity, deltaSeconds)

    this.absolutePosition.copy(this.freePosition)
    this.lookAt.copy(this.freePosition).add(forward)
    this.applyOrientation()
  }

  private updateFlyTo(deltaSeconds: number, states: Map<string, BodyState>): void {
    const state = this.flyToState
    if (!state) return
    state.elapsed += deltaSeconds
    const rawProgress = MathUtils.clamp(state.elapsed / state.duration, 0, 1)
    // Two-stage easing: a short pull-back, then an accelerated approach that settles.
    const eased =
      rawProgress < 0.18
        ? MathUtils.smoothstep(rawProgress / 0.18, 0, 1) * 0.16
        : 0.16 + MathUtils.smoothstep((rawProgress - 0.18) / 0.82, 0, 1) * 0.84

    const targetState = states.get(state.targetId)
    if (!targetState) {
      this.flyToState = null
      return
    }
    const target = new Vector3(
      targetState.absoluteUnits.x,
      targetState.absoluteUnits.y,
      targetState.absoluteUnits.z,
    )
    const endPosition = target.clone().addScaledVector(state.offsetDirection, state.desiredDistance)

    // A lateral arc keeps the motion from looking like a straight slide.
    const midpoint = new Vector3().addVectors(state.startPosition, endPosition).multiplyScalar(0.5)
    const arc = new Vector3().subVectors(midpoint, state.startLookAt)
    if (arc.lengthSq() > 1e-8) arc.normalize().multiplyScalar(state.arcHeight)
    const control = midpoint.add(arc)

    const quadratic = new Vector3()
      .copy(state.startPosition)
      .multiplyScalar((1 - eased) * (1 - eased))
      .addScaledVector(control, 2 * (1 - eased) * eased)
      .addScaledVector(endPosition, eased * eased)

    this.absolutePosition.copy(quadratic)
    this.lookAt.lerpVectors(state.startLookAt, target, Math.min(1, eased * 1.35))
    this.applyOrientation()

    // Keep the spherical state consistent so the hand-off to orbit mode is seamless.
    const offset = new Vector3().subVectors(this.absolutePosition, target)
    this.distance = Math.max(offset.length(), 1e-4)
    this.azimuth = Math.atan2(offset.x, offset.z)
    this.elevation = Math.asin(MathUtils.clamp(offset.y / this.distance, -1.5, 1.5))

    if (rawProgress >= 1) {
      this.flyToState = null
      this.panOffset.set(0, 0, 0)
      if (this.mode === 'overview') this.mode = 'orbit'
      this.flyToCompleted?.(state.targetId)
    }
  }

  /**
   * Orients the three.js camera. The camera object always sits at the origin of the
   * render space; only its rotation is derived from `absolutePosition`.
   */
  private applyOrientation(): void {
    const direction = this.scratch.subVectors(this.lookAt, this.absolutePosition)
    const horizontal = Math.hypot(direction.x, direction.z)
    const up = horizontal < 1e-6 ? new Vector3(0, 0, 1) : WORLD_UP
    this.lookMatrix.lookAt(this.absolutePosition, this.lookAt, up)
    this.camera.quaternion.setFromRotationMatrix(this.lookMatrix)
    this.camera.position.set(0, 0, 0)
    this.camera.updateMatrixWorld()
  }

  /** Serialisable state, used by the auto demo to restore a known view. */
  captureState(): { azimuth: number; elevation: number; distance: number; trackedId: string | null; mode: CameraMode } {
    return {
      azimuth: this.azimuth,
      elevation: this.elevation,
      distance: this.distance,
      trackedId: this.trackedId,
      mode: this.mode,
    }
  }
}