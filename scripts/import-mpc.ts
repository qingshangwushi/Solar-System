import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateCatalog } from "../src/astronomy/catalog.ts";
import { KM_PER_AU } from "../src/astronomy/units.ts";
import type { CelestialObject } from "../src/astronomy/types.ts";

export interface MpcOrbitRecord {
  designation: string;
  name: string;
  epochJD: number;
  semiMajorAxisAu: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeAscendingNodeDeg: number;
  argumentOfPeriapsisDeg: number;
  meanAnomalyDeg: number;
  radiusKm?: number;
  massKg?: number;
}

export interface MpcSourceMetadata {
  source: string;
  revision: string;
  updatedAt: string;
}

function finitePositive(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value > 0);
}

export function normalizeMpcOrbit(record: MpcOrbitRecord, metadata: MpcSourceMetadata): CelestialObject {
  if (!record.designation?.trim()) throw new TypeError("MPC designation must be non-empty");
  if (!record.name?.trim()) throw new TypeError("MPC name must be non-empty");
  if (!Number.isFinite(record.epochJD) || record.epochJD < 1_000_000) throw new RangeError("epochJD must be a finite Julian Date TDB");
  if (!Number.isFinite(record.semiMajorAxisAu) || record.semiMajorAxisAu <= 0) throw new RangeError("semiMajorAxisAu must be finite and positive");
  if (!Number.isFinite(record.eccentricity) || record.eccentricity < 0 || record.eccentricity >= 1) throw new RangeError("eccentricity must be finite in [0, 1) for asteroid records");
  for (const key of ["inclinationDeg", "longitudeAscendingNodeDeg", "argumentOfPeriapsisDeg", "meanAnomalyDeg"] as const) {
    if (!Number.isFinite(record[key])) throw new RangeError(`${key} must be finite degrees`);
  }
  if (!finitePositive(record.radiusKm)) throw new RangeError("radiusKm must be finite and positive when provided");
  if (!finitePositive(record.massKg)) throw new RangeError("massKg must be finite and positive when provided");
  if (!/^https?:\/\//i.test(metadata.source)) throw new TypeError("source must be a URL");
  if (!metadata.revision.trim()) throw new TypeError("revision must identify the MPC source snapshot");
  if (Number.isNaN(Date.parse(metadata.updatedAt))) throw new TypeError("updatedAt must be a valid date");
  const idPart = record.designation.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: `mp-${idPart}`,
    name: record.name.trim(),
    officialName: record.designation.trim(),
    aliases: [record.designation.trim(), `${record.designation.trim()} ${record.name.trim()}`],
    type: "asteroid",
    population: "mainBelt",
    parentId: "sun",
    radiusKm: record.radiusKm,
    massKg: record.massKg,
    orbit: {
      epochJD: record.epochJD,
      semiMajorAxisKm: record.semiMajorAxisAu * KM_PER_AU,
      eccentricity: record.eccentricity,
      inclinationRad: record.inclinationDeg * Math.PI / 180,
      longitudeAscendingNodeRad: record.longitudeAscendingNodeDeg * Math.PI / 180,
      argumentOfPeriapsisRad: record.argumentOfPeriapsisDeg * Math.PI / 180,
      meanAnomalyRad: record.meanAnomalyDeg * Math.PI / 180,
      elementFrame: "ECLIPJ2000",
    },
    source: metadata.source,
    sourceRevision: metadata.revision,
    sourceUpdatedAt: metadata.updatedAt,
    units: { distance: "km", mass: "kg", angles: "rad", epoch: "JD TDB" },
  };
}

export async function publishMpcBundle(records: CelestialObject[], outputPath: string, baseCatalog: CelestialObject[] = []): Promise<void> {
  const output = resolve(outputPath);
  let previous: CelestialObject[] = [];
  try {
    const existing = JSON.parse(await readFile(output, "utf8")) as { bodies?: CelestialObject[] };
    if (Array.isArray(existing.bodies)) previous = existing.bodies;
  } catch { /* New bundle path. */ }
  const byId = new Map(previous.map((body) => [body.id, body]));
  for (const body of records) byId.set(body.id, body);
  const combined = [...byId.values()];
  const validation = validateCatalog([...baseCatalog.filter((body) => !byId.has(body.id)), ...combined]);
  if (!validation.valid) throw new TypeError(`MPC bundle rejected: ${validation.errors.join("; ")}`);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, source: "Minor Planet Center", bodies: combined }, null, 2)}\n`, { flag: "wx" });
  try {
    await rename(temporary, output);
  } catch (error) {
    await import("node:fs/promises").then(({ unlink }) => unlink(temporary).catch(() => undefined));
    throw error;
  }
}

async function main(args: string[]): Promise<void> {
  const inputIndex = args.indexOf("--input");
  const outputIndex = args.indexOf("--output");
  const baseIndex = args.indexOf("--base");
  if (inputIndex < 0 || !args[inputIndex + 1] || outputIndex < 0 || !args[outputIndex + 1]) {
    throw new Error("Usage: npm run import:mpc -- --input saved-mpc-response.json --output src/data/catalog/phase2.json [--base src/data/catalog/bodies.json]");
  }
  const input = JSON.parse(await readFile(resolve(args[inputIndex + 1]!), "utf8")) as { source: string; revision: string; updatedAt: string; records: MpcOrbitRecord[] };
  const normalized = input.records.map((record) => normalizeMpcOrbit(record, input));
  const baseFile = baseIndex >= 0 ? args[baseIndex + 1]! : "src/data/catalog/bodies.json";
  const base = JSON.parse(await readFile(resolve(baseFile), "utf8")) as { bodies: CelestialObject[] };
  await publishMpcBundle(normalized, args[outputIndex + 1]!, base.bodies);
  console.log(`Published ${normalized.length} validated MPC records to ${args[outputIndex + 1]}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await main(process.argv.slice(2));
