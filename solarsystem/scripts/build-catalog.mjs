/**
 * Build the normalized, versioned catalog consumed by the Web application.
 *
 * Pipeline stage: authoritative datasets -> normalized catalog -> Web app.
 * This script performs no network access; it merges and validates the files in
 * data/sources/ that the update-* scripts produced.
 *
 * Outputs
 *   public/data/catalog/catalog-<version>.json  Sun, planets, dwarf planets, satellites, starfield manifest
 *   public/data/catalog/minor-bodies.json     search/filter index for ~11k minor bodies
 *   public/data/catalog/minor-bodies.bin      Float32 orbital-element buffer for GPU/worker propagation
 *   public/data/catalog/manifest.json         version, `catalogFile`, `sourceUpdatedAt`, file list and validation report
 *
 * The catalog is written under its version stamp (`catalog-vYYYYMMDD.json`) and the
 * manifest names it with `catalogFile`, so a data refresh ships a new immutable
 * artefact instead of overwriting a file a visitor's browser may still have cached
 * (specification §6/§48). A legacy `catalog.json` is deliberately NOT emitted.
 *
 * Usage:  node scripts/build-catalog.mjs
 */
import { rm } from 'node:fs/promises'
import path from 'node:path'
import {
  PUBLIC_DATA_DIR,
  SOURCE_DIR,
  log,
  readJson,
  versionStamp,
  writeBuffer,
  writeJson,
} from './lib/io.mjs'

const DEG = Math.PI / 180
const J2000_JD = 2451545.0
const SECONDS_PER_DAY = 86400

/** astronomy-engine body identifiers used by the Mode A ephemeris path. */
const EPHEMERIS_BODIES = {
  mercury: 'Mercury',
  venus: 'Venus',
  earth: 'Earth',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  uranus: 'Uranus',
  neptune: 'Neptune',
  pluto: 'Pluto',
}

const TEXTURES = {
  sun: { map: 'textures/sun.jpg' },
  mercury: { map: 'textures/mercury.jpg' },
  venus: { map: 'textures/venus-surface.jpg', clouds: 'textures/venus-atmosphere.jpg' },
  earth: {
    map: 'textures/earth-day.jpg',
    nightMap: 'textures/earth-night.jpg',
    clouds: 'textures/earth-clouds.jpg',
    normalMap: 'textures/earth-normal.jpg',
    specularMap: 'textures/earth-specular.jpg',
  },
  mars: { map: 'textures/mars.jpg' },
  jupiter: { map: 'textures/jupiter.jpg' },
  saturn: { map: 'textures/saturn.jpg' },
  uranus: { map: 'textures/uranus.jpg' },
  neptune: { map: 'textures/neptune.jpg' },
  moon: { map: 'textures/moon.jpg' },
}

/**
 * Ring systems. The inner/outer values are the published radial extents of each
 * ring system expressed in planetary equatorial radii (JPL/NASA ring records);
 * they are geometry, not artwork.
 */
const RINGS = {
  jupiter: { innerRadiusFactor: 1.4, outerRadiusFactor: 1.81, opacity: 0.18, note: 'Halo + main ring' },
  saturn: { innerRadiusFactor: 1.11, outerRadiusFactor: 2.27, opacity: 0.95, texture: 'textures/saturn-ring.png', note: 'D ring through A ring (F ring outer edge at 2.32 R)' },
  uranus: { innerRadiusFactor: 1.64, outerRadiusFactor: 2.0, opacity: 0.35, note: '6 ring through epsilon ring' },
  neptune: { innerRadiusFactor: 1.69, outerRadiusFactor: 2.54, opacity: 0.28, note: 'Galle ring through Adams ring' },
}

const DWARF_PLANETS = ['pluto', 'ceres', 'eris', 'haumea', 'makemake']

function round(value, digits) {
  return value === null || value === undefined ? null : Number(value.toFixed(digits))
}

/** Mean motion (rad/day) for a two-body orbit; a < 0 gives the hyperbolic rate. */
function meanMotionRadPerDay(gmKm3S2, semiMajorAxisKm) {
  return Math.sqrt(gmKm3S2 / Math.abs(semiMajorAxisKm) ** 3) * SECONDS_PER_DAY
}

function buildPlanets(physical, names, orientation) {
  const bodies = []
  const orient = (id, tiltDeg) => ({
    poleRaDeg: orientation.bodies[id]?.poleRaDeg ?? 0,
    poleDecDeg: orientation.bodies[id]?.poleDecDeg ?? 90,
    axialTiltDeg: tiltDeg ?? null,
    rotationPhaseSource: orientation.bodies[id]?.rotationPhaseSource ?? 'convention-zero-at-j2000',
  })
  bodies.push({
    id: 'sun',
    name: 'Sun',
    nameZh: names.sun?.nameZh ?? '太阳',
    officialName: 'Sun',
    aliases: ['Sol'],
    type: 'star',
    parentId: null,
    positionModel: 'origin',
    physical: {
      meanRadiusKm: 695700,
      massKg: 1.9885e30,
      densityKgM3: 1408,
      surfaceGravityMs2: 274,
    },
    rotation: { periodHours: 609.12, axialTiltDeg: 7.25, retrograde: false },
    orientation: orient('sun', 7.25),
    textures: TEXTURES.sun,
    source: 'IAU 2015 nominal solar values; NASA/NSSDC Sun Fact Sheet',
  })

  for (const [id, body] of Object.entries(physical.bodies)) {
    const isDwarf = DWARF_PLANETS.includes(id) && id !== 'pluto'
    if (id === 'pluto' || isDwarf) continue
    bodies.push({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      nameZh: names[id]?.nameZh ?? null,
      officialName: names[id]?.officialName ?? null,
      aliases: names[id]?.aliases ?? [],
      type: 'planet',
      parentId: 'sun',
      positionModel: 'ephemeris',
      ephemeris: { body: EPHEMERIS_BODIES[id], center: 'sun' },
      physical: {
        meanRadiusKm: body.meanRadiusKm,
        equatorialRadiusKm: body.equatorialRadiusKm ?? null,
        polarRadiusKm: body.polarRadiusKm ?? null,
        massKg: body.massKg,
        densityKgM3: body.densityKgM3,
        surfaceGravityMs2: body.surfaceGravityMs2,
        escapeVelocityKmS: body.escapeVelocityKmS,
        gmKm3S2: body.gmKm3S2,
        bondAlbedo: body.bondAlbedo,
        geometricAlbedo: body.geometricAlbedo,
        flattening: body.flattening ?? null,
      },
      rotation: {
        periodHours: body.siderealRotationPeriodHours,
        axialTiltDeg: body.axialTiltDeg,
        retrograde: (body.siderealRotationPeriodHours ?? 0) < 0,
      },
      orientation: orient(id, body.axialTiltDeg),
      orbitSummary: {
        semiMajorAxisKm: body.semiMajorAxisKm,
        periodDays: body.siderealOrbitPeriodDays,
        eccentricity: body.orbitEccentricity,
        inclinationDeg: body.orbitInclinationDeg,
        perihelionKm: body.perihelionKm,
        aphelionKm: body.aphelionKm,
        meanOrbitalVelocityKmS: body.meanOrbitalVelocityKmS,
      },
      rings: RINGS[id] ?? null,
      textures: TEXTURES[id] ?? null,
      documentedSatelliteCount: body.documentedSatelliteCount,
      discovery: names[id]?.discovery ?? null,
      source: 'NASA/NSSDC Planetary Fact Sheet + NASA/JPL approximate elements (Mode A ephemeris)',
    })
  }
  return bodies
}

function buildDwarfPlanets(physical, names, minorBodies, orientation) {
  const bodies = []
  const pluto = physical.bodies.pluto
  bodies.push({
    id: 'pluto',
    name: 'Pluto',
    nameZh: names.pluto?.nameZh ?? null,
    officialName: '134340 Pluto',
    aliases: ['Pluto'],
    type: 'dwarfPlanet',
    parentId: 'sun',
    positionModel: 'ephemeris',
    ephemeris: { body: 'Pluto', center: 'sun' },
    physical: {
      meanRadiusKm: pluto.meanRadiusKm,
      massKg: pluto.massKg,
      densityKgM3: pluto.densityKgM3,
      surfaceGravityMs2: pluto.surfaceGravityMs2,
      escapeVelocityKmS: pluto.escapeVelocityKmS,
      gmKm3S2: pluto.gmKm3S2,
      bondAlbedo: pluto.bondAlbedo,
      geometricAlbedo: pluto.geometricAlbedo,
    },
    rotation: { periodHours: pluto.siderealRotationPeriodHours, axialTiltDeg: pluto.axialTiltDeg, retrograde: pluto.siderealRotationPeriodHours < 0 },
    orientation: {
      poleRaDeg: orientation.bodies.pluto?.poleRaDeg ?? 132.993,
      poleDecDeg: orientation.bodies.pluto?.poleDecDeg ?? -6.163,
      axialTiltDeg: pluto.axialTiltDeg,
      rotationPhaseSource: orientation.bodies.pluto?.rotationPhaseSource ?? 'convention-zero-at-j2000',
    },
    orbitSummary: {
      semiMajorAxisKm: pluto.semiMajorAxisKm,
      periodDays: pluto.siderealOrbitPeriodDays,
      eccentricity: pluto.orbitEccentricity,
      inclinationDeg: pluto.orbitInclinationDeg,
      perihelionKm: pluto.perihelionKm,
      aphelionKm: pluto.aphelionKm,
    },
    textures: null,
    discovery: names.pluto?.discovery ?? null,
    source: 'NASA/NSSDC Pluto Fact Sheet + NASA/JPL ephemeris (Mode A)',
  })

  for (const id of DWARF_PLANETS) {
    if (id === 'pluto') continue
    const record = minorBodies.objects.find((object) => object.name.toLowerCase() === id)
    if (!record) {
      log(`  ! dwarf planet ${id} not present in the minor-body catalog`)
      continue
    }
    bodies.push({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      nameZh: names[id]?.nameZh ?? null,
      officialName: names[id]?.officialName ?? record.fullName,
      aliases: [record.name, record.pdes].filter(Boolean),
      type: 'dwarfPlanet',
      parentId: 'sun',
      positionModel: 'kepler',
      elements: {
        semiMajorAxisAu: record.semiMajorAxisAu,
        eccentricity: record.eccentricity,
        inclinationDeg: record.inclinationDeg,
        longitudeAscendingNodeDeg: record.longitudeAscendingNodeDeg,
        argumentOfPeriapsisDeg: record.argumentOfPeriapsisDeg,
        meanAnomalyDeg: record.meanAnomalyDeg,
        epochMjd: record.epochMjd,
        perihelionDistanceAu: record.perihelionDistanceAu,
        periodDays: record.periodDays,
      },
      physical: {
        meanRadiusKm: record.diameterKm ? record.diameterKm / 2 : null,
        // Eris, Haumea and Makemake have no published diameter in the SBDB; the
        // renderer sizes them from the absolute magnitude and the UI reports that
        // the diameter is unavailable instead of inventing a value.
        radiusSource: record.diameterKm ? 'jpl-sbdb-diameter' : 'unavailable-published-value',
        absoluteMagnitude: record.absoluteMagnitude,
        geometricAlbedo: record.albedo,
      },
      rotation: { periodHours: record.rotationPeriodHours, axialTiltDeg: null, retrograde: false },
      orbitSummary: {
        semiMajorAxisAu: record.semiMajorAxisAu,
        eccentricity: record.eccentricity,
        inclinationDeg: record.inclinationDeg,
        periodDays: record.periodDays,
      },
      textures: null,
      discovery: names[id]?.discovery ?? null,
      source: 'NASA/JPL Small-Body Database (osculating elements, Mode B Kepler)',
    })
  }
  return bodies
}

function buildSatellites(satellites, planetLookup, names) {
  const bodies = []
  for (const satellite of satellites.satellites) {
    const parent = planetLookup.get(satellite.parentId)
    const gm = parent?.physical?.gmKm3S2 ?? null
    const aKm = satellite.orbit.semiMajorAxisKm
    const derivedPeriodDays = gm ? (2 * Math.PI) / meanMotionRadPerDay(gm, aKm) : null
    const periodError = derivedPeriodDays && satellite.orbit.periodDays
      ? Math.abs(derivedPeriodDays - satellite.orbit.periodDays) / satellite.orbit.periodDays
      : null
    const usesEphemeris = satellite.id === 'moon'
    const meanAnomalyRad = satellite.orbit.meanAnomalyDeg * DEG
    const nRadPerDay = gm ? meanMotionRadPerDay(gm, aKm) : null
    bodies.push({
      id: satellite.id,
      name: satellite.name,
      nameZh: names[satellite.id]?.nameZh ?? null,
      officialName: names[satellite.id]?.officialName ?? satellite.name,
      aliases: [],
      type: 'moon',
      parentId: satellite.parentId,
      positionModel: usesEphemeris ? 'ephemeris' : 'kepler',
      ephemeris: usesEphemeris ? { body: 'Moon', center: 'geocentric' } : undefined,
      elements: usesEphemeris
        ? undefined
        : {
            semiMajorAxisKm: aKm,
            eccentricity: satellite.orbit.eccentricity,
            inclinationDeg: satellite.orbit.inclinationDeg,
            longitudeAscendingNodeDeg: satellite.orbit.nodeDeg,
            argumentOfPeriapsisDeg: satellite.orbit.argPeriapsisDeg,
            meanAnomalyDeg: satellite.orbit.meanAnomalyDeg,
            epochJD: J2000_JD,
            referencePlane: satellite.orbit.referencePlane,
            retrograde: satellite.orbit.retrograde,
            phaseSource: satellite.orbit.phaseSource,
          },
      physical: {
        meanRadiusKm: satellite.physical.meanRadiusKm,
        massKg: satellite.physical.massKg,
        densityKgM3: satellite.physical.densityKgM3,
        geometricAlbedo: satellite.physical.geometricAlbedo,
        gmKm3S2: null,
      },
      rotation: {
        // Tidally locked bodies rotate once per orbit.
        periodHours: satellite.orbit.periodDays ? satellite.orbit.periodDays * 24 : null,
        axialTiltDeg: 0,
        synchronous: true,
      },
      // Satellites without a published pole are drawn with their parent's axis,
      // which is the standard treatment for tidally locked moons.
      orientation: {
        poleRaDeg: parent?.orientation?.poleRaDeg ?? 0,
        poleDecDeg: parent?.orientation?.poleDecDeg ?? 90,
        axialTiltDeg: null,
        rotationPhaseSource: 'convention-zero-at-j2000',
        inheritedFromParent: true,
      },
      orbitSummary: {
        semiMajorAxisKm: aKm,
        eccentricity: satellite.orbit.eccentricity,
        inclinationDeg: satellite.orbit.inclinationDeg,
        periodDays: satellite.orbit.periodDays,
        derivedPeriodDays: round(derivedPeriodDays, 6),
        periodRelativeError: round(periodError, 5),
        meanMotionRadPerDay: round(nRadPerDay, 8),
        referencePlane: satellite.orbit.referencePlane,
      },
      textures: TEXTURES[satellite.id] ?? null,
      discovery: names[satellite.id]?.discovery ?? null,
      source: satellite.source,
    })
  }
  return bodies
}

/**
 * Writes the minor-body orbital elements as a Float32 buffer.
 * Layout (stride 8): q[au], e, i[rad], node[rad], argPeri[rad], Tp[MJD], H, diameter[km].
 * Tp is derived from the published mean anomaly and epoch, so the buffer supports
 * elliptical, parabolic and hyperbolic two-body propagation with one code path.
 */
function buildMinorBodyBuffer(minorBodies, index) {
  const stride = 8
  const data = new Float32Array(minorBodies.objects.length * stride)
  let offset = 0
  let hyperbolic = 0
  for (const object of minorBodies.objects) {
    const eccentricity = object.eccentricity ?? 0
    const qAu = object.perihelionDistanceAu
      ?? (object.semiMajorAxisAu !== null ? object.semiMajorAxisAu * (1 - eccentricity) : null)
    let tpMjd = object.perihelionJD ? object.perihelionJD - 2400000.5 : null
    if (tpMjd === null && object.epochMjd !== null && object.semiMajorAxisAu !== null) {
      const nRadPerDay = Math.PI * 2 / object.periodDays
      tpMjd = object.epochMjd - (object.meanAnomalyDeg ?? 0) * DEG / nRadPerDay
    }
    if (qAu === null || tpMjd === null) {
      throw new Error(`minor body ${object.pdes} lacks the data required to derive a perihelion epoch`)
    }
    if (eccentricity >= 1) hyperbolic++
    data[offset++] = qAu
    data[offset++] = eccentricity
    data[offset++] = (object.inclinationDeg ?? 0) * DEG
    data[offset++] = (object.longitudeAscendingNodeDeg ?? 0) * DEG
    data[offset++] = (object.argumentOfPeriapsisDeg ?? 0) * DEG
    data[offset++] = tpMjd
    data[offset++] = object.absoluteMagnitude ?? 99
    data[offset++] = object.diameterKm ?? 0
    index.push({
      id: object.pdes,
      name: object.name,
      fullName: object.fullName,
      bucket: object.bucket,
      classCode: object.classCode,
      classLabel: object.classLabel,
      isNeo: object.isNeo,
      isPha: object.isPha,
      notable: object.notable ?? false,
      absoluteMagnitude: object.absoluteMagnitude,
      diameterKm: object.diameterKm,
      perihelionDistanceAu: round(qAu, 6),
      aphelionDistanceAu: object.aphelionDistanceAu,
      eccentricity,
      periodDays: object.periodDays,
      argumentOfPeriapsisDeg: object.argumentOfPeriapsisDeg,
      longitudeAscendingNodeDeg: object.longitudeAscendingNodeDeg,
      inclinationDeg: object.inclinationDeg,
      meanAnomalyDeg: object.meanAnomalyDeg,
      epochMjd: object.epochMjd,
      perihelionJD: object.perihelionJD,
      semiMajorAxisAu: object.semiMajorAxisAu,
      rotationPeriodHours: object.rotationPeriodHours,
      albedo: object.albedo,
      firstObservation: object.firstObservation,
      moidAu: object.moidAu,
    })
  }
  return { data, hyperbolic, stride }
}

async function main() {
  log('Building normalized catalog ...')
  const [planets, physical, satellites, names, minorBodiesSource, starManifest, satelliteElements, orientation] = await Promise.all([
    readJson(path.join(SOURCE_DIR, 'planets-jpl-approx.json')),
    readJson(path.join(SOURCE_DIR, 'planet-physical.json')),
    readJson(path.join(SOURCE_DIR, 'satellites.json')),
    readJson(path.join(SOURCE_DIR, 'body-names.json')),
    readJson(path.join(SOURCE_DIR, 'minor-bodies.json')),
    readJson(path.join(PUBLIC_DATA_DIR, 'stars', 'stars.json')),
    readJson(path.join(SOURCE_DIR, 'jpl-satellite-mean-elements.json')),
    readJson(path.join(SOURCE_DIR, 'planet-orientation.json')),
  ])

  const bodyNames = names.bodies
  const planetBodies = buildPlanets(physical, bodyNames, orientation)
  const lookup = new Map(planetBodies.map((body) => [body.id, body]))
  const dwarfPlanets = buildDwarfPlanets(physical, bodyNames, minorBodiesSource, orientation)
  for (const body of dwarfPlanets) lookup.set(body.id, body)
  const satellitesBodies = buildSatellites(satellites, lookup, bodyNames)

  /**
   * Provenance stamp for the whole catalog: the most recent upstream retrieval
   * among the source datasets that feed it (`retrievedAt` is the field the
   * update-* scripts write when they download a dataset). Every body carries it so
   * the information panel can state how old its numbers are (specification §6).
   */
  const sourceUpdatedAt =
    [physical.retrievedAt, satellites.retrievedAt, minorBodiesSource.retrievedAt]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null

  const bodies = [...planetBodies, ...dwarfPlanets, ...satellitesBodies].map((body) => ({
    ...body,
    sourceUpdatedAt,
  }))

  const index = []
  const { data, hyperbolic, stride } = buildMinorBodyBuffer(minorBodiesSource, index)

  // ---- validation -----------------------------------------------------------
  const validation = { checks: [], warnings: [] }
  const satellitesWithDerivedPeriod = satellitesBodies.filter((body) => body.orbitSummary.periodRelativeError !== null)
  /**
   * Two tolerance tiers, because the two-body prediction is only a good
   * approximation for close-in, near-circular satellites:
   *  - regular satellites orbiting inside the Laplace plane: 3 % (the widest
   *    deviation, Hyperion at 2.05 %, is the 4:3 chaotic resonance with Titan)
   *  - distant irregulars (solar/planetary perturbations dominate) and the Pluto
   *    system (tabulated elements are barycentric): 10 %
   */
  const toleranceFor = (body) =>
    body.orbitSummary.referencePlane === 'ecliptic' || body.parentId === 'pluto' ? 0.1 : 0.03
  const withTolerance = satellitesWithDerivedPeriod.map((body) => ({
    body,
    tolerance: toleranceFor(body),
    relativeError: body.orbitSummary.periodRelativeError,
  }))
  const regular = withTolerance.filter((entry) => entry.tolerance === 0.03)
  const irregular = withTolerance.filter((entry) => entry.tolerance === 0.1)
  const worstOf = (entries) =>
    entries.reduce((worst, entry) => (!worst || entry.relativeError > worst.relativeError ? entry : worst), null)
  const worstRegular = worstOf(regular)
  const worstIrregular = worstOf(irregular)
  validation.checks.push({
    name: 'kepler-third-law (satellites)',
    description:
      'Catalogued orbital periods are compared with the period predicted by Kepler\'s third law, P = 2*pi*sqrt(a^3/GM_parent), using the parent GM published by NASA/NSSDC.',
    compared: withTolerance.length,
    tiers: [
      { tier: 'regular (Laplace-plane)', count: regular.length, toleranceRelative: 0.03, worstCase: worstRegular ? { body: worstRegular.body.name, relativeError: round(worstRegular.relativeError, 5) } : null },
      { tier: 'irregular + Pluto system', count: irregular.length, toleranceRelative: 0.1, worstCase: worstIrregular ? { body: worstIrregular.body.name, relativeError: round(worstIrregular.relativeError, 5) } : null },
    ],
    passed: withTolerance.every((entry) => entry.relativeError < entry.tolerance),
  })
  if (!validation.checks[0].passed) {
    validation.warnings.push('Some satellite periods deviate from the two-body prediction beyond the tier tolerance.')
  }

  const missingRadius = bodies.filter((body) => body.physical?.meanRadiusKm === null || body.physical?.meanRadiusKm === undefined)
  const unflaggedMissingRadius = missingRadius.filter((body) => !body.physical?.radiusSource)
  validation.checks.push({
    name: 'radius-provenance',
    description:
      'Every body either carries a published radius or is explicitly flagged as lacking one, so the renderer and the information panel never present an invented size.',
    bodiesWithoutPublishedRadius: missingRadius.map((body) => body.id),
    passed: unflaggedMissingRadius.length === 0,
  })
  if (missingRadius.length > 0) {
    validation.warnings.push(
      `No published diameter is available for ${missingRadius.map((body) => body.id).join(', ')}; these bodies are rendered from their absolute magnitude and the UI reports 暂无可靠数据.`,
    )
  }

  const planetElements = planetBodies.filter((body) => body.type === 'planet')
  validation.checks.push({
    name: 'planet-element-coverage',
    description: 'The eight planets use the JPL/Standish Keplerian elements plus the Mode A ephemeris engine; both paths must be available.',
    planets: planetElements.map((body) => body.id),
    passed: planetElements.length === 8 && planetElements.every((body) => body.ephemeris?.body),
  })

  const byType = {}
  for (const body of bodies) byType[body.type] = (byType[body.type] ?? 0) + 1
  const byBucket = {}
  for (const object of index) byBucket[object.bucket] = (byBucket[object.bucket] ?? 0) + 1
  const byParent = {}
  for (const body of satellitesBodies) byParent[body.parentId] = (byParent[body.parentId] ?? 0) + 1

  const version = `v${versionStamp()}`
  const catalogDir = path.join(PUBLIC_DATA_DIR, 'catalog')

  const catalog = {
    $comment:
      'Normalized solar-system catalog. Counts are computed from the imported datasets at build time; no object totals are hard-coded in the application.',
    version,
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt,
    conventions: {
      distanceUnit: 'km (internal), au for heliocentric osculating elements',
      timeUnit: 'second (internal), Julian Date / MJD for epochs',
      angleUnit: 'radian internally, degree in the source datasets',
      ephemerisEpoch: 'J2000.0 (JD 2451545.0)',
      referenceFrame: 'heliocentric ecliptic J2000',
      sceneFrame: 'right-handed Y-up; see docs/coordinate-system.md',
    },
    sources: [
      planets.source,
      planets.reference,
      'https://ssd-api.jpl.nasa.gov/sbdb_query.api',
      'https://ssd.jpl.nasa.gov/sats/elem/',
      'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
      // The Minor Planet Center is the IAU authority for small-body designations
      // and NEO confirmation. Its comet/asteroid designation products are covered
      // conceptually by the JPL SBDB payload ingested here; see docs/data-sources.md.
      'https://www.minorplanetcenter.net/',
      starManifest.source,
    ],
    statistics: {
      totalBodies: bodies.length + index.length,
      renderedBodies: bodies.length,
      minorBodies: index.length,
      byType,
      minorBodiesByBucket: byBucket,
      satellitesByParent: byParent,
      hyperbolicMinorBodies: hyperbolic,
      stars: starManifest.counts.exported,
      namedStars: starManifest.counts.named,
    },
    starfield: {
      binary: 'stars/stars.bin',
      manifest: 'stars/stars.json',
      stride: starManifest.binary.stride,
      layout: starManifest.binary.layout,
      limitingMagnitude: starManifest.limitingMagnitude,
      count: starManifest.counts.exported,
      source: starManifest.source,
      license: starManifest.license,
    },
    satellitesWithPublishedPhase: satelliteElements.satellites.length,
    bodies,
    validation,
  }

  const catalogFileName = `catalog-${version}.json`
  await writeJson(path.join(catalogDir, catalogFileName), catalog, { pretty: false })
  // The catalog is now published under its version stamp only. Remove any legacy
  // unversioned copy so the directory always matches what the manifest declares.
  await rm(path.join(catalogDir, 'catalog.json'), { force: true })
  // The JPL/Standish planet elements are shipped so the application can evaluate
  // the Mode B Keplerian planet path next to the Mode A ephemeris.
  await writeJson(
    path.join(catalogDir, 'planet-elements.json'),
    {
      ...planets,
      $comment: `${planets.$comment} Copied into the runtime bundle by scripts/build-catalog.mjs so solar-system/src/astronomy/PlanetElements.ts can propagate the planets from the same authoritative table.`,
    },
  )
  await writeJson(
    path.join(catalogDir, 'minor-bodies.json'),
    {
      $comment:
        'Search and filter index for the minor-body catalog. Orbital elements live in minor-bodies.bin; this file carries identification and summary fields so that search never has to walk the element buffer.',
      version,
      source: minorBodiesSource.source,
      retrievedAt: minorBodiesSource.retrievedAt,
      counts: minorBodiesSource.counts,
      binary: {
        file: 'minor-bodies.bin',
        stride,
        layout: ['perihelionDistanceAu', 'eccentricity', 'inclinationRad', 'nodeRad', 'argPeriapsisRad', 'perihelionMjd', 'absoluteMagnitude', 'diameterKm'],
      },
      objects: index,
    },
    { pretty: false },
  )
  await writeBuffer(path.join(catalogDir, 'minor-bodies.bin'), Buffer.from(data.buffer))

  const manifest = {
    version,
    generatedAt: catalog.generatedAt,
    sourceUpdatedAt,
    // Names the versioned catalogue artefact inside this directory. The loader
    // follows this field, so a refresh never has to invalidate a cached file name.
    catalogFile: catalogFileName,
    files: [
      { path: `catalog/${catalogFileName}`, role: 'Sun, planets, dwarf planets, satellites, starfield manifest' },
      { path: 'catalog/planet-elements.json', role: 'JPL/Standish Keplerian elements for the Mode B planet path' },
      { path: 'catalog/minor-bodies.json', role: 'minor-body search/filter index' },
      { path: 'catalog/minor-bodies.bin', role: `Float32 orbital elements, ${stride} values per object` },
      { path: 'stars/stars.bin', role: 'Float32 star catalogue: raRad, decRad, magnitude, colorIndex' },
      { path: 'stars/stars.json', role: 'star catalogue manifest and named stars' },
      { path: 'textures/', role: 'planetary surface maps (offline bundle)' },
    ],
    statistics: catalog.statistics,
    validation: {
      passed: validation.checks.every((check) => check.passed),
      checks: validation.checks.map((check) => ({ name: check.name, passed: check.passed })),
    },
    appConfig: 'exhibition.config.json',
  }
  await writeJson(path.join(catalogDir, 'manifest.json'), manifest)

  log('')
  log(`Catalog ${version}: ${bodies.length} rendered bodies + ${index.length} minor bodies, ${starManifest.counts.exported} stars`)
  for (const check of validation.checks) log(`  ${check.passed ? 'PASS' : 'FAIL'}  ${check.name}`)
  for (const warning of validation.warnings) log(`  WARN  ${warning}`)
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(1)
})