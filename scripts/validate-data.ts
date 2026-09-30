import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCatalog } from "../src/astronomy/catalog.ts";
import { validateEphemerisBundles } from "./validate-ephemeris.ts";

const catalogPath = resolve(process.cwd(), "src/data/catalog/bodies.json");
const phase2Path = resolve(process.cwd(), "src/data/catalog/phase2.json");
const base = JSON.parse(await readFile(catalogPath, "utf8")) as { bodies: unknown[] };
const phase2 = JSON.parse(await readFile(phase2Path, "utf8")) as { bodies: unknown[] };
const catalog = loadCatalog({ bodies: [...base.bodies, ...phase2.bodies] });
const categories = new Map<string, number>();
for (const body of catalog) categories.set(body.type, (categories.get(body.type) ?? 0) + 1);
console.log(`Catalog valid: ${catalog.length} bodies (${[...categories].map(([type, count]) => `${type}: ${count}`).join(", ")})`);
const ephemeris = await validateEphemerisBundles(resolve(process.cwd(), "src/data/ephemeris"), new Set(catalog.map((body) => body.id)));
console.log(`Ephemeris valid: ${ephemeris.datasetCount} datasets, ${ephemeris.sampleCount} samples`);
