# Exhibition deployment and recovery

1. Run `npm ci`, `npm run validate:data`, `npm test -- --run`, and `npm run build` on the build machine.
2. Serve the generated `dist/` directory over HTTP(S); browsers do not enable module Workers or service workers from `file://` URLs.
3. Keep the previous validated catalog and ephemeris bundle as a dated backup. Import data outside show hours, validate it, then deploy the complete new bundle atomically.
4. Open the app once while connected so the service worker can cache the shell and assets; then confirm a reload works with the network disabled. The app does not need astronomy API access. The bundled Horizons vectors cover 2026-09-29 through 2027-09-30; outside that interval, the UI and scene use the labelled local orbital-element fallback. Out-of-range vector requests expose their coverage interval.
5. If WebGL cannot initialize or the context is lost, search, details, date, and simulation controls remain available. Reload the page to create a fresh renderer after a context-loss event.
6. Choose a quality preset (Ultra, High, Medium, Performance) to trade pixel ratio and orbit detail for frame time.
7. For unattended operation, run the site from a local web server, disable sleep, lock display resolution and power mode, and check browser console and frame-time counters before opening to visitors.

Use a keyboard and a touch display during commissioning. Search and form controls have accessible labels; mobile layout stacks catalog, scene, and details vertically.
