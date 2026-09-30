/**
 * Engine binding hook.
 *
 * Creates the engine once the catalog and configuration are available, wires the
 * event bus into the store, installs pointer/keyboard/touch input, resizes with the
 * viewport, drives the guided tour and the idle auto demo, and disposes everything
 * on unmount.
 *
 * Input model (mouse + touch through pointer events, as required for exhibition
 * touch panels):
 *   one finger / left drag  -> rotate
 *   two fingers             -> pinch zoom + pan
 *   wheel                   -> zoom (or translation-rate in free flight)
 *   tap                     -> select the object under the pointer
 *   double tap              -> fly to the object
 */
import { useCallback, useEffect, useRef } from 'react'
import { SolarSystemEngine, type MinorBodyRuntime } from '../engine/SolarSystemEngine'
import { degradationNotice, detectGraphicsCapability } from '../engine/GraphicsCapability'
import { setEngine, useAppStore } from '../state/store'
import { createTranslator } from '../i18n'
import { AUTO_DEMO_STOPS, TOUR_STOPS } from '../data/Tour'
import { MINOR_BODY_FILTERS } from '../engine/SolarSystemEngine'

const TAP_MAX_MOVEMENT_PX = 8
const TAP_MAX_DURATION_MS = 420
const DOUBLE_TAP_WINDOW_MS = 340

export function useEngine(options: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  minorRuntime: MinorBodyRuntime | null
}) {
  const engineRef = useRef<SolarSystemEngine | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  /** Live reduced-motion appliers, one per engine instance. */
  const reducedMotionListeners = useRef(new Set<() => void>())
  const store = useAppStore()

  const createEngine = useCallback(() => {
    const canvas = options.canvasRef.current
    const container = options.containerRef.current
    const { catalog, config } = useAppStore.getState()
    if (!canvas || !container || !catalog || !config) return
    // Never build a second engine over a live one: two instances would mean two WebGL
    // contexts, two frame loops and a lost reduced-motion setting.
    if (engineRef.current) return

    // Degrade explicitly instead of crashing: a GPU-less or WebGL-disabled machine
    // gets a readable notice and the rest of the UI stays alive.
    const capability = detectGraphicsCapability()
    if (capability.backend !== 'webgl2') {
      const notice = degradationNotice(capability, config.language)
      useAppStore.getState().setState({ phase: 'error', errorMessage: notice })
      return
    }

    const minorRuntime = options.minorRuntime

    const engine = new SolarSystemEngine({
      canvas,
      container,
      catalog: catalog.catalog,
      bodies: catalog.bodies,
      bodyById: catalog.bodyById,
      minorBodies: minorRuntime,
      stars: catalog.stars,
      starManifest: {
        ...catalog.catalog.starfield,
        namedStars: catalog.starManifest.namedStars,
      },
      quality: config.defaultQuality,
      scaleMode: config.defaultScaleMode,
      language: config.language,
      reducedMotion: config.reducedMotion,
      enableStarfield: config.enableStarfield,
    })

    engineRef.current = engine
    setEngine(engine)
    // The loading screen reports the renderer step from this flag; it is set here
    // because this is the moment a GL context actually exists.
    useAppStore.getState().setState({ engineReady: true })

    // Reduced motion is applied on every engine instance, not only when the effect
    // that watches the setting happens to re-run: the constructor resets it from the
    // configuration, which would otherwise overwrite the operating-system preference.
    const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    const applyReducedMotion = () => {
      const configured = useAppStore.getState().config?.reducedMotion ?? false
      engine.cameraController.setReducedMotion(configured || Boolean(motionQuery?.matches))
      document.documentElement.dataset.systemReducedMotion = motionQuery?.matches ? 'true' : 'false'
    }
    applyReducedMotion()
    motionQuery?.addEventListener('change', applyReducedMotion)
    reducedMotionListeners.current.add(applyReducedMotion)
    // Development-only diagnostic handle: lets an on-site technician (or an
    // automated smoke test) inspect the render space without a build step.
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__solarSystemEngine = engine
    }

    // ---- bus -> store ------------------------------------------------------
    const set = useAppStore.getState().setState
    engine.events.on('timeChanged', ({ julianDate, timeScale, paused }) => {
      set({ julianDate, timeScale, paused })
      // The information panel is live telemetry, so it refreshes with the clock.
      const { selectedId, selectedMinorIndex } = useAppStore.getState()
      if (selectedId) set({ bodyDescription: engine.describeBody(selectedId) })
      else if (selectedMinorIndex !== null) set({ minorDescription: engine.describeMinorBody(selectedMinorIndex) })
    })
    engine.events.on('selectionChanged', ({ id }) => {
      if (id === null) {
        set({ selectedId: null, selectedMinorIndex: null, bodyDescription: null, minorDescription: null })
        return
      }
      if (id.startsWith('minor:')) {
        const index = Number(id.slice('minor:'.length))
        set({ selectedId: null, selectedMinorIndex: index, bodyDescription: null, minorDescription: engine.describeMinorBody(index) })
      } else {
        set({ selectedId: id, selectedMinorIndex: null, minorDescription: null, bodyDescription: engine.describeBody(id) })
      }
    })
    engine.events.on('cameraModeChanged', ({ mode }) => set({ cameraMode: mode as never }))
    engine.events.on('scaleModeChanged', ({ mode }) => set({ scaleMode: mode as never }))
    engine.events.on('trackingChanged', ({ id }) => set({ trackedId: (id as string | null) ?? null }))
    engine.events.on('performance', (snapshot) => {
      // The performance tick is also the cheapest place to refresh the HUD counters
      // and to grow the sparkline history (P2-8).
      const frameTime = (snapshot as { frameTimeMs?: number }).frameTimeMs ?? 0
      const history = useAppStore.getState().performanceHistory
      set({
        performance: snapshot as never,
        statistics: engine.statistics(),
        performanceHistory: [...history.slice(-59), frameTime],
      })
    })
    engine.events.on('status', ({ level, message }) => {
      useAppStore.getState().pushToast(level, message)
    })
    engine.events.on('contextLost', () => {
      useAppStore.getState().pushToast('warn', createTranslator(useAppStore.getState().language)('contextLost'))
    })
    engine.events.on('contextRestored', () => {
      useAppStore.getState().pushToast('info', createTranslator(useAppStore.getState().language)('contextRestored'))
    })

    // ---- input -------------------------------------------------------------
    const pointers = new Map<number, { x: number; y: number }>()
    let lastTapTime = 0
    let lastTapX = 0
    let lastTapY = 0
    let primaryDown: { x: number; y: number; time: number; moved: boolean } | null = null
    let pinchDistance = 0
    let panCentre: { x: number; y: number } | null = null
    let interactionAt = performance.now()

    const markInteraction = () => {
      interactionAt = performance.now()
      if (useAppStore.getState().autoDemoActive) {
        set({ autoDemoActive: false })
      }
    }

    const pickAt = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const bodyHit = engine.pickBodyAt(x, y)
      if (bodyHit) return bodyHit
      const minorHit = engine.pickMinorBodyAt(x, y)
      return minorHit !== null ? `minor:${minorHit}` : null
    }

    const onPointerDown = (event: PointerEvent) => {
      markInteraction()
      canvas.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 1) {
        primaryDown = { x: event.clientX, y: event.clientY, time: performance.now(), moved: false }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
        panCentre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const deltaX = event.clientX - previous.x
      const deltaY = event.clientY - previous.y
      if (primaryDown && Math.hypot(event.clientX - primaryDown.x, event.clientY - primaryDown.y) > TAP_MAX_MOVEMENT_PX) {
        primaryDown.moved = true
      }

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (pinchDistance > 0) engine.cameraController.zoom((pinchDistance - distance) * 0.6)
        if (panCentre) engine.cameraController.pan(centre.x - panCentre.x, centre.y - panCentre.y, rect().height)
        pinchDistance = distance
        panCentre = centre
        return
      }

      engine.cameraController.rotate(deltaX, deltaY)
    }

    const rect = () => canvas.getBoundingClientRect()

    const onPointerUp = (event: PointerEvent) => {
      markInteraction()
      pointers.delete(event.pointerId)
      if (pointers.size < 2) {
        pinchDistance = 0
        panCentre = null
      }
      if (!primaryDown) return
      const wasTap = !primaryDown.moved && performance.now() - primaryDown.time < TAP_MAX_DURATION_MS
      primaryDown = null
      if (!wasTap) return

      const now = performance.now()
      const isDoubleTap =
        now - lastTapTime < DOUBLE_TAP_WINDOW_MS &&
        Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) < 28
      const hit = pickAt(event.clientX, event.clientY)

      if (isDoubleTap && hit) {
        lastTapTime = 0
        if (hit.startsWith('minor:')) engine.selectMinorBody(Number(hit.slice('minor:'.length)))
        else engine.flyTo(hit)
        return
      }
      lastTapTime = now
      lastTapX = event.clientX
      lastTapY = event.clientY

      if (!hit) {
        engine.clearSelection()
        return
      }
      if (hit.startsWith('minor:')) engine.selectMinorBody(Number(hit.slice('minor:'.length)))
      else engine.selectBody(hit)
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      markInteraction()
      engine.cameraController.zoom(event.deltaY)
    }

    let keyDown: ((event: KeyboardEvent) => void) | null = null

    keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      markInteraction()
      switch (event.code) {
        case 'Space':
          event.preventDefault()
          engine.togglePaused()
          return
        case 'KeyF':
          engine.setCameraMode(engine.cameraController.mode === 'free' ? 'orbit' : 'free')
          return
        case 'Escape':
          engine.clearSelection()
          return
        default:
          break
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        engine.cameraController.handleKey(event.code, true)
        event.preventDefault()
      }
    }

    const onKeyUp = (event: KeyboardEvent) => engine.cameraController.handleKey(event.code, false)

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', onKeyUp)

    // ---- sizing ------------------------------------------------------------
    const resize = () => {
      const bounds = container.getBoundingClientRect()
      engine.renderer.resize(bounds.width, bounds.height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    engine.start()

    // ---- idle auto demo ----------------------------------------------------
    // Any interaction anywhere in the interface — not only on the canvas — counts as
    // user activity, so tapping a HUD button also resets the idle timer (§32).
    const markInteractionCapture = () => markInteraction()
    window.addEventListener('pointerdown', markInteractionCapture, true)
    window.addEventListener('wheel', markInteractionCapture, { capture: true, passive: true })

    const idleTimer = window.setInterval(() => {
      const current = useAppStore.getState()
      const config = current.config
      if (!config || current.phase !== 'ready') return
      if (current.tourActive) return
      if (!config.autoDemo && !config.guidedTourOnIdle) return
      const idleSeconds = (performance.now() - interactionAt) / 1000
      const delay = config.autoDemoDelaySeconds ?? 150
      const remaining = Math.max(0, Math.round(delay - idleSeconds))
      if (remaining !== current.autoDemoCountdown) set({ autoDemoCountdown: remaining })
      if (idleSeconds < delay) return
      if (config.guidedTourOnIdle) {
        // "Return to the guided tour when idle" is a separate switch from the auto
        // demo, and is honoured first (previously it had no consumer at all).
        if (!current.tourOpenRequested) set({ tourOpenRequested: true, tourActive: true, tourStep: 0 })
        return
      }
      if (!current.autoDemoActive) set({ autoDemoActive: true })
    }, 1000)

    const cleanup = () => {
      window.clearInterval(idleTimer)
      window.removeEventListener('pointerdown', markInteractionCapture, true)
      window.removeEventListener('wheel', markInteractionCapture, true)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      if (keyDown) window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', onKeyUp)
      motionQuery?.removeEventListener('change', applyReducedMotion)
      reducedMotionListeners.current.delete(applyReducedMotion)
    }
    cleanupRef.current = cleanup
  }, [options.canvasRef, options.containerRef, options.minorRuntime])


  const catalogReady = store.catalog !== null

  useEffect(() => {
    // The engine is created as soon as the catalog is in memory, which is while the
    // splash screen is still up: the title screen then has a real, running 3D
    // background instead of a static black rectangle (§30), and entering the
    // exhibition is instantaneous.
    if (!catalogReady) return
    createEngine()
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
      engineRef.current?.dispose()
      engineRef.current = null
      setEngine(null)
      useAppStore.getState().setState({ engineReady: false })
      if (import.meta.env.DEV) {
        delete (window as unknown as Record<string, unknown>).__solarSystemEngine
      }
    }
    // Re-created only when the catalog becomes available; the engine owns everything
    // else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogReady, createEngine])

  // ---- prefers-reduced-motion -------------------------------------------------
  useEffect(() => {
    // The operating system preference must reach the camera as well as the CSS, or a
    // visitor who asked for reduced motion still gets a 4.5 s fly-through (P2-11).
    // `createEngine` installs an applier per engine instance; this effect pushes a
    // later configuration change into every live instance.
    for (const apply of reducedMotionListeners.current) apply()
  }, [store.config?.reducedMotion, store.engineReady])

  // ---- guided tour ---------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (!store.tourActive) return
    const stop = TOUR_STOPS[store.tourStep]
    if (!stop) return
    engine.setTimeScale(stop.timeScale)
    if (stop.filters) {
      engine.setFilters(stop.filters)
      engine.setMinorBodiesVisible(true)
    } else {
      engine.setFilters([])
      engine.setMinorBodiesVisible(false)
    }
    if (stop.special === 'asteroidBelt') {
      engine.setCameraMode('overview')
      engine.frameOverview()
    } else if (stop.special === 'kuiperBelt') {
      engine.frameOuterSystem()
    } else if (stop.targetId) {
      engine.flyTo(stop.targetId)
    }
  }, [store.tourActive, store.tourStep])

  // ---- auto demo -----------------------------------------------------------
  useEffect(() => {
    if (!store.autoDemoActive) return
    let cancelled = false
    let index = 0
    const run = async () => {
      const engine = engineRef.current
      if (!engine) return
      engine.setTimeScale(10 * 86400)
      while (!cancelled && index < AUTO_DEMO_STOPS.length) {
        const id = AUTO_DEMO_STOPS[index]
        engine.flyTo(id)
        await waitForFlyTo(engine, 12_000)
        if (cancelled) break
        await delay(6500)
        index += 1
      }
      if (!cancelled) {
        engine.setCameraMode('overview')
        engine.frameOverview()
        useAppStore.getState().setState({ autoDemoActive: false })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [store.autoDemoActive])

  // ---- mirror store flags into the engine ---------------------------------
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setOrbitVisibility(store.orbitVisible)
  }, [store.orbitVisible])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setLabelVisibility(store.labelVisible)
  }, [store.labelVisible])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setAtmosphereVisibility(store.atmosphereVisible)
  }, [store.atmosphereVisible])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setStarfieldEnabled(store.starfieldVisible)
  }, [store.starfieldVisible])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setFilters(store.activeFilters)
    engine.setMinorBodiesVisible(store.minorVisible || store.activeFilters.length > 0)
  }, [store.activeFilters, store.minorVisible])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setQualityProfile(store.quality)
  }, [store.quality])

  useEffect(() => {
    engineRef.current?.setLanguage(store.language)
  }, [store.language])

  useEffect(() => {
    if (store.scaleMode) engineRef.current?.setScaleMode(store.scaleMode)
  }, [store.scaleMode])

  return { engineRef, filterDefinitions: MINOR_BODY_FILTERS }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForFlyTo(engine: SolarSystemEngine, timeoutMs: number): Promise<void> {
  const started = performance.now()
  while (engine.cameraController.isFlying && performance.now() - started < timeoutMs) {
    await delay(120)
  }
}