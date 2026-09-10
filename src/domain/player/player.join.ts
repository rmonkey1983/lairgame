import type { User } from '@supabase/supabase-js'
import { appError, fail, ok, type AppErrorCode, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { playerSupabaseClient } from '../../lib/supabase/player-client'

export type PlayerJoinState = {
  player_id: string
  game_id: string
  game_code: string
  nickname: string
  table_number: number
  seat_number: number
  join_status: string
}

function unavailable<T>(): Result<T> {
  return fail(appError('TEMPORARY_UNAVAILABLE', 'Servizio di gioco non configurato.', { retryable: false }))
}

function mapRpcError(error: { message: string }): Result<never> {
  const messages: Record<string, { code: AppErrorCode; message: string }> = {
    AUTH_REQUIRED: { code: 'UNAUTHORIZED', message: 'Sessione non disponibile. Riprova.' },
    AUTH_ANONYMOUS_REQUIRED: { code: 'FORBIDDEN', message: 'Questa sessione non può entrare come Player.' },
    GAME_NOT_FOUND: { code: 'NOT_FOUND', message: 'Partita non trovata.' },
    GAME_NOT_OPEN: { code: 'FORBIDDEN', message: 'Check-in non disponibile per questa partita.' },
    TABLE_NOT_FOUND: { code: 'NOT_FOUND', message: 'Tavolo non trovato.' },
    SEAT_INVALID: { code: 'VALIDATION', message: 'Tavolo o posto non validi.' },
    NICKNAME_INVALID: { code: 'VALIDATION', message: 'Inserisci un nickname.' },
    SEAT_TAKEN: { code: 'CONFLICT', message: 'Posto già occupato. Scegline un altro.' },
    CONFLICT: { code: 'CONFLICT', message: 'Join già effettuato con dati diversi.' },
  }
  const mapped = messages[error.message]
  return fail(appError(mapped?.code ?? 'UNKNOWN', mapped?.message ?? 'Impossibile completare il join.', { cause: error, retryable: !mapped }))
}

export async function ensureAnonymousPlayerSession(): Promise<Result<User>> {
  if (!playerSupabaseClient) return unavailable<User>()
  const current = await playerSupabaseClient.auth.getSession()
  if (current.error) return fail(appError('NETWORK', 'Impossibile verificare la sessione.', { cause: current.error, retryable: true }))
  if (current.data.session) {
    if (current.data.session.user.is_anonymous !== true) return fail(appError('FORBIDDEN', 'Sessione non valida per Player.'))
    return ok(current.data.session.user)
  }
  const signedIn = await playerSupabaseClient.auth.signInAnonymously()
  if (signedIn.error || !signedIn.data.user) {
    logger.warn('Anonymous sign-in failed', { cause: signedIn.error })
    return fail(appError('UNAUTHORIZED', 'Impossibile creare la sessione Player.', { cause: signedIn.error, retryable: true }))
  }
  return ok(signedIn.data.user)
}

export async function joinGame(input: { gameCode: string; nickname: string; tableNumber: number; seatNumber: number }): Promise<Result<PlayerJoinState>> {
  if (!playerSupabaseClient) return unavailable<PlayerJoinState>()
  const { data, error } = await playerSupabaseClient.rpc('join_game', {
    p_game_code: input.gameCode,
    p_nickname: input.nickname,
    p_table_number: input.tableNumber,
    p_seat_number: input.seatNumber,
  })
  if (error || !data?.[0]) return error ? mapRpcError(error) : fail(appError('UNKNOWN', 'Risposta join non valida.'))
  return ok(data[0])
}

export async function getMyJoinState(gameCode: string): Promise<Result<PlayerJoinState | null>> {
  if (!playerSupabaseClient) return unavailable<PlayerJoinState | null>()
  const session = await playerSupabaseClient.auth.getSession()
  if (session.error) return fail(appError('NETWORK', 'Impossibile verificare la sessione.', { cause: session.error, retryable: true }))
  if (!session.data.session || session.data.session.user.is_anonymous !== true) {
    return fail(appError('UNAUTHORIZED', 'Sessione Player non disponibile.'))
  }
  const { data, error } = await playerSupabaseClient.rpc('get_my_join_state', { p_game_code: gameCode })
  if (error) return mapRpcError(error)
  return ok(data?.[0] ?? null)
}

export function validateJoinInput(gameCode: string | undefined, nickname: string, tableNumber: string, seatNumber: string): string | null {
  if (!gameCode?.trim()) return 'Codice partita mancante.'
  if (!nickname.trim()) return 'Inserisci un nickname.'
  if (!Number.isInteger(Number(tableNumber)) || Number(tableNumber) <= 0) return 'Numero tavolo non valido.'
  if (!Number.isInteger(Number(seatNumber)) || Number(seatNumber) <= 0) return 'Numero posto non valido.'
  return null
}
