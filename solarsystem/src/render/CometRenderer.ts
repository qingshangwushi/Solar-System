/**
 * Comet activity: coma, dust tail and ion tail.
 *
 * A comet only looks like a comet when it is close enough to the Sun to sublimate.
 * For every catalogued comet inside the activity limit this renderer draws:
 *
 *  - a **coma** — an additive halo at the nucleus, growing as the comet approaches
 *    the Sun;
 *  - a **dust tail** — a short polyline that lags behind the comet's motion, the way
 *    released dust grains keep the orbital velocity they had when they left the
 *    nucleus;
 *  - an **ion tail** — a straight line pointing exactly anti-sunward, because the
 *    solar wind sweeps the ionised gas radially outwards.
 *
 * Every vertex comes from the comet's real heliocentric position and velocity (the
 * same Kepler solver the minor-body cloud uses); nothing is decorative. The layer is
 * three objects — one Points and two LineSegments — regardless of how many comets
 * are active, so it costs three draw calls.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  ShaderMaterial,
} from 'three'
import { COMA_FRAGMENT_SHADER, COMA_VERTEX_SHADER } from './Shaders'
import { AU_KM } from '../astronomy/Units'
import type { Vec3 } from '../astronomy/Coordinates'
import type { ScaleTransform } from '../data/ScaleModel'
import type { RenderOrigin } from '../engine/FloatingOrigin'

/** One comet that is currently active enough to show a coma and tails. */
export interface ActiveComet {
  /** Heliocentric ecliptic position of the nucleus, kilometres. */
  nucleusKm: Vec3
  /** Unit vector from the nucleus towards the Sun. */
  sunward: Vec3
  /** Unit velocity vector (direction of orbital motion). */
  velocity: Vec3
  /** 0..1 sublimation activity, derived from the heliocentric distance. */
  activity: number
}

/** Comets beyond this heliocentric distance show nothing: they are inert nuclei. */
export const COMET_ACTIVITY_LIMIT_AU = 8
/** Upper bound on comets drawn at once, the most active first. */
export const MAX_ACTIVE_COMETS = 96
/** Number of polyline segments in a dust tail. */
const DUST_SEGMENTS = 4

/**
 * Activity as a function of heliocentric distance: full inside ~1 au, fading to zero
 * at the limit. This is a documented display law, not a measured production rate.
 */
export function cometActivity(distanceAu: number): number {
  if (!(distanceAu > 0)) return 0
  const raw = 1.6 / Math.max(0.7, distanceAu) - 0.2
  return Math.max(0, Math.min(1, raw))
}

export interface CometRenderStats {
  active: number
  tailSegments: number
}

export class CometRenderer {
  readonly group = new Group()
  private readonly comaGeometry = new BufferGeometry()
  private readonly comaMaterial: ShaderMaterial
  private readonly coma: Points
  private readonly dustGeometry = new BufferGeometry()
  private readonly ionGeometry = new BufferGeometry()
  private readonly dust: LineSegments
  private readonly ion: LineSegments
  private visible = true
  private capacity = 0
  private activeCount = 0
  private readonly nucleusScene = { x: 0, y: 0, z: 0 }
  private readonly probeScene = { x: 0, y: 0, z: 0 }

  constructor() {
    this.group.name = 'comets'
    this.comaMaterial = new ShaderMaterial({
      vertexShader: COMA_VERTEX_SHADER,
      fragmentShader: COMA_FRAGMENT_SHADER,
      uniforms: {
        // Set from the viewport each frame: radius-units -> screen pixels.
        uPixelScale: { value: 1200 },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexColors: true,
    })
    this.coma = new Points(this.comaGeometry, this.comaMaterial)
    this.coma.frustumCulled = false
    this.coma.renderOrder = 3

    this.dust = new LineSegments(
      this.dustGeometry,
      new LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.6, depthWrite: false }),
    )
    this.ion = new LineSegments(
      this.ionGeometry,
      new LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.55, depthWrite: false }),
    )
    for (const line of [this.dust, this.ion]) {
      line.frustumCulled = false
      line.renderOrder = 3
    }

    this.group.add(this.coma, this.dust, this.ion)
    this.group.visible = false
  }

  get isVisible(): boolean {
    return this.visible && this.activeCount > 0
  }

  get active(): number {
    return this.activeCount
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.group.visible = visible && this.activeCount > 0
  }

  /** Converts a render-space radius into screen pixels for the current viewport. */
  setProjectionScale(viewportHeight: number, fieldOfViewDeg: number, pixelRatio: number): void {
    const fovRadians = (fieldOfViewDeg * Math.PI) / 180
    // A sphere of radius R at distance d covers R/d * (H / (2 tan(fov/2))) pixels
    // across its radius; the point sprite is a diameter, hence the factor two.
    this.comaMaterial.uniforms.uPixelScale.value =
      (viewportHeight * pixelRatio) / Math.tan(fovRadians / 2)
  }

  private ensureCapacity(count: number): void {
    // Always allocate at least one slot: `update([])` must still find the vertex
    // attributes in place rather than dereferencing undefined.
    const target = Math.max(count, 16)
    if (target <= this.capacity) return
    this.capacity = Math.max(target, Math.ceil(this.capacity * 1.4) || 16)
    this.comaGeometry.setAttribute('position', new BufferAttribute(new Float32Array(this.capacity * 3), 3))
    this.comaGeometry.setAttribute('color', new BufferAttribute(new Float32Array(this.capacity * 3), 3))
    this.comaGeometry.setAttribute('aSize', new BufferAttribute(new Float32Array(this.capacity), 1))
    const dustVertices = this.capacity * DUST_SEGMENTS * 2
    this.dustGeometry.setAttribute('position', new BufferAttribute(new Float32Array(dustVertices * 3), 3))
    this.ionGeometry.setAttribute('position', new BufferAttribute(new Float32Array(dustVertices * 3), 3))
  }

  /**
   * Rewrites the comet geometry for this frame. `comets` must already be limited to
   * the active set (see `COMET_ACTIVITY_LIMIT_AU` and `MAX_ACTIVE_COMETS`).
   */
  update(comets: readonly ActiveComet[], origin: RenderOrigin, scale: ScaleTransform): CometRenderStats {
    this.ensureCapacity(comets.length)
    const comaPosition = this.comaGeometry.getAttribute('position') as BufferAttribute
    const comaColour = this.comaGeometry.getAttribute('color') as BufferAttribute
    const comaSize = this.comaGeometry.getAttribute('aSize') as BufferAttribute
    const comaPositions = comaPosition.array as Float32Array
    const comaColours = comaColour.array as Float32Array
    const comaSizes = comaSize.array as Float32Array

    const dustAttribute = this.dustGeometry.getAttribute('position') as BufferAttribute
    const ionAttribute = this.ionGeometry.getAttribute('position') as BufferAttribute
    const dustArray = dustAttribute.array as Float32Array
    const ionArray = ionAttribute.array as Float32Array

    let dustVertex = 0
    for (let index = 0; index < comets.length; index++) {
      const { nucleusKm, sunward, velocity, activity } = comets[index]

      // Nucleus, in camera-relative render units.
      origin.relative(nucleusKm, scale, this.nucleusScene)
      comaPositions[index * 3] = this.nucleusScene.x
      comaPositions[index * 3 + 1] = this.nucleusScene.y
      comaPositions[index * 3 + 2] = this.nucleusScene.z
      comaColours[index * 3] = 1.0
      comaColours[index * 3 + 1] = 0.88
      comaColours[index * 3 + 2] = 0.68
      // The coma is a physical halo: its size follows the scale mode, so a scientific
      // view keeps it small and honest while the exhibition view stays legible.
      comaSizes[index] = scale.distanceKmToUnits(activity * 0.05 * AU_KM) + 0.02

      // Base direction of the dust tail: anti-sunward, tilted towards the direction of
      // motion because the released grains keep their orbital velocity.
      const base = normalise({
        x: sunward.x + velocity.x * 0.55,
        y: sunward.y + velocity.y * 0.55,
        z: sunward.z + velocity.z * 0.55,
      })
      const dustLengthKm = (0.25 + 0.75 * activity) * 0.35 * AU_KM * activity
      let previousX = this.nucleusScene.x
      let previousY = this.nucleusScene.y
      let previousZ = this.nucleusScene.z
      for (let segment = 1; segment <= DUST_SEGMENTS; segment++) {
        const fraction = segment / DUST_SEGMENTS
        // Quadratic lag: successive samples fall further behind the nucleus.
        const lag = fraction * fraction * 0.5
        const distanceKm = fraction * dustLengthKm
        const bendKm = lag * dustLengthKm * 0.45
        origin.relative(
          {
            x: nucleusKm.x + base.x * distanceKm + velocity.x * bendKm,
            y: nucleusKm.y + base.y * distanceKm + velocity.y * bendKm,
            z: nucleusKm.z + base.z * distanceKm + velocity.z * bendKm,
          },
          scale,
          this.probeScene,
        )
        dustArray[dustVertex * 3] = previousX
        dustArray[dustVertex * 3 + 1] = previousY
        dustArray[dustVertex * 3 + 2] = previousZ
        dustArray[dustVertex * 3 + 3] = this.probeScene.x
        dustArray[dustVertex * 3 + 4] = this.probeScene.y
        dustArray[dustVertex * 3 + 5] = this.probeScene.z
        dustVertex += 2
        previousX = this.probeScene.x
        previousY = this.probeScene.y
        previousZ = this.probeScene.z
      }

      // Ion tail: straight, exactly anti-sunward, and longer than the dust tail.
      const ionLengthKm = (0.4 + 1.1 * activity) * 0.35 * AU_KM * activity
      origin.relative(
        {
          x: nucleusKm.x + sunward.x * ionLengthKm,
          y: nucleusKm.y + sunward.y * ionLengthKm,
          z: nucleusKm.z + sunward.z * ionLengthKm,
        },
        scale,
        this.probeScene,
      )
      const ionStart = index * DUST_SEGMENTS * 2
      ionArray[ionStart * 3] = this.nucleusScene.x
      ionArray[ionStart * 3 + 1] = this.nucleusScene.y
      ionArray[ionStart * 3 + 2] = this.nucleusScene.z
      ionArray[ionStart * 3 + 3] = this.probeScene.x
      ionArray[ionStart * 3 + 4] = this.probeScene.y
      ionArray[ionStart * 3 + 5] = this.probeScene.z
      // Collapse the unused segments onto the last point so they draw nothing.
      for (let segment = 1; segment < DUST_SEGMENTS; segment++) {
        const target = (ionStart + segment * 2) * 3
        ionArray[target] = this.probeScene.x
        ionArray[target + 1] = this.probeScene.y
        ionArray[target + 2] = this.probeScene.z
        ionArray[target + 3] = this.probeScene.x
        ionArray[target + 4] = this.probeScene.y
        ionArray[target + 5] = this.probeScene.z
      }
    }

    comaPosition.needsUpdate = true
    comaColour.needsUpdate = true
    comaSize.needsUpdate = true
    this.comaGeometry.setDrawRange(0, comets.length)
    dustAttribute.needsUpdate = true
    this.dustGeometry.setDrawRange(0, dustVertex)
    ionAttribute.needsUpdate = true
    this.ionGeometry.setDrawRange(0, comets.length * DUST_SEGMENTS * 2)

    this.activeCount = comets.length
    this.group.visible = this.visible && comets.length > 0
    return { active: comets.length, tailSegments: comets.length * (DUST_SEGMENTS + 1) }
  }

  dispose(): void {
    this.comaGeometry.dispose()
    this.dustGeometry.dispose()
    this.ionGeometry.dispose()
    this.comaMaterial.dispose()
    ;(this.dust.material as LineBasicMaterial).dispose()
    ;(this.ion.material as LineBasicMaterial).dispose()
    this.group.clear()
  }
}

function normalise(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z)
  if (length < 1e-9) return { x: 1, y: 0, z: 0 }
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}
