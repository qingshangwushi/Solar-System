/**
 * Unified astronomy clock.
 *
 * The application never stores a wall-clock time for the simulation: it stores a
 * Julian Date (JD, TDB-like) and advances it by real elapsed time multiplied by a
 * configurable rate. Calendar dates are derived for display only.
 *
 * Calendar <-> Julian Date conversion follows Meeus, *Astronomical Algorithms*
 * (2nd ed.), chapter 7. The UT-to-TT offset (~69 s) is modelled by
 * astronomy-engine when Mode A ephemerides are evaluated, so the clock itself
 * stays a pure proleptic-Gregorian JD.
 */
import { JD_UNIX_EPOCH, J2000_JD } from './Constants'
import { SECONDS_PER_DAY, clamp } from './Units'

/** Simulation rate presets: simulation seconds per real second. */
export const TIME_SCALE_PRESETS: Array<{ value: number; label: string; labelZh: string }> = [
  { value: 0, label: 'Paused', labelZh: '暂停' },
  { value: 1, label: 'Real time', labelZh: '实时' },
  { value: 60, label: '1 min/s', labelZh: '1 秒 = 1 分钟' },
  { value: 3600, label: '1 hour/s', labelZh: '1 秒 = 1 小时' },
  { value: 86400, label: '1 day/s', labelZh: '1 秒 = 1 天' },
  { value: 10 * 86400, label: '10 days/s', labelZh: '1 秒 = 10 天' },
  { value: 30 * 86400, label: '30 days/s', labelZh: '1 秒 = 30 天' },
  { value: 365.25 * 86400, label: '1 year/s', labelZh: '1 秒 = 1 年' },
]

/** The widest range the clock can represent: 3000 BC to 3000 AD. */
export const MIN_JULIAN_DATE = 625673.5
export const MAX_JULIAN_DATE = 2816787.5

/** Calendar date (UTC) -> Julian Date. Meeus, Astronomical Algorithms, eq. 7.1. */
export function julianDateFromDate(date: Date): number {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const dayFraction =
    date.getUTCDate() +
    (date.getUTCHours() + (date.getUTCMinutes() + (date.getUTCSeconds() + date.getUTCMilliseconds() / 1000) / 60) / 60) / 24

  let y = year
  let m = month
  if (m <= 2) {
    y -= 1
    m += 12
  }
  const a = Math.floor(y / 100)
  // Gregorian calendar correction; the proleptic Gregorian rule is applied for
  // dates before 1582 as well, which keeps behaviour deterministic across the
  // whole supported range.
  const b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + dayFraction + b - 1524.5
}

/** Julian Date -> UTC Date. Meeus, Astronomical Algorithms, chapter 7. */
export function dateFromJulianDate(julianDate: number): Date {
  const shifted = julianDate + 0.5
  const z = Math.floor(shifted)
  const f = shifted - z
  let a = z
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25)
    a = z + 1 + alpha - Math.floor(alpha / 4)
  }
  const b = a + 1524
  const c = Math.floor((b - 122.1) / 365.25)
  const d = Math.floor(365.25 * c)
  const e = Math.floor((b - d) / 30.6001)

  const day = b - d - Math.floor(30.6001 * e) + f
  const month = e < 14 ? e - 1 : e - 13
  const year = month > 2 ? c - 4716 : c - 4715

  const dayInteger = Math.floor(day)
  const fractionalDay = day - dayInteger
  let totalSeconds = Math.round(fractionalDay * SECONDS_PER_DAY)
  let hour = Math.floor(totalSeconds / 3600)
  totalSeconds -= hour * 3600
  let minute = Math.floor(totalSeconds / 60)
  let second = totalSeconds - minute * 60
  let dayOffset = 0
  if (second >= 60) {
    second -= 60
    minute += 1
  }
  if (minute >= 60) {
    minute -= 60
    hour += 1
  }
  if (hour >= 24) {
    hour -= 24
    dayOffset = 1
  }

  const result = new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 0))
  result.setUTCFullYear(year, month - 1, dayInteger + dayOffset)
  result.setUTCHours(hour, minute, second, 0)
  return result
}

export function julianDateFromUnixMs(unixMs: number): number {
  return JD_UNIX_EPOCH + unixMs / 1000 / SECONDS_PER_DAY
}

export function unixMsFromJulianDate(julianDate: number): number {
  return (julianDate - JD_UNIX_EPOCH) * SECONDS_PER_DAY * 1000
}

/** Days since J2000.0 — the argument expected by most closed-form series. */
export function daysSinceJ2000(julianDate: number): number {
  return julianDate - J2000_JD
}

export function julianCenturiesSinceJ2000(julianDate: number): number {
  return (julianDate - J2000_JD) / 36525
}

/**
 * Parses user input into a Julian Date. Accepts ISO-8601 date-time strings,
 * bare calendar dates and Julian Dates prefixed with "JD".
 * Returns null when the input cannot be interpreted.
 */
export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  const jdMatch = /^jd\s*([0-9]+(?:\.[0-9]+)?)$/i.exec(trimmed)
  if (jdMatch) {
    const value = Number(jdMatch[1])
    return Number.isFinite(value) ? value : null
  }

  const mjdMatch = /^mjd\s*([0-9]+(?:\.[0-9]+)?)$/i.exec(trimmed)
  if (mjdMatch) {
    const value = Number(mjdMatch[1])
    return Number.isFinite(value) ? value + 2400000.5 : null
  }

  const hasTime = /\d{1,2}:\d{2}/.test(trimmed)
  const isoCandidate = hasTime ? trimmed.replace(' ', 'T') : `${trimmed}T12:00:00Z`
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoCandidate) ? isoCandidate : `${isoCandidate}Z`
  const timestamp = Date.parse(withZone)
  if (Number.isNaN(timestamp)) return null
  return julianDateFromUnixMs(timestamp)
}

export function formatUtc(julianDate: number, options: { withSeconds?: boolean } = {}): string {
  const date = dateFromJulianDate(julianDate)
  const iso = date.toISOString()
  return options.withSeconds === false ? iso.slice(0, 16).replace('T', ' ') : `${iso.slice(0, 19).replace('T', ' ')} UTC`
}

export function formatJulianDate(julianDate: number): string {
  return `JD ${julianDate.toFixed(5)}`
}

export interface ClockSnapshot {
  julianDate: number
  timeScale: number
  paused: boolean
}

/**
 * Mutable simulation clock. `advance` is called once per rendered frame with the
 * real elapsed time; nothing else in the application mutates the Julian Date.
 */
export class SimulationClock {
  private julianDate: number
  private rate: number
  private isPaused: boolean

  constructor(julianDate: number, rate = 1, paused = false) {
    this.julianDate = clamp(julianDate, MIN_JULIAN_DATE, MAX_JULIAN_DATE)
    this.rate = rate
    this.isPaused = paused || rate === 0
  }

  get jd(): number {
    return this.julianDate
  }

  get timeScale(): number {
    return this.isPaused ? 0 : this.rate
  }

  get paused(): boolean {
    return this.isPaused
  }

  /** Simulation seconds per real second, including sign (negative runs time backwards). */
  get signedRate(): number {
    return this.isPaused ? 0 : this.rate
  }

  advance(realDeltaSeconds: number): number {
    if (this.isPaused || this.rate === 0) return 0
    const deltaDays = (realDeltaSeconds * this.rate) / SECONDS_PER_DAY
    const next = clamp(this.julianDate + deltaDays, MIN_JULIAN_DATE, MAX_JULIAN_DATE)
    const applied = next - this.julianDate
    this.julianDate = next
    return applied
  }

  setJulianDate(julianDate: number): void {
    this.julianDate = clamp(julianDate, MIN_JULIAN_DATE, MAX_JULIAN_DATE)
  }

  setDate(date: Date): void {
    this.setJulianDate(julianDateFromDate(date))
  }

  setRate(rate: number): void {
    this.rate = rate
    if (rate !== 0) this.isPaused = false
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused
  }

  togglePaused(): void {
    this.isPaused = !this.isPaused
  }

  /** Reverses the direction of time while keeping the current rate magnitude. */
  reverse(): void {
    if (this.rate === 0) return
    this.rate = -this.rate
    this.isPaused = false
  }

  toDate(): Date {
    return dateFromJulianDate(this.julianDate)
  }

  snapshot(): ClockSnapshot {
    return { julianDate: this.julianDate, timeScale: this.timeScale, paused: this.isPaused }
  }

  restore(snapshot: ClockSnapshot): void {
    this.julianDate = clamp(snapshot.julianDate, MIN_JULIAN_DATE, MAX_JULIAN_DATE)
    this.rate = snapshot.timeScale
    this.isPaused = snapshot.paused
  }
}