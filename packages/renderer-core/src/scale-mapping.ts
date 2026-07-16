/**
 * 尺度映射系统（任务 P0-18）。
 */

import type { Vec3d } from '@solar-system/schemas';

export type DistanceUnit = 'm' | 'km' | 'au' | 'ly' | 'pc';

export const ASTRONOMICAL_UNIT = 149597870700;
export const LIGHT_YEAR = 9460730472580800;
export const PARSEC = 3.0856775814913673e16;

export interface ScaleConfig {
  baseUnit: DistanceUnit;
  scaleFactor: number;
  minDistance: number;
  maxDistance: number;
  nearClip: number;
  farClip: number;
}

export interface ScaleMapping {
  worldToView(worldPos: Vec3d): Vec3d;
  viewToWorld(viewPos: Vec3d): Vec3d;
  distanceToView(distance: number): number;
  viewToDistance(viewDistance: number): number;
  getScaleFactor(): number;
  update(cameraDistance: number): void;
}

export class LogarithmicScaleMapping implements ScaleMapping {
  private config: ScaleConfig;
  private currentScale: number = 1;

  constructor(config?: Partial<ScaleConfig>) {
    this.config = {
      baseUnit: 'au',
      scaleFactor: 100,
      minDistance: 1e3,
      maxDistance: 1e18,
      nearClip: 0.1,
      farClip: 1e12,
      ...config,
    };
    this.currentScale = this.config.scaleFactor;
  }

  worldToView(worldPos: Vec3d): Vec3d {
    const scale = this.currentScale;
    return {
      x: worldPos.x * scale,
      y: worldPos.y * scale,
      z: worldPos.z * scale,
    };
  }

  viewToWorld(viewPos: Vec3d): Vec3d {
    const scale = this.currentScale;
    return {
      x: viewPos.x / scale,
      y: viewPos.y / scale,
      z: viewPos.z / scale,
    };
  }

  distanceToView(distance: number): number {
    return distance * this.currentScale;
  }

  viewToDistance(viewDistance: number): number {
    return viewDistance / this.currentScale;
  }

  getScaleFactor(): number {
    return this.currentScale;
  }

  update(cameraDistance: number): void {
    const targetScale = this.calculateScale(cameraDistance);
    this.currentScale = this.currentScale * 0.9 + targetScale * 0.1;
  }

  private calculateScale(distance: number): number {
    const minLog = Math.log10(this.config.minDistance);
    const maxLog = Math.log10(this.config.maxDistance);
    const distLog = Math.log10(Math.max(distance, this.config.minDistance));
    const normalized = (distLog - minLog) / (maxLog - minLog);
    const scale = this.config.scaleFactor * Math.pow(10, -normalized * 5);
    return Math.max(1e-10, Math.min(1e10, scale));
  }
}

export class PiecewiseScaleMapping implements ScaleMapping {
  private config: ScaleConfig;
  private currentScale: number = 1;
  private thresholds: number[];
  private scales: number[];

  constructor(config?: Partial<ScaleConfig>) {
    this.config = {
      baseUnit: 'au',
      scaleFactor: 100,
      minDistance: 1e3,
      maxDistance: 1e18,
      nearClip: 0.1,
      farClip: 1e12,
      ...config,
    };

    this.thresholds = [1e6, 1e9, 1e12, 1e15, 1e18];
    this.scales = [1e-6, 1e-9, 1e-12, 1e-15, 1e-18];

    this.currentScale = this.config.scaleFactor;
  }

  worldToView(worldPos: Vec3d): Vec3d {
    const scale = this.currentScale;
    return {
      x: worldPos.x * scale,
      y: worldPos.y * scale,
      z: worldPos.z * scale,
    };
  }

  viewToWorld(viewPos: Vec3d): Vec3d {
    const scale = this.currentScale;
    return {
      x: viewPos.x / scale,
      y: viewPos.y / scale,
      z: viewPos.z / scale,
    };
  }

  distanceToView(distance: number): number {
    return distance * this.currentScale;
  }

  viewToDistance(viewDistance: number): number {
    return viewDistance / this.currentScale;
  }

  getScaleFactor(): number {
    return this.currentScale;
  }

  update(cameraDistance: number): void {
    const targetScale = this.findScale(cameraDistance);
    this.currentScale = this.currentScale * 0.9 + targetScale * 0.1;
  }

  private findScale(distance: number): number {
    for (let i = 0; i < this.thresholds.length; i++) {
      if (distance < (this.thresholds[i] as number)) {
        return this.config.scaleFactor * (this.scales[i] as number);
      }
    }
    return this.config.scaleFactor * (this.scales[this.scales.length - 1] as number);
  }
}

export class ScaleManager {
  private mapping: ScaleMapping;
  private cameraDistance: number = 0;
  private lastUpdate: number = 0;

  constructor(mapping?: ScaleMapping) {
    this.mapping = mapping || new LogarithmicScaleMapping();
  }

  update(cameraDistance: number, _deltaTime: number): void {
    this.cameraDistance = cameraDistance;

    const now = performance.now();
    if (now - this.lastUpdate > 100) {
      this.mapping.update(cameraDistance);
      this.lastUpdate = now;
    }
  }

  worldToView(worldPos: Vec3d): Vec3d {
    return this.mapping.worldToView(worldPos);
  }

  viewToWorld(viewPos: Vec3d): Vec3d {
    return this.mapping.viewToWorld(viewPos);
  }

  distanceToView(distance: number): number {
    return this.mapping.distanceToView(distance);
  }

  viewToDistance(viewDistance: number): number {
    return this.mapping.viewToDistance(viewDistance);
  }

  getScaleFactor(): number {
    return this.mapping.getScaleFactor();
  }

  getCameraDistance(): number {
    return this.cameraDistance;
  }

  setMapping(mapping: ScaleMapping): void {
    this.mapping = mapping;
  }
}

export function convertUnit(value: number, from: DistanceUnit, to: DistanceUnit): number {
  const meters = toMeters(value, from);
  return fromMeters(meters, to);
}

export function toMeters(value: number, from: DistanceUnit): number {
  switch (from) {
    case 'm':
      return value;
    case 'km':
      return value * 1000;
    case 'au':
      return value * ASTRONOMICAL_UNIT;
    case 'ly':
      return value * LIGHT_YEAR;
    case 'pc':
      return value * PARSEC;
    default:
      return value;
  }
}

export function fromMeters(value: number, to: DistanceUnit): number {
  switch (to) {
    case 'm':
      return value;
    case 'km':
      return value / 1000;
    case 'au':
      return value / ASTRONOMICAL_UNIT;
    case 'ly':
      return value / LIGHT_YEAR;
    case 'pc':
      return value / PARSEC;
    default:
      return value;
  }
}

export function formatDistance(value: number, unit: DistanceUnit = 'm', precision: number = 2): string {
  const meters = toMeters(value, unit);

  if (meters < 1000) {
    return `${meters.toFixed(precision)} m`;
  } else if (meters < 1e6) {
    return `${(meters / 1000).toFixed(precision)} km`;
  } else if (meters < ASTRONOMICAL_UNIT) {
    return `${(meters / 1000).toFixed(precision)} km`;
  } else if (meters < LIGHT_YEAR) {
    return `${(meters / ASTRONOMICAL_UNIT).toFixed(precision)} AU`;
  } else if (meters < PARSEC) {
    return `${(meters / LIGHT_YEAR).toFixed(precision)} ly`;
  } else {
    return `${(meters / PARSEC).toFixed(precision)} pc`;
  }
}

export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toFixed(0)}s`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  } else {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
}
