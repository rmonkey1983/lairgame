import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'

export type TableCoinAdjustment = {
  game_id: string
  game_code: string
  table_number: number
  delta: number
  reason: string
  correlation_id: string
  balance: number
  created_at: string
}

export async function adjustTableCoins(input: { gameCode: string; tableNumber: number; delta: number; reason: string; commandId: string }): Promise<Result<TableCoinAdjustment>> {
  if (!staffSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Comandi Coin non disponibili.'))
  const { data, error } = await staffSupabaseClient.rpc('adjust_table_coins', {
    game_code: input.gameCode, table_number: input.tableNumber, delta: input.delta,
    reason: input.reason, command_id: input.commandId,
  })
  if (error) {
    logger.warn('Staff table coin adjustment failed', { cause: error })
    return fail(appError('UNKNOWN', 'Aggiustamento Coin non completato.', { cause: error }))
  }
  if (!data?.[0]) return fail(appError('UNKNOWN', 'Aggiustamento Coin non completato.'))
  return ok(data[0] as TableCoinAdjustment)
}
