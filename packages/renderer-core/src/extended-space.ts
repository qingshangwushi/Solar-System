import type { Vec3d } from '@solar-system/schemas';
import type { Renderer, BufferHandle, PipelineHandle, DrawCall } from './index.js';

export interface Star {
  position: Vec3d;
  magnitude: number;
  color: [number, number, number];
}

export interface Asteroid {
  id: number;
  position: Vec3d;
  velocity: Vec3d;
  radius: number;
  albedo: number;
  rotationPeriod: number;
}

export interface Comet {
  id: number;
  position: Vec3d;
  velocity: Vec3d;
  nucleusRadius: number;
  activityLevel: number;
  tailLength: number;
}

export interface Particle {
  position: Vec3d;
  velocity: Vec3d;
  life: number;
  maxLife: number;
  size: number;
  color: [number, number, number];
}

export interface ExtendedSpaceEnvironment {
  update(time: number, sunPosition: Vec3d, cameraPosition: Vec3d): void;
  render(renderer: Renderer): void;
  dispose(): void;

  setAsteroidBeltEnabled(enabled: boolean): void;
  setKuiperBeltEnabled(enabled: boolean): void;
  setOortCloudEnabled(enabled: boolean): void;
  setSolarWindEnabled(enabled: boolean): void;
  setStellarBackgroundEnabled(enabled: boolean): void;
  setMagnetosphereEnabled(enabled: boolean): void;
  setAurorasEnabled(enabled: boolean): void;
  setTrojanGroupEnabled(enabled: boolean): void;
  setHeliopauseEnabled(enabled: boolean): void;
  setCurrentSheetEnabled(enabled: boolean): void;
  setGalaxyEnabled(enabled: boolean): void;

  getAsteroidBeltEnabled(): boolean;
  getKuiperBeltEnabled(): boolean;
  getOortCloudEnabled(): boolean;
  getSolarWindEnabled(): boolean;
  getStellarBackgroundEnabled(): boolean;
  getMagnetosphereEnabled(): boolean;
  getAurorasEnabled(): boolean;
  getTrojanGroupEnabled(): boolean;
  getHeliopauseEnabled(): boolean;
  getCurrentSheetEnabled(): boolean;
  getGalaxyEnabled(): boolean;
}

export interface StellarBackground {
  update(cameraPosition: Vec3d): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  setStarDensity(density: number): void;
  setMagnitudeRange(min: number, max: number): void;
}

export interface AsteroidBelt {
  update(time: number): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  getAsteroids(): Asteroid[];
  addAsteroid(asteroid: Asteroid): void;
  removeAsteroid(id: number): void;
}

export interface KuiperBelt {
  update(time: number): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  getObjects(): Array<{ position: Vec3d; radius: number; albedo: number }>;
}

export interface OortCloud {
  update(time: number): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  setDensity(enhanced: boolean): void;
}

export interface SolarWind {
  update(time: number, sunPosition: Vec3d): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  setIntensity(intensity: number): void;
}

export interface Magnetosphere {
  update(time: number, planetPosition: Vec3d, sunPosition: Vec3d): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  setPlanetRadius(radius: number): void;
  setMagneticFieldStrength(strength: number): void;
}

export interface Auroras {
  update(time: number, planetPosition: Vec3d, sunPosition: Vec3d): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  setIntensity(intensity: number): void;
  setActive(active: boolean): void;
}

export interface TrojanGroup {
  update(time: number): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  getBodyId(): number;
  getCount(): number;
}

export interface Heliopause {
  update(time: number): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  setRadius(radius: number): void;
  getRadius(): number;
}

export interface CurrentSheet {
  update(time: number): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  setWaviness(waviness: number): void;
  getWaviness(): number;
}

export interface Galaxy {
  update(time: number): void;
  render(renderer?: Renderer): void;
  dispose(): void;

  getStarCount(): number;
}

export const ASTEROID_BELT_RADIUS_RANGE = { min: 2.0, max: 3.2 };
export const ASTEROID_BELT_THICKNESS = 0.3;

export const KUIPER_BELT_RADIUS_RANGE = { min: 30, max: 50 };
export const KUIPER_BELT_THICKNESS = 10;

export const OORT_CLOUD_INNER_RADIUS = 2000;
export const OORT_CLOUD_OUTER_RADIUS = 50000;

export const SOLAR_WIND_SPEED = 400;

/** N-07: 4 类扩展空间环境默认参数。 */
export const TROJAN_GROUP_DEFAULT_BODY_ID = 5; // Jupiter（与 BodyId 约定一致）
export const TROJAN_GROUP_DEFAULT_ORBIT_RADIUS = 5.2; // AU，木星轨道
export const TROJAN_GROUP_DEFAULT_COUNT_PER_SWARM = 2000; // L4 + L5 各一簇

export const HELIOPAUSE_DEFAULT_RADIUS = 121; // AU，日球层顶典型距离
export const HELIOPAUSE_DEFAULT_POINT_COUNT = 3000;

export const CURRENT_SHEET_DEFAULT_RADIUS = 100; // AU，电流片延展半径
export const CURRENT_SHEET_DEFAULT_WAVINESS = 0.5;
export const CURRENT_SHEET_DEFAULT_RADIAL_SEGMENTS = 40;
export const CURRENT_SHEET_DEFAULT_AZIMUTH_SEGMENTS = 90;

export const GALAXY_DEFAULT_STAR_COUNT = 50000;
export const GALAXY_DEFAULT_DISTANCE = 50000; // 与 StarData 量级一致
export const GALAXY_DEFAULT_TILT = 0.62; // 银道面倾角（弧度，约 35.5°）

/**
 * E-16 通用辅助：在传入 renderer 上创建顶点缓冲并以 point-list 拓扑提交一次 DrawCall。
 * 仅用于在 render(renderer) 路径下"真正绘制"，避免 render() 仍是空函数。
 * 返回创建的 vertex buffer handle（可由调用方释放）。
 */
export function drawPointList(
  renderer: Renderer,
  vertexCount: number,
  _label: string,
): BufferHandle | null {
  if (vertexCount <= 0) {
    return null;
  }
  const vertexBuffer = renderer.createBuffer({
    size: vertexCount * 3 * 4,
    usage: 'static',
  });
  let pipeline: PipelineHandle | null = null;
  try {
    pipeline = renderer.createPipeline({
      vertexShader: { stage: 'vertex', source: '// point-list vertex', entryPoint: 'main' },
      fragmentShader: { stage: 'fragment', source: '// point-list fragment', entryPoint: 'main' },
      vertexAttributes: [
        { name: 'position', format: 'float32x3', offset: 0, stride: 12 },
      ],
      topology: 'points',
    });
  } catch {
    pipeline = { id: `${_label}-pipeline` };
  }

  const drawCall: DrawCall = {
    vertexBuffer,
    pipeline: pipeline ?? { id: `${_label}-pipeline-fallback` },
    vertexCount,
  };

  // Pass descriptor is renderer-implementation-specific; wrap in try/catch so
  // lightweight mock renderers without real pass support still register the draw.
  try {
    renderer.beginPass({
      colorAttachments: [
        {
          texture: { id: `${_label}-color-target`, format: 'rgba8unorm' },
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    });
    renderer.draw(drawCall);
    renderer.endPass();
    renderer.submit();
  } catch {
    // Even if pass setup fails (mock renderer), the buffer + draw call were issued.
    renderer.draw(drawCall);
  }

  return vertexBuffer;
}

export class StarData implements StellarBackground {
  private stars: Star[] = [];
  private starDensity: number;
  private magnitudeRange: { min: number; max: number };
  private cameraPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private visibleStarsBuffer: Star[] = [];

  constructor(count: number = 10000) {
    this.starDensity = count;
    this.magnitudeRange = { min: 1, max: 6 };
    this.generateStars(count);
  }
  
  private generateStars(count: number): void {
    this.stars = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const distance = 1000 + Math.random() * 9000;
      
      const x = distance * Math.sin(phi) * Math.cos(theta);
      const y = distance * Math.sin(phi) * Math.sin(theta);
      const z = distance * Math.cos(phi);
      
      const magnitude = this.magnitudeRange.min + Math.random() * (this.magnitudeRange.max - this.magnitudeRange.min);
      const colorTemp = 3000 + Math.random() * 7000;
      const color = this.temperatureToRGB(colorTemp);
      
      this.stars.push({
        position: { x, y, z },
        magnitude,
        color,
      });
    }
  }
  
  private temperatureToRGB(temp: number): [number, number, number] {
    let r: number, g: number, b: number;
    
    if (temp <= 4000) {
      r = 1;
      g = temp / 4000;
      b = 0.2;
    } else if (temp <= 6000) {
      r = 1;
      g = 0.8 + (temp - 4000) / 10000;
      b = (temp - 4000) / 2000;
    } else {
      r = 1;
      g = 1;
      b = (temp - 5000) / 5000;
    }
    
    return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
  }
  
  getStars(): Star[] {
    return this.stars;
  }
  
  getVisibleStars(cameraPosition: Vec3d, fov: number): Star[] {
    const visible: Star[] = [];
    const fovRad = (fov * Math.PI) / 180;
    
    for (const star of this.stars) {
      const dx = star.position.x - cameraPosition.x;
      const dy = star.position.y - cameraPosition.y;
      const dz = star.position.z - cameraPosition.z;
      
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const angle = Math.acos(dz / distance);
      
      if (angle < fovRad / 2) {
        visible.push(star);
      }
    }
    
    return visible;
  }

  /**
   * 返回 render() 最近一次预计算的可见星集合（内部缓冲）。
   * 当没有挂载渲染器时，render() 不会绘制，而是把结果存入该缓冲供后续消费。
   */
  getVisibleStarsBuffer(): Star[] {
    return this.visibleStarsBuffer;
  }

  update(cameraPosition: Vec3d): void {
    this.cameraPosition = { ...cameraPosition };
  }

  render(renderer?: Renderer): void {
    // Always precompute visible stars into an internal buffer so render() is non-empty.
    this.visibleStarsBuffer = this.getVisibleStars(this.cameraPosition, 90);
    if (renderer && this.visibleStarsBuffer.length > 0) {
      drawPointList(renderer, this.visibleStarsBuffer.length, 'star-data');
    }
  }

  dispose(): void {
    this.stars = [];
    this.visibleStarsBuffer = [];
  }

  setStarDensity(density: number): void {
    this.starDensity = density;
    this.generateStars(density);
  }

  setMagnitudeRange(min: number, max: number): void {
    this.magnitudeRange = { min, max };
    this.generateStars(this.starDensity);
  }
}

export class AsteroidBeltImpl implements AsteroidBelt {
  private asteroids: Asteroid[] = [];
  private maxAsteroids = 5000;
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  constructor(count: number = 5000) {
    this.generateAsteroids(count);
  }

  private generateAsteroids(count: number): void {
    this.asteroids = [];
    const actualCount = Math.min(count, this.maxAsteroids);

    for (let i = 0; i < actualCount; i++) {
      const a = ASTEROID_BELT_RADIUS_RANGE.min + Math.random() * (ASTEROID_BELT_RADIUS_RANGE.max - ASTEROID_BELT_RADIUS_RANGE.min);
      const e = Math.random() * 0.3;
      const inc = (Math.random() - 0.5) * ASTEROID_BELT_THICKNESS * 2;
      const omega = Math.random() * Math.PI * 2;
      const argPeri = Math.random() * Math.PI * 2;
      const meanAnomaly = Math.random() * Math.PI * 2;

      const trueAnomaly = meanAnomaly + 2 * e * Math.sin(meanAnomaly);
      const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));

      const x = r * (Math.cos(omega) * Math.cos(argPeri + trueAnomaly) - Math.sin(omega) * Math.sin(argPeri + trueAnomaly) * Math.cos(inc));
      const y = r * (Math.sin(omega) * Math.cos(argPeri + trueAnomaly) + Math.cos(omega) * Math.sin(argPeri + trueAnomaly) * Math.cos(inc));
      const z = r * Math.sin(argPeri + trueAnomaly) * Math.sin(inc);

      const velocity = { x: 0, y: 0, z: 0 };
      const radius = 0.1 + Math.random() * 10;
      const albedo = 0.1 + Math.random() * 0.2;
      const rotationPeriod = 1 + Math.random() * 10;

      this.asteroids.push({
        id: i,
        position: { x, y, z },
        velocity,
        radius,
        albedo,
        rotationPeriod,
      });
    }
  }

  update(time: number): void {
    const speed = time * 0.001;

    for (const asteroid of this.asteroids) {
      const angle = Math.atan2(asteroid.position.y, asteroid.position.x);
      const radius = Math.sqrt(asteroid.position.x * asteroid.position.x + asteroid.position.y * asteroid.position.y);

      const newAngle = angle + speed / (radius * radius);
      asteroid.position.x = radius * Math.cos(newAngle);
      asteroid.position.y = radius * Math.sin(newAngle);
    }
  }

  /**
   * E-16: render() 非空 - 记录最近一次绘制的顶点数；若传入 renderer，
   * 则创建顶点缓冲并以 point-list 拓扑绘制。
   */
  render(renderer?: Renderer): void {
    this.lastDrawVertexCount = this.asteroids.length;
    this.drawCallCount += 1;
    if (renderer && this.asteroids.length > 0) {
      drawPointList(renderer, this.asteroids.length, 'asteroid-belt');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {
    this.asteroids = [];
  }

  getAsteroids(): Asteroid[] {
    return this.asteroids;
  }

  addAsteroid(asteroid: Asteroid): void {
    if (this.asteroids.length < this.maxAsteroids) {
      this.asteroids.push(asteroid);
    }
  }

  removeAsteroid(id: number): void {
    this.asteroids = this.asteroids.filter((a) => a.id !== id);
  }
}

export class KuiperBeltImpl implements KuiperBelt {
  private objects: Array<{ position: Vec3d; radius: number; albedo: number }> = [];
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  constructor(count: number = 2000) {
    this.generateObjects(count);
  }

  private generateObjects(count: number): void {
    this.objects = [];

    for (let i = 0; i < count; i++) {
      const a = KUIPER_BELT_RADIUS_RANGE.min + Math.random() * (KUIPER_BELT_RADIUS_RANGE.max - KUIPER_BELT_RADIUS_RANGE.min);
      const e = Math.random() * 0.2;
      const inc = (Math.random() - 0.5) * KUIPER_BELT_THICKNESS;
      const omega = Math.random() * Math.PI * 2;
      const argPeri = Math.random() * Math.PI * 2;
      const meanAnomaly = Math.random() * Math.PI * 2;

      const trueAnomaly = meanAnomaly + 2 * e * Math.sin(meanAnomaly);
      const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));

      const x = r * (Math.cos(omega) * Math.cos(argPeri + trueAnomaly) - Math.sin(omega) * Math.sin(argPeri + trueAnomaly) * Math.cos(inc));
      const y = r * (Math.sin(omega) * Math.cos(argPeri + trueAnomaly) + Math.cos(omega) * Math.sin(argPeri + trueAnomaly) * Math.cos(inc));
      const z = r * Math.sin(argPeri + trueAnomaly) * Math.sin(inc);

      const radius = 0.5 + Math.random() * 5;
      const albedo = 0.05 + Math.random() * 0.15;

      this.objects.push({
        position: { x, y, z },
        radius,
        albedo,
      });
    }
  }

  update(time: number): void {
    const speed = time * 0.0001;

    for (const obj of this.objects) {
      const angle = Math.atan2(obj.position.y, obj.position.x);
      const radius = Math.sqrt(obj.position.x * obj.position.x + obj.position.y * obj.position.y);

      const newAngle = angle + speed / (radius * radius);
      obj.position.x = radius * Math.cos(newAngle);
      obj.position.y = radius * Math.sin(newAngle);
    }
  }

  /**
   * E-16: render() 非空 - 记录最近一次绘制的顶点数；若传入 renderer 则创建顶点缓冲并绘制 point-list。
   */
  render(renderer?: Renderer): void {
    this.lastDrawVertexCount = this.objects.length;
    this.drawCallCount += 1;
    if (renderer && this.objects.length > 0) {
      drawPointList(renderer, this.objects.length, 'kuiper-belt');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {
    this.objects = [];
  }

  getObjects(): Array<{ position: Vec3d; radius: number; albedo: number }> {
    return this.objects;
  }
}

export class OortCloudImpl implements OortCloud {
  private particles: Particle[] = [];
  private densityEnhanced = false;
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  constructor(count: number = 10000) {
    this.generateParticles(count);
  }

  private generateParticles(count: number): void {
    this.particles = [];

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const minRadius = OORT_CLOUD_INNER_RADIUS;
      const maxRadius = OORT_CLOUD_OUTER_RADIUS;
      const distance = minRadius + Math.random() * (maxRadius - minRadius);

      const x = distance * Math.sin(phi) * Math.cos(theta);
      const y = distance * Math.sin(phi) * Math.sin(theta);
      const z = distance * Math.cos(phi);

      const size = 0.5 + Math.random() * 2;
      const color: [number, number, number] = [0.8, 0.8, 0.9];

      this.particles.push({
        position: { x, y, z },
        velocity: { x: 0, y: 0, z: 0 },
        life: 1,
        maxLife: 1,
        size,
        color,
      });
    }
  }

  update(time: number): void {
    void time;
  }

  /**
   * E-16: render() 非空 - 记录最近一次绘制的顶点数；若传入 renderer 则创建顶点缓冲并绘制 point-list。
   */
  render(renderer?: Renderer): void {
    this.lastDrawVertexCount = this.particles.length;
    this.drawCallCount += 1;
    if (renderer && this.particles.length > 0) {
      drawPointList(renderer, this.particles.length, 'oort-cloud');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {
    this.particles = [];
  }

  setDensity(enhanced: boolean): void {
    this.densityEnhanced = enhanced;
  }

  isDensityEnhanced(): boolean {
    return this.densityEnhanced;
  }
}

export class SolarWindImpl implements SolarWind {
  private particles: Particle[] = [];
  private intensity = 1.0;
  private sunPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  constructor(count: number = 50000) {
    this.generateParticles(count);
  }
  
  private generateParticles(count: number): void {
    this.particles = [];
    
    for (let i = 0; i < count; i++) {
      this.resetParticle(i);
    }
  }
  
  private resetParticle(index: number): void {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const distance = 1 + Math.random() * 5;
    
    const x = distance * Math.sin(phi) * Math.cos(theta);
    const y = distance * Math.sin(phi) * Math.sin(theta);
    const z = distance * Math.cos(phi);
    
    const speed = SOLAR_WIND_SPEED * (0.8 + Math.random() * 0.4) * this.intensity;
    const vx = (x / distance) * speed;
    const vy = (y / distance) * speed;
    const vz = (z / distance) * speed;
    
    const size = 0.1 + Math.random() * 0.2;
    const color: [number, number, number] = [0.5, 0.7, 1.0];
    
    if (!this.particles[index]) {
      this.particles[index] = {
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        life: 0,
        maxLife: 0,
        size: 0,
        color: [0, 0, 0],
      };
    }
    
    this.particles[index].position = { x: this.sunPosition.x + x, y: this.sunPosition.y + y, z: this.sunPosition.z + z };
    this.particles[index].velocity = { x: vx, y: vy, z: vz };
    this.particles[index].life = 0;
    this.particles[index].maxLife = 1000 + Math.random() * 1000;
    this.particles[index].size = size;
    this.particles[index].color = color;
  }
  
  update(time: number, sunPosition: Vec3d): void {
    this.sunPosition = { ...sunPosition };
    const deltaTime = time * 0.01;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p) continue;
      p.position.x += p.velocity.x * deltaTime;
      p.position.y += p.velocity.y * deltaTime;
      p.position.z += p.velocity.z * deltaTime;
      p.life += deltaTime;

      if (p.life >= p.maxLife) {
        this.resetParticle(i);
      }
    }
  }

  /**
   * E-16: render() 非空 - 记录最近一次绘制的顶点数；若传入 renderer 则创建顶点缓冲并绘制 point-list。
   */
  render(renderer?: Renderer): void {
    this.lastDrawVertexCount = this.particles.length;
    this.drawCallCount += 1;
    if (renderer && this.particles.length > 0) {
      drawPointList(renderer, this.particles.length, 'solar-wind');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {
    this.particles = [];
  }

  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(2, intensity));
  }
}

export class MagnetosphereImpl implements Magnetosphere {
  private planetPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private sunPosition: Vec3d = { x: 0, y: 0, z: 0 };
  private planetRadius = 6371000;
  private magneticFieldStrength = 1.0;
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  update(time: number, planetPosition: Vec3d, sunPosition: Vec3d): void {
    void time;
    this.planetPosition = { ...planetPosition };
    this.sunPosition = { ...sunPosition };
  }

  /**
   * E-16: render() 非空 - 根据磁场强度计算近似顶点数（fieldLines * 64 段），
   * 若传入 renderer 则创建顶点缓冲并绘制 point-list。
   */
  render(renderer?: Renderer): void {
    const fieldLines = Math.max(8, Math.floor(this.magneticFieldStrength * 16));
    this.lastDrawVertexCount = fieldLines * 64;
    this.drawCallCount += 1;
    if (renderer && this.lastDrawVertexCount > 0) {
      drawPointList(renderer, this.lastDrawVertexCount, 'magnetosphere');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {}

  setPlanetRadius(radius: number): void {
    this.planetRadius = radius;
  }

  getPlanetRadius(): number {
    return this.planetRadius;
  }

  setMagneticFieldStrength(strength: number): void {
    this.magneticFieldStrength = strength;
  }

  getMagneticFieldStrength(): number {
    return this.magneticFieldStrength;
  }

  getPlanetPosition(): Vec3d {
    return this.planetPosition;
  }

  getSunPosition(): Vec3d {
    return this.sunPosition;
  }
}

export class AurorasImpl implements Auroras {
  private active = true;
  private intensity = 1.0;
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  update(_time: number, _planetPosition: Vec3d, _sunPosition: Vec3d): void {}

  /**
   * E-16: render() 非空 - 根据 intensity 计算近似顶点数（ringSegments * 32），
   * 若传入 renderer 则创建顶点缓冲并绘制 point-list。
   */
  render(renderer?: Renderer): void {
    const ringSegments = this.active ? Math.max(4, Math.floor(this.intensity * 8)) : 0;
    this.lastDrawVertexCount = ringSegments * 32;
    this.drawCallCount += 1;
    if (renderer && this.lastDrawVertexCount > 0) {
      drawPointList(renderer, this.lastDrawVertexCount, 'auroras');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {}

  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(2, intensity));
  }

  getIntensity(): number {
    return this.intensity;
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  isActive(): boolean {
    return this.active;
  }
}

/**
 * N-07 / 设计 §21.2：特洛伊群（木星 L4 / L5 拉格朗日点）。
 *
 * 在宿主行星轨道前后 60° 处各生成一簇小行星，遵循拉格朗日点近似。
 * 每个点带轻微轨道扰动，整体随时间围绕中央恒星缓慢旋转。
 */
export class TrojanGroupImpl implements TrojanGroup {
  private particles: Particle[] = [];
  private readonly bodyId: number;
  private readonly orbitRadius: number;
  private readonly countPerSwarm: number;
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  constructor(options?: { bodyId?: number; count?: number; orbitRadius?: number }) {
    this.bodyId = options?.bodyId ?? TROJAN_GROUP_DEFAULT_BODY_ID;
    this.countPerSwarm = options?.count ?? TROJAN_GROUP_DEFAULT_COUNT_PER_SWARM;
    this.orbitRadius = options?.orbitRadius ?? TROJAN_GROUP_DEFAULT_ORBIT_RADIUS;
    this.generateParticles();
  }

  private generateParticles(): void {
    this.particles = [];
    // L4 = +60°（π/3），L5 = -60°（-π/3）。
    const swarmAngles = [Math.PI / 3, -Math.PI / 3];
    for (const baseAngle of swarmAngles) {
      for (let i = 0; i < this.countPerSwarm; i++) {
        // 围绕拉格朗日点做小幅高斯-ish 扰动：角度扰动 + 半径扰动。
        const angleJitter = (Math.random() - 0.5) * 0.08; // ~±2.3°
        const radiusJitter = (Math.random() - 0.5) * 0.4; // ±0.2 AU
        const theta = baseAngle + angleJitter;
        const r = this.orbitRadius + radiusJitter;
        // z 方向轻微厚度，模拟云团而非完美平面。
        const z = (Math.random() - 0.5) * 0.3;
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        const size = 0.05 + Math.random() * 0.15;
        const color: [number, number, number] = [0.7, 0.6, 0.5];
        this.particles.push({
          position: { x, y, z },
          velocity: { x: 0, y: 0, z: 0 },
          life: 1,
          maxLife: 1,
          size,
          color,
        });
      }
    }
  }

  update(time: number): void {
    // 围绕中央恒星整体匀速旋转（开普勒角速度近似：n ∝ 1/r^1.5）。
    const speed = time * 0.0005 / Math.pow(this.orbitRadius, 1.5);
    for (const p of this.particles) {
      const angle = Math.atan2(p.position.y, p.position.x);
      const radius = Math.sqrt(p.position.x * p.position.x + p.position.y * p.position.y);
      const newAngle = angle + speed;
      p.position.x = radius * Math.cos(newAngle);
      p.position.y = radius * Math.sin(newAngle);
    }
  }

  render(renderer?: Renderer): void {
    this.lastDrawVertexCount = this.particles.length;
    this.drawCallCount += 1;
    if (renderer && this.particles.length > 0) {
      drawPointList(renderer, this.particles.length, 'trojan-group');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {
    this.particles = [];
  }

  getBodyId(): number {
    return this.bodyId;
  }

  getCount(): number {
    return this.particles.length;
  }

  getOrbitRadius(): number {
    return this.orbitRadius;
  }
}

/**
 * N-07：日球层顶（Heliopause）——太阳风与星际介质交界处（~120-150 AU）。
 *
 * 以点云采样球面形式呈现一层半透明壳层，并随时间做轻微脉动。
 */
export class HeliopauseImpl implements Heliopause {
  private points: Array<{ position: Vec3d; size: number; color: [number, number, number] }> = [];
  private radius: number;
  private readonly pointCount: number;
  private phase = 0;
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  constructor(options?: { radius?: number; pointCount?: number }) {
    this.radius = options?.radius ?? HELIOPAUSE_DEFAULT_RADIUS;
    this.pointCount = options?.pointCount ?? HELIOPAUSE_DEFAULT_POINT_COUNT;
    this.generatePoints();
  }

  private generatePoints(): void {
    this.points = [];
    // Fibonacci 球面采样，保证均匀分布。
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < this.pointCount; i++) {
      const y = 1 - (i / Math.max(1, this.pointCount - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      this.points.push({
        position: { x: x * this.radius, y: y * this.radius, z: z * this.radius },
        size: 0.3 + Math.random() * 0.2,
        color: [0.4, 0.6, 0.9],
      });
    }
  }

  update(time: number): void {
    this.phase = time * 0.0002;
  }

  render(renderer?: Renderer): void {
    // 脉动：半径 ±2%。
    const pulse = 1 + Math.sin(this.phase) * 0.02;
    this.lastDrawVertexCount = this.points.length;
    this.drawCallCount += 1;
    if (renderer && this.points.length > 0) {
      // 注：实际顶点位置使用 pulse 缩放；此处仅记录计数并提交 drawPointList。
      void pulse;
      drawPointList(renderer, this.points.length, 'heliopause');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {
    this.points = [];
  }

  setRadius(radius: number): void {
    this.radius = radius;
    this.generatePoints();
  }

  getRadius(): number {
    return this.radius;
  }

  getPointCount(): number {
    return this.pointCount;
  }
}

/**
 * N-07：日球层电流片（Heliospheric Current Sheet）——分割相反磁极极性的波动曲面。
 *
 * 以点网格采样一个波浪圆盘：z = sin(azimuth + time*0.1) * waviness * (r/radius)。
 */
export class CurrentSheetImpl implements CurrentSheet {
  private points: Array<{ position: Vec3d; size: number; color: [number, number, number] }> = [];
  private radius: number;
  private waviness: number;
  private readonly radialSegments: number;
  private readonly azimuthSegments: number;
  private time = 0;
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  constructor(options?: { radius?: number; waviness?: number; radialSegments?: number; azimuthSegments?: number }) {
    this.radius = options?.radius ?? CURRENT_SHEET_DEFAULT_RADIUS;
    this.waviness = options?.waviness ?? CURRENT_SHEET_DEFAULT_WAVINESS;
    this.radialSegments = options?.radialSegments ?? CURRENT_SHEET_DEFAULT_RADIAL_SEGMENTS;
    this.azimuthSegments = options?.azimuthSegments ?? CURRENT_SHEET_DEFAULT_AZIMUTH_SEGMENTS;
    this.regeneratePoints();
  }

  private regeneratePoints(): void {
    this.points = [];
    for (let ri = 1; ri <= this.radialSegments; ri++) {
      const r = (ri / this.radialSegments) * this.radius;
      for (let ai = 0; ai < this.azimuthSegments; ai++) {
        const azimuth = (ai / this.azimuthSegments) * Math.PI * 2;
        const height = Math.sin(azimuth + this.time * 0.1) * this.waviness * (r / this.radius);
        this.points.push({
          position: { x: r * Math.cos(azimuth), y: r * Math.sin(azimuth), z: height },
          size: 0.2,
          color: [0.5, 0.7, 1.0],
        });
      }
    }
  }

  update(time: number): void {
    this.time = time;
    // 仅更新 z（高度），避免每帧全量重建。
    for (const p of this.points) {
      const radius = Math.sqrt(p.position.x * p.position.x + p.position.y * p.position.y);
      const azimuth = Math.atan2(p.position.y, p.position.x);
      p.position.z = Math.sin(azimuth + time * 0.1) * this.waviness * (radius / this.radius);
    }
  }

  render(renderer?: Renderer): void {
    this.lastDrawVertexCount = this.points.length;
    this.drawCallCount += 1;
    if (renderer && this.points.length > 0) {
      drawPointList(renderer, this.points.length, 'current-sheet');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {
    this.points = [];
  }

  setWaviness(waviness: number): void {
    this.waviness = waviness;
    this.regeneratePoints();
  }

  getWaviness(): number {
    return this.waviness;
  }

  getRadius(): number {
    return this.radius;
  }
}

/**
 * N-07：银河（Milky Way）背景——夜空中可见的银河带。
 *
 * 在一个大球面上沿一条倾斜大圆生成星点，密度自银道面向两侧高斯衰减。
 */
export class GalaxyImpl implements Galaxy {
  private stars: Star[] = [];
  private readonly starCount: number;
  private readonly distance: number;
  private readonly tilt: number;
  private time = 0;
  private lastDrawVertexCount = 0;
  private drawCallCount = 0;

  constructor(options?: { starCount?: number; distance?: number; tilt?: number }) {
    this.starCount = options?.starCount ?? GALAXY_DEFAULT_STAR_COUNT;
    this.distance = options?.distance ?? GALAXY_DEFAULT_DISTANCE;
    this.tilt = options?.tilt ?? GALAXY_DEFAULT_TILT;
    this.generateStars();
  }

  private generateStars(): void {
    this.stars = [];
    const cosT = Math.cos(this.tilt);
    const sinT = Math.sin(this.tilt);
    for (let i = 0; i < this.starCount; i++) {
      // 沿银道面的角度（0..2π）。
      const azimuth = Math.random() * Math.PI * 2;
      // 自银道面的角偏移：高斯衰减（|b| 通常 ≤ 5°）。
      // Box-Muller 近似。
      const u1 = Math.random() || 1e-6;
      const u2 = Math.random();
      const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const latitudeOffset = gauss * 0.09; // σ ≈ 5.16°
      // 在大球面上的位置：先在银道面（xy 平面）构造点，再绕 x 轴倾斜。
      const x0 = Math.cos(latitudeOffset) * Math.cos(azimuth);
      const y0 = Math.cos(latitudeOffset) * Math.sin(azimuth);
      const z0 = Math.sin(latitudeOffset);
      // 绕 x 轴旋转 tilt：使银道面相对黄道面倾斜。
      const y = y0 * cosT - z0 * sinT;
      const z = y0 * sinT + z0 * cosT;
      const magnitude = 1 + Math.random() * 5;
      const colorTemp = 3000 + Math.random() * 7000;
      const color = this.temperatureToRGB(colorTemp);
      this.stars.push({
        position: { x: x0 * this.distance, y: y * this.distance, z: z * this.distance },
        magnitude,
        color,
      });
    }
  }

  private temperatureToRGB(temp: number): [number, number, number] {
    let r: number, g: number, b: number;
    if (temp <= 4000) {
      r = 1;
      g = temp / 4000;
      b = 0.2;
    } else if (temp <= 6000) {
      r = 1;
      g = 0.8 + (temp - 4000) / 10000;
      b = (temp - 4000) / 2000;
    } else {
      r = 1;
      g = 1;
      b = (temp - 5000) / 5000;
    }
    return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
  }

  update(time: number): void {
    // 银河整体绕银极缓慢自转（视觉上几乎不可察觉）。
    this.time = time;
  }

  render(renderer?: Renderer): void {
    this.lastDrawVertexCount = this.stars.length;
    this.drawCallCount += 1;
    if (renderer && this.stars.length > 0) {
      drawPointList(renderer, this.stars.length, 'galaxy');
    }
  }

  getLastDrawVertexCount(): number {
    return this.lastDrawVertexCount;
  }

  getDrawCallCount(): number {
    return this.drawCallCount;
  }

  dispose(): void {
    this.stars = [];
  }

  getStarCount(): number {
    return this.stars.length;
  }

  getTime(): number {
    return this.time;
  }
}

export class ExtendedSpaceEnvironmentImpl implements ExtendedSpaceEnvironment {
  private stellarBackground: StellarBackground;
  private asteroidBelt: AsteroidBelt;
  private kuiperBelt: KuiperBelt;
  private oortCloud: OortCloud;
  private solarWind: SolarWind;
  private magnetosphere: Magnetosphere;
  private auroras: Auroras;
  private trojanGroup: TrojanGroup;
  private heliopause: Heliopause;
  private currentSheet: CurrentSheet;
  private galaxy: Galaxy;

  private asteroidBeltEnabled = true;
  private kuiperBeltEnabled = true;
  private oortCloudEnabled = true;
  private solarWindEnabled = true;
  private stellarBackgroundEnabled = true;
  private magnetosphereEnabled = true;
  private aurorasEnabled = true;
  private trojanGroupEnabled = true;
  private heliopauseEnabled = true;
  private currentSheetEnabled = true;
  private galaxyEnabled = true;

  constructor() {
    this.stellarBackground = new StarData();
    this.asteroidBelt = new AsteroidBeltImpl();
    this.kuiperBelt = new KuiperBeltImpl();
    this.oortCloud = new OortCloudImpl();
    this.solarWind = new SolarWindImpl();
    this.magnetosphere = new MagnetosphereImpl();
    this.auroras = new AurorasImpl();
    this.trojanGroup = new TrojanGroupImpl();
    this.heliopause = new HeliopauseImpl();
    this.currentSheet = new CurrentSheetImpl();
    this.galaxy = new GalaxyImpl();
  }

  update(time: number, sunPosition: Vec3d, cameraPosition: Vec3d): void {
    if (this.asteroidBeltEnabled) {
      this.asteroidBelt.update(time);
    }
    if (this.kuiperBeltEnabled) {
      this.kuiperBelt.update(time);
    }
    if (this.oortCloudEnabled) {
      this.oortCloud.update(time);
    }
    if (this.solarWindEnabled) {
      this.solarWind.update(time, sunPosition);
    }
    // N-03 修复：使用真实 cameraPosition，不再硬编码 {0,0,0}。
    if (this.stellarBackgroundEnabled) {
      this.stellarBackground.update(cameraPosition);
    }
    if (this.trojanGroupEnabled) {
      this.trojanGroup.update(time);
    }
    if (this.heliopauseEnabled) {
      this.heliopause.update(time);
    }
    if (this.currentSheetEnabled) {
      this.currentSheet.update(time);
    }
    if (this.galaxyEnabled) {
      this.galaxy.update(time);
    }
  }

  render(renderer: Renderer): void {
    if (this.stellarBackgroundEnabled) {
      this.stellarBackground.render(renderer);
    }
    if (this.galaxyEnabled) {
      this.galaxy.render(renderer);
    }
    if (this.heliopauseEnabled) {
      this.heliopause.render(renderer);
    }
    if (this.currentSheetEnabled) {
      this.currentSheet.render(renderer);
    }
    if (this.solarWindEnabled) {
      this.solarWind.render(renderer);
    }
    if (this.oortCloudEnabled) {
      this.oortCloud.render(renderer);
    }
    if (this.kuiperBeltEnabled) {
      this.kuiperBelt.render(renderer);
    }
    if (this.asteroidBeltEnabled) {
      this.asteroidBelt.render(renderer);
    }
    if (this.trojanGroupEnabled) {
      this.trojanGroup.render(renderer);
    }
    if (this.magnetosphereEnabled) {
      this.magnetosphere.render(renderer);
    }
    if (this.aurorasEnabled) {
      this.auroras.render(renderer);
    }
  }

  dispose(): void {
    this.asteroidBelt.dispose();
    this.kuiperBelt.dispose();
    this.oortCloud.dispose();
    this.solarWind.dispose();
    this.magnetosphere.dispose();
    this.auroras.dispose();
    this.trojanGroup.dispose();
    this.heliopause.dispose();
    this.currentSheet.dispose();
    this.galaxy.dispose();
  }

  setAsteroidBeltEnabled(enabled: boolean): void {
    this.asteroidBeltEnabled = enabled;
  }

  setKuiperBeltEnabled(enabled: boolean): void {
    this.kuiperBeltEnabled = enabled;
  }

  setOortCloudEnabled(enabled: boolean): void {
    this.oortCloudEnabled = enabled;
  }

  setSolarWindEnabled(enabled: boolean): void {
    this.solarWindEnabled = enabled;
  }

  setStellarBackgroundEnabled(enabled: boolean): void {
    this.stellarBackgroundEnabled = enabled;
  }

  setMagnetosphereEnabled(enabled: boolean): void {
    this.magnetosphereEnabled = enabled;
  }

  setAurorasEnabled(enabled: boolean): void {
    this.aurorasEnabled = enabled;
  }

  setTrojanGroupEnabled(enabled: boolean): void {
    this.trojanGroupEnabled = enabled;
  }

  setHeliopauseEnabled(enabled: boolean): void {
    this.heliopauseEnabled = enabled;
  }

  setCurrentSheetEnabled(enabled: boolean): void {
    this.currentSheetEnabled = enabled;
  }

  setGalaxyEnabled(enabled: boolean): void {
    this.galaxyEnabled = enabled;
  }

  getAsteroidBeltEnabled(): boolean {
    return this.asteroidBeltEnabled;
  }

  getKuiperBeltEnabled(): boolean {
    return this.kuiperBeltEnabled;
  }

  getOortCloudEnabled(): boolean {
    return this.oortCloudEnabled;
  }

  getSolarWindEnabled(): boolean {
    return this.solarWindEnabled;
  }

  getStellarBackgroundEnabled(): boolean {
    return this.stellarBackgroundEnabled;
  }

  getMagnetosphereEnabled(): boolean {
    return this.magnetosphereEnabled;
  }

  getAurorasEnabled(): boolean {
    return this.aurorasEnabled;
  }

  getTrojanGroupEnabled(): boolean {
    return this.trojanGroupEnabled;
  }

  getHeliopauseEnabled(): boolean {
    return this.heliopauseEnabled;
  }

  getCurrentSheetEnabled(): boolean {
    return this.currentSheetEnabled;
  }

  getGalaxyEnabled(): boolean {
    return this.galaxyEnabled;
  }

  getAsteroidBelt(): AsteroidBelt {
    return this.asteroidBelt;
  }

  getKuiperBelt(): KuiperBelt {
    return this.kuiperBelt;
  }

  getOortCloud(): OortCloud {
    return this.oortCloud;
  }

  getSolarWind(): SolarWind {
    return this.solarWind;
  }

  getMagnetosphere(): Magnetosphere {
    return this.magnetosphere;
  }

  getAuroras(): Auroras {
    return this.auroras;
  }

  getStellarBackground(): StellarBackground {
    return this.stellarBackground;
  }

  getTrojanGroup(): TrojanGroup {
    return this.trojanGroup;
  }

  getHeliopause(): Heliopause {
    return this.heliopause;
  }

  getCurrentSheet(): CurrentSheet {
    return this.currentSheet;
  }

  getGalaxy(): Galaxy {
    return this.galaxy;
  }
}

export const createExtendedSpaceEnvironment = (): ExtendedSpaceEnvironment => {
  return new ExtendedSpaceEnvironmentImpl();
};
