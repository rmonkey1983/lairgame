import type { GamePhase } from './brain.types'

export type SuspicionConfidence = 'LOW' | 'MEDIUM' | 'HIGH'

export type SuspicionSelection = {
  sourcePlayerId: string
  targetPlayerId: string
  phase: GamePhase
  confidence?: SuspicionConfidence
}

export type SuspicionEdge = {
  sourcePlayerId: string
  targetPlayerId: string
  type: 'SUSPICION'
  phase: GamePhase
  confidence: SuspicionConfidence
  active: true
}

export type SuspicionHistoryEntry = SuspicionEdge & { sequence: number }

export type SuspicionGraph = {
  playerIds: string[]
  edges: SuspicionEdge[]
  history: SuspicionHistoryEntry[]
}

export type SuspicionChangeType = 'TARGET_CHANGED' | 'CONFIDENCE_CHANGED' | 'NO_CHANGE'

export type SuspicionDistribution = {
  playerId: string
  suspectedByCount: number
}

export type MostSuspectedPlayer = SuspicionDistribution & {
  averageConfidence: number | null
}

export type SuspicionValidationResult = { valid: boolean; violations: string[] }

export const SUSPICION_CONFIDENCE_RANK: Record<SuspicionConfidence, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
}

const allowedSuspicionPhases: GamePhase[] = ['INVESTIGATION', 'DOUBT', 'FINAL_THEORY']
const confidenceLevels: SuspicionConfidence[] = ['LOW', 'MEDIUM', 'HIGH']

function cloneGraph(graph: SuspicionGraph): SuspicionGraph {
  return {
    playerIds: [...graph.playerIds],
    edges: graph.edges.map((edge) => ({ ...edge })),
    history: graph.history.map((entry) => ({ ...entry })),
  }
}

export function createSuspicionGraph(playerIds: string[]): SuspicionGraph {
  return { playerIds: [...new Set(playerIds)].sort(), edges: [], history: [] }
}

export function validateSuspicionSelection(graph: SuspicionGraph, selection: SuspicionSelection): SuspicionValidationResult {
  const violations: string[] = []
  const players = new Set(graph.playerIds)
  if (!selection.sourcePlayerId || !players.has(selection.sourcePlayerId)) violations.push('SOURCE_PLAYER_INVALID')
  if (!selection.targetPlayerId || !players.has(selection.targetPlayerId)) violations.push('TARGET_PLAYER_INVALID')
  if (selection.sourcePlayerId === selection.targetPlayerId) violations.push('SELF_SUSPICION_FORBIDDEN')
  if (!allowedSuspicionPhases.includes(selection.phase)) violations.push('SUSPICION_PHASE_NOT_ALLOWED')
  if (selection.confidence !== undefined && !confidenceLevels.includes(selection.confidence)) violations.push('SUSPICION_CONFIDENCE_INVALID')
  return { valid: violations.length === 0, violations }
}

export function validateSuspicionGraph(graph: SuspicionGraph): SuspicionValidationResult {
  const violations: string[] = []
  const players = new Set(graph.playerIds)
  const activeSources = new Set<string>()
  if (players.size !== graph.playerIds.length) violations.push('PLAYER_IDS_DUPLICATED')
  for (const edge of graph.edges) {
    if (edge.type !== 'SUSPICION' || edge.active !== true || !players.has(edge.sourcePlayerId) || !players.has(edge.targetPlayerId)) violations.push('EDGE_MALFORMED')
    if (edge.sourcePlayerId === edge.targetPlayerId) violations.push('SELF_SUSPICION_FORBIDDEN')
    if (!allowedSuspicionPhases.includes(edge.phase) || !confidenceLevels.includes(edge.confidence)) violations.push('EDGE_VALUE_INVALID')
    if (activeSources.has(edge.sourcePlayerId)) violations.push('MULTIPLE_PRIMARY_SUSPICIONS')
    activeSources.add(edge.sourcePlayerId)
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] }
}

export function getCurrentSuspicion(graph: SuspicionGraph, sourcePlayerId: string): SuspicionEdge | null {
  return graph.edges.find((edge) => edge.active && edge.sourcePlayerId === sourcePlayerId) ?? null
}

export function getSuspicionHistory(graph: SuspicionGraph, sourcePlayerId?: string): SuspicionHistoryEntry[] {
  return graph.history
    .filter((entry) => sourcePlayerId === undefined || entry.sourcePlayerId === sourcePlayerId)
    .sort((first, second) => first.sequence - second.sequence)
    .map((entry) => ({ ...entry }))
}

export function getSuspicionChangeType(graph: SuspicionGraph, selection: SuspicionSelection): SuspicionChangeType {
  const current = getCurrentSuspicion(graph, selection.sourcePlayerId)
  if (!current || current.targetPlayerId !== selection.targetPlayerId) return current ? 'TARGET_CHANGED' : 'TARGET_CHANGED'
  return current.confidence === (selection.confidence ?? 'MEDIUM') ? 'NO_CHANGE' : 'CONFIDENCE_CHANGED'
}

export function setSuspicion(graph: SuspicionGraph, selection: SuspicionSelection): SuspicionGraph {
  const validation = validateSuspicionSelection(graph, selection)
  if (!validation.valid) throw new RangeError(validation.violations.join(', '))
  const confidence = selection.confidence ?? 'MEDIUM'
  const changeType = getSuspicionChangeType(graph, selection)
  if (changeType === 'NO_CHANGE') return cloneGraph(graph)
  const next = cloneGraph(graph)
  const nextEdge: SuspicionEdge = {
    sourcePlayerId: selection.sourcePlayerId,
    targetPlayerId: selection.targetPlayerId,
    type: 'SUSPICION',
    phase: selection.phase,
    confidence,
    active: true,
  }
  next.edges = next.edges.filter((edge) => edge.sourcePlayerId !== selection.sourcePlayerId)
  next.edges.push(nextEdge)
  next.edges.sort((first, second) => first.sourcePlayerId.localeCompare(second.sourcePlayerId))
  next.history.push({ ...nextEdge, sequence: next.history.length + 1 })
  return next
}

export function getPlayersSuspecting(graph: SuspicionGraph, targetPlayerId: string): string[] {
  return graph.edges
    .filter((edge) => edge.active && edge.targetPlayerId === targetPlayerId)
    .sort((first, second) => SUSPICION_CONFIDENCE_RANK[second.confidence] - SUSPICION_CONFIDENCE_RANK[first.confidence] || first.sourcePlayerId.localeCompare(second.sourcePlayerId))
    .map((edge) => edge.sourcePlayerId)
}

export function getSuspicionDistribution(graph: SuspicionGraph): SuspicionDistribution[] {
  const counts = new Map<string, number>()
  for (const edge of graph.edges.filter((candidate) => candidate.active)) counts.set(edge.targetPlayerId, (counts.get(edge.targetPlayerId) ?? 0) + 1)
  return [...counts.entries()]
    .map(([playerId, suspectedByCount]) => ({ playerId, suspectedByCount }))
    .sort((first, second) => second.suspectedByCount - first.suspectedByCount || first.playerId.localeCompare(second.playerId))
}

export function getMostSuspectedPlayers(graph: SuspicionGraph): MostSuspectedPlayer[] {
  return getSuspicionDistribution(graph).map((distribution) => {
    const incoming = graph.edges.filter((edge) => edge.active && edge.targetPlayerId === distribution.playerId)
    return {
      ...distribution,
      averageConfidence: incoming.length === 0 ? null : Number((incoming.reduce((sum, edge) => sum + SUSPICION_CONFIDENCE_RANK[edge.confidence], 0) / incoming.length).toFixed(6)),
    }
  }).sort((first, second) => second.suspectedByCount - first.suspectedByCount || (second.averageConfidence ?? 0) - (first.averageConfidence ?? 0) || first.playerId.localeCompare(second.playerId))
}

export function hasSuspicionChanged(graph: SuspicionGraph, sourcePlayerId: string): boolean {
  return countSuspicionChanges(graph, sourcePlayerId) > 0
}

export function countSuspicionChanges(graph: SuspicionGraph, sourcePlayerId: string): number {
  const history = getSuspicionHistory(graph, sourcePlayerId)
  let changes = 0
  for (let index = 1; index < history.length; index += 1) {
    if (history[index - 1].targetPlayerId !== history[index].targetPlayerId || history[index - 1].confidence !== history[index].confidence) changes += 1
  }
  return changes
}
