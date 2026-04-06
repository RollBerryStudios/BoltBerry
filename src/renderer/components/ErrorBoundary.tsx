import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[BoltBerry ErrorBoundary – ${this.props.label ?? 'unknown'}]`, error, info)
  }

  render() {
    if (this.state.error) {
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
            {this.props.label ?? 'Fehler'} – Komponente abgestürzt
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', maxWidth: 400, wordBreak: 'break-all' }}>
            {this.state.error.message}
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 'var(--text-xs)' }}
            onClick={() => this.setState({ error: null })}
          >
            Erneut versuchen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
