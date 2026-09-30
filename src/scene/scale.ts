import type { BodyType } from "../astronomy/types";

export type ScaleMode = "scientific" | "visible" | "exhibition";

export interface SceneScale {
  mode: ScaleMode;
  label: string;
  enhancementActive: boolean;
  nonLinearDistance: boolean;
  distanceKm(km: number): number;
  radiusKm(km: number, type?: BodyType): number;
}

const KM_PER_SCENE_UNIT = 1_000_000;

export function createScale(mode: ScaleMode): SceneScale {
  const common = {
    mode,
    enhancementActive: mode !== "scientific",
    nonLinearDistance: mode === "exhibition",
    distanceKm(km: number): number {
      if (!Number.isFinite(km)) throw new RangeError("Distance must be finite");
      const sign = Math.sign(km);
      const absolute = Math.abs(km);
      if (mode === "exhibition") return sign * Math.log1p(absolute / KM_PER_SCENE_UNIT) * 2.25;
      return km / KM_PER_SCENE_UNIT;
    },
    radiusKm(km: number, type?: BodyType): number {
      if (!Number.isFinite(km) || km < 0) throw new RangeError("Radius must be finite and non-negative");
      const scientificRadius = km / KM_PER_SCENE_UNIT;
      if (mode === "scientific" || type === "star") return scientificRadius;
      return Math.max(scientificRadius * 36, 0.018);
    },
  };
  const labels: Record<ScaleMode, string> = {
    scientific: "Scientific Scale · true distance and size",
    visible: "Visible Scale · body sizes enhanced",
    exhibition: "Exhibition Scale · non-linear distance compression",
  };
  return { ...common, label: labels[mode] };
}
