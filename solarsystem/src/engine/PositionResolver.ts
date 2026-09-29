/**
 * Position resolver — the single source of truth for "where is everything".
 *
 * The astronomy layer produces heliocentric ecliptic J2000 positions in
 * kilometres (float64). This class evaluates every catalogued body for a Julian
 * Date, resolves the hierarchical parent/child relationships (Sun -> planet ->
 * moon) and converts the result into render units through the active ScaleTransform.
 *
 * Rendering itself is always camera-relative (see FloatingOrigin), so the
 * "absolute scene units" stored here are only an intermediate value.
 */
import { AU_KM, TWO_PI } from '../astronomy/Units'
import { addVec3, ORIGIN, scaleVec3, type Mat3, type Vec3 } from '../astronomy/Coordinates'
import { planetEquatorialFrame, type EphemerisBodyId, type EphemerisSource } from '../astronomy/Ephemeris'
import { propagateRelativeKm, type KeplerOrbitDefinition, type PropagationInputs } from '../astronomy/OrbitPropagator'
import type { CelestialBody } from '../types/catalog'
import { satelliteSystemFactor, type RadiusClass, type ScaleTransform } from '../data/ScaleModel'
import { J2000_MJD } from '../astronomy/Constants'

/** The subset of the catalog the resolver needs; keeps this module decoupled from the loader. */
export interface PositionResolverCatalog {
  bodies: CelestialBody[]
  bodyById: Map<string, CelestialBody>
}

export interface BodyState {
  id: string
  body: CelestialBody
  parentId: string | null
  /** Heliocentric ecliptic J2000 position, kilometres. */
  heliocentricKm: Vec3
  /** Position in render units using the astronomical origin (intermediate value). */
  absoluteUnits: Vec3
  radiusKm: number
  /** Radius in render units under the active scale mode. */
  radiusUnits: number
  visible: boolean
  /** True when the object is a minor body rather than a catalogued large body. */
  minor: boolean
}

interface CompiledBody {
  body: CelestialBody
  depth: number
  radiusClass: RadiusClass
  /** Innermost satellite offset of this body's own system, km (0 when it has none). */
  innermostSatelliteOffsetKm: number
  /** Factor applied to this body's parent-relative offset (satellite enhancement). */
  satelliteFactor: number
  /** Definition used only for the kepler position model. */
  definition?: KeplerOrbitDefinition
  inputs?: PropagationInputs
  ephemerisBody?: EphemerisBodyId
  geocentric: boolean
}

export class PositionResolver {
  private readonly compiled: CompiledBody[] = []
  private readonly byId = new Map<string, BodyState>()
  private readonly compiledById = new Map<string, CompiledBody>()
  private readonly planetFrames = new Map<string, ReturnType<typeof planetEquatorialFrame>>()

  private cachedJulianDate = Number.NaN
  private cachedScaleMode: ScaleTransform['mode'] | null = null
  /** Offset multiplier applied to each parent's satellite system, per scale mode. */
  private readonly satelliteFactors = new Map<string, number>()
  private readonly localOffsetScales = new Map<string, number>()

  private readonly catalog: PositionResolverCatalog
  private readonly ephemeris: EphemerisSource

  constructor(catalog: PositionResolverCatalog, ephemeris: EphemerisSource) {
    this.catalog = catalog
    this.ephemeris = ephemeris
    this.compile()
  }

  bodyFor(id: string): CelestialBody | undefined {
    return this.catalog.bodyById.get(id)
  }

  /** Gravitational parameter of a central body, when the catalog publishes one. */
  gmFor(id: string): number | undefined {
    return this.catalog.bodyById.get(id)?.physical?.gmKm3S2 ?? undefined
  }

  /**
   * Transform that takes an orbit expressed in the plane its elements refer to
   * (a Laplace / parent-equatorial plane) into the ecliptic frame.
   */
  referencePlaneFor(body: CelestialBody): Mat3 | undefined {
    const plane = body.elements?.referencePlane
    if (plane !== 'laplace' && plane !== 'body-equator') return undefined
    return this.parentEquatorialFrame(body.parentId)
  }

  statesAsMap(): Map<string, BodyState> {
    return this.byId
  }

  private compile(): void {
    const radiusClassOf = (body: CelestialBody): RadiusClass => {
      if (body.type === 'star') return 'star'
      if (body.type === 'planet') return 'planet'
      if (body.type === 'dwarfPlanet') return 'dwarfPlanet'
      if (body.type === 'moon') return 'moon'
      return 'minor'
    }
    const depthOf = (body: CelestialBody): number => {
      let depth = 0
      let current = body
      const guard = new Set<string>([body.id])
      while (current.parentId) {
        if (guard.has(current.parentId)) break
        guard.add(current.parentId)
        const parent = this.catalog.bodyById.get(current.parentId)
        if (!parent) break
        depth += 1
        current = parent
      }
      return depth
    }

    for (const body of this.catalog.bodies) {
      const compiled: CompiledBody = {
        body,
        depth: depthOf(body),
        geocentric: body.ephemeris?.center === 'geocentric',
        radiusClass: radiusClassOf(body),
        innermostSatelliteOffsetKm: 0,
        satelliteFactor: 1,
      }
      if (body.positionModel === 'ephemeris' && body.ephemeris) {
        compiled.ephemerisBody = body.ephemeris.body as EphemerisBodyId
      } else if (body.positionModel === 'kepler' && body.elements) {
        const elements = body.elements
        const periodDays = elements.periodDays ?? null
        const semiMajorAxisKm =
          elements.semiMajorAxisKm ??
          (elements.semiMajorAxisAu !== null && elements.semiMajorAxisAu !== undefined
            ? elements.semiMajorAxisAu * AU_KM
            : 0)
        compiled.definition = {
          semiMajorAxisKm,
          eccentricity: elements.eccentricity,
          inclinationDeg: elements.inclinationDeg,
          longitudeAscendingNodeDeg: elements.longitudeAscendingNodeDeg,
          argumentOfPeriapsisDeg: elements.argumentOfPeriapsisDeg,
          meanAnomalyDeg: elements.meanAnomalyDeg ?? 0,
          epochJD: elements.epochJD ?? (elements.epochMjd !== null && elements.epochMjd !== undefined ? elements.epochMjd + 2400000.5 : 2451545.0),
          perihelionJD: elements.perihelionJD ?? null,
        }
        compiled.inputs = {
          meanMotionRadPerDayOverride: periodDays && periodDays > 0 ? TWO_PI / periodDays : undefined,
          gmKm3S2: this.centralGravitationalParameter(body.parentId),
        }
        if (elements.referencePlane === 'laplace' || elements.referencePlane === 'body-equator') {
          compiled.inputs.referencePlaneToEcliptic = this.parentEquatorialFrame(body.parentId)
        }
      }
      this.compiled.push(compiled)
      this.compiledById.set(body.id, compiled)
    }
    this.compiled.sort((a, b) => a.depth - b.depth)

    // Find, per parent, the innermost satellite distance. It sets one scale factor
    // for the whole satellite system so the moons keep their relative spacing.
    for (const compiled of this.compiled) {
      const parent = compiled.body.parentId ? this.compiledById.get(compiled.body.parentId) : undefined
      if (!parent) continue
      const offset = this.semiMajorAxisKmOf(compiled.body)
      if (offset === null) continue
      if (parent.innermostSatelliteOffsetKm === 0 || offset < parent.innermostSatelliteOffsetKm) {
        parent.innermostSatelliteOffsetKm = offset
      }
    }
  }

  /** Semi-major axis of a body's orbit in km, when the catalog publishes one. */
  private semiMajorAxisKmOf(body: CelestialBody): number | null {
    const elements = body.elements
    if (!elements) return null
    if (elements.semiMajorAxisKm) return elements.semiMajorAxisKm
    if (elements.semiMajorAxisAu) return elements.semiMajorAxisAu * AU_KM
    return null
  }

  private centralGravitationalParameter(parentId: string | null): number | undefined {
    if (!parentId) return undefined
    const parent = this.catalog.bodyById.get(parentId)
    return parent?.physical?.gmKm3S2 ?? undefined
  }

  private parentEquatorialFrame(parentId: string | null) {
    if (!parentId) return undefined
    const cached = this.planetFrames.get(parentId)
    if (cached) return cached
    const parent = this.catalog.bodyById.get(parentId)
    if (!parent?.orientation) return undefined
    const frame = planetEquatorialFrame(parent.orientation.poleRaDeg, parent.orientation.poleDecDeg)
    this.planetFrames.set(parentId, frame)
    return frame
  }

  /**
   * Multiplier applied to a parent's satellite system, computed once per scale mode
   * from the innermost moon's distance and the parent's rendered radius.
   */
  private satelliteFactorFor(parentId: string, scale: ScaleTransform): number {
    const cached = this.satelliteFactors.get(parentId)
    if (cached !== undefined) return cached
    const parentCompiled = this.compiledById.get(parentId)
    const parentState = this.byId.get(parentId)
    if (!parentCompiled || !parentState || scale.mode === 'scientific') {
      this.satelliteFactors.set(parentId, 1)
      return 1
    }
    const localFactor = scale.localScaleFactorKmToUnits(
      Math.hypot(parentState.heliocentricKm.x, parentState.heliocentricKm.y, parentState.heliocentricKm.z),
    )
    const factor = satelliteSystemFactor(
      parentCompiled.innermostSatelliteOffsetKm,
      parentState.radiusUnits,
      localFactor,
    )
    this.satelliteFactors.set(parentId, factor)
    this.localOffsetScales.set(parentId, localFactor * factor)
    return factor
  }

  /**
   * Multiplier that turns a parent-relative kilometre offset into render units for
   * the given parent. Local orbit polylines use the same value so that a moon's path
   * passes exactly through the moon.
   */
  localOffsetScale(parentId: string): number {
    return this.localOffsetScales.get(parentId) ?? 1 / 1000
  }

  /** Forces the next update() to recompute, e.g. after a scale-mode change. */
  invalidate(): void {
    this.cachedJulianDate = Number.NaN
    this.cachedScaleMode = null
    this.satelliteFactors.clear()
    this.localOffsetScales.clear()
  }

  /** Evaluates every body for the given instant. Re-entrant calls are cached. */
  update(julianDate: number, scale: ScaleTransform): void {
    if (this.cachedJulianDate === julianDate && this.cachedScaleMode === scale.mode) return
    this.cachedJulianDate = julianDate
    this.cachedScaleMode = scale.mode
    this.byId.clear()

    const positions = new Map<string, Vec3>()
    for (const compiled of this.compiled) {
      const { body } = compiled
      let heliocentricKm: Vec3

      if (body.positionModel === 'origin') {
        heliocentricKm = ORIGIN
      } else if (compiled.ephemerisBody) {
        heliocentricKm = this.ephemeris.heliocentricEclipticKm(compiled.ephemerisBody, julianDate)
      } else if (compiled.definition && compiled.inputs) {
        const relative = propagateRelativeKm(compiled.definition, compiled.inputs, julianDate)
        const parentPosition = body.parentId ? positions.get(body.parentId) : undefined
        heliocentricKm = parentPosition ? addVec3(parentPosition, relative) : relative
      } else {
        heliocentricKm = ORIGIN
      }

      positions.set(body.id, heliocentricKm)
      const radiusKm = body.physical.meanRadiusKm ?? estimateRadiusFromMagnitude(body)
      const radiusUnits = scale.radiusKmToUnits(radiusKm, compiled.radiusClass)
      const absoluteUnits = scale.positionKmToUnits(heliocentricKm)

      // Satellite enhancement: the parent-relative offset is multiplied by one
      // factor per parent, computed from the innermost moon so that the system stays
      // outside the planet and keeps its internal proportions. In the scientific
      // scale the factor is 1 and the moons sit at their true positions.
      let renderUnits = absoluteUnits
      if (body.parentId && body.parentId !== 'sun') {
        const parentState = this.byId.get(body.parentId)
        const parentAbsolute = parentState?.absoluteUnits
        if (parentAbsolute) {
          const factor = this.satelliteFactorFor(body.parentId, scale)
          renderUnits = {
            x: parentAbsolute.x + (absoluteUnits.x - parentAbsolute.x) * factor,
            y: parentAbsolute.y + (absoluteUnits.y - parentAbsolute.y) * factor,
            z: parentAbsolute.z + (absoluteUnits.z - parentAbsolute.z) * factor,
          }
        }
      }

      this.byId.set(body.id, {
        id: body.id,
        body,
        parentId: body.parentId,
        heliocentricKm,
        absoluteUnits: renderUnits,
        radiusKm,
        radiusUnits,
        visible: true,
        minor: false,
      })
    }
  }

  state(id: string): BodyState | undefined {
    return this.byId.get(id)
  }

  states(): IterableIterator<BodyState> {
    return this.byId.values()
  }

  get size(): number {
    return this.byId.size
  }

  /** Position of an arbitrary body in render units, relative to a camera origin. */
  relativeUnits(id: string, originUnits: Vec3, target: { x: number; y: number; z: number }): boolean {
    const state = this.byId.get(id)
    if (!state) return false
    target.x = state.absoluteUnits.x - originUnits.x
    target.y = state.absoluteUnits.y - originUnits.y
    target.z = state.absoluteUnits.z - originUnits.z
    return true
  }

  /**
   * Instantaneous velocity by central difference of the resolved position.
   * Used by scientific mode; one extra evaluation per side is negligible for a
   * single selected body.
   */
  velocityKmS(id: string, julianDate: number, scale: ScaleTransform, deltaSeconds = 5): Vec3 {
    void scale
    const compiled = this.compiledById.get(id)
    if (!compiled) return ORIGIN
    const evaluate = (jd: number): Vec3 => {
      const { body } = compiled
      if (body.positionModel === 'origin') return ORIGIN
      if (compiled.ephemerisBody) return this.ephemeris.heliocentricEclipticKm(compiled.ephemerisBody, jd)
      if (compiled.definition && compiled.inputs) {
        const relative = propagateRelativeKm(compiled.definition, compiled.inputs, jd)
        const parentPosition = body.parentId ? this.positionKm(body.parentId, jd) : undefined
        return parentPosition ? addVec3(parentPosition, relative) : relative
      }
      return ORIGIN
    }
    const deltaDays = deltaSeconds / 86400
    const before = evaluate(julianDate - deltaDays)
    const after = evaluate(julianDate + deltaDays)
    void scale
    return scaleVec3(
      {
        x: after.x - before.x,
        y: after.y - before.y,
        z: after.z - before.z,
      },
      1 / (2 * deltaSeconds),
    )
  }

  /** Heliocentric position of a single body outside the cached update cycle. */
  private positionKm(id: string, julianDate: number): Vec3 | undefined {
    const compiled = this.compiledById.get(id)
    if (!compiled) return undefined
    if (compiled.ephemerisBody) return this.ephemeris.heliocentricEclipticKm(compiled.ephemerisBody, julianDate)
    if (compiled.definition && compiled.inputs) {
      const relative = propagateRelativeKm(compiled.definition, compiled.inputs, julianDate)
      const parentPosition = compiled.body.parentId ? this.positionKm(compiled.body.parentId, julianDate) : undefined
      return parentPosition ? addVec3(parentPosition, relative) : relative
    }
    return ORIGIN
  }

  /** Largest orbit radius present in the catalog, used to size the overview camera. */
  overviewRadiusKm(): number {
    let maximum = AU_KM * 30
    for (const state of this.byId.values()) {
      const distance = Math.sqrt(
        state.heliocentricKm.x ** 2 + state.heliocentricKm.y ** 2 + state.heliocentricKm.z ** 2,
      )
      if (distance > maximum) maximum = distance
    }
    return maximum
  }
}

/**
 * Radius for bodies without a published diameter (Eris, Haumea, Makemake). The
 * information panel reports 暂无可靠数据 for those bodies; here the marker size is
 * derived from the absolute magnitude so that the object remains findable, and it
 * is never presented as a measured radius.
 */
function estimateRadiusFromMagnitude(body: CelestialBody): number {
  const h = body.physical.absoluteMagnitude
  if (h === null || h === undefined) return 1
  // Crude size indicator: brighter absolute magnitude -> larger marker, clamped to
  // the range of the known dwarf-planet radii so the marker stays plausible.
  const scaled = 700 * Math.pow(10, -h / 12)
  return Math.min(1400, Math.max(60, scaled))
}

export { J2000_MJD }