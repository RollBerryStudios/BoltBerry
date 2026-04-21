import { Component, type ReactNode, type ErrorInfo } from 'react'
import i18n from '../i18n'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  label?: string
}

interface State {
  error: Error | null
  /** Bumped on retry so the children remount with fresh state instead of
   * re-rendering the same broken tree that threw in the first place. */
  resetKey: number
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[BoltBerry ErrorBoundary – ${this.props.label ?? 'unknown'}]`, error, info)
  }

  private handleRetry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }))
  }

  render() {
    if (this.state.error) {
      const label = this.props.label ?? i18n.t('errorBoundary.fallbackLabel')
      return this.props.fallback ?? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 12,
          padding: 24,
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <div style={{ fontWeight: 600, color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
            {i18n.t('errorBoundary.crashed', { label })}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', maxWidth: 400, wordBreak: 'break-all' }}>
            {this.state.error.message}
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 'var(--text-xs)' }}
            onClick={this.handleRetry}
          >
            {i18n.t('errorBoundary.retry')}
          </button>
        </div>
      )
    }
    // Force the children to remount after a retry so any stale state that
    // produced the crash is cleared, not just the boundary's own state.
    return <div key={this.state.resetKey} style={{ display: 'contents' }}>{this.props.children}</div>
  }
}
