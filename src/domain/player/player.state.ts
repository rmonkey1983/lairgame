import { appError, fail, ok, type AppErrorCode, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { playerSupabaseClient } from '../../lib/supabase/player-client'

export type PlayerFacingRole = 'liar' | 'accomplice' | 'investigator'

export type PlayerGameState = {
  game_id: string
  lifecycle: string
  narrative_phase: string
  nickname: string
  table_number: number
  seat_number: number
  role: PlayerFacingRole | null
  role_acknowledged: boolean
  scenario_title: string | null
  briefing_title: string | null
  briefing_body: string | null
  discovery_title: string | null
  discovery_body: string | null
  clue_title: string | null
  clue_body: string | null
  comparison_title: string | null
  comparison_body: string | null
  comparison_target_table_number: number | null
  comparison_instruction: string | null
  pressure_title: string | null
  pressure_body: string | null
  pressure_target_table_number: number | null
  pressure_route_title: string | null
  pressure_instruction: string | null
}

function mapError(error: { message: string }): Result<never> {
  const messages: Record<string, { code: AppErrorCode; userMessage: string }> = {
    AUTH_REQUIRED: { code: 'UNAUTHORIZED', userMessage: 'Sessione Player non disponibile.' },
    AUTH_ANONYMOUS_REQUIRED: { code: 'FORBIDDEN', userMessage: 'Questa sessione non può entrare come Player.' },
    GAME_NOT_FOUND: { code: 'NOT_FOUND', userMessage: 'Partita non trovata.' },
  }
  const mapped = messages[error.message]
  return fail(appError(mapped?.code ?? 'UNKNOWN', mapped?.userMessage ?? 'Impossibile caricare lo stato Player.', { cause: error, retryable: !mapped }))
}

export async function getMyPlayerState(gameCode: string): Promise<Result<PlayerGameState | null>> {
  if (!playerSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Servizio di gioco non configurato.'))
  const session = await playerSupabaseClient.auth.getSession()
  if (session.error) return fail(appError('NETWORK', 'Impossibile verificare la sessione.', { cause: session.error, retryable: true }))
  if (!session.data.session || session.data.session.user.is_anonymous !== true) {
    return fail(appError('UNAUTHORIZED', 'Sessione Player non disponibile.'))
  }
  const { data, error } = await playerSupabaseClient.rpc('get_my_player_state', { game_code: gameCode })
  if (error) {
    logger.warn('Player state failed', { cause: error })
    return mapError(error)
  }
  return ok(data?.[0] ? data[0] as PlayerGameState : null)
}
