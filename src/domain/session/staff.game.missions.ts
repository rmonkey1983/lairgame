import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'

export type MissionOutcome = 'COMPLETED' | 'FAILED' | 'EXPIRED'
export type StaffGameMission = { mission_id: string; mission_type: string; player_id: string; target_player_id: string | null; phase: string; status: 'ACTIVE' | MissionOutcome; acknowledged_at: string | null; outcome_at: string | null; outcome_reason: string | null }

function mapError(error: { message: string }): Result<never> {
  const messages: Record<string, { code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION'; message: string }> = {
    AUTH_REQUIRED: { code: 'UNAUTHORIZED', message: 'Sessione Staff non disponibile.' },
    STAFF_ACCESS_DENIED: { code: 'FORBIDDEN', message: 'Accesso Regia non autorizzato.' },
    GAME_NOT_FOUND: { code: 'NOT_FOUND', message: 'Partita non trovata.' },
    MISSION_OUTCOME_TERMINAL: { code: 'CONFLICT', message: 'La missione ha già un esito definitivo.' },
    INVALID_MISSION_OUTCOME: { code: 'VALIDATION', message: 'Esito missione non valido.' },
  }
  const mapped = messages[error.message]
  return fail(appError(mapped?.code ?? 'UNKNOWN', mapped?.message ?? 'Impossibile aggiornare la missione.', { cause: error, retryable: !mapped }))
}

export async function getStaffMissionOutcomes(gameCode: string): Promise<Result<StaffGameMission[]>> {
  if (!staffSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Dati Regia non disponibili.'))
  const { data, error } = await staffSupabaseClient.rpc('load_staff_mission_outcomes', { game_code: gameCode })
  if (error) { logger.warn('Staff mission outcomes failed', { cause: error }); return mapError(error) }
  return ok((data ?? []) as StaffGameMission[])
}

export async function setStaffMissionOutcome(gameCode: string, missionId: string, outcome: MissionOutcome, reasonCode?: string): Promise<Result<StaffGameMission>> {
  if (!staffSupabaseClient) return fail(appError('TEMPORARY_UNAVAILABLE', 'Comandi Regia non disponibili.'))
  const { data, error } = await staffSupabaseClient.rpc('set_brain_mission_outcome', { game_code: gameCode, mission_id: missionId, outcome, ...(reasonCode ? { reason_code: reasonCode } : {}), command_id: crypto.randomUUID() })
  if (error) { logger.warn('Staff mission outcome command failed', { cause: error }); return mapError(error) }
  if (!data?.[0]) return fail(appError('UNKNOWN', 'Esito missione non completato.'))
  return ok(data[0] as StaffGameMission)
}
