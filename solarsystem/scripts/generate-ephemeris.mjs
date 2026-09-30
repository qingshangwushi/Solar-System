/**
 * Generate the *external* golden ephemeris reference consumed by the science gate
 * (`scripts/verify-ephemeris.mjs`, specification §48/§60).
 *
 * Why an external reference: comparing the application's Keplerian propagation
 * (Mode B) with its own ephemeris engine (Mode A) only measures the disagreement
 * between two internal approximations. This script downloads authoritative state
 * vectors from the NASA/JPL Horizons system so the gate has a third, independent
 * source of truth.
 *
 * Source: https://ssd.jpl.nasa.gov/api/horizons.api
 *   EPHEM_TYPE=VECTORS, CENTER='500@10' (Sun body centre),
 *   REF_PLANE=ECLIPTIC, REF_SYSTEM=J2000, OUT_UNITS=KM-S
 *   => heliocentric ecliptic J2000 position (km) and velocity (km/s) in TDB.
 * License: NASA/JPL data are in the public domain.
 *
 * Output: data/sources/horizons-golden.json
 *
 * Every returned row is checked against the published perihelion/aphelion range
 * and orbital-speed range of its body before it is written; a row that fails is
 * discarded and reported rather than recorded. If Horizons cannot be reached the
 * script writes a file with `status: "unavailable"` and an empty `records` array
 * (never invented numbers); the verification gate then reports that comparison as
 * SKIPPED instead of passing it.
 *
 * Usage:
 *   node scripts/generate-ephemeris.mjs            # fetch (needs network)
 *   node scripts/generate-ephemeris.mjs --self-test # offline parser/format check
 */
import path from 'node:path'
import { SOURCE_DIR, encodeQuery, fileExists, httpText, log, readJson, writeJson } from './lib/io.mjs'

const OUTPUT_FILE = path.join(SOURCE_DIR, 'horizons-golden.json')
const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const SUN_CENTER = '500@10'
const SUN_BODY_ID = '10'
const AU_KM = 149_597_870.7

/**
 * Bodies the report requires (§60 names the Moon explicitly) and the sanity
 * envelope used to reject a mis-parsed or mis-labelled row. The radial bounds are
 * the published perihelion/aphelion distances; the speed bounds are the published
 * perihelion/aphelion orbital speeds with a small margin for the Moon's
 * geocentric offset.
 */
const TARGETS = [
  { id: 'mercury', command: '199', name: 'Mercury', radialAu: [0.3, 0.48], speedKmS: [37, 61] },
  { id: 'earth', command: '399', name: 'Earth', radialAu: [0.98, 1.02], speedKmS: [29, 30.6] },
  { id: 'mars', command: '499', name: 'Mars', radialAu: [1.37, 1.68], speedKmS: [21.5, 27] },
  { id: 'jupiter', command: '599', name: 'Jupiter', radialAu: [4.9, 5.5], speedKmS: [12, 14.5] },
  { id: 'saturn', command: '699', name: 'Saturn', radialAu: [9, 10.2], speedKmS: [8.8, 10.5] },
  // Heliocentric Moon: ~1 au plus the geocentric offset (0.00257 au), and the
  // Earth's orbital speed plus/minus the Moon's 1.02 km/s geocentric speed.
  { id: 'moon', command: '301', name: 'Moon', radialAu: [0.97, 1.03], speedKmS: [28.5, 31.1] },
]

/** Epochs the science gate evaluates; Horizons accepts these calendar dates directly. */
const EPOCHS = ['2000-01-01', '2026-09-29', '2035-01-01', '2049-12-31']

/**
 * Parses a Horizons `VECTORS` text table. The documented layout is three lines
 * per record (JD/date, position, velocity); the value labels may omit the space
 * after `=` (e.g. `Y =-2.7E+07`), so the parser is whitespace-insensitive.
 * Exported so the `--self-test` path can exercise it without the network.
 */
export function parseHorizonsVectors(text) {
  const start = text.indexOf('$$SOE')
  const end = text.indexOf('$$EOE')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Horizons response contains no $$SOE/$$EOE table')
  }
  const records = []
  let current = null
  for (const line of text.slice(start + 5, end).split('\n')) {
    const jdMatch = /^\s*([0-9]+\.[0-9]+)\s*=/.exec(line)
    if (jdMatch) {
      if (current?.positionKm && current?.velocityKmS) records.push(current)
      current = { julianDate: Number(jdMatch[1]) }
      continue
    }
    if (!current) continue
    const values = {}
    for (const match of line.matchAll(/\b(V?[XYZ])\s*=\s*(-?(?:\d+\.?\d*|\.\d+)(?:[EeDd][+-]?\d+)?)/g)) {
      values[match[1]] = Number(match[2].replace(/[Dd]/, 'E'))
    }
    if ('X' in values && 'Y' in values && 'Z' in values) {
      current.positionKm = { x: values.X, y: values.Y, z: values.Z }
    }
    if ('VX' in values && 'VY' in values && 'VZ' in values) {
      current.velocityKmS = { x: values.VX, y: values.VY, z: values.VZ }
    }
  }
  if (current?.positionKm && current?.velocityKmS) records.push(current)
  return records
}

/** Julian Date (UTC) of an ISO date at 00:00, using the Unix-epoch definition. */
function julianDateFromIsoDay(iso) {
  return new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000 + 2440587.5
}

function nextDay(iso) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

/** Exact request URL, built the same way for every body/epoch so it is auditable. */
function buildRequestUrl(command, iso) {
  return `${HORIZONS_API}?${encodeQuery({
    format: 'text',
    COMMAND: `'${command}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${SUN_CENTER}'`,
    START_TIME: `'${iso}'`,
    STOP_TIME: `'${nextDay(iso)}'`,
    STEP_SIZE: "'1d'",
    VEC_TABLE: "'2'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'J2000'",
    OUT_UNITS: "'KM-S'",
  })}`
}

const round = (value, digits) => Number(value.toFixed(digits))

function vectorLength(vector) {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2)
}

/** True when the state vector is consistent with the published orbit of the body. */
function sanityCheck(target, positionKm, velocityKmS) {
  const radiusAu = vectorLength(positionKm) / AU_KM
  const speedKmS = vectorLength(velocityKmS)
  const [minAu, maxAu] = target.radialAu
  const [minSpeed, maxSpeed] = target.speedKmS
  const radiusOk = radiusAu >= minAu && radiusAu <= maxAu
  const speedOk = speedKmS >= minSpeed && speedKmS <= maxSpeed
  return { passed: radiusOk && speedOk, radiusAu, speedKmS, radiusOk, speedOk }
}

async function fetchGoldenRecords() {
  const records = []
  const discarded = []
  const errors = []
  const fetchUrls = []
  let consecutiveFailures = 0

  for (const iso of EPOCHS) {
    const epochJd = julianDateFromIsoDay(iso)
    for (const target of TARGETS) {
      const url = buildRequestUrl(target.command, iso)
      fetchUrls.push(url)
      let text
      try {
        // One request at a time (JPL fair-use policy); a short timeout keeps an
        // unreachable host from stalling the whole verification run.
        text = await httpText(url, { retries: 2, timeoutMs: 15_000 })
        consecutiveFailures = 0
      } catch (error) {
        errors.push({ body: target.id, epoch: iso, error: String(error) })
        log(`  ! ${target.id} @ ${iso}: ${String(error)}`)
        // If the very first requests fail there is no point hammering the host
        // 24 more times: treat it as "no network" and fall back to the stub.
        if (records.length === 0 && ++consecutiveFailures >= 2) throw error
        continue
      }

      const rows = parseHorizonsVectors(text)
      if (rows.length === 0) {
        errors.push({ body: target.id, epoch: iso, error: 'no vector rows in response' })
        continue
      }
      // START..STOP spans one day at a 1-day step, so pick the row at the epoch.
      const row = rows.reduce((best, candidate) =>
        Math.abs(candidate.julianDate - epochJd) < Math.abs(best.julianDate - epochJd) ? candidate : best,
      )
      const check = sanityCheck(target, row.positionKm, row.velocityKmS)
      if (!check.passed) {
        discarded.push({ body: target.id, epoch: iso, ...check })
        log(
          `  ! discarded ${target.id} @ ${iso}: r=${check.radiusAu.toFixed(5)} au, v=${check.speedKmS.toFixed(3)} km/s ` +
            `(expected r ${target.radialAu.join('-')} au, v ${target.speedKmS.join('-')} km/s)`,
        )
        continue
      }
      records.push({
        body: target.id,
        command: target.command,
        epoch: iso,
        julianDate: epochJd,
        positionKm: row.positionKm,
        velocityKmS: row.velocityKmS,
        radiusAu: round(check.radiusAu, 8),
        speedKmS: round(check.speedKmS, 6),
      })
      log(`  ok ${target.id.padEnd(8)} @ ${iso}  r=${check.radiusAu.toFixed(6)} au  v=${check.speedKmS.toFixed(4)} km/s`)
    }
  }
  return { records, discarded, errors, fetchUrls }
}

function unavailableDocument(reason) {
  return {
    $comment:
      'External golden ephemeris reference for the science gate. Generated by scripts/generate-ephemeris.mjs from the NASA/JPL Horizons API.',
    status: 'unavailable',
    source: HORIZONS_API,
    sourceName: 'NASA/JPL Horizons System (VECTORS ephemeris, heliocentric ecliptic J2000)',
    center: SUN_CENTER,
    centerBodyId: SUN_BODY_ID,
    centerName: 'Sun body centre (Horizons 500@10)',
    referenceFrame: 'heliocentric ecliptic J2000 (REF_PLANE=ECLIPTIC, REF_SYSTEM=J2000)',
    timeScale: 'TDB',
    units: { position: 'km', velocity: 'km/s', epoch: 'Julian Date (TDB); calendar dates are UT' },
    license: 'NASA/JPL public domain',
    retrievedAt: null,
    generatedAt: new Date().toISOString(),
    request: { api: HORIZONS_API, epochs: EPOCHS, targets: TARGETS.map((target) => ({ id: target.id, command: target.command, name: target.name })) },
    fetchUrls: [],
    sanityChecks: { description: 'rows are validated against the published radial and speed range before being recorded', discarded: [] },
    records: [],
    note:
      `JPL Horizons was not reachable from this machine, so no external vectors were recorded (reason: ${reason}). ` +
      'NO numbers were invented. Run `npm run generate:ephemeris` on a host with network access: it requests ' +
      "VECTORS tables with CENTER='500@10' (Sun centre), REF_PLANE=ECLIPTIC, REF_SYSTEM=J2000, OUT_UNITS=KM-S for " +
      `${TARGETS.map((target) => target.name).join(', ')} at ${EPOCHS.join(', ')}, validates every row, and writes them here. ` +
      'Until then scripts/verify-ephemeris.mjs reports the external comparison as SKIPPED (no external reference).',
  }
}

async function main() {
  if (process.argv.includes('--self-test')) {
    // Synthetic *format* fixture (not physical data, never written to disk): it
    // only proves the parser handles the documented Horizons layout.
    const fixture = [
      'API VERSION: 1.3',
      '$$SOE',
      ' 2400000.500000000 = A.D. 1858-Nov-17 00:00:00.0000 TDB ',
      ' X = 1.000000000000000E+00 Y =-2.500000000000000E+00 Z = 3.000000000000000E-01',
      ' VX= 4.000000000000000E-03 VY= 5.000000000000000E-03 VZ=-6.000000000000000E-04',
      '$$EOE',
    ].join('\n')
    const parsed = parseHorizonsVectors(fixture)
    if (parsed.length !== 1) throw new Error(`self-test expected 1 record, parsed ${parsed.length}`)
    const record = parsed[0]
    const expected = { x: 1, y: -2.5, z: 0.3, vx: 0.004, vy: 0.005, vz: -0.0006 }
    const actual = { x: record.positionKm.x, y: record.positionKm.y, z: record.positionKm.z, vx: record.velocityKmS.x, vy: record.velocityKmS.y, vz: record.velocityKmS.z }
    for (const key of Object.keys(expected)) {
      if (Math.abs(actual[key] - expected[key]) > 1e-12) throw new Error(`self-test mismatch on ${key}: ${actual[key]} != ${expected[key]}`)
    }
    log('PASS  Horizons VECTORS parser self-test (synthetic format fixture, no data recorded)')
    return
  }

  log(`Querying NASA/JPL Horizons for ${TARGETS.length} bodies x ${EPOCHS.length} epochs ...`)
  let result
  try {
    result = await fetchGoldenRecords()
  } catch (error) {
    result = { records: [], discarded: [], errors: [{ error: String(error) }], fetchUrls: [] }
    log(`  ! Horizons request failed: ${String(error)}`)
  }

  if (result.records.length === 0) {
    // Never overwrite a previously fetched, valid reference with an empty stub.
    if (await fileExists(OUTPUT_FILE)) {
      try {
        const existing = await readJson(OUTPUT_FILE)
        if (existing.status === 'available' && Array.isArray(existing.records) && existing.records.length > 0) {
          log(`  ! Horizons unavailable, but ${path.relative(SOURCE_DIR, OUTPUT_FILE)} already holds ${existing.records.length} record(s); keeping the existing reference.`)
          return
        }
      } catch {
        // Unreadable existing file: fall through and replace it with the stub.
      }
    }
    const reason = result.errors[0]?.error ?? 'no rows returned'
    await writeJson(OUTPUT_FILE, unavailableDocument(reason))
    log('')
    log(`SKIPPED  no external reference available (${reason})`)
    log('         wrote an "unavailable" stub with an empty records array and no invented numbers')
    return
  }

  const document = {
    $comment:
      'External golden ephemeris reference for the science gate. Generated by scripts/generate-ephemeris.mjs from the NASA/JPL Horizons API.',
    status: 'available',
    source: HORIZONS_API,
    sourceName: 'NASA/JPL Horizons System (VECTORS ephemeris, heliocentric ecliptic J2000)',
    center: SUN_CENTER,
    centerBodyId: SUN_BODY_ID,
    centerName: 'Sun body centre (Horizons 500@10)',
    referenceFrame: 'heliocentric ecliptic J2000 (REF_PLANE=ECLIPTIC, REF_SYSTEM=J2000)',
    timeScale: 'TDB',
    units: { position: 'km', velocity: 'km/s', epoch: 'Julian Date (TDB); calendar dates are UT' },
    license: 'NASA/JPL public domain',
    retrievedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    request: {
      api: HORIZONS_API,
      center: SUN_CENTER,
      epochs: EPOCHS,
      targets: TARGETS.map((target) => ({ id: target.id, command: target.command, name: target.name })),
    },
    fetchUrls: result.fetchUrls,
    sanityChecks: {
      description:
        'Every row was validated against the published perihelion/aphelion distance and orbital-speed range of its body; failing rows were discarded and are listed here.',
      discarded: result.discarded,
    },
    errors: result.errors,
    records: result.records,
  }
  await writeJson(OUTPUT_FILE, document)
  log('')
  log(`Recorded ${result.records.length} vector(s), discarded ${result.discarded.length}, failed ${result.errors.length}`)
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(1)
})
