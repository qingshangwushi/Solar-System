/**
 * Unit system. Every quantity inside the application is stored in one unit and
 * converted only at the presentation boundary (see docs/astronomical-model.md).
 *
 * Distance : kilometre (km) internally; au only for heliocentric osculating elements
 * Mass     : kilogram (kg)
 * Time     : second (s); epochs are Julian Date / MJD in TDB
 * Angle    : radian internally; degrees only in the imported datasets
 */

export const AU_KM = 149_597_870.7
export const DEG = Math.PI / 180
export const RAD = 180 / Math.PI
export const TWO_PI = Math.PI * 2
export const SECONDS_PER_DAY = 86_400
export const DAYS_PER_JULIAN_CENTURY = 36_525
export const EARTH_RADIUS_KM = 6371.0

export function auToKm(au: number): number {
  return au * AU_KM
}

export function kmToAu(km: number): number {
  return km / AU_KM
}

export function degToRad(deg: number): number {
  return deg * DEG
}

export function radToDeg(rad: number): number {
  return rad * RAD
}

export function hoursToSeconds(hours: number): number {
  return hours * 3600
}

export function daysToSeconds(days: number): number {
  return days * SECONDS_PER_DAY
}

/** Wraps an angle into [0, 2pi). */
export function normalizeAngle(rad: number): number {
  const value = rad % TWO_PI
  return value < 0 ? value + TWO_PI : value
}

/** Wraps an angle into (-pi, pi]. */
export function wrapPi(rad: number): number {
  const value = normalizeAngle(rad)
  return value > Math.PI ? value - TWO_PI : value
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

const UNITS: Array<[number, string]> = [
  [1, 'km'],
  [1e3, 'thousand km'],
  [1e6, 'million km'],
  [AU_KM, 'AU'],
  [AU_KM * 1e3, 'thousand AU'],
]

/** Human-readable distance, choosing a unit that keeps 3-4 significant digits. */
export function formatDistance(km: number, locale: 'zh-CN' | 'en-US'): string {
  if (!Number.isFinite(km)) return '—'
  const absolute = Math.abs(km)
  let selected = UNITS[0]
  for (const entry of UNITS) {
    if (absolute >= entry[0]) selected = entry
  }
  if (absolute >= AU_KM * 1000) {
    const value = km / (AU_KM * 1000)
    return locale === 'zh-CN' ? `${value.toFixed(3)} 千 AU` : `${value.toFixed(3)} kAU`
  }
  const value = km / selected[0]
  return `${value.toFixed(value < 10 ? 3 : value < 1000 ? 1 : 0)} ${selected[1]}`
}

/**
 * Equivalent distance expressed in Earth radii (R⊕ = 6371 km, IAU nominal value).
 * The unit system in the specification lists km / au / Mkm / Earth radii; this is
 * the fourth one, and it is the readable scale for satellite systems.
 */
export function formatEarthRadii(km: number, locale: 'zh-CN' | 'en-US'): string {
  if (!Number.isFinite(km)) return '—'
  const value = km / EARTH_RADIUS_KM
  const digits = Math.abs(value) < 10 ? 2 : Math.abs(value) < 1000 ? 1 : 0
  return locale === 'zh-CN' ? `${value.toFixed(digits)} R⊕` : `${value.toFixed(digits)} R_E`
}

/** Scientific (exponential) notation used by the scientific-mode panels. */
export function formatScientific(value: number | null, digits = 4, unit?: string): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const magnitude = Math.abs(value)
  const suffix = unit ? ` ${unit}` : ''
  if (magnitude !== 0 && (magnitude < 1e-2 || magnitude >= 1e5)) {
    const [mantissa, exponent] = value.toExponential(digits - 1).split('e')
    return `${mantissa} × 10^${Number(exponent)}${suffix}`
  }
  return `${Number(value.toPrecision(digits))}${suffix}`
}

/** Seconds into a compact "1 y 32 d 04:05:06" style duration. */
export function formatDuration(seconds: number, locale: 'zh-CN' | 'en-US'): string {
  const dayLabel = locale === 'zh-CN' ? '天' : 'd'
  const hourLabel = locale === 'zh-CN' ? '时' : 'h'
  const minuteLabel = locale === 'zh-CN' ? '分' : 'min'
  let remaining = Math.abs(seconds)
  const days = Math.floor(remaining / SECONDS_PER_DAY)
  remaining -= days * SECONDS_PER_DAY
  const hours = Math.floor(remaining / 3600)
  remaining -= hours * 3600
  const minutes = Math.floor(remaining / 60)
  const secs = remaining - minutes * 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${dayLabel}`)
  if (hours > 0 || days > 0) parts.push(`${hours} ${hourLabel}`)
  parts.push(`${minutes} ${minuteLabel}`)
  parts.push(`${secs.toFixed(0)} s`)
  return parts.join(' ')
}

export function formatAngularSize(degrees: number): string {
  const arcsec = degrees * 3600
  if (arcsec < 90) return `${arcsec.toFixed(2)}″`
  const arcmin = degrees * 60
  if (arcmin < 90) return `${arcmin.toFixed(2)}′`
  return `${degrees.toFixed(3)}°`
}