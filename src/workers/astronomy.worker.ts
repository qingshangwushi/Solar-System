import { searchCatalog, loadCatalog } from "../astronomy/catalog";
import { EphemerisCoverageError, getEphemerisPosition, type EphemerisDataset } from "../astronomy/ephemeris";
import { propagateKepler } from "../astronomy/kepler";
import type { CelestialObject, SimulationTime, Vec3Km } from "../astronomy/types";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const G_KM3_KG_S2 = 6.67430e-20;

export function createAstronomyWorkerHandler(post: (message: WorkerResponse) => void) {
  let catalog: CelestialObject[] = [];
  let datasets = new Map<string, EphemerisDataset>();

  function resolvePosition(body: CelestialObject, jdTdb: number, allowFallback: boolean, seen: Set<string>): { position: Vec3Km; mode: "ephemeris" | "kepler-fallback"; frame: "ECLIPJ2000" | "ICRF"; coverage?: { startJD: number; stopJD: number } } {
    if (seen.has(body.id)) throw new Error(`Parent cycle detected at ${body.id}`);
    seen.add(body.id);
    const dataset = datasets.get(body.id);
    let coverage: { startJD: number; stopJD: number } | undefined;
    if (dataset) {
      try {
        return { position: getEphemerisPosition(dataset, jdTdb), mode: "ephemeris", frame: dataset.frame };
      } catch (error) {
        if (!(error instanceof EphemerisCoverageError)) throw error;
        coverage = { startJD: error.startJD, stopJD: error.stopJD };
        if (!allowFallback) throw error;
      }
    }
    if (!allowFallback) throw new RangeError(`${body.id} has no ephemeris dataset available at this date`);
    if (!body.orbit) throw new RangeError(`${body.id} has no orbital elements for Kepler fallback`);
    if (!body.parentId) throw new Error(`MISSING_PARENT_MASS: ${body.id} has no parent body`);
    const parent = catalog.find((candidate) => candidate.id === body.parentId);
    if (!parent || !parent.massKg || parent.massKg <= 0) throw new Error(`MISSING_PARENT_MASS: ${body.id} parent ${body.parentId} has no mass`);
    const relative = propagateKepler(body.orbit, jdTdb, G_KM3_KG_S2 * parent.massKg);
    if (parent.id === "sun") return { position: relative, mode: "kepler-fallback", frame: body.orbit.elementFrame, coverage };
    const parentPosition = resolvePosition(parent, jdTdb, allowFallback, seen);
    return {
      position: { x: parentPosition.position.x + relative.x, y: parentPosition.position.y + relative.y, z: parentPosition.position.z + relative.z },
      mode: "kepler-fallback",
      frame: body.orbit.elementFrame,
      coverage,
    };
  }

  return async (request: WorkerRequest): Promise<void> => {
    try {
      switch (request.type) {
        case "INIT":
          catalog = loadCatalog(request.catalog);
          datasets = new Map(request.datasets.map((dataset) => [dataset.bodyId, dataset]));
          post({ type: "READY", bodyCount: catalog.length });
          return;
        case "SET_TIME":
          post({ type: "TIME_UPDATED", time: request.time, frame: "ECLIPJ2000", timeScale: "TDB" });
          return;
        case "SEARCH":
          post({ type: "SEARCH_RESULTS", requestId: request.requestId, results: searchCatalog(catalog, request.query) });
          return;
        case "GET_POSITION": {
          const body = catalog.find((candidate) => candidate.id === request.bodyId);
          if (!body) throw new Error(`Unknown body id: ${request.bodyId}`);
          const resolved = resolvePosition(body, request.jdTdb, request.allowKeplerFallback, new Set());
          const bodyDataset = datasets.get(body.id);
          post({ type: "POSITION", requestId: request.requestId, bodyId: body.id, position: resolved.position, mode: resolved.mode, frame: resolved.frame, timeScale: "TDB", coverage: resolved.coverage ?? (bodyDataset ? { startJD: bodyDataset.samples[0]!.jdTdb, stopJD: bodyDataset.samples.at(-1)!.jdTdb } : undefined) });
          return;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const coverage = error instanceof EphemerisCoverageError ? { startJD: error.startJD, stopJD: error.stopJD } : undefined;
      const code = message.startsWith("MISSING_PARENT_MASS:") ? "MISSING_PARENT_MASS" : error instanceof EphemerisCoverageError ? "EPHEMERIS_COVERAGE" : "REQUEST_FAILED";
      post({ type: "ERROR", requestId: "requestId" in request ? request.requestId : undefined, code, message, coverage });
    }
  };
}

const workerGlobal = globalThis as typeof globalThis & {
  postMessage?: (message: WorkerResponse) => void;
  addEventListener?: (type: string, listener: (event: MessageEvent<WorkerRequest>) => void) => void;
};
if (typeof workerGlobal.postMessage === "function" && typeof workerGlobal.addEventListener === "function") {
  const handle = createAstronomyWorkerHandler((message) => workerGlobal.postMessage?.(message));
  workerGlobal.addEventListener("message", (event) => void handle(event.data));
}
