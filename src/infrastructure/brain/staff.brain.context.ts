import type { BrainRealtimeContext } from './brain.realtime'
import type { StaffGameOverview, StaffGameRosterPlayer } from '../../domain/session/staff.game.read'
import type { GamePhase } from '../../domain/brain/brain.types'

const phaseMap: Record<string, GamePhase> = {
  lobby: 'LOBBY', role_reveal: 'ROLE_REVEAL', briefing: 'SOCIAL_WARMUP', discovery: 'INVESTIGATION', comparison: 'INVESTIGATION', pressure: 'DOUBT', deliberation: 'FINAL_THEORY', final_vote: 'VOTING', reveal: 'REVEAL',
}

export function buildStaffBrainContext(overview: StaffGameOverview, roster: StaffGameRosterPlayer[]): BrainRealtimeContext {
  const players = roster.map((player) => ({
    playerId: player.player_id,
    nickname: player.nickname,
    tableId: `table-${player.table_number}`,
    socialStyle: 'balanced' as const,
    exposureLevel: 'medium' as const,
    participationLevel: 'medium' as const,
    arrivedWithPlayerIds: [],
    strategyPreference: 'mixed' as const,
    sources: { socialStyle: 'defaulted' as const, exposureLevel: 'defaulted' as const, participationLevel: 'defaulted' as const, strategyPreference: 'defaulted' as const },
  }))
  const tables = Array.from({ length: overview.table_count }, (_, index) => ({ tableId: `table-${index + 1}`, tableNumber: index + 1, playerIds: players.filter((player) => player.tableId === `table-${index + 1}`).map((player) => player.playerId) }))
  const matchedTables = tables.map((table) => ({ tableId: table.tableId, playerIds: table.playerIds, score: 0, metrics: { socialBalance: 0, participationBalance: 0, existingGroupBalance: 0 }, warnings: [] }))
  const phase = phaseMap[overview.narrative_phase] ?? 'LOBBY'
  return { input: { sessionId: overview.id, phase, players, tables }, directorTables: matchedTables, missionContext: { phase, players } }
}
