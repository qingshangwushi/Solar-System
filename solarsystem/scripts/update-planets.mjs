/**
 * Update planetary physical parameters from the NASA/NSSDC Planetary Fact Sheets.
 *
 * Source: https://nssdc.gsfc.nasa.gov/planetary/factsheet/  (NASA Goddard Space
 * Flight Center, public domain). Values retrieved from the published fact sheets
 * are used verbatim; nothing is estimated.
 *
 * Output: data/sources/planet-physical.json
 *
 * Usage:  NODE_USE_ENV_PROXY=1 node scripts/update-planets.mjs
 */
import path from 'node:path'
import {
  SOURCE_DIR,
  htmlToRows,
  httpText,
  log,
  parseNumber,
  writeJson,
} from './lib/io.mjs'

const BASE = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet'

/** fact-sheet file -> catalog body id */
const SHEETS = {
  mercuryfact: 'mercury',
  venusfact: 'venus',
  earthfact: 'earth',
  marsfact: 'mars',
  jupiterfact: 'jupiter',
  saturnfact: 'saturn',
  uranusfact: 'uranus',
  neptunefact: 'neptune',
  plutofact: 'pluto',
}

/**
 * Fact-sheet row label -> normalized catalog field, with the multiplier that
 * converts the published unit into SI-ish values (kg, km, km^3/s^2).
 *
 * The published sheets mix two markup styles: multi-column HTML tables and plain
 * flowing text, and they use <sup> tags for exponents ("10<sup>6</sup>"). Labels
 * are therefore normalized by stripping tags and *all* whitespace before matching,
 * which makes one set of patterns valid for every sheet.
 */
const ROW_MAP = [
  [/^mass\(1024kg\)/, 'massKg', 1e24],
  // Giant-planet sheets qualify radii and gravity with the 1-bar reference level.
  [/^equatorialradius(?:\(1barlevel\))?\(km\)/, 'equatorialRadiusKm', 1],
  [/^polarradius(?:\(1barlevel\))?\(km\)/, 'polarRadiusKm', 1],
  [/^volumetricmeanradius\(km\)/, 'meanRadiusKm', 1],
  [/^ellipticity/, 'flattening', 1],
  [/^meandensity\(kg\/m3\)/, 'densityKgM3', 1],
  [/^(?:surfacegravity\(mean\)|gravity\(mean,1bar\))/, 'surfaceGravityMs2', 1],
  [/^escapevelocity\(km\/s\)/, 'escapeVelocityKmS', 1],
  // Published as "x 10^6 km^3/s^2".
  [/^gm\(x10-?6km3\/s2\)/, 'gmKm3S2', 1e6],
  [/^bondalbedo/, 'bondAlbedo', 1],
  [/^geometricalbedo/, 'geometricAlbedo', 1],
  [/^numberofnaturalsatellites/, 'documentedSatelliteCount', 1],
  [/^semimajoraxis\(106km\)/, 'semiMajorAxisKm', 1e6],
  [/^siderealorbitperiod\(days\)/, 'siderealOrbitPeriodDays', 1],
  [/^perihelion\(106km\)/, 'perihelionKm', 1e6],
  [/^aphelion\(106km\)/, 'aphelionKm', 1e6],
  [/^meanorbitalvelocity\(km\/s\)/, 'meanOrbitalVelocityKmS', 1],
  [/^orbitinclination\(deg\)/, 'orbitInclinationDeg', 1],
  [/^orbiteccentricity/, 'orbitEccentricity', 1],
  [/^siderealrotationperiod\(hrs\)/, 'siderealRotationPeriodHours', 1],
  [/^obliquitytoorbit\(deg\)/, 'axialTiltDeg', 1],
  [/^meanlongitude\(deg\)/, 'meanLongitudeDeg', 1],
]

const NUMBER = '([-+]?\\d[\\d,.]*)'

/** Strips markup and every whitespace character so labels become stable tokens. */
function normalizeMarkup(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
}

function parseSheet(html, sheetName) {
  const values = {}

  // Layout 1: multi-column HTML table, body value in the second column.
  for (const cells of htmlToRows(html)) {
    if (cells.length < 2) continue
    const label = normalizeMarkup(cells[0])
    for (const [pattern, key, scale] of ROW_MAP) {
      if (!pattern.test(label)) continue
      if (values[key] === undefined) {
        const parsed = parseNumber(cells[1]?.replace(/\*/g, ''))
        if (parsed !== null) values[key] = parsed * scale
      }
      break
    }
  }

  // Layout 2: flowing text, the value follows the label directly. The label
  // patterns are start-anchored for table matching, so the anchor is dropped here.
  const flattened = normalizeMarkup(html)
  for (const [pattern, key, scale] of ROW_MAP) {
    if (values[key] !== undefined) continue
    const unanchored = pattern.source.replace(/^\^/, '')
    // The flowing-text layout sometimes repeats the unit after the label
    // ("Surface gravity (mean) (m/s2) 9.820"); allow one such group to be skipped.
    const match = new RegExp(`${unanchored}(?:\\([^)]{0,12}\\))?${NUMBER}`).exec(flattened)
    if (!match) continue
    const parsed = parseNumber(match[1].replace(/\*/g, ''))
    if (parsed !== null) values[key] = parsed * scale
  }

  // Ring systems are described qualitatively ("Yes"/"No"), not as a number.
  const ring = /planetaryringsystem(yes|no)/.exec(flattened)
  if (ring) values.hasRingSystem = ring[1] === 'yes'

  if (Object.keys(values).length < 14) {
    throw new Error(`fact sheet ${sheetName} yielded only ${Object.keys(values).length} fields`)
  }
  return values
}

/** "GM (x 10^6 km^3/s^2)" is scaled to km^3/s^2 by ROW_MAP; nothing else to convert. */
async function main() {
  log('Fetching NASA/NSSDC planetary fact sheets ...')
  const bodies = {}
  for (const [sheet, id] of Object.entries(SHEETS)) {
    const html = await httpText(`${BASE}/${sheet}.html`)
    const values = parseSheet(html, sheet)
    const { massKg, ...rest } = values
    bodies[id] = {
      ...rest,
      massKg,
      hasRingSystem: typeof rest.hasRingSystem === 'boolean' ? rest.hasRingSystem : null,
    }
    log(`  ${id.padEnd(9)} ${Object.keys(bodies[id]).length} fields`)
  }

  await writeJson(path.join(SOURCE_DIR, 'planet-physical.json'), {
    $comment:
      'Generated by scripts/update-planets.mjs from the NASA/NSSDC Planetary Fact Sheets. Mass in kg, radii in km, density in kg/m^3, gravity in m/s^2, GM in km^3/s^2, orbit period in days, rotation period in hours, distances in km.',
    source: `${BASE}/`,
    sourceName: 'NASA/NSSDC Planetary Fact Sheet',
    publisher: 'NASA Goddard Space Flight Center',
    retrievedAt: new Date().toISOString(),
    bodies,
  })
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(1)
})