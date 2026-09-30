/**
 * Exhibition splash screen.
 *
 * Shows the real catalog statistics (object counts, star count, data sources)
 * rather than invented figures, and starts the solar-system view on request.
 * The 3D scene is created as soon as the catalog is in memory, so the title screen
 * has a live, slowly evolving solar-system background behind it and entering the
 * exhibition is instantaneous.
 */
import type { CatalogStatistics } from '../types/catalog'
import type { Translate } from '../i18n'
import type { ExhibitionConfig } from '../types/catalog'

export interface SplashScreenProps {
  config: ExhibitionConfig
  statistics: CatalogStatistics | null
  /** True once the renderer exists, so the background is a real running scene. */
  liveBackground: boolean
  t: Translate
  onEnter: () => void
}

export function SplashScreen({ config, statistics, liveBackground, t, onEnter }: SplashScreenProps) {
  const title = config.language === 'zh-CN' ? config.title.zh : config.title.en
  const subtitle = config.language === 'zh-CN' ? config.subtitle.zh : config.subtitle.en
  return (
    <section className="splash" aria-label={title} data-live-background={liveBackground ? 'true' : 'false'}>
      <span className="splash__eyebrow">{t('appSubtitle')}</span>
      <h1 className="splash__title">
        {title}
        <small>{subtitle}</small>
      </h1>
      <p className="splash__lead">{t('splashLead')}</p>
      <div className="splash__facts">
        <span>
          {t('statBodies')} <b>{statistics ? statistics.renderedBodies : '—'}</b>
        </span>
        <span>
          {t('statMinorBodies')} <b>{statistics ? statistics.minorBodies.toLocaleString('en-US') : '—'}</b>
        </span>
        <span>
          {t('statStars')} <b>{statistics ? statistics.stars.toLocaleString('en-US') : '—'}</b>
        </span>
        <span>
          Mode A + B <b>VSOP87 · ELP2000 · Kepler</b>
        </span>
      </div>
      <button type="button" className="splash__enter" onClick={onEnter}>
        {t('enterSystem')}
      </button>
      <p className="splash__source">
        {t('sourcesNote')}
        {liveBackground ? ` · ${t('splashLiveBackground')}` : ''}
      </p>
    </section>
  )
}