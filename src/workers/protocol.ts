import type { CelestialObject, SimulationTime, Vec3Km } from "../astronomy/types";
import type { EphemerisDataset } from "../astronomy/ephemeris";

export type WorkerRequest =
  | { type: "LOAD_CATALOG_CHUNK"; records: unknown[]; chunkSize: number }
  | { type: "FILTER_MINOR_BODIES"; cameraPositionKm: Vec3Km; maxCount: number; maxDistanceKm: number }
  | { type: "INIT"; catalog: unknown; datasets: EphemerisDataset[] }
  | { type: "SET_TIME"; time: SimulationTime }
  | { type: "SEARCH"; requestId: number; query: string }
  | { type: "GET_POSITION"; requestId: number; bodyId: string; jdTdb: number; allowKeplerFallback: boolean };

export type WorkerResponse =
  | { type: "CATALOG_CHUNK"; count: number; totalCount: number }
  | { type: "MINOR_BODY_SET"; bodies: unknown[] }
  | { type: "READY"; bodyCount: number }
  | { type: "TIME_UPDATED"; time: SimulationTime; frame: "ECLIPJ2000"; timeScale: "TDB" }
  | { type: "SEARCH_RESULTS"; requestId: number; results: CelestialObject[] }
  | { type: "POSITION"; requestId: number; bodyId: string; position: Vec3Km; mode: "ephemeris" | "kepler-fallback"; frame: "ECLIPJ2000" | "ICRF"; timeScale: "TDB"; coverage?: { startJD: number; stopJD: number } }
  | { type: "ERROR"; requestId?: number; code: string; message: string; coverage?: { startJD: number; stopJD: number } };
