import { logger } from '../lib/logging/logger'

export function handleCaughtError(error: unknown, errorInfo: unknown) {
  logger.error('react_caught_error', { errorType: error instanceof Error ? error.name : 'unknown', errorInfo })
}

export function handleUncaughtError(error: unknown, errorInfo: unknown) {
  logger.error('react_uncaught_error', { errorType: error instanceof Error ? error.name : 'unknown', errorInfo })
}

export function handleRecoverableError(error: unknown, errorInfo: unknown) {
  logger.warn('react_recoverable_error', { errorType: error instanceof Error ? error.name : 'unknown', errorInfo })
}
