/**
 * Split the asteroid buckets out of the downloaded NASA/JPL SBDB payload.
 *
 * `update-minor-bodies.mjs` performs the only network step: it downloads every
 * dynamical class in one SBDB query and tags each record with its `bucket`. This
 * script is the *offline* second stage that materialises the asteroid buckets the
 * renderer and the layer filters actually consume (main belt, near-Earth,
 * Jupiter Trojan, Centaur, trans-Neptunian). Because it reads the checked-in
 * source file and never touches the network, the exhibition build can be
 * regenerated on an air-gapped machine.
 *
 * Source of record: data/sources/minor-bodies.json
 *   <- https://ssd-api.jpl.nasa.gov/sbdb_query.api (NASA/JPL, public domain)
 * Output: data/sources/asteroids.json
 *
 * Nothing here is synthesised: every object is copied verbatim from the SBDB
 * payload, and the counts printed are the counts actually written.
 *
 * Usage: node scripts/update-asteroids.mjs
 */
import path from 'node:path'
import { SOURCE_DIR, log, readJson, writeJson } from './lib/io.mjs'

const SOURCE_FILE = path.join(SOURCE_DIR, 'minor-bodies.json')

/**
 * Dynamical buckets that describe an asteroid. `comet` is deliberately excluded:
 * it is written by update-comets.mjs so that the two artefacts stay independent.
 */
const ASTEROID_BUCKETS = ['mainBelt', 'nearEarth', 'trojan', 'centaur', 'tno']

async function main() {
  log('Deriving asteroid buckets from data/sources/minor-bodies.json (offline)')
  const source = await readJson(SOURCE_FILE)
  if (!Array.isArray(source.objects)) {
    throw new Error(`${SOURCE_FILE} has no "objects" array; re-run scripts/update-minor-bodies.mjs first`)
  }

  const buckets = Object.fromEntries(ASTEROID_BUCKETS.map((bucket) => [bucket, []]))
  let unclassified = 0

  for (const object of source.objects) {
    // A record whose bucket is not one of the asteroid classes is either a comet
    // (handled by update-comets.mjs) or malformed; neither belongs in this file.
    if (object.bucket === 'comet') continue
    if (!ASTEROID_BUCKETS.includes(object.bucket)) {
      unclassified++
      continue
    }
    buckets[object.bucket].push(object)
  }

  const byBucket = {}
  let total = 0
  for (const bucket of ASTEROID_BUCKETS) {
    byBucket[bucket] = buckets[bucket].length
    total += buckets[bucket].length
  }

  const output = {
    $comment:
      'Asteroid buckets derived offline by scripts/update-asteroids.mjs from data/sources/minor-bodies.json (NASA/JPL SBDB). Osculating heliocentric J2000-ecliptic elements at the per-object epoch given in epochMjd (MJD, TDB).',
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
    bucketNames: ASTEROID_BUCKETS,
    counts: { total, byBucket, unclassified },
    buckets,
  }

  await writeJson(path.join(SOURCE_DIR, 'asteroids.json'), output, { pretty: false })
  for (const bucket of ASTEROID_BUCKETS) {
    log(`  ${bucket.padEnd(10)} ${String(byBucket[bucket]).padStart(6)}`)
  }
  log(`  ${'TOTAL'.padEnd(10)} ${String(total).padStart(6)} asteroids`)
  if (unclassified > 0) log(`  ! ${unclassified} object(s) had no recognised bucket and were skipped`)
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(1)
})
