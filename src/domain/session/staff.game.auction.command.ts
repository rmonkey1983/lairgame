import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'
import type { Database } from '../../lib/supabase/database.types'

export type AuctionCommandResult = { game_id: string; auction_id: string; status?: string; winning_table_number?: number | null; winning_bid?: number | null; closed_at?: string | null }
function commandError(error: { message: string }): Result<never> { logger.warn('Staff auction command failed', { cause: error }); return fail(appError('UNKNOWN', 'Comando asta non completato.', { cause: error })) }
async function call(name: keyof Database['public']['Functions'], args: Record<string, unknown>): Promise<Result<AuctionCommandResult>> {
  if (!staffSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Comandi asta non disponibili.'))
  const { data, error } = await staffSupabaseClient.rpc(name, args as never)
  if (error) return commandError(error)
  if (!data?.[0]) return fail(appError('UNKNOWN', 'Comando asta non completato.'))
  return ok(data[0] as unknown as AuctionCommandResult)
}
export function openGameAuction(gameCode: string, commandId = crypto.randomUUID()) { return call('open_game_auction', { game_code: gameCode, command_id: commandId }) }
export function recordGameAuctionBid(gameCode: string, tableNumber: number, amount: number, commandId = crypto.randomUUID()) { return call('record_game_auction_bid', { game_code: gameCode, table_number: tableNumber, amount, command_id: commandId }) }
export function closeGameAuction(gameCode: string, commandId = crypto.randomUUID()) { return call('close_game_auction', { game_code: gameCode, command_id: commandId }) }
export function closeGameAuctionNoSale(gameCode: string, commandId = crypto.randomUUID()) { return call('close_game_auction_no_sale', { game_code: gameCode, command_id: commandId }) }
