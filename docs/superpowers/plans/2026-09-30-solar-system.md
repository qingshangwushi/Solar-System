# Solar System 3D Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a science-grounded, offline-capable browser solar-system guide, then extend it in verified phases to large catalog rendering and exhibition deployment.

**Architecture:** React owns the interface and application state; an imperative Three.js scene owns GPU resources; a Web Worker owns simulation-time propagation and catalog filtering. Versioned local catalog and ephemeris assets come from an ingestion pipeline that records source, frame, time scale, coverage, and update time.

**Tech Stack:** TypeScript strict, React, Vite, Three.js, Web Workers, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-solar-system-design.md`

## Global Constraints

- The MVP contains Sun, eight planets, Moon, Titan, Pluto, and a curated set of main-belt asteroids with real orbital elements.
- Distances use km internally, mass kg, time seconds, angles radians, and epochs Julian Date.
- Astronomical computation uses Float64 and explicitly recorded frames; GPU positions are camera-relative Float32.
- Main bodies use ephemeris data where available; minor bodies use recorded orbital elements and Kepler propagation.
- No random points may be presented as real small bodies, and no circular animation may stand in for calculated orbital motion.
- Scale modes are Scientific Scale, Visible Scale, and Exhibition Scale; enhanced sizes and compressed distances must be disclosed.
- The app remains usable offline with its last validated local data bundle.
- The target is 60 FPS on a mainstream exhibition PC, with 30 FPS minimum through adaptive quality.
- TypeScript strict mode is enabled; astronomical algorithms and coordinate transforms have unit tests.

## Review Focus

- A requested simulation date outside ephemeris coverage must show the coverage limit and explicitly marked Kepler fallback.
- Negative time speed and pause/resume must advance the same clock in opposite/zero directions without frame-rate dependence.
- Circular, near-circular, high-eccentricity, and hyperbolic elements must avoid NaN or silently invalid coordinates.
- Searching aliases and duplicate names must return stable, disambiguated results and must not fly to a different body.
- WebGL unavailability or context loss must produce a recoverable message and preserve non-3D controls where possible.

---

## File Map

```text
index.html
package.json
tsconfig.json
vite.config.ts
playwright.config.ts
src/main.tsx
src/app/App.tsx
src/app/app.css
src/astronomy/types.ts
src/astronomy/units.ts
src/astronomy/time.ts
src/astronomy/time-scales.ts
src/astronomy/coordinates.ts
src/astronomy/kepler.ts
src/astronomy/catalog.ts
src/astronomy/ephemeris.ts
src/workers/astronomy.worker.ts
src/workers/protocol.ts
src/scene/SolarSystemScene.ts
src/scene/scale.ts
src/scene/camera.ts
src/scene/orbitGeometry.ts
src/state/store.ts
src/ui/CelestialSidebar.tsx
src/ui/TimeControls.tsx
src/ui/BodyInfoPanel.tsx
src/ui/SceneToolbar.tsx
src/data/catalog/bodies.json
src/data/ephemeris/*.json
src/data/time/leap-seconds.json
src/data/stars/manifest.json
src/tours/tours.json
src/tours/TourController.ts
public/textures/**
public/textures/ATTRIBUTION.md
scripts/import-horizons.ts
scripts/import-mpc.ts
scripts/validate-data.ts
tests/astronomy/*.test.ts
tests/data/*.test.ts
tests/ui/*.test.tsx
tests/e2e/solar-system.spec.ts
README.md
docs/{architecture.md,astronomical-model.md,coordinate-system.md,data-sources.md,performance.md,exhibition-deployment.md}
```

## Implementation Tasks

### Task 1: Web application foundation and test harness

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `playwright.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/app/App.tsx`, `src/app/app.css`
- Test: `tests/ui/app.test.tsx`

**Interfaces:**
- Produces: `App` mounts into `#root`; `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`, and `npm run test:e2e` are available.

- [ ] **Step 1: Write the failing smoke test**
  - Add the minimal package/test configuration and dependencies (React, React DOM, Three.js, Vite, TypeScript, Vitest, Testing Library, and Playwright), then assert in `tests/ui/app.test.tsx` that `App` renders the app title and a main region.
- [ ] **Step 2: Run the test and verify the product behavior fails**
  - Run: `npm test -- --run tests/ui/app.test.tsx`
  - Expected: FAIL because the `App` component is not implemented yet.
- [ ] **Step 3: Scaffold strict TypeScript, React, Vite, and Vitest**
  - Add scripts `dev`, `build`, `test`, `typecheck`, `test:e2e`; configure `strict: true`, DOM/WebWorker libs, Vitest, and Playwright.
  - Render the initial shell with accessible title and main region.
- [ ] **Step 4: Verify the foundation**
  - Run: `npm test -- --run tests/ui/app.test.tsx`
  - Run: `npm run typecheck && npm run build`
  - Expected: smoke test, typecheck, and production build pass.

### Task 2: Typed astronomy model, units, and time system

**Files:**
- Create: `src/astronomy/types.ts`, `src/astronomy/units.ts`, `src/astronomy/time.ts`, `src/astronomy/time-scales.ts`, `src/data/time/leap-seconds.json`, `tests/astronomy/time.test.ts`, `tests/astronomy/units.test.ts`, `tests/astronomy/time-scales.test.ts`

**Interfaces:**
- Produces: `CelestialObject`, `OrbitalElements`, `EphemerisReference`, `SimulationTime { utc: string; julianDateTdb: number; speed: number; paused: boolean }`, `utcToJulianDate(utc: string): number`, `utcToTdbJulianDate(utc: string): number`, `tdbJulianDateToUtc(jdTdb: number): string`, `julianDateToUtc(jd: number): string`, `advanceSimulationTime(time: SimulationTime, elapsedSeconds: number): SimulationTime`, `kmToAu(km: number): number`, `auToKm(au: number): number`.

- [ ] **Step 1: Write failing unit tests**
  - Assert UTC/JD round trip within one second for 2000-01-01T12:00:00Z and 2026-09-30T00:00:00Z.
  - Assert pausing advances by zero, speed `86400` advances one JD per elapsed second, and speed `-86400` reverses one JD.
  - Assert AU conversion uses `149_597_870.7 km` per AU and round-trips within `1e-9 AU`.
  - Assert UTC-to-TDB and TDB-to-UTC against saved reference epochs and the bundled leap-second table within one second.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/astronomy/time.test.ts tests/astronomy/units.test.ts`
  - Expected: FAIL because the modules do not exist.
- [ ] **Step 3: Implement domain types and pure functions**
  - Reject invalid ISO UTC strings, non-finite time speeds, and non-finite distances with typed errors.
  - Keep all internal angles in radians and all internal distances in km.
  - Keep UI input/output in UTC; use the bundled, source-documented leap-second table and the selected published periodic correction to convert TDB explicitly.
- [ ] **Step 4: Verify tests and types**
  - Run: `npm test -- --run tests/astronomy/time.test.ts tests/astronomy/units.test.ts && npm run typecheck`
  - Expected: all assertions and typecheck pass.

### Task 3: Kepler propagation and coordinate transforms

**Files:**
- Create: `src/astronomy/coordinates.ts`, `src/astronomy/kepler.ts`, `tests/astronomy/coordinates.test.ts`, `tests/astronomy/kepler.test.ts`, `docs/astronomical-model.md`, `docs/coordinate-system.md`

**Interfaces:**
- Consumes: `OrbitalElements` and `julianDate` from Task 2.
- Produces: `Vec3Km`, `Vec3Scene`, `propagateKepler(elements: OrbitalElements, jdTdb: number, muKm3S2: number): Vec3Km`, `eclipticToScene(position: Vec3Km): Vec3Scene`, `sceneToEcliptic(position: Vec3Scene): Vec3Km`.

- [ ] **Step 1: Write failing physics tests**
  - Assert a circular orbit returns its expected radius at quarter period within `1e-6` relative error.
  - Assert an eccentric orbit has periapsis `a * (1 - e)` and apoapsis `a * (1 + e)` within `1e-6` relative error.
  - Assert zero inclination and known 90-degree inclination map to expected ecliptic axes.
  - Assert hyperbolic elements (`e > 1` with negative signed semi-major axis) produce finite positions and a known periapsis distance; assert invalid `e < 0` and zero semi-major axis fail with typed errors.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/astronomy/coordinates.test.ts tests/astronomy/kepler.test.ts`
  - Expected: FAIL because propagation and transforms are not implemented.
- [ ] **Step 3: Implement propagation and transforms**
  - Solve the elliptic equation with a bounded Newton iteration and high-e fallback; solve hyperbolic mean anomaly using `e * sinh(H) - H = M` and signed semi-major axis.
  - Require the primary body's gravitational parameter as `muKm3S2`; do not guess the central-body mass from the orbital elements.
  - Rotate orbital-plane coordinates using argument of periapsis, inclination, and longitude of ascending node.
  - Keep `Vec3Km` and `Vec3Scene` as plain numeric structures in astronomy modules; convert to/from Three.js vectors only in `src/scene/`.
  - Document units, frame conventions, solver limits, and formulas in the two docs.
- [ ] **Step 4: Verify numeric behavior**
  - Run: `npm test -- --run tests/astronomy/coordinates.test.ts tests/astronomy/kepler.test.ts && npm run typecheck`
  - Expected: all position and transform tolerances pass; no NaN output for supported elements.

### Task 4: Catalog schema, local MVP data, and validation

**Files:**
- Create: `src/astronomy/catalog.ts`, `src/data/catalog/bodies.json`, `scripts/validate-data.ts`, `tests/data/catalog.test.ts`
- Modify: `src/astronomy/types.ts`, `package.json`

**Interfaces:**
- Consumes: astronomy domain types from Task 2.
- Produces: `loadCatalog(raw: unknown): CelestialObject[]`, `searchCatalog(catalog: CelestialObject[], query: string): CelestialObject[]`, `validateCatalog(catalog: CelestialObject[]): CatalogValidationResult`.

- [ ] **Step 1: Write failing catalog tests**
  - Assert the bundled MVP catalog includes Sun, Mercury through Neptune, Moon, Titan, Pluto, and a curated set of identified main-belt asteroids with orbital elements.
  - Assert each record has unique `id`, `source`, and valid finite physical/orbital fields when present.
  - Assert aliases search case-insensitively and duplicate display names return all matching IDs deterministically.
  - Assert malformed `unknown` input returns field-specific validation errors.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/data/catalog.test.ts`
  - Expected: FAIL because catalog data and validator do not exist.
- [ ] **Step 3: Implement typed catalog loader and fixture data**
  - Store source URL, source revision/date, units, element epoch, frame, and object category for each record.
  - Add the `validate:data` package script that runs `scripts/validate-data.ts`.
  - Do not hardcode total counts in UI or tests; assert required MVP IDs only.
- [ ] **Step 4: Verify the catalog and validator**
  - Run: `npm test -- --run tests/data/catalog.test.ts && npm run validate:data`
  - Expected: valid bundle reports success; malformed test fixtures report actionable errors.

### Task 5: Ephemeris ingestion and offline astronomy worker

**Files:**
- Create: `src/astronomy/ephemeris.ts`, `src/workers/protocol.ts`, `src/workers/astronomy.worker.ts`, `scripts/import-horizons.ts`, `src/data/ephemeris/manifest.json`, `tests/astronomy/ephemeris.test.ts`, `tests/workers/astronomy.worker.test.ts`

**Interfaces:**
- Consumes: time, Kepler and catalog APIs from Tasks 2–4.
- Produces: `getEphemerisPosition(dataset: EphemerisDataset, jd: number): Vec3Km`, worker messages `INIT`, `SET_TIME`, `SEARCH`, `GET_POSITION`, and corresponding `READY`, `TIME_UPDATED`, `SEARCH_RESULTS`, `POSITION`, `ERROR` responses.

- [ ] **Step 1: Write failing interpolation, coverage, and protocol tests**
  - Assert midpoint linear interpolation between two known sample positions.
  - Assert requests before/after a dataset's coverage return a coverage error, not extrapolated silent success.
  - Assert a stored JPL reference vector at a documented epoch is reproduced within the data pipeline's declared interpolation tolerance.
  - Assert worker `SET_TIME` produces consistent positions and `SEARCH` responds with matching catalog IDs.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/astronomy/ephemeris.test.ts tests/workers/astronomy.worker.test.ts`
  - Expected: FAIL because ephemeris and worker protocol are absent.
- [ ] **Step 3: Implement offline dataset access and worker**
  - Add a deterministic Horizons importer that records target, center, frame, time scale, range, step, source URL, and retrieval timestamp.
  - Bundle daily positions for planets and Pluto covering 1969 through 2035, plus hourly samples for Moon and Titan across the demo date range; document interpolation error bounds and do not query Horizons from the render loop.
  - Convert the clock's UTC input to TDB before querying TDB-tagged datasets; preserve frame and time-scale labels in all worker responses.
  - For Kepler records, resolve `parentId` to the primary body's mass and derive `muKm3S2`; return a typed error when the parent or mass is unavailable.
  - Use Kepler fallback only when explicitly enabled and label its result mode in the worker response.
- [ ] **Step 4: Verify worker behavior**
  - Run: `npm test -- --run tests/astronomy/ephemeris.test.ts tests/workers/astronomy.worker.test.ts && npm run typecheck`
  - Expected: interpolation, coverage, fallback labels, and protocol tests pass.

### Task 6: Three.js scene, scales, orbits, and camera

**Files:**
- Create: `src/scene/SolarSystemScene.ts`, `src/scene/scale.ts`, `src/scene/camera.ts`, `src/scene/orbitGeometry.ts`, `tests/ui/scale.test.ts`, `tests/ui/scene-lifecycle.test.ts`

**Interfaces:**
- Consumes: `CelestialObject`, `Vec3Km`, and worker position responses.
- Produces: `SolarSystemScene.mount(canvas: HTMLCanvasElement): void`, `setBodies(bodies: RenderBody[]): void`, `setScaleMode(mode: ScaleMode): void`, `setTarget(id: string): void`, `dispose(): void`.

- [ ] **Step 1: Write failing scale and lifecycle tests**
  - Assert scientific scale preserves relative distances and radii.
  - Assert visible scale changes radii only and reports enhancement active.
  - Assert exhibition scale is monotonic and is labelled non-linear.
  - Assert disposal releases renderer, geometry, material, animation frame, and event listeners exactly once.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/ui/scale.test.ts tests/ui/scene-lifecycle.test.ts`
  - Expected: FAIL because the scene modules do not exist.
- [ ] **Step 3: Implement scene lifecycle and render features**
  - Build a responsive Y-up scene with camera-relative positions, Sun emissive surface, shaded and rotating planet spheres with axial tilt, selectable bodies, Kepler/ephemeris orbit paths, labels, orbit/free-flight/follow/overview camera modes, a populated real-data asteroid belt, and smooth target flight.
  - Keep the render loop imperative and request worker updates without creating one React component per body.
  - Bundle attributed public NASA/USGS base maps where available and stream higher-resolution levels on approach; label any procedural treatment accurately and never present it as a measured surface map.
- [ ] **Step 4: Verify scales, interaction, and cleanup**
  - Run: `npm test -- --run tests/ui/scale.test.ts tests/ui/scene-lifecycle.test.ts && npm run typecheck`
  - Expected: scale constraints pass and repeated mount/dispose has no leaked handles.

### Task 7: Interface, search, time controls, and body details

**Files:**
- Create: `src/state/store.ts`, `src/ui/CelestialSidebar.tsx`, `src/ui/TimeControls.tsx`, `src/ui/BodyInfoPanel.tsx`, `src/ui/SceneToolbar.tsx`, `tests/ui/controls.test.tsx`, `tests/ui/search.test.tsx`
- Modify: `src/app/App.tsx`, `src/app/app.css`

**Interfaces:**
- Consumes: catalog APIs, worker protocol, and scene APIs from Tasks 4–6.
- Produces: typed app state for selected body, camera mode, scale mode, layers, simulation time, and quality level.

- [ ] **Step 1: Write failing UI behavior tests**
  - Assert selecting Earth updates the detail panel and target ID.
  - Assert searching `Saturn` and alias `Titan` yields matching object IDs and selection requests FlyTo.
  - Assert pause, reverse, date input and `1 day/sec` update the worker clock controls.
  - Assert the selected scale mode and visual enhancement warning are visible.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/ui/controls.test.tsx tests/ui/search.test.tsx`
  - Expected: FAIL because controls and state are absent.
- [ ] **Step 3: Implement responsive exhibition UI**
  - Match reference composition: left searchable hierarchy, central scene, right detail card, top toolbar, bottom time rail.
  - Provide keyboard focus, large touch targets, bilingual labels, and visible loading/offline/coverage states.
  - Expose body/orbit/asteroid layer toggles, distance and speed HUD values, and an accurate dynamic catalog count.
- [ ] **Step 4: Verify all control flows**
  - Run: `npm test -- --run tests/ui/controls.test.tsx tests/ui/search.test.tsx && npm run typecheck`
  - Expected: all user-visible state changes and accessible labels pass.

### Task 8: Data import pipeline, attribution, and README

**Files:**
- Create: `scripts/import-mpc.ts`, `tests/data/importers.test.ts`, `docs/data-sources.md`, `README.md`, `public/textures/ATTRIBUTION.md`
- Modify: `package.json`, `src/data/catalog/bodies.json`, `src/data/ephemeris/manifest.json`

**Interfaces:**
- Consumes: documented Horizons importer from Task 5 and catalog schema from Task 4.
- Produces: `npm run import:horizons`, `npm run import:mpc`, `npm run validate:data`; validated, versioned local files and repeatable instructions.

- [ ] **Step 1: Write failing importer and validator tests**
  - Assert a saved MPC API fixture normalizes to km/radians/Julian Date fields with source metadata.
  - Assert invalid epoch, eccentricity, units, or missing provenance prevents bundle publication.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/data/importers.test.ts`
  - Expected: FAIL because importer functions are not present.
- [ ] **Step 3: Implement deterministic import and validation commands**
  - Stream large files, write to a temporary output, validate schema and checksums, then atomically replace the active bundle.
  - Document data source URLs, licensing/attribution requirements, offline use, and how to keep the previous valid bundle.
- [ ] **Step 4: Verify repeatable data workflow**
  - Run: `npm test -- --run tests/data/importers.test.ts && npm run validate:data && npm run build`
  - Expected: fixture import is deterministic; all packaged records validate; app builds offline.

### Task 9: MVP end-to-end acceptance and operation docs

**Files:**
- Create: `tests/e2e/solar-system.spec.ts`, `docs/architecture.md`, `docs/performance.md`, `docs/exhibition-deployment.md`
- Modify: `README.md`, `src/app/App.tsx`

**Interfaces:**
- Consumes: completed MVP app and local data bundle from Tasks 1–8.
- Produces: documented build, deploy and offline workflows; executable acceptance suite.

- [ ] **Step 1: Write failing acceptance scenarios**
  - Cover entering the system, selecting Earth and Moon, changing to one day per second, searching Saturn and Titan, toggling the real-element asteroid belt, outer-system view, scale switching, and changing the simulation date.
- [ ] **Step 2: Run the acceptance suite to find missing behaviors**
  - Run: `npm run test:e2e`
  - Expected: initial failures identify gaps in the integrated UI/scene/data flow.
- [ ] **Step 3: Complete the minimum integration changes and documentation**
  - Document architecture, model/coordinate references, render budget, browser requirements, full-screen operation, offline build, and recovery behavior.
- [ ] **Step 4: Verify MVP release gates**
  - Run: `npm run typecheck && npm test -- --run && npm run test:e2e && npm run build`
  - Expected: all tests pass; the production build runs without network access to astronomy APIs.

### Task 10: Phase 2 major satellites and selected small bodies

**Files:**
- Create: `src/data/catalog/phase2.json`, `tests/data/phase2-catalog.test.ts`, `docs/data-sources.md` updates
- Modify: `scripts/import-mpc.ts`, `src/astronomy/catalog.ts`, `src/ui/CelestialSidebar.tsx`

**Interfaces:**
- Consumes: validated data pipeline and catalog filtering APIs from Tasks 4 and 8.
- Produces: additional moon, dwarf-planet, selected asteroid, and comet records using the same schema and provenance conventions.

- [ ] **Step 1: Write failing tests for satellite relationships and comet elements**
  - Assert parent IDs resolve, catalog categories are filterable, and comet records retain element epoch and eccentricity.
- [ ] **Step 2: Verify tests fail against the phase 1 bundle**
  - Run: `npm test -- --run tests/data/phase2-catalog.test.ts`
- [ ] **Step 3: Add curated Phase 2 records and filters**
  - Include Galilean moons and further Saturnian moons; use valid element sources and propagate through the established worker path.
- [ ] **Step 4: Verify catalog update**
  - Run: `npm test -- --run tests/data/phase2-catalog.test.ts && npm run validate:data && npm run build`

### Task 11: Phase 3 progressive minor-body visualization

**Files:**
- Create: `src/scene/MinorBodyLayer.ts`, `src/workers/catalog.worker.ts`, `tests/workers/catalog.worker.test.ts`, `tests/ui/minor-body-layer.test.ts`
- Modify: `scripts/import-mpc.ts`, `src/workers/protocol.ts`, `src/scene/SolarSystemScene.ts`, `docs/performance.md`

**Interfaces:**
- Consumes: MPC normalized elements, Worker propagation, scene LOD and scale services.
- Produces: chunked catalog loading, view-frustum/distance selection, and batched minor-body buffers without per-object React components.

- [ ] **Step 1: Write failing chunking and determinism tests**
  - Assert chunk import has stable IDs, bounded memory per chunk, and stable visible-set selection for a fixed camera/time.
  - Assert orbit positions come from element propagation and not random placement.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/workers/catalog.worker.test.ts tests/ui/minor-body-layer.test.ts`
- [ ] **Step 3: Implement progressive ingestion and GPU batching**
  - Stream catalog data, calculate positions off the main thread, batch point/sprite rendering, and update only changed buffers.
- [ ] **Step 4: Verify correctness and performance envelope**
  - Run: `npm test -- --run tests/workers/catalog.worker.test.ts tests/ui/minor-body-layer.test.ts && npm run build`
  - Run the documented benchmark at 1k, 10k and 100k catalog records; record frame time, visible count, and Worker time.

### Task 12: Phase 4 stellar background, tours, and auto exhibition

**Files:**
- Create: `src/data/stars/manifest.json`, `src/scene/StellarBackground.ts`, `src/tours/tours.json`, `src/tours/TourController.ts`, `tests/ui/tour-controller.test.ts`
- Modify: `src/ui/SceneToolbar.tsx`, `src/state/store.ts`, `docs/data-sources.md`

**Interfaces:**
- Consumes: existing scene, time state, and versioned data pipeline.
- Produces: optional separately-labelled stellar background and deterministic guided-tour/auto-exhibition controller.

- [ ] **Step 1: Write failing star-layer and tour-state tests**
  - Assert background objects are categorized outside the solar-system body catalog.
  - Assert tour steps select known body IDs and advance/stop deterministically.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm test -- --run tests/ui/tour-controller.test.ts`
- [ ] **Step 3: Implement optional background and tour controls**
  - Use sourced catalog records only; do not describe other stars as solar-system bodies.
- [ ] **Step 4: Verify optional layers**
  - Run: `npm test -- --run tests/ui/tour-controller.test.ts && npm run build`

### Task 13: Production exhibition hardening

**Files:**
- Create: `tests/e2e/offline.spec.ts`, `tests/e2e/recovery.spec.ts`, `scripts/benchmark.ts`
- Modify: `src/scene/SolarSystemScene.ts`, `src/app/App.tsx`, `vite.config.ts`, `docs/performance.md`, `docs/exhibition-deployment.md`

**Interfaces:**
- Consumes: complete data/scene/UI capabilities from Tasks 1–12.
- Produces: installable offline build, quality presets, render capability fallback, worker recovery, and recorded benchmark procedure.

- [ ] **Step 1: Write failing offline, context-loss, and recovery tests**
  - Assert previously bundled catalog and ephemeris work with network disabled.
  - Assert WebGL unavailable/context loss yields an explanatory recoverable UI state.
  - Assert terminated Worker can be recreated without duplicating listeners or stale result application.
- [ ] **Step 2: Run tests to verify failure**
  - Run: `npm run test:e2e -- tests/e2e/offline.spec.ts tests/e2e/recovery.spec.ts`
- [ ] **Step 3: Implement adaptive quality and recoverable lifecycle**
  - Tune pixel ratio, orbit density, star density, postprocessing and minor-body count across Ultra/High/Medium/Performance profiles.
  - Add the development performance HUD for FPS, frame time, draw calls, triangles, visible objects, memory estimate, Worker time, and orbit update time; keep it hidden in production by default.
  - Dispose GPU buffers, materials, textures, event listeners and Workers during teardown/restart.
- [ ] **Step 4: Verify production gates**
  - Run: `npm run typecheck && npm test -- --run && npm run test:e2e && npm run build && npm run benchmark`
  - Expected: offline acceptance passes; benchmark records FPS/frame time and object budget on the target exhibition hardware.

## Execution Notes

- Keep each task independently reviewable and preserve test-first order.
- Obtain actual target exhibition PC specifications before setting final 4K memory and frame-time guarantees.
- Validate current data-source formats when writing importers; treat saved public fixtures as tests, not as a substitute for source validation.
- The document spec is the authority for user-facing behavior; record any scope changes in an updated spec before changing the implementation.
