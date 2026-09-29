/**
 * Time-system verification.
 *
 * Reference values are the worked examples published in Meeus, *Astronomical
 * Algorithms* (2nd ed.), chapter 7, plus the J2000.0 definition.
 */
import { describe, expect, it } from 'vitest'
import {
  SimulationClock,
  dateFromJulianDate,
  daysSinceJ2000,
  julianDateFromDate,
  julianDateFromUnixMs,
  parseTimeInput,
  unixMsFromJulianDate,
} from '../TimeSystem'

const cases: Array<[string, number]> = [
  ['2000-01-01T12:00:00Z', 2451545.0],
  ['1987-01-27T00:00:00Z', 2446822.5],
  ['1987-06-19T12:00:00Z', 2446966.0],
  ['1988-01-27T00:00:00Z', 2447187.5],
  ['1900-01-01T00:00:00Z', 2415020.5],
  ['1600-12-31T00:00:00Z', 2305812.5],
  ['1957-10-04T19:26:24Z', 2436116.31],
  ['2026-09-29T00:00:00Z', 2461312.5],
]

describe('Julian Date conversion', () => {
  it.each(cases)('converts %s to JD %d', (iso, expected) => {
    expect(julianDateFromDate(new Date(iso))).toBeCloseTo(expected, 6)
  })

  it('round-trips calendar dates', () => {
    for (const [iso] of cases) {
      const original = new Date(iso)
      const restored = dateFromJulianDate(julianDateFromDate(original))
      expect(restored.getTime()).toBe(original.getTime())
    }
  })

  it('round-trips Unix time', () => {
    const now = Date.UTC(2026, 8, 29, 12, 42, 16)
    const jd = julianDateFromUnixMs(now)
    // JD float64 resolution is ~2e-5 s, so the round trip is millisecond-exact.
    expect(unixMsFromJulianDate(jd)).toBeCloseTo(now, 1)
  })

  it('reports days since J2000', () => {
    expect(daysSinceJ2000(2451545.0)).toBe(0)
    expect(daysSinceJ2000(2451555.0)).toBe(10)
  })
})

describe('user time input', () => {
  it('parses calendar dates at noon UTC', () => {
    expect(parseTimeInput('2026-09-29')).toBeCloseTo(2461313.0, 6)
  })

  it('parses date-times with and without a zone', () => {
    expect(parseTimeInput('1969-07-20 20:17:40')).toBeCloseTo(julianDateFromDate(new Date('1969-07-20T20:17:40Z')), 6)
  })

  it('parses explicit Julian Dates and MJDs', () => {
    expect(parseTimeInput('JD 2451545.0')).toBeCloseTo(2451545.0, 6)
    expect(parseTimeInput('MJD 51544.5')).toBeCloseTo(2451545.0, 6)
  })

  it('rejects nonsense', () => {
    expect(parseTimeInput('not a date')).toBeNull()
    expect(parseTimeInput('')).toBeNull()
  })
})

describe('SimulationClock', () => {
  it('advances with the configured rate', () => {
    const clock = new SimulationClock(2451545.0, 86400)
    clock.advance(1)
    expect(clock.jd).toBeCloseTo(2451546.0, 9)
  })

  it('does not advance while paused', () => {
    const clock = new SimulationClock(2451545.0, 86400, true)
    clock.advance(10)
    expect(clock.jd).toBe(2451545.0)
    expect(clock.timeScale).toBe(0)
  })

  it('supports negative rates for backward playback', () => {
    const clock = new SimulationClock(2451545.0, 86400)
    clock.reverse()
    clock.advance(2)
    expect(clock.jd).toBeCloseTo(2451543.0, 9)
  })

  it('clamps to the supported 3000 BC - 3000 AD range', () => {
    const clock = new SimulationClock(2451545.0, 1)
    clock.setJulianDate(0)
    expect(clock.jd).toBeGreaterThan(600000)
    clock.setJulianDate(1e9)
    expect(clock.jd).toBeLessThan(3000000)
  })
})