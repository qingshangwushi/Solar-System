import type { Vec3d, Precision, ReferenceFrame } from '@solar-system/schemas';
import { convertTime } from './time.js';

export interface ChebyshevSegment {
  startMjdTdb: number;
  endMjdTdb: number;
  durationDays: number;
  coefficients: Float64Array;
  degree: number;
}

export interface BodyEphemeris {
  bodyId: number;
  centerId: number;
  referenceFrame: ReferenceFrame;
  precision: Precision;
  segments: ChebyshevSegment[];
}

export function evaluateChebyshevPolynomial(coefficients: Float64Array, x: number): number {
  const n = coefficients.length;
  if (n === 0) return 0;
  if (n === 1) return coefficients[0];
  
  let d0 = 0;
  let d1 = 0;
  
  for (let i = n - 1; i >= 1; i--) {
    const temp = d0;
    d0 = 2 * x * d0 - d1 + coefficients[i];
    d1 = temp;
  }
  
  return x * d0 - d1 + coefficients[0];
}

export function evaluateChebyshevDerivative(coefficients: Float64Array, x: number): number {
  const n = coefficients.length;
  if (n <= 1) return 0;
  
  let d0 = 0;
  let d1 = 0;
  let d2 = 0;
  
  for (let i = n - 1; i >= 0; i--) {
    const temp = d0;
    d0 = 2 * x * d0 - d1 + coefficients[i];
    d1 = temp;
  }
  
  let dd0 = 0;
  let dd1 = 0;
  
  for (let i = n - 1; i >= 1; i--) {
    const temp = dd0;
    dd0 = 2 * x * dd0 - dd1 + i * coefficients[i];
    dd1 = temp;
  }
  
  return 2 * dd0 - dd1;
}

export function findSegment(segments: ChebyshevSegment[], mjdTdb: number): ChebyshevSegment | null {
  let low = 0;
  let high = segments.length - 1;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const seg = segments[mid];
    
    if (mjdTdb >= seg.startMjdTdb && mjdTdb < seg.endMjdTdb) {
      return seg;
    } else if (mjdTdb < seg.startMjdTdb) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  
  return null;
}

export function evaluateSegment(segment: ChebyshevSegment, mjdTdb: number): { position: Vec3d; velocity: Vec3d } {
  const t0 = segment.startMjdTdb;
  const t1 = segment.endMjdTdb;
  const tau = (2 * mjdTdb - t0 - t1) / (t1 - t0);
  const dt = (t1 - t0) / 2;
  
  const degree = segment.degree;
  const coeff = segment.coefficients;
  
  const xCoeffs = coeff.slice(0, degree + 1);
  const yCoeffs = coeff.slice(degree + 1, 2 * degree + 2);
  const zCoeffs = coeff.slice(2 * degree + 2, 3 * degree + 3);
  
  const x = evaluateChebyshevPolynomial(xCoeffs, tau);
  const y = evaluateChebyshevPolynomial(yCoeffs, tau);
  const z = evaluateChebyshevPolynomial(zCoeffs, tau);
  
  const dx = evaluateChebyshevDerivative(xCoeffs, tau) / dt;
  const dy = evaluateChebyshevDerivative(yCoeffs, tau) / dt;
  const dz = evaluateChebyshevDerivative(zCoeffs, tau) / dt;
  
  return {
    position: { x, y, z },
    velocity: { x: dx, y: dy, z: dz },
  };
}

export function evaluateEphemeris(
  ephemeris: BodyEphemeris,
  mjd: number,
  inputScale: string,
): { position: Vec3d; velocity: Vec3d; precision: Precision; outOfRange: boolean } {
  const mjdTdb = convertTime(mjd, inputScale as import('@solar-system/schemas').TimeScale, 'Tdb');
  
  const segment = findSegment(ephemeris.segments, mjdTdb);
  
  if (!segment) {
    return {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      precision: ephemeris.precision,
      outOfRange: true,
    };
  }
  
  const result = evaluateSegment(segment, mjdTdb);
  
  return {
    position: result.position,
    velocity: result.velocity,
    precision: ephemeris.precision,
    outOfRange: false,
  };
}

export function buildChebyshevApproximation(
  samples: Vec3d[],
  times: number[],
  startMjd: number,
  endMjd: number,
  degree: number,
): ChebyshevSegment {
  const n = samples.length;
  const duration = endMjd - startMjd;
  
  const coeffX = new Float64Array(degree + 1);
  const coeffY = new Float64Array(degree + 1);
  const coeffZ = new Float64Array(degree + 1);
  
  for (let k = 0; k <= degree; k++) {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    
    for (let i = 0; i < n; i++) {
      const tau_i = (2 * times[i] - startMjd - endMjd) / duration;
      const arg = k * Math.PI * (2 * i + 1) / (2 * n);
      const cosArg = Math.cos(arg);
      sumX += samples[i].x * cosArg;
      sumY += samples[i].y * cosArg;
      sumZ += samples[i].z * cosArg;
    }
    
    const scale = k === 0 ? 1 / n : 2 / n;
    coeffX[k] = scale * sumX;
    coeffY[k] = scale * sumY;
    coeffZ[k] = scale * sumZ;
  }
  
  const coefficients = new Float64Array(3 * (degree + 1));
  coefficients.set(coeffX, 0);
  coefficients.set(coeffY, degree + 1);
  coefficients.set(coeffZ, 2 * degree + 2);
  
  return {
    startMjdTdb: startMjd,
    endMjdTdb: endMjd,
    durationDays: duration,
    coefficients,
    degree,
  };
}

export function computeOrbitElements(position: Vec3d, velocity: Vec3d, gm: number): {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  ascendingNode: number;
  argumentPeriapsis: number;
  meanAnomaly: number;
  periodDays: number;
} {
  const r = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
  const v = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
  
  const hx = position.y * velocity.z - position.z * velocity.y;
  const hy = position.z * velocity.x - position.x * velocity.z;
  const hz = position.x * velocity.y - position.y * velocity.x;
  const h = Math.sqrt(hx * hx + hy * hy + hz * hz);
  
  const nx = -hy;
  const ny = hx;
  const nz = 0;
  const n = Math.sqrt(nx * nx + ny * ny + nz * nz);
  
  const ex = (v * v / gm - 1 / r) * position.x - (position.x * velocity.x + position.y * velocity.y + position.z * velocity.z) * velocity.x / gm;
  const ey = (v * v / gm - 1 / r) * position.y - (position.x * velocity.x + position.y * velocity.y + position.z * velocity.z) * velocity.y / gm;
  const ez = (v * v / gm - 1 / r) * position.z - (position.x * velocity.x + position.y * velocity.y + position.z * velocity.z) * velocity.z / gm;
  const e = Math.sqrt(ex * ex + ey * ey + ez * ez);
  
  const semiMajorAxis = h * h / (gm * (1 - e * e));
  const periodDays = 2 * Math.PI * Math.sqrt(semiMajorAxis * semiMajorAxis * semiMajorAxis / gm) / 86400;
  
  const inclination = Math.acos(hz / h);
  
  let ascendingNode = 0;
  if (n > 0) {
    ascendingNode = Math.atan2(ny, nx);
  }
  
  let argumentPeriapsis = 0;
  if (e > 0 && n > 0) {
    const arg1 = Math.atan2(ez / e, (ex * nx + ey * ny) / (n * e));
    argumentPeriapsis = arg1;
  }
  
  let meanAnomaly = 0;
  if (e < 1) {
    const trueAnomaly = Math.atan2(position.y * hz - position.z * hy, position.x * hy - position.y * hx);
    const eccentricAnomaly = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(trueAnomaly / 2));
    meanAnomaly = eccentricAnomaly - e * Math.sin(eccentricAnomaly);
  }
  
  return {
    semiMajorAxis,
    eccentricity: e,
    inclination,
    ascendingNode,
    argumentPeriapsis,
    meanAnomaly,
    periodDays,
  };
}

export function propagateKepler(gm: number, elements: {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  ascendingNode: number;
  argumentPeriapsis: number;
  meanAnomaly: number;
}, deltaT: number): { position: Vec3d; velocity: Vec3d } {
  const { semiMajorAxis, eccentricity, inclination, ascendingNode, argumentPeriapsis, meanAnomaly } = elements;
  
  let meanAnomalyAtT = meanAnomaly + deltaT * Math.sqrt(gm / (semiMajorAxis * semiMajorAxis * semiMajorAxis));
  
  let eccentricAnomaly = meanAnomalyAtT;
  for (let i = 0; i < 10; i++) {
    const deltaE = (meanAnomalyAtT - eccentricAnomaly + eccentricity * Math.sin(eccentricAnomaly)) / (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly += deltaE;
    if (Math.abs(deltaE) < 1e-12) break;
  }
  
  const x = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricity);
  const y = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly);
  
  const vx = -Math.sqrt(gm / (semiMajorAxis * (1 - eccentricity * eccentricity))) * Math.sin(eccentricAnomaly);
  const vy = Math.sqrt(gm / (semiMajorAxis * (1 - eccentricity * eccentricity))) * (Math.cos(eccentricAnomaly) - eccentricity);
  
  const ca = Math.cos(ascendingNode);
  const sa = Math.sin(ascendingNode);
  const ci = Math.cos(inclination);
  const si = Math.sin(inclination);
  const cap = Math.cos(argumentPeriapsis);
  const sap = Math.sin(argumentPeriapsis);
  
  const m00 = ca * cap - sa * ci * sap;
  const m01 = -ca * sap - sa * ci * cap;
  const m02 = sa * si;
  const m10 = sa * cap + ca * ci * sap;
  const m11 = -sa * sap + ca * ci * cap;
  const m12 = -ca * si;
  const m20 = si * sap;
  const m21 = si * cap;
  const m22 = ci;
  
  return {
    position: {
      x: m00 * x + m01 * y,
      y: m10 * x + m11 * y,
      z: m20 * x + m21 * y,
    },
    velocity: {
      x: m00 * vx + m01 * vy,
      y: m10 * vx + m11 * vy,
      z: m20 * vx + m21 * vy,
    },
  };
}

export class EphemerisManager {
  private ephemerisMap: Map<number, BodyEphemeris> = new Map();
  
  registerEphemeris(ephemeris: BodyEphemeris): void {
    this.ephemerisMap.set(ephemeris.bodyId, ephemeris);
  }
  
  getEphemeris(bodyId: number): BodyEphemeris | undefined {
    return this.ephemerisMap.get(bodyId);
  }
  
  evaluate(bodyId: number, mjd: number, inputScale: string): {
    position: Vec3d;
    velocity: Vec3d;
    precision: Precision;
    outOfRange: boolean;
    supported: boolean;
  } {
    const ephemeris = this.ephemerisMap.get(bodyId);
    if (!ephemeris) {
      return {
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        precision: 'P0',
        outOfRange: false,
        supported: false,
      };
    }
    
    return {
      ...evaluateEphemeris(ephemeris, mjd, inputScale),
      supported: true,
    };
  }
  
  getCoverage(bodyId: number): [number, number] | null {
    const ephemeris = this.ephemerisMap.get(bodyId);
    if (!ephemeris || ephemeris.segments.length === 0) return null;
    
    const first = ephemeris.segments[0].startMjdTdb;
    const last = ephemeris.segments[ephemeris.segments.length - 1].endMjdTdb;
    return [first, last];
  }
  
  supports(bodyId: number, timeRange: [number, number] | null): boolean {
    const coverage = this.getCoverage(bodyId);
    if (!coverage) return false;
    
    if (!timeRange) return true;
    
    return timeRange[0] >= coverage[0] && timeRange[1] <= coverage[1];
  }
}
