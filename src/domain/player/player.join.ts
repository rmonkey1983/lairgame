import { appError, fail, ok, type AppErrorCode, type Result } from '../../lib/errors/error.contracts'
import { playerSupabaseClient } from '../../lib/supabase/player-client'
import { ensureAnonymousPlayerSession } from './player.auth'

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
    AUTH_SESSION_STALE: { code: 'UNAUTHORIZED', message: 'Sessione Player non disponibile.' },
  }
  const mapped = messages[error.message]
  return fail(appError(mapped?.code ?? 'UNKNOWN', mapped?.message ?? 'Impossibile completare il join.', { cause: error, retryable: !mapped }))
}

export async function joinGame(input: { gameCode: string; nickname: string; tableNumber: number; seatNumber: number }): Promise<Result<PlayerJoinState>> {
  const client = playerSupabaseClient
  if (!client) return unavailable<PlayerJoinState>()
  const session = await ensureAnonymousPlayerSession()
  if (!session.ok) return session
  const runJoin = async () => client.rpc('join_game', {
    p_game_code: input.gameCode,
    p_nickname: input.nickname,
    p_table_number: input.tableNumber,
    p_seat_number: input.seatNumber,
  })
  const first = await runJoin()
  if (!first.error && first.data?.[0]) return ok(first.data[0])
  if (first.error?.message !== 'AUTH_SESSION_STALE') return first.error ? mapRpcError(first.error) : fail(appError('UNKNOWN', 'Risposta join non valida.'))
  const recovered = await ensureAnonymousPlayerSession({ forceFresh: true })
  if (!recovered.ok) return recovered
  const retry = await runJoin()
  if (retry.error || !retry.data?.[0]) return retry.error ? mapRpcError(retry.error) : fail(appError('UNKNOWN', 'Risposta join non valida.'))
  return ok(retry.data[0])
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
