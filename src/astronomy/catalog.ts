import type { BodyType, CelestialObject, CatalogUnits, OrbitalElements } from "./types";

export interface CatalogValidationResult {
  valid: boolean;
  errors: string[];
}

const BODY_TYPES = new Set<BodyType>(["star", "planet", "dwarfPlanet", "moon", "asteroid", "comet", "centaur", "tno", "spacecraft"]);
const VALID_FRAMES = new Set(["ECLIPJ2000", "ICRF"]);
const VALID_ANGLE_UNITS = new Set(["rad", "deg"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateBody(value: unknown, index: number, errors: string[]): value is CelestialObject {
  const prefix = `bodies[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object`);
    return false;
  }
  const body = value;
  if (typeof body.id !== "string" || body.id.trim() === "") errors.push(`${prefix}.id must be a non-empty string`);
  if (typeof body.name !== "string" || body.name.trim() === "") errors.push(`${prefix}.name must be a non-empty string`);
  if (typeof body.type !== "string" || !BODY_TYPES.has(body.type as BodyType)) errors.push(`${prefix}.type is not a supported body category`);
  if (typeof body.source !== "string" || !/^https?:\/\//i.test(body.source)) errors.push(`${prefix}.source must be a source URL`);
  if (typeof body.sourceRevision !== "string" || body.sourceRevision.trim() === "") errors.push(`${prefix}.sourceRevision must be non-empty text`);
  if (typeof body.sourceUpdatedAt !== "string" || Number.isNaN(Date.parse(body.sourceUpdatedAt))) errors.push(`${prefix}.sourceUpdatedAt must be a valid date`);
  if (body.aliases !== undefined && (!Array.isArray(body.aliases) || !body.aliases.every((alias) => typeof alias === "string"))) errors.push(`${prefix}.aliases must be an array of strings`);
  for (const field of ["radiusKm", "massKg", "densityKgM3"] as const) {
    if (body[field] !== undefined && (!finite(body[field]) || body[field] <= 0)) errors.push(`${prefix}.${field} must be a finite positive number`);
  }
  for (const field of ["rotationPeriodHours", "axialTiltDeg"] as const) {
    if (body[field] !== undefined && !finite(body[field])) errors.push(`${prefix}.${field} must be finite`);
  }
  if (body.parentId !== undefined && (typeof body.parentId !== "string" || body.parentId.trim() === "")) errors.push(`${prefix}.parentId must be a non-empty string`);
  if (body.population !== undefined && !["mainBelt", "nearEarth", "trojan", "centaur", "kuiperBelt", "scatteredDisk", "tno"].includes(String(body.population))) errors.push(`${prefix}.population is not a supported small-body population`);
  if (!isRecord(body.units)) {
    errors.push(`${prefix}.units is required`);
  } else {
    const units = body.units as Partial<CatalogUnits>;
    if (units.distance !== "km") errors.push(`${prefix}.units.distance must be km`);
    if (units.mass !== "kg") errors.push(`${prefix}.units.mass must be kg`);
    if (typeof units.angles !== "string" || !VALID_ANGLE_UNITS.has(units.angles)) errors.push(`${prefix}.units.angles must be rad or deg`);
    if (units.epoch !== "JD TDB") errors.push(`${prefix}.units.epoch must be JD TDB`);
  }
  if (body.orbit !== undefined) {
    if (!isRecord(body.orbit)) {
      errors.push(`${prefix}.orbit must be an object`);
    } else {
      const orbit = body.orbit as Partial<OrbitalElements>;
      for (const field of ["epochJD", "semiMajorAxisKm", "eccentricity", "inclinationRad", "longitudeAscendingNodeRad", "argumentOfPeriapsisRad", "meanAnomalyRad"] as const) {
        if (!finite(orbit[field])) errors.push(`${prefix}.orbit.${field} must be finite`);
      }
      if (finite(orbit.eccentricity) && (orbit.eccentricity < 0 || orbit.eccentricity === 1)) errors.push(`${prefix}.orbit.eccentricity must be >= 0 and not equal 1`);
      if (finite(orbit.eccentricity) && finite(orbit.semiMajorAxisKm) && orbit.semiMajorAxisKm === 0) errors.push(`${prefix}.orbit.semiMajorAxisKm must not be zero`);
      if (finite(orbit.eccentricity) && finite(orbit.semiMajorAxisKm) && ((orbit.eccentricity < 1 && orbit.semiMajorAxisKm < 0) || (orbit.eccentricity > 1 && orbit.semiMajorAxisKm > 0))) errors.push(`${prefix}.orbit.semiMajorAxisKm sign must match its conic type`);
      if (typeof orbit.elementFrame !== "string" || !VALID_FRAMES.has(orbit.elementFrame)) errors.push(`${prefix}.orbit.elementFrame must be ECLIPJ2000 or ICRF`);
    }
  }
  if (body.ephemeris !== undefined && !isRecord(body.ephemeris)) errors.push(`${prefix}.ephemeris must be an object`);
  return true;
}

export function validateCatalog(catalog: readonly unknown[]): CatalogValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  catalog.forEach((body, index) => {
    validateBody(body, index, errors);
    if (isRecord(body) && typeof body.id === "string" && body.id.trim()) {
      if (ids.has(body.id)) errors.push(`bodies[${index}].id duplicates "${body.id}"`);
      ids.add(body.id);
    }
  });
  const validIds = new Set(catalog.filter(isRecord).map((body) => body.id).filter((id): id is string => typeof id === "string"));
  catalog.forEach((body, index) => {
    if (isRecord(body) && typeof body.parentId === "string" && !validIds.has(body.parentId)) errors.push(`bodies[${index}].parentId references missing body "${body.parentId}"`);
  });
  return { valid: errors.length === 0, errors };
}

export function loadCatalog(raw: unknown): CelestialObject[] {
  if (!isRecord(raw) || !Array.isArray(raw.bodies)) throw new TypeError("Catalog must be an object with a bodies array");
  const result = validateCatalog(raw.bodies);
  if (!result.valid) throw new TypeError(`Catalog validation failed: ${result.errors.join("; ")}`);
  return raw.bodies as CelestialObject[];
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function searchCatalog(catalog: readonly CelestialObject[], query: string): CelestialObject[] {
  const needle = normalize(query);
  if (!needle) return [];
  return catalog
    .filter((body) => [body.name, body.officialName, ...(body.aliases ?? [])]
      .some((term) => term !== undefined && normalize(term).includes(needle)))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
}
