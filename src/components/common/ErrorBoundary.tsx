import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '../../lib/logging/logger'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('render_error_boundary', { errorType: error.name, componentStack: errorInfo.componentStack })
  }

  render() {
    if (this.state.hasError) return <ErrorFallback />
    return this.props.children
  }
}

export function ErrorFallback() {
  return <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-5 py-8">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Liar System</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">Liar System ha riscontrato un problema.</h1>
    <p className="mt-4 text-muted">Ricarica l’applicazione per riprovare.</p>
    <button className="action mt-8 w-fit" type="button" onClick={() => window.location.reload()}>Ricarica applicazione</button>
  </main>
}
