import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeMpcOrbit, publishMpcBundle } from "../../scripts/import-mpc";
import fixture from "../fixtures/mpc-orbits.json";
import rawCatalog from "../../src/data/catalog/bodies.json";
import type { CelestialObject } from "../../src/astronomy/types";
const baseCatalog = rawCatalog.bodies as CelestialObject[];

const metadata = { source: fixture.source, revision: fixture.revision, updatedAt: fixture.updatedAt };

describe("MPC orbit import", () => {
  it("normalizes saved orbital records to catalog km, radians and TDB JD", () => {
    const ceres = normalizeMpcOrbit(fixture.records[0]!, metadata);
    expect(ceres.id).toBe("mp-1");
    expect(ceres.type).toBe("asteroid");
    expect(ceres.orbit).toMatchObject({ epochJD: 2461000.5, eccentricity: 0.0758, elementFrame: "ECLIPJ2000" });
    expect(ceres.orbit!.semiMajorAxisKm).toBeCloseTo(2.7675 * 149_597_870.7, 3);
    expect(ceres.orbit!.inclinationRad).toBeCloseTo(10.593 * Math.PI / 180, 12);
    expect(ceres.source).toBe(metadata.source);
    expect(ceres.units).toEqual({ distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" });
  });

  it("publishes valid records atomically and refuses invalid epochs, eccentricity, units or provenance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mpc-import-"));
    const output = join(directory, "catalog.json");
    try {
      const normalized = fixture.records.map((record) => normalizeMpcOrbit(record, metadata));
      await publishMpcBundle(normalized, output, baseCatalog);
      expect(JSON.parse(await readFile(output, "utf8")).bodies).toHaveLength(2);
      expect(() => normalizeMpcOrbit({ ...fixture.records[0]!, epochJD: Number.NaN }, metadata)).toThrow(/epochJD/i);
      expect(() => normalizeMpcOrbit({ ...fixture.records[0]!, eccentricity: 1.2 }, metadata)).toThrow(/eccentricity/i);
      expect(() => normalizeMpcOrbit(fixture.records[0]!, { ...metadata, source: "" })).toThrow(/source/i);
      await expect(publishMpcBundle([{ ...normalized[0]!, units: { ...normalized[0]!.units!, distance: "AU" as never } }], output, baseCatalog)).rejects.toThrow(/units\.distance/i);
      expect(JSON.parse(await readFile(output, "utf8")).bodies).toHaveLength(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
