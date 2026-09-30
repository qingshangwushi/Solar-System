export type QualityPreset = "ultra" | "high" | "medium" | "performance";

export interface QualityProfile {
  pixelRatio: number;
  orbitSegments: number;
  starPointSize: number;
}

const PROFILES: Record<QualityPreset, QualityProfile> = {
  ultra: { pixelRatio: 2, orbitSegments: 192, starPointSize: 0.075 },
  high: { pixelRatio: 1.5, orbitSegments: 128, starPointSize: 0.065 },
  medium: { pixelRatio: 1.15, orbitSegments: 80, starPointSize: 0.06 },
  performance: { pixelRatio: 0.85, orbitSegments: 40, starPointSize: 0.05 },
};

export function qualityProfile(preset: QualityPreset): QualityProfile {
  return PROFILES[preset];
}
