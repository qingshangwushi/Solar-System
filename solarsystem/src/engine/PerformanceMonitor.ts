/**
 * Development performance monitor.
 *
 * Collects the counters the specification asks for — FPS, frame time, draw calls,
 * triangles, visible objects, GPU-memory estimate, worker time and orbit update
 * time — and keeps the last N frames for a sparkline. It is only sampled when the
 * overlay is enabled, so it costs nothing in a production run.
 */
export interface PerformanceSnapshot {
  fps: number
  frameTimeMs: number
  drawCalls: number
  triangles: number
  points: number
  visibleObjects: number
  textureMb: number
  geometryMb: number
  workerTimeMs: number
  orbitUpdateMs: number
  positionUpdateMs: number
  labels: number
  qualityLevel: string
  jitterMs: number
}

export class PerformanceMonitor {
  private readonly frameTimes: number[] = []
  private readonly capacity = 120
  private lastWorkerTime = 0
  private lastOrbitUpdate = 0
  private lastPositionUpdate = 0

  recordFrame(frameTimeMs: number): void {
    this.frameTimes.push(frameTimeMs)
    if (this.frameTimes.length > this.capacity) this.frameTimes.shift()
  }

  recordWorkerTime(ms: number): void {
    this.lastWorkerTime = this.lastWorkerTime === 0 ? ms : this.lastWorkerTime * 0.8 + ms * 0.2
  }

  recordOrbitUpdate(ms: number): void {
    this.lastOrbitUpdate = this.lastOrbitUpdate === 0 ? ms : this.lastOrbitUpdate * 0.8 + ms * 0.2
  }

  recordPositionUpdate(ms: number): void {
    this.lastPositionUpdate = this.lastPositionUpdate === 0 ? ms : this.lastPositionUpdate * 0.8 + ms * 0.2
  }

  get history(): readonly number[] {
    return this.frameTimes
  }

  snapshot(extra: {
    drawCalls: number
    triangles: number
    points: number
    visibleObjects: number
    textureMb: number
    geometryMb: number
    labels: number
    qualityLevel: string
  }): PerformanceSnapshot {
    const count = this.frameTimes.length
    const average = count === 0 ? 0 : this.frameTimes.reduce((sum, value) => sum + value, 0) / count
    const variance =
      count === 0
        ? 0
        : this.frameTimes.reduce((sum, value) => sum + (value - average) ** 2, 0) / count
    return {
      fps: average === 0 ? 0 : 1000 / average,
      frameTimeMs: average,
      jitterMs: Math.sqrt(variance),
      drawCalls: extra.drawCalls,
      triangles: extra.triangles,
      points: extra.points,
      visibleObjects: extra.visibleObjects,
      textureMb: extra.textureMb,
      geometryMb: extra.geometryMb,
      labels: extra.labels,
      qualityLevel: extra.qualityLevel,
      workerTimeMs: this.lastWorkerTime,
      orbitUpdateMs: this.lastOrbitUpdate,
      positionUpdateMs: this.lastPositionUpdate,
    }
  }

  reset(): void {
    this.frameTimes.length = 0
    this.lastWorkerTime = 0
    this.lastOrbitUpdate = 0
    this.lastPositionUpdate = 0
  }
}