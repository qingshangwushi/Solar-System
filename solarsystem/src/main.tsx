import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import './styles/app.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('missing #root element')

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary
      title="SOLAR SYSTEM / RUNTIME ERROR"
      detail="展项组件发生异常，已阻止整页空白。请重试；若反复出现，请查看控制台堆栈并检查显卡驱动与浏览器硬件加速设置。"
      retryLabel="重试"
      onRetry={() => window.location.reload()}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
)