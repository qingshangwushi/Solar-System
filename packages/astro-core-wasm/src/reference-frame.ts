import type { ReferenceFrame, Vec3d, Quat64 } from '@solar-system/schemas';

export interface RotationMatrix {
  m00: number; m01: number; m02: number;
  m10: number; m11: number; m12: number;
  m20: number; m21: number; m22: number;
}

export function multiplyMatrix(a: RotationMatrix, b: RotationMatrix): RotationMatrix {
  return {
    m00: a.m00 * b.m00 + a.m01 * b.m10 + a.m02 * b.m20,
    m01: a.m00 * b.m01 + a.m01 * b.m11 + a.m02 * b.m21,
    m02: a.m00 * b.m02 + a.m01 * b.m12 + a.m02 * b.m22,
    m10: a.m10 * b.m00 + a.m11 * b.m10 + a.m12 * b.m20,
    m11: a.m10 * b.m01 + a.m11 * b.m11 + a.m12 * b.m21,
    m12: a.m10 * b.m02 + a.m11 * b.m12 + a.m12 * b.m22,
    m20: a.m20 * b.m00 + a.m21 * b.m10 + a.m22 * b.m20,
    m21: a.m20 * b.m01 + a.m21 * b.m11 + a.m22 * b.m21,
    m22: a.m20 * b.m02 + a.m21 * b.m12 + a.m22 * b.m22,
  };
}

export function transposeMatrix(m: RotationMatrix): RotationMatrix {
  return {
    m00: m.m00, m01: m.m10, m02: m.m20,
    m10: m.m01, m11: m.m11, m12: m.m21,
    m20: m.m02, m21: m.m12, m22: m.m22,
  };
}

export function matrixToQuaternion(m: RotationMatrix): Quat64 {
  const trace = m.m00 + m.m11 + m.m22;
  
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    return {
      w: 0.25 * s,
      x: (m.m21 - m.m12) / s,
      y: (m.m02 - m.m20) / s,
      z: (m.m10 - m.m01) / s,
    };
  } else if (m.m00 > m.m11 && m.m00 > m.m22) {
    const s = 2 * Math.sqrt(1 + m.m00 - m.m11 - m.m22);
    return {
      w: (m.m21 - m.m12) / s,
      x: 0.25 * s,
      y: (m.m01 + m.m10) / s,
      z: (m.m02 + m.m20) / s,
    };
  } else if (m.m11 > m.m22) {
    const s = 2 * Math.sqrt(1 + m.m11 - m.m00 - m.m22);
    return {
      w: (m.m02 - m.m20) / s,
      x: (m.m01 + m.m10) / s,
      y: 0.25 * s,
      z: (m.m12 + m.m21) / s,
    };
  } else {
    const s = 2 * Math.sqrt(1 + m.m22 - m.m00 - m.m11);
    return {
      w: (m.m10 - m.m01) / s,
      x: (m.m02 + m.m20) / s,
      y: (m.m12 + m.m21) / s,
      z: 0.25 * s,
    };
  }
}

export function quaternionToMatrix(q: Quat64): RotationMatrix {
  const { w, x, y, z } = q;
  const x2 = x * 2; const y2 = y * 2; const z2 = z * 2;
  const xx = x * x2; const xy = x * y2; const xz = x * z2;
  const yy = y * y2; const yz = y * z2; const zz = z * z2;
  const wx = w * x2; const wy = w * y2; const wz = w * z2;
  
  return {
    m00: 1 - yy - zz, m01: xy - wz, m02: xz + wy,
    m10: xy + wz, m11: 1 - xx - zz, m12: yz - wx,
    m20: xz - wy, m21: yz + wx, m22: 1 - xx - yy,
  };
}

export function rotateVector(m: RotationMatrix, v: Vec3d): Vec3d {
  return {
    x: m.m00 * v.x + m.m01 * v.y + m.m02 * v.z,
    y: m.m10 * v.x + m.m11 * v.y + m.m12 * v.z,
    z: m.m20 * v.x + m.m21 * v.y + m.m22 * v.z,
  };
}

export function rotateVectorInverse(m: RotationMatrix, v: Vec3d): Vec3d {
  return {
    x: m.m00 * v.x + m.m10 * v.y + m.m20 * v.z,
    y: m.m01 * v.x + m.m11 * v.y + m.m21 * v.z,
    z: m.m02 * v.x + m.m12 * v.y + m.m22 * v.z,
  };
}

export function quaternionMultiply(a: Quat64, b: Quat64): Quat64 {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quaternionInverse(q: Quat64): Quat64 {
  const norm = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;
  return {
    w: q.w / norm,
    x: -q.x / norm,
    y: -q.y / norm,
    z: -q.z / norm,
  };
}

export function rotateVectorQuaternion(q: Quat64, v: Vec3d): Vec3d {
  const qv: Quat64 = { w: 0, x: v.x, y: v.y, z: v.z };
  const qInv = quaternionInverse(q);
  const qvq = quaternionMultiply(q, quaternionMultiply(qv, qInv));
  return { x: qvq.x, y: qvq.y, z: qvq.z };
}

export function eulerToQuaternion(alpha: number, delta: number, gamma: number): Quat64 {
  const ca = Math.cos(alpha / 2);
  const sa = Math.sin(alpha / 2);
  const cd = Math.cos(delta / 2);
  const sd = Math.sin(delta / 2);
  const cg = Math.cos(gamma / 2);
  const sg = Math.sin(gamma / 2);
  
  return {
    w: ca * cd * cg + sa * sd * sg,
    x: sa * cd * cg - ca * sd * sg,
    y: ca * sd * cg + sa * cd * sg,
    z: ca * cd * sg - sa * sd * cg,
  };
}

export function quaternionToEuler(q: Quat64): { alpha: number; delta: number; gamma: number } {
  const { w, x, y, z } = q;
  
  const delta = Math.asin(2 * (w * y - z * x));
  
  if (Math.abs(delta) < Math.PI / 2 - 1e-6) {
    const alpha = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    const gamma = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    return { alpha, delta, gamma };
  } else {
    const alpha = Math.atan2(2 * (x * z + w * y), 2 * (w * w + z * z) - 1);
    const gamma = 0;
    return { alpha, delta, gamma };
  }
}

export function computePrecessionMatrix(mjdTt: number): RotationMatrix {
  const jdTt = mjdTt + 2400000.5;
  const t = (jdTt - 2451545.0) / 36525.0;
  
  const zeta = (2306.2181 + 1.39656 * t - 0.000139 * t * t) * Math.PI / 180 / 3600;
  const z = (2306.2181 + 1.39656 * t - 0.000139 * t * t) * Math.PI / 180 / 3600;
  const theta = (2004.3109 - 0.85330 * t - 0.000217 * t * t) * Math.PI / 180 / 3600;
  
  const cz = Math.cos(z); const sz = Math.sin(z);
  const ct = Math.cos(theta); const st = Math.sin(theta);
  const czeta = Math.cos(zeta); const szeta = Math.sin(zeta);
  
  const rz = { m00: cz, m01: sz, m02: 0, m10: -sz, m11: cz, m12: 0, m20: 0, m21: 0, m22: 1 };
  const ry = { m00: ct, m01: 0, m02: -st, m10: 0, m11: 1, m12: 0, m20: st, m21: 0, m22: ct };
  const rzeta = { m00: czeta, m01: szeta, m02: 0, m10: -szeta, m11: czeta, m12: 0, m20: 0, m21: 0, m22: 1 };
  
  return multiplyMatrix(multiplyMatrix(rzeta, ry), rz);
}

export function computeNutationMatrix(mjdTt: number): RotationMatrix {
  const jdTt = mjdTt + 2400000.5;
  const t = (jdTt - 2451545.0) / 36525.0;
  
  const dPsi = (-17.2 * Math.sin(125.0 - 0.05295 * (jdTt - 2451545.0))
    - 1.3 * Math.sin(200.9 + 1.97129 * (jdTt - 2451545.0))
    - 0.2 * Math.sin(196.3 + 328.9489 * (jdTt - 2451545.0))
    - 0.2 * Math.sin(249.6 + 1.9641 * (jdTt - 2451545.0))
    - 0.1 * Math.sin(340.9 + 26.4351 * (jdTt - 2451545.0))) * Math.PI / 180 / 3600;
  
  const dEps = (9.2 * Math.cos(125.0 - 0.05295 * (jdTt - 2451545.0))
    + 0.5 * Math.cos(200.9 + 1.97129 * (jdTt - 2451545.0))
    + 0.1 * Math.cos(196.3 + 328.9489 * (jdTt - 2451545.0))
    + 0.1 * Math.cos(249.6 + 1.9641 * (jdTt - 2451545.0))) * Math.PI / 180 / 3600;
  
  const eps = (23.43929111 - 0.0130042 * t - 0.00000016 * t * t + 0.000000504 * t * t * t) * Math.PI / 180;
  
  const cPsi = Math.cos(dPsi); const sPsi = Math.sin(dPsi);
  const cEps = Math.cos(eps); const sEps = Math.sin(eps);
  const cEpsD = Math.cos(eps + dEps); const sEpsD = Math.sin(eps + dEps);
  
  return {
    m00: cPsi,
    m01: sPsi * cEps,
    m02: sPsi * sEps,
    m10: -sPsi * cEpsD,
    m11: cPsi * cEps * cEpsD + sEps * sEpsD,
    m12: cPsi * sEps * cEpsD - cEps * sEpsD,
    m20: -sPsi * sEpsD,
    m21: cPsi * cEps * sEpsD - sEps * cEpsD,
    m22: cPsi * sEps * sEpsD + cEps * cEpsD,
  };
}

export function computeGmst(mjdUtc: number): number {
  const jdUtc = mjdUtc + 2400000.5;
  const d = jdUtc - 2451545.0;
  const gmst = 18.697374558 + 24.06570982441908 * d;
  return (gmst % 24 + 24) % 24;
}

export function computeSiderealTime(mjdUtc: number, longitudeDeg: number): number {
  const gmst = computeGmst(mjdUtc);
  const lmst = gmst + longitudeDeg / 15;
  return (lmst % 24 + 24) % 24;
}

export function computeEciToEcefMatrix(mjdUtc: number): RotationMatrix {
  const gmstHours = computeGmst(mjdUtc);
  const angle = gmstHours * 2 * Math.PI / 24;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  
  return {
    m00: c, m01: -s, m02: 0,
    m10: s, m11: c, m12: 0,
    m20: 0, m21: 0, m22: 1,
  };
}

export function computeEquatorialToEclipticMatrix(mjdTt: number): RotationMatrix {
  const jdTt = mjdTt + 2400000.5;
  const t = (jdTt - 2451545.0) / 36525.0;
  const eps = (23.43929111 - 0.0130042 * t - 0.00000016 * t * t + 0.000000504 * t * t * t) * Math.PI / 180;
  
  const c = Math.cos(eps);
  const s = Math.sin(eps);
  
  return {
    m00: 1, m01: 0, m02: 0,
    m10: 0, m11: c, m12: s,
    m20: 0, m21: -s, m22: c,
  };
}

export function getFrameRotationMatrix(fromFrame: ReferenceFrame, toFrame: ReferenceFrame, mjdTt: number, mjdUtc: number): RotationMatrix {
  if (fromFrame === toFrame) {
    return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
  }
  
  const precession = computePrecessionMatrix(mjdTt);
  const nutation = computeNutationMatrix(mjdTt);
  const equatorialToEcliptic = computeEquatorialToEclipticMatrix(mjdTt);
  const eciToEcef = computeEciToEcefMatrix(mjdUtc);
  
  const icrsToEci = multiplyMatrix(nutation, precession);
  
  switch (fromFrame) {
    case 'SolarSystemBarycentricInertial':
      switch (toFrame) {
        case 'HeliocentricInertial':
          return equatorialToEcliptic;
        case 'BodyBarycentric':
        case 'BodyFixed':
        case 'SurfaceLocalEnu':
        case 'ObserverRelative':
          return multiplyMatrix(icrsToEci, equatorialToEcliptic);
        default:
          return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
      }
    
    case 'HeliocentricInertial':
      switch (toFrame) {
        case 'SolarSystemBarycentricInertial':
          return transposeMatrix(equatorialToEcliptic);
        case 'BodyBarycentric':
        case 'BodyFixed':
        case 'SurfaceLocalEnu':
        case 'ObserverRelative':
          return icrsToEci;
        default:
          return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
      }
    
    case 'BodyBarycentric':
      switch (toFrame) {
        case 'BodyFixed':
          return eciToEcef;
        case 'SurfaceLocalEnu':
        case 'ObserverRelative':
          return eciToEcef;
        case 'SolarSystemBarycentricInertial':
          return transposeMatrix(multiplyMatrix(icrsToEci, equatorialToEcliptic));
        case 'HeliocentricInertial':
          return transposeMatrix(icrsToEci);
        default:
          return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
      }
    
    case 'BodyFixed':
      switch (toFrame) {
        case 'BodyBarycentric':
          return transposeMatrix(eciToEcef);
        case 'SurfaceLocalEnu':
        case 'ObserverRelative':
          return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
        case 'SolarSystemBarycentricInertial':
          return transposeMatrix(multiplyMatrix(multiplyMatrix(icrsToEci, equatorialToEcliptic), eciToEcef));
        case 'HeliocentricInertial':
          return transposeMatrix(multiplyMatrix(icrsToEci, eciToEcef));
        default:
          return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
      }
    
    default:
      return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 };
  }
}

export function transformFrame(position: Vec3d, fromFrame: ReferenceFrame, toFrame: ReferenceFrame, mjdTt: number, mjdUtc: number): Vec3d {
  const matrix = getFrameRotationMatrix(fromFrame, toFrame, mjdTt, mjdUtc);
  return rotateVector(matrix, position);
}

export function computeBodyFixedOrientation(mjdUtc: number, poleRaDeg: number, poleDecDeg: number, primeMeridianDeg: number): Quat64 {
  const gmstHours = computeGmst(mjdUtc);
  const siderealAngle = (gmstHours * 15 + primeMeridianDeg) * Math.PI / 180;
  
  const poleRa = poleRaDeg * Math.PI / 180;
  const poleDec = poleDecDeg * Math.PI / 180;
  
  const qPole = eulerToQuaternion(poleRa, Math.PI / 2 - poleDec, 0);
  const qSidereal = eulerToQuaternion(0, 0, siderealAngle);
  
  return quaternionMultiply(qSidereal, qPole);
}
