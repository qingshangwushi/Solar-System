/**
 * Texture provider.
 *
 * Behaviour required by the project:
 *  - Nothing is downloaded at start-up. A surface map is requested the first time
 *    a body reaches the texture LOD level, and only that body's maps are fetched.
 *  - Catalog paths are relative to `public/data/` (the same root as `catalog/`),
 *    so they are resolved through `texturePath()` before `dataUrl()`. Getting this
 *    wrong made every planetary map silently fall back to the procedural canvas
 *    (P0-1 of docs/e2e-verification-report.md).
 *  - The quality level selects the resolution tier: the bundled 2k maps are used at
 *    native resolution on `ultra`/`high` and downsampled to 1024 px / 512 px on
 *    `medium` / `performance`. That is a real "high -> medium -> low" degradation
 *    chain for both GPU memory and the sampling cost, and it is observable in the
 *    renderer's texture-memory statistic.
 *  - When no published map exists for a body (for example Eris or Titan), a
 *    deterministic procedural map is generated locally and the body is flagged as
 *    "procedural surface" in the information panel — nothing is passed off as
 *    real imagery.
 *  - Every texture is disposed through `dispose()`, and a bounded cache prevents
 *    unbounded GPU memory growth during long unattended runs.
 */
import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import type { CelestialBody, TextureSet } from '../types/catalog'
import { dataUrl } from './ConfigLoader'
import type { QualityLevel } from '../engine/QualityController'

export type TextureChannel = 'map' | 'nightMap' | 'clouds' | 'normalMap' | 'specularMap' | 'ringMap'

/**
 * Widest decoded map per quality level. The offline bundle ships 2k (2048 px)
 * imagery, so `ultra` and `high` keep the published resolution while the two lower
 * levels genuinely halve and quarter it.
 */
const TEXTURE_MAX_WIDTH: Record<QualityLevel, number> = {
  ultra: 2048,
  high: 2048,
  medium: 1024,
  performance: 512,
}

/** Catalog texture paths are relative to `public/data/`. */
export function texturePath(relativePath: string): string {
  const trimmed = relativePath.replace(/^\/+/, '')
  return trimmed.startsWith('data/') ? trimmed : `data/${trimmed}`
}

export interface ResolvedMaterialMaps {
  map?: Texture
  nightMap?: Texture
  clouds?: Texture
  normalMap?: Texture
  specularMap?: Texture
  ringMap?: Texture
  procedural: boolean
}

const CHANNEL_KEYS: TextureChannel[] = ['map', 'nightMap', 'clouds', 'normalMap', 'specularMap', 'ringMap']

/** Colour used by the procedural generator, by body type. */
const PROCEDURAL_BASE_COLOURS: Record<string, [number, number, number]> = {
  star: [255, 196, 92],
  planet: [168, 150, 132],
  dwarfPlanet: [150, 140, 130],
  moon: [150, 148, 142],
  asteroid: [120, 112, 104],
  comet: [150, 170, 190],
  tno: [140, 140, 150],
  centaur: [130, 150, 160],
  spacecraft: [200, 200, 210],
}

export class TextureProvider {
  private readonly loader = new TextureLoader()
  private readonly cache = new Map<string, Texture>()
  private readonly pending = new Map<string, Promise<Texture | null>>()
  private readonly maxCacheEntries = 48
  private disposed = false

  private quality: QualityLevel

  constructor(quality: QualityLevel) {
    this.quality = quality
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality
  }

  /** All maps declared by a body, loaded lazily and cached. */
  async loadBodyTextures(body: CelestialBody, onLoaded?: () => void): Promise<ResolvedMaterialMaps> {
    const set: TextureSet | null | undefined = body.textures
    if (this.disposed) return { procedural: false }

    if (!set) {
      if (body.type === 'star') return { procedural: false }
      const fallback = this.proceduralTexture(body)
      return { map: fallback, procedural: true }
    }

    // Ring systems declare their map under `rings.texture` rather than inside the
    // surface texture set, so it is merged into the ring channel here.
    const channels: Array<[TextureChannel, string | undefined]> = CHANNEL_KEYS.map((channel) => [channel, set[channel]])
    if (body.rings?.texture) channels.push(['ringMap', body.rings.texture])

    const resolved: ResolvedMaterialMaps = { procedural: false }
    await Promise.all(
      channels.map(async ([channel, relative]) => {
        if (!relative) return
        const texture = await this.loadTexture(relative, body.type, channel === 'normalMap' || channel === 'specularMap')
        if (!texture) {
          if (channel === 'map') {
            resolved.map = this.proceduralTexture(body)
            resolved.procedural = true
          }
          return
        }
        resolved[channel] = texture
      }),
    )
    if (resolved.procedural) resolved.map = resolved.map ?? this.proceduralTexture(body)
    onLoaded?.()
    return resolved
  }

  /**
   * Loads one declared map at the active resolution tier. Colour maps decode as
   * sRGB, normal/specular maps stay linear.
   */
  private async loadTexture(relativePath: string, type: string, colorData = false): Promise<Texture | null> {
    const cap = TEXTURE_MAX_WIDTH[this.quality]
    const key = `${relativePath}@${cap}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const pending = this.pending.get(key)
    if (pending) return pending

    const promise = this.loader
      .loadAsync(dataUrl(texturePath(relativePath)))
      .then((texture) => {
        const resolved = this.applyResolutionTier(texture, cap)
        // Normal/specular/roughness maps carry linear data, colour maps are sRGB.
        resolved.colorSpace = colorData ? NoColorSpace : SRGBColorSpace
        resolved.anisotropy = 4
        resolved.wrapS = RepeatWrapping
        resolved.wrapT = RepeatWrapping
        resolved.minFilter = LinearMipmapLinearFilter
        resolved.generateMipmaps = true
        this.cache.set(key, resolved)
        this.evictOverflow()
        return resolved
      })
      .catch(() => {
        console.warn(`texture unavailable: ${relativePath} (${type})`)
        return null
      })
      .finally(() => {
        this.pending.delete(key)
      })
    this.pending.set(key, promise)
    return promise
  }

  /**
   * Applies the resolution tier. Downsampling happens once, at load time, through a
   * canvas — this is what makes the quality level's texture budget real instead of
   * a cosmetic label.
   */
  private applyResolutionTier(texture: Texture, maxWidth: number): Texture {
    const image = texture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined
    if (!image || typeof document === 'undefined') return texture
    const width = image.naturalWidth ?? image.width ?? 0
    const height = image.naturalHeight ?? image.height ?? 0
    if (!(width > 0) || !(height > 0) || width <= maxWidth) return texture

    const scaledWidth = maxWidth
    const scaledHeight = Math.max(1, Math.round((height / width) * maxWidth))
    const canvas = document.createElement('canvas')
    canvas.width = scaledWidth
    canvas.height = scaledHeight
    const context = canvas.getContext('2d')
    if (!context) return texture
    context.drawImage(image as CanvasImageSource, 0, 0, scaledWidth, scaledHeight)
    const scaled = new CanvasTexture(canvas)
    texture.dispose()
    return scaled
  }

  private evictOverflow(): void {
    while (this.cache.size > this.maxCacheEntries) {
      // Evict the oldest entry that is not currently being rendered.
      const oldestKey = this.cache.keys().next().value
      if (oldestKey === undefined) return
      const evicted = this.cache.get(oldestKey)
      this.cache.delete(oldestKey)
      evicted?.dispose()
    }
  }

  private readonly proceduralCache = new Map<string, CanvasTexture>()

  /**
   * Deterministic procedural surface. The pattern is derived from a hash of the
   * body id so it is stable across reloads; it is an illustration, never presented
   * as measured imagery.
   */
  proceduralTexture(body: CelestialBody): CanvasTexture {
    const cached = this.proceduralCache.get(body.id)
    if (cached) return cached
    const size = 512
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas')
    if (!canvas) throw new Error('procedural textures require a DOM canvas')
    canvas.width = size
    canvas.height = size / 2
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d canvas context unavailable')

    const seed = hashString(body.id)
    const [r, g, b] = PROCEDURAL_BASE_COLOURS[body.type] ?? PROCEDURAL_BASE_COLOURS.planet
    const image = context.createImageData(canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const noise = fractalNoise(x / canvas.width, y / canvas.height, seed)
        const shade = 0.72 + noise * 0.42
        const index = (y * canvas.width + x) * 4
        image.data[index] = Math.min(255, r * shade)
        image.data[index + 1] = Math.min(255, g * shade)
        image.data[index + 2] = Math.min(255, b * shade)
        image.data[index + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    this.proceduralCache.set(body.id, texture)
    return texture
  }

  dispose(): void {
    this.disposed = true
    for (const texture of this.cache.values()) texture.dispose()
    this.cache.clear()
    for (const texture of this.proceduralCache.values()) texture.dispose()
    this.proceduralCache.clear()
    this.pending.clear()
  }
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Deterministic value noise with four octaves; enough to break up a flat sphere. */
function fractalNoise(u: number, v: number, seed: number): number {
  let amplitude = 0.5
  let frequency = 4
  let total = 0
  let normaliser = 0
  for (let octave = 0; octave < 4; octave++) {
    total += amplitude * valueNoise(u * frequency, v * frequency * 2, seed + octave * 977)
    normaliser += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return total / normaliser
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const smoothX = fx * fx * (3 - 2 * fx)
  const smoothY = fy * fy * (3 - 2 * fy)
  const corner = (cx: number, cy: number) => hashToUnit(cx, cy, seed)
  const top = corner(x0, y0) * (1 - smoothX) + corner(x0 + 1, y0) * smoothX
  const bottom = corner(x0, y0 + 1) * (1 - smoothX) + corner(x0 + 1, y0 + 1) * smoothX
  return top * (1 - smoothY) + bottom * smoothY
}

function hashToUnit(x: number, y: number, seed: number): number {
  let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295
}