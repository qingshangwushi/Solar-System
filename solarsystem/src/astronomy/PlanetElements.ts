/**
 * Keplerian planet positions from the JPL/Standish elements (Mode B).
 *
 * Source: NASA/JPL SSD, "Approximate Positions of the Planets"
 * (E.M. Standish & J.G. Williams, 1992), Table 1 — valid 1800 AD to 2050 AD.
 * The elements and rates are read from data/sources/planets-jpl-approx.json.
 *
 * The Earth entry of that table is the Earth/Moon barycenter, so the Earth and
 * the Moon are separated with the DE430 Moon/Earth mass ratio:
 *      Earth = EMB − r_moon / (1 + μ)
 *      Moon  = EMB + μ · r_moon / (1 + μ)
 * with r_moon the geocentric Moon position, supplied by the caller (the Moon's
 * own Keplerian elements in Mode B, or the lunar ephemeris in Mode A quality checks).
 *
 * Accuracy, as published by JPL for 1800-2050 (heliocentric longitude / latitude
 * / distance): Mercury 15″/1″/1000 km, Venus 20″/1″/4000 km, EMB 20″/8″/6000 km,
 * Mars 40″/2″/25000 km, Jupiter 400″/10″/600000 km, Saturn 600″/25″/1500000 km,
 * Uranus 50″/2″/1000000 km, Neptune 10″/1″/200000 km.
 */
import { AU_KM, DEG } from './Units'
import { J2000_JD, JULIAN_CENTURY_DAYS, MOON_EARTH_MASS_RATIO } from './Constants'
import { perifocalPositionFromMeanAnomaly, perifocalToReferenceFrame } from './KeplerSolver'
import type { Vec3 } from './Coordinates'

export type KeplerPlanetId =
  | 'mercury'
  | 'venus'
  | 'earthMoonBarycenter'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'

export type PlanetId = Exclude<KeplerPlanetId, 'earthMoonBarycenter'> | 'earth'

/** [value at J2000, change per Julian century] */
export type ElementPair = readonly [number, number]

export interface PlanetElementTable {
  a: ElementPair
  e: ElementPair
  i: ElementPair
  L: ElementPair
  longPeri: ElementPair
  longNode: ElementPair
}

export interface PlanetElementDataset {
  epochJD: number
  validFrom: string
  validTo: string
  source: string
  elements: Record<KeplerPlanetId, PlanetElementTable>
}

export interface PlanetStateAtEpoch {
  semiMajorAxisAu: number
  eccentricity: number
  inclinationDeg: number
  longitudeAscendingNodeDeg: number
  argumentOfPeriapsisDeg: number
  meanAnomalyDeg: number
  meanLongitudeDeg: number
}

/** Best-fit elements at an arbitrary epoch (JPL doc, steps 1 and 2). */
export function planetElementsAt(dataset: PlanetElementDataset, planet: KeplerPlanetId, julianDate: number): PlanetStateAtEpoch {
  const table = dataset.elements[planet]
  if (!table) throw new Error(`no Keplerian elements bundled for ${planet}`)

  // T = centuries since J2000.0 (TDB).
  const T = (julianDate - dataset.epochJD) / JULIAN_CENTURY_DAYS
  const a = table.a[0] + table.a[1] * T
  const e = table.e[0] + table.e[1] * T
  const inclinationDeg = table.i[0] + table.i[1] * T
  const meanLongitudeDeg = table.L[0] + table.L[1] * T
  const longPeriDeg = table.longPeri[0] + table.longPeri[1] * T
  const longNodeDeg = table.longNode[0] + table.longNode[1] * T

  return {
    semiMajorAxisAu: a,
    eccentricity: e,
    inclinationDeg,
    longitudeAscendingNodeDeg: longNodeDeg,
    argumentOfPeriapsisDeg: longPeriDeg - longNodeDeg, // ω = ϖ − Ω
    meanAnomalyDeg: meanLongitudeDeg - longPeriDeg, // M = L − ϖ
    meanLongitudeDeg,
  }
}

/** Heliocentric ecliptic J2000 position of a planet (or the EMB), kilometres. */
export function keplerPlanetPositionKm(
  dataset: PlanetElementDataset,
  planet: KeplerPlanetId,
  julianDate: number,
): Vec3 {
  const elements = planetElementsAt(dataset, planet, julianDate)
  const semiMajorAxisKm = elements.semiMajorAxisAu * AU_KM
  const plane = perifocalPositionFromMeanAnomaly(
    semiMajorAxisKm,
    elements.eccentricity,
    elements.meanAnomalyDeg * DEG,
  )
  return perifocalToReferenceFrame(plane, {
    semiMajorAxisKm,
    eccentricity: elements.eccentricity,
    inclinationRad: elements.inclinationDeg * DEG,
    nodeRad: elements.longitudeAscendingNodeDeg * DEG,
    argumentOfPeriapsisRad: elements.argumentOfPeriapsisDeg * DEG,
  })
}

/** Heliocentric position of a planet, resolving the Earth/Moon barycenter split. */
export function keplerPlanetHeliocentricKm(
  dataset: PlanetElementDataset,
  planet: PlanetId,
  julianDate: number,
  moonGeocentricKm: Vec3 | null,
): Vec3 {
  if (planet !== 'earth') {
    return keplerPlanetPositionKm(dataset, planet as KeplerPlanetId, julianDate)
  }
  const barycenter = keplerPlanetPositionKm(dataset, 'earthMoonBarycenter', julianDate)
  if (!moonGeocentricKm) return barycenter
  // The Earth sits μ/(1+μ) of the way from the barycenter towards the Moon, measured
  // against the geocentric lunar vector:
  //     r_earth = r_EMB − μ/(1+μ) · r_moon(geocentric),  μ = m_moon/m_earth
  // Using 1/(1+μ) instead (the Moon's own coefficient) displaces the Earth by almost
  // one lunar distance, which was the largest residual in the Mode B validation.
  const factor = MOON_EARTH_MASS_RATIO / (1 + MOON_EARTH_MASS_RATIO)
  return {
    x: barycenter.x - moonGeocentricKm.x * factor,
    y: barycenter.y - moonGeocentricKm.y * factor,
    z: barycenter.z - moonGeocentricKm.z * factor,
  }
}

/** Geocentric position of the Moon derived from its own elements (Mode B). */
export function keplerMoonGeocentricKm(
  moon: {
    semiMajorAxisKm: number
    eccentricity: number
    inclinationDeg: number
    longitudeAscendingNodeDeg: number
    argumentOfPeriapsisDeg: number
    meanAnomalyDeg: number
    periodDays: number
  },
  julianDate: number,
): Vec3 {
  const motion = (2 * Math.PI) / moon.periodDays
  const meanAnomaly = (moon.meanAnomalyDeg * DEG) + motion * (julianDate - J2000_JD)
  const plane = perifocalPositionFromMeanAnomaly(moon.semiMajorAxisKm, moon.eccentricity, meanAnomaly)
  return perifocalToReferenceFrame(plane, {
    semiMajorAxisKm: moon.semiMajorAxisKm,
    eccentricity: moon.eccentricity,
    inclinationRad: moon.inclinationDeg * DEG,
    nodeRad: moon.longitudeAscendingNodeDeg * DEG,
    argumentOfPeriapsisRad: moon.argumentOfPeriapsisDeg * DEG,
  })
}

/** Distance of a planet from the Sun, kilometres (Mode B). */
export function keplerPlanetDistanceKm(
  dataset: PlanetElementDataset,
  planet: KeplerPlanetId,
  julianDate: number,
): number {
  const position = keplerPlanetPositionKm(dataset, planet, julianDate)
  return Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z)
}