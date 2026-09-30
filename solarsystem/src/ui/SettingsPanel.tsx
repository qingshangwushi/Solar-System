/**
 * Settings panel.
 *
 * Everything an exhibition technician may change at run time: language, quality,
 * scale mode, layer visibility, accessibility options and the auto-demo delay.
 * Default values come from exhibition.config.json, so an installation can ship with
 * the right behaviour without anyone touching this panel.
 */
import { useRef } from 'react'
import type { Translate } from '../i18n'
import type { QualityLevel } from '../engine/QualityController'
import type { ScaleMode } from '../data/ScaleModel'
import type { Language } from '../i18n'
import { useFocusTrap } from './useFocusTrap'

export interface SettingsPanelProps {
  t: Translate
  language: Language
  quality: QualityLevel
  scaleMode: ScaleMode
  orbitVisible: boolean
  labelVisible: boolean
  starfieldVisible: boolean
  atmosphereVisible: boolean
  minorVisible: boolean
  scientificMode: boolean
  showPerformance: boolean
  autoDemoEnabled: boolean
  autoDemoCountdown: number
  uiScale: number
  reducedMotion: boolean
  catalogVersion: string
  validationSummary: string
  sources: string[]
  onLanguage: (language: Language) => void
  onQuality: (level: QualityLevel) => void
  onScaleMode: (mode: ScaleMode) => void
  onToggle: (key: 'orbit' | 'label' | 'starfield' | 'atmosphere' | 'minor' | 'scientific' | 'performance' | 'autoDemo') => void
  onUiScale: (value: number) => void
  onReducedMotion: (value: boolean) => void
  onClose: () => void
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { t } = props
  const panelRef = useRef<HTMLElement | null>(null)
  useFocusTrap(panelRef, true)
  return (
    <aside className="flyout" aria-label={t('settings')} role="dialog" aria-modal="true" ref={panelRef}>
      <div className="sidebar__head" style={{ padding: '0 0 0.5rem' }}>
        <h2>{t('settings')}</h2>
        <button type="button" className="inspector__close" aria-label={t('close')} onClick={() => props.onClose()}>
          ×
        </button>
      </div>

      <h3 className="section-title">{t('language')}</h3>
      <div className="segmented">
        {(['zh-CN', 'en-US'] as Language[]).map((entry) => (
          <button key={entry} type="button" data-active={props.language === entry} onClick={() => props.onLanguage(entry)}>
            {entry === 'zh-CN' ? '中文' : 'English'}
          </button>
        ))}
      </div>

      <h3 className="section-title">{t('quality')}</h3>
      <div className="segmented">
        {(['ultra', 'high', 'medium', 'performance'] as QualityLevel[]).map((level) => (
          <button key={level} type="button" data-active={props.quality === level} onClick={() => props.onQuality(level)}>
            {level.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="toggle-row">
        <span>{t('qualityAuto')}</span>
        <button
          type="button"
          className="toggle"
          data-on={props.quality}
          aria-pressed={true}
          aria-label={t('qualityAuto')}
          onClick={() => props.onQuality(props.quality)}
        />
      </div>

      <h3 className="section-title">{t('scale')}</h3>
      <div className="segmented">
        {(['scientific', 'visible', 'exhibition'] as ScaleMode[]).map((mode) => (
          <button key={mode} type="button" data-active={props.scaleMode === mode} onClick={() => props.onScaleMode(mode)}>
            {props.language === 'zh-CN'
              ? mode === 'scientific'
                ? t('scaleScientific')
                : mode === 'visible'
                  ? t('scaleVisible')
                  : t('scaleExhibition')
              : mode === 'scientific'
                ? 'Scientific'
                : mode === 'visible'
                  ? 'Visible'
                  : 'Exhibition'}
          </button>
        ))}
      </div>

      <h3 className="section-title">{t('layers')}</h3>
      {(
        [
          ['orbit', t('orbits'), props.orbitVisible],
          ['label', t('labels'), props.labelVisible],
          ['starfield', t('starfield'), props.starfieldVisible],
          ['atmosphere', t('atmosphere'), props.atmosphereVisible],
          ['minor', t('minorBodies'), props.minorVisible],
        ] as const
      ).map(([key, label, value]) => (
        <div className="toggle-row" key={key}>
          <span>{label}</span>
          <button type="button" className="toggle" data-on={value} aria-pressed={value} aria-label={label} onClick={() => props.onToggle(key)} />
        </div>
      ))}

      <h3 className="section-title">{t('scientificMode')}</h3>
      <div className="toggle-row">
        <span>{t('scientificMode')}</span>
        <button
          type="button"
          className="toggle"
          data-on={props.scientificMode}
          aria-pressed={props.scientificMode}
          onClick={() => props.onToggle('scientific')}
        />
      </div>
      <div className="toggle-row">
        <span>{t('performance')}</span>
        <button
          type="button"
          className="toggle"
          data-on={props.showPerformance}
          aria-pressed={props.showPerformance}
          onClick={() => props.onToggle('performance')}
        />
      </div>

      <h3 className="section-title">{t('autoDemo')}</h3>
      <div className="toggle-row">
        <span>{t('autoDemo')}</span>
        <button
          type="button"
          className="toggle"
          data-on={props.autoDemoEnabled}
          aria-pressed={props.autoDemoEnabled}
          onClick={() => props.onToggle('autoDemo')}
        />
      </div>
      <p className="note">
        {t('autoDemoHint')} {props.autoDemoEnabled ? `(${props.autoDemoCountdown}s)` : ''}
      </p>

      <h3 className="section-title">{props.language === 'zh-CN' ? '无障碍' : 'Accessibility'}</h3>
      <div className="toggle-row">
        <span>{props.language === 'zh-CN' ? '减少动效' : 'Reduced motion'}</span>
        <button
          type="button"
          className="toggle"
          data-on={props.reducedMotion}
          aria-pressed={props.reducedMotion}
          onClick={() => props.onReducedMotion(!props.reducedMotion)}
        />
      </div>
      <div className="toggle-row">
        <span>{props.language === 'zh-CN' ? '界面缩放' : 'UI scale'}</span>
        <span className="segmented">
          {[0.85, 1, 1.15, 1.3].map((value) => (
            <button key={value} type="button" data-active={Math.abs(props.uiScale - value) < 0.001} onClick={() => props.onUiScale(value)}>
              {Math.round(value * 100)}%
            </button>
          ))}
        </span>
      </div>

      <h3 className="section-title">{t('fieldDataSource')}</h3>
      <p className="note">{`${props.catalogVersion} · ${props.validationSummary}`}</p>
      <p className="note">{props.sources.join(' · ')}</p>
    </aside>
  )
}