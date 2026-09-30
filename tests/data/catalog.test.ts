import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog, searchCatalog, validateCatalog } from "../../src/astronomy/catalog";

const rawCatalog = JSON.parse(await readFile(resolve(process.cwd(), "src/data/catalog/bodies.json"), "utf8")) as unknown;

describe("MVP celestial catalog", () => {
  it("contains the required bodies and identified main-belt asteroids", () => {
    const catalog = loadCatalog(rawCatalog);
    const ids = new Set(catalog.map((body) => body.id));
    for (const id of ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "titan", "uranus", "neptune", "pluto", "ceres", "pallas", "vesta", "hygiea"]) {
      expect(ids.has(id), `missing ${id}`).toBe(true);
    }
    expect(catalog.find((body) => body.id === "ceres")?.orbit?.eccentricity).toBeGreaterThan(0);
    expect(catalog.filter((body) => body.type === "asteroid").every((body) => body.orbit && body.source)).toBe(true);
  });

  it("validates unique IDs, provenance, finite physical values, and orbit metadata", () => {
    const catalog = loadCatalog(rawCatalog);
    expect(validateCatalog(catalog)).toMatchObject({ valid: true, errors: [] });
    for (const body of catalog) {
      expect(body.source.length).toBeGreaterThan(0);
      expect(body.radiusKm === undefined || Number.isFinite(body.radiusKm)).toBe(true);
      expect(body.massKg === undefined || Number.isFinite(body.massKg)).toBe(true);
      if (body.orbit) {
        expect(Number.isFinite(body.orbit.epochJD)).toBe(true);
        expect(["ECLIPJ2000", "ICRF"]).toContain(body.orbit.elementFrame);
      }
    }
  });

  it("searches aliases case-insensitively and returns duplicate names stably", () => {
    const catalog = loadCatalog(rawCatalog);
    expect(searchCatalog(catalog, "sol").map((body) => body.id)).toEqual(["sun"]);
    expect(searchCatalog(catalog, "Luna").map((body) => body.id)).toEqual(["moon"]);
    const duplicates = searchCatalog(catalog, "Europa").map((body) => body.id);
    expect(duplicates).toEqual(["europa", "europa-asteroid"]);
    expect(searchCatalog(catalog, "tItAn").map((body) => body.id)).toEqual(["titan"]);
  });

  it("reports field-specific errors for malformed input", () => {
    expect(() => loadCatalog({ bodies: [{ id: "", name: "Broken", type: "planet", source: "", radiusKm: -1 }] })).toThrow(/bodies\[0\].*id|bodies\[0\].*radiusKm/i);
    const result = validateCatalog([{ id: "x", name: "X", type: "planet", source: "", massKg: Number.NaN } as never]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/source|massKg/i);
  });
});
