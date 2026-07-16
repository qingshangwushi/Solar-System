/**
 * 太阳、地球、月球专项渲染（任务 P0-16）。
 */

import type { Vec3d } from '@solar-system/schemas';
import { RenderableNode, Material, Geometry, BufferHandle } from './index.js';

export type CelestialBodyType = 'sun' | 'earth' | 'moon';

export interface CelestialBody extends RenderableNode {
  readonly type: CelestialBodyType;
  readonly radius: number;
  readonly surfaceMaterial: Material;
  readonly atmosphereMaterial?: Material;
  readonly position: Vec3d;

  updatePosition(position: Vec3d): void;
  updateRotation(rotation: number): void;
}

export interface SunMaterial extends Material {
  readonly type: 'emissive';
  color: [number, number, number];
  intensity: number;
  coronaIntensity: number;
}

export interface EarthMaterial extends Material {
  readonly type: 'pbr';
  albedoTexture?: string;
  normalTexture?: string;
  roughnessTexture?: string;
  metallicTexture?: string;
  specularIntensity: number;
}

export interface MoonMaterial extends Material {
  readonly type: 'pbr';
  albedoTexture?: string;
  normalTexture?: string;
  roughness: number;
}

export interface AtmosphereMaterial extends Material {
  readonly type: 'atmosphere';
  radius: number;
  thickness: number;
  color: [number, number, number];
  density: number;
}

export class BaseCelestialBody implements CelestialBody {
  readonly name: string;
  readonly type: CelestialBodyType;
  readonly radius: number;
  readonly children: RenderableNode[] = [];

  position: Vec3d = { x: 0, y: 0, z: 0 };
  rotation: { w: number; x: number; y: number; z: number } = { w: 1, x: 0, y: 0, z: 0 };
  scale: Vec3d = { x: 1, y: 1, z: 1 };

  visible = true;
  castShadow = true;
  receiveShadow = true;

  localToWorldMatrix = new Float64Array(16);
  worldToLocalMatrix = new Float64Array(16);

  material: Material;
  geometry: Geometry;
  readonly surfaceMaterial: Material;
  atmosphereMaterial?: Material;

  needsUpdate = false;

  private parent: RenderableNode | null = null;

  constructor(name: string, type: CelestialBodyType, radius: number, material: Material, geometry: Geometry) {
    this.name = name;
    this.type = type;
    this.radius = radius;
    this.material = material;
    this.surfaceMaterial = material;
    this.geometry = geometry;
    this.localToWorldMatrix.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    this.worldToLocalMatrix.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  addChild(node: RenderableNode): void {
    if (!this.children.includes(node)) {
      this.children.push(node);
      node.setParent(this);
    }
  }

  removeChild(node: RenderableNode): void {
    const index = this.children.indexOf(node);
    if (index !== -1) {
      this.children.splice(index, 1);
      node.setParent(null);
    }
  }

  setParent(parent: RenderableNode | null): void {
    this.parent = parent;
  }

  getParent(): RenderableNode | null {
    return this.parent;
  }

  updateTransform(): void {
    const px = this.position.x;
    const py = this.position.y;
    const pz = this.position.z;

    const q = this.rotation;
    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;

    const x2 = qx * 2;
    const y2 = qy * 2;
    const z2 = qz * 2;
    const xx = qx * x2;
    const xy = qx * y2;
    const xz = qx * z2;
    const yy = qy * y2;
    const yz = qy * z2;
    const zz = qz * z2;
    const wx = qw * x2;
    const wy = qw * y2;
    const wz = qw * z2;

    const sx = this.scale.x;
    const sy = this.scale.y;
    const sz = this.scale.z;

    const m = this.localToWorldMatrix;
    m[0] = (1 - yy - zz) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[3] = 0;

    m[4] = (xy - wz) * sy;
    m[5] = (1 - xx - zz) * sy;
    m[6] = (yz + wx) * sy;
    m[7] = 0;

    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1 - xx - yy) * sz;
    m[11] = 0;

    m[12] = px;
    m[13] = py;
    m[14] = pz;
    m[15] = 1;

    this.invertMatrix4x4(m, this.worldToLocalMatrix);
  }

  private invertMatrix4x4(m: Float64Array, result: Float64Array): void {
    const a00 = m[0] as number, a01 = m[1] as number, a02 = m[2] as number, a03 = m[3] as number;
    const a10 = m[4] as number, a11 = m[5] as number, a12 = m[6] as number, a13 = m[7] as number;
    const a20 = m[8] as number, a21 = m[9] as number, a22 = m[10] as number, a23 = m[11] as number;
    const a30 = m[12] as number, a31 = m[13] as number, a32 = m[14] as number, a33 = m[15] as number;

    const det =
      a00 * (a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31)) -
      a01 * (a10 * (a22 * a33 - a23 * a32) - a12 * (a20 * a33 - a23 * a30) + a13 * (a20 * a32 - a22 * a30)) +
      a02 * (a10 * (a21 * a33 - a23 * a31) - a11 * (a20 * a33 - a23 * a30) + a13 * (a20 * a31 - a21 * a30)) -
      a03 * (a10 * (a21 * a32 - a22 * a31) - a11 * (a20 * a32 - a22 * a30) + a12 * (a20 * a31 - a21 * a30));

    if (Math.abs(det) < 1e-10) {
      result.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      return;
    }

    const invDet = 1 / det;

    result[0] = (a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31)) * invDet;
    result[1] = (-a01 * (a22 * a33 - a23 * a32) + a02 * (a21 * a33 - a23 * a31) - a03 * (a21 * a32 - a22 * a31)) * invDet;
    result[2] = (a01 * (a12 * a33 - a13 * a32) - a02 * (a11 * a33 - a13 * a31) + a03 * (a11 * a32 - a12 * a31)) * invDet;
    result[3] = (-a01 * (a12 * a23 - a13 * a22) + a02 * (a11 * a23 - a13 * a21) - a03 * (a11 * a22 - a12 * a21)) * invDet;

    result[4] = (-a10 * (a22 * a33 - a23 * a32) + a12 * (a20 * a33 - a23 * a30) - a13 * (a20 * a32 - a22 * a30)) * invDet;
    result[5] = (a00 * (a22 * a33 - a23 * a32) - a02 * (a20 * a33 - a23 * a30) + a03 * (a20 * a32 - a22 * a30)) * invDet;
    result[6] = (-a00 * (a12 * a33 - a13 * a32) + a02 * (a10 * a33 - a13 * a30) - a03 * (a10 * a32 - a12 * a30)) * invDet;
    result[7] = (a00 * (a12 * a23 - a13 * a22) - a02 * (a10 * a23 - a13 * a20) + a03 * (a10 * a22 - a12 * a20)) * invDet;

    result[8] = (a10 * (a21 * a33 - a23 * a31) - a11 * (a20 * a33 - a23 * a30) + a13 * (a20 * a31 - a21 * a30)) * invDet;
    result[9] = (-a00 * (a21 * a33 - a23 * a31) + a01 * (a20 * a33 - a23 * a30) - a03 * (a20 * a31 - a21 * a30)) * invDet;
    result[10] = (a00 * (a11 * a33 - a13 * a31) - a01 * (a10 * a33 - a13 * a30) + a03 * (a10 * a31 - a11 * a30)) * invDet;
    result[11] = (-a00 * (a11 * a23 - a13 * a21) + a01 * (a10 * a23 - a13 * a20) - a03 * (a10 * a21 - a11 * a20)) * invDet;

    result[12] = (-a10 * (a21 * a32 - a22 * a31) + a11 * (a20 * a32 - a22 * a30) - a12 * (a20 * a31 - a21 * a30)) * invDet;
    result[13] = (a00 * (a21 * a32 - a22 * a31) - a01 * (a20 * a32 - a22 * a30) + a02 * (a20 * a31 - a21 * a30)) * invDet;
    result[14] = (-a00 * (a11 * a32 - a12 * a31) + a01 * (a10 * a32 - a12 * a30) - a02 * (a10 * a31 - a11 * a30)) * invDet;
    result[15] = (a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20)) * invDet;
  }

  updatePosition(position: Vec3d): void {
    this.position = { ...position };
    this.needsUpdate = true;
  }

  updateRotation(rotation: number): void {
    const angle = rotation;
    const qx = 0;
    const qy = Math.sin(angle / 2);
    const qz = 0;
    const qw = Math.cos(angle / 2);
    this.rotation = { w: qw, x: qx, y: qy, z: qz };
    this.needsUpdate = true;
  }

  setProperty(name: string, value: unknown): void {
    this.material.setProperty(name, value);
    this.needsUpdate = true;
  }

  getProperty(name: string): unknown {
    return this.material.getProperty(name);
  }
}

export class Sun extends BaseCelestialBody {
  readonly type: CelestialBodyType = 'sun';
  readonly surfaceMaterial: SunMaterial;

  constructor(material: SunMaterial, geometry: Geometry) {
    super('Sun', 'sun', 695700000, material, geometry);
    this.surfaceMaterial = material;
  }
}

export class Earth extends BaseCelestialBody {
  readonly type: CelestialBodyType = 'earth';
  readonly surfaceMaterial: EarthMaterial;
  readonly atmosphereMaterial?: AtmosphereMaterial;

  constructor(material: EarthMaterial, geometry: Geometry, atmosphereMaterial?: AtmosphereMaterial) {
    super('Earth', 'earth', 6371000, material, geometry);
    this.surfaceMaterial = material;
    this.atmosphereMaterial = atmosphereMaterial;
  }
}

export class Moon extends BaseCelestialBody {
  readonly type: CelestialBodyType = 'moon';
  readonly surfaceMaterial: MoonMaterial;

  constructor(material: MoonMaterial, geometry: Geometry) {
    super('Moon', 'moon', 1737400, material, geometry);
    this.surfaceMaterial = material;
  }
}

export class BaseMaterial implements Material {
  readonly type: 'unlit' | 'pbr' | 'emissive' | 'terrain' | 'atmosphere' | 'particle';
  readonly properties: Record<string, unknown> = {};

  constructor(type: Material['type']) {
    this.type = type;
  }

  setProperty(name: string, value: unknown): void {
    this.properties[name] = value;
  }

  getProperty(name: string): unknown {
    return this.properties[name];
  }
}

export class SunMaterialImpl extends BaseMaterial implements SunMaterial {
  readonly type: 'emissive' = 'emissive';
  color: [number, number, number] = [1, 0.9, 0.7];
  intensity: number = 1;
  coronaIntensity: number = 0.3;

  constructor(properties?: Partial<SunMaterial>) {
    super('emissive');
    if (properties) {
      Object.assign(this, properties);
      Object.assign(this.properties, properties);
    }
  }
}

export class EarthMaterialImpl extends BaseMaterial implements EarthMaterial {
  readonly type: 'pbr' = 'pbr';
  albedoTexture?: string;
  normalTexture?: string;
  roughnessTexture?: string;
  metallicTexture?: string;
  specularIntensity: number = 0.5;

  constructor(properties?: Partial<EarthMaterial>) {
    super('pbr');
    if (properties) {
      Object.assign(this, properties);
      Object.assign(this.properties, properties);
    }
  }
}

export class MoonMaterialImpl extends BaseMaterial implements MoonMaterial {
  readonly type: 'pbr' = 'pbr';
  albedoTexture?: string;
  normalTexture?: string;
  roughness: number = 0.8;

  constructor(properties?: Partial<MoonMaterial>) {
    super('pbr');
    if (properties) {
      Object.assign(this, properties);
      Object.assign(this.properties, properties);
    }
  }
}

export class AtmosphereMaterialImpl extends BaseMaterial implements AtmosphereMaterial {
  readonly type: 'atmosphere' = 'atmosphere';
  radius: number = 6471000;
  thickness: number = 100000;
  color: [number, number, number] = [0.3, 0.6, 1];
  density: number = 0.01;

  constructor(properties?: Partial<AtmosphereMaterial>) {
    super('atmosphere');
    if (properties) {
      Object.assign(this, properties);
      Object.assign(this.properties, properties);
    }
  }
}

export class SphereGeometry implements Geometry {
  readonly vertexCount: number;
  readonly indexCount?: number;

  vertexBuffer: BufferHandle;
  indexBuffer?: BufferHandle;

  constructor(radius: number, segments: number = 32) {
    this.vertexCount = segments * segments * 6;
    this.indexCount = segments * segments * 6;
    this.vertexBuffer = { id: `sphere-${radius}-${segments}`, usage: 'static' };
    this.indexBuffer = { id: `sphere-idx-${radius}-${segments}`, usage: 'static' };
  }
}
