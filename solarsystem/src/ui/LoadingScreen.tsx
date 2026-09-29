/**
 * Loading screen.
 *
 * Progress is genuinely measured: the loader reports the number of completed asset
 * groups, and each step is listed with its real state. No synthetic percentage is
 * ever shown (project requirement).
 */
import type { Translate } from '../i18n'

export interface LoadingStep {
  stage: string
  zh: string
  en: string
  state: 'pending' | 'active' | 'done'
}

export interface LoadingScreenProps {
  steps: LoadingStep[]
  message: string
  ratio: number
  t: Translate
  language: 'zh-CN' | 'en-US'
  error: string | null
  onRetry: () => void
}

export function LoadingScreen({ steps, message, ratio, t, language, error, onRetry }: LoadingScreenProps) {
  return (
    <section className="loading" aria-live="polite">
      <div className="loading__inner">
        <p className="loading__title">{t('loadingTitle')}</p>
        {error ? (
          <>
            <p className="note note--warn">{`${t('loadingFailed')}: ${error}`}</p>
            <button type="button" className="splash__enter" onClick={onRetry}>
              {t('retry')}
            </button>
          </>
        ) : (
          <>
            <ul className="loading__list">
              {steps.map((step) => (
                <li key={step.stage} className="loading__item" data-state={step.state}>
                  <span>{language === 'zh-CN' ? step.zh : step.en}</span>
                </li>
              ))}
            </ul>
            <div className="loading__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
              <span style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            <p className="note">{message}</p>
          </>
        )}
      </div>
    </section>
  )
}