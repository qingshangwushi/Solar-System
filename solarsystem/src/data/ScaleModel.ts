/**
 * Scale model.
 *
 * The solar system spans ~13 orders of magnitude in distance and ~7 in radius, so
 * no single linear mapping can both stay scientifically truthful and remain
 * readable on an exhibition screen. Three explicitly named modes are provided and
 * the active mode is always shown in the HUD; every non-real proportion is
 * disclosed in the UI and in the information panel (per-object magnification).
 *
 *  - scientific : 1 scene unit = 1000 km for BOTH distance and radius. Nothing is
 *                 exaggerated; planets really are sub-pixel at overview range.
 *  - visible    : distances stay linear (1 unit = 1000 km) but radii follow a
 *                 compressive power law so that a planet stays visible next to the
 *                 Sun. Clearly marked as "visual enhancement".
 *  - exhibition : non-linear distance mapping (square root below 50 au, then
 *                 logarithmic) so Mercury through the Kuiper belt fit into a single
 *                 view, with a stronger radius compression. Clearly marked as
 *                 "non-linear distance mapping".
 *
 * Two derived quantities are needed by the engine:
 *  - `localScaleFactorKmToUnits` : the derivative of the mapping at a given
 *    heliocentric distance, used for the parent-relative offsets of satellite
 *    systems (a non-linear mapping has no global "km per unit");
 *  - `orbitalClearanceUnits` : a per-parent budget that keeps a satellite system
 *    from collapsing inside the planet it orbits.
 */
import { AU_KM } from '../astronomy/Units'
import type { Vec3 } from '../astronomy/Coordinates'

export type ScaleMode = 'scientific' | 'visible' | 'exhibition'

/** Body classes the radius law distinguishes. The Sun is capped separately so that
 *  it never swallows the inner orbits. */
export type RadiusClass = 'star' | 'planet' | 'dwarfPlanet' | 'moon' | 'minor'

export interface ScaleModeInfo {
  id: ScaleMode
  labelZh: string
  labelEn: string
  descriptionZh: string
  descriptionEn: string
  distanceIsTrue: boolean
  radiusIsTrue: boolean
}

export const SCALE_MODES: Record<ScaleMode, ScaleModeInfo> = {
  scientific: {
    id: 'scientific',
    labelZh: '科学尺度',
    labelEn: 'Scientific',
    descriptionZh: '距离与半径均为真实比例（1 场景单位 = 1000 km）。',
    descriptionEn: 'True distances and true radii (1 scene unit = 1000 km).',
    distanceIsTrue: true,
    radiusIsTrue: true,
  },
  visible: {
    id: 'visible',
    labelZh: '科普尺度',
    labelEn: 'Visible',
    descriptionZh: '轨道距离保持真实，天体半径按压缩幂律放大以便观察；卫星系统在母天体附近按比例增强。',
    descriptionEn: 'True orbital distances; body radii are compressively enlarged, and satellite systems are proportionally enhanced around their parent.',
    distanceIsTrue: true,
    radiusIsTrue: false,
  },
  exhibition: {
    id: 'exhibition',
    labelZh: '展览尺度',
    labelEn: 'Exhibition',
    descriptionZh: '距离使用非线性映射（50 AU 内按平方根，之外按对数），半径进一步放大。',
    descriptionEn: 'Non-linear distance mapping (square root inside 50 au, logarithmic beyond) with further radius enlargement.',
    distanceIsTrue: false,
    radiusIsTrue: false,
  },
}

/** 1 scene unit = 1000 km in the linear modes. */
const KM_PER_UNIT = 1000
/**
 * Exhibition distance mapping, in scene units:
 *   r <= 50 au : units = SQRT_COEFFICIENT * sqrt(r_km)
 *   r >  50 au : units = boundary + LOG_COEFFICIENT * ln(r_km / boundary_km)
 * Calibrated so that 1 au -> ~1712 units, Mercury -> ~1066 units (comfortably
 * outside the Sun's rendered radius), Neptune -> ~1.3e4 units and the Kuiper belt
 * edge stays inside a ~1.7e4-unit overview.
 */
const EXHIBITION_SQRT_COEFFICIENT = 0.14
const EXHIBITION_LOG_COEFFICIENT = 2400
const EXHIBITION_LINEAR_LIMIT_KM = 50 * AU_KM
const EARTH_RADIUS_REFERENCE_KM = 6371
/** Compression exponent: smaller means stronger compression (the Sun shrinks most). */
const POWER_LAW_EXPONENT = 0.45
const VISIBLE_RADIUS_GAIN = 12
/** In the exhibit scale the Sun is granted a small gain so the inner orbits stay clear. */
const EXHIBITION_RADIUS_GAIN: Record<RadiusClass, number> = {
  star: 4,
  planet: 14,
  dwarfPlanet: 14,
  moon: 14,
  minor: 14,
}
/**
 * A satellite system is never allowed to collapse inside its planet: the innermost
 * moon of a parent is placed at least this many parent radii away. The whole system
 * is scaled by one factor per parent, so the relative spacing of the moons is
 * preserved exactly.
 */
const SATELLITE_CLEARANCE_FACTOR = 4
/** Minimum rendered radius so an object never collapses to a degenerate sphere. */
export const MIN_BODY_RADIUS_UNITS = 0.02

export interface ScaleTransform {
  mode: ScaleMode
  /** Kilometres (as a vector) -> scene units, preserving direction. */
  positionKmToUnits(vector: Vec3): Vec3
  /** Radial distance in km -> scene units. */
  distanceKmToUnits(km: number): number
  /** Radial distance in scene units -> km (the inverse map, needed by the camera). */
  unitsToDistanceKm(units: number): number
  /** Render-unit vector -> kilometres, preserving the direction from the origin. */
  unitsToKmVector(units: Vec3): Vec3
  /** Local derivative of the distance mapping, units per km, at a heliocentric distance. */
  localScaleFactorKmToUnits(heliocentricKm: number): number
  /** Body radius in km -> scene units, for a given class of body. */
  radiusKmToUnits(km: number, radiusClass?: RadiusClass): number
  /** How much a body's radius was enlarged relative to the truthful mapping. */
  radiusMagnification(km: number, radiusClass?: RadiusClass): number
  /** true when the mapping is a pure uniform scale, so lengths/directions are exact. */
  isLinear: boolean
}

function scaleVec(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }
}

function linearUnits(km: number): number {
  return km / KM_PER_UNIT
}

function exhibitionUnits(km: number): number {
  const magnitude = Math.abs(km)
  if (magnitude <= EXHIBITION_LINEAR_LIMIT_KM) {
    return EXHIBITION_SQRT_COEFFICIENT * Math.sqrt(magnitude)
  }
  return (
    EXHIBITION_BOUNDARY_UNITS +
    EXHIBITION_LOG_COEFFICIENT * Math.log(magnitude / EXHIBITION_LINEAR_LIMIT_KM)
  )
}

const EXHIBITION_BOUNDARY_UNITS = EXHIBITION_SQRT_COEFFICIENT * Math.sqrt(EXHIBITION_LINEAR_LIMIT_KM)

function exhibitionUnitsInverse(units: number): number {
  const magnitude = Math.abs(units)
  if (magnitude <= EXHIBITION_BOUNDARY_UNITS) {
    return (magnitude / EXHIBITION_SQRT_COEFFICIENT) ** 2
  }
  return EXHIBITION_LINEAR_LIMIT_KM * Math.exp((magnitude - EXHIBITION_BOUNDARY_UNITS) / EXHIBITION_LOG_COEFFICIENT)
}

/** d(units)/d(km) of the exhibition mapping. */
function exhibitionLocalFactor(km: number): number {
  const magnitude = Math.max(1, Math.abs(km))
  if (magnitude <= EXHIBITION_LINEAR_LIMIT_KM) {
    return EXHIBITION_SQRT_COEFFICIENT / (2 * Math.sqrt(magnitude))
  }
  return EXHIBITION_LOG_COEFFICIENT / magnitude
}

function compressiveRadiusUnits(km: number, gain: number): number {
  if (km <= 0) return MIN_BODY_RADIUS_UNITS
  const value =
    (gain * km ** POWER_LAW_EXPONENT * EARTH_RADIUS_REFERENCE_KM ** (1 - POWER_LAW_EXPONENT)) / KM_PER_UNIT
  return Math.max(MIN_BODY_RADIUS_UNITS, value)
}

export function createScaleTransform(mode: ScaleMode): ScaleTransform {
  switch (mode) {
    case 'scientific':
      return {
        mode,
        positionKmToUnits: (vector) => ({ x: linearUnits(vector.x), y: linearUnits(vector.y), z: linearUnits(vector.z) }),
        distanceKmToUnits: linearUnits,
        unitsToDistanceKm: (units) => units * KM_PER_UNIT,
        unitsToKmVector: (units) => scaleVec(units, KM_PER_UNIT),
        localScaleFactorKmToUnits: () => 1 / KM_PER_UNIT,
        radiusKmToUnits: (km) => Math.max(MIN_BODY_RADIUS_UNITS, linearUnits(km)),
        radiusMagnification: () => 1,
        isLinear: true,
      }
    case 'visible':
      return {
        mode,
        positionKmToUnits: (vector) => ({ x: linearUnits(vector.x), y: linearUnits(vector.y), z: linearUnits(vector.z) }),
        distanceKmToUnits: linearUnits,
        unitsToDistanceKm: (units) => units * KM_PER_UNIT,
        unitsToKmVector: (units) => scaleVec(units, KM_PER_UNIT),
        localScaleFactorKmToUnits: () => 1 / KM_PER_UNIT,
        radiusKmToUnits: (km) => compressiveRadiusUnits(km, VISIBLE_RADIUS_GAIN),
        radiusMagnification: (km) => compressiveRadiusUnits(km, VISIBLE_RADIUS_GAIN) / Math.max(1e-9, linearUnits(km)),
        isLinear: true,
      }
    case 'exhibition':
      return {
        mode,
        // The radial mapping is non-linear, so only the magnitude is transformed.
        positionKmToUnits: (vector) => {
          const magnitude = Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2)
          if (magnitude === 0) return { x: 0, y: 0, z: 0 }
          return scaleVec(vector, exhibitionUnits(magnitude) / magnitude)
        },
        distanceKmToUnits: exhibitionUnits,
        unitsToDistanceKm: exhibitionUnitsInverse,
        unitsToKmVector: (units) => {
          const magnitude = Math.hypot(units.x, units.y, units.z)
          if (magnitude === 0) return { x: 0, y: 0, z: 0 }
          return scaleVec(units, exhibitionUnitsInverse(magnitude) / magnitude)
        },
        localScaleFactorKmToUnits: exhibitionLocalFactor,
        radiusKmToUnits: (km, radiusClass = 'planet') => compressiveRadiusUnits(km, EXHIBITION_RADIUS_GAIN[radiusClass]),
        radiusMagnification: (km, radiusClass = 'planet') =>
          compressiveRadiusUnits(km, EXHIBITION_RADIUS_GAIN[radiusClass]) / Math.max(1e-9, linearUnits(km)),
        isLinear: false,
      }
  }
}

/**
 * Scale factor applied to a satellite system so that it stays visible around its
 * parent. One factor per parent keeps the relative spacing of the moons intact;
 * the real distances are still reported in the information panel.
 *
 * Returns the factor by which the parent-relative offsets must be multiplied, given
 * the innermost moon's distance and the parent's rendered radius.
 */
export function satelliteSystemFactor(
  innermostOffsetKm: number,
  parentRadiusUnits: number,
  localScaleFactor: number,
): number {
  const trueUnits = innermostOffsetKm * localScaleFactor
  const minimumUnits = parentRadiusUnits * SATELLITE_CLEARANCE_FACTOR
  if (trueUnits <= 0) return 1
  return Math.max(1, minimumUnits / trueUnits)
}

/** Human-readable magnification label used by the HUD and the info panel. */
export function formatMagnification(magnification: number, locale: 'zh-CN' | 'en-US'): string {
  if (!Number.isFinite(magnification)) return '—'
  if (magnification < 1.05) return locale === 'zh-CN' ? '真实尺寸' : 'true size'
  return locale === 'zh-CN' ? `×${magnification.toFixed(1)} 放大` : `×${magnification.toFixed(1)} enlarged`
}