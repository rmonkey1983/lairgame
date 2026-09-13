import { appError, fail, ok, type AppErrorCode, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { playerSupabaseClient } from '../../lib/supabase/player-client'

export type PlayerMissionType = 'OBSERVE_PLAYER' | 'VERIFY_STATEMENT' | 'GAIN_TRUST' | 'SHARE_INFORMATION' | 'WITHHOLD_INFORMATION' | 'QUESTION_PLAYER' | 'PROTECT_PLAYER' | 'INFLUENCE_PLAYER' | 'FORM_ALLIANCE' | 'CHANGE_THEORY'
export type PlayerActiveMission = { missionId: string; type: PlayerMissionType; targetPlayerId?: string; phase: string; status: 'ACTIVE' }

const instructions: Record<PlayerMissionType, (target?: string) => string> = {
  OBSERVE_PLAYER: (target) => `Osserva ${target ?? 'il gruppo'} durante questa fase.`,
  VERIFY_STATEMENT: (target) => `Verifica con ${target ?? 'un giocatore'} un'affermazione emersa.`,
  GAIN_TRUST: (target) => `Prova a conquistare la fiducia di ${target ?? 'un giocatore'}.`,
  SHARE_INFORMATION: (target) => `Condividi un'informazione con ${target ?? 'il gruppo'}.`,
  WITHHOLD_INFORMATION: () => 'Ascolta con attenzione e conserva per te un’informazione.',
  QUESTION_PLAYER: (target) => `Fai una domanda a ${target ?? 'un giocatore'} per chiarire un dubbio.`,
  PROTECT_PLAYER: (target) => `Sostieni ${target ?? 'un giocatore'} durante la discussione.`,
  INFLUENCE_PLAYER: (target) => `Prova a orientare il punto di vista di ${target ?? 'un giocatore'}.`,
  FORM_ALLIANCE: (target) => `Cerca un’intesa con ${target ?? 'un giocatore'}.`,
  CHANGE_THEORY: (target) => `Confrontati con ${target ?? 'un giocatore'} e rivedi la tua teoria.`,
}

export function getPlayerMissionInstruction(mission: Pick<PlayerActiveMission, 'type' | 'targetPlayerId'>): string { return instructions[mission.type](mission.targetPlayerId) }

function mapError(error: { message: string }): Result<never> {
  const safe: Record<string, { code: AppErrorCode; userMessage: string }> = {
    AUTH_REQUIRED: { code: 'UNAUTHORIZED', userMessage: 'Sessione Player non disponibile.' },
    AUTH_ANONYMOUS_REQUIRED: { code: 'FORBIDDEN', userMessage: 'Questa sessione non può entrare come Player.' },
    GAME_NOT_FOUND: { code: 'NOT_FOUND', userMessage: 'Partita non trovata.' },
  }
  const mapped = safe[error.message]
  return fail(appError(mapped?.code ?? 'UNKNOWN', mapped?.userMessage ?? 'Impossibile caricare le missioni.', { cause: error, retryable: !mapped }))
}

export async function loadMyActiveMissions(gameCode: string): Promise<Result<PlayerActiveMission[]>> {
  if (!playerSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Servizio di gioco non configurato.'))
  const session = await playerSupabaseClient.auth.getSession()
  if (session.error) return fail(appError('NETWORK', 'Impossibile verificare la sessione.', { cause: session.error, retryable: true }))
  if (!session.data.session || session.data.session.user.is_anonymous !== true) return mapError({ message: 'AUTH_REQUIRED' })
  const { data, error } = await playerSupabaseClient.rpc('load_my_player_missions', { game_code: gameCode })
  if (error) { logger.warn('Player missions failed', { cause: error }); return mapError(error) }
  return ok((data ?? []).map((row) => ({ missionId: row.mission_id, type: row.mission_type as PlayerMissionType, ...(row.target_player_id ? { targetPlayerId: row.target_player_id } : {}), phase: row.phase, status: 'ACTIVE' as const })))
}
