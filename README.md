# Solar System Atlas

A local-first 3D solar-system guide built with React, TypeScript, Three.js, a Web Worker, and Vite. Search the curated catalog, select a body, inspect its physical and orbital facts, adjust simulation time, and choose Scientific, Visible, or Exhibition scale. Non-scientific scales disclose their visual changes in the interface.

## Run

```sh
npm ci
npm run dev
```

The app starts with its checked-in catalog and offline JPL Horizons vectors for 32 bodies from 2026-09-29 through 2027-09-30. It linearly interpolates between daily samples and falls back to explicitly labelled Kepler positions outside this interval. The stored 2,000,000 km interpolation threshold is an operator-selected limit, not an independently measured accuracy guarantee; see [data source and refresh instructions](docs/data-sources.md).

## Checks and build

```sh
npm test -- --run
npm run typecheck
npm run validate:data
npm run build
npm run test:e2e
```

The Playwright suite requires an installed Chromium browser. Production output is in `dist/` and should be served over HTTP(S). Import commands are opt-in network operations; the browser render loop does not contact Horizons or MPC.

## Science and display notes

- Internal position units are km, mass kg, angles rad, and ephemeris timestamps JD TDB.
- UI dates are UTC. Coordinate and time conversion details are in `docs/astronomical-model.md` and `docs/coordinate-system.md`.
- Scientific Scale preserves size and distance. Visible Scale enlarges body radii. Exhibition Scale compresses distances non-linearly.
- Bodies use local flat display colors, not measured surface maps. Texture attribution requirements are in `public/textures/ATTRIBUTION.md`.
- See `docs/architecture.md`, `docs/performance.md`, and `docs/exhibition-deployment.md` for implementation and operation.
- See [the requirements audit](docs/requirements-audit.md) for the verified scope and remaining Phase 3–5 work.
