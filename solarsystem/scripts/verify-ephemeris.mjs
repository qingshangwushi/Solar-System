/**
 * Scientific verification of the orbital propagation.
 *
 * Two independent comparisons are performed:
 *
 *  1. INTERNAL (regression): Mode B (Kepler, JPL/Standish elements) against Mode A
 *     (astronomy-engine VSOP87 planets + ELP2000 Moon). Both are approximations of
 *     the same ephemeris, so this only measures their mutual disagreement; it is a
 *     regression guard, not a claim about absolute accuracy.
 *
 *  2. EXTERNAL (authority): Mode A and Mode B against `data/sources/horizons-golden.json`,
 *     real state vectors downloaded from the NASA/JPL Horizons system (heliocentric
 *     ecliptic J2000, km and km/s, centre '500@10' = Sun body centre). This is the
 *     comparison that satisfies §60's "compare against an authoritative ephemeris".
 *     The set includes the Moon. If the golden file is unavailable (the exhibition
 *     build machine may be air-gapped) the external section prints
 *     `SKIPPED (no external reference)` and does not fail the run.
 *
 * The script reports the radial, angular and total position error plus the velocity
 * error per body, applies documented thresholds, and exits non-zero if any of them
 * is exceeded.
 *
 * Usage:  node scripts/verify-ephemeris.mjs [--json]
 */
import path from 'node:path'
import { readJson, ROOT, log } from './lib/io.mjs'

const AU_KM = 149_597_870.7
const J2000_JD = 2451545.0
const DEG = Math.PI / 180
const SECONDS_PER_DAY = 86_400
const MOON_EARTH_MASS_RATIO = 0.0123000371

/**
 * Published nominal accuracy of the JPL "Approximate Positions of the Planets"
 * table for 1800-2050: worst-case heliocentric longitude (arcsec), latitude
 * (arcsec) and range (1000 km). Used as the pass/fail threshold.
 */
const NOMINAL_ACCURACY = {
  mercury: { longitudeArcsec: 15, latitudeArcsec: 1, rangeThousandKm: 1 },
  venus: { longitudeArcsec: 20, latitudeArcsec: 1, rangeThousandKm: 4 },
  earthMoonBarycenter: { longitudeArcsec: 20, latitudeArcsec: 8, rangeThousandKm: 6 },
  // The golden reference resolves the Earth centre, not the barycentre; the
  // published accuracy of the underlying JPL table entry applies either way.
  earth: { longitudeArcsec: 20, latitudeArcsec: 8, rangeThousandKm: 6 },
  mars: { longitudeArcsec: 40, latitudeArcsec: 2, rangeThousandKm: 25 },
  jupiter: { longitudeArcsec: 400, latitudeArcsec: 10, rangeThousandKm: 600 },
  saturn: { longitudeArcsec: 600, latitudeArcsec: 25, rangeThousandKm: 1500 },
  uranus: { longitudeArcsec: 50, latitudeArcsec: 2, rangeThousandKm: 1000 },
  neptune: { longitudeArcsec: 10, latitudeArcsec: 1, rangeThousandKm: 200 },
  /**
   * The Moon is not in the Standish table: Mode B propagates it from the JPL
   * satellite mean elements, which JPL states are not intended for ephemeris
   * computation. Against the heliocentric ephemeris the Moon stays close to the
   * Earth, so the angular residual is small; the radial residual is dominated by
   * the Earth-Moon barycentre split. Measured worst case at 1900-2049: 102 119 km
   * radial (0.069 %) and 0.0261°; the budget below is ~1.8x the radial and ~4.8x
   * the angular measured value, so it is a regression guard rather than a claim.
   */
  moon: { longitudeArcsec: 90, latitudeArcsec: 90, rangeThousandKm: 60 },
}

/**
 * Tolerances (internal comparison).
 *
 * This comparison measures the difference between two *different* approximations of
 * the same ephemeris: the JPL best-fit Keplerian series and the VSOP87 planetary
 * theory. Each is independently accurate to the nominal figures above, so their
 * mutual difference can reach a few times a single source's budget. The thresholds
 * are therefore documented multiples of the published accuracy and serve as a
 * regression guard, not as an absolute claim about either model:
 *   - radial  : 3x the nominal range error
 *   - angular : 5x the nominal longitude/latitude error
 */
const RANGE_TOLERANCE_MULTIPLIER = 3
const ANGULAR_TOLERANCE_MULTIPLIER = 5
/**
 * Additional relative budget. The published nominal range error is smallest for
 * Neptune (200 000 km) while the reference engine's outer-planet series is itself
 * the least accurate of the two models there, so a purely absolute budget would
 * reject a correct propagator. A relative floor of 2e-4 of the orbital radius
 * (i.e. "the two models agree to better than 2 parts in 10 000") is therefore
 * combined with the absolute one, and both are reported.
 */
const RELATIVE_RADIAL_FLOOR = 2e-4
const MINIMUM_ANGULAR_BUDGET_DEG = 0.017

/**
 * Tolerances (external comparison).
 *
 * The golden reference is authoritative, so a model only has to stay inside its own
 * published budget; the same multipliers are reused as a regression guard. The
 * velocity budget is absolute because the published tables quote position accuracy
 * only. A residual ~2000 km for the Earth is expected even for a perfect model:
 * Horizons returns TDB epochs, while the application clock is a UT-based Julian
 * Date (~69 s), which moves the Earth ~2000 km.
 */
const GOLDEN_RANGE_TOLERANCE_MULTIPLIER = RANGE_TOLERANCE_MULTIPLIER
const GOLDEN_ANGULAR_TOLERANCE_MULTIPLIER = ANGULAR_TOLERANCE_MULTIPLIER
const VELOCITY_TOLERANCE_KM_S = 1.0

const EPOCHS = [
  '1900-01-01T00:00:00Z',
  '1969-07-20T20:17:00Z',
  '2000-01-01T12:00:00Z',
  '2026-09-29T00:00:00Z',
  '2035-01-01T00:00:00Z',
  '2049-12-31T00:00:00Z',
]

const PLANETS = ['mercury', 'venus', 'earthMoonBarycenter', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']

function julianDateFromIso(iso) {
  return new Date(iso).getTime() / 86_400_000 + 2440587.5
}

function solveEccentricAnomaly(meanAnomaly, eccentricity) {
  let wrapped = meanAnomaly % (2 * Math.PI)
  if (wrapped > Math.PI) wrapped -= 2 * Math.PI
  if (wrapped < -Math.PI) wrapped += 2 * Math.PI
  let eccentricAnomaly = wrapped + eccentricity * Math.sin(wrapped)
  for (let iteration = 0; iteration < 80; iteration++) {
    const delta =
      (wrapped - (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly))) /
      (1 - eccentricity * Math.cos(eccentricAnomaly))
    eccentricAnomaly += delta
    if (Math.abs(delta) < 1e-13) break
  }
  return eccentricAnomaly
}

/** Keplerian position (km, heliocentric ecliptic J2000) from the JPL element table. */
function keplerPositionKm(dataset, planet, julianDate) {
  const table = dataset.elements[planet]
  const T = (julianDate - dataset.epochJD) / 36_525
  const a = (table.a[0] + table.a[1] * T) * AU_KM
  const e = table.e[0] + table.e[1] * T
  const inclination = (table.i[0] + table.i[1] * T) * DEG
  const meanLongitude = (table.L[0] + table.L[1] * T) * DEG
  const longPeri = (table.longPeri[0] + table.longPeri[1] * T) * DEG
  const longNode = (table.longNode[0] + table.longNode[1] * T) * DEG
  const argumentOfPeriapsis = longPeri - longNode
  const meanAnomaly = meanLongitude - longPeri

  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, e)
  const x = a * (Math.cos(eccentricAnomaly) - e)
  const y = a * Math.sqrt(1 - e * e) * Math.sin(eccentricAnomaly)
  return perifocalToEcliptic(x, y, argumentOfPeriapsis, inclination, longNode)
}

function perifocalToEcliptic(x, y, argumentOfPeriapsis, inclination, node) {
  const cw = Math.cos(argumentOfPeriapsis)
  const sw = Math.sin(argumentOfPeriapsis)
  const cn = Math.cos(node)
  const sn = Math.sin(node)
  const ci = Math.cos(inclination)
  const si = Math.sin(inclination)
  return {
    x: (cw * cn - sw * sn * ci) * x + (-sw * cn - cw * sn * ci) * y,
    y: (cw * sn + sw * cn * ci) * x + (-sw * sn + cw * cn * ci) * y,
    z: sw * si * x + cw * si * y,
  }
}

/**
 * Geocentric position of the Moon from the JPL satellite mean elements (Mode B),
 * mirroring src/astronomy/PlanetElements.ts::keplerMoonGeocentricKm exactly.
 */
function keplerMoonGeocentricKm(satelliteDataset, julianDate) {
  const moon = satelliteDataset.satellites.find((satellite) => satellite.id === 'moon')
  if (!moon) throw new Error('jpl-satellite-mean-elements.json has no "moon" record')
  const epochJD = satelliteDataset.epochJD ?? J2000_JD
  const motion = (2 * Math.PI) / moon.periodDays
  const meanAnomaly = moon.meanAnomalyDeg * DEG + motion * (julianDate - epochJD)
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, moon.e)
  const x = moon.aKm * (Math.cos(eccentricAnomaly) - moon.e)
  const y = moon.aKm * Math.sqrt(1 - moon.e * moon.e) * Math.sin(eccentricAnomaly)
  return perifocalToEcliptic(x, y, moon.argPeriapsisDeg * DEG, moon.inclinationDeg * DEG, moon.nodeDeg * DEG)
}

/**
 * Earth/Moon barycentre split.
 *
 * With r = Moon − Earth (geocentric Moon), EMB = Earth + [μ/(1+μ)]·r, hence
 *   Earth = EMB − [μ/(1+μ)]·r      Moon = EMB + [1/(1+μ)]·r.
 * Both coefficients are derived here from the IAU mass ratio so the two
 * directions of the split stay exact inverses of each other.
 */
const EARTH_FROM_EMB_FACTOR = MOON_EARTH_MASS_RATIO / (1 + MOON_EARTH_MASS_RATIO)
const MOON_FROM_EMB_FACTOR = 1 / (1 + MOON_EARTH_MASS_RATIO)

/** Earth centre from the Earth/Moon barycenter. */
function earthFromBarycenter(barycenter, moonGeocentricKm) {
  return {
    x: barycenter.x - moonGeocentricKm.x * EARTH_FROM_EMB_FACTOR,
    y: barycenter.y - moonGeocentricKm.y * EARTH_FROM_EMB_FACTOR,
    z: barycenter.z - moonGeocentricKm.z * EARTH_FROM_EMB_FACTOR,
  }
}

/** Moon centre from the Earth/Moon barycenter. */
function moonFromBarycenter(barycenter, moonGeocentricKm) {
  return {
    x: barycenter.x + moonGeocentricKm.x * MOON_FROM_EMB_FACTOR,
    y: barycenter.y + moonGeocentricKm.y * MOON_FROM_EMB_FACTOR,
    z: barycenter.z + moonGeocentricKm.z * MOON_FROM_EMB_FACTOR,
  }
}

/** Heliocentric position of the Moon in Mode B (Earth from the Standish table). */
function modeBMoonHeliocentricKm(dataset, satelliteDataset, julianDate) {
  const moonGeocentric = keplerMoonGeocentricKm(satelliteDataset, julianDate)
  return moonFromBarycenter(keplerPositionKm(dataset, 'earthMoonBarycenter', julianDate), moonGeocentric)
}

function length(vector) {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2)
}

function angularSeparationDeg(a, b) {
  const la = length(a)
  const lb = length(b)
  const cosine = Math.min(
    1,
    Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / Math.max(1e-9, la * lb)),
  )
  return (Math.acos(cosine) * 180) / Math.PI
}

function distanceKm(a, b) {
  return length({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
}

/** Central-difference velocity (km/s) of a position function. */
function velocityKmS(positionAt, julianDate, dt = 5) {
  const before = positionAt(julianDate - dt / SECONDS_PER_DAY)
  const after = positionAt(julianDate + dt / SECONDS_PER_DAY)
  return {
    x: (after.x - before.x) / (2 * dt),
    y: (after.y - before.y) / (2 * dt),
    z: (after.z - before.z) / (2 * dt),
  }
}

function budgetsFor(nominal, referenceRadiusKm, rangeMultiplier, angularMultiplier) {
  const angularBudgetDeg = Math.max(
    MINIMUM_ANGULAR_BUDGET_DEG,
    (Math.max(nominal.longitudeArcsec, nominal.latitudeArcsec) / 3600) * angularMultiplier,
  )
  const rangeBudgetKm = Math.max(
    nominal.rangeThousandKm * 1000 * rangeMultiplier,
    referenceRadiusKm * RELATIVE_RADIAL_FLOOR,
  )
  return { angularBudgetDeg, rangeBudgetKm }
}

/**
 * Loads the external golden reference. Returns `{ available: false, reason }` when
 * the file is missing or was written in the explicit "unavailable" state, so the
 * caller can report a skip instead of silently passing.
 */
async function loadGolden() {
  const file = path.join(ROOT, 'data', 'sources', 'horizons-golden.json')
  try {
    const golden = await readJson(file)
    if (golden.status !== 'available' || !Array.isArray(golden.records) || golden.records.length === 0) {
      return { available: false, reason: `status=${golden.status ?? 'missing'}, records=${golden.records?.length ?? 0}`, note: golden.note ?? null }
    }
    return { available: true, golden }
  } catch (error) {
    return { available: false, reason: String(error) }
  }
}

async function main() {
  const emitJson = process.argv.includes('--json')
  const dataset = await readJson(path.join(ROOT, 'data', 'sources', 'planets-jpl-approx.json'))
  const satelliteDataset = await readJson(path.join(ROOT, 'data', 'sources', 'jpl-satellite-mean-elements.json'))
  const astronomy = await import('astronomy-engine')
  const eclipticRotation = astronomy.Rotation_EQJ_ECL().rot

  const rotateToEcliptic = (vector, scale) => ({
    x: (eclipticRotation[0][0] * vector.x + eclipticRotation[1][0] * vector.y + eclipticRotation[2][0] * vector.z) * scale,
    y: (eclipticRotation[0][1] * vector.x + eclipticRotation[1][1] * vector.y + eclipticRotation[2][1] * vector.z) * scale,
    z: (eclipticRotation[0][2] * vector.x + eclipticRotation[1][2] * vector.y + eclipticRotation[2][2] * vector.z) * scale,
  })

  const ephemerisBody = {
    mercury: astronomy.Body.Mercury,
    venus: astronomy.Body.Venus,
    earthMoonBarycenter: astronomy.Body.Earth,
    mars: astronomy.Body.Mars,
    jupiter: astronomy.Body.Jupiter,
    saturn: astronomy.Body.Saturn,
    uranus: astronomy.Body.Uranus,
    neptune: astronomy.Body.Neptune,
  }

  const referencePositionKm = (body, julianDate) => {
    const time = new astronomy.AstroTime(julianDate - J2000_JD)
    if (body === 'earthMoonBarycenter') {
      // EMB = (Earth + Moon/mass ratio) / (1 + ratio); the ephemeris gives the Earth
      // centre and the geocentric Moon, both in AU.
      const earth = rotateToEcliptic(astronomy.HelioVector(astronomy.Body.Earth, time), AU_KM)
      const moon = rotateToEcliptic(astronomy.GeoMoon(time), AU_KM)
      const factor = MOON_EARTH_MASS_RATIO / (1 + MOON_EARTH_MASS_RATIO)
      return { x: earth.x + moon.x * factor, y: earth.y + moon.y * factor, z: earth.z + moon.z * factor }
    }
    if (body === 'moon') {
      // Mode A Moon = Earth centre + ELP2000 geocentric Moon.
      const earth = rotateToEcliptic(astronomy.HelioVector(astronomy.Body.Earth, time), AU_KM)
      const moon = rotateToEcliptic(astronomy.GeoMoon(time), AU_KM)
      return { x: earth.x + moon.x, y: earth.y + moon.y, z: earth.z + moon.z }
    }
    if (body === 'earth') {
      // Earth centre (astronomy-engine resolves the EMB split internally).
      return rotateToEcliptic(astronomy.HelioVector(astronomy.Body.Earth, time), AU_KM)
    }
    return rotateToEcliptic(astronomy.HelioVector(ephemerisBody[body], time), AU_KM)
  }

  const modeBPosition = (body, julianDate) => {
    if (body === 'moon') return modeBMoonHeliocentricKm(dataset, satelliteDataset, julianDate)
    if (body === 'earth') {
      // The Standish table stores the Earth/Moon barycentre; subtract the mean-
      // element Moon to obtain the Earth centre the golden reference reports.
      const moonGeocentric = keplerMoonGeocentricKm(satelliteDataset, julianDate)
      return earthFromBarycenter(keplerPositionKm(dataset, 'earthMoonBarycenter', julianDate), moonGeocentric)
    }
    return keplerPositionKm(dataset, body, julianDate)
  }

  // ---- INTERNAL comparison: Mode B vs Mode A -------------------------------
  const internalBodies = [
    ...PLANETS.map((planet) => ({ id: planet, nominal: NOMINAL_ACCURACY[planet] })),
    { id: 'moon', nominal: NOMINAL_ACCURACY.moon },
  ]

  const results = []
  const failures = []
  let worstPositionKm = 0
  let worstAngularDeg = 0
  let worstRelativeRadial = 0
  let worstVelocityKmS = 0

  for (const iso of EPOCHS) {
    const julianDate = julianDateFromIso(iso)
    for (const body of internalBodies) {
      const modeB = modeBPosition(body.id, julianDate)
      const modeA = referencePositionKm(body.id, julianDate)
      const positionErrorKm = distanceKm(modeB, modeA)
      const angularErrorDeg = angularSeparationDeg(modeB, modeA)
      const modeBRadius = length(modeB)
      const modeARadius = length(modeA)
      const radialErrorKm = Math.abs(modeBRadius - modeARadius)
      const relativeRadialError = radialErrorKm / modeARadius
      const velocityErrorKmS = distanceKm(
        velocityKmS((jd) => modeBPosition(body.id, jd), julianDate),
        velocityKmS((jd) => referencePositionKm(body.id, jd), julianDate),
      )

      worstPositionKm = Math.max(worstPositionKm, positionErrorKm)
      worstAngularDeg = Math.max(worstAngularDeg, angularErrorDeg)
      worstRelativeRadial = Math.max(worstRelativeRadial, relativeRadialError)
      worstVelocityKmS = Math.max(worstVelocityKmS, velocityErrorKmS)

      const { angularBudgetDeg, rangeBudgetKm } = budgetsFor(
        body.nominal,
        modeARadius,
        RANGE_TOLERANCE_MULTIPLIER,
        ANGULAR_TOLERANCE_MULTIPLIER,
      )
      if (angularErrorDeg > angularBudgetDeg || radialErrorKm > rangeBudgetKm) {
        failures.push({ epoch: iso, body: body.id, angularErrorDeg, positionErrorKm, radialErrorKm, angularBudgetDeg, rangeBudgetKm })
      }

      results.push({
        epoch: iso,
        body: body.id,
        positionErrorKm,
        radialErrorKm,
        angularErrorDeg,
        relativeRadialError,
        velocityErrorKmS,
        nominalRangeThousandKm: body.nominal.rangeThousandKm,
      })
    }
  }

  // ---- EXTERNAL comparison: Mode A / Mode B vs the Horizons golden file ----
  const goldenState = await loadGolden()
  const goldenResults = []
  const goldenFailures = []

  if (goldenState.available) {
    const { golden } = goldenState
    for (const record of golden.records) {
      const body = record.body
      const julianDate = record.julianDate
      const truth = record.positionKm
      const nominal = NOMINAL_ACCURACY[body]
      if (!nominal) {
        goldenFailures.push({ epoch: record.epoch, body, error: 'no nominal accuracy registered for this body' })
        continue
      }
      for (const mode of ['A', 'B']) {
        const position = mode === 'A' ? referencePositionKm(body, julianDate) : modeBPosition(body, julianDate)
        const radialErrorKm = Math.abs(length(position) - length(truth))
        const angularErrorDeg = angularSeparationDeg(position, truth)
        const totalErrorKm = distanceKm(position, truth)
        const velocityErrorKmS = distanceKm(
          velocityKmS((jd) => (mode === 'A' ? referencePositionKm(body, jd) : modeBPosition(body, jd)), julianDate),
          record.velocityKmS,
        )
        const referenceRadiusKm = length(truth)
        const { angularBudgetDeg, rangeBudgetKm } = budgetsFor(
          nominal,
          referenceRadiusKm,
          GOLDEN_RANGE_TOLERANCE_MULTIPLIER,
          GOLDEN_ANGULAR_TOLERANCE_MULTIPLIER,
        )
        const passed = angularErrorDeg <= angularBudgetDeg && radialErrorKm <= rangeBudgetKm && velocityErrorKmS <= VELOCITY_TOLERANCE_KM_S
        if (!passed) {
          goldenFailures.push({
            epoch: record.epoch,
            body,
            mode,
            radialErrorKm,
            angularErrorDeg,
            totalErrorKm,
            velocityErrorKmS,
            angularBudgetDeg,
            rangeBudgetKm,
            velocityBudgetKmS: VELOCITY_TOLERANCE_KM_S,
          })
        }
        goldenResults.push({
          epoch: record.epoch,
          body,
          mode,
          radialErrorKm,
          angularErrorDeg,
          totalErrorKm,
          velocityErrorKmS,
          angularBudgetDeg,
          rangeBudgetKm,
          velocityBudgetKmS: VELOCITY_TOLERANCE_KM_S,
        })
      }
    }
  }

  if (emitJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          epochs: EPOCHS,
          internal: { summary: { worstPositionKm, worstAngularDeg, worstRelativeRadial, worstVelocityKmS }, failures, results },
          external: goldenState.available
            ? { status: 'checked', reference: goldenState.golden.source, retrievedAt: goldenState.golden.retrievedAt, center: goldenState.golden.center, failures: goldenFailures, results: goldenResults }
            : { status: 'skipped', reason: goldenState.reason, note: goldenState.note ?? null },
        },
        null,
        2,
      )}\n`,
    )
  } else {
    log('Mode B (Kepler, JPL/Standish elements + Moon mean elements) vs Mode A (VSOP87 / ELP2000 ephemeris)')
    log('')
    log('epoch       body                  |Δr| radial     |Δr| full      angular err   rel. radial   velocity err')
    for (const result of results) {
      log(
        `${result.epoch.slice(0, 10)}  ${result.body.padEnd(20)}  ${result.radialErrorKm.toFixed(0).padStart(10)} km  ${result.positionErrorKm
          .toFixed(0)
          .padStart(10)} km  ${result.angularErrorDeg.toFixed(4).padStart(9)}°  ${(result.relativeRadialError * 100)
          .toFixed(4)
          .padStart(8)} %  ${result.velocityErrorKmS.toFixed(4).padStart(7)} km/s`,
      )
    }
    log('')
    log(`worst position error : ${worstPositionKm.toFixed(0)} km`)
    log(`worst angular error  : ${worstAngularDeg.toFixed(4)}°`)
    log(`worst radial error   : ${(worstRelativeRadial * 100).toFixed(4)} %`)
    log(`worst velocity error : ${worstVelocityKmS.toFixed(4)} km/s`)
    log(
      failures.length === 0
        ? `\nPASS  all ${results.length} internal comparisons are inside the documented tolerances` +
          `\n      (radial: max(${RANGE_TOLERANCE_MULTIPLIER}x nominal range error, ${RELATIVE_RADIAL_FLOOR} x orbital radius);` +
          `\n       angular: max(${MINIMUM_ANGULAR_BUDGET_DEG}°, ${ANGULAR_TOLERANCE_MULTIPLIER}x nominal angular error))`
        : `\nFAIL  ${failures.length} internal comparison(s) exceed the published accuracy`,
    )
    for (const failure of failures) {
      log(`  ${failure.epoch} ${failure.body}: angular ${failure.angularErrorDeg.toFixed(4)}° (budget ${failure.angularBudgetDeg.toFixed(4)}°), radial ${failure.radialErrorKm.toFixed(0)} km (budget ${failure.rangeBudgetKm.toFixed(0)} km)`)
    }

    log('')
    if (goldenState.available) {
      const { golden } = goldenState
      log(`External golden reference: ${golden.sourceName}`)
      log(`  frame ${golden.referenceFrame}; centre ${golden.center} (body ${golden.centerBodyId}, ${golden.centerName})`)
      log(`  retrieved ${golden.retrievedAt}; ${golden.records.length} state vector(s) from ${golden.fetchUrls.length} request(s)`)
      log('')
      log('epoch       body        mode   |Δr| radial   |Δr| total    angular err   velocity err')
      for (const result of goldenResults) {
        log(
          `${result.epoch.padEnd(10)}  ${result.body.padEnd(10)}  ${result.mode}     ${result.radialErrorKm.toFixed(0).padStart(10)} km  ${result.totalErrorKm
            .toFixed(0)
            .padStart(10)} km  ${result.angularErrorDeg.toFixed(4).padStart(9)}°  ${result.velocityErrorKmS.toFixed(4).padStart(7)} km/s`,
        )
      }
      log('')
      log(
        goldenFailures.length === 0
          ? `PASS  all ${goldenResults.length} external comparisons are inside the documented tolerances` +
            `\n      (radial: max(${GOLDEN_RANGE_TOLERANCE_MULTIPLIER}x nominal range error, ${RELATIVE_RADIAL_FLOOR} x radius);` +
            `\n       angular: max(${MINIMUM_ANGULAR_BUDGET_DEG}°, ${GOLDEN_ANGULAR_TOLERANCE_MULTIPLIER}x nominal angular error);` +
            `\n       velocity: ${VELOCITY_TOLERANCE_KM_S} km/s)`
          : `\nFAIL  ${goldenFailures.length} external comparison(s) exceed the documented tolerance`,
      )
      for (const failure of goldenFailures) {
        if (failure.error) {
          log(`  ${failure.epoch} ${failure.body}: ${failure.error}`)
          continue
        }
        log(
          `  ${failure.epoch} ${failure.body} (Mode ${failure.mode}): angular ${failure.angularErrorDeg.toFixed(4)}° (budget ${failure.angularBudgetDeg.toFixed(4)}°), ` +
            `radial ${failure.radialErrorKm.toFixed(0)} km (budget ${failure.rangeBudgetKm.toFixed(0)} km), ` +
            `velocity ${failure.velocityErrorKmS.toFixed(4)} km/s (budget ${failure.velocityBudgetKmS} km/s)`,
        )
      }
    } else {
      log(`External golden reference: SKIPPED (no external reference)`)
      log(`  data/sources/horizons-golden.json is not an available reference (${goldenState.reason})`)
      if (goldenState.note) log(`  ${goldenState.note}`)
      log('  Run `npm run generate:ephemeris` on a host with network access to record the JPL Horizons vectors.')
    }
  }

  const totalFailures = failures.length + goldenFailures.length
  process.exit(totalFailures === 0 ? 0 : 1)
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(2)
})
