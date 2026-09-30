/**
 * Timeline, clock and filter tests (specification §9/§59).
 *
 * The timeline UI is React, but the behaviour that matters — presets, advance,
 * pause, reverse, date jump, clamping — lives in `SimulationClock`, and the filter
 * widgets only ever change the store's `activeFilters`. Both pure layers are tested
 * here; the real minor-body store is used to prove a filter set actually selects the
 * matching objects. No DOM and no GPU are involved.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_JULIAN_DATE,
  MIN_JULIAN_DATE,
  TIME_SCALE_PRESETS,
  SimulationClock,
  dateFromJulianDate,
  parseTimeInput,
} from '../../astronomy/TimeSystem'
import { useAppStore } from '../../state/store'
import { MinorBodyStore } from '../../data/MinorBodyStore'
import type { MinorBodyIndex } from '../../types/catalog'

const defaults = useAppStore.getState()
beforeEach(() => {
  useAppStore.setState(defaults)
})

describe('time-scale presets', () => {
  it('starts paused and then increases monotonically to one year per second', () => {
    const values = TIME_SCALE_PRESETS.map((preset) => preset.value)
    expect(values[0]).toBe(0)
    expect(values).toContain(1)
    expect(values).toContain(86_400)
    expect(values).toContain(365.25 * 86_400)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })

  it('labels every preset in both languages', () => {
    for (const preset of TIME_SCALE_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0)
      expect(preset.labelZh.length).toBeGreaterThan(0)
    }
  })

  it('records the selected preset through the store', () => {
    useAppStore.getState().setState({ timeScale: 86_400, paused: false })
    expect(useAppStore.getState().timeScale).toBe(86_400)
    useAppStore.getState().setState({ timeScale: 0, paused: true })
    expect(useAppStore.getState().paused).toBe(true)
  })
})

describe('SimulationClock', () => {
  it('advances by real elapsed time multiplied by the rate', () => {
    const clock = new SimulationClock(2_451_545, 86_400)
    expect(clock.advance(1)).toBeCloseTo(1, 12)
    expect(clock.jd).toBeCloseTo(2_451_546, 12)
    expect(clock.timeScale).toBe(86_400)
  })

  it('advances nothing while paused', () => {
    const clock = new SimulationClock(2_451_545, 86_400, true)
    expect(clock.paused).toBe(true)
    expect(clock.advance(60)).toBe(0)
    expect(clock.jd).toBe(2_451_545)
  })

  it('pauses and resumes through setPaused and togglePaused', () => {
    const clock = new SimulationClock(2_451_545, 3_600)
    clock.togglePaused()
    expect(clock.paused).toBe(true)
    expect(clock.advance(10)).toBe(0)
    clock.togglePaused()
    expect(clock.paused).toBe(false)
    // The Julian Date is ~2.45e6, so a day fraction is only good to ~1e-10 days;
    // assert the applied delta rather than the absolute date.
    expect(clock.advance(10)).toBeCloseTo(10 / 24, 9)
    clock.setPaused(true)
    expect(clock.signedRate).toBe(0)
  })

  it('runs time backwards after reverse()', () => {
    const clock = new SimulationClock(2_451_545, 86_400)
    clock.reverse()
    expect(clock.signedRate).toBe(-86_400)
    clock.advance(1)
    expect(clock.jd).toBeCloseTo(2_451_544, 12)
  })

  it('ignores reverse() when the rate is zero', () => {
    const clock = new SimulationClock(2_451_545, 0)
    expect(clock.paused).toBe(true)
    clock.reverse()
    expect(clock.signedRate).toBe(0)
    expect(clock.advance(10)).toBe(0)
  })

  it('resumes when a non-zero rate is set', () => {
    const clock = new SimulationClock(2_451_545, 0)
    clock.setRate(3_600)
    expect(clock.paused).toBe(false)
    expect(clock.timeScale).toBe(3_600)
  })

  it('jumps to a calendar date and reports it back', () => {
    const clock = new SimulationClock(2_451_545)
    clock.setDate(new Date('2035-01-01T00:00:00Z'))
    expect(dateFromJulianDate(clock.jd).toISOString()).toBe('2035-01-01T00:00:00.000Z')
    clock.setJulianDate(parseTimeInput('2049-12-31')!)
    expect(clock.toDate().toISOString().startsWith('2049-12-31')).toBe(true)
  })

  it('clamps to the supported 3000 BC .. 3000 AD range', () => {
    const clock = new SimulationClock(2_451_545)
    clock.setJulianDate(MIN_JULIAN_DATE - 1_000_000)
    expect(clock.jd).toBe(MIN_JULIAN_DATE)
    clock.setJulianDate(MAX_JULIAN_DATE + 1_000_000)
    expect(clock.jd).toBe(MAX_JULIAN_DATE)
    const clampedAdvance = clock.advance(1e12)
    expect(clampedAdvance).toBe(0)
  })

  it('round-trips a snapshot for save/restore of the timeline', () => {
    const clock = new SimulationClock(2_451_600, 3_600)
    const snapshot = clock.snapshot()
    const restored = new SimulationClock(2_451_545, 0)
    restored.restore(snapshot)
    expect(restored.jd).toBeCloseTo(2_451_600, 9)
    expect(restored.timeScale).toBe(3_600)
    expect(restored.paused).toBe(false)
  })
})

describe('minor-body layer filters', () => {
  const catalogDir = resolve(process.cwd(), 'public/data/catalog')
  const index = JSON.parse(readFileSync(resolve(catalogDir, 'minor-bodies.json'), 'utf8')) as MinorBodyIndex
  const buffer = readFileSync(resolve(catalogDir, 'minor-bodies.bin'))
  const store = new MinorBodyStore(index, new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4))

  it('selects exactly the records of the requested buckets', () => {
    const bucket = 'trojan'
    const expected = store.records.filter((record) => record.bucket === bucket).length
    expect(store.selectIndices({ buckets: new Set([bucket]) }).length).toBe(expected)
    expect(expected).toBeGreaterThan(0)
  })

  it('narrows the selection when a second filter is added', () => {
    const byBucket = store.selectIndices({ buckets: new Set(['mainBelt', 'trojan']) }).length
    const neoOnly = store.selectIndices({ buckets: new Set(['mainBelt', 'trojan']), onlyNeo: true }).length
    expect(byBucket).toBeGreaterThan(0)
    expect(neoOnly).toBeLessThanOrEqual(byBucket)
  })

  it('sums to the whole catalogue when every bucket is selected', () => {
    const all = new Set(store.records.map((record) => record.bucket))
    expect(store.selectIndices({ buckets: all }).length).toBe(store.length)
  })
})
