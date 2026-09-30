import { describe, expect, it } from "vitest";
import { loadCatalog, searchCatalog } from "../../src/astronomy/catalog";
import baseData from "../../src/data/catalog/bodies.json";
import phase2Data from "../../src/data/catalog/phase2.json";

describe("Phase 2 catalog extension", () => {
  const catalog = loadCatalog({ bodies: [...baseData.bodies, ...phase2Data.bodies] });

  it("adds major satellites with valid parent relationships", () => {
    const ids = new Set(catalog.map((body) => body.id));
    for (const id of ["io", "europa", "ganymede", "callisto", "enceladus", "rhea", "iapetus", "triton"]) expect(ids.has(id)).toBe(true);
    for (const body of catalog.filter((item) => ["io", "europa", "ganymede", "callisto"].includes(item.id))) expect(body.parentId).toBe("jupiter");
  });

  it("filters body categories and retains comet epoch and eccentricity", () => {
    expect(catalog.filter((body) => body.type === "moon").length).toBeGreaterThan(8);
    const comet = catalog.find((body) => body.id === "67p-churyumov-gerasimenko");
    expect(comet?.type).toBe("comet");
    expect(comet?.orbit?.epochJD).toBeGreaterThan(2_400_000);
    expect(comet?.orbit?.eccentricity).toBeGreaterThan(0.6);
    expect(searchCatalog(catalog, "Halley").map((body) => body.id)).toContain("1p-halley");
  });
});
