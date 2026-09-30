/**
 * Scientific verification of the Mode B Keplerian planet propagation against the
 * Mode A ephemeris engine (VSOP87 / ELP2000 / JPL-fitted Pluto series).
 *
 * The comparison is the "scientific validation" step required by the project:
 * for a set of epochs the heliocentric ecliptic position of every planet is
 * computed twice — once from the JPL/Standish Keplerian elements shipped in
 * public/data/catalog/planet-elements.json, once from the ephemeris engine — and
 * the position error is reported as an angular separation and a relative radial
 * error. The assertions encode thresholds derived from the nominal accuracy that
 * JPL publishes for those elements (1800-2050: 10"-600" in longitude, up to
 * 1.5e6 km in range for Saturn).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  keplerMoonGeocentricKm,
  keplerPlanetHeliocentricKm,
  type PlanetElementDataset,
  type PlanetId,
} from '../PlanetElements'
import { AstronomyEngineEphemerisSource, type EphemerisBodyId } from '../Ephemeris'
import { angularSeparation, lengthVec3, normalizeVec3, subtractVec3 } from '../Coordinates'
import { AU_KM, RAD } from '../Units'

const dataset = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/catalog/planet-elements.json'), 'utf8'),
) as PlanetElementDataset

/** JPL satellite mean elements for the Moon, used to build the EMB split in Mode B. */
const MOON_ELEMENTS = {
  semiMajorAxisKm: 384400,
  eccentricity: 0.0554,
  inclinationDeg: 5.16,
  longitudeAscendingNodeDeg: 125.08,
  argumentOfPeriapsisDeg: 318.15,
  meanAnomalyDeg: 135.27,
  periodDays: 27.322,
}

const PLANETS: PlanetId[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']

/** Epochs spanning the whole validity interval of the element table. */
const EPOCHS_ISO = [
  '1900-01-01T00:00:00Z',
  '1969-07-20T20:17:00Z',
  '2000-01-01T12:00:00Z',
  '2026-09-29T00:00:00Z',
  '2035-01-01T00:00:00Z',
  '2049-12-31T00:00:00Z',
]

function julianDate(iso: string): number {
  return new Date(iso).getTime() / 86_400_000 + 2440587.5
}

/** The catalog uses lowercase ids; the ephemeris engine uses capitalised names. */
function ephemerisBodyId(planet: PlanetId): EphemerisBodyId {
  return (planet.charAt(0).toUpperCase() + planet.slice(1)) as EphemerisBodyId
}

interface Comparison {
  planet: PlanetId
  epoch: string
  angularErrorDeg: number
  relativeRadialError: number
  keplerRadiusAu: number
  ephemerisRadiusAu: number
}

const ephemeris = new AstronomyEngineEphemerisSource()
const comparisons: Comparison[] = []

for (const iso of EPOCHS_ISO) {
  const jd = julianDate(iso)
  const moonGeo = keplerMoonGeocentricKm(MOON_ELEMENTS, jd)
  for (const planet of PLANETS) {
    const kepler = keplerPlanetHeliocentricKm(dataset, planet, jd, moonGeo)
    const reference = ephemeris.heliocentricEclipticKm(ephemerisBodyId(planet), jd)
    const keplerRadiusAu = lengthVec3(kepler) / AU_KM
    const ephemerisRadiusAu = lengthVec3(reference) / AU_KM
    comparisons.push({
      planet,
      epoch: iso,
      angularErrorDeg: angularSeparation(normalizeVec3(kepler), normalizeVec3(reference)) * RAD,
      relativeRadialError: Math.abs(keplerRadiusAu - ephemerisRadiusAu) / ephemerisRadiusAu,
      keplerRadiusAu,
      ephemerisRadiusAu,
    })
  }
}

describe('Mode B Keplerian planets vs Mode A ephemeris', () => {
  it('covers every planet at every epoch', () => {
    expect(comparisons).toHaveLength(PLANETS.length * EPOCHS_ISO.length)
  })

  it('agrees in direction to better than 0.4 degrees everywhere', () => {
    const worst = comparisons.reduce((a, b) => (b.angularErrorDeg > a.angularErrorDeg ? b : a))
    expect(worst.angularErrorDeg).toBeLessThan(0.4)
  })

  it('agrees in distance to better than 0.5 % everywhere', () => {
    const worst = comparisons.reduce((a, b) => (b.relativeRadialError > a.relativeRadialError ? b : a))
    expect(worst.relativeRadialError).toBeLessThan(0.005)
  })

  it('agrees in direction to better than 0.05 degrees for Mercury, Venus and Mars', () => {
    const inner = comparisons.filter((entry) => ['mercury', 'venus', 'mars'].includes(entry.planet))
    const worst = inner.reduce((a, b) => (b.angularErrorDeg > a.angularErrorDeg ? b : a))
    expect(worst.angularErrorDeg).toBeLessThan(0.05)
  })

  it('agrees in direction to better than 0.2 degrees for the Earth', () => {
    // The Earth entry of the JPL table is the Earth/Moon barycenter. The Kepler
    // path removes the Moon with the Moon's own mean elements. The split uses the
    // mass-ratio coefficient μ/(1+μ); using the Moon's 1/(1+μ) instead misplaces the
    // Earth by almost one lunar distance, which showed up here as a 0.147° residual
    // (it is 0.004° with the correct coefficient). The bound below guards it.
    const earth = comparisons.filter((entry) => entry.planet === 'earth')
    const worst = earth.reduce((a, b) => (b.angularErrorDeg > a.angularErrorDeg ? b : a))
    expect(worst.angularErrorDeg).toBeLessThan(0.02)
  })

  it('places the Earth at 1 au with a sub-percent error', () => {
    for (const entry of comparisons.filter((item) => item.planet === 'earth')) {
      expect(entry.keplerRadiusAu).toBeGreaterThan(0.98)
      expect(entry.keplerRadiusAu).toBeLessThan(1.02)
    }
  })

  it('agrees with the published Jupiter and Saturn semi-major axes', () => {
    const jupiter = comparisons.find((entry) => entry.planet === 'jupiter')!
    const saturn = comparisons.find((entry) => entry.planet === 'saturn')!
    expect(jupiter.ephemerisRadiusAu).toBeGreaterThan(4.9)
    expect(jupiter.ephemerisRadiusAu).toBeLessThan(5.5)
    expect(saturn.ephemerisRadiusAu).toBeGreaterThan(9)
    expect(saturn.ephemerisRadiusAu).toBeLessThan(10.1)
  })

  it('reports the error table for the documentation', () => {
    const perPlanet = new Map<PlanetId, { angular: number; radial: number }>()
    for (const entry of comparisons) {
      const current = perPlanet.get(entry.planet) ?? { angular: 0, radial: 0 }
      perPlanet.set(entry.planet, {
        angular: Math.max(current.angular, entry.angularErrorDeg),
        radial: Math.max(current.radial, entry.relativeRadialError),
      })
    }
    const lines = [...perPlanet.entries()].map(
      ([planet, values]) =>
        `${planet.padEnd(8)} worst angular ${values.angular.toFixed(4)}°  worst radial ${(values.radial * 100).toFixed(4)} %`,
    )
    // Surfaced in the test output so the numbers can be copied into docs/.
    console.log(`\nKepler (Mode B) vs ephemeris (Mode A), 1900-2049\n${lines.join('\n')}`)
    expect(lines.length).toBe(PLANETS.length)
  })
})

describe('Moon geometry in Mode B', () => {
  it('sweeps exactly the tabulated mean-element envelope a(1-e) .. a(1+e)', () => {
    const samples = 720
    let minimum = Number.POSITIVE_INFINITY
    let maximum = 0
    for (let index = 0; index < samples; index++) {
      const jd = 2451545.0 + (index / samples) * MOON_ELEMENTS.periodDays
      const distance = lengthVec3(keplerMoonGeocentricKm(MOON_ELEMENTS, jd))
      minimum = Math.min(minimum, distance)
      maximum = Math.max(maximum, distance)
    }
    const perigee = MOON_ELEMENTS.semiMajorAxisKm * (1 - MOON_ELEMENTS.eccentricity)
    const apogee = MOON_ELEMENTS.semiMajorAxisKm * (1 + MOON_ELEMENTS.eccentricity)
    expect(minimum / perigee).toBeCloseTo(1, 2)
    expect(maximum / apogee).toBeCloseTo(1, 2)
    // The modelled envelope sits inside the real 356 500 - 406 700 km range.
    expect(minimum).toBeGreaterThan(355_000)
    expect(maximum).toBeLessThan(408_000)
  })

  it('stays within the accuracy expected of mean elements against the lunar ephemeris', () => {
    const reference = new AstronomyEngineEphemerisSource()
    let worst = 0
    for (let index = 0; index < 240; index++) {
      const jd = 2451545.0 + index * 7.4
      const kepler = keplerMoonGeocentricKm(MOON_ELEMENTS, jd)
      const truth = reference.moonGeocentricKm(jd)
      worst = Math.max(worst, angularSeparation(normalizeVec3(kepler), normalizeVec3(truth)) * RAD)
    }
    console.log(
      `\nMoon mean elements vs ephemeris (240 samples over ~5 years): worst direction error ${worst.toFixed(2)}°` +
        '\n(JPL states explicitly that satellite mean elements are not intended for ephemeris computation;' +
        '\n the application therefore renders the Moon through Mode A.)',
    )
    expect(worst).toBeLessThan(20)
  })
})

describe('unit hygiene', () => {
  it('subtract helper matches the coordinate module', () => {
    const delta = subtractVec3({ x: 3, y: 4, z: 0 }, { x: 0, y: 0, z: 0 })
    expect(lengthVec3(delta)).toBeCloseTo(5, 12)
  })
})