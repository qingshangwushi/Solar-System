/**
 * Error boundary.
 *
 * A long-running exhibition installation must never end up on a blank page: if a
 * component throws, the boundary shows a readable message, keeps the HUD usable
 * where possible, and offers a retry that reconstructs the tree from scratch.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  title: string
  detail: string
  retryLabel: string
  onRetry?: () => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the console so an on-site technician can read the stack.
    console.error('solar-system error boundary caught:', error, info.componentStack)
  }

  private readonly retry = () => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="loading" role="alert">
        <div className="loading__inner">
          <p className="loading__title">{this.props.title}</p>
          <p className="note note--warn">{this.props.detail}</p>
          <pre className="note" style={{ whiteSpace: 'pre-wrap', maxHeight: '12rem', overflow: 'auto' }}>
            {String(this.state.error.stack ?? this.state.error.message)}
          </pre>
          <button type="button" className="splash__enter" onClick={this.retry}>
            {this.props.retryLabel}
          </button>
        </div>
      </div>
    )
  }
}