import type { BrainMetrics, BrainPlayer, BrainState, ScenarioTruth } from './brain.types'

const participationScore = { low: 0, medium: 0.5, high: 1 } as const

export function calculateBrainMetrics(state: BrainState, truth?: ScenarioTruth): BrainMetrics {
  const activeSuspicion = state.socialEdges.filter((edge) => edge.active && edge.type === 'SUSPICION')
  const suspiciousPlayers = new Set(activeSuspicion.map((edge) => edge.sourcePlayerId))
  const liarExposure = truth && state.players.length > 0 && activeSuspicion.length > 0
    ? [...suspiciousPlayers].filter((playerId) => activeSuspicion.some((edge) => edge.sourcePlayerId === playerId && edge.targetPlayerId === truth.liarPlayerId)).length / state.players.length
    : null
  const theoryDiversity = activeSuspicion.length > 0
    ? new Set(activeSuspicion.map((edge) => edge.targetPlayerId)).size / activeSuspicion.length
    : null

  const activityCounts = state.players.map((player) => player.activityCount)
  const hasActivityCounts = activityCounts.length > 0 && activityCounts.every((count) => Number.isFinite(count) && (count ?? 0) >= 0)
  const maxActivity = hasActivityCounts ? Math.max(...activityCounts.map((count) => count ?? 0)) : 0
  const minActivity = hasActivityCounts ? Math.min(...activityCounts.map((count) => count ?? 0)) : 0
  const participationBalance = hasActivityCounts && maxActivity > 0 ? 1 - (maxActivity - minActivity) / maxActivity : null

  return { liarExposure, theoryDiversity, participationBalance }
}

export function profileParticipationScore(player: BrainPlayer): number {
  return participationScore[player.participationLevel]
}

