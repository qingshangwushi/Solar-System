/**
 * Typed event bus.
 *
 * This is the only channel between the imperative engine and the React layer.
 * `preventDefault`-style vetoing is deliberately absent: the UI observes and
 * requests, the engine owns the render loop.
 */
export interface EngineEvents {
  /** A body was clicked or selected programmatically. */
  selectionChanged: { id: string | null }
  /** The camera target changed (used to sync the "tracking" HUD chip). */
  trackingChanged: { id: string | null }
  /** Simulation time advanced; throttled to the UI refresh rate. */
  timeChanged: { julianDate: number; timeScale: number; paused: boolean }
  /** Camera mode changed. */
  cameraModeChanged: { mode: string }
  /** Scale mode changed. */
  scaleModeChanged: { mode: string }
  /** Fly-to animation started/finished, for the cinematic overlay. */
  flyToStarted: { id: string; fromDistanceKm: number }
  flyToFinished: { id: string }
  /** The renderer lost and regained its WebGL context. */
  contextLost: Record<string, never>
  contextRestored: Record<string, never>
  /** Performance snapshot, emitted at 2 Hz while the overlay is enabled. */
  performance: Record<string, unknown>
  /** Loading / asset notifications. */
  status: { level: 'info' | 'warn' | 'error'; message: string }
  /** A body's on-screen position changed (used by the label layer fallback). */
  labelFocus: { id: string }
}

type Handler<K extends keyof EngineEvents> = (payload: EngineEvents[K]) => void

export class EventBus {
  private readonly handlers = new Map<keyof EngineEvents, Set<Handler<keyof EngineEvents>>>()

  on<K extends keyof EngineEvents>(event: K, handler: Handler<K>): () => void {
    const set = this.handlers.get(event) ?? new Set()
    set.add(handler as Handler<keyof EngineEvents>)
    this.handlers.set(event, set)
    return () => this.off(event, handler)
  }

  off<K extends keyof EngineEvents>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as Handler<keyof EngineEvents>)
  }

  emit<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) {
      try {
        ;(handler as Handler<K>)(payload)
      } catch (error) {
        console.error(`event handler for "${String(event)}" threw`, error)
      }
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}