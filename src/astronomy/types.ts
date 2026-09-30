export type BodyType =
  | "star"
  | "planet"
  | "dwarfPlanet"
  | "moon"
  | "asteroid"
  | "comet"
  | "centaur"
  | "tno"
  | "spacecraft";

export interface OrbitalElements {
  epochJD: number;
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationRad: number;
  longitudeAscendingNodeRad: number;
  argumentOfPeriapsisRad: number;
  meanAnomalyRad: number;
  elementFrame: "ECLIPJ2000" | "ICRF";
}

export interface EphemerisReference {
  datasetId: string;
  frame: "ECLIPJ2000" | "ICRF";
  timeScale: "TDB";
  validFromJD: number;
  validToJD: number;
  source: string;
}

export interface TextureReference {
  low?: string;
  medium?: string;
  high?: string;
  attribution: string;
  license: string;
}

export interface CatalogUnits {
  distance: "km";
  mass: "kg";
  angles: "rad" | "deg";
  epoch: "JD TDB";
}

export interface CelestialObject {
  id: string;
  name: string;
  officialName?: string;
  aliases?: string[];
  type: BodyType;
  parentId?: string;
  population?: "mainBelt" | "nearEarth" | "trojan" | "centaur" | "kuiperBelt" | "scatteredDisk" | "tno";
  radiusKm?: number;
  massKg?: number;
  densityKgM3?: number;
  rotationPeriodHours?: number;
  axialTiltDeg?: number;
  orbit?: OrbitalElements;
  ephemeris?: EphemerisReference;
  texture?: TextureReference;
  source: string;
  sourceUpdatedAt?: string;
  sourceRevision?: string;
  units?: CatalogUnits;
}

export interface SimulationTime {
  utc: string;
  julianDateTdb: number;
  speed: number;
  paused: boolean;
}

export interface Vec3Km {
  x: number;
  y: number;
  z: number;
}

export interface Vec3Scene {
  x: number;
  y: number;
  z: number;
}
