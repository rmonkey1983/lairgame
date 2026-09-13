import { calculateTrustConcentration, calculateTrustCoverage, type TrustGraph } from './brain.trust'
import type { BrainEventStore } from './brain.events'
import type { SuspicionConfidence, SuspicionGraph } from './brain.suspicion'
import type { BrainMetrics, BrainPlayer, BrainState, MissionOutcomeRecord, MissionType, PlayerActivityMetric, ScenarioTruth, TableBrainMetrics } from './brain.types'

const participationScore = { low: 0, medium: 0.5, high: 1 } as const
const confidenceScore: Record<SuspicionConfidence, number> = { LOW: 0, MEDIUM: 0.5, HIGH: 1 }
const activityEventTypes = new Set(['TRUST_SELECTED', 'TRUST_CHANGED', 'SUSPICION_SELECTED', 'SUSPICION_TARGET_CHANGED', 'SUSPICION_CONFIDENCE_CHANGED'])

export type BrainMetricsContext = {
  trustGraph?: TrustGraph
  suspicionGraph?: SuspicionGraph
  eventStore?: BrainEventStore
  missionOutcomes?: MissionOutcomeRecord[]
}

export type MissionOutcomeMetrics = {
  totalActivated: number
  completed: number
  failed: number
  expired: number
  completionRate: number | null
  failureRate: number | null
  expirationRate: number | null
  acknowledgementRate: number | null
  byMissionType: MissionTypeOutcomeMetrics[]
  byPlayer: PlayerMissionOutcomeMetrics[]
  byTable: TableMissionOutcomeMetrics[]
}
export type MissionTypeOutcomeMetrics = { missionType: MissionType; activated: number; completed: number; failed: number; expired: number; completionRate: number | null }
export type PlayerMissionOutcomeMetrics = { playerId: string; activated: number; completed: number; failed: number; expired: number }
export type TableMissionOutcomeMetrics = { tableId: string; activated: number; completed: number; failed: number; expired: number; completionRate: number | null }
export type MissionInterventionTrace = { decisionId: string | null; directorProposalId: string | null; regiaProposalId: string | null; missionId: string; outcome: MissionOutcomeRecord['status'] }

export function getMissionInterventionTrace(record: MissionOutcomeRecord): MissionInterventionTrace {
  return { decisionId: record.decisionId ?? null, directorProposalId: record.directorProposalId ?? null, regiaProposalId: record.sourceProposalId ?? null, missionId: record.missionId, outcome: record.status }
}

function outcomeCounts(records: MissionOutcomeRecord[]) {
  return records.reduce((counts, record) => ({ activated: counts.activated + 1, completed: counts.completed + (record.status === 'COMPLETED' ? 1 : 0), failed: counts.failed + (record.status === 'FAILED' ? 1 : 0), expired: counts.expired + (record.status === 'EXPIRED' ? 1 : 0) }), { activated: 0, completed: 0, failed: 0, expired: 0 })
}

export function calculateMissionOutcomeMetrics(records: readonly MissionOutcomeRecord[] = []): MissionOutcomeMetrics {
  const ordered = [...records].sort((a, b) => a.missionId.localeCompare(b.missionId))
  const total = outcomeCounts(ordered)
  const terminal = total.completed + total.failed + total.expired
  const grouped = <T>(values: T[], key: (value: T) => string) => [...new Set(values.map(key))].sort((a, b) => a.localeCompare(b))
  const byMissionType = grouped(ordered, (record) => record.missionType).map((missionType) => {
    const counts = outcomeCounts(ordered.filter((record) => record.missionType === missionType))
    return { missionType: missionType as MissionType, ...counts, completionRate: ratio(counts.completed, counts.completed + counts.failed + counts.expired) }
  })
  const byPlayer = grouped(ordered, (record) => record.playerId).map((playerId) => ({ playerId, ...outcomeCounts(ordered.filter((record) => record.playerId === playerId)) }))
  const byTable = grouped(ordered.filter((record) => record.tableId), (record) => record.tableId as string).map((tableId) => {
    const counts = outcomeCounts(ordered.filter((record) => record.tableId === tableId))
    return { tableId, ...counts, completionRate: ratio(counts.completed, counts.completed + counts.failed + counts.expired) }
  })
  return { totalActivated: total.activated, completed: total.completed, failed: total.failed, expired: total.expired, completionRate: ratio(total.completed, terminal), failureRate: ratio(total.failed, terminal), expirationRate: ratio(total.expired, terminal), acknowledgementRate: ratio(ordered.filter((record) => record.acknowledgedAt != null).length, total.activated), byMissionType, byPlayer, byTable }
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : null
}

function clampMetric(value: number): number { return Number(Math.max(0, Math.min(1, value)).toFixed(6)) }

function activeSuspicion(state: BrainState, graph?: SuspicionGraph): Array<{ sourcePlayerId: string; targetPlayerId: string; confidence?: SuspicionConfidence }> {
  if (graph) return graph.edges.filter((edge) => edge.active).map((edge) => ({ ...edge }))
  return state.socialEdges.filter((edge) => edge.active && edge.type === 'SUSPICION').map((edge) => ({ ...edge }))
}

function trustGraphFromEdges(state: BrainState): TrustGraph {
  return {
    playerIds: state.players.map((player) => player.playerId),
    edges: state.socialEdges.filter((edge) => edge.active && edge.type === 'TRUST').map((edge) => ({
      sourcePlayerId: edge.sourcePlayerId,
      targetPlayerId: edge.targetPlayerId,
      type: 'TRUST' as const,
      phase: edge.phase,
      level: 'MEDIUM' as const,
      strength: edge.strength ?? 0.5,
      active: true as const,
    })),
    history: [],
  }
}

function theoryDiversityForEdges(edges: Array<{ targetPlayerId: string }>): number | null {
  if (edges.length === 0) return null
  // Normalized 1 - HHI: one target gives 0; every active source on a distinct target gives 1.
  const counts = [...new Set(edges.map((edge) => edge.targetPlayerId))].map((target) => edges.filter((edge) => edge.targetPlayerId === target).length)
  const hhi = counts.reduce((sum, count) => sum + (count / edges.length) ** 2, 0)
  return counts.length === 1 ? 0 : clampMetric((1 - hhi) / (1 - 1 / edges.length))
}

function eventActivity(state: BrainState, eventStore?: BrainEventStore): PlayerActivityMetric[] {
  if (!eventStore) {
    const counts = state.players.map((player) => player.activityCount)
    if (!counts.every((count) => count !== undefined && Number.isFinite(count) && count >= 0)) return []
    const numericCounts = counts.map((count) => count ?? 0)
    const max = Math.max(...numericCounts, 0)
    return state.players.map((player, index) => ({ playerId: player.playerId, eventCount: counts[index] ?? 0, normalizedActivity: max === 0 ? 0 : clampMetric((counts[index] ?? 0) / max) }))
  }
  const counts = new Map(state.players.map((player) => [player.playerId, 0]))
  for (const event of eventStore.events) {
    if (activityEventTypes.has(event.type) && event.actorPlayerId && counts.has(event.actorPlayerId)) counts.set(event.actorPlayerId, (counts.get(event.actorPlayerId) ?? 0) + 1)
  }
  const max = Math.max(...counts.values(), 0)
  return state.players.map((player) => ({ playerId: player.playerId, eventCount: counts.get(player.playerId) ?? 0, normalizedActivity: max === 0 ? 0 : clampMetric((counts.get(player.playerId) ?? 0) / max) }))
}

function participationBalance(activity: PlayerActivityMetric[]): number | null {
  if (activity.length === 0 || activity.every((metric) => metric.eventCount === 0)) return null
  const total = activity.reduce((sum, metric) => sum + metric.eventCount, 0)
  const hhi = activity.reduce((sum, metric) => sum + (metric.eventCount / total) ** 2, 0)
  return activity.length === 1 ? 1 : clampMetric((1 - hhi) / (1 - 1 / activity.length))
}

function expressedPlayers(state: BrainState, context: BrainMetricsContext, active: ReturnType<typeof activeSuspicion>): Set<string> {
  const expressed = new Set(active.map((edge) => edge.sourcePlayerId))
  if (context.suspicionGraph) for (const entry of context.suspicionGraph.history) expressed.add(entry.sourcePlayerId)
  if (context.eventStore) for (const event of context.eventStore.events) if (event.type.startsWith('SUSPICION_') && event.actorPlayerId) expressed.add(event.actorPlayerId)
  return new Set([...expressed].filter((playerId) => state.players.some((player) => player.playerId === playerId)))
}

function targetChanges(context: BrainMetricsContext, expressed: Set<string>): number {
  if (context.eventStore) return context.eventStore.events.filter((event) => event.type === 'SUSPICION_TARGET_CHANGED' && event.actorPlayerId && expressed.has(event.actorPlayerId)).length
  if (!context.suspicionGraph) return 0
  return [...expressed].reduce((total, playerId) => {
    const history = context.suspicionGraph?.history.filter((entry) => entry.sourcePlayerId === playerId).sort((a, b) => a.sequence - b.sequence) ?? []
    let changes = 0
    for (let index = 1; index < history.length; index += 1) if (history[index - 1].targetPlayerId !== history[index].targetPlayerId) changes += 1
    return total + changes
  }, 0)
}

function changedPlayers(context: BrainMetricsContext, expressed: Set<string>): number {
  if (context.eventStore) return new Set(context.eventStore.events.filter((event) => event.type === 'SUSPICION_TARGET_CHANGED' && event.actorPlayerId && expressed.has(event.actorPlayerId)).map((event) => event.actorPlayerId)).size
  if (!context.suspicionGraph) return 0
  return [...expressed].filter((playerId) => {
    const history = context.suspicionGraph?.history.filter((entry) => entry.sourcePlayerId === playerId).sort((a, b) => a.sequence - b.sequence) ?? []
    return history.some((entry, index) => index > 0 && entry.targetPlayerId !== history[index - 1].targetPlayerId)
  }).length
}

function tableMetrics(state: BrainState, active: ReturnType<typeof activeSuspicion>, activity: PlayerActivityMetric[]): TableBrainMetrics[] {
  return state.tables.map((table) => {
    const players = new Set(table.playerIds)
    const tableSuspicion = active.filter((edge) => players.has(edge.sourcePlayerId))
    const tableActivity = activity.filter((metric) => players.has(metric.playerId))
    return {
      tableId: table.tableId,
      suspicionCoverage: ratio(new Set(tableSuspicion.map((edge) => edge.sourcePlayerId)).size, players.size),
      theoryDiversity: theoryDiversityForEdges(tableSuspicion),
      participationBalance: participationBalance(tableActivity),
    }
  })
}

export function calculateLiarExposure(state: BrainState, truth: ScenarioTruth | undefined, suspicionGraph?: SuspicionGraph): number | null {
  const active = activeSuspicion(state, suspicionGraph)
  if (!truth || active.length === 0) return null
  const sources = new Set(active.map((edge) => edge.sourcePlayerId))
  const liars = new Set(active.filter((edge) => edge.targetPlayerId === truth.liarPlayerId).map((edge) => edge.sourcePlayerId))
  return ratio(liars.size, sources.size)
}

export function calculateRoleExposure(state: BrainState, truth: ScenarioTruth | undefined, suspicionGraph?: SuspicionGraph): BrainMetrics['roleExposure'] {
  const active = activeSuspicion(state, suspicionGraph)
  const sources = new Set(active.map((edge) => edge.sourcePlayerId))
  const exposure = (playerId: string | undefined) => playerId && sources.size > 0 ? ratio(new Set(active.filter((edge) => edge.targetPlayerId === playerId).map((edge) => edge.sourcePlayerId)).size, sources.size) : null
  return { liar: exposure(truth?.liarPlayerId), accomplice: exposure(truth?.accomplicePlayerId), scapegoat: exposure(truth?.scapegoatPlayerId) }
}

export function calculateSuspicionCoverage(state: BrainState, suspicionGraph?: SuspicionGraph): number | null {
  const active = activeSuspicion(state, suspicionGraph)
  return ratio(new Set(active.map((edge) => edge.sourcePlayerId)).size, state.players.length)
}

export function calculateTheoryDiversity(state: BrainState, suspicionGraph?: SuspicionGraph): number | null { return theoryDiversityForEdges(activeSuspicion(state, suspicionGraph)) }

export function calculateTheoryShiftRate(state: BrainState, context: BrainMetricsContext = {}): number | null {
  const expressed = expressedPlayers(state, context, activeSuspicion(state, context.suspicionGraph))
  return expressed.size === 0 ? null : ratio(changedPlayers(context, expressed), expressed.size)
}

export function calculateAverageTheoryChanges(state: BrainState, context: BrainMetricsContext = {}): number | null {
  const expressed = expressedPlayers(state, context, activeSuspicion(state, context.suspicionGraph))
  return expressed.size === 0 ? null : targetChanges(context, expressed) / expressed.size
}

export function calculateLiarConfidence(state: BrainState, truth: ScenarioTruth | undefined, suspicionGraph?: SuspicionGraph): number | null {
  const edges = activeSuspicion(state, suspicionGraph).filter((edge) => edge.targetPlayerId === truth?.liarPlayerId && edge.confidence)
  return edges.length === 0 ? null : Number((edges.reduce((sum, edge) => sum + confidenceScore[edge.confidence as SuspicionConfidence], 0) / edges.length).toFixed(6))
}

export function calculatePlayerActivity(state: BrainState, eventStore?: BrainEventStore): PlayerActivityMetric[] { return eventActivity(state, eventStore) }

export function calculateParticipationBalance(state: BrainState, eventStore?: BrainEventStore): number | null { return participationBalance(eventActivity(state, eventStore)) }

export function calculateTableMetrics(state: BrainState, context: BrainMetricsContext = {}): TableBrainMetrics[] {
  return tableMetrics(state, activeSuspicion(state, context.suspicionGraph), eventActivity(state, context.eventStore))
}

export function calculateBrainMetrics(state: BrainState, truth?: ScenarioTruth, context: BrainMetricsContext = {}): BrainMetrics {
  const trustGraph = context.trustGraph ?? trustGraphFromEdges(state)
  const active = activeSuspicion(state, context.suspicionGraph)
  const activity = eventActivity(state, context.eventStore)
  return {
    liarExposure: calculateLiarExposure(state, truth, context.suspicionGraph),
    roleExposure: calculateRoleExposure(state, truth, context.suspicionGraph),
    theoryDiversity: theoryDiversityForEdges(active),
    participationBalance: participationBalance(activity),
    trustCoverage: calculateTrustCoverage(trustGraph),
    trustConcentration: calculateTrustConcentration(trustGraph),
    suspicionCoverage: calculateSuspicionCoverage(state, context.suspicionGraph),
    theoryShiftRate: calculateTheoryShiftRate(state, context),
    averageTheoryChanges: calculateAverageTheoryChanges(state, context),
    liarConfidence: calculateLiarConfidence(state, truth, context.suspicionGraph),
    playerActivity: activity,
    tableMetrics: calculateTableMetrics(state, context),
    ...(context.missionOutcomes ? { missionOutcomes: calculateMissionOutcomeMetrics(context.missionOutcomes) } : {}),
  }
}

export function profileParticipationScore(player: BrainPlayer): number { return participationScore[player.participationLevel] }
