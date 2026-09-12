import type { GamePhase } from './brain.types'

export type TrustLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export type TrustSelection = {
  sourcePlayerId: string
  targetPlayerId: string
  phase: GamePhase
  level?: TrustLevel
}

export type TrustEdge = {
  sourcePlayerId: string
  targetPlayerId: string
  type: 'TRUST'
  phase: GamePhase
  level: TrustLevel
  strength: number
  active: true
}

export type TrustHistoryEntry = TrustEdge & { sequence: number }

export type TrustGraph = {
  playerIds: string[]
  edges: TrustEdge[]
  history: TrustHistoryEntry[]
}

export type TrustValidationResult = { valid: boolean; violations: string[] }

export type TrustOpportunity = {
  playerId: string
  trustedByCount: number
  averageTrustStrength: number | null
}

export const TRUST_LEVEL_STRENGTH: Record<TrustLevel, number> = {
  LOW: 1 / 3,
  MEDIUM: 2 / 3,
  HIGH: 1,
}

const allowedTrustPhases: GamePhase[] = ['TRUST', 'INVESTIGATION', 'DOUBT']
const trustLevels: TrustLevel[] = ['LOW', 'MEDIUM', 'HIGH']

function cloneGraph(graph: TrustGraph): TrustGraph {
  return {
    playerIds: [...graph.playerIds],
    edges: graph.edges.map((edge) => ({ ...edge })),
    history: graph.history.map((entry) => ({ ...entry })),
  }
}

function edgeKey(sourcePlayerId: string, targetPlayerId: string): string {
  return `${sourcePlayerId}\u0000${targetPlayerId}`
}

export function createTrustGraph(playerIds: string[]): TrustGraph {
  return { playerIds: [...new Set(playerIds)].sort(), edges: [], history: [] }
}

export function validateTrustSelection(graph: TrustGraph, selection: TrustSelection): TrustValidationResult {
  const violations: string[] = []
  const players = new Set(graph.playerIds)
  if (!selection.sourcePlayerId || !players.has(selection.sourcePlayerId)) violations.push('SOURCE_PLAYER_INVALID')
  if (!selection.targetPlayerId || !players.has(selection.targetPlayerId)) violations.push('TARGET_PLAYER_INVALID')
  if (selection.sourcePlayerId === selection.targetPlayerId) violations.push('SELF_TRUST_FORBIDDEN')
  if (!allowedTrustPhases.includes(selection.phase)) violations.push('TRUST_PHASE_NOT_ALLOWED')
  if (selection.level !== undefined && !trustLevels.includes(selection.level)) violations.push('TRUST_LEVEL_INVALID')
  return { valid: violations.length === 0, violations }
}

export function validateTrustGraph(graph: TrustGraph): TrustValidationResult {
  const violations: string[] = []
  const players = new Set(graph.playerIds)
  if (players.size !== graph.playerIds.length) violations.push('PLAYER_IDS_DUPLICATED')
  const activeKeys = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.type !== 'TRUST' || edge.active !== true || !players.has(edge.sourcePlayerId) || !players.has(edge.targetPlayerId)) violations.push('EDGE_MALFORMED')
    if (edge.sourcePlayerId === edge.targetPlayerId) violations.push('SELF_TRUST_FORBIDDEN')
    if (!allowedTrustPhases.includes(edge.phase) || !trustLevels.includes(edge.level)) violations.push('EDGE_VALUE_INVALID')
    const key = edgeKey(edge.sourcePlayerId, edge.targetPlayerId)
    if (activeKeys.has(key)) violations.push('DUPLICATE_ACTIVE_TRUST_EDGE')
    activeKeys.add(key)
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] }
}

export function setTrust(graph: TrustGraph, selection: TrustSelection): TrustGraph {
  const validation = validateTrustSelection(graph, selection)
  if (!validation.valid) throw new RangeError(validation.violations.join(', '))
  const next = cloneGraph(graph)
  const level = selection.level ?? 'MEDIUM'
  const nextEdge: TrustEdge = {
    sourcePlayerId: selection.sourcePlayerId,
    targetPlayerId: selection.targetPlayerId,
    type: 'TRUST',
    phase: selection.phase,
    level,
    strength: TRUST_LEVEL_STRENGTH[level],
    active: true,
  }
  next.edges = next.edges.filter((edge) => edgeKey(edge.sourcePlayerId, edge.targetPlayerId) !== edgeKey(selection.sourcePlayerId, selection.targetPlayerId))
  next.edges.push(nextEdge)
  next.edges.sort((first, second) => edgeKey(first.sourcePlayerId, first.targetPlayerId).localeCompare(edgeKey(second.sourcePlayerId, second.targetPlayerId)))
  next.history.push({ ...nextEdge, sequence: next.history.length + 1 })
  return next
}

export function getTrust(graph: TrustGraph, sourcePlayerId: string, targetPlayerId: string): TrustEdge | null {
  return graph.edges.find((edge) => edge.sourcePlayerId === sourcePlayerId && edge.targetPlayerId === targetPlayerId && edge.active) ?? null
}

export function getTrustedPlayers(graph: TrustGraph, sourcePlayerId: string): string[] {
  return graph.edges
    .filter((edge) => edge.active && edge.sourcePlayerId === sourcePlayerId)
    .sort((first, second) => second.strength - first.strength || first.targetPlayerId.localeCompare(second.targetPlayerId))
    .map((edge) => edge.targetPlayerId)
}

export function getPlayersTrusting(graph: TrustGraph, targetPlayerId: string): string[] {
  return graph.edges
    .filter((edge) => edge.active && edge.targetPlayerId === targetPlayerId)
    .sort((first, second) => second.strength - first.strength || first.sourcePlayerId.localeCompare(second.sourcePlayerId))
    .map((edge) => edge.sourcePlayerId)
}

export function getMutualTrust(graph: TrustGraph, firstPlayerId: string, secondPlayerId: string): boolean {
  return getTrust(graph, firstPlayerId, secondPlayerId) !== null && getTrust(graph, secondPlayerId, firstPlayerId) !== null
}

export function hasTrustChanged(graph: TrustGraph, sourcePlayerId: string, targetPlayerId: string): boolean {
  const history = graph.history.filter((entry) => entry.sourcePlayerId === sourcePlayerId && entry.targetPlayerId === targetPlayerId)
  return new Set(history.map((entry) => entry.level)).size > 1
}

export function calculateTrustConcentration(graph: TrustGraph): number | null {
  if (graph.playerIds.length < 2 || graph.edges.length === 0) return null
  const counts = new Map<string, number>()
  for (const edge of graph.edges.filter((candidate) => candidate.active)) counts.set(edge.targetPlayerId, (counts.get(edge.targetPlayerId) ?? 0) + 1)
  if (counts.size === 0) return null
  if (counts.size === 1) return 1
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  const largestShare = Math.max(...counts.values()) / total
  return Number(((largestShare - 1 / counts.size) / (1 - 1 / counts.size)).toFixed(6))
}

export function calculateTrustCoverage(graph: TrustGraph): number | null {
  if (graph.playerIds.length === 0) return null
  const sources = new Set(graph.edges.filter((edge) => edge.active).map((edge) => edge.sourcePlayerId))
  return Number((sources.size / graph.playerIds.length).toFixed(6))
}

export function getTrustOpportunities(graph: TrustGraph): TrustOpportunity[] {
  return graph.playerIds
    .map((playerId) => {
      const incoming = graph.edges.filter((edge) => edge.active && edge.targetPlayerId === playerId)
      return {
        playerId,
        trustedByCount: incoming.length,
        averageTrustStrength: incoming.length === 0 ? null : Number((incoming.reduce((sum, edge) => sum + edge.strength, 0) / incoming.length).toFixed(6)),
      }
    })
    .filter((opportunity) => opportunity.trustedByCount > 0)
    .sort((first, second) => second.trustedByCount - first.trustedByCount || (second.averageTrustStrength ?? 0) - (first.averageTrustStrength ?? 0) || first.playerId.localeCompare(second.playerId))
}
