import type { Vec3Km } from "./types";

export interface EphemerisSample {
  jdTdb: number;
  positionKm: Vec3Km;
}

export interface EphemerisDataset {
  bodyId: string;
  centerId: string;
  frame: "ECLIPJ2000" | "ICRF";
  timeScale: "TDB";
  source: string;
  interpolationToleranceKm: number;
  samples: EphemerisSample[];
}

export class EphemerisCoverageError extends RangeError {
  constructor(readonly bodyId: string, readonly requestedJD: number, readonly startJD: number, readonly stopJD: number) {
    super(`${bodyId} ephemeris coverage is ${startJD}–${stopJD} JD TDB; request was ${requestedJD}`);
    this.name = "EphemerisCoverageError";
  }
}

export function getEphemerisPosition(dataset: EphemerisDataset, jdTdb: number): Vec3Km {
  if (!Number.isFinite(jdTdb)) throw new RangeError("Ephemeris time must be a finite JD TDB value");
  if (dataset.timeScale !== "TDB") throw new TypeError("Ephemeris data must be tagged TDB");
  if (!Number.isFinite(dataset.interpolationToleranceKm) || dataset.interpolationToleranceKm <= 0) throw new RangeError("Ephemeris interpolation tolerance must be finite and positive km");
  if (dataset.samples.length === 0) throw new RangeError(`${dataset.bodyId} ephemeris has no samples`);
  for (let index = 0; index < dataset.samples.length; index += 1) {
    const sample = dataset.samples[index]!;
    if (!Number.isFinite(sample.jdTdb) || ![sample.positionKm.x, sample.positionKm.y, sample.positionKm.z].every(Number.isFinite)) throw new RangeError(`Ephemeris sample ${index} is invalid`);
    if (index > 0 && sample.jdTdb <= dataset.samples[index - 1]!.jdTdb) throw new RangeError("Ephemeris samples must have strictly increasing JD TDB epochs");
  }
  const first = dataset.samples[0]!;
  const last = dataset.samples[dataset.samples.length - 1]!;
  if (jdTdb < first.jdTdb || jdTdb > last.jdTdb) {
    throw new EphemerisCoverageError(dataset.bodyId, jdTdb, first.jdTdb, last.jdTdb);
  }
  let low = 0;
  let high = dataset.samples.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const sample = dataset.samples[middle]!;
    if (sample.jdTdb === jdTdb) return { ...sample.positionKm };
    if (sample.jdTdb < jdTdb) low = middle + 1;
    else high = middle - 1;
  }
  const before = dataset.samples[high];
  const after = dataset.samples[low];
  if (!before || !after || after.jdTdb <= before.jdTdb) throw new RangeError("Ephemeris samples must be strictly increasing");
  const amount = (jdTdb - before.jdTdb) / (after.jdTdb - before.jdTdb);
  const position = {
    x: before.positionKm.x + (after.positionKm.x - before.positionKm.x) * amount,
    y: before.positionKm.y + (after.positionKm.y - before.positionKm.y) * amount,
    z: before.positionKm.z + (after.positionKm.z - before.positionKm.z) * amount,
  };
  if (![position.x, position.y, position.z].every(Number.isFinite)) throw new RangeError("Ephemeris interpolation returned a non-finite vector");
  return position;
}
