import { appError, fail, ok, type AppError, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'
import type { GameLifecycle } from '../game/game.types'

export type LifecycleTransitionResult = {
  game_id: string
  game_code: string
  previous_lifecycle: string
  lifecycle: string
  command_id: string
  changed_at: string
}

export type LifecycleTransitionInput = {
  gameCode: string
  expectedLifecycle: GameLifecycle
  targetLifecycle: GameLifecycle
  commandId?: string
}

export function isStaleLifecycleError(error: AppError): boolean {
  return error.cause !== undefined && typeof error.cause === 'object' && error.cause !== null && 'message' in error.cause && error.cause.message === 'STALE_GAME_STATE'
}

function mapCommandError(error: { message: string }): Result<LifecycleTransitionResult> {
  const messages: Record<string, { code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION'; message: string }> = {
    AUTH_REQUIRED: { code: 'UNAUTHORIZED', message: 'Sessione Staff non disponibile.' },
    STAFF_AUTH_REQUIRED: { code: 'FORBIDDEN', message: 'Accesso Staff richiesto.' },
    STAFF_ACCESS_DENIED: { code: 'FORBIDDEN', message: 'Accesso Regia non autorizzato.' },
    GAME_NOT_FOUND: { code: 'NOT_FOUND', message: 'Partita non trovata.' },
    STALE_GAME_STATE: { code: 'CONFLICT', message: 'Lo stato della partita è cambiato. Dati aggiornati.' },
    GAME_NOT_READY_TO_COMPLETE: { code: 'CONFLICT', message: 'La partita può essere completata solo dopo la rivelazione finale.' },
    INVALID_TRANSITION: { code: 'CONFLICT', message: 'Transizione lifecycle non consentita.' },
    CONFLICT: { code: 'CONFLICT', message: 'Comando non compatibile con lo stato corrente.' },
    INVALID_LIFECYCLE: { code: 'VALIDATION', message: 'Lifecycle non valido.' },
    INVALID_COMMAND: { code: 'VALIDATION', message: 'Comando lifecycle non valido.' },
  }
  const mapped = messages[error.message]
  return mapped
    ? fail(appError(mapped.code, mapped.message, { cause: error }))
    : fail(appError('UNKNOWN', 'Comando lifecycle non completato.', { cause: error, retryable: true }))
}

export async function transitionGameLifecycle(input: LifecycleTransitionInput): Promise<Result<LifecycleTransitionResult>> {
  if (!staffSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Comandi Regia non disponibili.'))
  const commandId = input.commandId ?? crypto.randomUUID()
  const { data, error } = await staffSupabaseClient.rpc('transition_game_lifecycle', {
    game_code: input.gameCode,
    expected_lifecycle: input.expectedLifecycle,
    target_lifecycle: input.targetLifecycle,
    command_id: commandId,
  })
  if (error) { logger.warn('Staff lifecycle command failed', { cause: error }); return mapCommandError(error) }
  if (!data?.[0]) return fail(appError('UNKNOWN', 'Comando lifecycle non completato.', { retryable: true }))
  return ok(data[0])
}
