/**
 * Orbit paths.
 *
 * Two kinds of geometry are used, matching the two position models:
 *
 *  - Heliocentric paths (planets, dwarf planets, comets on demand) are stored as
 *    float64 kilometre samples and rewritten into camera-relative float32 vertex
 *    positions every frame. Density comes from the LOD sample count, so a distant
 *    path costs a fraction of a close one.
 *  - Parent-relative paths (moons) never change shape, so they are built once and
 *    parented to the planet group; the scene graph handles all the motion.
 *
 * Every path is the real computed trajectory (an ellipse from the orbital elements
 * or a sampled ephemeris), never a decorative circle.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Object3D,
} from 'three'
import type { Vec3 } from '../astronomy/Coordinates'
import { eclipticToScene } from '../astronomy/Coordinates'
import type { ScaleTransform } from '../data/ScaleModel'
import type { RenderOrigin } from '../engine/FloatingOrigin'

export type OrbitColourKey = 'planet' | 'dwarfPlanet' | 'moon' | 'asteroid' | 'comet' | 'tno' | 'selected'

const COLOURS: Record<OrbitColourKey, number> = {
  planet: 0x6f9fd8,
  dwarfPlanet: 0xb99cf0,
  moon: 0x86c6e8,
  asteroid: 0x8f9aa8,
  comet: 0x6fd0c0,
  tno: 0xa88fd8,
  selected: 0xffd27a,
}

interface HeliocentricPath {
  id: string
  samplesKm: Float64Array
  geometry: BufferGeometry
  line: Line
  colourKey: OrbitColourKey
  sampleBudget: number
}

export class OrbitRenderer {
  readonly group = new Group()
  private readonly heliocentric = new Map<string, HeliocentricPath>()
  private readonly localPaths = new Map<string, Line>()
  private visible = true

  constructor() {
    this.group.name = 'orbits'
  }

  /**
   * Show/hide every orbit line. Local (parent-relative) paths are parented to body
   * groups rather than to `this.group`, so they are toggled individually — the
   * earlier version only switched the group and left the satellite paths on screen
   * (P2-2).
   */
  setVisible(visible: boolean): void {
    this.visible = visible
    this.group.visible = visible
    for (const line of this.localPaths.values()) line.visible = visible
  }

  get isVisible(): boolean {
    return this.visible
  }

  /** Registers or replaces a heliocentric path. `samplesKm` is xyz-interleaved. */
  setHeliocentricPath(id: string, samplesKm: Float64Array, colourKey: OrbitColourKey): void {
    const existing = this.heliocentric.get(id)
    if (existing) {
      // Reuse the buffers when the sample count is unchanged.
      if (existing.samplesKm.length === samplesKm.length) {
        existing.samplesKm = samplesKm
        existing.colourKey = colourKey
        const material = existing.line.material as LineBasicMaterial
        material.color.setHex(COLOURS[colourKey])
        return
      }
      this.removeHeliocentricPath(id)
    }
    const vertices = samplesKm.length / 3
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3))
    geometry.setDrawRange(0, vertices)
    const material = new LineBasicMaterial({
      color: COLOURS[colourKey],
      transparent: true,
      opacity: colourKey === 'selected' ? 0.95 : 0.42,
      depthWrite: false,
    })
    const line = new Line(geometry, material)
    line.frustumCulled = false
    line.renderOrder = 1
    this.group.add(line)
    this.heliocentric.set(id, { id, samplesKm, geometry, line, colourKey, sampleBudget: vertices })
  }

  removeHeliocentricPath(id: string): void {
    const entry = this.heliocentric.get(id)
    if (!entry) return
    this.group.remove(entry.line)
    entry.geometry.dispose()
    ;(entry.line.material as LineBasicMaterial).dispose()
    this.heliocentric.delete(id)
  }

  hasHeliocentricPath(id: string): boolean {
    return this.heliocentric.has(id)
  }

  /**
   * Registers a static parent-relative path (moon orbits). `unitsPerKm` is supplied
   * by the position resolver so that the drawn ellipse coincides exactly with the
   * placed moons, including the satellite-system enhancement.
   *
   * The samples arrive in the heliocentric ecliptic frame while the parent group
   * lives in the render (scene) frame, so the frame change is applied here — a local
   * path that skipped it would be tilted 90° out of the plane its moon actually
   * follows.
   */
  setLocalPath(
    key: string,
    parent: Object3D,
    samplesKm: Float64Array,
    unitsPerKm: number,
    colourKey: OrbitColourKey,
  ): void {
    const existing = this.localPaths.get(key)
    if (existing) {
      existing.parent?.remove(existing)
      existing.geometry.dispose()
      ;(existing.material as LineBasicMaterial).dispose()
      this.localPaths.delete(key)
    }
    const vertices = samplesKm.length / 3
    const positions = new Float32Array(vertices * 3)
    for (let index = 0; index < vertices; index++) {
      const scene = eclipticToScene({
        x: samplesKm[index * 3],
        y: samplesKm[index * 3 + 1],
        z: samplesKm[index * 3 + 2],
      })
      positions[index * 3] = scene.x * unitsPerKm
      positions[index * 3 + 1] = scene.y * unitsPerKm
      positions[index * 3 + 2] = scene.z * unitsPerKm
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setDrawRange(0, vertices)
    const material = new LineBasicMaterial({
      color: COLOURS[colourKey],
      transparent: true,
      opacity: colourKey === 'selected' ? 0.9 : 0.34,
      depthWrite: false,
    })
    const line = new Line(geometry, material)
    line.frustumCulled = false
    line.renderOrder = 1
    // Local paths hang off a body group instead of `this.group`, so the
    // show/hide switch has to be applied per line as well.
    line.visible = this.visible
    parent.add(line)
    this.localPaths.set(key, line)
  }

  clearLocalPaths(parent: Object3D): void {
    for (const [key, line] of [...this.localPaths.entries()]) {
      if (line.parent === parent) {
        parent.remove(line)
        line.geometry.dispose()
        ;(line.material as LineBasicMaterial).dispose()
        this.localPaths.delete(key)
      }
    }
  }

  removeLocalPath(key: string): void {
    const line = this.localPaths.get(key)
    if (!line) return
    line.parent?.remove(line)
    line.geometry.dispose()
    ;(line.material as LineBasicMaterial).dispose()
    this.localPaths.delete(key)
  }

  /**
   * Drops every local path. Used before a WebGL context restore rebuilds the body
   * visuals, so the lines cannot stay attached to a detached group.
   */
  removeAllLocalPaths(): void {
    for (const key of [...this.localPaths.keys()]) this.removeLocalPath(key)
  }

  get pathCount(): number {
    return this.heliocentric.size + this.localPaths.size
  }

  /**
   * Rewrites the heliocentric paths into camera-relative render coordinates.
   * `lodBudget` caps how many vertices are written per path, which is how the LOD
   * requirement ("no high-density orbit lines for every object") is satisfied.
   */
  update(origin: RenderOrigin, scale: ScaleTransform, lodBudget: number): number {
    if (!this.visible) return 0
    let written = 0
    const scratch: Vec3 = { x: 0, y: 0, z: 0 }
    for (const entry of this.heliocentric.values()) {
      const total = entry.samplesKm.length / 3
      const stride = Math.max(1, Math.ceil(total / Math.max(16, lodBudget)))
      const attribute = entry.geometry.getAttribute('position') as BufferAttribute
      const array = attribute.array as Float32Array
      let vertex = 0
      for (let sample = 0; sample < total; sample += stride) {
        const offset = sample * 3
        origin.relative(
          { x: entry.samplesKm[offset], y: entry.samplesKm[offset + 1], z: entry.samplesKm[offset + 2] },
          scale,
          scratch,
        )
        array[vertex * 3] = scratch.x
        array[vertex * 3 + 1] = scratch.y
        array[vertex * 3 + 2] = scratch.z
        vertex += 1
      }
      // Close the loop for elliptical paths by repeating the first sample.
      if (vertex > 1) {
        array[vertex * 3] = array[0]
        array[vertex * 3 + 1] = array[1]
        array[vertex * 3 + 2] = array[2]
        vertex += 1
      }
      entry.geometry.setDrawRange(0, vertex)
      attribute.needsUpdate = true
      written += vertex
    }
    return written
  }

  dispose(): void {
    for (const id of [...this.heliocentric.keys()]) this.removeHeliocentricPath(id)
    for (const key of [...this.localPaths.keys()]) this.removeLocalPath(key)
    this.group.clear()
  }
}