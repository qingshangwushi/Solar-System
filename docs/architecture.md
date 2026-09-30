# Architecture

- **React UI:** accessible catalog search, selection, detail panel, clock, scale and layer controls.
- **Astronomy Worker:** validates its catalog, handles search/time/position messages, interpolates local TDB vectors and explicitly labels Kepler fallback.
- **Astronomy modules:** Float64 kilometre vectors, Julian Dates, time-scale conversion, frame transforms, and elliptic/hyperbolic Kepler solvers.
- **Three.js scene:** imperative renderer, scene graph, orbit lines, camera controls, scale mapping and deterministic disposal. React passes positions rather than owning one component per body.
- **Data pipeline:** checked-in JSON catalog and optional local ephemeris bundles. Import scripts contact public sources only when run manually; the browser does not call them.

The scene converts ecliptic vectors to Y-up display coordinates at the renderer boundary. Simulation input and ephemeris timestamps are kept distinct: the UI shows UTC; vector queries use TDB JD.
