/**
 * Guided tour overlay.
 *
 * Shows the current stop, its narration and the transport controls. Each stop flies
 * the camera, sets an appropriate time rate and enables the relevant layers, so the
 * visitor sees real orbital motion while the text explains it.
 */
import { TOUR_STOPS } from '../data/Tour'
import type { Translate } from '../i18n'
import type { Language } from '../i18n'

export interface TourPanelProps {
  t: Translate
  language: Language
  active: boolean
  step: number
  onStart: () => void
  onNext: () => void
  onPrevious: () => void
  onExit: () => void
}

export function TourPanel(props: TourPanelProps) {
  const { t, language } = props
  if (!props.active) {
    return (
      <aside className="flyout" aria-label={t('tour')}>
        <div className="sidebar__head" style={{ padding: '0 0 0.5rem' }}>
          <h2>{t('tour')}</h2>
          <button type="button" className="inspector__close" aria-label={t('close')} onClick={() => props.onExit()}>
            ×
          </button>
        </div>
        <p className="note">
          {language === 'zh-CN'
            ? `${TOUR_STOPS.length} 站的导览路线：太阳 → 行星 → 地月系统 → 小行星带 → 巨行星 → 外层太阳系。`
            : `A ${TOUR_STOPS.length}-stop route: Sun → planets → Earth-Moon → asteroid belt → giant planets → outer system.`}
        </p>
        <ol className="note" style={{ paddingLeft: '1.1rem' }}>
          {TOUR_STOPS.map((stop) => (
            <li key={stop.id}>{language === 'zh-CN' ? stop.title.zh : stop.title.en}</li>
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
    <section className="tour" aria-label={t('tour')}>
      <span className="tour__step">{t('tourStepOf', { current: props.step + 1, total: TOUR_STOPS.length })}</span>
      <h2 className="tour__title">{language === 'zh-CN' ? stop.title.zh : stop.title.en}</h2>
      <p className="tour__text">{language === 'zh-CN' ? stop.narration.zh : stop.narration.en}</p>
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