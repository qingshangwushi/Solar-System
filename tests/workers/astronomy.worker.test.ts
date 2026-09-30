import { describe, expect, it } from "vitest";
import { createAstronomyWorkerHandler } from "../../src/workers/astronomy.worker";
import type { WorkerRequest, WorkerResponse } from "../../src/workers/protocol";
import rawCatalog from "../../src/data/catalog/bodies.json";
import phase2Catalog from "../../src/data/catalog/phase2.json";
import earthTrack from "../../src/data/ephemeris/earth.json";
import europaTrack from "../../src/data/ephemeris/europa.json";
import type { EphemerisDataset } from "../../src/astronomy/ephemeris";

function createHarness() {
  const messages: WorkerResponse[] = [];
  const handler = createAstronomyWorkerHandler((message) => messages.push(message));
  return { handler, messages };
}

describe("astronomy worker protocol", () => {
  it("initializes from a validated catalog and searches aliases", async () => {
    const { handler, messages } = createHarness();
    const catalog = [{ id: "earth", name: "Earth", aliases: ["Terra"], type: "planet", source: "https://example.test/source", sourceRevision: "1", sourceUpdatedAt: "2026-01-01", units: { distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" }, massKg: 5.972e24 }];
    await handler({ type: "INIT", catalog: { bodies: catalog }, datasets: [] });
    await handler({ type: "SEARCH", requestId: 1, query: "terra" });
    expect(messages.at(-1)).toMatchObject({ type: "SEARCH_RESULTS", requestId: 1, results: [{ id: "earth" }] });
  });

  it("answers time requests consistently and explicitly identifies Kepler fallback", async () => {
    const { handler, messages } = createHarness();
    const catalog = [{ id: "sun", name: "Sun", type: "star", source: "https://example.test/source", sourceRevision: "1", sourceUpdatedAt: "2026-01-01", units: { distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" }, massKg: 1.98847e30 }, { id: "earth", name: "Earth", type: "planet", parentId: "sun", source: "https://example.test/source", sourceRevision: "1", sourceUpdatedAt: "2026-01-01", units: { distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" }, orbit: { epochJD: 2451545, semiMajorAxisKm: 149597870.7, eccentricity: 0, inclinationRad: 0, longitudeAscendingNodeRad: 0, argumentOfPeriapsisRad: 0, meanAnomalyRad: 0, elementFrame: "ECLIPJ2000" } }];
    await handler({ type: "INIT", catalog: { bodies: catalog }, datasets: [] });
    const request: WorkerRequest = { type: "GET_POSITION", requestId: 2, bodyId: "earth", jdTdb: 2451545, allowKeplerFallback: true };
    await handler(request);
    expect(messages.at(-1)).toMatchObject({ type: "POSITION", requestId: 2, bodyId: "earth", mode: "kepler-fallback", frame: "ECLIPJ2000", timeScale: "TDB" });
    const fallback = messages.at(-1);
    if (fallback?.type === "POSITION") expect(Object.values(fallback.position).every(Number.isFinite)).toBe(true);
  });

  it("does not hide a missing parent mass behind a Kepler result", async () => {
    const { handler, messages } = createHarness();
    const catalog = [{ id: "sun", name: "Sun", type: "star", source: "https://example.test/source", sourceRevision: "1", sourceUpdatedAt: "2026-01-01", units: { distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" } }, { id: "earth", name: "Earth", type: "planet", parentId: "sun", source: "https://example.test/source", sourceRevision: "1", sourceUpdatedAt: "2026-01-01", units: { distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" }, orbit: { epochJD: 2451545, semiMajorAxisKm: 1, eccentricity: 0, inclinationRad: 0, longitudeAscendingNodeRad: 0, argumentOfPeriapsisRad: 0, meanAnomalyRad: 0, elementFrame: "ECLIPJ2000" } }];
    await handler({ type: "INIT", catalog: { bodies: catalog }, datasets: [] });
    await handler({ type: "GET_POSITION", requestId: 3, bodyId: "earth", jdTdb: 2451545, allowKeplerFallback: true });
    expect(messages.at(-1)).toMatchObject({ type: "ERROR", requestId: 3, code: "MISSING_PARENT_MASS" });
  });

  it("returns ephemeris coverage errors unless an explicit fallback is requested", async () => {
    const { handler, messages } = createHarness();
    const catalog = [{ id: "sun", name: "Sun", type: "star", source: "https://example.test/source", sourceRevision: "1", sourceUpdatedAt: "2026-01-01", units: { distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" }, massKg: 1.98847e30 }, { id: "earth", name: "Earth", type: "planet", parentId: "sun", source: "https://example.test/source", sourceRevision: "1", sourceUpdatedAt: "2026-01-01", units: { distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" }, orbit: { epochJD: 2451545, semiMajorAxisKm: 149597870.7, eccentricity: 0, inclinationRad: 0, longitudeAscendingNodeRad: 0, argumentOfPeriapsisRad: 0, meanAnomalyRad: 0, elementFrame: "ECLIPJ2000" } }];
    const datasets = [{ bodyId: "earth", centerId: "sun", frame: "ECLIPJ2000" as const, timeScale: "TDB" as const, source: "test", interpolationToleranceKm: 1, samples: [{ jdTdb: 2451545, positionKm: { x: 1, y: 0, z: 0 } }, { jdTdb: 2451546, positionKm: { x: 2, y: 0, z: 0 } }] }];
    await handler({ type: "INIT", catalog: { bodies: catalog }, datasets });
    await handler({ type: "GET_POSITION", requestId: 4, bodyId: "earth", jdTdb: 2451547, allowKeplerFallback: false });
    expect(messages.at(-1)).toMatchObject({ type: "ERROR", requestId: 4, code: "EPHEMERIS_COVERAGE", coverage: { startJD: 2451545, stopJD: 2451546 } });
    await handler({ type: "GET_POSITION", requestId: 5, bodyId: "earth", jdTdb: 2451547, allowKeplerFallback: true });
    expect(messages.at(-1)).toMatchObject({ type: "POSITION", requestId: 5, mode: "kepler-fallback", coverage: { startJD: 2451545, stopJD: 2451546 } });
  });

  it("uses bundled Horizons tracks, including a body without catalog orbital elements", async () => {
    const { handler, messages } = createHarness();
    const datasets = [earthTrack, europaTrack] as unknown as EphemerisDataset[];
    await handler({ type: "INIT", catalog: { ...rawCatalog, bodies: [...rawCatalog.bodies, ...phase2Catalog.bodies] }, datasets });
    const jdTdb = earthTrack.samples[100]!.jdTdb;
    await handler({ type: "GET_POSITION", requestId: 6, bodyId: "earth", jdTdb, allowKeplerFallback: false });
    expect(messages.at(-1)).toMatchObject({ type: "POSITION", requestId: 6, bodyId: "earth", position: earthTrack.samples[100]!.positionKm, mode: "ephemeris", frame: "ECLIPJ2000", timeScale: "TDB" });
    await handler({ type: "GET_POSITION", requestId: 7, bodyId: "europa", jdTdb, allowKeplerFallback: false });
    expect(messages.at(-1)).toMatchObject({ type: "POSITION", requestId: 7, bodyId: "europa", mode: "ephemeris" });
  });

});
