import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'

export type StaffGame = {
  game_id: string
  game_code: string
  lifecycle: string
  narrative_phase: string
  event_name: string
  starts_at: string | null
  venue_name: string | null
  table_count: number
  player_count: number
}

export type StaffGameOverview = {
  id: string
  code: string
  lifecycle: string
  narrative_phase: string
  created_at: string
  event_name: string
  starts_at: string | null
  venue_name: string | null
  table_count: number
  player_count: number
  scenario_title: string | null
  scenario_version_number: number | null
  briefing_title: string | null
  briefing_body: string | null
  discovery_title: string | null
  discovery_body: string | null
  comparison_title: string | null
  comparison_body: string | null
  pressure_title: string | null
  pressure_body: string | null
}

export type StaffGameRosterPlayer = {
  player_id: string
  nickname: string
  table_number: number
  seat_number: number
  joined_at: string
}

export type StaffGameRole = {
  player_id: string
  nickname: string
  table_number: number
  seat_number: number
  role: 'liar' | 'accomplice' | 'scapegoat' | 'investigator'
  role_acknowledged: boolean
}

export type StaffGameClue = {
  table_number: number
  title: string
  body: string
}

export type StaffGameComparison = {
  source_table_number: number
  target_table_number: number
  instruction: string
}

export type StaffGamePressureRoute = {
  source_table_number: number
  target_table_number: number
  title: string
  instruction: string
}

export type StaffGameTableCoins = { table_number: number; balance: number }
export type StaffGameAuctionBid = { table_number: number; amount: number; created_at: string }
export type StaffGameAuction = { auction_id: string | null; item_title: string; item_teaser: string; status: 'not_open' | 'open' | 'closed' | 'no_sale'; bids: StaffGameAuctionBid[]; current_highest_bid: number | null; current_highest_table_number: number | null; winning_table_number: number | null; winning_bid: number | null; table_balances: Array<{ table_number: number; balance: number }> }

function unavailable<T>(): Result<T> {
  return fail(appError('TEMPORARY_UNAVAILABLE', 'Dati Regia non disponibili.', { retryable: false }))
}

function mapReadError<T>(error: { message: string }): Result<T> {
  const messages: Record<string, { code: 'NOT_FOUND' | 'FORBIDDEN' | 'UNAUTHORIZED'; message: string }> = {
    AUTH_REQUIRED: { code: 'UNAUTHORIZED', message: 'Sessione Staff non disponibile.' },
    STAFF_AUTH_REQUIRED: { code: 'FORBIDDEN', message: 'Accesso Staff richiesto.' },
    STAFF_ACCESS_DENIED: { code: 'FORBIDDEN', message: 'Accesso Regia non autorizzato.' },
    GAME_NOT_FOUND: { code: 'NOT_FOUND', message: 'Partita non trovata.' },
  }
  const mapped = messages[error.message]
  return mapped
    ? fail(appError(mapped.code, mapped.message, { cause: error }))
    : fail(appError('UNKNOWN', 'Impossibile caricare i dati Regia.', { cause: error, retryable: true }))
}

export async function listStaffGames(): Promise<Result<StaffGame[]>> {
  if (!staffSupabaseClient) return unavailable<StaffGame[]>()
  const { data, error } = await staffSupabaseClient.rpc('list_staff_games')
  if (error) { logger.warn('Staff game list failed', { cause: error }); return mapReadError(error) }
  return ok(data ?? [])
}

export async function getStaffGameOverview(gameCode: string): Promise<Result<StaffGameOverview>> {
  if (!staffSupabaseClient) return unavailable<StaffGameOverview>()
  const { data, error } = await staffSupabaseClient.rpc('get_staff_game_overview', { p_game_code: gameCode })
  if (error) { logger.warn('Staff game overview failed', { cause: error }); return mapReadError(error) }
  if (!data?.[0]) return fail(appError('NOT_FOUND', 'Partita non trovata.'))
  return ok(data[0])
}

export async function getStaffGameRoster(gameCode: string): Promise<Result<StaffGameRosterPlayer[]>> {
  if (!staffSupabaseClient) return unavailable<StaffGameRosterPlayer[]>()
  const { data, error } = await staffSupabaseClient.rpc('get_staff_game_roster', { game_code: gameCode })
  if (error) { logger.warn('Staff game roster failed', { cause: error }); return mapReadError(error) }
  return ok(data ?? [])
}

export async function getStaffGameRoles(gameCode: string): Promise<Result<StaffGameRole[]>> {
  if (!staffSupabaseClient) return unavailable<StaffGameRole[]>()
  const { data, error } = await staffSupabaseClient.rpc('get_staff_game_roles', { game_code: gameCode })
  if (error) { logger.warn('Staff game roles failed', { cause: error }); return mapReadError(error) }
  return ok((data ?? []) as StaffGameRole[])
}

export async function getStaffGameClues(gameCode: string): Promise<Result<StaffGameClue[]>> {
  if (!staffSupabaseClient) return unavailable<StaffGameClue[]>()
  const { data, error } = await staffSupabaseClient.rpc('get_staff_game_clues', { game_code: gameCode })
  if (error) { logger.warn('Staff game clues failed', { cause: error }); return mapReadError(error) }
  return ok(data ?? [])
}

export async function getStaffGameComparisons(gameCode: string): Promise<Result<StaffGameComparison[]>> {
  if (!staffSupabaseClient) return unavailable<StaffGameComparison[]>()
  const { data, error } = await staffSupabaseClient.rpc('get_staff_game_comparisons', { game_code: gameCode })
  if (error) { logger.warn('Staff game comparisons failed', { cause: error }); return mapReadError(error) }
  return ok(data ?? [])
}

export async function getStaffGamePressureRoutes(gameCode: string): Promise<Result<StaffGamePressureRoute[]>> {
  if (!staffSupabaseClient) return unavailable<StaffGamePressureRoute[]>()
  const { data, error } = await staffSupabaseClient.rpc('get_staff_game_pressure_routes', { game_code: gameCode })
  if (error) { logger.warn('Staff game pressure routes failed', { cause: error }); return mapReadError(error) }
  return ok(data ?? [])
}

export async function getStaffGameCoins(gameCode: string): Promise<Result<StaffGameTableCoins[]>> {
  if (!staffSupabaseClient) return unavailable<StaffGameTableCoins[]>()
  const { data, error } = await staffSupabaseClient.rpc('get_staff_game_coins', { game_code: gameCode })
  if (error) { logger.warn('Staff game coins failed', { cause: error }); return mapReadError(error) }
  return ok(data ?? [])
}

export async function getStaffGameAuction(gameCode: string): Promise<Result<StaffGameAuction | null>> {
  if (!staffSupabaseClient) return unavailable<StaffGameAuction | null>()
  const { data, error } = await staffSupabaseClient.rpc('get_staff_game_auction', { game_code: gameCode })
  if (error) { logger.warn('Staff game auction failed', { cause: error }); return mapReadError(error) }
  if (!data?.[0]) return ok(null)
  const row = data[0] as StaffGameAuction & { bids: unknown; table_balances: unknown }
  return ok({ ...row, bids: Array.isArray(row.bids) ? row.bids as StaffGameAuctionBid[] : [], table_balances: Array.isArray(row.table_balances) ? row.table_balances as StaffGameAuction['table_balances'] : [] })
}
