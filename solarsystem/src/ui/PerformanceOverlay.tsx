/**
 * Performance overlay.
 *
 * Development/exhibition diagnostic view: frame rate, frame time, draw calls,
 * triangles, point count, visible objects, estimated GPU memory, worker time, orbit
 * update time and the active quality level, plus a frame-time sparkline. Hidden by
 * default and only sampled while it is on, so it costs nothing in normal operation.
 */
import type { PerformanceSnapshot } from '../engine/PerformanceMonitor'
import type { Translate } from '../i18n'

export interface PerformanceOverlayProps {
  t: Translate
  snapshot: PerformanceSnapshot | null
  history: readonly number[]
}

export function PerformanceOverlay({ t, snapshot, history }: PerformanceOverlayProps) {
  if (!snapshot) return null
  const points = sparklinePoints(history)
  return (
    <aside className="perf" aria-label={t('performance')}>
      <div className="perf__row">
        <span>FPS</span>
        <b>{snapshot.fps.toFixed(1)}</b>
      </div>
      <div className="perf__row">
        <span>frame</span>
        <b>{snapshot.frameTimeMs.toFixed(2)} ms</b>
      </div>
      <div className="perf__row">
        <span>jitter</span>
        <b>{snapshot.jitterMs.toFixed(2)} ms</b>
      </div>
      <div className="perf__row">
        <span>draw calls</span>
        <b>{snapshot.drawCalls}</b>
      </div>
      <div className="perf__row">
        <span>triangles</span>
        <b>{snapshot.triangles.toLocaleString('en-US')}</b>
      </div>
      <div className="perf__row">
        <span>points</span>
        <b>{snapshot.points.toLocaleString('en-US')}</b>
      </div>
      <div className="perf__row">
        <span>{t('statDrawn')}</span>
        <b>{snapshot.visibleObjects}</b>
      </div>
      <div className="perf__row">
        <span>labels</span>
        <b>{snapshot.labels}</b>
      </div>
      <div className="perf__row">
        <span>texture mem</span>
        <b>{snapshot.textureMb} MB</b>
      </div>
      <div className="perf__row">
        <span>geometry mem</span>
        <b>{snapshot.geometryMb} MB</b>
      </div>
      <div className="perf__row">
        <span>worker</span>
        <b>{snapshot.workerTimeMs.toFixed(2)} ms</b>
      </div>
      <div className="perf__row">
        <span>{t('statOrbits')}</span>
        <b>{snapshot.orbitUpdateMs.toFixed(2)} ms</b>
      </div>
      <div className="perf__row">
        <span>positions</span>
        <b>{snapshot.positionUpdateMs.toFixed(2)} ms</b>
      </div>
      <div className="perf__row">
        <span>{t('statQuality')}</span>
        <b>{snapshot.qualityLevel}</b>
      </div>
      <svg className="perf__spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} fill="none" stroke="#7fb0ff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </aside>
  )
}

/** Normalises the frame-time history into a 0..100 x 0..30 polyline. */
function sparklinePoints(history: readonly number[]): string {
  if (history.length < 2) return ''
  const maximum = Math.max(...history, 16.7)
  return history
    .map((value, index) => {
      const x = (index / (history.length - 1)) * 100
      const y = 30 - Math.min(1, value / maximum) * 28
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}