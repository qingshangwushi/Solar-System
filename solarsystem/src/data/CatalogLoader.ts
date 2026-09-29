/**
 * Catalog loading.
 *
 * One entry point assembles everything the engine needs and reports *real*
 * progress (assets completed, not a synthetic percentage). Failures are surfaced
 * with their cause and the caller decides the degradation strategy, so a missing
 * minor-body payload still leaves the eight planets fully usable.
 */
import type {
  CatalogManifest,
  CelestialBody,
  CelestialType,
  SolarSystemCatalog,
  StarManifest,
} from '../types/catalog'
import type { PlanetElementDataset } from '../astronomy/PlanetElements'
import { MinorBodyStore, loadMinorBodies } from './MinorBodyStore'
import { dataUrl } from './ConfigLoader'

export interface LoadProgress {
  stage: string
  message: string
  loaded: number
  total: number
}

export interface LoadedCatalog {
  catalog: SolarSystemCatalog
  manifest: CatalogManifest
  bodies: CelestialBody[]
  bodyById: Map<string, CelestialBody>
  childrenByParent: Map<string, CelestialBody[]>
  minorBodies: MinorBodyStore | null
  minorBodiesError?: string
  starManifest: StarManifest
  stars: Float32Array
  planetElements: PlanetElementDataset
  starfieldEnabled: boolean
}

/** Step definitions, in the order shown on the loading screen. */
const LOAD_STEPS: Array<{ stage: string; zh: string; en: string }> = [
  { stage: 'manifest', zh: '校验数据版本', en: 'Verifying data version' },
  { stage: 'catalog', zh: '加载太阳系目录', en: 'Loading solar-system catalog' },
  { stage: 'planetElements', zh: '加载行星轨道根数', en: 'Loading planetary elements' },
  { stage: 'starfield', zh: '加载恒星背景目录', en: 'Loading stellar background' },
  { stage: 'minorBodies', zh: '构建小天体轨道数据库', en: 'Building minor-body orbit database' },
]

async function fetchJson<T>(relativePath: string): Promise<T> {
  const response = await fetch(dataUrl(relativePath))
  if (!response.ok) throw new Error(`${relativePath}: HTTP ${response.status}`)
  return (await response.json()) as T
}

export async function loadCatalog(options: {
  enableMinorPlanets: boolean
  enableStarfield: boolean
  onProgress?: (progress: LoadProgress) => void
}): Promise<LoadedCatalog> {
  const { onProgress } = options
  const total = LOAD_STEPS.length
  let completed = 0
  const report = (stage: string, zh: string, en: string, extra?: Partial<LoadProgress>) => {
    onProgress?.({ stage, message: zh, loaded: completed, total, ...extra })
    void en
  }
  const done = (stage: string, zh: string, en: string) => {
    completed += 1
    report(stage, zh, en)
  }

  report('manifest', LOAD_STEPS[0].zh, LOAD_STEPS[0].en)
  const manifest = await fetchJson<CatalogManifest>('data/catalog/manifest.json')
  done('manifest', LOAD_STEPS[0].zh, LOAD_STEPS[0].en)

  report('catalog', LOAD_STEPS[1].zh, LOAD_STEPS[1].en)
  const catalog = await fetchJson<SolarSystemCatalog>('data/catalog/catalog.json')
  const bodies = catalog.bodies
  const bodyById = new Map(bodies.map((body) => [body.id, body]))
  const childrenByParent = new Map<string, CelestialBody[]>()
  for (const body of bodies) {
    if (!body.parentId) continue
    const list = childrenByParent.get(body.parentId) ?? []
    list.push(body)
    childrenByParent.set(body.parentId, list)
  }
  done('catalog', LOAD_STEPS[1].zh, LOAD_STEPS[1].en)

  report('planetElements', LOAD_STEPS[2].zh, LOAD_STEPS[2].en)
  const planetElements = await fetchJson<PlanetElementDataset>('data/catalog/planet-elements.json')
  done('planetElements', LOAD_STEPS[2].zh, LOAD_STEPS[2].en)

  let starManifest: StarManifest = {
    source: 'unavailable',
    license: '',
    limitingMagnitude: 0,
    counts: { scanned: 0, exported: 0, named: 0 },
    binary: { file: 'stars/stars.bin', stride: 4, layout: [] },
    namedStars: [],
  }
  let stars = new Float32Array(0)
  if (options.enableStarfield) {
    report('starfield', LOAD_STEPS[3].zh, LOAD_STEPS[3].en)
    try {
      starManifest = await fetchJson<StarManifest>('data/stars/stars.json')
      const response = await fetch(dataUrl('data/stars/stars.bin'))
      if (!response.ok) throw new Error(`stars.bin: HTTP ${response.status}`)
      stars = new Float32Array(await response.arrayBuffer())
    } catch (error) {
      // The star layer is decorative for the science content, so a failure here
      // degrades to "no stars" rather than blocking the exhibition.
      console.warn('starfield unavailable', error)
      stars = new Float32Array(0)
    }
    done('starfield', LOAD_STEPS[3].zh, LOAD_STEPS[3].en)
  }

  let minorBodies: MinorBodyStore | null = null
  let minorBodiesError: string | undefined
  if (options.enableMinorPlanets) {
    report('minorBodies', LOAD_STEPS[4].zh, LOAD_STEPS[4].en)
    try {
      minorBodies = await loadMinorBodies('data/catalog/minor-bodies.json', 'data/catalog/minor-bodies.bin', (progress) => {
        onProgress?.({
          stage: 'minorBodies',
          message: `${LOAD_STEPS[4].zh} (${progress.loaded}/${progress.total})`,
          loaded: completed + progress.loaded / progress.total,
          total,
        })
      })
    } catch (error) {
      minorBodiesError = String(error)
      console.warn('minor-body catalog unavailable', error)
    }
    done('minorBodies', LOAD_STEPS[4].zh, LOAD_STEPS[4].en)
  }

  return {
    catalog,
    manifest,
    bodies,
    bodyById,
    childrenByParent,
    minorBodies,
    minorBodiesError,
    starManifest,
    stars,
    planetElements,
    starfieldEnabled: stars.length > 0,
  }
}

/** Type helpers used across the engine and the UI. */
export function isSolarSystemBody(type: CelestialType): boolean {
  return type === 'star' || type === 'planet' || type === 'dwarfPlanet' || type === 'moon'
}

export function bodyDisplayName(body: CelestialBody, locale: 'zh-CN' | 'en-US'): string {
  if (locale === 'zh-CN' && body.nameZh) return body.nameZh
  return body.name
}