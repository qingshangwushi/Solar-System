/**
 * Guided tour overlay.
 *
 * Shows the current stop, its narration and the transport controls. Each stop flies
 * the camera, sets an appropriate time rate and enables the relevant layers, so the
 * visitor sees real orbital motion while the text explains it.
 */
import { useRef } from 'react'
import { TOUR_STOPS, tourNarration, type TourCounts } from '../data/Tour'
import type { Translate } from '../i18n'
import type { Language } from '../i18n'
import { useFocusTrap } from './useFocusTrap'

export interface TourPanelProps {
  t: Translate
  language: Language
  active: boolean
  step: number
  /** Catalogue-derived numbers quoted by the narration. */
  counts: TourCounts
  onStart: () => void
  onNext: () => void
  onPrevious: () => void
  onExit: () => void
}

export function TourPanel(props: TourPanelProps) {
  const { t } = props
  const panelRef = useRef<HTMLElement | null>(null)
  useFocusTrap(panelRef, true)
  if (!props.active) {
    return (
      <aside className="flyout" aria-label={t('tour')} role="dialog" aria-modal="true" ref={panelRef}>
        <div className="sidebar__head" style={{ padding: '0 0 0.5rem' }}>
          <h2>{t('tour')}</h2>
          <button type="button" className="inspector__close" aria-label={t('close')} onClick={() => props.onExit()}>
            ×
          </button>
        </div>
        <p className="note">{t('tourRoute', { total: TOUR_STOPS.length })}</p>
        <ol className="note" style={{ paddingLeft: '1.1rem' }}>
          {TOUR_STOPS.map((stop) => (
            <li key={stop.id}>{props.language === 'zh-CN' ? stop.title.zh : stop.title.en}</li>
          ))}
        </ol>
        <button type="button" className="chip chip--button" onClick={() => props.onStart()}>
          {t('tourStart')}
        </button>
      </aside>
    )
  }

  const stop = TOUR_STOPS[props.step]
  if (!stop) return null

  return (
    <section className="tour" aria-label={t('tour')} role="dialog" aria-modal="true" ref={panelRef}>
      <span className="tour__step">{t('tourStepOf', { current: props.step + 1, total: TOUR_STOPS.length })}</span>
      <h2 className="tour__title">{props.language === 'zh-CN' ? stop.title.zh : stop.title.en}</h2>
      <p className="tour__text">{tourNarration(stop, props.language, props.counts)}</p>
      <div className="tour__progress" aria-hidden="true">
        {TOUR_STOPS.map((entry, index) => (
          <i key={entry.id} data-active={index <= props.step} />
        ))}
      </div>
      <div className="tour__actions">
        <button type="button" className="chip chip--button" onClick={() => props.onPrevious()} disabled={props.step === 0}>
          {t('tourPrevious')}
        </button>
        <button type="button" className="chip chip--button" onClick={() => props.onNext()}>
          {t('tourNext')}
        </button>
        <button type="button" className="chip chip--button" onClick={() => props.onExit()}>
          {t('tourExit')}
        </button>
      </div>
    </section>
  )
}