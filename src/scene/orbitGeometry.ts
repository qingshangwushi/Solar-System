import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial } from "three";
import { propagateKepler } from "../astronomy/kepler";
import { eclipticToScene } from "../astronomy/coordinates";
import type { Vec3Km } from "../astronomy/types";
import type { SceneScale } from "./scale";
import type { RenderBody } from "./SolarSystemScene";

const G_KM3_KG_S2 = 6.67430e-20;

export function createOrbitLine(body: RenderBody, parent: RenderBody, scale: SceneScale, originKm: Vec3Km, segments = 128): Line | undefined {
  if (!body.orbit || !parent.massKg) return undefined;
  const semiMajor = Math.abs(body.orbit.semiMajorAxisKm);
  const mu = G_KM3_KG_S2 * parent.massKg;
  const periodSeconds = 2 * Math.PI * Math.sqrt(semiMajor ** 3 / mu);
  if (!Number.isFinite(periodSeconds) || periodSeconds <= 0) return undefined;
  const points: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const jd = body.orbit.epochJD + periodSeconds * (index / segments) / 86_400;
    const relative = propagateKepler(body.orbit, jd, mu);
    const scene = eclipticToScene({
      x: scale.distanceKm(relative.x + parent.positionKm.x - originKm.x),
      y: scale.distanceKm(relative.y + parent.positionKm.y - originKm.y),
      z: scale.distanceKm(relative.z + parent.positionKm.z - originKm.z),
    });
    points.push(scene.x, scene.y, scene.z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  const color = body.type === "asteroid" ? "#936f46" : "#344257";
  return new Line(geometry, new LineBasicMaterial({ color, transparent: true, opacity: 0.54 }));
}
