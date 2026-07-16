import type { Vec3d, Quat } from '@solar-system/schemas';

export type BodyId = number;

export type AssetTier = 'S' | 'A' | 'B' | 'C';

export interface BodyRenderer {
  bodyId: BodyId;
  assetTier: AssetTier;
  enabled: boolean;
  
  update(time: number, position: Vec3d, orientation: Quat, sunDirection: Vec3d): void;
  render(): void;
  dispose(): void;
  
  getBoundingRadius(): number;
  setLOD(level: number): void;
}

export interface BodyRendererFactory {
  create(bodyId: BodyId, options?: BodyRendererOptions): BodyRenderer | null;
}

export interface BodyRendererOptions {
  assetTier?: AssetTier;
  quality?: 'cinematic' | 'high' | 'standard' | 'safe';
  enableAtmosphere?: boolean;
  enableClouds?: boolean;
  enableRings?: boolean;
  enableNightLights?: boolean;
  enableAuroras?: boolean;
}

export interface SunRenderer extends BodyRenderer {
  setCoronaIntensity(intensity: number): void;
  setFlareActivity(activity: number): void;
}

export interface EarthRenderer extends BodyRenderer {
  setAtmosphereParams(params: AtmosphereParams): void;
  setCloudCoverage(coverage: number): void;
  enableNightLights(enable: boolean): void;
  enableAuroras(enable: boolean): void;
}

export interface GasGiantRenderer extends BodyRenderer {
  setCloudBandSpeed(speed: number): void;
  enableStormEffects(enable: boolean): void;
}

export interface RingRenderer extends BodyRenderer {
  setRingOpacity(opacity: number): void;
  enableShadow(enable: boolean): void;
}

export interface AtmosphereParams {
  planetRadius: number;
  atmosphereRadius: number;
  rayleighScaleHeight: number;
  mieScaleHeight: number;
  rayleighCoefficient: [number, number, number];
  mieCoefficient: [number, number, number];
  mieDirectionalG: number;
  sunIntensity: number;
}

export const PLANET_BODY_IDS: Record<string, BodyId> = {
  SUN: 10,
  MERCURY: 199,
  VENUS: 299,
  EARTH: 399,
  MARS: 499,
  JUPITER: 599,
  SATURN: 699,
  URANUS: 799,
  NEPTUNE: 899,
  MOON: 301,
};

export const BODY_ID_TO_NAME: Record<BodyId, string> = {
  10: 'sun',
  199: 'mercury',
  299: 'venus',
  399: 'earth',
  499: 'mars',
  599: 'jupiter',
  699: 'saturn',
  799: 'uranus',
  899: 'neptune',
  301: 'moon',
};

export const DEFAULT_ATMOSPHERE_PARAMS: Record<BodyId, Partial<AtmosphereParams>> = {
  399: {
    planetRadius: 6371000,
    atmosphereRadius: 6471000,
    rayleighScaleHeight: 8000,
    mieScaleHeight: 1200,
    rayleighCoefficient: [5.8e-6, 1.35e-5, 3.31e-5],
    mieCoefficient: [21e-6, 21e-6, 21e-6],
    mieDirectionalG: 0.76,
    sunIntensity: 20,
  },
  299: {
    planetRadius: 6051800,
    atmosphereRadius: 6201800,
    rayleighScaleHeight: 15000,
    mieScaleHeight: 3000,
    rayleighCoefficient: [1e-5, 1e-5, 1.5e-5],
    mieCoefficient: [30e-6, 30e-6, 30e-6],
    mieDirectionalG: 0.8,
    sunIntensity: 18,
  },
  499: {
    planetRadius: 3389500,
    atmosphereRadius: 3409500,
    rayleighScaleHeight: 11000,
    mieScaleHeight: 2000,
    rayleighCoefficient: [2e-6, 3e-6, 5e-6],
    mieCoefficient: [10e-6, 10e-6, 10e-6],
    mieDirectionalG: 0.7,
    sunIntensity: 4,
  },
};

export const SOLAR_RADIUS_KM = 695700;
export const PLANET_RADII_KM: Record<BodyId, number> = {
  10: SOLAR_RADIUS_KM,
  199: 2439.7,
  299: 6051.8,
  399: 6371.0,
  499: 3389.5,
  599: 69911,
  699: 58232,
  799: 25362,
  899: 24622,
  301: 1737.4,
};

export class SunRendererImpl implements SunRenderer {
  bodyId: BodyId = PLANET_BODY_IDS.SUN ?? 10;
  assetTier: AssetTier = 'S';
  enabled = true;
  
  private coronaIntensity = 1.0;
  
  update(_time: number, _position: Vec3d, _orientation: Quat, _sunDirection: Vec3d): void {}
  
  render(): void {}
  
  dispose(): void {}
  
  getBoundingRadius(): number {
    return SOLAR_RADIUS_KM * 1000 * (1 + this.coronaIntensity * 0.1);
  }
  
  setLOD(_level: number): void {}
  
  setCoronaIntensity(intensity: number): void {
    this.coronaIntensity = Math.max(0, Math.min(2, intensity));
  }
  
  setFlareActivity(_activity: number): void {}
}

export class SolidPlanetRenderer implements BodyRenderer {
  bodyId: BodyId;
  assetTier: AssetTier;
  enabled = true;
  
  constructor(bodyId: BodyId, assetTier: AssetTier = 'S') {
    this.bodyId = bodyId;
    this.assetTier = assetTier;
  }
  
  update(_time: number, _position: Vec3d, _orientation: Quat, _sunDirection: Vec3d): void {}
  
  render(): void {}
  
  dispose(): void {}
  
  getBoundingRadius(): number {
    return (PLANET_RADII_KM[this.bodyId] || 1000) * 1000;
  }
  
  setLOD(_level: number): void {}
}

export class EarthRendererImpl implements EarthRenderer {
  bodyId: BodyId = PLANET_BODY_IDS.EARTH ?? 399;
  assetTier: AssetTier = 'S';
  enabled = true;
  
  private atmoParams: AtmosphereParams;
  
  constructor() {
    this.atmoParams = {
      planetRadius: 6371000,
      atmosphereRadius: 6471000,
      rayleighScaleHeight: 8000,
      mieScaleHeight: 1200,
      rayleighCoefficient: [5.8e-6, 1.35e-5, 3.31e-5],
      mieCoefficient: [21e-6, 21e-6, 21e-6],
      mieDirectionalG: 0.76,
      sunIntensity: 20,
    };
  }
  
  update(_time: number, _position: Vec3d, _orientation: Quat, _sunDirection: Vec3d): void {}
  
  render(): void {}
  
  dispose(): void {}
  
  getBoundingRadius(): number {
    return this.atmoParams.atmosphereRadius;
  }
  
  setLOD(_level: number): void {}
  
  setAtmosphereParams(params: AtmosphereParams): void {
    this.atmoParams = { ...params };
  }
  
  setCloudCoverage(_coverage: number): void {}
  
  enableNightLights(_enable: boolean): void {}
  
  enableAuroras(_enable: boolean): void {}
}

export class GasGiantRendererImpl implements GasGiantRenderer {
  bodyId: BodyId;
  assetTier: AssetTier = 'S';
  enabled = true;
  
  constructor(bodyId: BodyId) {
    this.bodyId = bodyId;
  }
  
  update(_time: number, _position: Vec3d, _orientation: Quat, _sunDirection: Vec3d): void {}
  
  render(): void {}
  
  dispose(): void {}
  
  getBoundingRadius(): number {
    return (PLANET_RADII_KM[this.bodyId] || 1000) * 1000;
  }
  
  setLOD(_level: number): void {}
  
  setCloudBandSpeed(_speed: number): void {}
  
  enableStormEffects(_enable: boolean): void {}
}

export class RingRendererImpl implements RingRenderer {
  bodyId: BodyId = PLANET_BODY_IDS.SATURN ?? 699;
  assetTier: AssetTier = 'S';
  enabled = true;
  
  private ringOpacity = 1.0;
  
  update(_time: number, _position: Vec3d, _orientation: Quat, _sunDirection: Vec3d): void {}
  
  render(): void {}
  
  dispose(): void {}
  
  getBoundingRadius(): number {
    return 136775000;
  }
  
  setLOD(_level: number): void {}
  
  setRingOpacity(opacity: number): void {
    this.ringOpacity = Math.max(0, Math.min(1, opacity));
  }
  
  enableShadow(_enable: boolean): void {}
}

export class BodyRendererFactoryImpl implements BodyRendererFactory {
  private renderers: Map<BodyId, BodyRenderer> = new Map();
  
  create(bodyId: BodyId, options?: BodyRendererOptions): BodyRenderer | null {
    const existing = this.renderers.get(bodyId);
    if (existing) return existing;
    
    let renderer: BodyRenderer | null = null;
    
    switch (bodyId) {
      case PLANET_BODY_IDS.SUN:
        renderer = new SunRendererImpl();
        break;
      case PLANET_BODY_IDS.EARTH:
        renderer = new EarthRendererImpl();
        break;
      case PLANET_BODY_IDS.MERCURY:
      case PLANET_BODY_IDS.VENUS:
      case PLANET_BODY_IDS.MARS:
        renderer = new SolidPlanetRenderer(bodyId, 'S');
        break;
      case PLANET_BODY_IDS.JUPITER:
      case PLANET_BODY_IDS.SATURN:
      case PLANET_BODY_IDS.URANUS:
      case PLANET_BODY_IDS.NEPTUNE:
        renderer = new GasGiantRendererImpl(bodyId);
        break;
      case PLANET_BODY_IDS.MOON:
        renderer = new SolidPlanetRenderer(bodyId, 'S');
        break;
      default:
        renderer = null;
    }
    
    if (renderer && options) {
      if (options.assetTier) {
        renderer.assetTier = options.assetTier;
      }
    }
    
    if (renderer) {
      this.renderers.set(bodyId, renderer);
    }
    
    return renderer;
  }
  
  getRingRenderer(parentBodyId: BodyId): RingRenderer | null {
    if (parentBodyId === PLANET_BODY_IDS.SATURN) {
      const existing = this.renderers.get(parentBodyId);
      if (existing && existing instanceof RingRendererImpl) {
        return existing;
      }
      const ringRenderer = new RingRendererImpl();
      this.renderers.set(parentBodyId, ringRenderer);
      return ringRenderer;
    }
    return null;
  }
  
  dispose(bodyId: BodyId): void {
    const renderer = this.renderers.get(bodyId);
    if (renderer) {
      renderer.dispose();
      this.renderers.delete(bodyId);
    }
  }
  
  disposeAll(): void {
    this.renderers.forEach((r) => r.dispose());
    this.renderers.clear();
  }
}

export const createBodyRendererFactory = (): BodyRendererFactory => {
  return new BodyRendererFactoryImpl();
};

export type {
  BodyRenderer,
  BodyRendererFactory,
  BodyRendererOptions,
  SunRenderer,
  EarthRenderer,
  GasGiantRenderer,
  RingRenderer,
  AtmosphereParams,
};
