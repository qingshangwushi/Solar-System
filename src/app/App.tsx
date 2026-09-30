import { useEffect, useReducer, useRef, useState } from "react";
import rawCatalog from "../data/catalog/bodies.json";
import phase2Catalog from "../data/catalog/phase2.json";
import starManifest from "../data/stars/manifest.json";
import toursData from "../tours/tours.json";
import { loadCatalog } from "../astronomy/catalog";
import { utcToTdbJulianDate } from "../astronomy/time-scales";
import { propagateKepler } from "../astronomy/kepler";
import { advanceSimulationTime } from "../astronomy/time";
import { appReducer } from "../state/store";
import type { SimulationTime, Vec3Km } from "../astronomy/types";
import type { EphemerisDataset } from "../astronomy/ephemeris";
import { SolarSystemScene, type RenderBody, type SceneLayer } from "../scene/SolarSystemScene";
import { createScale } from "../scene/scale";
import { TourController, type TourDefinition, type TourStep } from "../tours/TourController";
import type { BackgroundStar } from "../scene/StellarBackground";
import { CelestialSidebar } from "../ui/CelestialSidebar";
import { BodyInfoPanel } from "../ui/BodyInfoPanel";
import { SceneToolbar } from "../ui/SceneToolbar";
import { TimeControls } from "../ui/TimeControls";
import { SolarSystemMiniMap } from "../ui/SolarSystemMiniMap";
import type { WorkerRequest, WorkerResponse } from "../workers/protocol";
import "./app.css";

const combinedCatalog = { ...rawCatalog, bodies: [...rawCatalog.bodies, ...phase2Catalog.bodies] };
const catalog = loadCatalog(combinedCatalog);
const initialUtc = "2026-09-30T00:00:00.000Z";
const initialTime: SimulationTime = { utc: initialUtc, julianDateTdb: utcToTdbJulianDate(initialUtc), speed: 86_400, paused: false };
const tours = toursData as TourDefinition[];
const ephemerisModules = import.meta.glob<EphemerisDataset>("../data/ephemeris/*.json", { import: "default" });
const loadEphemerisDatasets = Object.values(ephemerisModules);
const ephemerisBodyIds = new Set(Object.keys(ephemerisModules)
  .map((path) => path.split("/").at(-1)?.replace(/\.json$/, ""))
  .filter((bodyId): bodyId is string => !!bodyId && bodyId !== "manifest"));

const G_KM3_KG_S2 = 6.67430e-20;

function calculateFallbackPositions(jdTdb: number): Map<string, Vec3Km> {
  const positions = new Map<string, Vec3Km>();
  const resolving = new Set<string>();
  const resolve = (bodyId: string): Vec3Km => {
    if (positions.has(bodyId)) return positions.get(bodyId)!;
    const body = catalog.find((candidate) => candidate.id === bodyId);
    if (!body) throw new Error(`Missing body ${bodyId}`);
    if (resolving.has(bodyId)) throw new Error(`Parent cycle at ${bodyId}`);
    resolving.add(bodyId);
    let position: Vec3Km = { x: 0, y: 0, z: 0 };
    if (body.orbit) {
      const parent = catalog.find((candidate) => candidate.id === body.parentId);
      if (!parent?.massKg) throw new Error(`Missing parent mass for ${bodyId}`);
      const relative = propagateKepler(body.orbit, jdTdb, G_KM3_KG_S2 * parent.massKg);
      const parentPosition = body.parentId === "sun" ? { x: 0, y: 0, z: 0 } : resolve(parent.id);
      position = { x: relative.x + parentPosition.x, y: relative.y + parentPosition.y, z: relative.z + parentPosition.z };
    }
    resolving.delete(bodyId);
    positions.set(bodyId, position);
    return position;
  };
  for (const body of catalog) { try { resolve(body.id); } catch { /* Keep unavailable bodies at the origin and show the data status. */ } }
  return positions;
}

function makeInitialRenderBodies(): RenderBody[] {
  return catalog.map((body) => ({ ...body, positionKm: { x: 0, y: 0, z: 0 } }));
}

function dateToSimulationTime(date: string, previous: SimulationTime, clock = previous.utc.slice(11, 19) || "12:00:00"): SimulationTime {
  const time = clock.length === 5 ? `${clock}:00` : clock;
  const utc = `${date}T${time}.000Z`;
  return { ...previous, utc, julianDateTdb: utcToTdbJulianDate(utc) };
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, {
    selectedBodyId: "sun",
    cameraMode: "overview",
    scaleMode: "visible",
    qualityPreset: "high",
    layers: { bodies: true, orbits: true, labels: true, asteroids: true, comets: true, tno: true, stars: false },
    time: initialTime,
  });
  const [query, setQuery] = useState("");
  const [positions, setPositions] = useState<Map<string, Vec3Km>>(() => new Map());
  const [positionMode, setPositionMode] = useState("Kepler fallback");
  const [sceneError, setSceneError] = useState("");
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [workerGeneration, setWorkerGeneration] = useState(0);
  const [offlineStatus, setOfflineStatus] = useState("LOCAL KEPLER · OFFLINE READY");
  const [selectedTourId, setSelectedTourId] = useState(tours[0]!.id);
  const [tourStep, setTourStep] = useState<TourStep>();
  const tourControllerRef = useRef(new TourController(tours, new Set(catalog.map((body) => body.id))));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SolarSystemScene | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const requestMapRef = useRef(new Map<number, { bodyId: string; jdTdb: number }>());
  const responsePositionsRef = useRef(new Map<string, Vec3Km>());
  const responseTimeRef = useRef(Number.NaN);
  const nextRequestIdRef = useRef(0);
  const timeRef = useRef(state.time);
  timeRef.current = state.time;
  const selectedBody = catalog.find((body) => body.id === state.selectedBodyId) ?? catalog[0]!;
  const scale = createScale(state.scaleMode);

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new SolarSystemScene({ onSelect: (id) => dispatch({ type: "SELECT_BODY", id }), onContextLost: () => setSceneError("Graphics context was interrupted. Reload the scene or continue with time and catalog controls.") });
    try {
      setSceneError("");
      scene.mount(canvasRef.current);
      scene.setBodies(makeInitialRenderBodies());
      scene.setBackgroundStars(starManifest.stars as BackgroundStar[]);
      scene.setScaleMode(state.scaleMode);
      scene.setQualityPreset(state.qualityPreset);
      scene.setCameraMode(state.cameraMode);
      for (const layer of Object.keys(state.layers) as SceneLayer[]) scene.setLayer(layer, state.layers[layer]);
      scene.setPositions(positions);
      sceneRef.current = scene;
    } catch (error) {
      setSceneError(error instanceof Error ? `3D scene unavailable: ${error.message}` : "3D scene unavailable.");
      scene.dispose();
    }
    return () => { scene.dispose(); sceneRef.current = null; };
  }, [sceneGeneration]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setScaleMode(state.scaleMode);
    scene.setQualityPreset(state.qualityPreset);
    scene.setCameraMode(state.cameraMode);
    for (const layer of Object.keys(state.layers) as SceneLayer[]) scene.setLayer(layer, state.layers[layer]);
  }, [state.scaleMode, state.qualityPreset, state.cameraMode, state.layers]);

  useEffect(() => { sceneRef.current?.setPositions(positions); }, [positions]);
  useEffect(() => { sceneRef.current?.setSimulationTime(state.time.julianDateTdb); }, [state.time.julianDateTdb]);
  useEffect(() => { if (sceneRef.current && state.cameraMode !== "overview") { try { sceneRef.current.setTarget(state.selectedBodyId); } catch { /* The selected data remains available if the renderer is unavailable. */ } } }, [state.selectedBodyId, state.cameraMode]);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      setOfflineStatus("LOCAL FALLBACK · WORKER UNAVAILABLE");
      setPositions(calculateFallbackPositions(timeRef.current.julianDateTdb));
      return;
    }
    let worker: Worker;
    let active = true;
    try {
      worker = new Worker(new URL("../workers/astronomy.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setOfflineStatus("LOCAL FALLBACK · WORKER UNAVAILABLE");
      setPositions(calculateFallbackPositions(timeRef.current.julianDateTdb));
      return;
    }
    workerRef.current = worker;
    workerReadyRef.current = false;
    const requestPositions = (jdTdb: number) => {
      responseTimeRef.current = jdTdb;
      responsePositionsRef.current.clear();
      const request: WorkerRequest = { type: "SET_TIME", time: { ...timeRef.current, julianDateTdb: jdTdb } };
      worker.postMessage(request);
      for (const body of catalog) {
        if (!body.orbit && !ephemerisBodyIds.has(body.id)) continue;
        const requestId = ++nextRequestIdRef.current;
        requestMapRef.current.set(requestId, { bodyId: body.id, jdTdb });
        worker.postMessage({ type: "GET_POSITION", requestId, bodyId: body.id, jdTdb, allowKeplerFallback: true } satisfies WorkerRequest);
      }
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "READY") { workerReadyRef.current = true; requestPositions(timeRef.current.julianDateTdb); }
      if (message.type === "POSITION") {
        const requested = requestMapRef.current.get(message.requestId);
        requestMapRef.current.delete(message.requestId);
        if (!requested || requested.bodyId !== message.bodyId || requested.jdTdb !== timeRef.current.julianDateTdb) return;
        if (responseTimeRef.current !== requested.jdTdb) { responseTimeRef.current = requested.jdTdb; responsePositionsRef.current.clear(); }
        responsePositionsRef.current.set(message.bodyId, message.position);
        if (responsePositionsRef.current.size >= catalog.filter((body) => body.orbit || ephemerisBodyIds.has(body.id)).length) setPositions(new Map(responsePositionsRef.current));
        setPositionMode(message.mode === "kepler-fallback" ? "Kepler fallback" : "Ephemeris");
        if (message.mode === "kepler-fallback" && message.coverage) setOfflineStatus(`KEPLER FALLBACK · JDTDB ${message.coverage.startJD.toFixed(1)}–${message.coverage.stopJD.toFixed(1)}`);
      }
      if (message.type === "ERROR") {
        setOfflineStatus(message.code === "EPHEMERIS_COVERAGE" ? "OUTSIDE EPHEMERIS COVERAGE · EXPLICIT FALLBACK" : `DATA FALLBACK · ${message.message}`);
        setPositions(calculateFallbackPositions(timeRef.current.julianDateTdb));
      }
    };
    worker.onerror = () => {
      setOfflineStatus("WORKER ERROR · RESTART AVAILABLE");
      setPositions(calculateFallbackPositions(timeRef.current.julianDateTdb));
    };
    void Promise.all(loadEphemerisDatasets.map((loadDataset) => loadDataset()))
      .then((datasets) => {
        if (active) worker.postMessage({ type: "INIT", catalog: combinedCatalog, datasets: datasets.filter((dataset) => typeof dataset?.bodyId === "string" && Array.isArray(dataset.samples)) } satisfies WorkerRequest);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOfflineStatus(`LOCAL FALLBACK · EPHEMERIS DATA ERROR · ${error instanceof Error ? error.message : String(error)}`);
        setPositions(calculateFallbackPositions(timeRef.current.julianDateTdb));
      });
    return () => { active = false; worker.terminate(); workerRef.current = null; workerReadyRef.current = false; requestMapRef.current.clear(); };
  }, [workerGeneration]);

  useEffect(() => {
    if (!state.time.paused) {
      const timer = window.setInterval(() => dispatch({ type: "TIME", time: advanceSimulationTime(timeRef.current, 0.25) }), 250);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [state.time.paused]);

  useEffect(() => {
    if (!workerRef.current || !workerReadyRef.current) return;
    responseTimeRef.current = state.time.julianDateTdb;
    responsePositionsRef.current.clear();
    workerRef.current.postMessage({ type: "SET_TIME", time: state.time } satisfies WorkerRequest);
    for (const body of catalog) {
      if (!body.orbit && !ephemerisBodyIds.has(body.id)) continue;
      const requestId = ++nextRequestIdRef.current;
      requestMapRef.current.set(requestId, { bodyId: body.id, jdTdb: state.time.julianDateTdb });
      workerRef.current.postMessage({ type: "GET_POSITION", requestId, bodyId: body.id, jdTdb: state.time.julianDateTdb, allowKeplerFallback: true } satisfies WorkerRequest);
    }
  }, [state.time.julianDateTdb]);

  const selectBody = (id: string) => dispatch({ type: "SELECT_BODY", id });
  const updateDate = (date: string) => {
    if (!date) return;
    try { dispatch({ type: "TIME", time: dateToSimulationTime(date, state.time) }); }
    catch (error) { setOfflineStatus(error instanceof Error ? error.message : "Invalid date"); }
  };
  const updateClockTime = (clock: string) => {
    if (!clock) return;
    try { dispatch({ type: "TIME", time: dateToSimulationTime(state.time.utc.slice(0, 10), state.time, clock) }); }
    catch (error) { setOfflineStatus(error instanceof Error ? error.message : "Invalid time"); }
  };
  const togglePause = () => dispatch({ type: "TIME", time: { ...state.time, paused: !state.time.paused } });
  const reverseTime = () => dispatch({ type: "TIME", time: { ...state.time, speed: -Math.abs(state.time.speed), paused: false } });
  const setSpeed = (speed: number) => dispatch({ type: "TIME", time: { ...state.time, speed, paused: false } });
  const startTour = () => {
    const step = tourControllerRef.current.start(selectedTourId);
    setTourStep(step);
    if (step) selectBody(step.bodyId);
  };
  const nextTourStep = () => {
    const step = tourControllerRef.current.next();
    setTourStep(step);
    if (step) selectBody(step.bodyId);
  };
  const selectedPosition = positions.get(selectedBody.id);
  const distanceKm = selectedPosition ? Math.hypot(selectedPosition.x, selectedPosition.y, selectedPosition.z) : selectedBody.orbit ? Math.abs(selectedBody.orbit.semiMajorAxisKm) : 0;

  return <main className="app-shell" aria-labelledby="app-title">
    <header className="topbar">
      <div className="brand-mark" aria-hidden="true"><span>✦</span></div>
      <div className="brand-copy"><span className="eyebrow">INTERACTIVE PLANETARIUM</span><h1 id="app-title">Solar System <span>Atlas</span></h1></div>
      <div className="topbar-meta"><span className="live-indicator" /> {offlineStatus}<span className="topbar-divider" /> <span>J2000 · TDB</span></div>
      {offlineStatus.includes("RESTART AVAILABLE") && <button type="button" className="help-button" onClick={() => setWorkerGeneration((value) => value + 1)}>Restart worker</button>}
      <button type="button" className="fullscreen-button" onClick={() => { if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.(); else void document.exitFullscreen?.(); }} aria-label="Toggle fullscreen">⛶</button>
      <button type="button" className="help-button" aria-label="About this guide" title="About this guide">?</button>
    </header>
    <div className="workspace-grid">
      <CelestialSidebar catalog={catalog} query={query} selectedId={state.selectedBodyId} onQuery={setQuery} onSelect={selectBody} />
      <section className="viewport" aria-label="Interactive solar system scene">
        <canvas ref={canvasRef} className="scene-canvas" aria-label="Interactive 3D solar system" />
        <div className="viewport-topline"><div><span className="section-kicker">SOLAR SYSTEM · HELIOCENTRIC VIEW</span><strong>Explore our neighborhood</strong></div><span className="coordinate-pill">ECLIPJ2000 <i>·</i> KM</span></div>
        <SceneToolbar scaleMode={state.scaleMode} qualityPreset={state.qualityPreset} onQuality={(preset) => dispatch({ type: "QUALITY", preset })} cameraMode={state.cameraMode} layers={state.layers} scaleLabel={scale.label} tours={tours} selectedTourId={selectedTourId} tourPlaying={Boolean(tourStep)} onTourChange={setSelectedTourId} onTourStart={startTour} onTourNext={nextTourStep} onScale={(mode) => dispatch({ type: "SCALE_MODE", mode })} onCamera={(mode) => dispatch({ type: "CAMERA_MODE", mode })} onLayer={(layer, enabled) => dispatch({ type: "TOGGLE_LAYER", layer, enabled })} />
        <SolarSystemMiniMap catalog={catalog} positions={positions} selectedId={state.selectedBodyId} />
        {scale.enhancementActive && <div className="scale-warning" role="status">{state.scaleMode === "visible" ? "Body sizes enhanced for visibility; orbital distances remain scaled uniformly." : "Exhibition distances are compressed non-linearly; this view is not to scale."}</div>}
        {tourStep && <div className="tour-card" aria-live="polite"><span className="section-kicker">GUIDED TOUR · {selectedTourId.toUpperCase()}</span><strong>{tourStep.title}</strong><span>{tourStep.description}</span></div>}
        {sceneError && <div className="scene-error" role="status"><strong>3D renderer unavailable</strong><span>{sceneError}</span><small>Catalog, search, date and simulation controls remain available.</small><button type="button" className="recover-button" onClick={() => { setSceneError(""); setSceneGeneration((value) => value + 1); }}>Try renderer again</button></div>}
        <div className="scene-hud"><span><i className="hud-dot" /> {positionMode.toUpperCase()}</span><span>SIM TIME <b>{state.time.utc.slice(0, 10)}</b></span><span>{catalog.length} OBJECTS</span></div>
        <span className="visually-hidden" data-testid="scene-target">{state.selectedBodyId}</span>
      </section>
      <BodyInfoPanel body={selectedBody} distanceKm={distanceKm} positionMode={positionMode} />
    </div>
    <TimeControls time={state.time} onDate={updateDate} onClock={updateClockTime} onPause={togglePause} onReverse={reverseTime} onSpeed={setSpeed} />
    <footer className="app-footer"><span>Positions computed from local orbital elements or bundled ephemerides.</span><span>DATA COUNT IS DYNAMIC · {catalog.length} BODIES</span></footer>
  </main>;
}
