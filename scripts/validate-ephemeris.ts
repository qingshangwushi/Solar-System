import { readFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

interface ManifestEntry {
  bodyId: string;
  path: string;
  centerId: string;
  frame: "ECLIPJ2000" | "ICRF";
  timeScale: "TDB";
  validFromJD: number;
  validToJD: number;
  sampleCount: number;
  retrievedAt: string;
  source: string;
}

interface EphemerisManifest {
  schemaVersion: 1;
  datasets: ManifestEntry[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function validateEphemerisBundles(directory: string, knownBodyIds?: ReadonlySet<string>): Promise<{ datasetCount: number; sampleCount: number }> {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")) as unknown;
  if (!record(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.datasets)) {
    throw new TypeError("Ephemeris manifest must have schemaVersion 1 and a datasets array");
  }
  const bodyIds = new Set<string>();
  const paths = new Set<string>();
  let totalSamples = 0;
  for (const [index, rawEntry] of manifest.datasets.entries()) {
    if (!record(rawEntry)) throw new TypeError(`manifest.datasets[${index}] must be an object`);
    const entry = rawEntry as unknown as ManifestEntry;
    if (!entry.bodyId || typeof entry.bodyId !== "string") throw new TypeError(`manifest.datasets[${index}].bodyId must be a non-empty string`);
    if (knownBodyIds && !knownBodyIds.has(entry.bodyId)) throw new TypeError(`Ephemeris bodyId "${entry.bodyId}" is missing from the catalog`);
    if (bodyIds.has(entry.bodyId)) throw new TypeError(`Duplicate ephemeris bodyId: ${entry.bodyId}`);
    bodyIds.add(entry.bodyId);
    if (typeof entry.path !== "string" || !entry.path.endsWith(".json")) throw new TypeError(`${entry.bodyId}.path must reference a JSON file`);
    const filePath = resolve(root, entry.path);
    if (!filePath.startsWith(`${root}${sep}`) || basename(filePath) === "manifest.json") throw new TypeError(`${entry.bodyId}.path must stay within the ephemeris directory`);
    if (paths.has(filePath)) throw new TypeError(`Duplicate ephemeris path: ${entry.path}`);
    paths.add(filePath);
    if (!entry.centerId || typeof entry.centerId !== "string") throw new TypeError(`${entry.bodyId}.centerId must be a non-empty string`);
    if (entry.frame !== "ECLIPJ2000" && entry.frame !== "ICRF") throw new TypeError(`${entry.bodyId}.frame is unsupported`);
    if (entry.timeScale !== "TDB") throw new TypeError(`${entry.bodyId}.timeScale must be TDB`);
    if (!finite(entry.validFromJD) || !finite(entry.validToJD) || entry.validFromJD >= entry.validToJD) throw new TypeError(`${entry.bodyId} manifest coverage must be a finite increasing JD interval`);
    if (!Number.isInteger(entry.sampleCount) || entry.sampleCount < 2) throw new TypeError(`${entry.bodyId}.sampleCount must be an integer of at least 2`);
    if (typeof entry.retrievedAt !== "string" || Number.isNaN(Date.parse(entry.retrievedAt))) throw new TypeError(`${entry.bodyId}.retrievedAt must be a valid date`);
    if (typeof entry.source !== "string" || !/^https:\/\//i.test(entry.source)) throw new TypeError(`${entry.bodyId}.source must be an HTTPS URL`);

    const rawDataset = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (!record(rawDataset)) throw new TypeError(`${entry.bodyId} dataset must be an object`);
    if (rawDataset.bodyId !== entry.bodyId) throw new TypeError(`${entry.bodyId} dataset bodyId does not match its manifest`);
    if (rawDataset.centerId !== entry.centerId) throw new TypeError(`${entry.bodyId} dataset centerId does not match its manifest`);
    if (rawDataset.frame !== entry.frame || rawDataset.timeScale !== entry.timeScale) throw new TypeError(`${entry.bodyId} frame/timeScale does not match its manifest`);
    if (typeof rawDataset.source !== "string" || !/^https:\/\//i.test(rawDataset.source)) throw new TypeError(`${entry.bodyId} dataset source must be an HTTPS URL`);
    if (!finite(rawDataset.interpolationToleranceKm) || rawDataset.interpolationToleranceKm <= 0) throw new TypeError(`${entry.bodyId}.interpolationToleranceKm must be positive km`);
    if (!Array.isArray(rawDataset.samples) || rawDataset.samples.length !== entry.sampleCount) throw new TypeError(`${entry.bodyId} sample count does not match its manifest`);
    let previousJD = Number.NEGATIVE_INFINITY;
    for (const [sampleIndex, sample] of rawDataset.samples.entries()) {
      if (!record(sample) || !finite(sample.jdTdb) || sample.jdTdb <= previousJD) throw new TypeError(`${entry.bodyId}.samples[${sampleIndex}] has an invalid or unordered JD TDB epoch`);
      if (!record(sample.positionKm) || ![sample.positionKm.x, sample.positionKm.y, sample.positionKm.z].every(finite)) throw new TypeError(`${entry.bodyId}.samples[${sampleIndex}].positionKm must contain finite x/y/z km values`);
      previousJD = sample.jdTdb;
    }
    const samples = rawDataset.samples as Array<{ jdTdb: number }>;
    if (samples[0]!.jdTdb !== entry.validFromJD || samples.at(-1)!.jdTdb !== entry.validToJD) throw new TypeError(`${entry.bodyId} sample epochs do not match manifest coverage`);
    totalSamples += samples.length;
  }
  return { datasetCount: bodyIds.size, sampleCount: totalSamples };
}
