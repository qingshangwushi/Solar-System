/**
 * Shared value formatting for the information panels.
 *
 * A field that is genuinely unknown is rendered as the localized "no reliable
 * data" string — never as a plausible-looking number (project requirement:
 * 未知数据必须显示"暂无可靠数据"，禁止编造).
 */
import { formatDistance, formatScientific } from '../astronomy/Units'
import type { Dictionary, Language } from '../i18n'

export interface Field {
  label: string
  value: string
  missing?: boolean
}

export function unknown(t: (key: keyof Dictionary) => string): Field {
  return { label: '', value: t('valueUnknown'), missing: true }
}

export function present(
  label: string,
  value: string | number | null | undefined,
  format: (input: never) => string,
  fallback: string,
): Field {
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    return { label, value: fallback, missing: true }
  }
  return { label, value: format(value as never) }
}

export function text(label: string, value: string | null | undefined, fallback: string): Field {
  if (!value) return { label, value: fallback, missing: true }
  return { label, value }
}

export function numberField(label: string, value: number | null | undefined, digits: number, unit?: string, fallback = '—'): Field {
  if (value === null || value === undefined || !Number.isFinite(value)) return { label, value: fallback, missing: true }
  const formatted = Number.isInteger(value) && Math.abs(value) >= 1000 ? value.toLocaleString('en-US') : value.toFixed(digits)
  return { label, value: unit ? `${formatted} ${unit}` : formatted }
}

export function scientificField(label: string, value: number | null | undefined, unit: string, fallback = '—'): Field {
  if (value === null || value === undefined || !Number.isFinite(value)) return { label, value: fallback, missing: true }
  return { label, value: formatScientific(value, 4, unit) }
}

export function distanceField(label: string, valueKm: number | null | undefined, locale: Language, fallback = '—'): Field {
  if (valueKm === null || valueKm === undefined || !Number.isFinite(valueKm)) return { label, value: fallback, missing: true }
  return { label, value: formatDistance(valueKm, locale) }
}

export function periodField(label: string, days: number | null | undefined, locale: Language, fallback = '—'): Field {
  if (days === null || days === undefined || !Number.isFinite(days)) return { label, value: fallback, missing: true }
  const localeTag = locale === 'zh-CN' ? 'zh-CN' : 'en-US'
  if (Math.abs(days) < 1) {
    const hours = days * 24
    return { label, value: `${hours.toFixed(3)} h` }
  }
  if (Math.abs(days) < 400) return { label, value: `${days.toFixed(3)} d` }
  const years = days / 365.25
  return {
    label,
    value: `${days.toLocaleString(localeTag, { maximumFractionDigits: 1 })} d (${years.toFixed(2)} ${locale === 'zh-CN' ? '年' : 'yr'})`,
  }
}

export function rotationPeriodField(label: string, hours: number | null | undefined, fallback = '—'): Field {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return { label, value: fallback, missing: true }
  const retrograde = hours < 0
  const magnitude = Math.abs(hours)
  const suffix = retrograde ? ' (R)' : ''
  if (magnitude < 48) return { label, value: `${magnitude.toFixed(3)} h${suffix}` }
  return { label, value: `${magnitude.toFixed(2)} h = ${(magnitude / 24).toFixed(3)} d${suffix}` }
}

/** Degrees -> degree/minute/second, the notation used on star charts. */
export function formatAngleDegrees(degrees: number | null | undefined, fallback = '—'): string {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return fallback
  const sign = degrees < 0 ? '-' : ''
  const magnitude = Math.abs(degrees)
  const whole = Math.floor(magnitude)
  const minutes = (magnitude - whole) * 60
  const minuteWhole = Math.floor(minutes)
  const seconds = (minutes - minuteWhole) * 60
  return `${sign}${whole}° ${minuteWhole}′ ${seconds.toFixed(1)}″`
}

export function typeKey(type: string): keyof Dictionary {
  switch (type) {
    case 'star':
      return 'typeStar'
    case 'planet':
      return 'typePlanet'
    case 'dwarfPlanet':
      return 'typeDwarfPlanet'
    case 'moon':
      return 'typeMoon'
    case 'comet':
      return 'typeComet'
    case 'tno':
      return 'typeTno'
    case 'centaur':
      return 'typeCentaur'
    default:
      return 'typeAsteroid'
  }
}

export function bucketKey(bucket: string): keyof Dictionary {
  switch (bucket) {
    case 'mainBelt':
      return 'filterMainBelt'
    case 'nearEarth':
      return 'filterNearEarth'
    case 'trojan':
      return 'filterTrojan'
    case 'centaur':
      return 'filterCentaur'
    case 'tno':
      return 'filterTno'
    case 'comet':
      return 'filterComet'
    default:
      return 'filterMainBelt'
  }
}

export function typeColour(type: string): string {
  switch (type) {
    case 'star':
      return 'var(--accent)'
    case 'planet':
      return 'var(--planet)'
    case 'dwarfPlanet':
      return 'var(--dwarf)'
    case 'moon':
      return 'var(--moon)'
    case 'comet':
      return 'var(--comet)'
    case 'tno':
      return 'var(--tno)'
    default:
      return 'var(--asteroid)'
  }
}