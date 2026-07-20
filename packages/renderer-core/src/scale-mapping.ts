/**
 * 尺度映射系统（任务 P0-18）。
 */

import type { Vec3d } from '@solar-system/schemas';

export type DistanceUnit = 'm' | 'km' | 'au' | 'ly' | 'pc';

/**
 * 尺度模式（FR-SCALE-001/002）。
 * - real: 真实比例模式，所有尺度因子为 1（FR-SCALE-001）
 * - enhanced: 增强展示模式，可独立配置距离/半径/卫星倍率（FR-SCALE-002）
 *
 * 注意：ScaleMode 类型定义在 events-cruises.ts 中（CruiseWaypoint.scaleMode 使用）。
 * 此处通过 import 引入，避免重复定义。
 */
import type { ScaleMode } from './events-cruises.js';
export type { ScaleMode };

export const ASTRONOMICAL_UNIT = 149597870700;
export const LIGHT_YEAR = 9460730472580800;
export const PARSEC = 3.0856775814913673e16;

/**
 * 尺度配置（FR-SCALE-003）。
 *
 * 拆分三类独立倍率：
 * - distanceScale: 距离倍率（天体间距离的放大/缩小）
 * - radiusScale: 星体半径倍率（天体实体尺寸的放大/缩小）
 * - satelliteScale: 卫星系统倍率（卫星与母星的距离放大/缩小）
 *
 * FR-SCALE-001 真实模式：三者均为 1
 * FR-SCALE-002 增强模式：三者可独立配置
 * FR-SCALE-006 真实模式下 radiusScale=1（天体实体不放大），但 labelScale 可独立增强
 */
export interface ScaleConfig {
  baseUnit: DistanceUnit;
  /** 旧版单一尺度因子（向后兼容，等同于 distanceScale）。 */
  scaleFactor: number;
  minDistance: number;
  maxDistance: number;
  nearClip: number;
  farClip: number;
  /** FR-SCALE-003：距离倍率（天体间距离）。 */
  distanceScale?: number;
  /** FR-SCALE-003：星体半径倍率。 */
  radiusScale?: number;
  /** FR-SCALE-003：卫星系统倍率（卫星与母星距离）。 */
  satelliteScale?: number;
  /** FR-SCALE-006：标签屏幕空间增强倍率（仅影响标签，不影响天体实体）。 */
  labelScale?: number;
  /** FR-SCALE-001/002：当前尺度模式。 */
  mode?: ScaleMode;
}

/**
 * 增强模式标注信息（FR-SCALE-005）。
 *
 * 在增强模式下，轨道和标签需显示"示意"标注，避免用户误读为真实数据。
 */
export interface EnhancedModeAnnotation {
  /** 是否处于增强模式。 */
  isEnhanced: boolean;
  /** 标注文本（如"示意比例，非真实距离"）。 */
  label: string;
  /** 受影响的维度。 */
  dimensions: ('distance' | 'radius' | 'satellite')[];
  /** 实际倍率值。 */
  scales: { distance: number; radius: number; satellite: number };
}

export interface ScaleMapping {
  worldToView(worldPos: Vec3d): Vec3d;
  viewToWorld(viewPos: Vec3d): Vec3d;
  distanceToView(distance: number): number;
  viewToDistance(viewDistance: number): number;
  getScaleFactor(): number;
  update(cameraDistance: number): void;
  /** FR-SCALE-003：获取距离倍率。 */
  getDistanceScale?(): number;
  /** FR-SCALE-003：获取半径倍率。 */
  getRadiusScale?(): number;
  /** FR-SCALE-003：获取卫星系统倍率。 */
  getSatelliteScale?(): number;
  /** FR-SCALE-006：获取标签屏幕空间倍率。 */
  getLabelScale?(): number;
  /** FR-SCALE-001/002：获取当前模式。 */
  getMode?(): ScaleMode;
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

  /** FR-SCALE-003：距离倍率。 */
  getDistanceScale(): number {
    const mode = this.config.mode ?? 'enhanced';
    if (mode === 'real') return 1;
    return this.config.distanceScale ?? this.currentScale;
  }

  /** FR-SCALE-003：半径倍率。 */
  getRadiusScale(): number {
    const mode = this.config.mode ?? 'enhanced';
    if (mode === 'real') return 1; // FR-SCALE-006：真实模式天体实体不放大
    return this.config.radiusScale ?? 1;
  }

  /** FR-SCALE-003：卫星系统倍率。 */
  getSatelliteScale(): number {
    const mode = this.config.mode ?? 'enhanced';
    if (mode === 'real') return 1;
    return this.config.satelliteScale ?? 1;
  }

  /** FR-SCALE-006：标签屏幕空间倍率。 */
  getLabelScale(): number {
    // FR-SCALE-006：真实模式下标签可屏幕空间增强，但天体实体不放大
    return this.config.labelScale ?? 1;
  }

  /** FR-SCALE-001/002：获取当前模式。 */
  getMode(): ScaleMode {
    return this.config.mode ?? 'enhanced';
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

  /** FR-SCALE-003：距离倍率。 */
  getDistanceScale(): number {
    const mode = this.config.mode ?? 'enhanced';
    if (mode === 'real') return 1;
    return this.config.distanceScale ?? this.currentScale;
  }

  /** FR-SCALE-003：半径倍率。 */
  getRadiusScale(): number {
    const mode = this.config.mode ?? 'enhanced';
    if (mode === 'real') return 1;
    return this.config.radiusScale ?? 1;
  }

  /** FR-SCALE-003：卫星系统倍率。 */
  getSatelliteScale(): number {
    const mode = this.config.mode ?? 'enhanced';
    if (mode === 'real') return 1;
    return this.config.satelliteScale ?? 1;
  }

  /** FR-SCALE-006：标签屏幕空间倍率。 */
  getLabelScale(): number {
    return this.config.labelScale ?? 1;
  }

  /** FR-SCALE-001/002：获取当前模式。 */
  getMode(): ScaleMode {
    return this.config.mode ?? 'enhanced';
  }
}

export class ScaleManager {
  private mapping: ScaleMapping;
  private cameraDistance: number = 0;
  private lastUpdate: number = 0;
  /** FR-SCALE-001/002：当前尺度模式。 */
  private mode: ScaleMode = 'enhanced';
  /** FR-SCALE-003：独立的尺度倍率配置。 */
  private splitScales: { distance: number; radius: number; satellite: number; label: number };

  constructor(mapping?: ScaleMapping) {
    this.mapping = mapping || new LogarithmicScaleMapping();
    this.splitScales = { distance: 1, radius: 1, satellite: 1, label: 1 };
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

  // ===== FR-SCALE-001/002：尺度模式切换 =====

  /**
   * FR-SCALE-001：切换到真实比例模式。
   * 所有尺度因子设为 1，天体间距离/半径/卫星距离均为真实比例。
   */
  setRealMode(): void {
    this.mode = 'real';
    this.splitScales = { distance: 1, radius: 1, satellite: 1, label: this.splitScales.label };
  }

  /**
   * FR-SCALE-002：切换到增强展示模式。
   * 可独立配置距离/半径/卫星倍率，便于可视化展示。
   */
  setEnhancedMode(scales?: Partial<{ distance: number; radius: number; satellite: number; label: number }>): void {
    this.mode = 'enhanced';
    if (scales) {
      if (scales.distance !== undefined) this.splitScales.distance = scales.distance;
      if (scales.radius !== undefined) this.splitScales.radius = scales.radius;
      if (scales.satellite !== undefined) this.splitScales.satellite = scales.satellite;
      if (scales.label !== undefined) this.splitScales.label = scales.label;
    }
  }

  /** 获取当前尺度模式（FR-SCALE-001/002）。 */
  getMode(): ScaleMode {
    return this.mode;
  }

  // ===== FR-SCALE-003：分别显示距离/半径/卫星系统倍率 =====

  /** FR-SCALE-003：获取距离倍率。 */
  getDistanceScale(): number {
    if (this.mode === 'real') return 1;
    return this.splitScales.distance;
  }

  /** FR-SCALE-003：获取星体半径倍率。 */
  getRadiusScale(): number {
    if (this.mode === 'real') return 1; // FR-SCALE-006：真实模式天体实体不放大
    return this.splitScales.radius;
  }

  /** FR-SCALE-003：获取卫星系统倍率。 */
  getSatelliteScale(): number {
    if (this.mode === 'real') return 1;
    return this.splitScales.satellite;
  }

  /** FR-SCALE-003：设置距离倍率。 */
  setDistanceScale(scale: number): void {
    this.splitScales.distance = Math.max(0.001, Math.min(1e6, scale));
  }

  /** FR-SCALE-003：设置星体半径倍率。 */
  setRadiusScale(scale: number): void {
    this.splitScales.radius = Math.max(0.001, Math.min(1e6, scale));
  }

  /** FR-SCALE-003：设置卫星系统倍率。 */
  setSatelliteScale(scale: number): void {
    this.splitScales.satellite = Math.max(0.001, Math.min(1e6, scale));
  }

  // ===== FR-SCALE-006：标签独立缩放 =====

  /**
   * FR-SCALE-006：获取标签屏幕空间增强倍率。
   * 真实模式下标签可屏幕空间增强，但天体实体不放大。
   */
  getLabelScale(): number {
    return this.splitScales.label;
  }

  /** FR-SCALE-006：设置标签屏幕空间增强倍率。 */
  setLabelScale(scale: number): void {
    this.splitScales.label = Math.max(0.1, Math.min(100, scale));
  }

  // ===== FR-SCALE-005：增强模式标注 =====

  /**
   * FR-SCALE-005：获取增强模式标注信息。
   * 在增强模式下，轨道和标签需显示"示意"标注，避免用户误读为真实数据。
   */
  getEnhancedModeAnnotation(): EnhancedModeAnnotation {
    const dims: ('distance' | 'radius' | 'satellite')[] = [];
    if (this.mode === 'enhanced') {
      if (this.splitScales.distance !== 1) dims.push('distance');
      if (this.splitScales.radius !== 1) dims.push('radius');
      if (this.splitScales.satellite !== 1) dims.push('satellite');
    }

    const labels: string[] = [];
    if (dims.includes('distance')) labels.push('距离');
    if (dims.includes('radius')) labels.push('半径');
    if (dims.includes('satellite')) labels.push('卫星系统');

    const label = this.mode === 'enhanced' && dims.length > 0
      ? `示意比例（${labels.join('/')}已缩放），非真实数据`
      : '';

    return {
      isEnhanced: this.mode === 'enhanced' && dims.length > 0,
      label,
      dimensions: dims,
      scales: {
        distance: this.getDistanceScale(),
        radius: this.getRadiusScale(),
        satellite: this.getSatelliteScale(),
      },
    };
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
