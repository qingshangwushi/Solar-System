/**
 * Application shell.
 *
 * Flow: splash (data preloads in the background, engine starts as soon as the
 * catalog is in memory so the title screen has a live 3D background) -> enter ->
 * loading screen (renderer + texture warm-up, both real work) -> explorer.
 *
 * The React layer holds no three.js objects: it renders HUD and panels, and every
 * control calls into the engine through the store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoadingScreen, type LoadingStep } from './ui/LoadingScreen'
import { SplashScreen } from './ui/SplashScreen'
import { Hud } from './ui/Hud'
import { Sidebar } from './ui/Sidebar'
import { Inspector } from './ui/Inspector'
import { SearchPanel } from './ui/SearchPanel'
import { SettingsPanel } from './ui/SettingsPanel'
import { TourPanel } from './ui/TourPanel'
import { PerformanceOverlay } from './ui/PerformanceOverlay'
import { useEngine } from './ui/useEngine'
import { getEngine, setEngine, useAppStore } from './state/store'
import { loadExhibitionConfig } from './data/ConfigLoader'
import { loadCatalog, bodyDisplayName } from './data/CatalogLoader'
import { CatalogSearchIndex } from './data/SearchIndex'
import { createTranslator, type Language } from './i18n'
import type { MinorBodyRuntime } from './engine/SolarSystemEngine'
import { TOUR_STOPS, tourCountsFromStatistics } from './data/Tour'
import type { SearchHit } from './data/SearchIndex'
import type { ScaleMode } from './data/ScaleModel'
import type { QualityLevel } from './engine/QualityController'
import type { CameraMode } from './engine/CameraController'

const LOAD_STEP_LABELS: Array<{ stage: string; zh: string; en: string }> = [
  { stage: 'manifest', zh: '校验数据版本', en: 'Verifying data version' },
  { stage: 'catalog', zh: '加载太阳系目录', en: 'Loading solar-system catalog' },
  { stage: 'planetElements', zh: '加载行星轨道根数', en: 'Loading planetary elements' },
  { stage: 'starfield', zh: '加载恒星背景目录', en: 'Loading stellar background' },
  { stage: 'minorBodies', zh: '构建小天体轨道数据库', en: 'Building minor-body orbit database' },
  // The last two steps are engine work, not catalogue downloads: they exist so the
  // progress list covers the whole start-up, renderer first (§57).
  { stage: 'renderer', zh: '初始化渲染器', en: 'Initializing renderer' },
  { stage: 'textures', zh: '加载行星贴图', en: 'Loading planetary textures' },
]

export function App() {
  const store = useAppStore()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [steps, setSteps] = useState<LoadingStep[]>([])
  const [loadRatio, setLoadRatio] = useState(0)
  const [loadMessage, setLoadMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** True once the catalogue is in memory (the engine then starts by itself). */
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const enteredRef = useRef(false)
  const warmUpStartedRef = useRef(false)

  const t = useMemo(() => createTranslator(store.language), [store.language])

  /**
   * The minor-body runtime is derived once from the loaded catalog and shared by
   * the engine (which propagates it) and the HUD (which reports its availability),
   * so the filter controls are only enabled when the cloud can actually be drawn.
   */
  const minorRuntime: MinorBodyRuntime | null = useMemo(() => {
    const store_ = store.catalog?.minorBodies
    if (!store_) return null
    const count = store_.length
    return {
      elements: store_.elements,
      subset: Int32Array.from({ length: count }, (_, index) => index),
      records: store_.records,
      subsetRecordIndices: Int32Array.from({ length: count }, (_, index) => index),
    }
  }, [store.catalog])

  useEngine({ canvasRef, containerRef, minorRuntime })

  const set = store.setState

  /**
   * Preload: configuration, then the catalog, then the search index. This runs
   * while the splash screen is up, so the splash can report the real catalogue
   * statistics instead of the "—" placeholder it used to show (§30), and the
   * engine can start behind it.
   */
  const boot = useCallback(async () => {
    setSteps(LOAD_STEP_LABELS.map((label) => ({ ...label, state: 'pending' })))
    setLoadRatio(0)
    try {
      const { config } = await loadExhibitionConfig()
      // Config-driven initial state: the four keys that had no consumer
      // (`defaultTarget`, `enableScientificMode`, `showPerformanceOverlay`,
      // `guidedTourOnIdle`) now reach the UI (P1-4).
      set({
        config,
        language: config.language,
        scaleMode: config.defaultScaleMode,
        quality: config.defaultQuality,
        starfieldVisible: config.enableStarfield,
        scientificMode: config.enableScientificMode,
        showPerformance: config.showPerformanceOverlay,
        minorVisible: false,
      })
      const catalog = await loadCatalog({
        enableMinorPlanets: config.enableMinorPlanets,
        enableStarfield: config.enableStarfield,
        onProgress: (progress) => {
          setLoadMessage(progress.message)
          setLoadRatio(Math.min(0.98, progress.loaded / Math.max(1, progress.total)))
          set({ loadStage: progress.stage })
          setSteps((current) =>
            current.map((step) => {
              const order = LOAD_STEP_LABELS.findIndex((label) => label.stage === step.stage)
              const activeOrder = LOAD_STEP_LABELS.findIndex((label) => label.stage === progress.stage)
              if (order < activeOrder) return { ...step, state: 'done' }
              if (order === activeOrder) return { ...step, state: 'active' }
              return { ...step, state: 'pending' }
            }),
          )
        },
      })

      const searchIndex = new CatalogSearchIndex(catalog.bodies, catalog.minorBodies)
      set({ catalog, searchIndex })
      setCatalogLoaded(true)
    } catch (loadError) {
      setError(String(loadError))
      set({ phase: 'error', errorMessage: String(loadError) })
    }
  }, [set])

  const retry = useCallback(() => {
    setError(null)
    setCatalogLoaded(false)
    enteredRef.current = false
    warmUpStartedRef.current = false
    set({ phase: 'loading', catalog: null, engineReady: false })
    void boot()
  }, [boot, set])

  // The preload starts immediately so the splash screen shows real data; the phase
  // stays on the splash until the visitor asks to enter.
  useEffect(() => {
    if (store.catalog || store.phase === 'error') return
    void boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Engine steps. Once the catalog is loaded the engine exists (see useEngine), and
   * entering the exhibition runs the one remaining piece of real start-up work: the
   * texture warm-up. Progress is measured, not simulated.
   */
  useEffect(() => {
    if (store.phase !== 'loading' || !catalogLoaded || !store.engineReady) return
    if (warmUpStartedRef.current) return
    warmUpStartedRef.current = true
    setSteps((current) =>
      current.map((step) => {
        if (step.stage === 'renderer') return { ...step, state: 'done' }
        if (step.stage === 'textures') return { ...step, state: 'active' }
        return { ...step, state: 'done' }
      }),
    )
    setLoadMessage(createTranslator(useAppStore.getState().language)('loadingTextures'))
    const engine = getEngine()
    if (!engine) {
      set({ phase: 'ready' })
      return
    }
    void engine
      .warmUpTextures((loaded, total) => {
        setLoadRatio(0.98 + (total > 0 ? (loaded / total) * 0.02 : 0.02))
      })
      .then(() => {
        setSteps((current) => current.map((step) => ({ ...step, state: 'done' })))
        setLoadRatio(1)
        set({ phase: 'ready' })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.phase, catalogLoaded, store.engineReady, set])

  // If the visitor enters before the preload finishes, the catalogue steps simply
  // keep running behind the loading screen; the engine step starts as soon as both
  // the catalogue and the renderer are ready.
  useEffect(() => {
    if (store.phase !== 'loading' || catalogLoaded || store.engineReady) return
    setSteps((current) =>
      current.map((step) =>
        step.stage === 'manifest' || step.state !== 'pending' ? step : { ...step, state: 'active' },
      ),
    )
  }, [store.phase, catalogLoaded, store.engineReady])

  const enterExhibition = useCallback(() => {
    enteredRef.current = true
    set({ phase: 'loading' })
  }, [set])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(store.config?.uiScale ?? 1))
  }, [store.config?.uiScale])

  // The document language and title follow the interface language, so a screen
  // reader and the browser's own translation pick the right locale (§53/§54).
  useEffect(() => {
    const language = store.language
    const config = store.config
    document.documentElement.lang = language
    const title = config ? (language === 'zh-CN' ? config.title.zh : config.title.en) : t('appTitle')
    document.title = `${title} | ${t('appSubtitle')}`
  }, [store.language, store.config, t])

  /**
   * `defaultTarget` from the exhibition configuration. Applied once, when the
   * explorer becomes ready, and only when the catalog actually contains the body.
   */
  const defaultTargetApplied = useRef(false)
  useEffect(() => {
    if (store.phase !== 'ready' || defaultTargetApplied.current) return
    const target = store.config?.defaultTarget
    if (!target) return
    const engine = getEngine()
    if (!engine || !store.catalog?.bodyById.has(target)) return
    defaultTargetApplied.current = true
    engine.flyTo(target)
  }, [store.phase, store.config?.defaultTarget, store.catalog])

  /* --------------------------------------------------------------- callbacks */

  const withEngine = (action: (engine: NonNullable<ReturnType<typeof getEngine>>) => void) => () => {
    const engine = getEngine()
    if (engine) action(engine)
  }

  const handleSelect = useCallback(
    (id: string) => {
      const engine = getEngine()
      if (!engine) return
      engine.selectBody(id)
      set({ bodyDescription: engine.describeBody(id), selectedId: id, selectedMinorIndex: null })
    },
    [set],
  )

  const handleFlyTo = useCallback(
    (id: string) => {
      const engine = getEngine()
      if (!engine) return
      engine.flyTo(id)
      set({ bodyDescription: engine.describeBody(id), selectedId: id, selectedMinorIndex: null, browserOpen: false })
    },
    [set],
  )

  const handleSelectMinor = useCallback(
    (index: number) => {
      const engine = getEngine()
      if (!engine) return
      engine.selectMinorBody(index)
      set({ minorDescription: engine.describeMinorBody(index), selectedId: null, selectedMinorIndex: index })
    },
    [set],
  )

  const handleSearch = useCallback(
    (query: string) => {
      if (!store.searchIndex) return
      set({ searchQuery: query, searchResults: store.searchIndex.search(query, 30) })
    },
    [set, store.searchIndex],
  )

  const handleSelectHit = useCallback(
    (hit: SearchHit) => {
      if (hit.kind === 'body') {
        handleFlyTo(hit.id)
      } else {
        const index = store.catalog?.minorBodies?.indexOf(hit.id) ?? -1
        if (index >= 0) handleSelectMinor(index)
      }
      set({ searchOpen: false })
    },
    [handleFlyTo, handleSelectMinor, set, store.catalog],
  )

  /**
   * The HUD target indicator follows what the camera is actually locked to, not
   * merely what is selected, so pressing Escape (which releases both) can no longer
   * leave the HUD claiming a target the camera has left (P2-6).
   */
  const trackedName = useMemo(() => {
    if (!store.catalog) return null
    const id = store.trackedId
    if (!id) return null
    if (id.startsWith('minor:')) {
      const index = Number(id.slice('minor:'.length))
      return store.catalog.minorBodies?.recordAt(index)?.name ?? null
    }
    const body = store.catalog.bodyById.get(id)
    return body ? bodyDisplayName(body, store.language) : id
  }, [store.catalog, store.trackedId, store.language])

  /** Localized display name of any catalogued body, for the information panel. */
  const resolveBodyName = useCallback(
    (id: string) => {
      const body = store.catalog?.bodyById.get(id)
      return body ? bodyDisplayName(body, store.language) : null
    },
    [store.catalog, store.language],
  )

  const toggleFilter = useCallback(
    (key: string) => {
      set({
        activeFilters: store.activeFilters.includes(key)
          ? store.activeFilters.filter((entry) => entry !== key)
          : [...store.activeFilters, key],
      })
    },
    [set, store.activeFilters],
  )

  /** Catalogue-derived numbers quoted by the guided tour (no hard-coded counts). */
  const tourCounts = useMemo(
    () => tourCountsFromStatistics(store.catalog?.catalog.statistics ?? null),
    [store.catalog],
  )

  const validationSummary = useMemo(() => {
    const validation = store.catalog?.catalog.validation
    if (!validation) return ''
    const passed = validation.checks.filter((check) => check.passed).length
    return `${passed}/${validation.checks.length} validation checks · ${validation.checks.map((check) => check.name).join(', ')}`
  }, [store.catalog])

  /* ------------------------------------------------------------------ render */

  return (
    <div
      className="app"
      data-reduced-motion={store.config?.reducedMotion ? 'true' : 'false'}
      data-phase={store.phase}
    >
      <div className="stage" ref={containerRef}>
        <canvas ref={canvasRef} aria-label={t('appTitle')} />
      </div>

      {store.phase === 'splash' && (
        <SplashScreen
          config={store.config ?? {
            language: store.language,
            title: { zh: '太阳系 · 真实三维导览', en: 'Real-Time Solar System' },
            subtitle: {
              zh: '探索太阳、行星、卫星、小行星以及人类已编目的太阳系世界',
              en: 'Explore the Sun, planets, moons and catalogued small bodies',
            },
          } as never}
          statistics={store.catalog?.catalog.statistics ?? null}
          liveBackground={store.engineReady}
          t={t}
          onEnter={enterExhibition}
        />
      )}

      {store.phase === 'loading' && (
        <LoadingScreen
          steps={steps}
          message={loadMessage}
          ratio={loadRatio}
          t={t}
          language={store.language}
          error={null}
          onRetry={retry}
        />
      )}

      {store.phase === 'error' && (
        <LoadingScreen
          steps={steps}
          message={loadMessage}
          ratio={0}
          t={t}
          language={store.language}
          error={store.errorMessage ?? error}
          onRetry={retry}
        />
      )}

      {store.phase === 'ready' && (
        <>
          <Hud
            t={t}
            language={store.language}
            julianDate={store.julianDate}
            timeScale={store.timeScale}
            paused={store.paused}
            cameraMode={store.cameraMode}
            scaleMode={store.scaleMode}
            quality={store.quality}
            orbitVisible={store.orbitVisible}
            labelVisible={store.labelVisible}
            minorVisible={store.minorVisible}
            starfieldVisible={store.starfieldVisible}
            atmosphereVisible={store.atmosphereVisible}
            activeFilters={store.activeFilters}
            scientificMode={store.scientificMode}
            scientificModeAvailable={store.config?.enableScientificMode ?? true}
            showPerformance={store.showPerformance}
            statistics={store.statistics}
            catalogStatistics={store.catalog?.catalog.statistics ?? null}
            minorRuntime={minorRuntime}
            trackedName={trackedName}
            autoDemoActive={store.autoDemoActive}
            onTimeScale={(value) => withEngine((engine) => engine.setTimeScale(value))()}
            onTogglePause={() => withEngine((engine) => engine.togglePaused())()}
            onReverse={() => withEngine((engine) => engine.reverseTime())()}
            onStep={(days) => withEngine((engine) => engine.shiftTimeDays(days))()}
            onJump={(input) => getEngine()?.jumpToDate(input) ?? false}
            onNow={() => withEngine((engine) => engine.jumpToJulianDate(Date.now() / 86_400_000 + 2440587.5))()}
            onCameraMode={(mode: CameraMode) => withEngine((engine) => engine.setCameraMode(mode))()}
            onScaleMode={(mode: ScaleMode) => set({ scaleMode: mode })}
            onQuality={(level: QualityLevel) => set({ quality: level })}
            onToggleOrbit={() => set({ orbitVisible: !store.orbitVisible })}
            majorOrbitsVisible={store.majorOrbitsVisible}
            onToggleMajorOrbits={() => {
              const engine = getEngine()
              if (!engine) return
              const visible = engine.toggleMajorOrbits()
              set({ majorOrbitsVisible: visible })
            }}
            onToggleLabels={() => set({ labelVisible: !store.labelVisible })}
            onToggleMinor={() => set({ minorVisible: !store.minorVisible })}
            onToggleStarfield={() => set({ starfieldVisible: !store.starfieldVisible })}
            onToggleAtmosphere={() => set({ atmosphereVisible: !store.atmosphereVisible })}
            onToggleFilter={toggleFilter}
            onToggleScientific={() => set({ scientificMode: !store.scientificMode })}
            onTogglePerformance={() => set({ showPerformance: !store.showPerformance })}
            onToggleSettings={() => set({ settingsOpen: !store.settingsOpen, searchOpen: false })}
            onToggleSearch={() => set({ searchOpen: !store.searchOpen, settingsOpen: false })}
            onToggleTour={() => set({ tourOpenRequested: !store.tourOpenRequested, settingsOpen: false, searchOpen: false })}
            onToggleBrowser={() => set({ browserOpen: !store.browserOpen })}
            onStartTour={() => set({ tourActive: true, tourStep: 0, searchOpen: false, settingsOpen: false })}
          />

          {store.browserOpen && (
            <Sidebar
              t={t}
              language={store.language}
              catalog={store.catalog}
              selectedId={store.selectedId}
              selectedMinorIndex={store.selectedMinorIndex}
              onSelect={handleSelect}
              onFlyTo={handleFlyTo}
              onSelectMinor={handleSelectMinor}
              onClose={() => set({ browserOpen: false })}
            />
          )}

          <Inspector
            t={t}
            language={store.language}
            description={store.bodyDescription}
            minorDescription={store.minorDescription}
            scaleMode={store.scaleMode}
            radiusMagnification={store.bodyDescription?.radiusMagnification ?? 1}
            scientificMode={store.scientificMode}
            resolveBodyName={resolveBodyName}
            onClose={() => withEngine((engine) => engine.clearSelection())()}
            onFlyTo={() => store.selectedId && handleFlyTo(store.selectedId)}
          />

          {store.searchOpen && (
            <SearchPanel
              t={t}
              language={store.language}
              hits={store.searchResults}
              query={store.searchQuery}
              onQuery={handleSearch}
              onSelectHit={handleSelectHit}
              onClose={() => set({ searchOpen: false })}
            />
          )}

          {store.settingsOpen && (
            <SettingsPanel
              t={t}
              language={store.language}
              quality={store.quality}
              scaleMode={store.scaleMode}
              orbitVisible={store.orbitVisible}
              labelVisible={store.labelVisible}
              starfieldVisible={store.starfieldVisible}
              atmosphereVisible={store.atmosphereVisible}
              minorVisible={store.minorVisible}
              scientificMode={store.scientificMode}
              showPerformance={store.showPerformance}
              autoDemoEnabled={store.config?.enableAutoDemo ?? true}
              autoDemoCountdown={store.autoDemoCountdown}
              uiScale={store.config?.uiScale ?? 1}
              reducedMotion={store.config?.reducedMotion ?? false}
              catalogVersion={store.catalog?.catalog.version ?? ''}
              validationSummary={validationSummary}
              sources={store.catalog?.catalog.sources ?? []}
              onLanguage={(language: Language) => set({ language })}
              onQuality={(level: QualityLevel) => set({ quality: level })}
              onScaleMode={(mode: ScaleMode) => set({ scaleMode: mode })}
              onToggle={(key) => {
                switch (key) {
                  case 'orbit':
                    set({ orbitVisible: !store.orbitVisible })
                    break
                  case 'label':
                    set({ labelVisible: !store.labelVisible })
                    break
                  case 'starfield':
                    set({ starfieldVisible: !store.starfieldVisible })
                    break
                  case 'atmosphere':
                    set({ atmosphereVisible: !store.atmosphereVisible })
                    break
                  case 'minor':
                    set({ minorVisible: !store.minorVisible })
                    break
                  case 'scientific':
                    set({ scientificMode: !store.scientificMode })
                    break
                  case 'performance':
                    set({ showPerformance: !store.showPerformance })
                    break
                  case 'autoDemo': {
                    // Both names for the switch are written together, so the idle
                    // check can never disagree with what the panel shows (P1-4).
                    const next = !(store.config?.enableAutoDemo ?? true)
                    set({
                      config: store.config
                        ? { ...store.config, enableAutoDemo: next, autoDemo: next }
                        : null,
                    })
                    break
                  }
                }
              }}
              onUiScale={(value) => set({ config: store.config ? { ...store.config, uiScale: value } : null })}
              onReducedMotion={(value) => {
                set({ config: store.config ? { ...store.config, reducedMotion: value } : null })
                getEngine()?.cameraController.setReducedMotion(value)
              }}
              onClose={() => set({ settingsOpen: false })}
            />
          )}

          {store.tourActive || store.tourOpenRequested ? (
            <TourPanel
              t={t}
              language={store.language}
              active={store.tourActive}
              step={store.tourStep}
              counts={tourCounts}
              onStart={() => set({ tourActive: true, tourStep: 0 })}
              onNext={() =>
                set({
                  tourStep: Math.min(TOUR_STOPS.length - 1, store.tourStep + 1),
                  tourActive: true,
                })
              }
              onPrevious={() => set({ tourStep: Math.max(0, store.tourStep - 1), tourActive: true })}
              onExit={() => set({ tourActive: false, tourOpenRequested: false })}
            />
          ) : null}

          {store.showPerformance && (
            <PerformanceOverlay t={t} snapshot={store.performance} history={store.performanceHistory} />
          )}

          <div className="toast-stack">
            {store.toasts.map((toast) => (
              <div key={toast.id} className="toast" data-level={toast.level} onClick={() => store.dismissToast(toast.id)}>
                {toast.message}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export { setEngine }