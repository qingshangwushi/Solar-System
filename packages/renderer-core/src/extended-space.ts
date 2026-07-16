import type { Vec3d } from '@solar-system/schemas';

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
  update(time: number, sunPosition: Vec3d): void;
  render(): void;
  dispose(): void;
  
  setAsteroidBeltEnabled(enabled: boolean): void;
  setKuiperBeltEnabled(enabled: boolean): void;
  setOortCloudEnabled(enabled: boolean): void;
  setSolarWindEnabled(enabled: boolean): void;
  setStellarBackgroundEnabled(enabled: boolean): void;
  setMagnetosphereEnabled(enabled: boolean): void;
  setAurorasEnabled(enabled: boolean): void;
  
  getAsteroidBeltEnabled(): boolean;
  getKuiperBeltEnabled(): boolean;
  getOortCloudEnabled(): boolean;
  getSolarWindEnabled(): boolean;
  getStellarBackgroundEnabled(): boolean;
  getMagnetosphereEnabled(): boolean;
  getAurorasEnabled(): boolean;
}

export interface StellarBackground {
  update(cameraPosition: Vec3d): void;
  render(): void;
  dispose(): void;
  
  setStarDensity(density: number): void;
  setMagnitudeRange(min: number, max: number): void;
}

export interface AsteroidBelt {
  update(time: number): void;
  render(): void;
  dispose(): void;
  
  getAsteroids(): Asteroid[];
  addAsteroid(asteroid: Asteroid): void;
  removeAsteroid(id: number): void;
}

export interface KuiperBelt {
  update(time: number): void;
  render(): void;
  dispose(): void;
  
  getObjects(): Array<{ position: Vec3d; radius: number; albedo: number }>;
}

export interface OortCloud {
  update(time: number): void;
  render(): void;
  dispose(): void;
  
  setDensity(enhanced: boolean): void;
}

export interface SolarWind {
  update(time: number, sunPosition: Vec3d): void;
  render(): void;
  dispose(): void;
  
  setIntensity(intensity: number): void;
}

export interface Magnetosphere {
  update(time: number, planetPosition: Vec3d, sunPosition: Vec3d): void;
  render(): void;
  dispose(): void;
  
  setPlanetRadius(radius: number): void;
  setMagneticFieldStrength(strength: number): void;
}

export interface Auroras {
  update(time: number, planetPosition: Vec3d, sunPosition: Vec3d): void;
  render(): void;
  dispose(): void;
  
  setIntensity(intensity: number): void;
  setActive(active: boolean): void;
}

export const ASTEROID_BELT_RADIUS_RANGE = { min: 2.0, max: 3.2 };
export const ASTEROID_BELT_THICKNESS = 0.3;

export const KUIPER_BELT_RADIUS_RANGE = { min: 30, max: 50 };
export const KUIPER_BELT_THICKNESS = 10;

export const OORT_CLOUD_INNER_RADIUS = 2000;
export const OORT_CLOUD_OUTER_RADIUS = 50000;

export const SOLAR_WIND_SPEED = 400;

export class StarData {
  private stars: Star[] = [];
  
  constructor(count: number = 10000) {
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
      
      const magnitude = 1 + Math.random() * 5;
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
}

export class AsteroidBeltImpl implements AsteroidBelt {
  private asteroids: Asteroid[] = [];
  private maxAsteroids = 5000;
  
  constructor(count: number = 5000) {
    this.generateAsteroids(count);
  }
  
  private generateAsteroids(count: number): void {
    this.asteroids = [];
    const actualCount = Math.min(count, this.maxAsteroids);
    
    for (let i = 0; i < actualCount; i++) {
      const a = ASTEROID_BELT_RADIUS_RANGE.min + Math.random() * (ASTEROID_BELT_RADIUS_RANGE.max - ASTEROID_BELT_RADIUS_RANGE.min);
      const e = Math.random() * 0.3;
      const i = (Math.random() - 0.5) * ASTEROID_BELT_THICKNESS * 2;
      const omega = Math.random() * Math.PI * 2;
      const argPeri = Math.random() * Math.PI * 2;
      const meanAnomaly = Math.random() * Math.PI * 2;
      
      const trueAnomaly = meanAnomaly + 2 * e * Math.sin(meanAnomaly);
      const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));
      
      const x = r * (Math.cos(omega) * Math.cos(argPeri + trueAnomaly) - Math.sin(omega) * Math.sin(argPeri + trueAnomaly) * Math.cos(i));
      const y = r * (Math.sin(omega) * Math.cos(argPeri + trueAnomaly) + Math.cos(omega) * Math.sin(argPeri + trueAnomaly) * Math.cos(i));
      const z = r * Math.sin(argPeri + trueAnomaly) * Math.sin(i);
      
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
  
  render(): void {}
  
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
  
  constructor(count: number = 2000) {
    this.generateObjects(count);
  }
  
  private generateObjects(count: number): void {
    this.objects = [];
    
    for (let i = 0; i < count; i++) {
      const a = KUIPER_BELT_RADIUS_RANGE.min + Math.random() * (KUIPER_BELT_RADIUS_RANGE.max - KUIPER_BELT_RADIUS_RANGE.min);
      const e = Math.random() * 0.2;
      const i = (Math.random() - 0.5) * KUIPER_BELT_THICKNESS;
      const omega = Math.random() * Math.PI * 2;
      const argPeri = Math.random() * Math.PI * 2;
      const meanAnomaly = Math.random() * Math.PI * 2;
      
      const trueAnomaly = meanAnomaly + 2 * e * Math.sin(meanAnomaly);
      const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));
      
      const x = r * (Math.cos(omega) * Math.cos(argPeri + trueAnomaly) - Math.sin(omega) * Math.sin(argPeri + trueAnomaly) * Math.cos(i));
      const y = r * (Math.sin(omega) * Math.cos(argPeri + trueAnomaly) + Math.cos(omega) * Math.sin(argPeri + trueAnomaly) * Math.cos(i));
      const z = r * Math.sin(argPeri + trueAnomaly) * Math.sin(i);
      
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
  
  render(): void {}
  
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
  
  render(): void {}
  
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
  
  render(): void {}
  
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
  
  update(time: number, planetPosition: Vec3d, sunPosition: Vec3d): void {
    void time;
    this.planetPosition = { ...planetPosition };
    this.sunPosition = { ...sunPosition };
  }
  
  render(): void {}
  
  dispose(): void {}
  
  setPlanetRadius(_radius: number): void {}
  
  setMagneticFieldStrength(_strength: number): void {}
  
  getPlanetPosition(): Vec3d {
    return this.planetPosition;
  }
  
  getSunPosition(): Vec3d {
    return this.sunPosition;
  }
}

export class AurorasImpl implements Auroras {
  private active = true;
  
  update(_time: number, _planetPosition: Vec3d, _sunPosition: Vec3d): void {}
  
  render(): void {}
  
  dispose(): void {}
  
  setIntensity(_intensity: number): void {}
  
  setActive(active: boolean): void {
    this.active = active;
  }
  
  isActive(): boolean {
    return this.active;
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
  
  private asteroidBeltEnabled = true;
  private kuiperBeltEnabled = true;
  private oortCloudEnabled = true;
  private solarWindEnabled = true;
  private stellarBackgroundEnabled = true;
  private magnetosphereEnabled = true;
  private aurorasEnabled = true;
  
  constructor() {
    this.stellarBackground = {} as StellarBackground;
    this.asteroidBelt = new AsteroidBeltImpl();
    this.kuiperBelt = new KuiperBeltImpl();
    this.oortCloud = new OortCloudImpl();
    this.solarWind = new SolarWindImpl();
    this.magnetosphere = new MagnetosphereImpl();
    this.auroras = new AurorasImpl();
  }
  
  update(time: number, sunPosition: Vec3d): void {
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
  }
  
  render(): void {
    if (this.stellarBackgroundEnabled) {
      this.stellarBackground.render();
    }
    if (this.solarWindEnabled) {
      this.solarWind.render();
    }
    if (this.oortCloudEnabled) {
      this.oortCloud.render();
    }
    if (this.kuiperBeltEnabled) {
      this.kuiperBelt.render();
    }
    if (this.asteroidBeltEnabled) {
      this.asteroidBelt.render();
    }
    if (this.magnetosphereEnabled) {
      this.magnetosphere.render();
    }
    if (this.aurorasEnabled) {
      this.auroras.render();
    }
  }
  
  dispose(): void {
    this.asteroidBelt.dispose();
    this.kuiperBelt.dispose();
    this.oortCloud.dispose();
    this.solarWind.dispose();
    this.magnetosphere.dispose();
    this.auroras.dispose();
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
}

export const createExtendedSpaceEnvironment = (): ExtendedSpaceEnvironment => {
  return new ExtendedSpaceEnvironmentImpl();
};
