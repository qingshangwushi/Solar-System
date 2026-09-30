# Data sources and refresh workflow

## Current bundled catalog

The merged catalog in `src/data/catalog/bodies.json` and `src/data/catalog/phase2.json` currently contains 33 identified objects across the star, planet, moon, dwarf planet, asteroid, comet, and trans-Neptunian categories. The validator computes counts from the files, so counts are not maintained as fixed application constants. Physical properties link to NASA/NSSDC fact sheets, and orbit seeds cite their source. Values carry source revision, retrieval date, units, epoch, and reference frame alongside each record.

The ephemeris bundle contains heliocentric JPL Horizons vectors for the 32 moving catalog objects from 2026-09-29 through 2027-09-30, sampled daily. The Sun is the origin and needs no separate vector dataset. The app interpolates linearly between samples and uses explicitly labelled Kepler positions outside coverage. The manifest's 2,000,000 km tolerance value is an operator-selected threshold; a separate interpolation-error validation has not been performed. Some rounded catalog elements remain as the fallback model and must not be treated as a precision ephemeris.

## JPL Horizons vectors

Use the JPL Horizons API documentation at <https://ssd.jpl.nasa.gov/horizons/manual.html> and API at <https://ssd.jpl.nasa.gov/api/horizons.api>. The importer stores heliocentric vectors in km in ECLIPJ2000 and tags the epoch as TDB. Download bundles before exhibition, review the queried target, center, date range, step, and interpolation tolerance, and validate the bundle before deployment.

Example, importing Earth daily around a selected period:

```sh
npm run import:horizons -- --body-id earth --body 399 --center 500@10 --start 2026-01-01 --stop 2027-01-01 --step 1d --tolerance-km 2000000
npm run validate:data
```

The interpolation tolerance is supplied by the operator and recorded with the dataset. It is an acceptance bound, not a value the importer has independently proven. Keep a dated backup of the previous validated bundle before replacing data. Horizons requests run only in the importer, never in the render loop.

## Minor Planet Center

The MPC publishes the MPCORB orbit collection at <https://minorplanetcenter.net/iau/MPCORB/>. `scripts/import-mpc.ts` accepts a saved JSON snapshot normalized into the shape demonstrated by `tests/fixtures/mpc-orbits.json`. It converts AU to km and degrees to radians, requires a TDB Julian Date epoch and source revision, validates the combined catalog, writes to a temporary file, and atomically renames only after validation succeeds.

```sh
npm run import:mpc -- --input saved-mpc-response.json --output src/data/catalog/phase2.json
npm run validate:data
```

The importer does not silently infer comet perihelion epochs or hyperbolic elements from asteroid fields; comet ingestion needs its own mapping and tests. Review the MPC terms and attribution before redistributing a refreshed bulk bundle.

## Textures and imagery

No measured surface maps are bundled in this version. Scene spheres use simple display colors and shading, not NASA or USGS imagery. Do not add remote texture URLs to the render path. `public/textures/ATTRIBUTION.md` is the required place to record source, license, retrieval date, and any changes before adding raster maps.
