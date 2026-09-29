/**
 * HUD: top status bar and the bottom console.
 *
 * The top bar carries identity and time; the console carries the time transport,
 * the rate presets, the date jump and the layer/scale controls. Nothing overlaps
 * the centre of the view, and every control is at least 48 px on a coarse pointer
 * (see the touch rules in app.css).
 */
import { useEffect, useState } from 'react'
import { formatJulianDate, formatUtc, TIME_SCALE_PRESETS } from '../astronomy/TimeSystem'
import type { EngineStatistics, MinorBodyRuntime } from '../engine/SolarSystemEngine'
import { MINOR_BODY_FILTERS } from '../engine/SolarSystemEngine'
import { SCALE_MODES, type ScaleMode } from '../data/ScaleModel'
import type { CameraMode } from '../engine/CameraController'
import type { QualityLevel } from '../engine/QualityController'
import type { Translate } from '../i18n'
import type { CatalogStatistics } from '../types/catalog'

const CAMERA_MODES: CameraMode[] = ['orbit', 'follow', 'surface', 'free', 'overview']
const QUALITY_LEVELS: QualityLevel[] = ['ultra', 'high', 'medium', 'performance']

export interface HudProps {
  t: Translate
  language: 'zh-CN' | 'en-US'
  julianDate: number
  timeScale: number
  paused: boolean
  cameraMode: CameraMode
  scaleMode: ScaleMode
  quality: QualityLevel
  orbitVisible: boolean
  labelVisible: boolean
  minorVisible: boolean
  starfieldVisible: boolean
  atmosphereVisible: boolean
  activeFilters: string[]
  scientificMode: boolean
  showPerformance: boolean
  statistics: EngineStatistics | null
  catalogStatistics: CatalogStatistics | null
  minorRuntime: MinorBodyRuntime | null
  trackedName: string | null
  autoDemoActive: boolean
  onTimeScale: (value: number) => void
  onTogglePause: () => void
  onReverse: () => void
  onStep: (days: number) => void
  onJump: (input: string) => boolean
  onNow: () => void
  onCameraMode: (mode: CameraMode) => void
  onScaleMode: (mode: ScaleMode) => void
  onQuality: (level: QualityLevel) => void
  onToggleOrbit: () => void
  onToggleMajorOrbits: () => void
  majorOrbitsVisible: boolean
  onToggleLabels: () => void
  onToggleMinor: () => void
  onToggleStarfield: () => void
  onToggleAtmosphere: () => void
  onToggleFilter: (key: string) => void
  onToggleScientific: () => void
  onTogglePerformance: () => void
  onToggleSettings: () => void
  onToggleSearch: () => void
  onToggleTour: () => void
  onToggleBrowser: () => void
  onStartTour: () => void
}

export function Hud(props: HudProps) {
  const { t, language } = props
  const [jumpInput, setJumpInput] = useState('')
  const [jumpError, setJumpError] = useState(false)
  const [showLayers, setShowLayers] = useState(false)

  useEffect(() => {
    if (!jumpError) return
    const timer = window.setTimeout(() => setJumpError(false), 2400)
    return () => window.clearTimeout(timer)
  }, [jumpError])

  const scaleWarning =
    props.scaleMode === 'visible'
      ? t('scaleEnhancedWarning')
      : props.scaleMode === 'exhibition'
        ? `${t('scaleEnhancedWarning')} · ${t('scaleNonLinearWarning')}`
        : null

  const submitJump = () => {
    const accepted = props.onJump(jumpInput)
    setJumpError(!accepted)
    if (accepted) setJumpInput('')
  }

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="chip">
          <div className="title-block">
            <h1>
              {t('appSubtitle')} <b>{t('realtimeBadge')}</b>
            </h1>
            <span>{formatUtc(props.julianDate)}</span>
          </div>
        </div>

        <div className="hud__top" style={{ gap: '0.4rem' }}>
          <span className="chip">
            <span className="chip__label">{t('scale')}</span>
            <span className="chip__value">
              {props.scaleMode === 'scientific'
                ? t('scaleScientific')
                : props.scaleMode === 'visible'
                  ? t('scaleVisible')
                  : t('scaleExhibition')}
            </span>
          </span>
          <span className="chip">
            <span className="chip__label">{t('camera')}</span>
            <span className="chip__value">{cameraLabel(props.cameraMode, t)}</span>
          </span>
          <span className="chip">
            <span className="chip__label">{t('target')}</span>
            <span className="chip__value">{props.trackedName ?? '—'}</span>
          </span>
          <button type="button" className="chip chip--button" onClick={() => props.onToggleSearch()} data-active={false}>
            {t('search')}
          </button>
          <button type="button" className="chip chip--button" onClick={() => props.onToggleSettings()} data-active={false}>
            {t('settings')}
          </button>
          <button type="button" className="chip chip--button" onClick={() => props.onToggleTour()} data-active={false}>
            {t('tour')}
          </button>
          <button
            type="button"
            className="chip chip--button"
            onClick={() => props.onToggleBrowser()}
            data-active={false}
          >
            {t('objects')}
          </button>
        </div>
      </div>

      {props.autoDemoActive && (
        <div className="auto-demo-badge">
          {t('autoDemo')} {t('autoDemoHint')}
        </div>
      )}

      <div className="hud__bottom">
        <div className="console">
          <div className="transport">
            <button type="button" title={t('stepBack')} aria-label={t('stepBack')} onClick={() => props.onStep(-1)}>
              ◀◀
            </button>
            <button
              type="button"
              title={props.paused ? t('play') : t('pause')}
              aria-label={props.paused ? t('play') : t('pause')}
              data-active={props.paused}
              onClick={() => props.onTogglePause()}
            >
              {props.paused ? '▶' : '❚❚'}
            </button>
            <button type="button" title={t('stepForward')} aria-label={t('stepForward')} onClick={() => props.onStep(1)}>
              ▶▶
            </button>
            <button
              type="button"
              title={t('reverse')}
              aria-label={t('reverse')}
              data-active={props.timeScale < 0}
              onClick={() => props.onReverse()}
            >
              ⇄
            </button>
          </div>

          <div className="time-readout">
            <span className="time-readout__label">{t('simTime')}</span>
            <span className="time-readout__value">{formatUtc(props.julianDate)}</span>
            <span className="time-readout__sub">
              {props.scientificMode ? formatJulianDate(props.julianDate) : `${t('speed')} ×${formatRate(props.timeScale)}`}
            </span>
          </div>

          <div className="speed-group" role="group" aria-label={t('speed')}>
            {TIME_SCALE_PRESETS.filter((preset) => preset.value !== 0).map((preset) => (
              <button
                key={preset.value}
                type="button"
                data-active={!props.paused && props.timeScale === preset.value}
                onClick={() => props.onTimeScale(preset.value)}
                title={language === 'zh-CN' ? preset.labelZh : preset.label}
              >
                ×{formatRate(preset.value)}
              </button>
            ))}
            <button
              type="button"
              data-active={props.paused}
              onClick={() => props.onTimeScale(0)}
              title={t('speedPaused')}
            >
              {t('speedPaused')}
            </button>
          </div>

          <div className="jump">
            <label className="chip__label" htmlFor="time-jump" style={{ display: 'none' }}>
              {t('jumpTo')}
            </label>
            <input
              id="time-jump"
              value={jumpInput}
              placeholder={t('jumpPlaceholder')}
              aria-label={t('jumpTo')}
              onChange={(event) => setJumpInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitJump()
              }}
            />
            <button type="button" onClick={submitJump}>
              {t('jumpGo')}
            </button>
            <button type="button" onClick={() => props.onNow()}>
              {t('now')}
            </button>
          </div>

          <div className="segmented" role="group" aria-label={t('camera')}>
            {CAMERA_MODES.map((mode) => (
              <button key={mode} type="button" data-active={props.cameraMode === mode} onClick={() => props.onCameraMode(mode)}>
                {cameraLabel(mode, t)}
              </button>
            ))}
          </div>

          <div className="segmented" role="group" aria-label={t('scale')}>
            {(['scientific', 'visible', 'exhibition'] as ScaleMode[]).map((mode) => (
              <button key={mode} type="button" data-active={props.scaleMode === mode} onClick={() => props.onScaleMode(mode)}>
                {SCALE_MODES[mode].labelZh && language === 'zh-CN' ? SCALE_MODES[mode].labelZh : SCALE_MODES[mode].labelEn}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="chip chip--button"
            data-active={showLayers}
            onClick={() => setShowLayers((value) => !value)}
          >
            {t('layers')}
          </button>

          <span className="chip" data-active={props.scientificMode}>
            <button type="button" onClick={() => props.onToggleScientific()} style={{ color: 'inherit' }}>
              {t('scientificMode')}
            </button>
          </span>
        </div>

        {scaleWarning && (
          <span className="chip" data-active={true}>
            {scaleWarning}
          </span>
        )}

        <div className="legend">
          <span>
            <i className="dot" style={{ background: 'var(--accent)' }} />
            {t('legendStar')}
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--planet)' }} />
            {t('legendPlanet')}
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--dwarf)' }} />
            {t('legendDwarf')}
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--moon)' }} />
            {t('legendMoon')}
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--asteroid)' }} />
            {t('legendAsteroid')}
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--comet)' }} />
            {t('legendComet')}
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--tno)' }} />
            {t('legendTno')}
          </span>
        </div>
      </div>

      {showLayers && (
        <aside className="flyout" aria-label={t('layers')}>
          <h2 className="section-title">{t('layers')}</h2>
          <Toggle label={t('orbits')} value={props.orbitVisible} onChange={() => props.onToggleOrbit()} />
          <Toggle label={t('showAllOrbits')} value={props.majorOrbitsVisible} onChange={() => props.onToggleMajorOrbits()} />
          <Toggle label={t('labels')} value={props.labelVisible} onChange={() => props.onToggleLabels()} />
          <Toggle label={t('starfield')} value={props.starfieldVisible} onChange={() => props.onToggleStarfield()} />
          <Toggle label={t('atmosphere')} value={props.atmosphereVisible} onChange={() => props.onToggleAtmosphere()} />
          <Toggle
            label={t('minorBodies')}
            value={props.minorVisible}
            disabled={!props.minorRuntime}
            onChange={() => props.onToggleMinor()}
          />
          {!props.minorRuntime && <p className="note note--warn">{t('noMinorCatalog')}</p>}

          <h2 className="section-title">{t('filters')}</h2>
          <div className="segmented">
            {MINOR_BODY_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                data-active={props.activeFilters.includes(filter.key)}
                disabled={!props.minorRuntime}
                onClick={() => props.onToggleFilter(filter.key)}
              >
                {language === 'zh-CN' ? filter.zh : filter.en}
              </button>
            ))}
          </div>

          <h2 className="section-title">{t('quality')}</h2>
          <div className="segmented">
            {QUALITY_LEVELS.map((level) => (
              <button key={level} type="button" data-active={props.quality === level} onClick={() => props.onQuality(level)}>
                {level.toUpperCase()}
              </button>
            ))}
          </div>

          <h2 className="section-title">{t('performance')}</h2>
          <Toggle label={t('performance')} value={props.showPerformance} onChange={() => props.onTogglePerformance()} />

          <h2 className="section-title">{t('statistics')}</h2>
          <div className="kv" style={{ marginTop: '0.4rem' }}>
            <dt>{t('statBodies')}</dt>
            <dd>{props.catalogStatistics ? props.catalogStatistics.totalBodies.toLocaleString('en-US') : '—'}</dd>
            <dt>{t('statDrawn')}</dt>
            <dd>{props.statistics ? props.statistics.drawnBodies : '—'}</dd>
            <dt>{t('statMinorBodies')}</dt>
            <dd>
              {props.catalogStatistics ? props.catalogStatistics.minorBodies.toLocaleString('en-US') : '—'}
              {props.statistics ? ` (${props.statistics.minorBodiesInCloud} ${t('statOrbits')})` : ''}
            </dd>
            <dt>{t('statStars')}</dt>
            <dd>{props.catalogStatistics ? props.catalogStatistics.stars.toLocaleString('en-US') : '—'}</dd>
          </div>
          <p className="note">{t('dragHint')} · {t('pinchHint')} · {t('keysHint')}</p>
        </aside>
      )}

      {jumpError && <span className="toast" data-level="warn" style={{ position: 'absolute', bottom: '0.6rem', left: '50%', transform: 'translateX(-50%)' }}>{t('jumpInvalid')}</span>}
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className="toggle"
        data-on={value}
        aria-pressed={value}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
      />
    </div>
  )
}

function cameraLabel(mode: CameraMode, t: Translate): string {
  switch (mode) {
    case 'orbit':
      return t('cameraOrbit')
    case 'follow':
      return t('cameraFollow')
    case 'surface':
      return t('cameraSurface')
    case 'free':
      return t('cameraFree')
    case 'overview':
      return t('cameraOverview')
  }
}

function formatRate(secondsPerSecond: number): string {
  if (secondsPerSecond === 0) return '0'
  const days = Math.abs(secondsPerSecond) / 86400
  if (days >= 365.25) return `${(days / 365.25).toFixed(0)} yr`
  if (days >= 1) return `${days.toFixed(0)} d`
  const hours = Math.abs(secondsPerSecond) / 3600
  if (hours >= 1) return `${hours.toFixed(0)} h`
  const minutes = Math.abs(secondsPerSecond) / 60
  if (minutes >= 1) return `${minutes.toFixed(0)} min`
  return '1 s'
}