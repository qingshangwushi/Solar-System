import { describe, expect, it } from "vitest";
import { getEphemerisPosition, type EphemerisDataset } from "../../src/astronomy/ephemeris";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseHorizonsVectorTable } from "../../scripts/import-horizons";

const dataset: EphemerisDataset = {
  bodyId: "earth",
  centerId: "sun",
  frame: "ECLIPJ2000",
  timeScale: "TDB",
  source: "test fixture",
  interpolationToleranceKm: 1,
  samples: [
    { jdTdb: 2451545, positionKm: { x: 0, y: 0, z: 0 } },
    { jdTdb: 2451547, positionKm: { x: 2, y: 4, z: 6 } },
  ],
};

describe("offline ephemeris interpolation", () => {
  it("linearly interpolates a midpoint in the recorded coordinate frame", () => {
    expect(getEphemerisPosition(dataset, 2451546)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("rejects requests outside coverage instead of extrapolating", () => {
    expect(() => getEphemerisPosition(dataset, 2451544)).toThrow(/coverage/i);
    expect(() => getEphemerisPosition(dataset, 2451548)).toThrow(/coverage/i);
  });

  it("parses a saved Horizons CSV vector table into explicit TDB epochs and km positions", async () => {
    const fixture = await readFile(resolve(process.cwd(), "tests/fixtures/horizons-vectors.txt"), "utf8");
    expect(parseHorizonsVectorTable(fixture)).toEqual([
      { jdTdb: 2451545, positionKm: { x: 1000, y: -2000, z: 3000 } },
      { jdTdb: 2451546, positionKm: { x: 1100, y: -2100, z: 3100 } },
    ]);
  });

  it("returns exact stored reference vectors at sample epochs", () => {
    expect(getEphemerisPosition(dataset, 2451547)).toEqual({ x: 2, y: 4, z: 6 });
  });
});
