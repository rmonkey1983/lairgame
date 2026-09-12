import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'

export type TestGameResetResult = {
  game_id: string
  game_code: string
  lifecycle: string
  narrative_phase: string
  command_id: string
  reset_at: string
}

export async function resetGameForTesting(gameCode: string, commandId = crypto.randomUUID()): Promise<Result<TestGameResetResult>> {
  if (!staffSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Reset partita non disponibile.'))
  const { data, error } = await staffSupabaseClient.rpc('reset_game_for_testing', { game_code: gameCode, command_id: commandId })
  if (error) {
    logger.warn('Staff test game reset failed', { cause: error })
    const messages: Record<string, string> = {
      GAME_RESET_DISABLED: 'Il reset non è abilitato per questa partita.',
      STAFF_ACCESS_DENIED: 'Accesso Regia non autorizzato.',
      STAFF_AUTH_REQUIRED: 'Accesso Staff richiesto.',
    }
    return fail(appError('UNKNOWN', messages[error.message] ?? 'Reset partita non completato.', { cause: error }))
  }
  if (!data?.[0]) return fail(appError('UNKNOWN', 'Reset partita non completato.'))
  return ok(data[0] as TestGameResetResult)
}
