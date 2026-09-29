/**
 * Update the natural-satellite catalog.
 *
 * Sources
 *  - NASA/NSSDC satellite fact sheets (physical parameters + mean orbital elements)
 *      https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html  (and siblings)
 *  - NASA/NSSDC Mars and Pluto fact sheets (satellite sections)
 *  - NASA/JPL SSD "Planetary Satellite Mean Elements" (elements of record)
 *      data/sources/jpl-satellite-mean-elements.json
 *
 * The JPL mean elements are the primary source because they include the argument
 * of periapsis, mean anomaly and node required for a full three-dimensional orbit.
 * NSSDC supplies the physical parameters and fills in the remaining moons.
 *
 * Output: data/sources/satellites.json
 *
 * Usage:  NODE_USE_ENV_PROXY=1 node scripts/update-satellites.mjs
 */
import path from 'node:path'
import {
  SOURCE_DIR,
  htmlToRows,
  httpText,
  log,
  parseMeanRadius,
  parseNumber,
  readJson,
  writeJson,
} from './lib/io.mjs'

const BASE = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet'

/**
 * Giant-planet satellite fact sheets. The orbital tables in these sheets give
 * inclinations measured from the planet's equatorial plane for the regular
 * (close-in) satellites and from the ecliptic for the distant irregular ones;
 * the threshold below follows that convention.
 */
const SATELLITE_SHEETS = [
  { file: 'joviansatfact.html', parentId: 'jupiter' },
  { file: 'saturniansatfact.html', parentId: 'saturn' },
  { file: 'uraniansatfact.html', parentId: 'uranus' },
  { file: 'neptuniansatfact.html', parentId: 'neptune' },
]

const IRREGULAR_INCLINATION_DEG = 20

/** Strips a trailing Roman numeral / provisional designation in parentheses. */
function cleanName(raw) {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Provisional-only designations ("S/2004 S13", "S5605a2") have no official name yet. */
function isProvisionalOnly(name) {
  return /^S[\s/]?\d{4}|^S\d{3,}/i.test(name)
}

function toId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Parses the physical-parameter table ("name | mass | radius | density | albedo"). */
function parsePhysicalTable(rows) {
  const found = new Map()
  for (const cells of rows) {
    if (cells.length < 4) continue
    const name = cleanName(cells[0])
    if (name === '' || isProvisionalOnly(name)) continue
    const mass = parseNumber(cells[1])
    const radius = parseMeanRadius(cells[2])
    if (radius === null) continue
    found.set(name, {
      massKg: mass === null ? null : mass * 1e20, // table unit is 10^20 kg
      meanRadiusKm: radius,
      densityKgM3: parseNumber(cells[3]),
      geometricAlbedo: parseNumber(cells[4]),
    })
  }
  return found
}

/**
 * Parses the orbital table. Columns are
 *   Satellite | a (10^3 km) | a (planet radii) | Orbital period (days)
 *   | Rotation period (days, or "S"/"C" for synchronous/chaotic)
 *   | Inclination (deg) | Eccentricity
 * The rotation column may be a number, a letter, or absent, so the period is
 * taken from its fixed position (3rd value) while inclination and eccentricity
 * are read from the right.
 */
function parseOrbitalTable(rows) {
  const found = new Map()
  for (const cells of rows) {
    if (cells.length < 5) continue
    const name = cleanName(cells[0])
    if (name === '' || isProvisionalOnly(name)) continue
    const numerics = []
    for (const cell of cells.slice(1)) {
      const value = parseNumber(cell)
      if (value !== null) numerics.push(value)
    }
    if (numerics.length < 5) continue
    const semiMajorAxisKm = numerics[0] * 1e3 // table unit is 10^3 km
    const periodDays = numerics[2]
    const eccentricity = numerics[numerics.length - 1]
    const inclinationDeg = numerics[numerics.length - 2]
    if (!(semiMajorAxisKm > 0) || !(periodDays > 0) || !Number.isFinite(inclinationDeg)) continue
    const retrograde = cells.some((cell) => /\d\s*R\s*$/.test(cell))
    found.set(name, {
      semiMajorAxisKm,
      eccentricity,
      inclinationDeg,
      periodDays,
      retrograde,
    })
  }
  return found
}

/**
 * Parses the "Satellites of <planet>" table used by the Mars and Pluto fact
 * sheets: a header row of moon names followed by one row per parameter.
 */
function parseNameHeaderTable(rows, expectedNames) {
  const headerIndex = rows.findIndex((cells) => expectedNames.some((name) => cells.includes(name)))
  if (headerIndex < 0) return new Map()
  const header = rows[headerIndex]
  const columns = header
    .map((cell, index) => ({ cell: cell.replace(/&nbsp;/gi, ' ').trim(), index }))
    .filter((entry) => expectedNames.includes(entry.cell))
  if (columns.length === 0) return new Map()

  const result = new Map(columns.map((column) => [column.cell, { axesKm: [] }]))
  for (const cells of rows.slice(headerIndex + 1)) {
    const label = cells[0]
    if (!label) continue
    for (const column of columns) {
      const raw = cells[column.index]
      if (!raw) continue
      const target = result.get(column.cell)
      const value = parseNumber(raw)
      if (value === null) continue
      if (/Semimajor axis/i.test(label)) target.semiMajorAxisKm = value
      else if (/Sidereal orbit period/i.test(label)) target.periodDays = value
      else if (/Orbital inclination/i.test(label)) target.inclinationDeg = value
      else if (/Orbital eccentricity/i.test(label)) target.eccentricity = value
      else if (/Mass \(10\s*15 kg\)/i.test(label)) target.massKg = value * 1e15
      else if (/Mean density/i.test(label)) target.densityKgM3 = value
      else if (/Geometric albedo/i.test(label)) target.geometricAlbedo = value
      else if (/axis radius/i.test(label)) target.axesKm.push(value)
    }
  }
  for (const target of result.values()) {
    if (target.axesKm.length > 0) {
      target.meanRadiusKm = target.axesKm.reduce((sum, value) => sum + value, 0) / target.axesKm.length
    }
    delete target.axesKm
  }
  return result
}

/** Strips markup and all whitespace, matching the normalization used for planet sheets. */
function normalizeMarkup(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
}

/**
 * Physical and orbital parameters of the Moon from the dedicated Moon fact sheet.
 * Labels: "Semimajor axis (10 6 km) 0.3844", "Revolution period (days) 27.3217",
 * "Inclination to ecliptic (deg) 5.145", "Orbit eccentricity 0.0549".
 */
function parseMoonFactSheet(html) {
  const values = {}
  const rows = htmlToRows(html)
  const text = normalizeMarkup(html)
  const tableMap = [
    [/^mass\(1024kg\)/, 'massKg', 1e24],
    [/^volumetricmeanradius\(km\)/, 'meanRadiusKm', 1],
    [/^meandensity\(kg\/m3\)/, 'densityKgM3', 1],
    [/^geometricalbedo/, 'geometricAlbedo', 1],
  ]
  for (const cells of rows) {
    if (cells.length < 2) continue
    const label = normalizeMarkup(cells[0])
    for (const [pattern, key, scale] of tableMap) {
      if (!pattern.test(label)) continue
      const value = parseNumber(cells[1]?.replace(/\*/g, ''))
      if (value !== null && values[key] === undefined) values[key] = value * scale
      break
    }
  }
  const textMap = [
    [/semimajoraxis\(106km\)/, 'semiMajorAxisKm', 1e6],
    [/revolutionperiod\(days\)/, 'periodDays', 1],
    [/inclinationtoecliptic\(deg\)/, 'inclinationDeg', 1],
    [/orbiteccentricity/, 'eccentricity', 1],
  ]
  for (const [pattern, key, scale] of textMap) {
    const match = new RegExp(`${pattern.source}([-+]?\\d[\\d,.]*)`).exec(text)
    if (match) {
      const value = parseNumber(match[1])
      if (value !== null) values[key] = value * scale
    }
  }
  return values
}

/**
 * Satellites of Pluto. Charon is described as flowing text; the small moons live
 * in a dedicated "Other Moons of Pluto" table.
 */
function parsePlutoFactSheet(html) {
  const results = new Map()
  const text = normalizeMarkup(html)

  const charon = text.slice(text.indexOf('charon(p1)'))
  const number = (label, scale = 1) => {
    const match = new RegExp(`${label}([-+]?\\d[\\d,.]*)`).exec(charon)
    if (!match) return null
    const value = parseNumber(match[1])
    return value === null ? null : value * scale
  }
  results.set('Charon', {
    semiMajorAxisKm: number('meandistancefrompluto\\(km\\)'),
    periodDays: number('siderealorbitperiod\\(days\\)'),
    inclinationDeg: number('orbitalinclinationtopluto\\(deg\\)'),
    eccentricity: number('orbitaleccentricity'),
    meanRadiusKm: number('equatorialradius\\(km\\)'),
    massKg: number('mass\\(1021kg\\)', 1e21),
    densityKgM3: number('meandensity\\(kg\\/m3\\)'),
    geometricAlbedo: number('geometricalbedo'),
  })

  const rows = htmlToRows(html)
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => /Semi-Major Axis/i.test(cell)))
  if (headerIndex >= 0) {
    for (const cells of rows.slice(headerIndex + 1)) {
      if (cells.length < 5) continue
      const name = cleanName(cells[0])
      if (name === '' || isProvisionalOnly(name)) continue
      results.set(name, {
        semiMajorAxisKm: parseNumber(cells[1]),
        periodDays: parseNumber(cells[2]),
        rotationPeriodDays: parseNumber(cells[3]),
        meanRadiusKm: parseMeanRadius(cells[4]),
        geometricAlbedo: parseNumber(cells[5]),
      })
    }
  }
  return results
}

async function main() {
  log('Fetching NASA/NSSDC satellite fact sheets ...')
  const physical = new Map()
  const orbital = new Map()
  const parentOf = new Map()

  for (const sheet of SATELLITE_SHEETS) {
    const html = await httpText(`${BASE}/${sheet.file}`)
    // The sheet holds a physical-parameter table followed by a separate orbital
    // table; splitting on the section heading keeps the two row shapes apart.
    const [physicalHtml, orbitalHtml = ''] = html.split(/Orbital parameters/i)
    if (!orbitalHtml) throw new Error(`${sheet.file}: "Orbital parameters" section not found`)
    const physicalTable = parsePhysicalTable(htmlToRows(physicalHtml))
    const orbitalTable = parseOrbitalTable(htmlToRows(orbitalHtml))
    for (const [name, values] of physicalTable) {
      physical.set(name, values)
      parentOf.set(name, sheet.parentId)
    }
    for (const [name, values] of orbitalTable) {
      orbital.set(name, values)
      parentOf.set(name, sheet.parentId)
    }
    log(`  ${sheet.parentId.padEnd(8)} physical ${physicalTable.size}  orbital ${orbitalTable.size}`)
  }

  const marsHtml = await httpText(`${BASE}/marsfact.html`)
  for (const [name, values] of parseNameHeaderTable(htmlToRows(marsHtml), ['Phobos', 'Deimos'])) {
    physical.set(name, { ...values, ...(physical.get(name) ?? {}) })
    parentOf.set(name, 'mars')
    log(`  mars     ${name}: a=${values.semiMajorAxisKm} km  P=${values.periodDays} d  R=${values.meanRadiusKm?.toFixed(1)} km`)
  }

  const plutoHtml = await httpText(`${BASE}/plutofact.html`)
  for (const [name, values] of parsePlutoFactSheet(plutoHtml)) {
    orbital.set(name, { ...(orbital.get(name) ?? {}), ...values })
    physical.set(name, { ...values, ...(physical.get(name) ?? {}) })
    parentOf.set(name, 'pluto')
    log(`  pluto    ${name}: a=${values.semiMajorAxisKm} km  P=${values.periodDays} d  R=${values.meanRadiusKm?.toFixed(1)} km`)
  }

  const moonHtml = await httpText(`${BASE}/moonfact.html`)
  const moonValues = parseMoonFactSheet(moonHtml)
  physical.set('Moon', { ...(physical.get('Moon') ?? {}), ...moonValues })
  orbital.set('Moon', { ...(orbital.get('Moon') ?? {}), ...moonValues })
  parentOf.set('Moon', 'earth')
  log(`  earth    Moon: a=${moonValues.semiMajorAxisKm} km  P=${moonValues.periodDays} d  R=${moonValues.meanRadiusKm} km`)

  const jpl = await readJson(path.join(SOURCE_DIR, 'jpl-satellite-mean-elements.json'))
  const jplByCode = new Map(jpl.satellites.map((entry) => [entry.code, entry]))
  const jplByName = new Map(jpl.satellites.map((entry) => [entry.name.toLowerCase(), entry]))

  const satellites = []
  const names = new Set([...physical.keys(), ...orbital.keys()])
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const parentId = parentOf.get(name)
    if (!parentId) continue
    const phys = physical.get(name) ?? {}
    const orb = orbital.get(name) ?? {}
    const code = PREVIOUS_IDS.get(toId(name))
    const jplEntry =
      jplByName.get(name.toLowerCase()) ?? (code === undefined ? undefined : jplByCode.get(code))

    const semiMajorAxisKm = jplEntry?.aKm ?? orb.semiMajorAxisKm ?? phys.semiMajorAxisKm
    const periodDays = jplEntry?.periodDays ?? orb.periodDays ?? phys.periodDays
    const eccentricity = jplEntry?.e ?? orb.eccentricity ?? phys.eccentricity ?? 0
    const inclinationDeg = jplEntry?.inclinationDeg ?? orb.inclinationDeg ?? phys.inclinationDeg ?? 0
    if (!(semiMajorAxisKm > 0) || !(periodDays > 0)) {
      log(`  ! skipping ${name}: incomplete orbit (a=${semiMajorAxisKm}, P=${periodDays})`)
      continue
    }

    const regular = inclinationDeg < IRREGULAR_INCLINATION_DEG
    const hasPublishedPhase = Boolean(jplEntry)
    satellites.push({
      id: toId(name),
      name,
      parentId,
      physical: {
        meanRadiusKm: phys.meanRadiusKm ?? null,
        massKg: phys.massKg ?? null,
        densityKgM3: phys.densityKgM3 ?? null,
        geometricAlbedo: phys.geometricAlbedo ?? null,
      },
      orbit: {
        semiMajorAxisKm,
        eccentricity,
        inclinationDeg,
        periodDays,
        // Orientation supplied by the JPL mean elements where published.
        nodeDeg: jplEntry?.nodeDeg ?? 0,
        argPeriapsisDeg: jplEntry?.argPeriapsisDeg ?? 0,
        meanAnomalyDeg: jplEntry?.meanAnomalyDeg ?? 0,
        // Regular satellites orbit close to the parent's equatorial (Laplace) plane;
        // distant irregulars are referenced to the J2000 ecliptic.
        referencePlane: jplEntry ? jplEntry.frame : regular ? 'laplace' : 'ecliptic',
        retrograde: Boolean(orb.retrograde) || eccentricity > 1,
        phaseSource: hasPublishedPhase ? 'jpl-mean-elements' : 'convention',
      },
      source: hasPublishedPhase
        ? 'NASA/JPL SSD Planetary Satellite Mean Elements + NASA/NSSDC fact sheet'
        : 'NASA/NSSDC satellite fact sheet',
    })
  }

  const byParent = {}
  for (const satellite of satellites) byParent[satellite.parentId] = (byParent[satellite.parentId] ?? 0) + 1

  await writeJson(path.join(SOURCE_DIR, 'satellites.json'), {
    $comment:
      'Generated by scripts/update-satellites.mjs. Orbital geometry (a, e, i, period) and physical parameters come from NASA/JPL and NASA/NSSDC; the direction/phase of the orbit (node, argument of periapsis, mean anomaly) is taken from the JPL mean elements where published. For satellites without a published mean anomaly the phase is a documented convention value with no scientific meaning (phaseSource="convention").',
    sources: [
      `${BASE}/joviansatfact.html`,
      `${BASE}/saturniansatfact.html`,
      `${BASE}/uraniansatfact.html`,
      `${BASE}/neptuniansatfact.html`,
      `${BASE}/marsfact.html`,
      `${BASE}/plutofact.html`,
      `${BASE}/moonfact.html`,
      'https://ssd.jpl.nasa.gov/sats/elem/',
    ],
    retrievedAt: new Date().toISOString(),
    counts: { total: satellites.length, byParent },
    satellites,
  })
  log(`Total satellites: ${satellites.length} (${JSON.stringify(byParent)})`)
}

/** Legacy SBDB/JPL satellite codes, used to join NSSDC names to JPL mean elements. */
const PREVIOUS_IDS = new Map([
  ['moon', 301],
  ['phobos', 401],
  ['deimos', 402],
  ['io', 501],
  ['europa', 502],
  ['ganymede', 503],
  ['callisto', 504],
  ['amalthea', 505],
  ['himalia', 506],
  ['thebe', 514],
  ['adrastea', 515],
  ['metis', 516],
])

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(1)
})