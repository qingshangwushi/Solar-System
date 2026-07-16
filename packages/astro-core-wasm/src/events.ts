import { Vec3d } from '@solar-system/schemas';

export type EventType =
  | 'new_moon'
  | 'full_moon'
  | 'first_quarter'
  | 'last_quarter'
  | 'solar_eclipse'
  | 'lunar_eclipse'
  | 'conjunction'
  | 'opposition'
  | 'transit'
  | 'occultation'
  | 'ascending_node'
  | 'descending_node'
  | 'perihelion'
  | 'aphelion'
  | 'perigee'
  | 'apogee';

export interface EventResult {
  type: EventType;
  mjd: number;
  accuracy: number;
  body?: string;
  target?: string;
  parameters?: Record<string, number>;
}

export interface EventSearchOptions {
  startTime: number;
  endTime: number;
  maxEvents?: number;
  tolerance?: number;
  maxIterations?: number;
}

export function dot(v1: Vec3d, v2: Vec3d): number {
  return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

export function cross(v1: Vec3d, v2: Vec3d): Vec3d {
  return {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x,
  };
}

export function norm(v: Vec3d): number {
  return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
}

export function normalize(v: Vec3d): Vec3d {
  const n = norm(v);
  if (n < 1e-10) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

export function findRoot(
  func: (mjd: number) => number,
  startTime: number,
  endTime: number,
  tolerance: number = 1e-8,
  maxIterations: number = 50,
): number | null {
  let fStart = func(startTime);
  let fEnd = func(endTime);

  if (Math.abs(fStart) < tolerance) {
    return startTime;
  }
  if (Math.abs(fEnd) < tolerance) {
    return endTime;
  }

  if (fStart * fEnd > 0) {
    return null;
  }

  let left = startTime;
  let right = endTime;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (left + right) / 2;
    const fMid = func(mid);

    if (Math.abs(fMid) < tolerance) {
      return mid;
    }

    if (fStart * fMid < 0) {
      right = mid;
      fEnd = fMid;
    } else {
      left = mid;
      fStart = fMid;
    }

    if (right - left < tolerance) {
      return (left + right) / 2;
    }
  }

  return (left + right) / 2;
}

export function findRootNewton(
  func: (mjd: number) => number,
  derivative: (mjd: number) => number,
  guess: number,
  tolerance: number = 1e-10,
  maxIterations: number = 50,
): number | null {
  let x = guess;

  for (let i = 0; i < maxIterations; i++) {
    const f = func(x);
    if (Math.abs(f) < tolerance) {
      return x;
    }

    const df = derivative(x);
    if (Math.abs(df) < 1e-15) {
      return null;
    }

    x -= f / df;
  }

  return x;
}

export function findAllRoots(
  func: (mjd: number) => number,
  startTime: number,
  endTime: number,
  step: number,
  tolerance: number = 1e-8,
  maxIterations: number = 50,
): number[] {
  const roots: number[] = [];

  let t = startTime;
  while (t < endTime) {
    const nextT = Math.min(t + step, endTime);
    const root = findRoot(func, t, nextT, tolerance, maxIterations);
    if (root !== null) {
      const lastRoot = roots[roots.length - 1];
      if (roots.length === 0 || !lastRoot || Math.abs(root - lastRoot) > step / 2) {
        roots.push(root);
      }
    }
    t = nextT;
  }

  return roots;
}

export function computeMoonPhase(
  sunPosition: Vec3d,
  moonPosition: Vec3d,
  earthPosition: Vec3d,
): number {
  const moonToSun = {
    x: sunPosition.x - moonPosition.x,
    y: sunPosition.y - moonPosition.y,
    z: sunPosition.z - moonPosition.z,
  };
  const moonToEarth = {
    x: earthPosition.x - moonPosition.x,
    y: earthPosition.y - moonPosition.y,
    z: earthPosition.z - moonPosition.z,
  };

  const nMoonToSun = normalize(moonToSun);
  const nMoonToEarth = normalize(moonToEarth);

  const phaseAngle = Math.acos(dot(nMoonToSun, nMoonToEarth));

  return phaseAngle;
}

export function findMoonPhaseEvents(
  sunEvaluator: (mjd: number) => Vec3d,
  moonEvaluator: (mjd: number) => Vec3d,
  earthEvaluator: (mjd: number) => Vec3d,
  options: EventSearchOptions,
): EventResult[] {
  const { startTime, endTime, maxEvents = 100, tolerance = 1e-6 } = options;
  const results: EventResult[] = [];

  const newMoonFunc = (mjd: number) => {
    const sunPos = sunEvaluator(mjd);
    const moonPos = moonEvaluator(mjd);
    const earthPos = earthEvaluator(mjd);
    const phase = computeMoonPhase(sunPos, moonPos, earthPos);
    return phase - Math.PI;
  };

  const fullMoonFunc = (mjd: number) => {
    const sunPos = sunEvaluator(mjd);
    const moonPos = moonEvaluator(mjd);
    const earthPos = earthEvaluator(mjd);
    const phase = computeMoonPhase(sunPos, moonPos, earthPos);
    return phase;
  };

  const firstQuarterFunc = (mjd: number) => {
    const sunPos = sunEvaluator(mjd);
    const moonPos = moonEvaluator(mjd);
    const earthPos = earthEvaluator(mjd);
    const phase = computeMoonPhase(sunPos, moonPos, earthPos);
    return phase - Math.PI / 2;
  };

  const lastQuarterFunc = (mjd: number) => {
    const sunPos = sunEvaluator(mjd);
    const moonPos = moonEvaluator(mjd);
    const earthPos = earthEvaluator(mjd);
    const phase = computeMoonPhase(sunPos, moonPos, earthPos);
    return phase - (3 * Math.PI) / 2;
  };

  const step = 15;

  const newMoons = findAllRoots(newMoonFunc, startTime, endTime, step, tolerance);
  const fullMoons = findAllRoots(fullMoonFunc, startTime, endTime, step, tolerance);
  const firstQuarters = findAllRoots(firstQuarterFunc, startTime, endTime, step, tolerance);
  const lastQuarters = findAllRoots(lastQuarterFunc, startTime, endTime, step, tolerance);

  for (const mjd of newMoons) {
    if (results.length < maxEvents) {
      results.push({ type: 'new_moon', mjd, accuracy: tolerance });
    }
  }

  for (const mjd of firstQuarters) {
    if (results.length < maxEvents) {
      results.push({ type: 'first_quarter', mjd, accuracy: tolerance });
    }
  }

  for (const mjd of fullMoons) {
    if (results.length < maxEvents) {
      results.push({ type: 'full_moon', mjd, accuracy: tolerance });
    }
  }

  for (const mjd of lastQuarters) {
    if (results.length < maxEvents) {
      results.push({ type: 'last_quarter', mjd, accuracy: tolerance });
    }
  }

  results.sort((a, b) => a.mjd - b.mjd);

  return results.slice(0, maxEvents);
}

export function computeConjunctionAngle(
  bodyPosition: Vec3d,
  sunPosition: Vec3d,
  earthPosition: Vec3d,
): number {
  const earthToSun = normalize({
    x: sunPosition.x - earthPosition.x,
    y: sunPosition.y - earthPosition.y,
    z: sunPosition.z - earthPosition.z,
  });

  const earthToBody = normalize({
    x: bodyPosition.x - earthPosition.x,
    y: bodyPosition.y - earthPosition.y,
    z: bodyPosition.z - earthPosition.z,
  });

  return Math.acos(dot(earthToSun, earthToBody));
}

export function findConjunctions(
  bodyEvaluator: (mjd: number) => Vec3d,
  sunEvaluator: (mjd: number) => Vec3d,
  earthEvaluator: (mjd: number) => Vec3d,
  options: EventSearchOptions,
  bodyName: string,
): EventResult[] {
  const { startTime, endTime, maxEvents = 100, tolerance = 1e-6 } = options;
  const results: EventResult[] = [];

  const func = (mjd: number) => {
    const bodyPos = bodyEvaluator(mjd);
    const sunPos = sunEvaluator(mjd);
    const earthPos = earthEvaluator(mjd);
    const angle = computeConjunctionAngle(bodyPos, sunPos, earthPos);
    return angle;
  };

  const step = 30;
  const roots = findAllRoots(func, startTime, endTime, step, tolerance);

  for (const mjd of roots) {
    if (results.length < maxEvents) {
      results.push({ type: 'conjunction', mjd, accuracy: tolerance, body: bodyName });
    }
  }

  return results;
}

export function findOppositions(
  bodyEvaluator: (mjd: number) => Vec3d,
  sunEvaluator: (mjd: number) => Vec3d,
  earthEvaluator: (mjd: number) => Vec3d,
  options: EventSearchOptions,
  bodyName: string,
): EventResult[] {
  const { startTime, endTime, maxEvents = 100, tolerance = 1e-6 } = options;
  const results: EventResult[] = [];

  const func = (mjd: number) => {
    const bodyPos = bodyEvaluator(mjd);
    const sunPos = sunEvaluator(mjd);
    const earthPos = earthEvaluator(mjd);
    const angle = computeConjunctionAngle(bodyPos, sunPos, earthPos);
    return angle - Math.PI;
  };

  const step = 30;
  const roots = findAllRoots(func, startTime, endTime, step, tolerance);

  for (const mjd of roots) {
    if (results.length < maxEvents) {
      results.push({ type: 'opposition', mjd, accuracy: tolerance, body: bodyName });
    }
  }

  return results;
}

export function computeOrbitalRadius(
  bodyPosition: Vec3d,
  centralBodyPosition: Vec3d,
): number {
  const dx = bodyPosition.x - centralBodyPosition.x;
  const dy = bodyPosition.y - centralBodyPosition.y;
  const dz = bodyPosition.z - centralBodyPosition.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function findOrbitalExtrema(
  bodyEvaluator: (mjd: number) => Vec3d,
  centralEvaluator: (mjd: number) => Vec3d,
  options: EventSearchOptions,
  bodyName: string,
  isOrbitingSun: boolean = true,
): EventResult[] {
  const { startTime, endTime, maxEvents = 100, tolerance = 1e-6 } = options;
  const results: EventResult[] = [];

  const func = (mjd: number) => {
    const centralPos = centralEvaluator(mjd);

    const dt = 1e-5;
    const bodyPosPlus = bodyEvaluator(mjd + dt);
    const bodyPosMinus = bodyEvaluator(mjd - dt);

    const rPlus = computeOrbitalRadius(bodyPosPlus, centralPos);
    const rMinus = computeOrbitalRadius(bodyPosMinus, centralPos);

    const derivative = (rPlus - rMinus) / (2 * dt);
    return derivative;
  };

  const step = 30;
  const roots = findAllRoots(func, startTime, endTime, step, tolerance);

  for (const mjd of roots) {
    if (results.length >= maxEvents) break;

    const bodyPos = bodyEvaluator(mjd);
    const centralPos = centralEvaluator(mjd);
    const r = computeOrbitalRadius(bodyPos, centralPos);

    const dt = 1e-5;
    const bodyPosPlus = bodyEvaluator(mjd + dt);
    const bodyPosMinus = bodyEvaluator(mjd - dt);
    const rPlus = computeOrbitalRadius(bodyPosPlus, centralPos);
    const rMinus = computeOrbitalRadius(bodyPosMinus, centralPos);

    if (r < rPlus && r < rMinus) {
      results.push({
        type: isOrbitingSun ? 'perihelion' : 'perigee',
        mjd,
        accuracy: tolerance,
        body: bodyName,
        parameters: { distance: r },
      });
    } else if (r > rPlus && r > rMinus) {
      results.push({
        type: isOrbitingSun ? 'aphelion' : 'apogee',
        mjd,
        accuracy: tolerance,
        body: bodyName,
        parameters: { distance: r },
      });
    }
  }

  return results;
}

export function computeNodeCrossing(
  bodyPosition: Vec3d,
  _bodyVelocity: Vec3d,
  centralBodyPosition: Vec3d,
  ascending: boolean,
): number {
  const relPos = {
    x: bodyPosition.x - centralBodyPosition.x,
    y: bodyPosition.y - centralBodyPosition.y,
    z: bodyPosition.z - centralBodyPosition.z,
  };

  if (ascending) {
    return relPos.z;
  } else {
    return -relPos.z;
  }
}

export function findNodes(
  bodyEvaluator: (mjd: number) => { position: Vec3d; velocity: Vec3d },
  centralEvaluator: (mjd: number) => Vec3d,
  options: EventSearchOptions,
  bodyName: string,
): EventResult[] {
  const { startTime, endTime, maxEvents = 100, tolerance = 1e-6 } = options;
  const results: EventResult[] = [];

  const ascendingFunc = (mjd: number) => {
    const state = bodyEvaluator(mjd);
    const centralPos = centralEvaluator(mjd);
    return computeNodeCrossing(state.position, state.velocity, centralPos, true);
  };

  const descendingFunc = (mjd: number) => {
    const state = bodyEvaluator(mjd);
    const centralPos = centralEvaluator(mjd);
    return computeNodeCrossing(state.position, state.velocity, centralPos, false);
  };

  const step = 30;

  const ascendingNodes = findAllRoots(ascendingFunc, startTime, endTime, step, tolerance);
  const descendingNodes = findAllRoots(descendingFunc, startTime, endTime, step, tolerance);

  for (const mjd of ascendingNodes) {
    if (results.length < maxEvents) {
      results.push({ type: 'ascending_node', mjd, accuracy: tolerance, body: bodyName });
    }
  }

  for (const mjd of descendingNodes) {
    if (results.length < maxEvents) {
      results.push({ type: 'descending_node', mjd, accuracy: tolerance, body: bodyName });
    }
  }

  results.sort((a, b) => a.mjd - b.mjd);

  return results;
}

export function findEclipses(
  sunEvaluator: (mjd: number) => Vec3d,
  moonEvaluator: (mjd: number) => Vec3d,
  earthEvaluator: (mjd: number) => Vec3d,
  options: EventSearchOptions,
): EventResult[] {
  const { startTime, endTime, maxEvents = 100, tolerance = 1e-6 } = options;
  const results: EventResult[] = [];

  const solarEclipseFunc = (mjd: number) => {
    const sunPos = sunEvaluator(mjd);
    const moonPos = moonEvaluator(mjd);
    const earthPos = earthEvaluator(mjd);

    const earthToSun = normalize({
      x: sunPos.x - earthPos.x,
      y: sunPos.y - earthPos.y,
      z: sunPos.z - earthPos.z,
    });

    const earthToMoon = normalize({
      x: moonPos.x - earthPos.x,
      y: moonPos.y - earthPos.y,
      z: moonPos.z - earthPos.z,
    });

    const angularSeparation = Math.acos(dot(earthToSun, earthToMoon));

    const sunRadius = 696340;
    const moonRadius = 1737.4;
    const earthSunDist = norm({
      x: sunPos.x - earthPos.x,
      y: sunPos.y - earthPos.y,
      z: sunPos.z - earthPos.z,
    });
    const earthMoonDist = norm({
      x: moonPos.x - earthPos.x,
      y: moonPos.y - earthPos.y,
      z: moonPos.z - earthPos.z,
    });

    const sunAngularRadius = Math.asin(sunRadius / earthSunDist);
    const moonAngularRadius = Math.asin(moonRadius / earthMoonDist);

    return angularSeparation - (sunAngularRadius + moonAngularRadius);
  };

  const lunarEclipseFunc = (mjd: number) => {
    const sunPos = sunEvaluator(mjd);
    const moonPos = moonEvaluator(mjd);
    const earthPos = earthEvaluator(mjd);

    const moonToEarth = normalize({
      x: earthPos.x - moonPos.x,
      y: earthPos.y - moonPos.y,
      z: earthPos.z - moonPos.z,
    });

    const moonToSun = normalize({
      x: sunPos.x - moonPos.x,
      y: sunPos.y - moonPos.y,
      z: sunPos.z - moonPos.z,
    });

    const angularSeparation = Math.acos(dot(moonToEarth, moonToSun));

    const earthRadius = 6371;
    const moonRadius = 1737.4;
    const earthMoonDist = norm({
      x: moonPos.x - earthPos.x,
      y: moonPos.y - earthPos.y,
      z: moonPos.z - earthPos.z,
    });

    const earthAngularRadius = Math.asin(earthRadius / earthMoonDist);
    const moonAngularRadius = Math.asin(moonRadius / earthMoonDist);

    return angularSeparation - (earthAngularRadius + moonAngularRadius);
  };

  const step = 5;

  const solarEclipses = findAllRoots(solarEclipseFunc, startTime, endTime, step, tolerance);
  const lunarEclipses = findAllRoots(lunarEclipseFunc, startTime, endTime, step, tolerance);

  for (const mjd of solarEclipses) {
    if (results.length < maxEvents) {
      results.push({ type: 'solar_eclipse', mjd, accuracy: tolerance });
    }
  }

  for (const mjd of lunarEclipses) {
    if (results.length < maxEvents) {
      results.push({ type: 'lunar_eclipse', mjd, accuracy: tolerance });
    }
  }

  results.sort((a, b) => a.mjd - b.mjd);

  return results;
}