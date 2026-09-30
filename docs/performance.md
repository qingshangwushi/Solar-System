# Performance notes

The bundled catalog currently has 33 objects, with minor bodies rendered through an `InstancedMesh` layer and visibility budget. Keep orbit vertex density bounded as the catalog grows. The render loop performs no API calls and does not recreate React components per body. Three.js GPU resources, camera controls, event handlers, and the animation frame are released by `SolarSystemScene.dispose()`.

The target remains 60 FPS with 30 FPS as the exhibition floor, but this workspace has no target exhibition GPU for a representative measurement. Measure on the deployed machine before claiming that target. Useful counters are `renderer.info.render.calls`, triangles, frame time, Worker request latency, orbit vertex count, and estimated texture memory. Use the Ultra, High, Medium, and Performance presets to reduce pixel ratio and orbit segments; reduce the minor-body visibility budget when frame time remains above 33 ms.

A reproducible CPU propagation microbenchmark is available through `npm run benchmark`. It is not a substitute for measuring the rendered application on exhibition hardware.
