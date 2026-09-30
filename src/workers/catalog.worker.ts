import type { CelestialObject, Vec3Km } from "../astronomy/types";
import type { WorkerRequest, WorkerResponse } from "./protocol";

export type PositionedCatalogBody = CelestialObject & { positionKm: Vec3Km };

export function chunkCatalog<T extends { id: string }>(records: readonly T[], chunkSize: number): T[][] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError("chunkSize must be a positive integer");
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id, "en"));
  for (let i = 1; i < sorted.length; i += 1) if (sorted[i - 1]!.id === sorted[i]!.id) throw new Error(`Duplicate catalog id: ${sorted[i]!.id}`);
  const chunks: T[][] = [];
  for (let index = 0; index < sorted.length; index += chunkSize) chunks.push(sorted.slice(index, index + chunkSize));
  return chunks;
}

export function selectVisibleMinorBodies<T extends { id: string; type: string; positionKm: Vec3Km }>(records: readonly T[], cameraPositionKm: Vec3Km, options: { maxCount: number; maxDistanceKm: number }): T[] {
  if (!Number.isInteger(options.maxCount) || options.maxCount < 0 || !Number.isFinite(options.maxDistanceKm) || options.maxDistanceKm < 0) throw new RangeError("Visibility limits must be finite and non-negative");
  return records
    .filter((body) => ["asteroid", "comet", "tno", "centaur"].includes(body.type))
    .map((body) => ({ body, distance: Math.hypot(body.positionKm.x - cameraPositionKm.x, body.positionKm.y - cameraPositionKm.y, body.positionKm.z - cameraPositionKm.z) }))
    .filter((entry) => entry.distance <= options.maxDistanceKm)
    .sort((a, b) => a.distance - b.distance || a.body.id.localeCompare(b.body.id, "en"))
    .slice(0, options.maxCount)
    .map((entry) => entry.body);
}

export function createCatalogWorkerHandler(post: (message: WorkerResponse) => void) {
  let records: PositionedCatalogBody[] = [];
  return (request: WorkerRequest & { type: "LOAD_CATALOG_CHUNK" | "FILTER_MINOR_BODIES" }): void => {
    if (request.type === "LOAD_CATALOG_CHUNK") {
      try {
        const incoming = request.records as PositionedCatalogBody[];
        records = chunkCatalog([...records.filter((body) => !incoming.some((next) => next.id === body.id)), ...incoming], request.chunkSize).flat();
        post({ type: "CATALOG_CHUNK", count: incoming.length, totalCount: records.length });
      } catch (error) {
        post({ type: "ERROR", code: "CATALOG_CHUNK_REJECTED", message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    const visible = selectVisibleMinorBodies(records, request.cameraPositionKm, request);
    post({ type: "MINOR_BODY_SET", bodies: visible });
  };
}
