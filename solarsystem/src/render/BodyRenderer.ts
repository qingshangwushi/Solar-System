/**
 * Body visual.
 *
 * One instance per rendered body (Sun, planet, dwarf planet, moon). A single Group
 * holds every mesh of that body, so a moon can simply be parented to its planet
 * and inherit the planet's camera-relative placement — the hierarchical scene
 * graph mirrors the astronomical parent/child relation while every coordinate
 * stays small (see docs/coordinate-system.md).
 *
 * LOD tiers are selected from the object's projected size, not from a fixed
 * distance:
 *   point   — sub-pixel: the mesh is hidden and a marker is shown instead
 *   low     — small: untextured low-poly sphere
 *   standard— visible disc: textured sphere with the full surface shader
 *   close   — large: adds atmosphere shell, cloud layer and ring detail
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Matrix4,
  type Texture,
  Matrix4 as ThreeMatrix4,
} from 'three'
import {
  ATMOSPHERE_FRAGMENT_SHADER,
  ATMOSPHERE_VERTEX_SHADER,
  CLOUD_FRAGMENT_SHADER,
  GLOW_FRAGMENT_SHADER,
  GLOW_VERTEX_SHADER,
  PLANET_FRAGMENT_SHADER,
  PLANET_VERTEX_SHADER,
  SUN_FRAGMENT_SHADER,
  SUN_VERTEX_SHADER,
} from './Shaders'
import type { CelestialBody } from '../types/catalog'
import type { BodyState } from '../engine/PositionResolver'
import type { ResolvedMaterialMaps } from '../data/TextureProvider'
import type { QualityLevel } from '../engine/QualityController'
import { ECLIPTIC_TO_SCENE, multiplyMat3, type Mat3 } from '../astronomy/Coordinates'
import { bodyOrientationBodyToEcliptic } from '../astronomy/Rotation'

export type LodTier = 'point' | 'low' | 'standard' | 'close'

/** Bodies rendered with an atmospheric shell, and the shell colour. */
const ATMOSPHERES: Record<string, { colour: number; intensity: number; factor: number }> = {
  venus: { colour: 0xffd9a0, intensity: 1.05, factor: 1.03 },
  earth: { colour: 0x6fa8ff, intensity: 1.1, factor: 1.028 },
  mars: { colour: 0xd8a184, intensity: 0.5, factor: 1.02 },
  jupiter: { colour: 0xffe0b8, intensity: 0.75, factor: 1.035 },
  saturn: { colour: 0xffe6c0, intensity: 0.7, factor: 1.04 },
  uranus: { colour: 0xa8f0f0, intensity: 0.8, factor: 1.035 },
  neptune: { colour: 0x7fa8ff, intensity: 0.85, factor: 1.035 },
  titan: { colour: 0xffb060, intensity: 0.95, factor: 1.05 },
  triton: { colour: 0xd0d8ff, intensity: 0.45, factor: 1.03 },
  pluto: { colour: 0xc0b0a0, intensity: 0.35, factor: 1.02 },
}

/**
 * Neutral 1x1 map. Sampling an unbound sampler returns black in WebGL, which would
 * make a body invisible against the black background before its surface map has
 * finished streaming in; this guarantees a correctly lit sphere at all times.
 */
let neutralMap: DataTexture | null = null

function getNeutralMap(): DataTexture {
  if (!neutralMap) {
    neutralMap = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    neutralMap.needsUpdate = true
  }
  return neutralMap
}

const SPHERE_SEGMENTS: Record<QualityLevel, { width: number; height: number }> = {
  ultra: { width: 128, height: 96 },
  high: { width: 96, height: 64 },
  medium: { width: 64, height: 48 },
  performance: { width: 32, height: 24 },
}

export interface BodyVisualOptions {
  quality: QualityLevel
  sunDirectionScene: Vector3
  /** Projected radius in pixels, used to choose the LOD tier. */
  projectedRadiusPixels: number
  /** Distance from the camera in render units. */
  cameraDistanceUnits: number
  showAtmosphere: boolean
  nowSecondsSinceJ2000: number
}

function mat3ToQuaternion(matrix: Mat3, target: Quaternion): Quaternion {
  const four = new ThreeMatrix4()
  four.set(
    matrix[0], matrix[3], matrix[6], 0,
    matrix[1], matrix[4], matrix[7], 0,
    matrix[2], matrix[5], matrix[8], 0,
    0, 0, 0, 1,
  )
  return target.setFromRotationMatrix(four as unknown as Matrix4)
}

/**
 * A body-frame rotation expressed in the scene frame: `S · M`.
 *
 * The engine keeps every position in the render (scene) frame — `ScaleModel`
 * applies `ECLIPTIC_TO_SCENE` — so a rotation authored in the ecliptic frame only
 * has to be pre-multiplied by the frame change. Conjugating it (`S · M · S⁻¹`, as
 * the first implementation did) maps the pole into the equatorial plane and makes
 * it drift with the rotation phase; see P0-3 of docs/e2e-verification-report.md.
 */
export function bodyFrameMat3ToScene(matrix: Mat3): Mat3 {
  return multiplyMat3(ECLIPTIC_TO_SCENE, matrix)
}

export class BodyVisual {
  /** Anchor: carries only the camera-relative translation, never a rotation. */
  readonly group = new Group()
  /**
   * Rotating frame: carries the axial tilt, the rotation phase and the body's
   * radius scale. Kept separate from the anchor so that moons can be parented to
   * the anchor without inheriting the planet's spin.
   */
  readonly frame = new Group()
  readonly body: CelestialBody

  private mesh: Mesh | null = null
  private glow: Mesh | null = null
  private atmosphere: Mesh | null = null
  private clouds: Mesh | null = null
  private rings: Mesh | null = null
  private marker: Points | null = null

  private material: ShaderMaterial | MeshBasicMaterial | null = null
  private sphereGeometry: SphereGeometry | null = null
  private readonly orientation = new Quaternion()
  private texturesApplied = false
  private cloudTextureApplied = false
  private textureRequested = false
  private currentTier: LodTier = 'point'
  /**
   * Last resolved texture set. Kept so that a LOD tier change — which rebuilds the
   * material — re-applies the maps instead of silently reverting to the neutral map
   * (a planet must not go dark merely because the camera moved closer).
   */
  private lastMaps: ResolvedMaterialMaps | null = null

  constructor(body: CelestialBody) {
    this.body = body
    this.group.name = `body:${body.id}`
    this.group.matrixAutoUpdate = true
    this.frame.name = `frame:${body.id}`
    this.group.add(this.frame)
  }

  get tier(): LodTier {
    return this.currentTier
  }

  get needsTexture(): boolean {
    return !this.textureRequested
  }

  markTextureRequested(): void {
    this.textureRequested = true
  }

  /** True when the body is currently rendered as a textured sphere. */
  get hasTexturedMesh(): boolean {
    return this.texturesApplied
  }

  /**
   * True when the visible surface is the locally generated procedural map rather
   * than published imagery — either because the catalog declares no map at all or
   * because every declared map failed to load. The information panel uses this to
   * disclose the substitution instead of passing the illustration off as data.
   */
  get hasProceduralSurface(): boolean {
    if (!this.texturesApplied) return !this.body.textures?.map
    return this.lastMaps?.procedural ?? false
  }

  /** True when the cloud layer has a real cloud map bound to it. */
  get hasCloudMap(): boolean {
    return this.cloudTextureApplied
  }

  /** Diagnostics: the material state of the surface mesh. */
  get materialDiagnostics(): { tier: LodTier; meshVisible: boolean; hasMap: boolean; hasNormal: boolean; hasNight: boolean } {
    const material = this.material as ShaderMaterial | null
    return {
      tier: this.currentTier,
      meshVisible: this.mesh?.visible ?? false,
      hasMap: Boolean(material?.uniforms?.uMap?.value),
      hasNormal: Boolean(material?.uniforms?.uNormalMap?.value),
      hasNight: Boolean(material?.uniforms?.uNightMap?.value),
    }
  }

  update(state: BodyState, options: BodyVisualOptions): void {
    const tier = this.selectTier(options.projectedRadiusPixels, options.cameraDistanceUnits, state)
    if (tier !== this.currentTier) {
      this.currentTier = tier
      this.rebuildForTier(tier, options)
    }
    if (!this.mesh || !this.material) return

    // The anchor is placed by the caller (camera-relative or parent-relative).
    // The frame carries the radius and the orientation.
    this.frame.scale.setScalar(Math.max(1e-6, state.radiusUnits))

    const orientationFrame = bodyOrientationBodyToEcliptic(
      {
        periodHours: this.body.rotation.periodHours ?? 0,
        poleRaDeg: this.body.orientation?.poleRaDeg ?? 0,
        poleDecDeg: this.body.orientation?.poleDecDeg ?? 90,
      },
      options.nowSecondsSinceJ2000,
    )
    mat3ToQuaternion(bodyFrameMat3ToScene(orientationFrame), this.orientation)
    this.frame.quaternion.copy(this.orientation)

    const shaderMaterial = this.material as ShaderMaterial
    if (shaderMaterial.uniforms?.uSunDirection) {
      shaderMaterial.uniforms.uSunDirection.value.copy(options.sunDirectionScene)
    }
    if (shaderMaterial.uniforms?.uTime) {
      shaderMaterial.uniforms.uTime.value = performance.now() / 1000
    }

    if (this.atmosphere) {
      this.atmosphere.visible = options.showAtmosphere && (tier === 'standard' || tier === 'close')
      const atmosphereMaterial = this.atmosphere.material as ShaderMaterial
      atmosphereMaterial.uniforms.uSunDirection.value.copy(options.sunDirectionScene)
    }
    if (this.clouds) {
      // A cloud shell without its alpha map would render as an opaque white ball,
      // so it only appears once the real cloud texture has been applied.
      this.clouds.visible = tier === 'close' && this.cloudTextureApplied
      const cloudMaterial = this.clouds.material as ShaderMaterial
      cloudMaterial.uniforms?.uSunDirection?.value.copy(options.sunDirectionScene)
      this.clouds.rotation.y += 0.00002
    }
    if (this.rings) {
      this.rings.visible = tier !== 'point'
    }
    if (this.marker) {
      this.marker.visible = tier === 'point'
    }
    if (this.mesh) {
      // At the point tier the disc would be sub-pixel; the marker plus the label is
      // what identifies the body, and the disc is hidden so it cannot occlude it.
      this.mesh.visible = tier !== 'point'
    }
    if (this.glow) this.glow.visible = tier !== 'point'
    if (this.atmosphere) this.atmosphere.visible = this.atmosphere.visible && tier !== 'point'
    if (this.clouds) this.clouds.visible = this.clouds.visible && tier !== 'point'
    if (this.glow) {
      this.glow.visible = true
    }
  }

  private selectTier(projectedRadiusPixels: number, cameraDistanceUnits: number, state: BodyState): LodTier {
    if (projectedRadiusPixels < 1.4) return 'point'
    if (projectedRadiusPixels < 5) return 'low'
    // Rings and atmospheres only make sense once the body is a few pixels across,
    // and never for a body that is behind the camera.
    if (cameraDistanceUnits < state.radiusUnits * 90 && projectedRadiusPixels > 40) return 'close'
    return 'standard'
  }

  private rebuildForTier(tier: LodTier, options: BodyVisualOptions): void {
    this.disposeMeshes()
    const segments = tier === 'low' ? { width: 24, height: 18 } : SPHERE_SEGMENTS[options.quality]
    this.sphereGeometry = new SphereGeometry(1, segments.width, segments.height)

    const isStar = this.body.type === 'star'
    this.material = isStar ? this.createSunMaterial() : this.createPlanetMaterial()
    this.mesh = new Mesh(this.sphereGeometry, this.material)
    this.mesh.frustumCulled = true
    // SphereGeometry puts its poles on ±Y while the group's local +Z is the body
    // pole (the IAU axis), so the sphere is rotated a quarter turn about X.
    this.mesh.rotation.x = Math.PI / 2
    this.frame.add(this.mesh)

    if (isStar) {
      const glowGeometry = new SphereGeometry(1, 32, 24)
      const glowMaterial = new ShaderMaterial({
        vertexShader: GLOW_VERTEX_SHADER,
        fragmentShader: GLOW_FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: new Vector3(1.0, 0.72, 0.32) },
          uIntensity: { value: 0.9 },
          uPower: { value: 2.2 },
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: BackSide,
      })
      this.glow = new Mesh(glowGeometry, glowMaterial)
      this.glow.scale.setScalar(1.28)
      this.frame.add(this.glow)
    }

    const atmosphere = ATMOSPHERES[this.body.id]
    if (atmosphere && !isStar) {
      const shellGeometry = new SphereGeometry(1, segments.width, segments.height)
      const shellMaterial = new ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX_SHADER,
        fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: new Vector3(((atmosphere.colour >> 16) & 0xff) / 255, ((atmosphere.colour >> 8) & 0xff) / 255, (atmosphere.colour & 0xff) / 255) },
          uSunDirection: { value: new Vector3(1, 0, 0) },
          uIntensity: { value: atmosphere.intensity },
        },
        transparent: true,
        depthWrite: false,
        side: BackSide,
      })
      this.atmosphere = new Mesh(shellGeometry, shellMaterial)
      this.atmosphere.scale.setScalar(atmosphere.factor)
      this.atmosphere.rotation.x = Math.PI / 2
      this.frame.add(this.atmosphere)
    }

    if (this.body.textures?.clouds) {
      const cloudGeometry = new SphereGeometry(1, segments.width, segments.height)
      // The cloud deck is lit, not a white unlit shell: without the solar term the
      // night side of the planet is covered by glowing clouds (P0-2).
      const cloudMaterial = new ShaderMaterial({
        vertexShader: PLANET_VERTEX_SHADER,
        fragmentShader: CLOUD_FRAGMENT_SHADER,
        uniforms: {
          uMap: { value: getNeutralMap() },
          uSunDirection: { value: new Vector3(1, 0, 0) },
          uOpacity: { value: 0.62 },
        },
        transparent: true,
        depthWrite: false,
      })
      this.clouds = new Mesh(cloudGeometry, cloudMaterial)
      this.clouds.scale.setScalar(1.012)
      this.clouds.rotation.x = Math.PI / 2
      this.clouds.visible = false
      this.frame.add(this.clouds)
    }

    if (this.body.rings) {
      const { innerRadiusFactor, outerRadiusFactor, opacity, texture } = this.body.rings
      const ringGeometry = new RingGeometry(innerRadiusFactor, outerRadiusFactor, tier === 'low' ? 48 : 128, 1)
      const ringMaterial = new MeshBasicMaterial({
        transparent: true,
        // Without an alpha map the annulus would read as a solid disc, so it starts
        // faint and only becomes the full ring once the texture has been applied.
        opacity: texture ? opacity : opacity * 0.22,
        side: DoubleSide,
        depthWrite: false,
        alphaTest: texture ? 0.02 : 0,
      })
      // RingGeometry lies in the XY plane, whose normal is +Z — the group's local
      // +Z is the body's pole, so the ring is already in the equatorial plane.
      this.rings = new Mesh(ringGeometry, ringMaterial)
      this.frame.add(this.rings)
    }

    // Restore any surface map that has already streamed in for this body.
    if (this.lastMaps) this.applyTextures(this.lastMaps)

    if (tier === 'point' || tier === 'low') {
      const markerGeometry = new BufferGeometry()
      markerGeometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))
      const markerMaterial = new PointsMaterial({
        // Screen-space size with depth testing off: a distant body stays a visible
        // dot instead of disappearing behind its own (sub-pixel) sphere.
        size: 4.5,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        color: 0xdfe9ff,
      })
      this.marker = new Points(markerGeometry, markerMaterial)
      this.marker.renderOrder = 4
      this.marker.frustumCulled = false
      this.frame.add(this.marker)
    }
  }

  private createSunMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: SUN_VERTEX_SHADER,
      fragmentShader: SUN_FRAGMENT_SHADER,
      uniforms: {
        uMap: { value: getNeutralMap() },
        uTime: { value: 0 },
        uColor: { value: new Vector3(1.0, 0.86, 0.62) },
      },
    })
  }

  private createPlanetMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: PLANET_VERTEX_SHADER,
      fragmentShader: PLANET_FRAGMENT_SHADER,
      uniforms: {
        uMap: { value: getNeutralMap() },
        uNightMap: { value: null },
        uNormalMap: { value: null },
        uSpecularMap: { value: null },
        uSunDirection: { value: new Vector3(1, 0, 0) },
        uHasNightMap: { value: 0 },
        uHasNormalMap: { value: 0 },
        uHasSpecularMap: { value: 0 },
        uSpecularStrength: { value: 0.55 },
        uAmbient: { value: 0.08 },
      },
    })
  }

  /** Applies loaded textures; called when the maps arrive and after every rebuild. */
  applyTextures(maps: ResolvedMaterialMaps): void {
    this.lastMaps = maps
    const material = this.material as ShaderMaterial | null
    if (!material) return
    if (material.uniforms?.uMap) {
      material.uniforms.uMap.value = maps.map ?? null
    }
    if (material.uniforms?.uNightMap) {
      material.uniforms.uNightMap.value = maps.nightMap ?? null
      material.uniforms.uHasNightMap.value = maps.nightMap ? 1 : 0
    }
    if (material.uniforms?.uNormalMap) {
      material.uniforms.uNormalMap.value = maps.normalMap ?? null
      material.uniforms.uHasNormalMap.value = maps.normalMap ? 1 : 0
    }
    if (material.uniforms?.uSpecularMap) {
      material.uniforms.uSpecularMap.value = maps.specularMap ?? null
      material.uniforms.uHasSpecularMap.value = maps.specularMap ? 1 : 0
    }
    if (this.clouds && maps.clouds) {
      const cloudMaterial = this.clouds.material as ShaderMaterial
      if (cloudMaterial.uniforms?.uMap) cloudMaterial.uniforms.uMap.value = maps.clouds as Texture
      cloudMaterial.needsUpdate = true
      this.cloudTextureApplied = true
    }
    if (this.rings && maps.ringMap) {
      const ringMaterial = this.rings.material as MeshBasicMaterial
      ringMaterial.map = maps.ringMap as Texture
      ringMaterial.alphaMap = maps.ringMap as Texture
      ringMaterial.alphaTest = 0.02
      // Restore the declared opacity now that the alpha mask is in place.
      ringMaterial.opacity = this.body.rings?.opacity ?? 0.9
      ringMaterial.needsUpdate = true
    }
    this.texturesApplied = true
  }

  /**
   * Frees GPU resources and detaches the visual from the scene graph.
   *
   * Removing the group from its parent matters: the engine drops every visual and
   * rebuilds them after a WebGL context restore, and a `dispose()` that only cleared
   * `frame.children` left 178 orphaned Groups behind on every restore (P1-3).
   */
  dispose(): void {
    this.disposeMeshes()
    this.frame.removeFromParent()
    this.group.removeFromParent()
    this.group.clear()
  }

  private disposeMeshes(): void {
    for (const child of [...this.frame.children]) {
      this.frame.remove(child)
      disposeObject(child)
    }
    this.mesh = null
    this.glow = null
    this.atmosphere = null
    this.clouds = null
    this.rings = null
    this.marker = null
    this.material = null
    this.sphereGeometry = null
    // `texturesApplied` is reset because the material is new; `lastMaps` is kept so
    // the rebuild path can restore the surface map.
    this.texturesApplied = false
    this.cloudTextureApplied = false
  }
}

function disposeObject(object: Object3D): void {
  const mesh = object as Mesh
  if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose()
  const material = mesh.material
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
  else if (material && typeof (material as { dispose?: unknown }).dispose === 'function') material.dispose()
}

export { mat3ToQuaternion }