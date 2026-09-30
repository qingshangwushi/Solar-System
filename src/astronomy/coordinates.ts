import type { Vec3Km, Vec3Scene } from "./types";

const J2000_OBLIQUITY_RAD = (23.439291111 * Math.PI) / 180;

export function eclipticToScene(position: Vec3Km): Vec3Scene {
  return { x: position.x, y: position.z, z: -position.y };
}

export function sceneToEcliptic(position: Vec3Scene): Vec3Km {
  return { x: position.x, y: -position.z, z: position.y };
}

export function icrfToEclipticJ2000(position: Vec3Km): Vec3Km {
  const cosObliquity = Math.cos(J2000_OBLIQUITY_RAD);
  const sinObliquity = Math.sin(J2000_OBLIQUITY_RAD);
  return {
    x: position.x,
    y: cosObliquity * position.y + sinObliquity * position.z,
    z: -sinObliquity * position.y + cosObliquity * position.z,
  };
}
