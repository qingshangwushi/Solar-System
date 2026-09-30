import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateEphemerisBundles } from "../../scripts/validate-ephemeris";

const directories: string[] = [];

async function writeBundle(mutateManifest?: (manifest: Record<string, unknown>) => void, mutateDataset?: (dataset: Record<string, unknown>) => void) {
  const directory = await mkdtemp(join(tmpdir(), "ephemeris-validation-"));
  directories.push(directory);
  const dataset: Record<string, unknown> = {
    bodyId: "earth", centerId: "500@10", frame: "ECLIPJ2000", timeScale: "TDB", source: "https://ssd.jpl.nasa.gov/api/horizons.api",
    interpolationToleranceKm: 2_000_000,
    samples: [
      { jdTdb: 2451545, positionKm: { x: 1, y: 2, z: 3 } },
      { jdTdb: 2451546, positionKm: { x: 2, y: 3, z: 4 } },
    ],
  };
  mutateDataset?.(dataset);
  await writeFile(join(directory, "earth.json"), JSON.stringify(dataset));
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    datasets: [{ bodyId: "earth", path: "./earth.json", centerId: "500@10", frame: "ECLIPJ2000", timeScale: "TDB", validFromJD: 2451545, validToJD: 2451546, sampleCount: 2, retrievedAt: "2026-09-30T00:00:00Z", source: "https://ssd.jpl.nasa.gov/api/horizons.api" }],
  };
  mutateManifest?.(manifest);
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  return directory;
}

afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("ephemeris bundle validation", () => {
  it("validates manifest provenance, frame, time scale, coverage and ordered vectors", async () => {
    const directory = await writeBundle();
    await expect(validateEphemerisBundles(directory)).resolves.toEqual({ datasetCount: 1, sampleCount: 2 });
  });

  it("rejects a manifest whose declared sample count differs from its data", async () => {
    const directory = await writeBundle((manifest) => {
      const datasets = manifest.datasets as Array<Record<string, unknown>>;
      datasets[0]!.sampleCount = 3;
    });
    await expect(validateEphemerisBundles(directory)).rejects.toThrow(/sample count/i);
  });

  it("rejects unsafe paths and non-increasing sample epochs", async () => {
    const unsafe = await writeBundle((manifest) => {
      const datasets = manifest.datasets as Array<Record<string, unknown>>;
      datasets[0]!.path = "../outside.json";
    });
    await expect(validateEphemerisBundles(unsafe)).rejects.toThrow(/stay within/i);
    const unordered = await writeBundle(undefined, (dataset) => {
      const samples = dataset.samples as Array<Record<string, unknown>>;
      samples[1]!.jdTdb = 2451545;
    });
    await expect(validateEphemerisBundles(unordered)).rejects.toThrow(/unordered/i);
  });

  it("rejects vector records that cannot be joined to the current catalog", async () => {
    const directory = await writeBundle();
    await expect(validateEphemerisBundles(directory, new Set(["sun"]))).rejects.toThrow(/missing from the catalog/i);
  });
});
