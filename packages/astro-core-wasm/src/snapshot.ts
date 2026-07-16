import { Vec3d, Quatd } from '@solar-system/schemas';

export interface StateSnapshot {
  mjd: number;
  position: Vec3d;
  velocity: Vec3d;
  orientation?: Quatd;
  angularVelocity?: Vec3d;
  valid: boolean;
}

export interface SamplingOptions {
  startTime: number;
  endTime: number;
  samples: number;
  adaptive?: boolean;
  maxError?: number;
}

export interface OrbitSample {
  mjd: number;
  position: Vec3d;
  velocity: Vec3d;
}

export interface AttitudeSample {
  mjd: number;
  orientation: Quatd;
  angularVelocity: Vec3d;
}

export function createSnapshot(
  mjd: number,
  position: Vec3d,
  velocity: Vec3d,
  orientation?: Quatd,
  angularVelocity?: Vec3d,
): StateSnapshot {
  return {
    mjd,
    position: { ...position },
    velocity: { ...velocity },
    orientation: orientation ? { ...orientation } : undefined,
    angularVelocity: angularVelocity ? { ...angularVelocity } : undefined,
    valid: true,
  };
}

export function cloneSnapshot(snapshot: StateSnapshot): StateSnapshot {
  return {
    mjd: snapshot.mjd,
    position: { ...snapshot.position },
    velocity: { ...snapshot.velocity },
    orientation: snapshot.orientation ? { ...snapshot.orientation } : undefined,
    angularVelocity: snapshot.angularVelocity ? { ...snapshot.angularVelocity } : undefined,
    valid: snapshot.valid,
  };
}

export function interpolatePosition(
  snapshot1: StateSnapshot,
  snapshot2: StateSnapshot,
  mjd: number,
): Vec3d {
  if (!snapshot1.valid || !snapshot2.valid) {
    return { x: 0, y: 0, z: 0 };
  }
  
  const t0 = snapshot1.mjd;
  const t1 = snapshot2.mjd;
  
  if (Math.abs(t1 - t0) < 1e-10) {
    return { ...snapshot1.position };
  }
  
  const t = (mjd - t0) / (t1 - t0);
  const t2 = t * t;
  const t3 = t2 * t;
  
  const a0 = 2 * t3 - 3 * t2 + 1;
  const a1 = t3 - 2 * t2 + t;
  const a2 = -2 * t3 + 3 * t2;
  const a3 = t3 - t2;
  
  const dt = t1 - t0;
  
  return {
    x: a0 * snapshot1.position.x + a1 * dt * snapshot1.velocity.x +
       a2 * snapshot2.position.x + a3 * dt * snapshot2.velocity.x,
    y: a0 * snapshot1.position.y + a1 * dt * snapshot1.velocity.y +
       a2 * snapshot2.position.y + a3 * dt * snapshot2.velocity.y,
    z: a0 * snapshot1.position.z + a1 * dt * snapshot1.velocity.z +
       a2 * snapshot2.position.z + a3 * dt * snapshot2.velocity.z,
  };
}

export function interpolateVelocity(
  snapshot1: StateSnapshot,
  snapshot2: StateSnapshot,
  mjd: number,
): Vec3d {
  if (!snapshot1.valid || !snapshot2.valid) {
    return { x: 0, y: 0, z: 0 };
  }
  
  const t0 = snapshot1.mjd;
  const t1 = snapshot2.mjd;
  
  if (Math.abs(t1 - t0) < 1e-10) {
    return { ...snapshot1.velocity };
  }
  
  const t = (mjd - t0) / (t1 - t0);
  const t2 = t * t;
  
  const a0 = 6 * t2 - 6 * t;
  const a1 = 3 * t2 - 4 * t + 1;
  const a2 = -6 * t2 + 6 * t;
  const a3 = 3 * t2 - 2 * t;
  
  const dt = t1 - t0;
  
  return {
    x: (a0 * snapshot1.position.x + a1 * dt * snapshot1.velocity.x +
        a2 * snapshot2.position.x + a3 * dt * snapshot2.velocity.x) / dt,
    y: (a0 * snapshot1.position.y + a1 * dt * snapshot1.velocity.y +
        a2 * snapshot2.position.y + a3 * dt * snapshot2.velocity.y) / dt,
    z: (a0 * snapshot1.position.z + a1 * dt * snapshot1.velocity.z +
        a2 * snapshot2.position.z + a3 * dt * snapshot2.velocity.z) / dt,
  };
}

export function slerp(q1: Quatd, q2: Quatd, t: number): Quatd {
  const dot = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;
  
  let q2Adjusted = q2;
  if (dot < 0) {
    q2Adjusted = { x: -q2.x, y: -q2.y, z: -q2.z, w: -q2.w };
  }
  
  const dotAdjusted = q1.x * q2Adjusted.x + q1.y * q2Adjusted.y + 
                      q1.z * q2Adjusted.z + q1.w * q2Adjusted.w;
  
  let omega: number;
  let sinOmega: number;
  
  if (1 - dotAdjusted < 1e-10) {
    return { ...q1 };
  }
  
  omega = Math.acos(dotAdjusted);
  sinOmega = Math.sin(omega);
  
  const t1 = Math.sin((1 - t) * omega) / sinOmega;
  const t2 = Math.sin(t * omega) / sinOmega;
  
  return {
    x: t1 * q1.x + t2 * q2Adjusted.x,
    y: t1 * q1.y + t2 * q2Adjusted.y,
    z: t1 * q1.z + t2 * q2Adjusted.z,
    w: t1 * q1.w + t2 * q2Adjusted.w,
  };
}

export function interpolateOrientation(
  snapshot1: StateSnapshot,
  snapshot2: StateSnapshot,
  mjd: number,
): Quatd | undefined {
  if (!snapshot1.valid || !snapshot2.valid || !snapshot1.orientation || !snapshot2.orientation) {
    return undefined;
  }
  
  const t0 = snapshot1.mjd;
  const t1 = snapshot2.mjd;
  
  if (Math.abs(t1 - t0) < 1e-10) {
    return { ...snapshot1.orientation };
  }
  
  const t = (mjd - t0) / (t1 - t0);
  return slerp(snapshot1.orientation, snapshot2.orientation, t);
}

export function sampleOrbitUniformly(
  evaluator: (mjd: number) => { position: Vec3d; velocity: Vec3d },
  startTime: number,
  endTime: number,
  samples: number,
): OrbitSample[] {
  const result: OrbitSample[] = [];
  const step = (endTime - startTime) / (samples - 1);
  
  for (let i = 0; i < samples; i++) {
    const mjd = startTime + i * step;
    const state = evaluator(mjd);
    result.push({
      mjd,
      position: state.position,
      velocity: state.velocity,
    });
  }
  
  return result;
}

export function sampleOrbitAdaptive(
  evaluator: (mjd: number) => { position: Vec3d; velocity: Vec3d },
  startTime: number,
  endTime: number,
  maxError: number,
  minSamples: number = 10,
): OrbitSample[] {
  const result: OrbitSample[] = [];
  
  const startState = evaluator(startTime);
  const endState = evaluator(endTime);
  
  result.push({
    mjd: startTime,
    position: startState.position,
    velocity: startState.velocity,
  });
  
  const midTime = (startTime + endTime) / 2;
  const midState = evaluator(midTime);
  
  const interpolated = interpolatePosition(
    createSnapshot(startTime, startState.position, startState.velocity),
    createSnapshot(endTime, endState.position, endState.velocity),
    midTime,
  );
  
  const error = Math.sqrt(
    (midState.position.x - interpolated.x) ** 2 +
    (midState.position.y - interpolated.y) ** 2 +
    (midState.position.z - interpolated.z) ** 2,
  );
  
  if (error > maxError && result.length < 10000) {
    const left = sampleOrbitAdaptive(evaluator, startTime, midTime, maxError, minSamples);
    const right = sampleOrbitAdaptive(evaluator, midTime, endTime, maxError, minSamples);
    result.push(...left.slice(1), ...right.slice(1));
  } else {
    result.push({
      mjd: endTime,
      position: endState.position,
      velocity: endState.velocity,
    });
  }
  
  if (result.length < minSamples) {
    return sampleOrbitUniformly(evaluator, startTime, endTime, minSamples);
  }
  
  return result;
}

export function sampleAttitudeUniformly(
  evaluator: (mjd: number) => { orientation: Quatd; angularVelocity: Vec3d },
  startTime: number,
  endTime: number,
  samples: number,
): AttitudeSample[] {
  const result: AttitudeSample[] = [];
  const step = (endTime - startTime) / (samples - 1);
  
  for (let i = 0; i < samples; i++) {
    const mjd = startTime + i * step;
    const state = evaluator(mjd);
    result.push({
      mjd,
      orientation: state.orientation,
      angularVelocity: state.angularVelocity,
    });
  }
  
  return result;
}

export function findNearestSnapshot(snapshots: StateSnapshot[], mjd: number): StateSnapshot | undefined {
  if (snapshots.length === 0) {
    return undefined;
  }
  
  if (snapshots.length === 1) {
    return snapshots[0];
  }
  
  let left = 0;
  let right = snapshots.length - 1;
  
  while (right - left > 1) {
    const mid = Math.floor((left + right) / 2);
    if (snapshots[mid].mjd < mjd) {
      left = mid;
    } else {
      right = mid;
    }
  }
  
  const dtLeft = Math.abs(mjd - snapshots[left].mjd);
  const dtRight = Math.abs(mjd - snapshots[right].mjd);
  
  return dtLeft <= dtRight ? snapshots[left] : snapshots[right];
}

export function findSnapshotsAround(snapshots: StateSnapshot[], mjd: number): {
  before: StateSnapshot | undefined;
  after: StateSnapshot | undefined;
} {
  if (snapshots.length === 0) {
    return { before: undefined, after: undefined };
  }
  
  let left = 0;
  let right = snapshots.length - 1;
  
  if (mjd <= snapshots[0].mjd) {
    return { before: undefined, after: snapshots[0] };
  }
  
  if (mjd >= snapshots[right].mjd) {
    return { before: snapshots[right], after: undefined };
  }
  
  while (right - left > 1) {
    const mid = Math.floor((left + right) / 2);
    if (snapshots[mid].mjd < mjd) {
      left = mid;
    } else {
      right = mid;
    }
  }
  
  return {
    before: snapshots[left],
    after: snapshots[right],
  };
}

export function validateSnapshot(snapshot: StateSnapshot): boolean {
  const posValid = !isNaN(snapshot.position.x) && !isNaN(snapshot.position.y) && !isNaN(snapshot.position.z);
  const velValid = !isNaN(snapshot.velocity.x) && !isNaN(snapshot.velocity.y) && !isNaN(snapshot.velocity.z);
  
  if (snapshot.orientation) {
    const orientValid = !isNaN(snapshot.orientation.x) && !isNaN(snapshot.orientation.y) &&
                        !isNaN(snapshot.orientation.z) && !isNaN(snapshot.orientation.w);
    const norm = Math.sqrt(
      snapshot.orientation.x ** 2 +
      snapshot.orientation.y ** 2 +
      snapshot.orientation.z ** 2 +
      snapshot.orientation.w ** 2,
    );
    return posValid && velValid && orientValid && Math.abs(norm - 1) < 1e-6;
  }
  
  return posValid && velValid;
}