import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'

export type GameRole = 'liar' | 'accomplice' | 'scapegoat' | 'investigator'
export type AssignGameRolesResult = { game_id: string; game_code: string; command_id: string; player_count: number; assigned_at: string }

function mapError(error: { message: string }): Result<AssignGameRolesResult> {
  const map: Record<string, { code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION'; message: string }> = {
    AUTH_REQUIRED: { code: 'UNAUTHORIZED', message: 'Sessione Staff non disponibile.' }, STAFF_AUTH_REQUIRED: { code: 'FORBIDDEN', message: 'Accesso Staff richiesto.' }, STAFF_ACCESS_DENIED: { code: 'FORBIDDEN', message: 'Accesso Regia non autorizzato.' }, GAME_NOT_FOUND: { code: 'NOT_FOUND', message: 'Partita non trovata.' }, GAME_NOT_LIVE: { code: 'CONFLICT', message: 'La partita deve essere live.' }, GAME_NOT_IN_LOBBY: { code: 'CONFLICT', message: 'Assegna i ruoli solo dalla lobby.' }, MIN_PLAYERS_REQUIRED: { code: 'CONFLICT', message: 'Servono almeno 3 partecipanti.' }, ROLES_ALREADY_ASSIGNED: { code: 'CONFLICT', message: 'I ruoli sono già stati assegnati.' }, INVALID_COMMAND: { code: 'VALIDATION', message: 'Comando ruoli non valido.' },
  }
  const mapped = map[error.message]
  return mapped ? fail(appError(mapped.code, mapped.message, { cause: error })) : fail(appError('UNKNOWN', 'Assegnazione ruoli non completata.', { cause: error, retryable: true }))
}

export async function assignGameRoles(gameCode: string, commandId = crypto.randomUUID()): Promise<Result<AssignGameRolesResult>> {
  if (!staffSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Comandi Regia non disponibili.'))
  const { data, error } = await staffSupabaseClient.rpc('assign_game_roles', { game_code: gameCode, command_id: commandId })
  if (error) { logger.warn('Staff role assignment failed', { cause: error }); return mapError(error) }
  if (!data?.[0]) return fail(appError('UNKNOWN', 'Assegnazione ruoli non completata.', { retryable: true }))
  return ok(data[0])
}
