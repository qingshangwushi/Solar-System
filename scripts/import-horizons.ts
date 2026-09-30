import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { EphemerisDataset, EphemerisSample } from "../src/astronomy/ephemeris.ts";

interface ImportOptions {
  bodyId: string;
  body: string;
  center: string;
  start: string;
  stop: string;
  step: string;
  output: string;
  toleranceKm: number;
}

function parseArgs(args: string[]): ImportOptions {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]!;
    if (!token.startsWith("--") || !args[i + 1]) throw new Error(`Expected --name value argument, got ${token}`);
    values.set(token.slice(2), args[++i]!);
  }
  const required = ["body", "center", "start", "stop", "step", "tolerance-km"];
  for (const key of required) if (!values.has(key)) throw new Error(`Missing --${key}`);
  const body = values.get("body")!;
  const toleranceKm = Number(values.get("tolerance-km"));
  if (!Number.isFinite(toleranceKm) || toleranceKm <= 0) throw new Error("--tolerance-km must be a finite positive interpolation error bound");
  const bodyId = values.get("body-id") ?? body;
  return { bodyId, body, center: values.get("center")!, start: values.get("start")!, stop: values.get("stop")!, step: values.get("step")!, output: values.get("output") ?? `src/data/ephemeris/${bodyId}.json`, toleranceKm };
}

export function parseHorizonsVectorTable(result: string): EphemerisSample[] {
  const section = result.split("$$SOE")[1]?.split("$$EOE")[0];
  if (!section) throw new Error("Horizons response did not contain an ephemeris table");
  return section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const columns = line.replace(/^"|"$/g, "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((field) => field.replace(/^"|"$/g, "").trim());
    const [jd, x, y, z] = [Number(columns[0]), Number(columns[2]), Number(columns[3]), Number(columns[4])];
    if (![jd, x, y, z].every(Number.isFinite)) throw new Error(`Could not parse Horizons vector row: ${line}`);
    return { jdTdb: jd, positionKm: { x, y, z } };
  });
}

export async function importHorizons(options: ImportOptions): Promise<EphemerisDataset> {
  const params = new URLSearchParams({
    format: "json", COMMAND: `'${options.body}'`, CENTER: `'${options.center}'`, MAKE_EPHEM: "YES", EPHEM_TYPE: "VECTORS",
    START_TIME: `'${options.start}'`, STOP_TIME: `'${options.stop}'`, STEP_SIZE: `'${options.step}'`,
    REF_SYSTEM: "J2000", REF_PLANE: "ECLIPTIC", OUT_UNITS: "KM-S", VEC_TABLE: "2", VEC_CORR: "NONE", CSV_FORMAT: "YES", OBJ_DATA: "NO",
  });
  let response: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`);
    if (response.ok) break;
    if (![429, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`Horizons API returned HTTP ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
  }
  if (!response?.ok) throw new Error(`Horizons API returned HTTP ${response?.status ?? "unknown"}`);
  const payload = await response.json() as { result?: string; error?: string };
  if (!payload.result || payload.error) throw new Error(payload.error ?? "Horizons returned no result text");
  const samples = parseHorizonsVectorTable(payload.result);
  if (samples.length < 2) throw new Error("Horizons returned fewer than two position samples");
  const dataset: EphemerisDataset = {
    bodyId: options.bodyId,
    centerId: options.center,
    frame: "ECLIPJ2000",
    timeScale: "TDB",
    source: `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`,
    interpolationToleranceKm: options.toleranceKm,
    samples,
  };
  const path = resolve(options.output);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(dataset, null, 2)}\n`);
  const manifestPath = resolve("src/data/ephemeris/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { datasets: Array<Record<string, unknown>> };
  manifest.datasets = manifest.datasets.filter((entry) => entry.bodyId !== dataset.bodyId);
  manifest.datasets.push({ bodyId: dataset.bodyId, path: `./${path.split(/[\\/]/).at(-1)}`, centerId: dataset.centerId, frame: dataset.frame, timeScale: dataset.timeScale, validFromJD: samples[0]!.jdTdb, validToJD: samples.at(-1)!.jdTdb, sampleCount: samples.length, retrievedAt: new Date().toISOString(), source: dataset.source });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return dataset;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const options = parseArgs(process.argv.slice(2));
  const dataset = await importHorizons(options);
  console.log(`Imported ${dataset.samples.length} samples for ${dataset.bodyId}: JD ${dataset.samples[0]!.jdTdb}–${dataset.samples.at(-1)!.jdTdb} TDB`);
}
