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
    // Partial eclipse - approximate area overlap
    const r = sunAngularRadius;
    const R = moonAngularRadius;
    const k = separation;

    // Simplified overlap calculation
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
  sunRadius: number,
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

  // Angular radius of sun from Earth
  const sunAngularRadius = Math.asin(sunRadius / sunDist);

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
  surfaceNormal: Vec3d,
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
  targetRadius: number,
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
  sunPosition: Vec3d,
  sunRadius: number,
  moonPosition: Vec3d,
  moonRadius: number,
  observerPosition: Vec3d,
  mjd: number,
): ContactPoint[] {
  const contacts: ContactPoint[] = [];

  const sunDir = normalize({
    x: sunPosition.x - observerPosition.x,
    y: sunPosition.y - observerPosition.y,
    z: sunPosition.z - observerPosition.z,
  });

  const moonDir = normalize({
    x: moonPosition.x - observerPosition.x,
    y: moonPosition.y - observerPosition.y,
    z: moonPosition.z - observerPosition.z,
  });

  const separation = Math.acos(Math.max(-1, Math.min(1, dot(sunDir, moonDir))));

  const sunDist = Math.sqrt(
    (sunPosition.x - observerPosition.x) ** 2 +
    (sunPosition.y - observerPosition.y) ** 2 +
    (sunPosition.z - observerPosition.z) ** 2,
  );

  const sunAngularRadius = Math.asin(sunRadius / sunDist);
  const moonAngularRadius = Math.asin(moonRadius / Math.sqrt(
    (moonPosition.x - observerPosition.x) ** 2 +
    (moonPosition.y - observerPosition.y) ** 2 +
    (moonPosition.z - observerPosition.z) ** 2,
  ));

  contacts.push({
    time: mjd,
    position: { x: 0, y: 0, z: 0 },
    type: 'P1',
    altitude: Math.asin(sunDir.z),
    azimuth: Math.atan2(sunDir.y, sunDir.x),
  });

  return contacts;
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