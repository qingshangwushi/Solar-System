# SDD ledger — plan: docs/superpowers/plans/2026-09-30-solar-system.md

## Setup

- Worktree check: no Git repository or native worktree tool is available; the sandbox denied Git metadata writes during setup. Following the worktree skill's sandbox fallback, implementation continues in the current workspace.
- Pre-flight: Task 2 produces `OrbitalElements`; Task 3 consumes it. **Ruling:** require `muKm3S2` explicitly in `propagateKepler` and keep astronomy vectors independent of Three.js — orbital elements do not contain the central-body mass, and scientific math should not depend on the renderer. Cost if wrong: one extra argument or vector conversion at the scene boundary.
- Pre-flight: Tasks 4–5 produce catalog and time APIs; Task 6 consumes body positions; Task 7 consumes catalog, worker, and scene APIs; Task 8 consumes catalog and Horizons interfaces; Task 9 verifies Tasks 1–8. Interfaces align after the ruling above.
- Ruling: Git commits and the git-backed SDD task scripts cannot run because this workspace has no writable Git metadata. Use this visible ledger and direct test commands in place; project source files remain in the requested workspace. Cost if wrong: work lacks commit checkpoints and will need a repository initialized elsewhere before standard branch review.
- Task 1: Ruling: TypeScript 7.0's native compiler panics while resolving `/proc/self/exe` in this sandbox, so pin TypeScript 5.9.3 (JavaScript compiler) for reliable checks. Cost if wrong: a newer compiler could later be used in a non-restricted runtime.

## Tasks

- Task 1: complete — smoke test RED (missing App behavior) → GREEN; `npm test -- --run tests/ui/app.test.tsx`, `npm run typecheck`, `npm run build` all passed. Git commit unavailable per setup ruling.
- Task 2: complete — `time.test.ts` and `units.test.ts` RED → GREEN; full unit suite 18/18, typecheck passed. UTC/TAI data comes from IERS UTC-TAI history and IERS Bulletin C 72.
- Task 3: complete — coordinate and Kepler tests RED → GREEN; full unit suite 18/18, typecheck, production build passed. Covers elliptic, eccentric, hyperbolic propagation and J2000 frame/scene transforms.
- Task 4: complete — validated the 33-body merged catalog, stable alias search, required source revision/date/units, epoch/frame checks, and `validate:data`.
- Task 5: partial — vector interpolation, coverage errors, Worker protocol, explicit parent-mass Kepler fallback, Horizons importer, and 32 bundled JPL Horizons datasets covering 2026-09-29 through 2027-09-30 at daily cadence. Independent interpolation-error validation and longer coverage remain outstanding.
- Task 6: partial — imperative Three.js scene, floating camera origin, elliptical orbit lines, rotating bodies, scales, camera controls, instantiated minor bodies, disposal, and quality presets are implemented. Surface texture rendering, most planetary rings, LOD, solar post-processing, label collision handling, and exhibition GPU validation are not implemented.
- Task 7: partial — catalog, search, detail panels, clock, scales, layers, tours, and scene state are implemented. Full localization, scientific-mode coordinate/velocity readout, and the design's landing flow are not implemented.
- Task 8: partial — Horizons importer and a normalized MPC snapshot importer exist. The full MPCORB/API ingestion, comet/satellite refresh pipeline, versioned catalog build and atomic multi-dataset publication remain outstanding.
- Task 9: implemented — acceptance test and operation docs added. **E2E execution blocked:** Playwright Chromium is not installed in this environment.
- Task 10: partial — selected Galilean and Saturnian satellites, Triton, Eris, 67P, and Halley are included; this is not a complete major-satellite or small-body catalogue.
- Task 11: partial — catalog worker helpers and an instanced renderer exist, but the application does not yet connect the catalog worker to a complete MPC catalogue or perform view-frustum/importance LOD selection. The 1k/10k/100k benchmark measures CPU Kepler propagation only.
- Task 12: partial — a five-star seed layer and three guided tours exist. A sourced Gaia catalogue, full scientific mode, and unattended auto-demo are still missing.
- Task 13: partial — local service-worker caching, worker/renderer recovery controls, and quality presets exist. Browser E2E, touch/4K, long-duration stability and target-GPU FPS have not been verified; no live performance HUD is implemented.

## Final review

- Final verification: after the audit fixes, `npm test -- --run` passed (20 files / 57 tests), `npm run validate:data` passed (33 catalog bodies, 32 ephemeris datasets / 11,744 samples), `npm run typecheck` passed, `npm run build` passed with the Three.js main-chunk-size warning, and `npm run benchmark` completed (CPU-only). `npm run test:e2e` could not launch because the Playwright Chromium executable is not installed. The endpoint was available; all 32 moving bodies have 367 daily vectors each. Linear interpolation's 2,000,000 km threshold is operator-selected and not independently verified. The actual prompt and design image were used to align the initial interface. Git remains unavailable per the setup ruling. See `docs/requirements-audit.md` for scope gaps: this is not a complete Phase 3–5 implementation or exhibition certification.
