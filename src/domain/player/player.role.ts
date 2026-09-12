import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { playerSupabaseClient } from '../../lib/supabase/player-client'

export async function acknowledgeMyRole(gameCode: string): Promise<Result<void>> {
  if (!playerSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Servizio di gioco non configurato.'))
  const { error } = await playerSupabaseClient.rpc('acknowledge_my_role', { game_code: gameCode })
  if (error) {
    logger.warn('Role acknowledgement failed', { cause: error })
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'Sessione Player non disponibile.',
      PLAYER_AUTH_REQUIRED: 'Sessione Player non disponibile.',
      PLAYER_NOT_FOUND: 'Partecipazione Player non trovata.',
      GAME_NOT_FOUND: 'Partita non trovata.',
      GAME_NOT_LIVE: 'La partita non è live.',
      GAME_NOT_IN_ROLE_REVEAL: 'La conferma è disponibile durante la scoperta del ruolo.',
      ROLE_ASSIGNMENT_REQUIRED: 'Il ruolo non è ancora disponibile.',
    }
    return fail(appError(messages[error.message] ? 'FORBIDDEN' : 'UNKNOWN', messages[error.message] ?? 'Impossibile confermare il ruolo.', { cause: error, retryable: !messages[error.message] }))
  }
  return ok(undefined)
}
