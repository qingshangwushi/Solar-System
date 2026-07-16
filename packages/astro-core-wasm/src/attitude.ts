import { Vec3d, Quatd, RotMat3x3 } from '@solar-system/schemas';

export interface AxialModel {
  poleRightAscension: number;
  poleDeclination: number;
  obliquity: number;
  rotationPeriod: number;
  initialAngle: number;
  angleRate: number;
}

export interface AttitudeState {
  orientation: Quatd;
  angularVelocity: Vec3d;
  polePosition: Vec3d;
  subpoint: Vec3d | null;
}

export const DEFAULT_AXIAL_MODELS: Record<string, AxialModel> = {
  Sun: {
    poleRightAscension: 286.13,
    poleDeclination: 63.87,
    obliquity: 7.25,
    rotationPeriod: 25.4 * 86400,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / (25.4 * 86400),
  },
  Mercury: {
    poleRightAscension: 281.01,
    poleDeclination: 61.45,
    obliquity: 0.034,
    rotationPeriod: 58.646 * 86400,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / (58.646 * 86400),
  },
  Venus: {
    poleRightAscension: 272.76,
    poleDeclination: 67.16,
    obliquity: 177.36,
    rotationPeriod: 243.025 * 86400,
    initialAngle: 0,
    angleRate: -(2 * Math.PI) / (243.025 * 86400),
  },
  Earth: {
    poleRightAscension: 0,
    poleDeclination: 90,
    obliquity: 23.439281,
    rotationPeriod: 86164.0905,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / 86164.0905,
  },
  Moon: {
    poleRightAscension: 266.8,
    poleDeclination: 66.5,
    obliquity: 6.68,
    rotationPeriod: 27.321661 * 86400,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / (27.321661 * 86400),
  },
  Mars: {
    poleRightAscension: 317.681,
    poleDeclination: 52.886,
    obliquity: 25.19,
    rotationPeriod: 88642.66,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / 88642.66,
  },
  Jupiter: {
    poleRightAscension: 268.057,
    poleDeclination: 64.496,
    obliquity: 3.12,
    rotationPeriod: 35700,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / 35700,
  },
  Saturn: {
    poleRightAscension: 40.589,
    poleDeclination: 83.537,
    obliquity: 26.73,
    rotationPeriod: 38700,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / 38700,
  },
  Uranus: {
    poleRightAscension: 257.311,
    poleDeclination: -15.175,
    obliquity: 97.77,
    rotationPeriod: 50500,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / 50500,
  },
  Neptune: {
    poleRightAscension: 299.36,
    poleDeclination: 43.46,
    obliquity: 28.32,
    rotationPeriod: 56800,
    initialAngle: 0,
    angleRate: (2 * Math.PI) / 56800,
  },
};

export function degToRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function radToDeg(radians: number): number {
  return radians * 180 / Math.PI;
}

export function createRotationMatrixFromPole(poleRa: number, poleDec: number): RotMat3x3 {
  const alpha = degToRad(poleRa);
  const delta = degToRad(poleDec);
  
  const cosAlpha = Math.cos(alpha);
  const sinAlpha = Math.sin(alpha);
  const cosDelta = Math.cos(delta);
  const sinDelta = Math.sin(delta);
  
  return {
    r00: -sinAlpha,
    r01: cosAlpha,
    r02: 0,
    r10: -cosAlpha * cosDelta,
    r11: -sinAlpha * cosDelta,
    r12: sinDelta,
    r20: cosAlpha * sinDelta,
    r21: sinAlpha * sinDelta,
    r22: cosDelta,
  };
}

export function matrixToQuaternion(matrix: RotMat3x3): Quatd {
  const trace = matrix.r00 + matrix.r11 + matrix.r22;
  
  let qw: number, qx: number, qy: number, qz: number;
  
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    qw = 0.25 * s;
    qx = (matrix.r21 - matrix.r12) / s;
    qy = (matrix.r02 - matrix.r20) / s;
    qz = (matrix.r10 - matrix.r01) / s;
  } else if (matrix.r00 > matrix.r11 && matrix.r00 > matrix.r22) {
    const s = 2 * Math.sqrt(1 + matrix.r00 - matrix.r11 - matrix.r22);
    qw = (matrix.r21 - matrix.r12) / s;
    qx = 0.25 * s;
    qy = (matrix.r01 + matrix.r10) / s;
    qz = (matrix.r02 + matrix.r20) / s;
  } else if (matrix.r11 > matrix.r22) {
    const s = 2 * Math.sqrt(1 + matrix.r11 - matrix.r00 - matrix.r22);
    qw = (matrix.r02 - matrix.r20) / s;
    qx = (matrix.r01 + matrix.r10) / s;
    qy = 0.25 * s;
    qz = (matrix.r12 + matrix.r21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + matrix.r22 - matrix.r00 - matrix.r11);
    qw = (matrix.r10 - matrix.r01) / s;
    qx = (matrix.r02 + matrix.r20) / s;
    qy = (matrix.r12 + matrix.r21) / s;
    qz = 0.25 * s;
  }
  
  const norm = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
  return {
    x: qx / norm,
    y: qy / norm,
    z: qz / norm,
    w: qw / norm,
  };
}

export function quaternionMultiply(q1: Quatd, q2: Quatd): Quatd {
  return {
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
  };
}

export function createRotationQuaternion(axis: Vec3d, angle: number): Quatd {
  const halfAngle = angle / 2;
  const sinHalf = Math.sin(halfAngle);
  const norm = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
  
  if (norm < 1e-10) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  
  return {
    x: (axis.x / norm) * sinHalf,
    y: (axis.y / norm) * sinHalf,
    z: (axis.z / norm) * sinHalf,
    w: Math.cos(halfAngle),
  };
}

export function computeRotationAngle(mjdUtc: number, model: AxialModel): number {
  const j2000 = 51544.5;
  const deltaDays = mjdUtc - j2000;
  const deltaSeconds = deltaDays * 86400;
  return model.initialAngle + model.angleRate * deltaSeconds;
}

export function computeAttitude(mjdUtc: number, model: AxialModel): AttitudeState {
  const rotationAngle = computeRotationAngle(mjdUtc, model);
  
  const poleMatrix = createRotationMatrixFromPole(model.poleRightAscension, model.poleDeclination);
  const poleQuat = matrixToQuaternion(poleMatrix);
  
  const spinAxis: Vec3d = {
    x: Math.cos(degToRad(model.poleDeclination)) * Math.cos(degToRad(model.poleRightAscension)),
    y: Math.cos(degToRad(model.poleDeclination)) * Math.sin(degToRad(model.poleRightAscension)),
    z: Math.sin(degToRad(model.poleDeclination)),
  };
  
  const spinQuat = createRotationQuaternion(spinAxis, rotationAngle);
  
  const orientation = quaternionMultiply(spinQuat, poleQuat);
  
  const angularVelocity: Vec3d = {
    x: spinAxis.x * model.angleRate,
    y: spinAxis.y * model.angleRate,
    z: spinAxis.z * model.angleRate,
  };
  
  const polePosition: Vec3d = {
    x: spinAxis.x,
    y: spinAxis.y,
    z: spinAxis.z,
  };
  
  return {
    orientation,
    angularVelocity,
    polePosition,
    subpoint: null,
  };
}

export function computeSubpoint(
  bodyPosition: Vec3d,
  observerPosition: Vec3d,
  model: AxialModel,
  mjdUtc: number,
): Vec3d {
  const bodyToObserver: Vec3d = {
    x: observerPosition.x - bodyPosition.x,
    y: observerPosition.y - bodyPosition.y,
    z: observerPosition.z - bodyPosition.z,
  };
  
  const norm = Math.sqrt(bodyToObserver.x ** 2 + bodyToObserver.y ** 2 + bodyToObserver.z ** 2);
  const lineOfSight: Vec3d = {
    x: bodyToObserver.x / norm,
    y: bodyToObserver.y / norm,
    z: bodyToObserver.z / norm,
  };
  
  const rotationAngle = computeRotationAngle(mjdUtc, model);
  
  const poleMatrix = createRotationMatrixFromPole(model.poleRightAscension, model.poleDeclination);
  const poleQuat = matrixToQuaternion(poleMatrix);
  
  const spinAxis: Vec3d = {
    x: Math.cos(degToRad(model.poleDeclination)) * Math.cos(degToRad(model.poleRightAscension)),
    y: Math.cos(degToRad(model.poleDeclination)) * Math.sin(degToRad(model.poleRightAscension)),
    z: Math.sin(degToRad(model.poleDeclination)),
  };
  
  const spinQuat = createRotationQuaternion(spinAxis, -rotationAngle);
  
  const invOrientation = quaternionMultiply(spinQuat, poleQuat);
  
  const subpoint = rotateVectorByQuaternion(lineOfSight, invOrientation);
  
  return subpoint;
}

export function rotateVectorByQuaternion(v: Vec3d, q: Quatd): Vec3d {
  const { x, y, z, w } = q;
  const vx = v.x, vy = v.y, vz = v.z;
  
  const t0 = w * vx + y * vz - z * vy;
  const t1 = w * vy + z * vx - x * vz;
  const t2 = w * vz + x * vy - y * vx;
  const t3 = -x * vx - y * vy - z * vz;
  
  return {
    x: t0 * w + t3 * -x + t1 * -z - t2 * -y,
    y: t1 * w + t3 * -y + t2 * -x - t0 * -z,
    z: t2 * w + t3 * -z + t0 * -y - t1 * -x,
  };
}

export function getAxialModel(bodyName: string): AxialModel | undefined {
  return DEFAULT_AXIAL_MODELS[bodyName];
}