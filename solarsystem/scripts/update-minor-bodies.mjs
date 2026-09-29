/**
 * Update the minor-body catalog from the NASA/JPL Small-Body Database (SBDB) Query API.
 *
 * Source: https://ssd-api.jpl.nasa.gov/sbdb_query.api  (public, no key required)
 * License: NASA/JPL data are in the public domain.
 *
 * Output: data/sources/minor-bodies.json
 *
 * Every record carries genuine osculating orbital elements (a, e, i, node,
 * argument of perihelion, mean anomaly and epoch) plus physical parameters where
 * published. Nothing in this file is synthesised or randomised.
 *
 * Usage:  NODE_USE_ENV_PROXY=1 node scripts/update-minor-bodies.mjs
 */
import path from 'node:path'
import {
  SOURCE_DIR,
  encodeQuery,
  httpJson,
  log,
  parseNumber,
  writeJson,
} from './lib/io.mjs'

const API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api'

const FIELDS = [
  'pdes',
  'full_name',
  'name',
  'class',
  'epoch_mjd',
  'a',
  'q',
  'ad',
  'e',
  'i',
  'om',
  'w',
  'ma',
  'tp',
  'per',
  'H',
  'diameter',
  'albedo',
  'rot_per',
  'neo',
  'pha',
  'first_obs',
  'moid',
]

/**
 * Selection plan. `cdata` restricts the query to objects with published
 * magnitudes so that the sample always contains the physically dominant
 * (largest) members of each dynamical class instead of a random slice.
 */
const QUERIES = [
  { key: 'innerMainBelt', label: 'Inner Main Belt', kind: 'a', sbClass: 'IMB', bucket: 'mainBelt', cdata: { AND: ['H|LT|13.5'] }, limit: 2200 },
  { key: 'mainBelt', label: 'Main Belt', kind: 'a', sbClass: 'MBA', bucket: 'mainBelt', cdata: { AND: ['H|LT|12.5'] }, limit: 3200 },
  { key: 'outerMainBelt', label: 'Outer Main Belt', kind: 'a', sbClass: 'OMB', bucket: 'mainBelt', cdata: { AND: ['H|LT|13.5'] }, limit: 1800 },
  // The SBDB has no dedicated Hilda orbit class, so the 3:2 resonance with
  // Jupiter is selected directly from the osculating semi-major axis.
  { key: 'hilda', label: 'Hilda Group (3:2 resonance)', kind: 'a', bucket: 'mainBelt', cdata: { AND: ['a|GT|3.7', 'a|LT|4.2', 'e|LT|0.35', 'H|LT|14'] }, limit: 600 },
  { key: 'marsCrosser', label: 'Mars-crossing Asteroid', kind: 'a', sbClass: 'MCA', bucket: 'nearEarth', cdata: { AND: ['H|LT|15'] }, limit: 600 },
  { key: 'jupiterTrojan', label: 'Jupiter Trojan', kind: 'a', sbClass: 'TJN', bucket: 'trojan', cdata: { AND: ['H|LT|13'] }, limit: 1600 },
  { key: 'centaur', label: 'Centaur', kind: 'a', sbClass: 'CEN', bucket: 'centaur', cdata: null, limit: 500 },
  { key: 'tno', label: 'Trans-Neptunian Object', kind: 'a', sbClass: 'TNO', bucket: 'tno', cdata: { AND: ['H|LT|9'] }, limit: 1600 },
  { key: 'neo', label: 'Near-Earth Object', kind: 'a', sbGroup: 'neo', bucket: 'nearEarth', cdata: { AND: ['H|LT|17.5'] }, limit: 1800 },
  { key: 'pha', label: 'Potentially Hazardous Asteroid', kind: 'a', sbGroup: 'pha', bucket: 'nearEarth', cdata: null, limit: 700 },
  { key: 'comet', label: 'Comet', kind: 'c', bucket: 'comet', cdata: null, limit: 600 },
  { key: 'longPeriodComet', label: 'Long-period Comet', kind: 'c', sbClass: 'COM', bucket: 'comet', cdata: null, limit: 250 },
  { key: 'hyperbolicComet', label: 'Hyperbolic Comet', kind: 'c', sbClass: 'HYP', bucket: 'comet', cdata: null, limit: 200 },
  { key: 'halleyTypeComet', label: 'Halley-type Comet', kind: 'c', sbClass: 'HTC', bucket: 'comet', cdata: null, limit: 150 },
  { key: 'jupiterFamilyComet', label: 'Jupiter-family Comet', kind: 'c', sbClass: 'JFC', bucket: 'comet', cdata: null, limit: 250 },
]

/**
 * Comets that must always be present for guided-tour / exhibition storytelling.
 * The SBDB `EQ` constraint rejects arguments containing spaces, so only compact
 * periodic designations are requested directly; the remaining long-period comets
 * arrive through the orbit-class queries above.
 */
const NOTABLE_DESIGNATIONS = ['1P', '2P', '9P', '19P', '21P', '55P', '67P', '81P', '103P', '109P']

function buildQuery({ sbClass, sbGroup, kind, cdata, limit }) {
  return `${API}?${encodeQuery({
    fields: FIELDS.join(','),
    'sb-class': sbClass,
    'sb-group': sbGroup,
    'sb-kind': kind,
    'sb-cdata': cdata ? JSON.stringify(cdata) : undefined,
    'full-prec': 1,
    limit,
  })}`
}

const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)))

function rowToRecord(fields, row) {
  const raw = Object.fromEntries(fields.map((field, index) => [field, row[index]]))
  const fullName = (raw.full_name ?? '').trim()
  const designation = String(raw.pdes ?? '').trim()
  return {
    pdes: designation,
    name: normalizeName(fullName, designation),
    fullName,
    classCode: raw.class ?? null,
    epochMjd: parseNumber(raw.epoch_mjd),
    semiMajorAxisAu: round(parseNumber(raw.a), 7),
    perihelionDistanceAu: round(parseNumber(raw.q), 8),
    aphelionDistanceAu: round(parseNumber(raw.ad), 7),
    eccentricity: round(parseNumber(raw.e), 7),
    inclinationDeg: round(parseNumber(raw.i), 5),
    longitudeAscendingNodeDeg: round(parseNumber(raw.om), 5),
    argumentOfPeriapsisDeg: round(parseNumber(raw.w), 5),
    meanAnomalyDeg: round(parseNumber(raw.ma), 5),
    // Julian-date (TDB) of perihelion passage; defined for elliptic and hyperbolic orbits alike.
    perihelionJD: parseNumber(raw.tp),
    periodDays: round(parseNumber(raw.per), 4),
    absoluteMagnitude: round(parseNumber(raw.H), 3),
    diameterKm: round(parseNumber(raw.diameter), 3),
    albedo: round(parseNumber(raw.albedo), 4),
    rotationPeriodHours: round(parseNumber(raw.rot_per), 4),
    isNeo: raw.neo === 'Y',
    isPha: raw.pha === 'Y',
    firstObservation: raw.first_obs ?? null,
    moidAu: round(parseNumber(raw.moid), 6),
  }
}

/** "     1 Ceres (A801 AA)" -> "Ceres"; "  1999 CM155" -> "1999 CM155" */
function normalizeName(fullName, designation) {
  const trimmed = fullName.trim()
  if (trimmed === '') return designation
  const withoutNumber = trimmed.replace(/^\d+\s+/, '')
  const withoutProvisional = withoutNumber.replace(/\s*\([^)]*\)\s*$/, '')
  const name = withoutProvisional.trim() || designation
  if (/^\d{4}\s/.test(name)) return name
  return name
}

/**
 * Usable for propagation when the orbit is fully described for either an ellipse
 * (a > 0) or a hyperbola (a < 0 / e >= 1, which is propagated from q and Tp).
 */
function isUsable(record) {
  const hasAngles =
    Number.isFinite(record.inclinationDeg) &&
    Number.isFinite(record.longitudeAscendingNodeDeg) &&
    Number.isFinite(record.argumentOfPeriapsisDeg)
  if (!hasAngles) return false
  const elliptical = record.semiMajorAxisAu !== null && record.semiMajorAxisAu > 0.05 && record.eccentricity !== null && record.eccentricity < 1
  const hyperbolic = record.eccentricity !== null && record.eccentricity >= 1 && record.perihelionDistanceAu !== null && record.perihelionDistanceAu > 0 && record.perihelionJD !== null
  return elliptical || hyperbolic
}

async function fetchQuery(query) {
  const url = buildQuery(query)
  const payload = await httpJson(url)
  const fields = payload.fields
  const rows = payload.data ?? []
  const records = []
  let rejected = 0
  for (const row of rows) {
    const record = rowToRecord(fields, row)
    if (!isUsable(record)) {
      rejected++
      continue
    }
    record.bucket = query.bucket
    record.classLabel = query.label
    records.push(record)
  }
  log(
    `  ${query.label.padEnd(35)} matched ${String(payload.count ?? rows.length).padStart(8)}  kept ${String(records.length).padStart(5)}  rejected ${rejected}`,
  )
  return records
}

/**
 * Individually guaranteed comet lookups. The OR form of `sb-cdata` is rejected by
 * the API for large condition lists, so notable objects are requested one by one.
 */
async function fetchNotableComets() {
  const records = []
  for (const designation of NOTABLE_DESIGNATIONS) {
    const url = `${API}?${encodeQuery({
      fields: FIELDS.join(','),
      'sb-cdata': JSON.stringify({ AND: [`pdes|EQ|${designation}`] }),
      'full-prec': 1,
    })}`
    try {
      const payload = await httpJson(url)
      const found = (payload.data ?? [])
        .map((row) => rowToRecord(payload.fields, row))
        .filter(isUsable)
        .map((record) => ({ ...record, bucket: 'comet', classLabel: 'Notable Comet', notable: true }))
      if (found.length === 0) log(`  ! notable comet ${designation} not found in SBDB`)
      records.push(...found)
    } catch (error) {
      log(`  ! notable comet ${designation} lookup failed: ${String(error)}`)
    }
  }
  log(`  ${'Notable comets'.padEnd(35)} fetched ${String(records.length).padStart(5)}`)
  return records
}

async function main() {
  log('Fetching minor bodies from NASA/JPL SBDB ...')
  const all = []
  const counts = {}
  for (const query of QUERIES) {
    const records = await fetchQuery(query)
    counts[query.key] = records.length
    all.push(...records)
  }
  const notable = await fetchNotableComets()
  counts.notableComet = notable.length
  all.push(...notable)

  // De-duplicate on primary designation. Notable objects keep their flag even when
  // they were also returned by a bulk class query.
  const seen = new Map()
  for (const record of all) {
    const existing = seen.get(record.pdes)
    if (!existing) {
      seen.set(record.pdes, record)
      continue
    }
    if (record.notable) {
      existing.notable = true
      existing.classLabel = record.classLabel
    }
  }
  const records = [...seen.values()]
  records.sort((a, b) => (a.absoluteMagnitude ?? 99) - (b.absoluteMagnitude ?? 99))

  const buckets = {}
  for (const record of records) buckets[record.bucket] = (buckets[record.bucket] ?? 0) + 1

  const output = {
    $comment:
      'Generated by scripts/update-minor-bodies.mjs from the NASA/JPL Small-Body Database Query API. Osculating elements are heliocentric J2000-ecliptic at the per-object epoch given in epochMjd (MJD, TDB).',
    source: API,
    sourceName: 'NASA/JPL Small-Body Database (SBDB) Query API',
    reference: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html',
    retrievedAt: new Date().toISOString(),
    epochConvention: 'MJD (TDB)',
    units: { semiMajorAxis: 'au', inclination: 'deg', period: 'days', diameter: 'km', rotationPeriod: 'hours', moid: 'au' },
    counts: { total: records.length, byQuery: counts, byBucket: buckets },
    objects: records,
  }
  await writeJson(path.join(SOURCE_DIR, 'minor-bodies.json'), output, { pretty: false })
  log(`Total minor bodies: ${records.length}`)
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(1)
})