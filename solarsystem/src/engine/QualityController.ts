/**
 * Adaptive quality.
 *
 * Exhibition hardware ranges from integrated-graphics panels to 4K workstations,
 * and a 4K panel that cannot hold the frame rate is worse than a 1080p one that
 * can. The controller therefore starts from a configured level, measures the frame
 * rate over a sliding window and steps the level up or down with hysteresis.
 *
 * Quality affects: device pixel ratio, bloom, atmosphere shells, orbit path
 * density, minor-body draw count and star count.
 */

export type QualityLevel = 'ultra' | 'high' | 'medium' | 'performance'

export interface QualityProfile {
  level: QualityLevel
  pixelRatioCap: number
  bloom: boolean
  atmosphere: boolean
  orbitSamples: number
  maxMinorBodies: number
  starCount: number
  labelBudget: number
  shadows: boolean
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  ultra: {
    level: 'ultra',
    pixelRatioCap: 2,
    bloom: true,
    atmosphere: true,
    orbitSamples: 512,
    maxMinorBodies: 12_000,
    starCount: 16_000,
    labelBudget: 42,
    shadows: false,
  },
  high: {
    level: 'high',
    pixelRatioCap: 1.5,
    bloom: true,
    atmosphere: true,
    orbitSamples: 320,
    maxMinorBodies: 9_000,
    starCount: 12_000,
    labelBudget: 32,
    shadows: false,
  },
  medium: {
    level: 'medium',
    pixelRatioCap: 1.25,
    bloom: false,
    atmosphere: true,
    orbitSamples: 192,
    maxMinorBodies: 5_000,
    starCount: 7_000,
    labelBudget: 24,
    shadows: false,
  },
  performance: {
    level: 'performance',
    pixelRatioCap: 0.85,
    bloom: false,
    atmosphere: false,
    orbitSamples: 96,
    maxMinorBodies: 2_000,
    starCount: 3_500,
    labelBudget: 16,
    shadows: false,
  },
}

const ORDER: QualityLevel[] = ['performance', 'medium', 'high', 'ultra']

export interface QualitySample {
  fps: number
}

/**
 * Sliding-window controller. A level is only changed when the average frame rate
 * has been outside the target band for a sustained period, and it never steps more
 * than one level at a time, which avoids visible oscillation during a fly-to.
 */
export class QualityController {
  private profileValue: QualityProfile
  private samples: number[] = []
  /** Rolling window in seconds; time-based so a slow machine reacts quickly. */
  private readonly windowSeconds = 1.6
  private readonly minimumSamples = 12
  private readonly downshiftFps: number
  private readonly upshiftFps: number
  private lastChangeAt = 0
  private manualOverride = false
  private currentFps = 0
  private autoAdjust: boolean

  constructor(
    initial: QualityLevel,
    options: { targetFps?: number; minimumFps?: number; autoAdjust?: boolean } = {},
  ) {
    this.profileValue = QUALITY_PROFILES[initial]
    const target = options.targetFps ?? 58
    this.upshiftFps = target
    this.downshiftFps = options.minimumFps ?? 40
    this.autoAdjust = options.autoAdjust ?? true
  }

  get profile(): QualityProfile {
    return this.profileValue
  }

  get fps(): number {
    return this.currentFps
  }

  setProfile(level: QualityLevel, manual = true): void {
    this.profileValue = QUALITY_PROFILES[level]
    if (manual) this.manualOverride = true
    this.samples = []
    this.lastChangeAt = performance.now()
  }

  get isManuallyLocked(): boolean {
    return this.manualOverride
  }

  releaseManualOverride(): void {
    this.manualOverride = false
  }

  /**
   * Feed one frame; returns the profile to use for the next frame.
   *
   * The window is measured in seconds rather than frames: a machine rendering at
   * 0.5 fps must be able to downshift within a second or two, which a 90-frame
   * window could never achieve. Below half the target the controller steps down
   * (possibly by more than one level) instead of crawling down one level at a time.
   */
  sample(frameDeltaSeconds: number): QualityProfile {
    if (!(frameDeltaSeconds > 0) || frameDeltaSeconds > 5) return this.profileValue
    this.samples.push(frameDeltaSeconds)
    let total = 0
    for (const value of this.samples) total += value
    while (this.samples.length > this.minimumSamples && total - this.samples[0] > this.windowSeconds) {
      total -= this.samples.shift() as number
    }
    const averageSeconds = total / this.samples.length
    const averageFps = 1 / averageSeconds
    this.currentFps = averageFps

    if (!this.autoAdjust || this.manualOverride || this.samples.length < this.minimumSamples) return this.profileValue
    const now = performance.now()
    if (now - this.lastChangeAt < 2500) return this.profileValue

    const index = ORDER.indexOf(this.profileValue.level)
    if (averageFps < this.downshiftFps && index > 0) {
      // Critical frame rates drop straight to the performance profile.
      const step = averageFps < this.downshiftFps * 0.5 ? index : 1
      this.profileValue = QUALITY_PROFILES[ORDER[Math.max(0, index - step)]]
      this.lastChangeAt = now
      this.samples = []
    } else if (averageFps > this.upshiftFps + 6 && index < ORDER.length - 1) {
      this.profileValue = QUALITY_PROFILES[ORDER[index + 1]]
      this.lastChangeAt = now
      this.samples = []
    }
    return this.profileValue
  }
}