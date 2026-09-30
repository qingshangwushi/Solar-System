/**
 * Typed wrapper around the orbit worker.
 *
 * The client owns the request/response bookkeeping and the fallback path: when
 * workers are unavailable (or a transfer fails), propagation falls back to the main
 * thread through the same shared astronomy module the worker uses, so the exhibition
 * never shows an empty asteroid belt because of a browser quirk.
 *
 * The fallback is chunked and yields to the event loop between chunks. A single
 * blocking loop over ~11 000 Kepler solves would stall a frame — which is exactly
 * what the specification forbids ("no main-thread full propagation") — while
 * returning partial results would make bodies jump to the origin, so the work is
 * spread across a few frames and the complete, exact array is returned.
 */
import { propagateMinorBodyKm, sampleMinorBodyOrbitKm } from '../astronomy/MinorBodyPropagator'
import { GM_SUN_KM3_S2 } from '../astronomy/Constants'

/** Objects propagated per event-loop turn on the fallback path. */
const FALLBACK_CHUNK = 1200

export interface OrbitPositionsResult {
  positions: Float64Array
  count: number
  computeMs: number
  usedWorker: boolean
}

export class OrbitWorkerClient {
  private worker: Worker | null = null
  private nextRequestId = 1
  private readonly pending = new Map<number, (value: OrbitPositionsResult) => void>()
  private elements: Float32Array | null = null
  private subset: Int32Array = new Int32Array(0)
  private gmKm3S2 = GM_SUN_KM3_S2
  private fallbackOnly = false
  private disposed = false
  private lastComputeMs = 0
  /** True while a chunked fallback pass is in flight, so frames cannot pile up. */
  private fallbackBusy = false

  /** True when propagation runs on the main thread. */
  get isFallback(): boolean {
    return this.fallbackOnly || this.worker === null
  }

  get workerTimeMs(): number {
    return this.lastComputeMs
  }

  get subsetSize(): number {
    return this.subset.length
  }

  init(elements: Float32Array, subset: Int32Array, gmKm3S2: number): void {
    this.elements = elements
    this.subset = subset
    this.gmKm3S2 = gmKm3S2
    if (this.disposed) return
    try {
      this.worker = new Worker(new URL('../workers/orbit.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => this.handleMessage(event.data)
      this.worker.onerror = (event) => {
        console.warn('orbit worker failed, falling back to main-thread propagation', event.message)
        this.fallbackOnly = true
      }
      // Copy the buffers: the caller keeps ownership of the catalog arrays.
      const elementBuffer = elements.slice().buffer as ArrayBuffer
      const subsetBuffer = subset.slice().buffer as ArrayBuffer
      this.worker.postMessage(
        { type: 'init', elements: elementBuffer, subset: subsetBuffer, gmKm3S2 },
        [elementBuffer, subsetBuffer],
      )
    } catch (error) {
      console.warn('could not start the orbit worker, using main-thread propagation', error)
      this.fallbackOnly = true
    }
  }

  setSubset(subset: Int32Array): void {
    this.subset = subset
    if (this.worker && !this.fallbackOnly) {
      const buffer = subset.slice().buffer as ArrayBuffer
      this.worker.postMessage({ type: 'setSubset', subset: buffer }, [buffer])
    }
  }

  private handleMessage(data: Record<string, unknown>): void {
    const type = data.type
    if (type === 'positions') {
      const requestId = Number(data.requestId)
      const resolve = this.pending.get(requestId)
      if (!resolve) return
      this.pending.delete(requestId)
      const buffer = data.positions as ArrayBuffer
      this.lastComputeMs = Number(data.computeMs ?? 0)
      resolve({
        positions: new Float64Array(buffer),
        count: Number(data.count ?? 0),
        computeMs: this.lastComputeMs,
        usedWorker: true,
      })
      return
    }
    if (type === 'orbitPath') {
      const requestId = Number(data.requestId)
      const resolve = this.pathPending.get(requestId)
      if (!resolve) return
      this.pathPending.delete(requestId)
      resolve({ positions: new Float64Array(data.positions as ArrayBuffer), computeMs: Number(data.computeMs ?? 0) })
    }
  }

  private readonly pathPending = new Map<number, (value: { positions: Float64Array; computeMs: number }) => void>()

  /** Computes positions for the active subset at the given Julian Date. */
  async update(julianDate: number): Promise<OrbitPositionsResult> {
    if (this.worker && !this.fallbackOnly && this.elements) {
      const requestId = this.nextRequestId++
      const promise = new Promise<OrbitPositionsResult>((resolve) => {
        this.pending.set(requestId, resolve)
      })
      this.worker.postMessage({ type: 'update', requestId, julianDate })
      return promise
    }
    return this.propagateOnMainThread(julianDate)
  }

  /** Requests a trajectory polyline for one object (used by the orbit overlay). */
  async orbitPath(index: number, samples: number): Promise<Float64Array | null> {
    if (this.worker && !this.fallbackOnly && this.elements) {
      const requestId = this.nextRequestId++
      const promise = new Promise<{ positions: Float64Array; computeMs: number }>((resolve) => {
        this.pathPending.set(requestId, resolve)
      })
      this.worker.postMessage({ type: 'orbitPath', requestId, index, samples })
      const result = await promise
      this.lastComputeMs = result.computeMs
      return result.positions
    }
    return this.buildPathOnMainThread(index, samples)
  }

  private async propagateOnMainThread(julianDate: number): Promise<OrbitPositionsResult> {
    const started = performance.now()
    const elements = this.elements
    if (!elements) return { positions: new Float64Array(0), count: 0, computeMs: 0, usedWorker: false }
    const count = this.subset.length
    const output = new Float64Array(count * 3)
    this.fallbackBusy = true
    try {
      for (let slot = 0; slot < count; slot++) {
        const position = propagateMinorBodyKm(elements, this.subset[slot], julianDate, this.gmKm3S2)
        if (position) {
          output[slot * 3] = position.x
          output[slot * 3 + 1] = position.y
          output[slot * 3 + 2] = position.z
        }
        if (slot > 0 && slot % FALLBACK_CHUNK === 0) {
          // Hand the frame back to the browser between chunks; the simulation and the
          // camera keep running while the cloud catches up.
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
          if (this.disposed) break
        }
      }
    } finally {
      this.fallbackBusy = false
    }
    this.lastComputeMs = performance.now() - started
    return { positions: output, count, computeMs: this.lastComputeMs, usedWorker: false }
  }

  private buildPathOnMainThread(index: number, samples: number): Float64Array | null {
    const elements = this.elements
    if (!elements) return null
    // Same sampler the worker uses, so a fallback trajectory is identical to the
    // worker's rather than a second implementation that can drift apart.
    return sampleMinorBodyOrbitKm(elements, index, samples)
  }

  /** True while a chunked fallback pass is in flight. */
  get isFallbackBusy(): boolean {
    return this.fallbackBusy
  }

  dispose(): void {
    this.disposed = true
    if (this.worker) {
      this.worker.postMessage({ type: 'dispose' })
      this.worker.terminate()
      this.worker = null
    }
    this.pending.clear()
    this.pathPending.clear()
    this.elements = null
  }
}