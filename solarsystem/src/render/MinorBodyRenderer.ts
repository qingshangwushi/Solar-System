/**
 * Minor-body rendering.
 *
 * ~11 000 catalogued asteroids, Centaurs, TNOs and comets are drawn as a single
 * GPU point cloud: one BufferGeometry, one draw call, no per-object Object3D and
 * no per-object React component. Positions arrive from the orbit worker as
 * float64 heliocentric kilometres and are converted to camera-relative float32
 * units on the main thread, which is a linear pass over a typed array.
 *
 * Colour encodes the dynamical class and size encodes the absolute magnitude, so
 * the cloud is legible as data rather than as noise.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
} from 'three'
import { POINT_FRAGMENT_SHADER, POINT_VERTEX_SHADER } from './Shaders'
import type { MinorBodyBucket } from '../types/catalog'
import type { ScaleTransform } from '../data/ScaleModel'
import type { RenderOrigin } from '../engine/FloatingOrigin'
import type { BodyState } from '../engine/PositionResolver'

const BUCKET_COLOURS: Record<MinorBodyBucket, [number, number, number]> = {
  mainBelt: [0.62, 0.66, 0.72],
  nearEarth: [1.0, 0.55, 0.35],
  trojan: [0.85, 0.7, 0.35],
  centaur: [0.45, 0.85, 0.9],
  tno: [0.7, 0.55, 0.95],
  comet: [0.45, 0.95, 0.8],
}

export interface MinorBodyRenderItem {
  index: number
  bucket: MinorBodyBucket
  absoluteMagnitude: number | null
  diameterKm: number | null
  /** Heliocentric ecliptic position, kilometres. */
  positionKm: { x: number; y: number; z: number }
}

export interface MinorBodyRenderStats {
  rendered: number
  drawCalls: number
  points: number
}

export class MinorBodyRenderer {
  readonly points: Points
  private readonly geometry = new BufferGeometry()
  private readonly material: ShaderMaterial
  private capacity = 0
  private renderedCount = 0
  private readonly sceneFrameOrigin = { x: 0, y: 0, z: 0 }

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: POINT_VERTEX_SHADER,
      fragmentShader: POINT_FRAGMENT_SHADER,
      uniforms: {
        uScale: { value: 1.6 },
        uOpacity: { value: 0.85 },
        uFadeStart: { value: 4_000 },
        uFadeEnd: { value: 140_000 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexColors: true,
    })
    this.points = new Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.name = 'minor-bodies'
    this.points.visible = false
  }

  get count(): number {
    return this.renderedCount
  }

  get isVisible(): boolean {
    return this.points.visible
  }

  setVisible(visible: boolean): void {
    this.points.visible = visible
  }

  setOpacity(opacity: number): void {
    this.material.uniforms.uOpacity.value = opacity
  }

  private ensureCapacity(count: number): void {
    if (count <= this.capacity) return
    this.capacity = Math.max(count, Math.ceil(this.capacity * 1.3) || 1024)
    const positions = new Float32Array(this.capacity * 3)
    const colours = new Float32Array(this.capacity * 3)
    const sizes = new Float32Array(this.capacity)
    const magnitudes = new Float32Array(this.capacity)
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3))
    this.geometry.setAttribute('color', new BufferAttribute(colours, 3))
    this.geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
    this.geometry.setAttribute('aMagnitude', new BufferAttribute(magnitudes, 1))
  }

  /**
   * Writes the subset into the vertex buffers. `items` is expected to be the same
   * array identity between updates so that attribute uploads stay incremental.
   */
  update(items: readonly MinorBodyRenderItem[], origin: RenderOrigin, scale: ScaleTransform): MinorBodyRenderStats {
    this.ensureCapacity(items.length)
    const positions = this.geometry.getAttribute('position') as BufferAttribute
    const colours = this.geometry.getAttribute('color') as BufferAttribute
    const sizes = this.geometry.getAttribute('aSize') as BufferAttribute
    const magnitudes = this.geometry.getAttribute('aMagnitude') as BufferAttribute

    const positionArray = positions.array as Float32Array
    const colourArray = colours.array as Float32Array
    const sizeArray = sizes.array as Float32Array
    const magnitudeArray = magnitudes.array as Float32Array

    for (let slot = 0; slot < items.length; slot++) {
      const item = items[slot]
      origin.relative(item.positionKm, scale, this.sceneFrameOrigin)
      positionArray[slot * 3] = this.sceneFrameOrigin.x
      positionArray[slot * 3 + 1] = this.sceneFrameOrigin.y
      positionArray[slot * 3 + 2] = this.sceneFrameOrigin.z

      const colour = BUCKET_COLOURS[item.bucket] ?? BUCKET_COLOURS.mainBelt
      colourArray[slot * 3] = colour[0]
      colourArray[slot * 3 + 1] = colour[1]
      colourArray[slot * 3 + 2] = colour[2]

      const magnitude = item.absoluteMagnitude ?? 12
      magnitudeArray[slot] = magnitude
      // Brighter objects (lower H) and larger diameters get a bigger marker; the
      // scale is a display convention, documented in the legend.
      const sizeFromMagnitude = Math.max(0.6, 4.2 - Math.min(6, Math.max(-2, magnitude)) * 0.28)
      const sizeFromDiameter = item.diameterKm ? Math.min(3, Math.log10(Math.max(10, item.diameterKm)) - 1.4) : 0
      sizeArray[slot] = Math.max(0.6, sizeFromMagnitude + sizeFromDiameter)
    }

    positions.needsUpdate = true
    colours.needsUpdate = true
    sizes.needsUpdate = true
    magnitudes.needsUpdate = true
    this.geometry.setDrawRange(0, items.length)
    this.geometry.computeBoundingSphere()
    this.renderedCount = items.length

    return { rendered: items.length, drawCalls: 1, points: items.length }
  }

  /** Highlight radius used by the camera when framing the whole minor-body set. */
  boundingRadiusUnits(states: Iterable<BodyState>): number {
    let radius = 0
    for (const state of states) {
      const distance = Math.sqrt(
        state.absoluteUnits.x ** 2 + state.absoluteUnits.y ** 2 + state.absoluteUnits.z ** 2,
      )
      if (distance > radius) radius = distance
    }
    return radius
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}