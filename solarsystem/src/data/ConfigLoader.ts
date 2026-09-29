/**
 * Runtime configuration.
 *
 * Exhibition installations are tuned without recompiling: everything that a
 * museum technician may want to change lives in `exhibition.config.json`, which is
 * fetched at start-up and merged over the defaults below.
 */
import type { ExhibitionConfig } from '../types/catalog'

export const DEFAULT_EXHIBITION_CONFIG: ExhibitionConfig = {
  language: 'zh-CN',
  autoDemo: true,
  autoDemoDelaySeconds: 150,
  defaultTarget: 'sun',
  defaultScaleMode: 'exhibition',
  defaultQuality: 'high',
  enableScientificMode: true,
  enableMinorPlanets: true,
  enableStarfield: true,
  enableAutoDemo: true,
  guidedTourOnIdle: true,
  showPerformanceOverlay: false,
  uiScale: 1,
  reducedMotion: false,
  title: { zh: '太阳系 · 真实三维导览', en: 'Real-Time Solar System' },
  subtitle: {
    zh: '探索太阳、行星、卫星、小行星以及人类已编目的太阳系世界',
    en: 'Explore the Sun, planets, moons and catalogued small bodies of our solar system',
  },
}

export function dataUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalised = relativePath.replace(/^\/+/, '')
  return `${base}${base.endsWith('/') ? '' : '/'}${normalised}`
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function coerceLanguage(value: unknown): 'zh-CN' | 'en-US' {
  return value === 'en-US' ? 'en-US' : 'zh-CN'
}

/** Merges a partially specified configuration over the defaults, ignoring bad types. */
export function mergeExhibitionConfig(raw: unknown): ExhibitionConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_EXHIBITION_CONFIG }
  const input = raw as Record<string, unknown>
  const scaleMode = input.defaultScaleMode
  const quality = input.defaultQuality
  return {
    language: coerceLanguage(input.language),
    autoDemo: coerceBoolean(input.autoDemo, DEFAULT_EXHIBITION_CONFIG.autoDemo),
    autoDemoDelaySeconds: coerceNumber(input.autoDemoDelaySeconds, DEFAULT_EXHIBITION_CONFIG.autoDemoDelaySeconds),
    defaultTarget: typeof input.defaultTarget === 'string' ? input.defaultTarget : DEFAULT_EXHIBITION_CONFIG.defaultTarget,
    defaultScaleMode:
      scaleMode === 'scientific' || scaleMode === 'visible' || scaleMode === 'exhibition'
        ? scaleMode
        : DEFAULT_EXHIBITION_CONFIG.defaultScaleMode,
    defaultQuality:
      quality === 'ultra' || quality === 'high' || quality === 'medium' || quality === 'performance'
        ? quality
        : DEFAULT_EXHIBITION_CONFIG.defaultQuality,
    enableScientificMode: coerceBoolean(input.enableScientificMode, DEFAULT_EXHIBITION_CONFIG.enableScientificMode),
    enableMinorPlanets: coerceBoolean(input.enableMinorPlanets, DEFAULT_EXHIBITION_CONFIG.enableMinorPlanets),
    enableStarfield: coerceBoolean(input.enableStarfield, DEFAULT_EXHIBITION_CONFIG.enableStarfield),
    enableAutoDemo: coerceBoolean(input.enableAutoDemo, DEFAULT_EXHIBITION_CONFIG.enableAutoDemo),
    guidedTourOnIdle: coerceBoolean(input.guidedTourOnIdle, DEFAULT_EXHIBITION_CONFIG.guidedTourOnIdle),
    showPerformanceOverlay: coerceBoolean(input.showPerformanceOverlay, DEFAULT_EXHIBITION_CONFIG.showPerformanceOverlay),
    uiScale: Math.min(2, Math.max(0.75, coerceNumber(input.uiScale, DEFAULT_EXHIBITION_CONFIG.uiScale))),
    reducedMotion: coerceBoolean(input.reducedMotion, DEFAULT_EXHIBITION_CONFIG.reducedMotion),
    title:
      input.title && typeof input.title === 'object'
        ? {
            zh: String((input.title as Record<string, unknown>).zh ?? DEFAULT_EXHIBITION_CONFIG.title.zh),
            en: String((input.title as Record<string, unknown>).en ?? DEFAULT_EXHIBITION_CONFIG.title.en),
          }
        : DEFAULT_EXHIBITION_CONFIG.title,
    subtitle:
      input.subtitle && typeof input.subtitle === 'object'
        ? {
            zh: String((input.subtitle as Record<string, unknown>).zh ?? DEFAULT_EXHIBITION_CONFIG.subtitle.zh),
            en: String((input.subtitle as Record<string, unknown>).en ?? DEFAULT_EXHIBITION_CONFIG.subtitle.en),
          }
        : DEFAULT_EXHIBITION_CONFIG.subtitle,
  }
}

/**
 * Loads the exhibition configuration. A missing or unreadable file is never fatal:
 * the defaults keep the installation usable.
 */
export async function loadExhibitionConfig(): Promise<{ config: ExhibitionConfig; loaded: boolean; error?: string }> {
  try {
    const response = await fetch(dataUrl('exhibition.config.json'), { cache: 'no-cache' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const raw = await response.json()
    return { config: mergeExhibitionConfig(raw), loaded: true }
  } catch (error) {
    return { config: { ...DEFAULT_EXHIBITION_CONFIG }, loaded: false, error: String(error) }
  }
}