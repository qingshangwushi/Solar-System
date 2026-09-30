import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { createTranslator, type Language } from './i18n'
import './styles/app.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('missing #root element')

/**
 * The crash screen is localized too: the exhibition may run in either language, and
 * an English-only installation must not show Chinese prose (P2-14). The browser
 * language decides, because the exhibition configuration has not loaded yet here.
 */
const language: Language = (navigator.language ?? '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
const t = createTranslator(language)

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary
      title={t('runtimeErrorTitle')}
      detail={t('runtimeErrorDetail')}
      retryLabel={t('retry')}
      onRetry={() => window.location.reload()}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
