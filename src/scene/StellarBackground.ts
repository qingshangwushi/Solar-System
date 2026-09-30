import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, Scene } from "three";
import { icrfToEclipticJ2000 } from "../astronomy/coordinates";
import type { Vec3Km } from "../astronomy/types";
import type { SceneScale } from "./scale";

export interface BackgroundStar {
  id: string;
  name: string;
  raDeg: number;
  decDeg: number;
  distanceLy: number;
  source: string;
}

const KM_PER_LIGHT_YEAR = 9.460730472e12;

export function starPositionKm(star: BackgroundStar): Vec3Km {
  const ra = star.raDeg * Math.PI / 180;
  const dec = star.decDeg * Math.PI / 180;
  const distance = star.distanceLy * KM_PER_LIGHT_YEAR;
  return icrfToEclipticJ2000({ x: distance * Math.cos(dec) * Math.cos(ra), y: distance * Math.cos(dec) * Math.sin(ra), z: distance * Math.sin(dec) });
}

export class StellarBackground {
  readonly points: Points<BufferGeometry, PointsMaterial>;

  constructor(private readonly scene: Scene, stars: readonly BackgroundStar[], scale: SceneScale) {
    const coordinates = new Float32Array(stars.length * 3);
    stars.forEach((star, index) => {
      const ecliptic = starPositionKm(star);
      const point = { x: scale.distanceKm(ecliptic.x), y: scale.distanceKm(ecliptic.y), z: scale.distanceKm(ecliptic.z) };
      coordinates.set([point.x, point.z, -point.y], index * 3);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(coordinates, 3));
    const material = new PointsMaterial({ color: "#dbe7ff", size: 0.065, transparent: true, opacity: 0.85, sizeAttenuation: true });
    this.points = new Points(geometry, material);
    this.points.userData.catalogCategory = "backgroundStar";
    this.points.userData.ids = stars.map((star) => star.id);
    this.points.userData.names = stars.map((star) => star.name);
    this.points.userData.sources = stars.map((star) => star.source);
    scene.add(this.points);
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
