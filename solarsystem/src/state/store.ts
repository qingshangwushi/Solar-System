/**
 * Application state.
 *
 * Zustand holds only what the React layer renders (flags, selected identifiers,
 * telemetry). The engine instance itself lives in a module-level holder: it is a
 * large mutable object graph that must never be copied into React state.
 *
 * Data flows one way: UI actions call engine methods, the engine publishes through
 * the EventBus, and the bus updates this store.
 */
import { create } from 'zustand'
import type { SolarSystemEngine, EngineStatistics, BodyDescription, MinorBodyDescription } from '../engine/SolarSystemEngine'
import type { PerformanceSnapshot } from '../engine/PerformanceMonitor'
import type { CameraMode } from '../engine/CameraController'
import type { ScaleMode } from '../data/ScaleModel'
import type { QualityLevel } from '../engine/QualityController'
import type { ExhibitionConfig } from '../types/catalog'
import type { Language } from '../i18n'
import type { LoadedCatalog } from '../data/CatalogLoader'
import { CatalogSearchIndex, type SearchHit } from '../data/SearchIndex'

export type AppPhase = 'splash' | 'loading' | 'ready' | 'error'

interface Toast {
  id: number
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface AppState {
  phase: AppPhase
  loadMessage: string
  loadRatio: number
  loadStage: string
  errorMessage: string | null

  config: ExhibitionConfig | null
  catalog: LoadedCatalog | null
  searchIndex: CatalogSearchIndex | null

  language: Language
  julianDate: number
  timeScale: number
  paused: boolean

  selectedId: string | null
  selectedMinorIndex: number | null
  cameraMode: CameraMode
  scaleMode: ScaleMode

  orbitVisible: boolean
  majorOrbitsVisible: boolean
  labelVisible: boolean
  minorVisible: boolean
  starfieldVisible: boolean
  atmosphereVisible: boolean
  activeFilters: string[]
  quality: QualityLevel
  scientificMode: boolean
  showPerformance: boolean

  searchOpen: boolean
  settingsOpen: boolean
  browserOpen: boolean
  tourActive: boolean
  tourOpenRequested: boolean
  tourStep: number
  autoDemoActive: boolean
  autoDemoCountdown: number

  statistics: EngineStatistics | null
  performance: PerformanceSnapshot | null
  bodyDescription: BodyDescription | null
  minorDescription: MinorBodyDescription | null
  searchQuery: string
  searchResults: SearchHit[]
  toasts: Toast[]

  setState: (patch: Partial<AppState>) => void
  pushToast: (level: Toast['level'], message: string) => void
  dismissToast: (id: number) => void
  setSearchResults: (query: string, results: SearchHit[]) => void
}

let toastCounter = 1

export const useAppStore = create<AppState>((set) => ({
  phase: 'splash',
  loadMessage: '',
  loadRatio: 0,
  loadStage: '',
  errorMessage: null,

  config: null,
  catalog: null,
  searchIndex: null,

  language: 'zh-CN',
  julianDate: 2451545,
  timeScale: 1,
  paused: false,

  selectedId: null,
  selectedMinorIndex: null,
  cameraMode: 'overview',
  scaleMode: 'visible',

  orbitVisible: true,
  majorOrbitsVisible: false,
  labelVisible: true,
  minorVisible: false,
  starfieldVisible: true,
  atmosphereVisible: true,
  activeFilters: [],
  quality: 'high',
  scientificMode: false,
  showPerformance: false,

  searchOpen: false,
  settingsOpen: false,
  browserOpen: true,
  tourActive: false,
  tourOpenRequested: false,
  tourStep: 0,
  autoDemoActive: false,
  autoDemoCountdown: 0,

  statistics: null,
  performance: null,
  bodyDescription: null,
  minorDescription: null,
  searchQuery: '',
  searchResults: [],
  toasts: [],

  setState: (patch) => set(patch),
  pushToast: (level, message) =>
    set((state) => ({
      toasts: [...state.toasts.slice(-3), { id: toastCounter++, level, message }],
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setSearchResults: (query, results) => set({ searchQuery: query, searchResults: results }),
}))

/** Engine holder: created once the catalog is loaded, disposed on unmount. */
let engineInstance: SolarSystemEngine | null = null

export function setEngine(engine: SolarSystemEngine | null): void {
  engineInstance = engine
}

export function getEngine(): SolarSystemEngine | null {
  return engineInstance
}

/** Convenience accessor that throws when used before the engine exists. */
export function requireEngine(): SolarSystemEngine {
  if (!engineInstance) throw new Error('the solar-system engine has not been created yet')
  return engineInstance
}