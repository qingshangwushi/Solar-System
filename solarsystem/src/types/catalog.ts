/**
 * Data contracts shared by the astronomy layer, the engine and the UI.
 *
 * These mirror the JSON emitted by scripts/build-catalog.mjs. The application is
 * deliberately typed against the *catalog*, never against a specific data source,
 * so the pipeline can be re-run with new data without touching application code.
 */

export type CelestialType = 'star' | 'planet' | 'dwarfPlanet' | 'moon' | 'asteroid' | 'comet' | 'tno' | 'centaur' | 'spacecraft'

export type PositionModel = 'origin' | 'ephemeris' | 'kepler'

export type MinorBodyBucket = 'mainBelt' | 'nearEarth' | 'trojan' | 'centaur' | 'tno' | 'comet'

export type ReferencePlaneName = 'ecliptic' | 'laplace' | 'body-equator'

export interface PhysicalParameters {
  meanRadiusKm?: number | null
  equatorialRadiusKm?: number | null
  polarRadiusKm?: number | null
  massKg?: number | null
  densityKgM3?: number | null
  surfaceGravityMs2?: number | null
  escapeVelocityKmS?: number | null
  gmKm3S2?: number | null
  bondAlbedo?: number | null
  geometricAlbedo?: number | null
  flattening?: number | null
  absoluteMagnitude?: number | null
  radiusSource?: string
}

export interface RotationParameters {
  /** Sidereal rotation period, hours; negative means retrograde. */
  periodHours?: number | null
  axialTiltDeg?: number | null
  retrograde?: boolean
  synchronous?: boolean
}

export interface OrbitSummary {
  semiMajorAxisKm?: number | null
  semiMajorAxisAu?: number | null
  eccentricity?: number | null
  inclinationDeg?: number | null
  periodDays?: number | null
  perihelionKm?: number | null
  aphelionKm?: number | null
  meanOrbitalVelocityKmS?: number | null
  derivedPeriodDays?: number | null
  periodRelativeError?: number | null
  meanMotionRadPerDay?: number | null
  referencePlane?: ReferencePlaneName
}

export interface RingParameters {
  innerRadiusFactor: number
  outerRadiusFactor: number
  opacity: number
  texture?: string
  note?: string
}

export interface TextureSet {
  map?: string
  nightMap?: string
  clouds?: string
  normalMap?: string
  specularMap?: string
  ringMap?: string
}

export interface DiscoveryRecord {
  date?: string | null
  discoverer?: string
  note?: string
}

export interface KeplerElementsRecord {
  semiMajorAxisKm?: number
  semiMajorAxisAu?: number
  eccentricity: number
  inclinationDeg: number
  longitudeAscendingNodeDeg: number
  argumentOfPeriapsisDeg: number
  meanAnomalyDeg?: number
  epochJD?: number
  epochMjd?: number
  perihelionJD?: number | null
  perihelionDistanceAu?: number
  periodDays?: number
  referencePlane?: ReferencePlaneName
  retrograde?: boolean
  phaseSource?: 'jpl-mean-elements' | 'convention'
}

export interface PlanetOrientationRecord {
  poleRaDeg: number
  poleDecDeg: number
  rotationPhaseSource: string
}

export interface CelestialBody {
  id: string
  name: string
  nameZh?: string | null
  officialName?: string | null
  aliases?: string[]
  type: CelestialType
  parentId: string | null
  positionModel: PositionModel
  ephemeris?: { body: string; center: 'sun' | 'geocentric' }
  elements?: KeplerElementsRecord
  physical: PhysicalParameters
  rotation: RotationParameters
  orientation?: PlanetOrientationRecord
  orbitSummary?: OrbitSummary
  rings?: RingParameters | null
  textures?: TextureSet | null
  discovery?: DiscoveryRecord | null
  documentedSatelliteCount?: number
  source: string
  /** When the values above were retrieved from the cited source. */
  sourceUpdatedAt?: string
}

export interface MinorBodyRecord {
  id: string
  name: string
  fullName: string
  /** Chinese designation, when one exists (dwarf planets and notable comets). */
  nameZh?: string | null
  /** Catalogue number, when the object has one (e.g. 136199 for Eris). */
  number?: string | null
  bucket: MinorBodyBucket
  classCode: string | null
  classLabel: string
  isNeo: boolean
  isPha: boolean
  notable: boolean
  absoluteMagnitude: number | null
  diameterKm: number | null
  perihelionDistanceAu: number | null
  aphelionDistanceAu: number | null
  eccentricity: number
  periodDays: number | null
  argumentOfPeriapsisDeg: number | null
  longitudeAscendingNodeDeg: number | null
  inclinationDeg: number | null
  meanAnomalyDeg: number | null
  epochMjd: number | null
  perihelionJD: number | null
  semiMajorAxisAu: number | null
  rotationPeriodHours: number | null
  albedo: number | null
  firstObservation: string | null
  moidAu: number | null
}

export interface StarfieldManifest {
  binary: string
  manifest: string
  stride: number
  layout: string[]
  limitingMagnitude: number
  count: number
  source: string
  license: string
}

export interface ValidationCheck {
  name: string
  description: string
  passed: boolean
  [key: string]: unknown
}

export interface CatalogStatistics {
  totalBodies: number
  renderedBodies: number
  minorBodies: number
  byType: Record<string, number>
  minorBodiesByBucket: Record<string, number>
  satellitesByParent: Record<string, number>
  hyperbolicMinorBodies: number
  stars: number
  namedStars: number
}

export interface SolarSystemCatalog {
  version: string
  generatedAt: string
  conventions: Record<string, string>
  sources: string[]
  statistics: CatalogStatistics
  starfield: StarfieldManifest
  satellitesWithPublishedPhase: number
  bodies: CelestialBody[]
  validation: { checks: ValidationCheck[]; warnings: string[] }
}

export interface MinorBodyIndex {
  version: string
  source: string
  counts: { total: number; byQuery: Record<string, number>; byBucket: Record<string, number> }
  binary: { file: string; stride: number; layout: string[] }
  objects: MinorBodyRecord[]
}

export interface StarManifest {
  source: string
  license: string
  limitingMagnitude: number
  counts: { scanned: number; exported: number; named: number }
  binary: { file: string; stride: number; layout: string[] }
  namedStars: Array<{
    name: string
    bayer: string | null
    constellation: string | null
    magnitude: number
    raRad: number
    decRad: number
    colorIndex: number
    spectralType: string | null
    distanceParsec: number | null
  }>
}

export interface CatalogManifest {
  version: string
  generatedAt: string
  /** When the upstream datasets were retrieved, so the data age is auditable. */
  sourceUpdatedAt?: string
  /** File name (inside `data/catalog/`) of the versioned catalog artefact. */
  catalogFile?: string
  files: Array<{ path: string; role: string }>
  statistics: CatalogStatistics
  validation: { passed: boolean; checks: Array<{ name: string; passed: boolean }> }
  appConfig: string
}

/** Exhibition configuration, loaded from exhibition.config.json at runtime. */
export interface ExhibitionConfig {
  language: 'zh-CN' | 'en-US'
  autoDemo: boolean
  autoDemoDelaySeconds: number
  defaultTarget: string
  defaultScaleMode: 'scientific' | 'visible' | 'exhibition'
  defaultQuality: 'ultra' | 'high' | 'medium' | 'performance'
  enableScientificMode: boolean
  enableMinorPlanets: boolean
  enableStarfield: boolean
  enableAutoDemo: boolean
  guidedTourOnIdle: boolean
  showPerformanceOverlay: boolean
  uiScale: number
  reducedMotion: boolean
  title: { zh: string; en: string }
  subtitle: { zh: string; en: string }
}