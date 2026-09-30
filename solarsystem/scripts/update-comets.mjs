/**
 * Split the comet bucket out of the downloaded NASA/JPL SBDB payload.
 *
 * Companion to `update-asteroids.mjs`: `update-minor-bodies.mjs` is the only
 * script that uses the network, and this one performs the offline extraction of
 * the cometary records (Jupiter-family, Halley-type, long-period, hyperbolic and
 * the individually requested notable comets). Keeping comets in their own
 * artefact lets the exhibition rebuild that subset without re-running the SBDB
 * query.
 *
 * Source of record: data/sources/minor-bodies.json
 *   <- https://ssd-api.jpl.nasa.gov/sbdb_query.api (NASA/JPL, public domain)
 * Output: data/sources/comets.json
 *
 * Nothing here is synthesised: every object is copied verbatim from the SBDB
 * payload, and the counts printed are the counts actually written.
 *
 * Usage: node scripts/update-comets.mjs
 */
import path from 'node:path'
import { SOURCE_DIR, log, readJson, writeJson } from './lib/io.mjs'

const SOURCE_FILE = path.join(SOURCE_DIR, 'minor-bodies.json')
const COMET_BUCKET = 'comet'

async function main() {
  log('Deriving the comet bucket from data/sources/minor-bodies.json (offline)')
  const source = await readJson(SOURCE_FILE)
  if (!Array.isArray(source.objects)) {
    throw new Error(`${SOURCE_FILE} has no "objects" array; re-run scripts/update-minor-bodies.mjs first`)
  }

  const comets = source.objects.filter((object) => object.bucket === COMET_BUCKET)

  // The SBDB class code is the primary evidence that a record really is a comet
  // (HTC/HYP/COM/JFC/ETc...). Hyperbolic and notable records are counted
  // separately because the guided tour and the information panel quote them.
  const byClassCode = {}
  let hyperbolic = 0
  let notable = 0
  for (const comet of comets) {
    byClassCode[comet.classCode ?? 'unknown'] = (byClassCode[comet.classCode ?? 'unknown'] ?? 0) + 1
    if (comet.eccentricity !== null && comet.eccentricity >= 1) hyperbolic++
    if (comet.notable) notable++
  }

  const output = {
    $comment:
      'Comet bucket derived offline by scripts/update-comets.mjs from data/sources/minor-bodies.json (NASA/JPL SBDB). Osculating heliocentric J2000-ecliptic elements at the per-object epoch given in epochMjd (MJD, TDB); hyperbolic records carry e >= 1 and are propagated from q and Tp.',
    source: source.source,
    sourceName: source.sourceName,
    reference: source.reference,
    epochConvention: source.epochConvention,
    units: source.units,
    derivedFrom: 'data/sources/minor-bodies.json',
    // Upstream retrieval time of the SBDB payload this split was derived from, so
    // the age of the numbers stays auditable (specification §6).
    sourceUpdatedAt: source.retrievedAt ?? null,
    retrievedAt: source.retrievedAt ?? null,
    generatedAt: new Date().toISOString(),
    bucketNames: [COMET_BUCKET],
    counts: { total: comets.length, hyperbolic, notable, byClassCode },
    buckets: { [COMET_BUCKET]: comets },
  }

  await writeJson(path.join(SOURCE_DIR, 'comets.json'), output, { pretty: false })
  log(`  ${'comet'.padEnd(10)} ${String(comets.length).padStart(6)}  (hyperbolic ${hyperbolic}, notable ${notable})`)
  log(`  ${'TOTAL'.padEnd(10)} ${String(comets.length).padStart(6)} comets`)
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(1)
})
