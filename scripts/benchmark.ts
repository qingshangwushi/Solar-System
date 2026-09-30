import { performance } from "node:perf_hooks";
import { propagateKepler } from "../src/astronomy/kepler.ts";
import type { OrbitalElements } from "../src/astronomy/types.ts";

const elements: OrbitalElements = {
  epochJD: 2_451_545,
  semiMajorAxisKm: 413_700_000,
  eccentricity: 0.0758,
  inclinationRad: 0.1849,
  longitudeAscendingNodeRad: 1.4017,
  argumentOfPeriapsisRad: 1.2844,
  meanAnomalyRad: 1.6753,
  elementFrame: "ECLIPJ2000",
};
for (const count of [1_000, 10_000, 100_000]) {
  const start = performance.now();
  for (let i = 0; i < count; i += 1) propagateKepler({ ...elements, meanAnomalyRad: elements.meanAnomalyRad + i * 1e-5 }, 2_461_000.5, 1.32712440018e11);
  const elapsedMs = performance.now() - start;
  console.log(`${count} Kepler propagations: ${elapsedMs.toFixed(2)} ms (${(count / (elapsedMs / 1000)).toFixed(0)} positions/s)`);
}
console.log("CPU propagation only; render FPS must be measured on the exhibition GPU.");
