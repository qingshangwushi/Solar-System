import { describe, expect, it } from "vitest";
import { chunkCatalog, selectVisibleMinorBodies } from "../../src/workers/catalog.worker";

const bodies = Array.from({ length: 7 }, (_, index) => ({ id: `mp-${String(index).padStart(2, "0")}`, type: "asteroid" as const, name: `Asteroid ${index}`, source: "https://example.test", positionKm: { x: index * 100, y: 0, z: 0 } }));

describe("progressive minor-body catalog", () => {
  it("chunks by stable ID order with a strict maximum chunk size", () => {
    const chunks = chunkCatalog([...bodies].reverse(), 3);
    expect(chunks.map((chunk) => chunk.length)).toEqual([3, 3, 1]);
    expect(chunks.flat().map((body) => body.id)).toEqual(bodies.map((body) => body.id));
  });

  it("selects nearest real catalog positions deterministically within range and budget", () => {
    const selected = selectVisibleMinorBodies(bodies, { x: 190, y: 0, z: 0 }, { maxCount: 3, maxDistanceKm: 400 });
    expect(selected.map((body) => body.id)).toEqual(["mp-02", "mp-01", "mp-03"]);
  });
});
