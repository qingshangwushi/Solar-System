import { InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, SphereGeometry, Vector3 } from "three";
import type { Vec3Km } from "../astronomy/types";
import type { SceneScale } from "./scale";
import { eclipticToScene } from "../astronomy/coordinates";
import type { PositionedCatalogBody } from "../workers/catalog.worker";

export class MinorBodyLayer {
  readonly mesh: InstancedMesh<SphereGeometry, MeshStandardMaterial>;
  private bodies: PositionedCatalogBody[] = [];
  private readonly matrix = new Matrix4();

  constructor(private readonly scene: Object3D, private readonly scale: SceneScale, capacity = 100_000) {
    this.mesh = new InstancedMesh(new SphereGeometry(0.025, 8, 6), new MeshStandardMaterial({ color: "#bc966a", roughness: 1 }), capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = true;
    this.mesh.instanceMatrix.setUsage(35048);
    scene.add(this.mesh);
  }

  setBodies(bodies: readonly PositionedCatalogBody[]): void {
    if (bodies.length > this.mesh.instanceMatrix.count) throw new RangeError(`Minor-body layer capacity ${this.mesh.instanceMatrix.count} exceeded by ${bodies.length} bodies`);
    this.bodies = [...bodies].sort((a, b) => a.id.localeCompare(b.id, "en"));
    this.mesh.userData.bodyIds = this.bodies.map((body) => body.id);
    this.mesh.count = this.bodies.length;
    this.bodies.forEach((body, index) => {
      const position = this.map(body.positionKm);
      this.matrix.makeTranslation(position.x, position.y, position.z);
      this.mesh.setMatrixAt(index, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  get visibleBodyIds(): string[] { return this.bodies.map((body) => body.id); }

  getInstancePosition(index: number): Vec3Km {
    if (!Number.isInteger(index) || index < 0 || index >= this.bodies.length) throw new RangeError("Minor-body instance index is outside the visible set");
    this.mesh.getMatrixAt(index, this.matrix);
    const position = new Vector3().setFromMatrixPosition(this.matrix);
    return { x: position.x, y: position.y, z: position.z };
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.geometry.userData.disposed = true;
    this.mesh.material.dispose();
  }

  private map(position: Vec3Km): Vec3Km {
    return eclipticToScene({ x: this.scale.distanceKm(position.x), y: this.scale.distanceKm(position.y), z: this.scale.distanceKm(position.z) });
  }
}
