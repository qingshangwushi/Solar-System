/**
 * Exhibition splash screen.
 *
 * Shows the real catalog statistics (object counts, star count, data sources)
 * rather than invented figures, and starts the solar-system view on request.
 * The 3D scene keeps running behind it, so entering is instantaneous.
 */
import type { CatalogStatistics } from '../types/catalog'
import type { Translate } from '../i18n'
import type { ExhibitionConfig } from '../types/catalog'

export interface SplashScreenProps {
  config: ExhibitionConfig
  statistics: CatalogStatistics | null
  t: Translate
  onEnter: () => void
}

export function SplashScreen({ config, statistics, t, onEnter }: SplashScreenProps) {
  const title = config.language === 'zh-CN' ? config.title.zh : config.title.en
  const subtitle = config.language === 'zh-CN' ? config.subtitle.zh : config.subtitle.en
  return (
    <section className="splash" aria-label={title}>
      <span className="splash__eyebrow">{t('appSubtitle')}</span>
      <h1 className="splash__title">
        {title}
        <small>{subtitle}</small>
      </h1>
      <p className="splash__lead">
        {config.language === 'zh-CN'
          ? '以真实天体历表与轨道根数驱动的三维太阳系。可自由操控时间、视角与尺度，逐层深入太阳、行星、卫星与已编目的小天体世界。'
          : 'A three-dimensional solar system driven by real ephemerides and osculating elements. Control time, camera and scale freely, and explore the Sun, planets, moons and catalogued small bodies.'}
      </p>
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
      <p className="splash__source">{t('sourcesNote')}</p>
    </section>
  )
}