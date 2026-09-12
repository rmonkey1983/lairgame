export type AppErrorCode =
  | 'UNKNOWN'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'NETWORK'
  | 'TEMPORARY_UNAVAILABLE'
  | 'PLAYER_NOT_JOINED'

export type AppError = {
  code: AppErrorCode
  userMessage: string
  cause?: unknown
  retryable: boolean
}

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function appError(
  code: AppErrorCode,
  userMessage: string,
  options: { cause?: unknown; retryable?: boolean } = {},
): AppError {
  return { code, userMessage, cause: options.cause, retryable: options.retryable ?? false }
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error }
}
