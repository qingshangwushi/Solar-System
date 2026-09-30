/**
 * Exhibition configuration, guided-tour data and scale-model tests (sections 55, 31, 12, 59).
 *
 * These are the framework-free layers behind the settings panel, the tour player and
 * the on-screen scale disclosure. The config merge is tested with missing, wrong-typed
 * and corrupt input because a museum technician editing `exhibition.config.json` must
 * never be able to break the installation.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXHIBITION_CONFIG,
  loadExhibitionConfig,
  mergeExhibitionConfig,
} from '../../data/ConfigLoader'
import { AUTO_DEMO_STOPS, TOUR_STOPS } from '../../data/Tour'
import {
  MIN_BODY_RADIUS_UNITS,
  SCALE_MODES,
  createScaleTransform,
  formatMagnification,
  satelliteSystemFactor,
} from '../../data/ScaleModel'
import { AU_KM } from '../../astronomy/Units'
import type { CatalogManifest, SolarSystemCatalog } from '../../types/catalog'

describe('exhibition config merge', () => {
  it('falls back to the defaults for missing input', () => {
    expect(mergeExhibitionConfig(undefined)).toEqual(DEFAULT_EXHIBITION_CONFIG)
    expect(mergeExhibitionConfig(null)).toEqual(DEFAULT_EXHIBITION_CONFIG)
    expect(mergeExhibitionConfig({})).toEqual(DEFAULT_EXHIBITION_CONFIG)
  })

  it('rejects a non-object payload (corrupt JSON)', () => {
    expect(mergeExhibitionConfig('{not json')).toEqual(DEFAULT_EXHIBITION_CONFIG)
    expect(mergeExhibitionConfig(42)).toEqual(DEFAULT_EXHIBITION_CONFIG)
    expect(mergeExhibitionConfig(true)).toEqual(DEFAULT_EXHIBITION_CONFIG)
  })

  it('accepts valid overrides', () => {
    const merged = mergeExhibitionConfig({
      language: 'en-US',
      defaultTarget: 'mars',
      defaultScaleMode: 'scientific',
      defaultQuality: 'ultra',
      enableMinorPlanets: false,
      uiScale: 1.25,
      title: { zh: '自定义展项', en: 'Custom exhibition' },
    })
    expect(merged.language).toBe('en-US')
    expect(merged.defaultTarget).toBe('mars')
    expect(merged.defaultScaleMode).toBe('scientific')
    expect(merged.defaultQuality).toBe('ultra')
    expect(merged.enableMinorPlanets).toBe(false)
    expect(merged.uiScale).toBe(1.25)
    expect(merged.title.zh).toBe('自定义展项')
    expect(merged.subtitle).toEqual(DEFAULT_EXHIBITION_CONFIG.subtitle)
  })

  it('ignores wrong-typed fields and clamps numeric ranges', () => {
    const merged = mergeExhibitionConfig({
      language: 'fr-FR',
      defaultScaleMode: 'cinematic',
      defaultQuality: 'insane',
      uiScale: 99,
      autoDemoDelaySeconds: '150',
      enableStarfield: 'yes',
      title: 'plain string',
    })
    expect(merged.language).toBe('zh-CN')
    expect(merged.defaultScaleMode).toBe(DEFAULT_EXHIBITION_CONFIG.defaultScaleMode)
    expect(merged.defaultQuality).toBe(DEFAULT_EXHIBITION_CONFIG.defaultQuality)
    expect(merged.uiScale).toBe(2)
    expect(merged.autoDemoDelaySeconds).toBe(DEFAULT_EXHIBITION_CONFIG.autoDemoDelaySeconds)
    expect(merged.enableStarfield).toBe(DEFAULT_EXHIBITION_CONFIG.enableStarfield)
    expect(merged.title).toEqual(DEFAULT_EXHIBITION_CONFIG.title)
    expect(mergeExhibitionConfig({ uiScale: 0.1 }).uiScale).toBe(0.75)
  })

  it('keeps the installation usable when the config file cannot be fetched', async () => {
    // No server is running in the test process, so this exercises the real failure
    // path: the loader must resolve with the defaults instead of throwing.
    const result = await loadExhibitionConfig()
    expect(result.loaded).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.config).toEqual(DEFAULT_EXHIBITION_CONFIG)
  })
})

describe('guided tour data', () => {
  const catalogDir = resolve(process.cwd(), 'public/data/catalog')
  const manifest = JSON.parse(readFileSync(resolve(catalogDir, 'manifest.json'), 'utf8')) as CatalogManifest
  const catalog = JSON.parse(readFileSync(resolve(catalogDir, manifest.catalogFile!), 'utf8')) as SolarSystemCatalog
  const bodyIds = new Set(catalog.bodies.map((body) => body.id))
  const buckets = new Set(Object.keys(catalog.statistics.minorBodiesByBucket))

  it('has unique stop ids and non-empty bilingual narration', () => {
    const ids = TOUR_STOPS.map((stop) => stop.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const stop of TOUR_STOPS) {
      expect(stop.title.zh.length).toBeGreaterThan(0)
      expect(stop.title.en.length).toBeGreaterThan(0)
      expect(stop.narration.zh.length).toBeGreaterThan(0)
      expect(stop.narration.en.length).toBeGreaterThan(0)
      expect(stop.timeScale).toBeGreaterThan(0)
    }
  })

  it('only flies to bodies that exist in the generated catalog', () => {
    for (const stop of TOUR_STOPS) {
      if (stop.targetId === null) {
        expect(stop.special).toBeDefined()
        continue
      }
      expect(bodyIds.has(stop.targetId), `tour target ${stop.targetId} is not in the catalog`).toBe(true)
    }
  })

  it('only references layer filters that the catalog actually has', () => {
    for (const stop of TOUR_STOPS) {
      for (const filter of stop.filters ?? []) {
        expect(buckets.has(filter), `tour filter ${filter} is not a catalog bucket`).toBe(true)
      }
    }
  })

  it('draws the auto demo from the tour stops', () => {
    const ids = new Set(TOUR_STOPS.map((stop) => stop.id))
    for (const id of AUTO_DEMO_STOPS) expect(ids.has(id)).toBe(true)
  })
})

describe('scale model', () => {
  it('documents all three modes', () => {
    expect(Object.keys(SCALE_MODES).sort()).toEqual(['exhibition', 'scientific', 'visible'])
    expect(SCALE_MODES.scientific.distanceIsTrue).toBe(true)
    expect(SCALE_MODES.scientific.radiusIsTrue).toBe(true)
    expect(SCALE_MODES.exhibition.distanceIsTrue).toBe(false)
  })

  it('keeps scientific scale truthful and linear', () => {
    const scale = createScaleTransform('scientific')
    expect(scale.isLinear).toBe(true)
    expect(scale.distanceKmToUnits(1_000)).toBe(1)
    expect(scale.radiusKmToUnits(6_371)).toBeCloseTo(6.371, 12)
    expect(scale.radiusMagnification(6_371)).toBe(1)
    expect(scale.radiusKmToUnits(0)).toBe(MIN_BODY_RADIUS_UNITS)
  })

  it('keeps visible distances linear but enlarges the radii', () => {
    const scale = createScaleTransform('visible')
    expect(scale.isLinear).toBe(true)
    expect(scale.distanceKmToUnits(AU_KM)).toBeCloseTo(AU_KM / 1_000, 6)
    expect(scale.radiusMagnification(6_371)).toBeGreaterThan(1)
  })

  it('maps exhibition distances non-linearly and inverts the mapping', () => {
    const scale = createScaleTransform('exhibition')
    expect(scale.isLinear).toBe(false)
    const oneAu = scale.distanceKmToUnits(AU_KM)
    expect(oneAu).not.toBeCloseTo(AU_KM / 1_000, 3)
    expect(scale.unitsToDistanceKm(oneAu)).toBeCloseTo(AU_KM, 3)
    expect(scale.radiusMagnification(6_371)).toBeGreaterThan(1)
    // The Sun is granted a smaller gain than the planets so the inner orbits clear it.
    expect(scale.radiusMagnification(695_700, 'star')).toBeLessThan(scale.radiusMagnification(6_371, 'planet'))
  })

  it('round-trips position vectors through the scene frame', () => {
    const vector = { x: 1.2e8, y: -3.4e7, z: 5.6e6 }
    for (const mode of ['scientific', 'visible', 'exhibition'] as const) {
      const scale = createScaleTransform(mode)
      const units = scale.positionKmToUnits(vector)
      const back = scale.unitsToKmVector(units)
      expect(back.x).toBeCloseTo(vector.x, 3)
      expect(back.y).toBeCloseTo(vector.y, 3)
      expect(back.z).toBeCloseTo(vector.z, 3)
    }
  })

  it('only enlarges a satellite system when it would collide with its parent', () => {
    // 384 400 km at the linear factor is 384.4 units, far outside a 4-radius budget.
    expect(satelliteSystemFactor(384_400, 6.371, 1 / 1_000)).toBe(1)
    // A hypothetical moon 10 km from a 6.371-unit parent must be pushed out.
    expect(satelliteSystemFactor(0.01, 6.371, 1 / 1_000)).toBeGreaterThan(1)
  })

  it('formats the magnification disclosure in both languages', () => {
    expect(formatMagnification(1, 'zh-CN')).toBe('真实尺寸')
    expect(formatMagnification(1, 'en-US')).toBe('true size')
    expect(formatMagnification(12.34, 'zh-CN')).toBe('×12.3 放大')
    expect(formatMagnification(Number.NaN, 'zh-CN')).toBe('—')
  })
})
