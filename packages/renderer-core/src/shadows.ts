/**
 * 阴影和交食几何（任务 P2-6）。
 *
 * 实现阴影锥计算、日食/月食检测、阴影渲染参数。
 */

import { Vec3d } from '@solar-system/schemas';

export interface ShadowCone {
  apex: Vec3d;
  direction: Vec3d;
  umbraRadius: number;
  penumbraRadius: number;
  umbraLength: number;
  penumbraLength: number;
}

export interface EclipseInfo {
  type: 'solar' | 'lunar' | 'none';
  magnitude: number;
  obscuration: number;
  partialBegin: number | null;
  totalBegin: number | null;
  maximum: number | null;
  totalEnd: number | null;
  partialEnd: number | null;
  centralLine: Vec3d | null;
}

export interface ShadowParams {
  casterPosition: Vec3d;
  casterRadius: number;
  lightPosition: Vec3d;
  lightRadius: number;
}

export interface ContactPoint {
  time: number;
  position: Vec3d;
  type: 'P1' | 'U1' | 'Greatest' | 'U2' | 'U3' | 'U4' | 'P2' | 'P3' | 'P4';
  altitude: number;
  azimuth: number;
}

/**
 * 7 个标准交食接触事件类型（P1/U1/U2/极大/U3/U4/P2）。
 * 用于 computeContactTimes 的返回结果。
 */
export type ContactEventType = 'P1' | 'U1' | 'U2' | 'Greatest' | 'U3' | 'U4' | 'P2';

export interface ContactTime {
  type: ContactEventType;
  time: number;
}

/**
 * 简单 shadow map 采样器接口：给定 UV 返回深度值。
 * 用于 sampleShadowPCF 在测试与生产环境中可替换。
 */
export interface ShadowMapSampler {
  sampleDepth(uv: [number, number]): number;
}

/**
 * shadow map 数据接口：保存为 2D 深度数组。
 */
export interface ShadowMap {
  readonly width: number;
  readonly height: number;
  data: Float32Array | number[];
  /** UV 偏移（用于支持 PCF 邻域采样的纹理坐标变换） */
  sample(u: number, v: number): number;
}

export function computeShadowCone(
  casterPosition: Vec3d,
  casterRadius: number,
  lightPosition: Vec3d,
  lightRadius: number,
): ShadowCone {
  // Direction from light to caster (shadow extends opposite to light)
  const direction = normalize({
    x: casterPosition.x - lightPosition.x,
    y: casterPosition.y - lightPosition.y,
    z: casterPosition.z - lightPosition.z,
  });

  const distance = Math.sqrt(
    (casterPosition.x - lightPosition.x) ** 2 +
    (casterPosition.y - lightPosition.y) ** 2 +
    (casterPosition.z - lightPosition.z) ** 2,
  );

  // Umbra: lightRadius > casterRadius creates converging cone behind caster
  // tan(theta) = (lightRadius - casterRadius) / distance
  // umbraLength = casterRadius / tan(theta)
  const tanThetaUmbra = (lightRadius - casterRadius) / distance;
  const umbraLength = casterRadius / tanThetaUmbra;

  // Penumbra: diverging cone
  // tan(phi) = (lightRadius + casterRadius) / distance
  // penumbraLength = casterRadius / tan(phi)
  const tanThetaPenumbra = (lightRadius + casterRadius) / distance;
  const penumbraLength = casterRadius / tanThetaPenumbra;

  // Apex is at the convergence point behind the caster
  const apexDistance = casterRadius / tanThetaUmbra;
  const apex: Vec3d = {
    x: casterPosition.x + direction.x * apexDistance,
    y: casterPosition.y + direction.y * apexDistance,
    z: casterPosition.z + direction.z * apexDistance,
  };

  return {
    apex,
    direction,
    umbraRadius: casterRadius,
    penumbraRadius: casterRadius * 2,
    umbraLength,
    penumbraLength,
  };
}

export function computeEclipseGeometry(
  sunPosition: Vec3d,
  sunRadius: number,
  moonPosition: Vec3d,
  moonRadius: number,
  observerPosition: Vec3d,
): EclipseInfo {
  // Direction from observer to sun and moon
  const sunToObserver = {
    x: sunPosition.x - observerPosition.x,
    y: sunPosition.y - observerPosition.y,
    z: sunPosition.z - observerPosition.z,
  };

  const moonToObserver = {
    x: moonPosition.x - observerPosition.x,
    y: moonPosition.y - observerPosition.y,
    z: moonPosition.z - observerPosition.z,
  };

  // Distance from observer to sun and moon
  const sunDist = Math.sqrt(
    sunToObserver.x ** 2 + sunToObserver.y ** 2 + sunToObserver.z ** 2,
  );
  const moonDist = Math.sqrt(
    moonToObserver.x ** 2 + moonToObserver.y ** 2 + moonToObserver.z ** 2,
  );

  // Angular radii of sun and moon as seen from observer
  const sunAngularRadius = Math.asin(sunRadius / sunDist);
  const moonAngularRadius = Math.asin(moonRadius / moonDist);

  // Direction vectors (normalized)
  const sunDir = normalize(sunToObserver);
  const moonDir = normalize(moonToObserver);

  // Angular separation between sun and moon
  const separation = Math.acos(
    Math.max(-1, Math.min(1, dot(sunDir, moonDir))),
  );

  // Check if there's an eclipse (moon near sun)
  const sumRadii = sunAngularRadius + moonAngularRadius;

  if (separation > sumRadii * 1.5) {
    // Moon too far from sun for any eclipse
    return {
      type: 'none',
      magnitude: 0,
      obscuration: 0,
      partialBegin: null,
      totalBegin: null,
      maximum: null,
      totalEnd: null,
      partialEnd: null,
      centralLine: null,
    };
  }

  // Compute magnitude: ratio of covered sun diameter
  let magnitude = 0;
  if (separation < sumRadii) {
    magnitude = (sumRadii - separation) / (2 * sunAngularRadius);
  }

  // Compute obscuration (area coverage)
  let obscuration = 0;
  const diffRadii = Math.abs(moonAngularRadius - sunAngularRadius);

  if (separation < diffRadii) {
    // Total or annular eclipse (one disk inside the other)
    if (moonAngularRadius >= sunAngularRadius) {
      obscuration = 1.0; // Total
    } else {
      obscuration = (moonAngularRadius / sunAngularRadius) ** 2; // Annular
    }
  } else if (separation < sumRadii) {
    const overlapFactor = (sumRadii - separation) / sumRadii;
    obscuration = overlapFactor * Math.min(1, (moonAngularRadius / sunAngularRadius) ** 2);
  }

  const isTotal = separation < diffRadii && moonAngularRadius >= sunAngularRadius;
  const isAnnular = separation < diffRadii && moonAngularRadius < sunAngularRadius;
  const isPartial = separation >= diffRadii && separation < sumRadii;

  return {
    type: (isTotal || isAnnular || isPartial) ? 'solar' : 'none',
    magnitude: Math.max(0, Math.min(1, magnitude)),
    obscuration: Math.max(0, Math.min(1, obscuration)),
    partialBegin: null,
    totalBegin: isTotal ? 0 : null,
    maximum: 0,
    totalEnd: isTotal ? 0 : null,
    partialEnd: null,
    centralLine: null,
  };
}

export function computeLunarEclipse(
  sunPosition: Vec3d,
  _sunRadius: number,
  earthPosition: Vec3d,
  earthRadius: number,
  moonPosition: Vec3d,
  moonRadius: number,
): EclipseInfo {
  // Direction from earth to sun and moon
  const earthToSun = {
    x: sunPosition.x - earthPosition.x,
    y: sunPosition.y - earthPosition.y,
    z: sunPosition.z - earthPosition.z,
  };

  const earthToMoon = {
    x: moonPosition.x - earthPosition.x,
    y: moonPosition.y - earthPosition.y,
    z: moonPosition.z - earthPosition.z,
  };

  // Distances
  const sunDist = Math.sqrt(
    earthToSun.x ** 2 + earthToSun.y ** 2 + earthToSun.z ** 2,
  );
  const moonDist = Math.sqrt(
    earthToMoon.x ** 2 + earthToMoon.y ** 2 + earthToMoon.z ** 2,
  );

  // Shadow cone radii at moon distance
  // Umbra: cone converging behind Earth
  const umbraRadiusAtMoon = earthRadius * (sunDist - moonDist) / sunDist;
  // Penumbra: cone diverging
  const penumbraRadiusAtMoon = earthRadius * (sunDist + moonDist) / sunDist;

  // Angular radii as seen from Earth
  const moonAngularRadius = Math.asin(moonRadius / moonDist);
  const umbraAngularRadius = Math.asin(umbraRadiusAtMoon / moonDist);
  const penumbraAngularRadius = Math.asin(penumbraRadiusAtMoon / moonDist);

  // Direction vectors
  const sunDir = normalize(earthToSun);
  const moonDir = normalize(earthToMoon);

  // Angular separation (opposition for lunar eclipse means near 180 degrees)
  const separation = Math.acos(
    Math.max(-1, Math.min(1, dot(sunDir, moonDir))),
  );

  // For lunar eclipse, moon should be near opposition (separation close to PI)
  // Check if moon is in penumbra or umbra cone
  const oppositionAngle = Math.PI - separation;

  // Check if moon is within penumbra
  if (oppositionAngle > penumbraAngularRadius + moonAngularRadius) {
    return {
      type: 'none',
      magnitude: 0,
      obscuration: 0,
      partialBegin: null,
      totalBegin: null,
      maximum: null,
      totalEnd: null,
      partialEnd: null,
      centralLine: null,
    };
  }

  // Determine eclipse type
  const isTotal = oppositionAngle < umbraAngularRadius - moonAngularRadius;
  const isPartial = oppositionAngle < umbraAngularRadius + moonAngularRadius &&
                    oppositionAngle >= umbraAngularRadius - moonAngularRadius;
  const isPenumbral = oppositionAngle >= umbraAngularRadius + moonAngularRadius &&
                      oppositionAngle < penumbraAngularRadius + moonAngularRadius;

  // Compute magnitude
  let magnitude = 0;
  if (isTotal) {
    magnitude = 1.0;
  } else if (isPartial) {
    magnitude = (umbraAngularRadius + moonAngularRadius - oppositionAngle) /
                (2 * moonAngularRadius);
  } else if (isPenumbral) {
    magnitude = (penumbraAngularRadius + moonAngularRadius - oppositionAngle) /
                (2 * moonAngularRadius) * 0.5;
  }

  return {
    type: (isTotal || isPartial || isPenumbral) ? 'lunar' : 'none',
    magnitude: Math.max(0, Math.min(1, magnitude)),
    obscuration: magnitude,
    partialBegin: null,
    totalBegin: isTotal ? 0 : null,
    maximum: 0,
    totalEnd: isTotal ? 0 : null,
    partialEnd: null,
    centralLine: null,
  };
}

export function computeShadowOnSurface(
  shadowCone: ShadowCone,
  surfacePoint: Vec3d,
  _surfaceNormal: Vec3d,
): { umbra: boolean; penumbra: boolean; intensity: number } {
  const toSurface = {
    x: surfacePoint.x - shadowCone.apex.x,
    y: surfacePoint.y - shadowCone.apex.y,
    z: surfacePoint.z - shadowCone.apex.z,
  };

  const distAlongCone = dot(toSurface, shadowCone.direction);

  if (distAlongCone < 0) {
    return { umbra: false, penumbra: false, intensity: 1.0 };
  }

  const perpDist = Math.sqrt(
    toSurface.x ** 2 + toSurface.y ** 2 + toSurface.z ** 2 -
    distAlongCone ** 2,
  );

  const umbraRadiusAtDist = shadowCone.umbraRadius * (1 - distAlongCone / shadowCone.umbraLength);
  const penumbraRadiusAtDist = shadowCone.penumbraRadius * (1 - distAlongCone / shadowCone.penumbraLength);

  const inUmbra = distAlongCone < shadowCone.umbraLength && perpDist < umbraRadiusAtDist;
  const inPenumbra = distAlongCone < shadowCone.penumbraLength && perpDist < penumbraRadiusAtDist;

  let intensity = 1.0;
  if (inUmbra) {
    intensity = 0.0;
  } else if (inPenumbra && penumbraRadiusAtDist > 0) {
    intensity = Math.min(1.0, perpDist / penumbraRadiusAtDist);
  }

  return { umbra: inUmbra, penumbra: inPenumbra, intensity };
}

export function computeShadowMapParams(
  lightPosition: Vec3d,
  casterPosition: Vec3d,
  casterRadius: number,
  _targetRadius: number,
  targetPosition: Vec3d,
): { projectionMatrix: number[]; viewMatrix: number[]; resolution: number } {
  const direction = normalize({
    x: targetPosition.x - lightPosition.x,
    y: targetPosition.y - lightPosition.y,
    z: targetPosition.z - lightPosition.z,
  });

  const distance = Math.sqrt(
    (casterPosition.x - lightPosition.x) ** 2 +
    (casterPosition.y - lightPosition.y) ** 2 +
    (casterPosition.z - lightPosition.z) ** 2,
  );

  const shadowDistance = distance * 2;
  const shadowRadius = casterRadius * 10;

  const projScale = 1.0 / shadowRadius;

  const viewMatrix = [
    direction.x, direction.y, direction.z, 0,
    -direction.y, direction.x, 0, 0,
    -direction.z * direction.x, -direction.z * direction.y, 1, 0,
    -lightPosition.x, -lightPosition.y, -lightPosition.z, 1,
  ];

  const projectionMatrix = [
    projScale, 0, 0, 0,
    0, projScale, 0, 0,
    0, 0, -1 / shadowDistance, 0,
    0, 0, 0, 1,
  ];

  return {
    projectionMatrix,
    viewMatrix,
    resolution: 2048,
  };
}

export function computeContactTimes(
  separationFn: (time: number) => number,
  windowStart: number,
  windowEnd: number,
  radiusP1: number,
  radiusU1: number,
): ContactTime[] {
  return computeContactTimesFromSeparation(separationFn, windowStart, windowEnd, radiusP1, radiusU1);
}

/**
 * 计算交食的 7 个接触时刻（P1/U1/U2/极大/U3/U4/P2）。
 *
 * 通过对事件强度函数（如 moonSeparation）做二分法求根得到接触时刻：
 * - P1: 偏食开始（分离首次低于 R_p1）
 * - U1: 全食开始（分离首次低于 R_u1）
 * - U2: 全食内二次接触
 * - Greatest: 极大时刻（分离最小）
 * - U3: 全食内三次接触
 * - U4: 全食结束（分离升至 R_u1 之上）
 * - P2: 偏食结束（分离升至 R_p1 之上）
 *
 * 返回按时间升序排列的 ContactTime 列表。
 */
export function computeContactTimesFromSeparation(
  separationFn: (time: number) => number,
  windowStart: number,
  windowEnd: number,
  radiusP1: number,
  radiusU1: number,
): ContactTime[] {
  const contacts: ContactTime[] = [];

  // 抽样找极大时刻（最小分离）
  const samples = 64;
  let bestT = windowStart;
  let bestSep = Infinity;
  const step = (windowEnd - windowStart) / samples;
  for (let i = 0; i <= samples; i++) {
    const t = windowStart + i * step;
    const sep = separationFn(t);
    if (sep < bestSep) {
      bestSep = sep;
      bestT = t;
    }
  }

  contacts.push({ type: 'Greatest', time: bestT });

  // P1: 首次降至 radiusP1 之下（在 [windowStart, bestT] 内）
  const p1 = findRoot((t) => separationFn(t) - radiusP1, windowStart, bestT, 1e-4);
  if (p1 !== null) {
    contacts.push({ type: 'P1', time: p1 });
  }

  // U1: 首次降至 radiusU1 之下（在 [windowStart, bestT] 内）
  const u1 = findRoot((t) => separationFn(t) - radiusU1, windowStart, bestT, 1e-4);
  if (u1 !== null) {
    contacts.push({ type: 'U1', time: u1 });
  }

  // U2 / U3: 全食内的二、三次接触（仅在全食成立时存在）。
  if (bestSep < radiusU1) {
    if (u1 !== null) {
      // U2 在 U1 与 Greatest 之间
      contacts.push({ type: 'U2', time: (u1 + bestT) / 2 });
    }
    const u4 = findRoot((t) => separationFn(t) - radiusU1, bestT, windowEnd, 1e-4);
    if (u4 !== null) {
      // U3 在 Greatest 与 U4 之间
      contacts.push({ type: 'U4', time: u4 });
      contacts.push({ type: 'U3', time: (bestT + u4) / 2 });
    }
  }

  // P2: 偏食结束（分离升至 radiusP1 之上）
  const p2 = findRoot((t) => separationFn(t) - radiusP1, bestT, windowEnd, 1e-4);
  if (p2 !== null) {
    contacts.push({ type: 'P2', time: p2 });
  }

  // 按时间升序排列
  contacts.sort((a, b) => a.time - b.time);
  return contacts;
}

/**
 * 二分法求根：在区间 [a, b] 上寻找 f(x) = 0 的根。
 * 要求 f(a) 与 f(b) 异号；若同号则返回 null。
 * 当区间长度小于 tolerance 时停止迭代。
 */
export function findRoot(
  f: (x: number) => number,
  a: number,
  b: number,
  tolerance: number = 1e-6,
): number | null {
  let lo = a;
  let hi = b;
  let fLo = f(lo);
  let fHi = f(hi);

  if (fLo === 0) return lo;
  if (fHi === 0) return hi;

  // 同号——根不在区间内
  if (fLo * fHi > 0) {
    return null;
  }

  const maxIterations = 100;
  for (let i = 0; i < maxIterations; i++) {
    if (Math.abs(hi - lo) < tolerance) {
      break;
    }
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (fMid === 0) {
      return mid;
    }
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return (lo + hi) / 2;
}

/**
 * PCF 阴影采样：在 kernelSize×kernelSize 邻域内对 shadowMap 做深度比较，
 * 返回 [0,1] 可见度（0=完全阴影，1=完全照亮）。
 *
 * sampler 可选；若未提供则用 shadowMap.sample() 作为深度源。
 * 比较公式：visibility += (sampleDepth > depth + bias) ? 1 : 0; 最终归一化。
 *
 * 边界使用 clamp-to-edge 策略。
 */
export function sampleShadowPCF(
  shadowMap: ShadowMap,
  uv: [number, number],
  depth: number,
  kernelSize: number,
  sampler?: ShadowMapSampler | null,
  bias: number = 0.001,
): number {
  if (kernelSize <= 1) {
    const sd = sampler ? sampler.sampleDepth(uv) : shadowMap.sample(uv[0], uv[1]);
    return sd > depth + bias ? 1.0 : 0.0;
  }

  const half = Math.floor(kernelSize / 2);
  let visible = 0;
  let total = 0;
  const texelU = 1 / shadowMap.width;
  const texelV = 1 / shadowMap.height;

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const u = Math.max(0, Math.min(1, uv[0] + dx * texelU));
      const v = Math.max(0, Math.min(1, uv[1] + dy * texelV));
      const sd = sampler ? sampler.sampleDepth([u, v]) : shadowMap.sample(u, v);
      if (sd > depth + bias) {
        visible++;
      }
      total++;
    }
  }

  return total === 0 ? 1.0 : visible / total;
}

/**
 * 简单的 ShadowMap 实现：基于 Float32Array 的 2D 深度图。
 */
export class ArrayShadowMap implements ShadowMap {
  readonly width: number;
  readonly height: number;
  data: Float32Array | number[];

  constructor(width: number, height: number, data?: Float32Array | number[]) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Float32Array(width * height);
  }

  static filled(width: number, height: number, value: number): ArrayShadowMap {
    const data = new Float32Array(width * height);
    data.fill(value);
    return new ArrayShadowMap(width, height, data);
  }

  setPixel(x: number, y: number, depth: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.data[y * this.width + x] = depth;
  }

  sample(u: number, v: number): number {
    // clamp-to-edge
    const x = Math.max(0, Math.min(this.width - 1, Math.floor(u * this.width)));
    const y = Math.max(0, Math.min(this.height - 1, Math.floor(v * this.height)));
    return this.data[y * this.width + x] as number;
  }
}

function normalize(v: Vec3d): Vec3d {
  const len = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
  if (len < 1e-10) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dot(a: Vec3d, b: Vec3d): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}