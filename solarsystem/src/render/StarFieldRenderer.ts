/**
 * Stellar background layer.
 *
 * Built from the real HYG catalogue (right ascension, declination, apparent
 * magnitude, B-V colour index) — never a random star map.
 *
 * The layer is attached to the camera and drawn at unit radius with depth testing
 * disabled, so it behaves as if it were at infinity: translating the camera
 * through the solar system produces no parallax at all, which is exactly the
 * physical situation for stars at parsec distances.
 *
 * Colour comes from the B-V index through a black-body-ish approximation, so
 * Betelgeuse really is red and Rigel really is blue.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
} from 'three'
import { STAR_FRAGMENT_SHADER, STAR_VERTEX_SHADER } from './Shaders'
import type { StarManifest } from '../types/catalog'

export interface StarFieldStats {
  total: number
  drawn: number
}

/** B-V colour index -> linear RGB, following the standard spectral sequence. */
export function colorIndexToRgb(colorIndex: number): [number, number, number] {
  const clamped = Math.max(-0.4, Math.min(2.0, colorIndex))
  const t = (clamped + 0.4) / 2.4
  // Anchors: hot blue (-0.4) .. white (0.6) .. orange (1.2) .. red (2.0)
  const anchors: Array<[number, [number, number, number]]> = [
    [0, [0.62, 0.72, 1.0]],
    [0.42, [0.86, 0.9, 1.0]],
    [0.58, [1.0, 1.0, 1.0]],
    [0.75, [1.0, 0.92, 0.78]],
    [1, [1.0, 0.78, 0.58]],
  ]
  let previous = anchors[0]
  let next = anchors[anchors.length - 1]
  for (let index = 0; index < anchors.length - 1; index++) {
    if (t >= anchors[index][0] && t <= anchors[index + 1][0]) {
      previous = anchors[index]
      next = anchors[index + 1]
      break
    }
  }
  const span = next[0] - previous[0] || 1
  const local = (t - previous[0]) / span
  return [
    previous[1][0] + (next[1][0] - previous[1][0]) * local,
    previous[1][1] + (next[1][1] - previous[1][1]) * local,
    previous[1][2] + (next[1][2] - previous[1][2]) * local,
  ]
}

/** RA/Dec (radians) -> unit vector in the scene frame (right-handed, Y up). */
export function equatorialToSceneDirection(raRad: number, decRad: number): [number, number, number] {
  // Catalogue coordinates are in the J2000 equatorial frame; convert to ecliptic
  // first so that the galactic/ecliptic alignment is preserved, then to the scene.
  const x = Math.cos(decRad) * Math.cos(raRad)
  const y = Math.cos(decRad) * Math.sin(raRad)
  const z = Math.sin(decRad)
  const obliquity = 23.4392911111 * (Math.PI / 180)
  const eclipticX = x
  const eclipticY = y * Math.cos(obliquity) + z * Math.sin(obliquity)
  const eclipticZ = -y * Math.sin(obliquity) + z * Math.cos(obliquity)
  return [eclipticX, eclipticZ, -eclipticY]
}

export class StarFieldRenderer {
  readonly points: Points
  private readonly geometry = new BufferGeometry()
  private readonly material: ShaderMaterial
  private readonly manifest: StarManifest
  private readonly data: Float32Array
  private enabled = true

  constructor(manifest: StarManifest, data: Float32Array) {
    this.manifest = manifest
    this.data = data
    this.material = new ShaderMaterial({
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      uniforms: {
        uScale: { value: 2.2 },
        uPixelRatio: { value: Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexColors: true,
    })
    this.points = new Points(this.geometry, this.material)
    this.points.name = 'starfield'
    this.points.frustumCulled = false
    this.points.renderOrder = -10
    this.points.visible = data.length > 0
    this.build(data)
  }

  private build(data: Float32Array): void {
    const stride = 4
    const total = Math.floor(data.length / stride)
    const positions = new Float32Array(total * 3)
    const colours = new Float32Array(total * 3)
    const magnitudes = new Float32Array(total)
    for (let index = 0; index < total; index++) {
      const [x, y, z] = equatorialToSceneDirection(data[index * stride], data[index * stride + 1])
      positions[index * 3] = x
      positions[index * 3 + 1] = y
      positions[index * 3 + 2] = z
      const colour = colorIndexToRgb(data[index * stride + 3])
      colours[index * 3] = colour[0]
      colours[index * 3 + 1] = colour[1]
      colours[index * 3 + 2] = colour[2]
      magnitudes[index] = data[index * stride + 2]
    }
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3))
    this.geometry.setAttribute('aColor', new BufferAttribute(colours, 3))
    this.geometry.setAttribute('aMagnitude', new BufferAttribute(magnitudes, 1))
    this.geometry.setDrawRange(0, total)
  }

  get statistics(): StarFieldStats {
    return { total: Math.floor(this.data.length / 4), drawn: this.geometry.drawRange.count }
  }

  get source(): string {
    return this.manifest.source
  }

  get license(): string {
    return this.manifest.license
  }

  get namedStars(): StarManifest['namedStars'] {
    return this.manifest.namedStars
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.points.visible = enabled && this.data.length > 0
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /** Limits the drawn star count for the active quality level. */
  setStarBudget(budget: number): void {
    const total = Math.floor(this.data.length / 4)
    this.geometry.setDrawRange(0, Math.min(total, Math.max(0, budget)))
  }

  setPixelRatio(pixelRatio: number): void {
    this.material.uniforms.uPixelRatio.value = Math.min(2, pixelRatio)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}