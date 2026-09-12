import { appError, fail, ok, type AppError, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'
import type { NarrativePhase } from '../game/game.types'

export type NarrativePhaseTransitionResult = {
  game_id: string
  game_code: string
  previous_phase: string
  phase: string
  command_id: string
  changed_at: string
}

export type NarrativePhaseTransitionInput = {
  gameCode: string
  expectedPhase: NarrativePhase
  targetPhase: NarrativePhase
  commandId?: string
}

export function isStaleNarrativePhaseError(error: AppError): boolean {
  return error.cause !== undefined && typeof error.cause === 'object' && error.cause !== null && 'message' in error.cause && error.cause.message === 'STALE_GAME_STATE'
}

function mapCommandError(error: { message: string }): Result<NarrativePhaseTransitionResult> {
  const messages: Record<string, { code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION'; message: string }> = {
    AUTH_REQUIRED: { code: 'UNAUTHORIZED', message: 'Sessione Staff non disponibile.' },
    STAFF_AUTH_REQUIRED: { code: 'FORBIDDEN', message: 'Accesso Staff richiesto.' },
    STAFF_ACCESS_DENIED: { code: 'FORBIDDEN', message: 'Accesso Regia non autorizzato.' },
    GAME_NOT_FOUND: { code: 'NOT_FOUND', message: 'Partita non trovata.' },
    GAME_NOT_LIVE: { code: 'CONFLICT', message: 'La partita deve essere live per avanzare la fase narrativa.' },
    ROLE_ASSIGNMENT_REQUIRED: { code: 'CONFLICT', message: 'Assegna i ruoli prima di avanzare alla rivelazione.' },
    STALE_GAME_STATE: { code: 'CONFLICT', message: 'La fase narrativa è cambiata. Dati aggiornati.' },
    INVALID_PHASE_TRANSITION: { code: 'CONFLICT', message: 'Avanzamento fase non consentito.' },
    CONFLICT: { code: 'CONFLICT', message: 'Comando non compatibile con lo stato corrente.' },
    INVALID_PHASE: { code: 'VALIDATION', message: 'Fase narrativa non valida.' },
    INVALID_COMMAND: { code: 'VALIDATION', message: 'Comando fase non valido.' },
  }
  const mapped = messages[error.message]
  return mapped
    ? fail(appError(mapped.code, mapped.message, { cause: error }))
    : fail(appError('UNKNOWN', 'Comando fase non completato.', { cause: error, retryable: true }))
}

export async function transitionGameNarrativePhase(input: NarrativePhaseTransitionInput): Promise<Result<NarrativePhaseTransitionResult>> {
  if (!staffSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Comandi Regia non disponibili.'))
  const commandId = input.commandId ?? crypto.randomUUID()
  const { data, error } = await staffSupabaseClient.rpc('transition_game_narrative_phase', {
    game_code: input.gameCode,
    expected_phase: input.expectedPhase,
    target_phase: input.targetPhase,
    command_id: commandId,
  })
  if (error) { logger.warn('Staff narrative phase command failed', { cause: error }); return mapCommandError(error) }
  if (!data?.[0]) return fail(appError('UNKNOWN', 'Comando fase non completato.', { retryable: true }))
  return ok(data[0])
}
