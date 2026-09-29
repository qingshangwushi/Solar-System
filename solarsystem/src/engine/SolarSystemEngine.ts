/**
 * The solar-system engine.
 *
 * Orchestration core: it owns the renderer, the camera, the position resolver, the
 * scale model, the orbit worker and every render layer, and drives them from the
 * simulation clock. The React layer talks to this class only through its public
 * methods and the EventBus — it never touches three.js objects.
 *
 * Frame loop (driven by requestAnimationFrame):
 *   1. advance the simulation clock,
 *   2. ask the orbit worker for the minor-body positions,
 *   3. resolve the catalogued bodies for the new instant,
 *   4. update the camera and the floating origin,
 *   5. update each body visual (LOD tier, orientation, texture stream),
 *   6. rewrite the orbit paths, the minor-body cloud and the labels,
 *   7. render through the composer,
 *   8. feed the quality controller and the performance monitor.
 */
import { Vector3 } from 'three'
import type { CelestialBody, SolarSystemCatalog } from '../types/catalog'
import { SimulationClock, parseTimeInput } from '../astronomy/TimeSystem'
import { AstronomyEngineEphemerisSource } from '../astronomy/Ephemeris'
import { GM_SUN_KM3_S2, J2000_JD } from '../astronomy/Constants'
import { AU_KM, SECONDS_PER_DAY, formatDistance } from '../astronomy/Units'
import { PositionResolver } from './PositionResolver'
import { createScaleTransform, type ScaleMode, type ScaleTransform } from '../data/ScaleModel'
import { CameraController, type CameraMode } from './CameraController'
import { SceneRenderer } from './Renderer'
import { BodyVisual } from '../render/BodyRenderer'
import { OrbitRenderer, type OrbitColourKey } from '../render/OrbitRenderer'
import { MinorBodyRenderer, type MinorBodyRenderItem } from '../render/MinorBodyRenderer'
import { StarFieldRenderer } from '../render/StarFieldRenderer'
import { LabelRenderer, type LabelCandidate } from './LabelRenderer'
import { RenderOrigin } from './FloatingOrigin'
import { EventBus } from './EventBus'
import { OrbitWorkerClient } from './OrbitWorkerClient'
import { QualityController, type QualityLevel } from './QualityController'
import { PerformanceMonitor } from './PerformanceMonitor'
import { TextureProvider } from '../data/TextureProvider'
import { sampleOrbitPath, meanMotionFromPeriodDays } from '../astronomy/OrbitPropagator'
import { orbitalSpeedKmS } from '../astronomy/KeplerSolver'
import type { MinorBodyBucket, MinorBodyRecord } from '../types/catalog'

export interface MinorBodyRuntime {
  elements: Float32Array
  subset: Int32Array
  records: MinorBodyRecord[]
  subsetRecordIndices: Int32Array
}

export interface SolarSystemEngineOptions {
  canvas: HTMLCanvasElement
  container: HTMLElement
  catalog: SolarSystemCatalog
  bodies: CelestialBody[]
  bodyById: Map<string, CelestialBody>
  minorBodies: MinorBodyRuntime | null
  stars: Float32Array
  starManifest: SolarSystemCatalog['starfield'] & {
    namedStars?: Array<{ name: string; raRad: number; decRad: number; magnitude: number; colorIndex: number }>
  }
  quality: QualityLevel
  scaleMode: ScaleMode
  language: 'zh-CN' | 'en-US'
  reducedMotion: boolean
  enableStarfield: boolean
  onStatus?: (level: 'info' | 'warn' | 'error', message: string) => void
}

/** Filter keys exposed to the UI for the minor-body cloud. */
export const MINOR_BODY_FILTERS: Array<{ key: string; bucket: MinorBodyBucket | null; zh: string; en: string }> = [
  { key: 'mainBelt', bucket: 'mainBelt', zh: '小行星带', en: 'Asteroid belt' },
  { key: 'nearEarth', bucket: 'nearEarth', zh: '近地天体', en: 'Near-Earth objects' },
  { key: 'trojan', bucket: 'trojan', zh: '特洛伊群', en: 'Trojans' },
  { key: 'centaur', bucket: 'centaur', zh: '半人马小行星', en: 'Centaurs' },
  { key: 'tno', bucket: 'tno', zh: '海王星外天体', en: 'Trans-Neptunian objects' },
  { key: 'comet', bucket: 'comet', zh: '彗星', en: 'Comets' },
]

export class SolarSystemEngine {
  readonly events = new EventBus()
  readonly clock: SimulationClock
  readonly renderer: SceneRenderer
  readonly cameraController: CameraController
  readonly quality: QualityController
  readonly performance = new PerformanceMonitor()

  private readonly container: HTMLElement
  private readonly bodyById: Map<string, CelestialBody>
  private readonly resolver: PositionResolver
  private readonly textures: TextureProvider
  private readonly orbitRenderer = new OrbitRenderer()
  private readonly minorBodyRenderer: MinorBodyRenderer | null
  private readonly starRenderer: StarFieldRenderer | null
  private readonly labelRenderer: LabelRenderer
  private readonly worker = new OrbitWorkerClient()
  private readonly minorRuntime: MinorBodyRuntime | null
  private readonly ephemeris = new AstronomyEngineEphemerisSource()

  private scale: ScaleTransform
  private readonly origin = new RenderOrigin()
  private readonly sunDirectionScene = new Vector3(-1, 0, 0)
  private readonly visuals = new Map<string, BodyVisual>()
  private readonly minorItems: MinorBodyRenderItem[] = []
  private readonly minorRecordIndexBySlot: Int32Array | null

  private selectedId: string | null = null
  private selectedMinorIndex: number | null = null
  private trackedId: string | null = null
  private language: 'zh-CN' | 'en-US'
  private orbitPathsVisible = true
  private labelsVisible = true
  private atmosphereVisible = true
  private starfieldEnabled: boolean
  private minorVisible = false
  private minorFilters = new Set<string>()
  private minorOpacity = 0.85

  private rafHandle = 0
  private lastFrameTime = 0
  private lastClockEmit = 0
  private lastPerformanceEmit = 0
  private lastMinorUpdateJulianDate = Number.NaN
  private disposed = false

  constructor(options: SolarSystemEngineOptions) {
    this.container = options.container
    this.bodyById = options.bodyById
    this.language = options.language
    this.starfieldEnabled = options.enableStarfield && options.stars.length > 0
    this.minorRuntime = options.minorBodies

    this.clock = new SimulationClock(J2000_JD, 1, false)

    this.renderer = new SceneRenderer(options.canvas, {
      pixelRatio: Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio),
      bloom: true,
    })
    this.renderer.setContextLostHandler(() => this.events.emit('contextLost', {}))
    this.renderer.setContextRestoredHandler(() => {
      // Rebuild GPU state after the browser recreated the context; nothing is
      // faked by reloading the page.
      for (const visual of this.visuals.values()) visual.dispose()
      this.visuals.clear()
      this.createBodyVisuals()
      this.events.emit('contextRestored', {})
    })

    this.quality = new QualityController(options.quality)
    this.scale = createScaleTransform(options.scaleMode)

    this.cameraController = new CameraController(this.renderer.camera)
    this.cameraController.setReducedMotion(options.reducedMotion)

    this.resolver = new PositionResolver(
      { bodies: options.bodies, bodyById: options.bodyById },
      this.ephemeris,
    )

    this.textures = new TextureProvider(options.quality)
    this.labelRenderer = new LabelRenderer(this.createLabelLayer())

    this.renderer.scene.add(this.orbitRenderer.group)

    if (options.minorBodies) {
      this.minorBodyRenderer = new MinorBodyRenderer()
      this.renderer.scene.add(this.minorBodyRenderer.points)
      this.minorRecordIndexBySlot = options.minorBodies.subsetRecordIndices
      this.worker.init(options.minorBodies.elements, options.minorBodies.subset, GM_SUN_KM3_S2)
      const records = options.minorBodies.records
      for (let slot = 0; slot < records.length; slot++) {
        const record = records[slot]
        this.minorItems.push({
          index: this.minorRecordIndexBySlot[slot] ?? slot,
          bucket: record.bucket,
          absoluteMagnitude: record.absoluteMagnitude,
          diameterKm: record.diameterKm,
          positionKm: { x: 0, y: 0, z: 0 },
        })
      }
    } else {
      this.minorBodyRenderer = null
      this.minorRecordIndexBySlot = null
    }

    if (this.starfieldEnabled) {
      // Parented to the camera: the background then has no parallax at all.
      this.starRenderer = new StarFieldRenderer(options.starManifest as never, options.stars)
      this.renderer.camera.add(this.starRenderer.points)
      this.starRenderer.setStarBudget(this.quality.profile.starCount)
    } else {
      this.starRenderer = null
    }

    this.createBodyVisuals()
    this.applyQuality()
    this.setLanguage(options.language)
    this.frameOverview()
    this.events.emit('scaleModeChanged', { mode: options.scaleMode })
  }

  private createLabelLayer(): HTMLElement {
    const layer = document.createElement('div')
    layer.className = 'label-layer'
    this.container.appendChild(layer)
    return layer
  }

  private createBodyVisuals(): void {
    for (const body of this.bodyById.values()) {
      if (body.type !== 'star' && body.type !== 'planet' && body.type !== 'dwarfPlanet' && body.type !== 'moon') continue
      const visual = new BodyVisual(body)
      this.visuals.set(body.id, visual)
      this.renderer.scene.add(visual.group)
      // Moons are parented to their planet's anchor from the first frame so the
      // scene graph mirrors the astronomical hierarchy.
      const parent = body.parentId ? this.visuals.get(body.parentId) : undefined
      if (parent) parent.group.add(visual.group)
    }
  }

  /* ------------------------------------------------------------------ state */

  get scaleMode(): ScaleMode {
    return this.scale.mode
  }

  get selectedObjectId(): string | null {
    return this.selectedId
  }

  get trackedObjectId(): string | null {
    return this.trackedId
  }

  get isOrbitVisible(): boolean {
    return this.orbitPathsVisible
  }

  get isLabelVisible(): boolean {
    return this.labelsVisible
  }

  get isMinorVisible(): boolean {
    return this.minorVisible
  }

  get activeFilters(): ReadonlySet<string> {
    return this.minorFilters
  }

  setLanguage(language: 'zh-CN' | 'en-US'): void {
    this.language = language
  }

  setScaleMode(mode: ScaleMode): void {
    const framingRatio = this.cameraController.framingRatio
    this.scale = createScaleTransform(mode)
    this.resolver.invalidate()
    this.resolver.update(this.clock.jd, this.scale)
    // Parent-relative paths bake render units at build time, so they are rebuilt
    // whenever the mapping changes; heliocentric paths keep kilometres and are
    // re-warped every frame.
    this.refreshLocalPaths()
    const trackedId = this.cameraController.trackedId
    const trackedState = trackedId ? this.resolver.state(trackedId) : undefined
    if (trackedState) {
      // Keep the same number of body radii, so switching scale becomes a direct
      // visual comparison instead of a jump to a different place.
      this.cameraController.setTrackedRadius(trackedState.radiusUnits)
      this.cameraController.placeRelativeToTarget(trackedState.absoluteUnits, framingRatio)
    } else {
      this.frameOverview()
    }
    this.events.emit('scaleModeChanged', { mode })
  }

  setTimeScale(secondsPerSecond: number): void {
    this.clock.setRate(secondsPerSecond)
    this.events.emit('timeChanged', { julianDate: this.clock.jd, timeScale: this.clock.timeScale, paused: this.clock.paused })
  }

  setPaused(paused: boolean): void {
    this.clock.setPaused(paused)
    this.events.emit('timeChanged', { julianDate: this.clock.jd, timeScale: this.clock.timeScale, paused: this.clock.paused })
  }

  togglePaused(): void {
    this.clock.togglePaused()
    this.events.emit('timeChanged', { julianDate: this.clock.jd, timeScale: this.clock.timeScale, paused: this.clock.paused })
  }

  reverseTime(): void {
    this.clock.reverse()
    this.events.emit('timeChanged', { julianDate: this.clock.jd, timeScale: this.clock.timeScale, paused: this.clock.paused })
  }

  jumpToDate(input: string): boolean {
    const julianDate = parseTimeInput(input)
    if (julianDate === null) return false
    this.clock.setJulianDate(julianDate)
    this.events.emit('timeChanged', { julianDate, timeScale: this.clock.timeScale, paused: this.clock.paused })
    return true
  }

  jumpToJulianDate(julianDate: number): void {
    this.clock.setJulianDate(julianDate)
    this.events.emit('timeChanged', { julianDate, timeScale: this.clock.timeScale, paused: this.clock.paused })
  }

  shiftTimeDays(days: number): void {
    this.jumpToJulianDate(this.clock.jd + days)
  }

  selectBody(id: string): void {
    if (this.selectedId === id) return
    this.showOrbitFor(id)
    this.selectedId = id
    this.trackedId = id
    this.events.emit('selectionChanged', { id })
    this.events.emit('trackingChanged', { id })
  }

  clearSelection(): void {
    if (this.selectedId) this.hideOrbitFor(this.selectedId)
    if (this.selectedMinorIndex !== null) {
      this.hideMinorBodyOrbit(this.selectedMinorIndex)
    }
    this.selectedId = null
    this.selectedMinorIndex = null
    this.events.emit('selectionChanged', { id: null })
  }

  get selectedMinorBodyIndex(): number | null {
    return this.selectedMinorIndex
  }

  /**
   * Selects a minor body: highlights it, draws its trajectory and moves the camera.
   * The position comes from the worker cloud, so no additional propagation is done.
   */
  selectMinorBody(recordIndex: number): boolean {
    const items = this.minorItemsForRender ?? this.minorItems
    const item = items.find((entry) => entry.index === recordIndex)
    if (!item) return false
    this.selectedId = null
    this.selectedMinorIndex = recordIndex
    const warped = this.scale.positionKmToUnits(item.positionKm)
    const radiusKm = item.diameterKm && item.diameterKm > 0 ? item.diameterKm / 2 : 1
    this.cameraController.flyTo({
      id: `minor:${recordIndex}`,
      absoluteUnits: warped,
      radiusUnits: this.scale.radiusKmToUnits(radiusKm),
    })
    void this.showMinorBodyOrbit(recordIndex)
    this.events.emit('selectionChanged', { id: `minor:${recordIndex}` })
    return true
  }

  /** Current state of a minor body, for the information panel. */
  describeMinorBody(recordIndex: number): MinorBodyDescription | null {
    const record = this.minorRuntime?.records[recordIndex]
    if (!record) return null
    const items = this.minorItemsForRender ?? this.minorItems
    const item = items.find((entry) => entry.index === recordIndex)
    if (!item) return null
    const position = item.positionKm
    const distanceFromSunKm = Math.hypot(position.x, position.y, position.z)
    const recordIndexInBuffer = recordIndex
    return {
      record,
      heliocentricKm: position,
      distanceFromSunKm,
      // Two-body speed from GM_sun and the current radius (vis-viva).
      speedKmS: orbitalSpeedKmS(GM_SUN_KM3_S2, Math.max(1, distanceFromSunKm), this.minorSemiMajorAxisKm(recordIndexInBuffer)),
    }
  }

  private minorSemiMajorAxisKm(recordIndex: number): number {
    const qAu = this.minorRuntime?.elements[recordIndex * 8] ?? 0
    const eccentricity = this.minorRuntime?.elements[recordIndex * 8 + 1] ?? 0
    if (!(qAu > 0) || eccentricity >= 1) {
      // Hyperbolic: fall back to the current heliocentric distance.
      const items = this.minorItemsForRender ?? this.minorItems
      const item = items.find((entry) => entry.index === recordIndex)
      return item ? Math.hypot(item.positionKm.x, item.positionKm.y, item.positionKm.z) : AU_KM
    }
    return (qAu * AU_KM) / (1 - eccentricity)
  }

  /** Selects a body and performs the cinematic transition. */
  flyTo(id: string): boolean {
    const state = this.resolver.state(id)
    if (!state) return false
    this.selectBody(id)
    this.cameraController.flyTo(state)
    if (this.cameraController.mode === 'overview' || this.cameraController.mode === 'free') {
      this.cameraController.setMode('orbit')
      this.events.emit('cameraModeChanged', { mode: 'orbit' })
    }
    this.events.emit('flyToStarted', { id, fromDistanceKm: 0 })
    return true
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraController.setMode(mode)
    if (mode === 'overview') this.frameOverview()
    this.events.emit('cameraModeChanged', { mode })
  }

  setOrbitVisibility(visible: boolean): void {
    this.orbitPathsVisible = visible
    this.orbitRenderer.setVisible(visible)
  }

  setLabelVisibility(visible: boolean): void {
    this.labelsVisible = visible
    if (!visible) this.labelRenderer.clear()
  }

  setAtmosphereVisibility(visible: boolean): void {
    this.atmosphereVisible = visible
  }

  setStarfieldEnabled(enabled: boolean): void {
    this.starfieldEnabled = enabled
    this.starRenderer?.setEnabled(enabled)
  }

  setMinorBodiesVisible(visible: boolean): void {
    this.minorVisible = visible && this.minorRuntime !== null
    this.minorBodyRenderer?.setVisible(this.minorVisible)
  }

  toggleFilter(key: string): void {
    if (this.minorFilters.has(key)) this.minorFilters.delete(key)
    else this.minorFilters.add(key)
    this.rebuildMinorSubset()
  }

  setFilters(keys: Iterable<string>): void {
    this.minorFilters = new Set(keys)
    this.rebuildMinorSubset()
  }

  private rebuildMinorSubset(): void {
    if (!this.minorRuntime || !this.minorBodyRenderer) return
    const active = this.minorFilters.size > 0
    this.setMinorBodiesVisible(active)
    if (!active) return

    const all = this.minorRuntime.records
    const subsetSlots: number[] = []
    const subsetRecordIndices: number[] = []
    for (let slot = 0; slot < this.minorRuntime.subset.length; slot++) {
      const recordIndex = this.minorRuntime.subsetRecordIndices[slot]
      const record = all[recordIndex]
      if (!record) continue
      if (!this.minorFilters.has(record.bucket)) continue
      subsetSlots.push(slot)
      subsetRecordIndices.push(recordIndex)
    }
    // Build a filtered item list in place so the renderer keeps its buffers.
    const filtered: MinorBodyRenderItem[] = subsetSlots.map((_slot, position) => {
      const recordIndex = subsetRecordIndices[position]
      const record = all[recordIndex]
      return {
        index: recordIndex,
        bucket: record.bucket,
        absoluteMagnitude: record.absoluteMagnitude,
        diameterKm: record.diameterKm,
        positionKm: { x: 0, y: 0, z: 0 },
      }
    })
    this.minorItemsForRender = filtered
    this.minorOpacity = 0.9
    this.minorBodyRenderer.setOpacity(this.minorOpacity)
    this.worker.setSubset(Int32Array.from(subsetSlots))
  }

  private minorItemsForRender: MinorBodyRenderItem[] | null = null

  /** Loads the trajectory of a minor body for the orbit overlay. */
  async showMinorBodyOrbit(recordIndex: number): Promise<void> {
    const path = await this.worker.orbitPath(recordIndex, 256)
    if (!path || this.disposed) return
    this.orbitRenderer.setHeliocentricPath(`minor:${recordIndex}`, path, 'selected')
  }

  hideMinorBodyOrbit(recordIndex: number): void {
    this.orbitRenderer.removeHeliocentricPath(`minor:${recordIndex}`)
  }

  setQualityProfile(level: QualityLevel, manual = true): void {
    this.quality.setProfile(level, manual)
    this.textures.setQuality(level)
    this.applyQuality()
  }

  private applyQuality(): void {
    const profile = this.quality.profile
    this.renderer.applyQuality(profile, typeof window === 'undefined' ? 1 : window.devicePixelRatio)
    this.starRenderer?.setStarBudget(profile.starCount)
  }

  /**
   * Frames the eight planets. Dwarf planets are deliberately excluded: framing out to
   * Eris (68 au) would shrink the inner system to a few pixels, so the overview is
   * built around Neptune and the "outer system" framing covers the Kuiper belt.
   */
  frameOverview(): void {
    let maximumAu = 1
    for (const body of this.bodyById.values()) {
      if (body.type !== 'planet') continue
      const au = body.orbitSummary?.semiMajorAxisAu ?? (body.orbitSummary?.semiMajorAxisKm ?? 0) / AU_KM
      if (au > maximumAu) maximumAu = au
    }
    const units = this.scale.distanceKmToUnits(maximumAu * AU_KM * 1.12)
    this.trackedId = null
    this.cameraController.setOverviewDistance(units)
    this.cameraController.setMode('overview')
    // Immediate placement: a damped transition would show the Sun filling the frame
    // for the first seconds of the exhibition.
    this.cameraController.placeAt(units, 0.9, 0.42)
  }

  /** Frames the outer solar system, out to the Kuiper belt. */
  frameOuterSystem(): void {
    const units = this.scale.distanceKmToUnits(48 * AU_KM)
    this.trackedId = null
    this.cameraController.setOverviewDistance(units)
    this.cameraController.setMode('overview')
    this.cameraController.placeAt(units, 0.9, 0.5)
    this.events.emit('cameraModeChanged', { mode: 'overview' })
  }

  /**
   * Screen-space hit test against the catalogued bodies. Projected-centre testing
   * is used rather than GPU raycasting: it is O(n) over ~180 objects, works for
   * bodies that are currently rendered as a single point, and stays correct on
   * touch panels where a wider hit area is required.
   */
  pickBodyAt(screenX: number, screenY: number): string | null {
    const camera = this.renderer.camera
    const viewport = this.renderer.viewport
    const cameraPosition = this.origin.originUnits
    let bestId: string | null = null
    let bestScore = Number.POSITIVE_INFINITY
    for (const state of this.resolver.states()) {
      const distanceX = state.absoluteUnits.x - cameraPosition.x
      const distanceY = state.absoluteUnits.y - cameraPosition.y
      const distanceZ = state.absoluteUnits.z - cameraPosition.z

      const projected = this.pickScratch.set(distanceX, distanceY, distanceZ).project(camera)
      if (projected.z < -1 || projected.z > 1) continue
      const x = (projected.x * 0.5 + 0.5) * viewport.width
      const y = (-projected.y * 0.5 + 0.5) * viewport.height
      const separation = Math.hypot(x - screenX, y - screenY)
      const distanceToCamera = Math.hypot(distanceX, distanceY, distanceZ)
      const projectedRadius = this.project(state).pixels
      const tolerance = Math.max(16, Math.min(140, projectedRadius * 1.2))
      if (separation > tolerance) continue
      // Prefer the closer object when two overlap on screen.
      const score = separation / tolerance + distanceToCamera * 1e-9
      if (score < bestScore) {
        bestScore = score
        bestId = state.id
      }
    }
    return bestId
  }

  private readonly pickScratch = new Vector3()

  /** Screen-space hit test against the minor-body cloud. */
  pickMinorBodyAt(screenX: number, screenY: number): number | null {
    if (!this.minorBodyRenderer || !this.minorVisible) return null
    const camera = this.renderer.camera
    const viewport = this.renderer.viewport
    const cameraPosition = this.origin.originUnits
    const items = this.minorItemsForRender ?? this.minorItems
    let bestIndex: number | null = null
    let bestSeparation = Number.POSITIVE_INFINITY
    for (const item of items) {
      const warped = this.scale.positionKmToUnits(item.positionKm)
      const projected = this.pickScratch
        .set(warped.x - cameraPosition.x, warped.y - cameraPosition.y, warped.z - cameraPosition.z)
        .project(camera)
      if (projected.z < -1 || projected.z > 1) continue
      const x = (projected.x * 0.5 + 0.5) * viewport.width
      const y = (-projected.y * 0.5 + 0.5) * viewport.height
      const separation = Math.hypot(x - screenX, y - screenY)
      if (separation < 12 && separation < bestSeparation) {
        bestSeparation = separation
        bestIndex = item.index
      }
    }
    return bestIndex
  }

  /* ------------------------------------------------------------ information */

  /** Everything the information panel needs about one body, computed now. */
  describeBody(id: string): BodyDescription | null {
    const state = this.resolver.state(id)
    if (!state) return null
    const body = state.body
    const julianDate = this.clock.jd
    const velocity = this.resolver.velocityKmS(id, julianDate, this.scale)
    const parentState = state.parentId ? this.resolver.state(state.parentId) : undefined
    const position = state.heliocentricKm
    const distanceFromSunKm = Math.hypot(position.x, position.y, position.z)
    const relativeToParent = parentState
      ? {
          x: position.x - parentState.heliocentricKm.x,
          y: position.y - parentState.heliocentricKm.y,
          z: position.z - parentState.heliocentricKm.z,
        }
      : null
    // Distance from the camera. Under the linear scales this converts exactly to
    // kilometres. The exhibit scale maps radius non-linearly, so a difference of two
    // mapped positions has no single kilometre equivalent; the panel then reports the
    // render-unit distance instead of inventing a number.
    const cameraDistanceUnits = Math.hypot(
      state.absoluteUnits.x - this.origin.originUnits.x,
      state.absoluteUnits.y - this.origin.originUnits.y,
      state.absoluteUnits.z - this.origin.originUnits.z,
    )
    const cameraDistanceKm = this.scale.isLinear ? this.scale.unitsToDistanceKm(cameraDistanceUnits) : null
    return {
      id,
      body,
      julianDate,
      heliocentricKm: position,
      distanceFromSunKm,
      distanceFromParentKm: relativeToParent ? Math.hypot(relativeToParent.x, relativeToParent.y, relativeToParent.z) : null,
      parentId: state.parentId,
      velocityKmS: Math.hypot(velocity.x, velocity.y, velocity.z),
      speedDirectionKmS: velocity,
      cameraDistanceKm,
      cameraDistanceUnits,
      radiusUnits: state.radiusUnits,
      radiusMagnification: this.scale.radiusMagnification(state.radiusKm),
      projectedRadiusPixels: this.project(state).pixels,
      lodTier: this.visuals.get(id)?.tier ?? 'point',
      proceduralSurface: this.visuals.get(id)?.hasTexturedMesh ? false : !body.textures?.map,
    }
  }

  /**
   * Diagnostic snapshot of the render space. Used by the performance overlay and by
   * on-site troubleshooting: it reports where the floating origin, the camera, the
   * tracked body and the scale transform actually are.
   */
  debugState(): Record<string, unknown> {
    const tracked = this.trackedId ? this.resolver.state(this.trackedId) : undefined
    const camera = this.cameraController.absolutePosition
    const origin = this.origin.originUnits
    const relativeUnits = tracked
      ? Math.hypot(
          tracked.absoluteUnits.x - origin.x,
          tracked.absoluteUnits.y - origin.y,
          tracked.absoluteUnits.z - origin.z,
        )
      : null
    return {
      scaleMode: this.scale.mode,
      cameraUnits: [camera.x, camera.y, camera.z],
      originUnits: [origin.x, origin.y, origin.z],
      trackedId: this.trackedId,
      trackedAbsoluteUnits: tracked ? [tracked.absoluteUnits.x, tracked.absoluteUnits.y, tracked.absoluteUnits.z] : null,
      trackedHeliocentricKm: tracked ? [tracked.heliocentricKm.x, tracked.heliocentricKm.y, tracked.heliocentricKm.z] : null,
      trackedRadiusUnits: tracked?.radiusUnits ?? null,
      relativeUnits,
      relativeKm: relativeUnits === null ? null : this.scale.unitsToDistanceKm(relativeUnits),
      controllerDistanceUnits: this.cameraController.currentDistance,
      controllerFramingRatio: this.cameraController.framingRatio,
      cameraMode: this.cameraController.mode,
      orbitDistanceUnits: this.cameraController.orbitDistance,
      flyTo: this.cameraController.flyToProgress,
      render: this.renderer.statistics(),
      trackedVisual: this.trackedId ? (this.visuals.get(this.trackedId)?.materialDiagnostics ?? null) : null,
    }
  }

  /** Lightweight statistics for the HUD legend. */
  statistics(): EngineStatistics {
    return {
      drawnBodies: this.visuals.size,
      minorBodiesInCloud: this.minorItemsForRender?.length ?? this.minorItems.length,
      orbitPaths: this.orbitRenderer.pathCount,
      labels: this.labelRenderer.count,
      stars: this.starRenderer?.statistics.drawn ?? 0,
      scaleMode: this.scale.mode,
      quality: this.quality.profile.level,
      cameraMode: this.cameraController.mode,
      selectedId: this.selectedId,
    }
  }

  /* --------------------------------------------------------------- frame loop */

  start(): void {
    if (this.rafHandle) return
    this.lastFrameTime = performance.now()
    const tick = () => {
      if (this.disposed) return
      const now = performance.now()
      // Bounded to keep a stalled frame from teleporting the simulation, but wide
      // enough that camera transitions still complete on a slow (software-rendered)
      // or heavily loaded machine.
      const delta = Math.min(0.25, Math.max(1e-4, (now - this.lastFrameTime) / 1000))
      this.lastFrameTime = now
      void this.frameStep(delta, now)
      this.rafHandle = requestAnimationFrame(tick)
    }
    this.rafHandle = requestAnimationFrame(tick)
  }

  stop(): void {
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle)
    this.rafHandle = 0
  }

  private minorUpdatePending = false

  private async frameStep(deltaSeconds: number, nowMs: number): Promise<void> {
    const frameStart = performance.now()

    // 1. clock
    this.clock.advance(deltaSeconds)
    const julianDate = this.clock.jd
    if (nowMs - this.lastClockEmit > 200) {
      this.lastClockEmit = nowMs
      this.events.emit('timeChanged', { julianDate, timeScale: this.clock.timeScale, paused: this.clock.paused })
    }

    // 2. minor bodies (worker; never blocks the render beyond one microtask)
    let workerMs = 0
    if (this.minorBodyRenderer && this.minorVisible && !this.minorUpdatePending) {
      const needsUpdate = Number.isNaN(this.lastMinorUpdateJulianDate) || Math.abs(julianDate - this.lastMinorUpdateJulianDate) > 1e-7
      if (needsUpdate) {
        this.minorUpdatePending = true
        try {
          const result = await this.worker.update(julianDate)
          workerMs = result.computeMs
          const positions = result.positions
          const items = this.minorItemsForRender ?? this.minorItems
          const count = Math.min(items.length, Math.floor(positions.length / 3))
          for (let slot = 0; slot < count; slot++) {
            const item = items[slot]
            item.positionKm.x = positions[slot * 3]
            item.positionKm.y = positions[slot * 3 + 1]
            item.positionKm.z = positions[slot * 3 + 2]
          }
          this.lastMinorUpdateJulianDate = julianDate
        } catch (error) {
          this.events.emit('status', { level: 'warn', message: `minor-body propagation failed: ${String(error)}` })
        } finally {
          this.minorUpdatePending = false
        }
      }
    }

    // 3. resolve catalogued bodies
    const positionStart = performance.now()
    this.resolver.update(julianDate, this.scale)
    const positionMs = performance.now() - positionStart

    // 4. camera + floating origin (the origin is the camera's own position)
    this.cameraController.update(deltaSeconds, this.resolver.statesAsMap())
    this.origin.updateUnits(this.cameraController.absolutePosition)

    // 5. body visuals
    const nowSecondsSinceJ2000 = (julianDate - J2000_JD) * SECONDS_PER_DAY
    for (const state of this.resolver.states()) {
      const visual = this.visuals.get(state.id)
      if (!visual) continue
      const projected = this.project(state)
      this.updateSunDirection(state)
      visual.update(state, {
        quality: this.quality.profile.level,
        sunDirectionScene: this.sunDirectionScene,
        projectedRadiusPixels: projected.pixels,
        cameraDistanceUnits: projected.distance,
        showAtmosphere: this.atmosphereVisible,
        nowSecondsSinceJ2000,
      })
      this.placeVisual(state, visual)
      if (!visual.hasTexturedMesh && visual.needsTexture && projected.pixels >= 5) {
        visual.markTextureRequested()
        void this.textures.loadBodyTextures(state.body).then((maps) => {
          if (!this.disposed) visual.applyTextures(maps)
        })
      }
    }

    // 6. orbits, minor cloud, labels
    const orbitStart = performance.now()
    this.orbitRenderer.update(this.origin, this.scale, this.quality.profile.orbitSamples)
    const orbitMs = performance.now() - orbitStart

    if (this.minorBodyRenderer) {
      this.minorBodyRenderer.update(this.minorItemsForRender ?? this.minorItems, this.origin, this.scale)
      this.minorBodyRenderer.setVisible(this.minorVisible)
    }
    this.updateLabels(julianDate)

    // 7. render
    this.renderer.render()

    // 8. monitoring
    this.performance.recordFrame(performance.now() - frameStart)
    this.performance.recordWorkerTime(workerMs)
    this.performance.recordOrbitUpdate(orbitMs)
    this.performance.recordPositionUpdate(positionMs)
    const previousQuality = this.quality.profile.level
    this.quality.sample(deltaSeconds)
    if (this.quality.profile.level !== previousQuality) {
      this.applyQuality()
      this.textures.setQuality(this.quality.profile.level)
      this.events.emit('status', {
        level: 'info',
        message: `quality adjusted to ${this.quality.profile.level}`,
      })
    }
    if (nowMs - this.lastPerformanceEmit > 500) {
      this.lastPerformanceEmit = nowMs
      this.events.emit('performance', {
        ...this.performance.snapshot({
          ...this.renderer.statistics(),
          visibleObjects: this.resolver.size,
          labels: this.labelRenderer.count,
          qualityLevel: this.quality.profile.level,
        }),
      })
    }
  }

  private readonly sunDirectionScratch = new Vector3()

  private updateSunDirection(state: { heliocentricKm: { x: number; y: number; z: number } }): void {
    const position = state.heliocentricKm
    // Direction from the body towards the Sun, expressed in the scene frame. The
    // Sun sits at the origin, so this is simply the negated position direction.
    const length = Math.hypot(position.x, position.y, position.z)
    if (length < 1e-6) {
      this.sunDirectionScene.set(0, 1, 0)
      return
    }
    this.sunDirectionScratch.set(-position.x / length, -position.z / length, position.y / length)
    this.sunDirectionScene.copy(this.sunDirectionScratch)
  }

  private project(state: { absoluteUnits: { x: number; y: number; z: number }; radiusUnits: number }): { pixels: number; distance: number } {
    // Distances are measured from the floating origin (the camera's own position),
    // never from the three.js camera object, which always sits at the origin.
    const camera = this.renderer.camera
    const origin = this.origin.originUnits
    const dx = state.absoluteUnits.x - origin.x
    const dy = state.absoluteUnits.y - origin.y
    const dz = state.absoluteUnits.z - origin.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const fovRadians = (camera.fov * Math.PI) / 180
    const screenHeight = this.renderer.viewport.height
    const pixels = distance > 1e-9 ? (state.radiusUnits / distance) * (screenHeight / (2 * Math.tan(fovRadians / 2))) : 0
    return { pixels, distance }
  }

  private placeVisual(
    state: { id: string; parentId: string | null; absoluteUnits: { x: number; y: number; z: number } },
    visual: BodyVisual,
  ): void {
    if (state.parentId && this.visuals.has(state.parentId)) {
      const parentState = this.resolver.state(state.parentId)
      const parentAbsolute = parentState?.absoluteUnits ?? { x: 0, y: 0, z: 0 }
      visual.group.position.set(
        state.absoluteUnits.x - parentAbsolute.x,
        state.absoluteUnits.y - parentAbsolute.y,
        state.absoluteUnits.z - parentAbsolute.z,
      )
      return
    }
    const camera = this.origin.originUnits
    visual.group.position.set(
      state.absoluteUnits.x - camera.x,
      state.absoluteUnits.y - camera.y,
      state.absoluteUnits.z - camera.z,
    )
  }

  private showOrbitFor(id: string): void {
    const body = this.bodyById.get(id)
    if (!body || body.type === 'star') return
    const colour: OrbitColourKey =
      body.type === 'dwarfPlanet' ? 'dwarfPlanet' : body.type === 'moon' ? 'moon' : 'selected'

    // Mode A bodies (planets, the Moon, Pluto) have no Keplerian elements in the
    // catalog: their trajectory is sampled from the ephemeris engine over one
    // orbital period, which is the real perturbed path rather than an idealised
    // ellipse. Mode B bodies are sampled from their osculating elements.
    const path = body.positionModel === 'ephemeris' ? this.sampleEphemerisOrbit(body) : this.buildOrbitPath(body)
    if (!path) return

    if (body.parentId && body.type === 'moon') {
      const parentVisual = this.visuals.get(body.parentId)
      if (parentVisual) {
        this.localPathSpecs.set(`moon:${id}`, { parentId: body.parentId, samplesKm: path, colour })
        this.orbitRenderer.setLocalPath(`moon:${id}`, parentVisual.group, path, this.resolver.localOffsetScale(body.parentId), colour)
        return
      }
    }
    this.orbitRenderer.setHeliocentricPath(id, path, colour)
  }

  private hideOrbitFor(id: string): void {
    this.orbitRenderer.removeHeliocentricPath(id)
    this.orbitRenderer.removeLocalPath(`moon:${id}`)
    this.localPathSpecs.delete(`moon:${id}`)
  }

  /** Parent-relative paths in render units must be rebuilt when the scale changes. */
  private readonly localPathSpecs = new Map<string, { parentId: string; samplesKm: Float64Array; colour: OrbitColourKey }>()

  private refreshLocalPaths(): void {
    for (const [key, spec] of this.localPathSpecs) {
      const parentVisual = this.visuals.get(spec.parentId)
      if (!parentVisual) continue
      this.orbitRenderer.setLocalPath(key, parentVisual.group, spec.samplesKm, this.resolver.localOffsetScale(spec.parentId), spec.colour)
    }
  }

  /**
   * Samples an ephemeris-driven trajectory over one orbital period. The start
   * instant is the current simulation time, so the polyline is always the path the
   * body is actually following right now.
   */
  private sampleEphemerisOrbit(body: CelestialBody, samples = 512): Float64Array | null {
    const ephemerisBody = body.ephemeris?.body
    if (!ephemerisBody) return null
    const periodDays = body.orbitSummary?.periodDays ?? null
    if (periodDays === null || !(periodDays > 0)) return null
    const jd0 = this.clock.jd
    const relativeToParent = body.type === 'moon' && body.parentId === 'earth'
    const output = new Float64Array(samples * 3)
    for (let index = 0; index < samples; index++) {
      const jd = jd0 + (index / samples) * periodDays
      const position = this.ephemeris.heliocentricEclipticKm(ephemerisBody as never, jd)
      let x = position.x
      let y = position.y
      let z = position.z
      if (relativeToParent) {
        const earth = this.ephemeris.heliocentricEclipticKm('Earth', jd)
        x -= earth.x
        y -= earth.y
        z -= earth.z
      }
      output[index * 3] = x
      output[index * 3 + 1] = y
      output[index * 3 + 2] = z
    }
    return output
  }

  private buildOrbitPath(body: CelestialBody): Float64Array | null {
    const elements = body.elements
    if (!elements) return null
    const semiMajorAxisKm = elements.semiMajorAxisKm ?? ((elements.semiMajorAxisAu ?? 0) * AU_KM)
    if (!(semiMajorAxisKm > 0)) return null
    const gm = body.parentId ? this.resolver.gmFor(body.parentId) : undefined
    return sampleOrbitPath(
      {
        semiMajorAxisKm,
        eccentricity: elements.eccentricity,
        inclinationDeg: elements.inclinationDeg,
        longitudeAscendingNodeDeg: elements.longitudeAscendingNodeDeg,
        argumentOfPeriapsisDeg: elements.argumentOfPeriapsisDeg,
        meanAnomalyDeg: elements.meanAnomalyDeg ?? 0,
        epochJD: elements.epochJD ?? ((elements.epochMjd ?? 0) + 2400000.5),
      },
      {
        gmKm3S2: gm ?? GM_SUN_KM3_S2,
        meanMotionRadPerDayOverride:
          elements.periodDays && elements.periodDays > 0 ? meanMotionFromPeriodDays(elements.periodDays) : undefined,
        referencePlaneToEcliptic: this.resolver.referencePlaneFor(body),
      },
      384,
    )
  }

  /**
   * Registers (or removes) the orbit paths of the eight planets, the dwarf planets
   * and any body with elements. Called when "show all major orbits" is toggled.
   */
  showMajorOrbits(show: boolean, majorMoonIds: readonly string[] = []): void {
    const ids: string[] = []
    for (const body of this.bodyById.values()) {
      if (body.type !== 'planet' && body.type !== 'dwarfPlanet') continue
      ids.push(body.id)
    }
    for (const id of ids) {
      if (!show) {
        this.orbitRenderer.removeHeliocentricPath(id)
        continue
      }
      if (this.orbitRenderer.hasHeliocentricPath(id)) continue
      const body = this.bodyById.get(id)
      if (!body) continue
      const path = body.positionModel === 'ephemeris' ? this.sampleEphemerisOrbit(body) : this.buildOrbitPath(body)
      if (!path) continue
      this.orbitRenderer.setHeliocentricPath(id, path, body.type === 'dwarfPlanet' ? 'dwarfPlanet' : 'planet')
    }
    // Major moons contribute local paths around their parent.
    for (const id of majorMoonIds) {
      if (!show) {
        this.orbitRenderer.removeLocalPath(`moon:${id}`)
        this.localPathSpecs.delete(`moon:${id}`)
        continue
      }
      if (this.localPathSpecs.has(`moon:${id}`)) continue
      const body = this.bodyById.get(id)
      if (!body) continue
      const path = body.positionModel === 'ephemeris' ? this.sampleEphemerisOrbit(body) : this.buildOrbitPath(body)
      const parentVisual = body.parentId ? this.visuals.get(body.parentId) : undefined
      if (!path || !parentVisual) continue
      this.localPathSpecs.set(`moon:${id}`, { parentId: body.parentId!, samplesKm: path, colour: 'moon' })
      this.orbitRenderer.setLocalPath(`moon:${id}`, parentVisual.group, path, this.resolver.localOffsetScale(body.parentId!), 'moon')
    }
  }

  /** True when the major-orbit overlay is currently registered. */
  get isShowingMajorOrbits(): boolean {
    return this.showingMajorOrbits
  }

  /** Toggles the "show all major orbits" overlay (planets, dwarf planets, major moons). */
  toggleMajorOrbits(): boolean {
    this.showingMajorOrbits = !this.showingMajorOrbits
    this.showMajorOrbits(this.showingMajorOrbits, this.majorMoonIds())
    return this.showingMajorOrbits
  }

  private showingMajorOrbits = false

  /** Major moons worth drawing when "show all orbits" is on. */
  majorMoonIds(): string[] {
    const preferred = ['moon', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'enceladus', 'triton', 'charon']
    return preferred.filter((id) => this.bodyById.has(id))
  }

  private updateLabels(julianDate: number): void {
    if (!this.labelsVisible) return
    void julianDate
    const candidates: LabelCandidate[] = []
    const forced = new Set<string>()
    for (const state of this.resolver.states()) {
      const selected = state.id === this.selectedId
      if (selected) forced.add(state.id)
      candidates.push({
        id: state.id,
        worldPosition: this.labelWorldPosition(state, 1.9),
        label: this.displayName(state.body),
        sublabel: this.labelSublabel(state.body),
        priority: priorityFor(state.body.type),
        colour: colourFor(state.body.type),
        selected,
      })
    }
    // Minor bodies contribute a label only while selected.
    const selectedMinorIndex = this.selectedMinorIndex
    if (selectedMinorIndex !== null) {
      const id = `minor:${selectedMinorIndex}`
      forced.add(id)
      const record = this.minorRuntime?.records[selectedMinorIndex]
      candidates.push({
        id,
        worldPosition: this.labelWorldPositionOfMinor(selectedMinorIndex),
        label: record?.name ?? id,
        sublabel: record?.classLabel ?? '',
        priority: 110,
        colour: '#ffd27a',
        selected: true,
      })
    }
    this.labelRenderer.sync(candidates, {
      camera: this.renderer.camera,
      width: this.renderer.viewport.width,
      height: this.renderer.viewport.height,
      budget: this.quality.profile.labelBudget,
      forced,
      minSeparation: 58,
      fontSizePx: Math.max(11, Math.min(18, this.renderer.viewport.height / 62)),
    })
  }

  private readonly labelScratch = new Vector3()

  private labelWorldPosition(state: { absoluteUnits: { x: number; y: number; z: number }; radiusUnits: number }, factor: number): Vector3 {
    const camera = this.origin.originUnits
    return this.labelScratch
      .set(
        state.absoluteUnits.x - camera.x,
        state.absoluteUnits.y - camera.y + state.radiusUnits * factor,
        state.absoluteUnits.z - camera.z,
      )
      .clone()
  }

  private labelWorldPositionOfMinor(recordIndex: number): Vector3 {
    const items = this.minorItemsForRender ?? this.minorItems
    const item = items.find((entry) => entry.index === recordIndex)
    if (!item) return new Vector3(0, 0, 0)
    const warped = this.scale.positionKmToUnits(item.positionKm)
    const camera = this.origin.originUnits
    return new Vector3(warped.x - camera.x, warped.y - camera.y, warped.z - camera.z)
  }

  private displayName(body: CelestialBody): string {
    if (this.language === 'zh-CN' && body.nameZh) return body.nameZh
    return body.name
  }

  /** Second line of a label: distance from the Sun, the way NASA Eyes presents it. */
  private labelSublabel(body: CelestialBody): string {
    const state = this.resolver.state(body.id)
    if (!state) return ''
    const distanceKm = Math.hypot(state.heliocentricKm.x, state.heliocentricKm.y, state.heliocentricKm.z)
    if (body.type === 'moon') {
      const parentState = body.parentId ? this.resolver.state(body.parentId) : undefined
      if (parentState) {
        const relative = Math.hypot(
          state.heliocentricKm.x - parentState.heliocentricKm.x,
          state.heliocentricKm.y - parentState.heliocentricKm.y,
          state.heliocentricKm.z - parentState.heliocentricKm.z,
        )
        return this.language === 'zh-CN'
          ? `距母天体 ${formatDistance(relative, 'zh-CN')}`
          : `${formatDistance(relative, 'en-US')} from ${parentState.body.name}`
      }
    }
    return this.language === 'zh-CN'
      ? `距太阳 ${formatDistance(distanceKm, 'zh-CN')}`
      : `${formatDistance(distanceKm, 'en-US')} from Sun`
  }

  dispose(): void {
    this.disposed = true
    this.stop()
    this.worker.dispose()
    for (const visual of this.visuals.values()) visual.dispose()
    this.visuals.clear()
    this.orbitRenderer.dispose()
    this.minorBodyRenderer?.dispose()
    this.starRenderer?.dispose()
    this.labelRenderer.dispose()
    this.textures.dispose()
    this.renderer.dispose()
    this.events.clear()
  }
}

export interface BodyDescription {
  id: string
  body: CelestialBody
  julianDate: number
  heliocentricKm: { x: number; y: number; z: number }
  distanceFromSunKm: number
  distanceFromParentKm: number | null
  parentId: string | null
  velocityKmS: number
  speedDirectionKmS: { x: number; y: number; z: number }
  cameraDistanceKm: number | null
  cameraDistanceUnits: number
  radiusUnits: number
  radiusMagnification: number
  projectedRadiusPixels: number
  lodTier: string
  proceduralSurface: boolean
}

export interface MinorBodyDescription {
  record: MinorBodyRecord
  heliocentricKm: { x: number; y: number; z: number }
  distanceFromSunKm: number
  speedKmS: number
}

export interface EngineStatistics {
  drawnBodies: number
  minorBodiesInCloud: number
  orbitPaths: number
  labels: number
  stars: number
  scaleMode: ScaleMode
  quality: QualityLevel
  cameraMode: CameraMode
  selectedId: string | null
}

function priorityFor(type: CelestialBody['type']): number {
  switch (type) {
    case 'star':
      return 120
    case 'planet':
      return 100
    case 'dwarfPlanet':
      return 80
    case 'moon':
      return 60
    default:
      return 20
  }
}

function colourFor(type: CelestialBody['type']): string {
  switch (type) {
    case 'star':
      return '#ffc46a'
    case 'planet':
      return '#bfd8ff'
    case 'dwarfPlanet':
      return '#cbb0ff'
    case 'moon':
      return '#a0d0e8'
    default:
      return '#b8c4d0'
  }
}