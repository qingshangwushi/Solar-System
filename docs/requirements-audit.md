# Requirements audit

**Reviewed:** 2026-09-30  
**References:** `upload/master_prompt.md`, `upload/design_prompt.png`, and `docs/superpowers/specs/2026-09-30-solar-system-design.md`

## Verdict

The repository is a runnable, tested MVP with selected later-phase features. It is **not a complete implementation of the full prompt or the production/exhibition acceptance criteria**. The design itself stages the work across five phases; several Phase 3–5 requirements remain absent or unverified. Do not describe this build as a complete solar-system catalogue, a scientifically validated real-time simulator, or a commissioned exhibition system.

## Requirement status

| Area | Status | Evidence and remaining work |
| --- | --- | --- |
| Core app and astronomy foundation | Implemented with limits | React/TypeScript, Three.js, a Worker, UTC/TDB clock, Kepler propagation, frame conversion, selectable scales, local Horizons samples, search, details and camera modes exist. Parabolic propagation and perturbation models are absent. |
| MVP interaction | Partial | Search, selection, date/time, playback, scale controls, layers and guided tours exist. The designed launch/intro flow, full cinematic Fly-To, and browser-verified acceptance journeys are missing. |
| Catalogue coverage | Partial | The checked-in merged catalogue has 33 curated records. It does not represent the known small-body or satellite catalogue; Phobos, Deimos, many major moons, Trojan populations and bulk NEO/TNO records are absent. |
| Ephemerides | Partial | 32 moving records have daily JPL Horizons vectors for 2026-09-29 through 2027-09-30. Dates outside coverage use the explicitly labelled Kepler fallback. The 2,000,000 km interpolation threshold is not backed by midpoint error measurements; longer coverage and independent validation are outstanding. |
| Data update pipeline | Partial | Per-target Horizons import and a normalized saved-MPC-JSON importer exist. The audit added `validate:data` checks for ephemeris manifest provenance, safe paths, body IDs, frame/time scale, ordered finite samples and coverage consistency. There is no direct full MPCORB/API ingestion, comet/satellite refresh pipeline, reproducible dated catalogue build, or atomic publication/rollback of the complete dataset set. |
| Rendering fidelity | Partial | The scene has body spheres, simple Sun glow, Saturn rings, orbit lines, labels, star points and instanced minor bodies. NASA/USGS surface textures, Earth clouds/night lights/atmosphere, other planet rings, solar corona/bloom, comet tails, progressive texture loading, and view-size LOD are absent. |
| Large-catalogue rendering | Not complete | The instanced renderer and catalog-worker helper exist, but the app does not connect a full catalogue to that worker or select visible objects by view frustum/importance. The checked-in minor-body set is small; no 100k–500k render or memory test has been run. |
| Phase 4 exhibition features | Partial | Three tours and a five-entry nearby-star seed are present. An unattended auto-demo, complete scientific mode (coordinates, velocity, current data source/coverage readout), full Gaia-derived star dataset, voice/video stops, and a real language selector are absent. |
| Localization and accessibility | Partial | Some labels combine English and Chinese, and controls have accessible names. There is no centralized `zh-CN`/`en-US` localization, keyboard-only interaction audit, reduced-motion handling, adjustable type scale, or verified touch-target audit. |
| Exhibition and offline readiness | Partial | A service worker caches same-origin resources after use, and recovery/quality controls exist. Playwright browser tests could not run because Chromium is unavailable. No target-device 4K/touch test, 60/30 FPS measurement, live performance HUD, memory-leak soak test, or unattended-operation test has been completed. |
| Packaging, licensing and operations | Partial | Source, docs, tests and a build are present. A root software license is not declared; texture attribution is a placeholder policy because no surface imagery is bundled. |

## Audit fixes made

- Body selection now fires after a click and ignores drag gestures; instanced minor-body hits resolve to their catalogue IDs. Raycasts refresh camera/scene world matrices before checking intersections.
- Overview camera framing now derives from the displayed orbital extent instead of a fixed near-Sun distance.
- `npm run validate:data` now validates the vector files and their manifest metadata, not just the body catalog.
- The astronomy-model documentation no longer claims the interpolation threshold was scientifically validated.

These fixes improve correctness but do not close the phase and validation gaps above.

## Evidence needed before calling the production design complete

1. A defined, versioned catalogue scope and refresh pipeline, with provenance and licensing for every source.
2. A validated ephemeris policy: required date range, sampling cadence per object, frame/time-scale checks, and measured interpolation position/angular errors against Horizons reference points.
3. Completion of missing Phase 3–5 behavior, especially full small-body ingestion/LOD, scientific mode, auto-demo, and localization.
4. Browser E2E acceptance on Test 01–10, plus touch, keyboard, offline, recovery, 4K and long-run tests on representative hardware.
5. Measured frame time, draw calls, memory and Worker latency on the actual exhibition machine, along with a declared software/data licensing policy.
