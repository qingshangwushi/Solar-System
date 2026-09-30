import type { OrbitalElements, Vec3Km } from "./types";
import { icrfToEclipticJ2000 } from "./coordinates.ts";

const SECONDS_PER_DAY = 86_400;

function normalizeRadians(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function solveEllipticKepler(meanAnomaly: number, eccentricity: number): number {
  const mean = normalizeRadians(meanAnomaly);
  let lower = -Math.PI;
  let upper = Math.PI;
  let estimate = mean + Math.sign(Math.sin(mean) || 1) * Math.min(eccentricity, 0.85) * 0.85;

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const residual = estimate - eccentricity * Math.sin(estimate) - mean;
    if (Math.abs(residual) < 1e-14) return estimate;
    if (residual > 0) upper = estimate;
    else lower = estimate;

    const derivative = 1 - eccentricity * Math.cos(estimate);
    const newton = estimate - residual / derivative;
    estimate = Number.isFinite(newton) && newton > lower && newton < upper
      ? newton
      : (lower + upper) / 2;
  }
  return (lower + upper) / 2;
}

function solveHyperbolicKepler(meanAnomaly: number, eccentricity: number): number {
  let estimate = Math.asinh(meanAnomaly / eccentricity);
  for (let iteration = 0; iteration < 48; iteration += 1) {
    if (Math.abs(estimate) > 700) {
      throw new RangeError("Hyperbolic anomaly exceeds the supported numeric range");
    }
    const residual = eccentricity * Math.sinh(estimate) - estimate - meanAnomaly;
    if (Math.abs(residual) < 1e-13) return estimate;
    const derivative = eccentricity * Math.cosh(estimate) - 1;
    const next = estimate - residual / derivative;
    if (!Number.isFinite(next)) {
      throw new RangeError("Could not solve hyperbolic Kepler equation");
    }
    estimate = next;
  }
  throw new RangeError("Hyperbolic Kepler solver did not converge");
}

export function propagateKepler(
  elements: OrbitalElements,
  jdTdb: number,
  muKm3S2: number,
): Vec3Km {
  const numericValues = [
    elements.epochJD,
    elements.semiMajorAxisKm,
    elements.eccentricity,
    elements.inclinationRad,
    elements.longitudeAscendingNodeRad,
    elements.argumentOfPeriapsisRad,
    elements.meanAnomalyRad,
    jdTdb,
    muKm3S2,
  ];
  if (!numericValues.every(Number.isFinite)) {
    throw new RangeError("Orbital elements, epoch, and gravitational parameter must be finite");
  }
  if (elements.eccentricity < 0 || elements.eccentricity === 1) {
    throw new RangeError("Eccentricity must describe an elliptic or hyperbolic orbit (e ≠ 1)");
  }
  if (muKm3S2 <= 0 || elements.semiMajorAxisKm === 0) {
    throw new RangeError("Gravitational parameter must be positive and semi-major axis non-zero");
  }
  if (
    (elements.eccentricity < 1 && elements.semiMajorAxisKm < 0) ||
    (elements.eccentricity > 1 && elements.semiMajorAxisKm > 0)
  ) {
    throw new RangeError("Semi-major axis sign must match the orbit conic type");
  }

  const semiMajorMagnitude = Math.abs(elements.semiMajorAxisKm);
  const meanMotion = Math.sqrt(muKm3S2 / semiMajorMagnitude ** 3);
  const elapsedSeconds = (jdTdb - elements.epochJD) * SECONDS_PER_DAY;
  const meanAnomaly = elements.meanAnomalyRad + meanMotion * elapsedSeconds;

  let x: number;
  let y: number;
  if (elements.eccentricity < 1) {
    const eccentricAnomaly = solveEllipticKepler(meanAnomaly, elements.eccentricity);
    x = elements.semiMajorAxisKm * (Math.cos(eccentricAnomaly) - elements.eccentricity);
    y = elements.semiMajorAxisKm * Math.sqrt(1 - elements.eccentricity ** 2) * Math.sin(eccentricAnomaly);
  } else {
    const hyperbolicAnomaly = solveHyperbolicKepler(meanAnomaly, elements.eccentricity);
    x = elements.semiMajorAxisKm * (Math.cosh(hyperbolicAnomaly) - elements.eccentricity);
    y = -elements.semiMajorAxisKm * Math.sqrt(elements.eccentricity ** 2 - 1) * Math.sinh(hyperbolicAnomaly);
  }

  const cosNode = Math.cos(elements.longitudeAscendingNodeRad);
  const sinNode = Math.sin(elements.longitudeAscendingNodeRad);
  const cosInclination = Math.cos(elements.inclinationRad);
  const sinInclination = Math.sin(elements.inclinationRad);
  const cosPeriapsis = Math.cos(elements.argumentOfPeriapsisRad);
  const sinPeriapsis = Math.sin(elements.argumentOfPeriapsisRad);

  const inElementFrame: Vec3Km = {
    x: (cosNode * cosPeriapsis - sinNode * sinPeriapsis * cosInclination) * x
      + (-cosNode * sinPeriapsis - sinNode * cosPeriapsis * cosInclination) * y,
    y: (sinNode * cosPeriapsis + cosNode * sinPeriapsis * cosInclination) * x
      + (-sinNode * sinPeriapsis + cosNode * cosPeriapsis * cosInclination) * y,
    z: sinPeriapsis * sinInclination * x + cosPeriapsis * sinInclination * y,
  };

  const position = elements.elementFrame === "ICRF"
    ? icrfToEclipticJ2000(inElementFrame)
    : inElementFrame;
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new RangeError("Orbital propagation produced a non-finite position");
  }
  return position;
}
