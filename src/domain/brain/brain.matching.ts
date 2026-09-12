import type { ParticipationLevel, PlayerGameProfile, SocialStyle } from './brain.types'

export type MatchingWarningType =
  | 'TABLE_TOO_OBSERVER_HEAVY'
  | 'TABLE_TOO_EXPRESSIVE_HEAVY'
  | 'TABLE_LOW_PARTICIPATION'
  | 'TABLE_HIGH_PARTICIPATION'
  | 'EXISTING_GROUP_CONCENTRATION'
  | 'CAPACITY_IMPOSSIBLE'
  | 'UNBALANCED_TABLE_SIZE'

export type MatchingWarning = {
  type: MatchingWarningType
  message: string
  tableId?: string
}

export type TableMatchingInput = {
  players: PlayerGameProfile[]
  tableCount: number
  minPlayersPerTable: number
  maxPlayersPerTable: number
}

export type MatchedTableMetrics = {
  socialBalance: number
  participationBalance: number
  existingGroupBalance: number
}

export type MatchedTable = {
  tableId: string
  playerIds: string[]
  score: number
  metrics: MatchedTableMetrics
  warnings: MatchingWarning[]
}

export type MatchingResultStatus = 'VALID' | 'WARNING' | 'INVALID'

export type TableMatchingResult = {
  status: MatchingResultStatus
  tables: MatchedTable[]
  overallScore: number
  warnings: MatchingWarning[]
  error?: string
}

export const TABLE_MATCHING_WEIGHTS = {
  socialBalance: 0.4,
  participationBalance: 0.35,
  existingGroupBalance: 0.25,
} as const

const socialStyles: SocialStyle[] = ['observer', 'balanced', 'expressive']
const participationLevels: ParticipationLevel[] = ['low', 'medium', 'high']

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function roundScore(value: number): number {
  return Number(clamp(value).toFixed(6))
}

function invalidInput(input: TableMatchingInput): string[] {
  const violations: string[] = []
  if (!Number.isInteger(input.tableCount) || input.tableCount < 1) violations.push('TABLE_COUNT_INVALID')
  if (!Number.isInteger(input.minPlayersPerTable) || input.minPlayersPerTable < 0) violations.push('MIN_CAPACITY_INVALID')
  if (!Number.isInteger(input.maxPlayersPerTable) || input.maxPlayersPerTable < 0) violations.push('MAX_CAPACITY_INVALID')
  if (input.minPlayersPerTable > input.maxPlayersPerTable) violations.push('CAPACITY_RANGE_INVALID')
  if (input.players.length < input.tableCount * input.minPlayersPerTable || input.players.length > input.tableCount * input.maxPlayersPerTable) violations.push('CAPACITY_IMPOSSIBLE')

  const ids = input.players.map((player) => player.playerId)
  if (new Set(ids).size !== ids.length) violations.push('PLAYER_IDS_DUPLICATED')
  if (input.players.some((player) => !player.playerId.trim())) violations.push('PLAYER_ID_REQUIRED')
  return violations
}

export function validateTableMatchingInput(input: TableMatchingInput): { valid: boolean; violations: string[] } {
  const violations = invalidInput(input)
  return { valid: violations.length === 0, violations }
}

function connectedGroups(players: PlayerGameProfile[]): string[][] {
  const knownIds = new Set(players.map((player) => player.playerId))
  const links = new Map<string, Set<string>>()
  for (const player of players) links.set(player.playerId, new Set())
  for (const player of players) {
    for (const arrivedId of player.arrivedWithPlayerIds) {
      if (!knownIds.has(arrivedId)) continue
      links.get(player.playerId)?.add(arrivedId)
      links.get(arrivedId)?.add(player.playerId)
    }
  }

  const visited = new Set<string>()
  const groups: string[][] = []
  for (const player of [...players].sort((a, b) => a.playerId.localeCompare(b.playerId))) {
    if (visited.has(player.playerId)) continue
    const group: string[] = []
    const pending = [player.playerId]
    visited.add(player.playerId)
    while (pending.length > 0) {
      const playerId = pending.shift() as string
      group.push(playerId)
      for (const linkedId of [...(links.get(playerId) ?? [])].sort()) {
        if (!visited.has(linkedId)) {
          visited.add(linkedId)
          pending.push(linkedId)
        }
      }
    }
    groups.push(group.sort())
  }
  return groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

function tableGroupConcentration(playerIds: string[], groups: string[][]): number {
  if (playerIds.length === 0 || groups.length === 0) return 0
  const assigned = new Set(playerIds)
  return groups
    .filter((group) => group.length > 2)
    .reduce((largest, group) => Math.max(largest, group.filter((id) => assigned.has(id)).length), 0) / playerIds.length
}

function countBy<T extends string>(values: T[]): Map<T, number> {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

function scoreSocialBalance(players: PlayerGameProfile[]): number {
  if (players.length === 0) return 0
  const counts = countBy(players.map((player) => player.socialStyle))
  const variety = counts.size / socialStyles.length
  const concentration = Math.max(...counts.values()) / players.length
  return roundScore((variety + (1 - Math.max(0, concentration - 1 / socialStyles.length) * 1.5)) / 2)
}

function scoreParticipationBalance(players: PlayerGameProfile[]): number {
  if (players.length === 0) return 0
  const values = players.map((player) => participationLevels.indexOf(player.participationLevel))
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const range = (Math.max(...values) - Math.min(...values)) / (participationLevels.length - 1)
  return roundScore(1 - Math.abs(average - 1) * 0.5 - range * 0.25)
}

function scoreExistingGroupBalance(playerIds: string[], groups: string[][]): number {
  if (playerIds.length === 0 || groups.length === 0) return 1
  const concentration = tableGroupConcentration(playerIds, groups)
  const assigned = new Set(playerIds)
  const splitPairs = groups.filter((group) => group.length === 2 && group.some((id) => assigned.has(id)) && !group.every((id) => assigned.has(id))).length
  return roundScore(1 - Math.max(0, concentration - 0.5) * 2 - splitPairs * 0.5)
}

function warningsForTable(table: { tableId: string; playerIds: string[] }, playersById: Map<string, PlayerGameProfile>, groups: string[][]): MatchingWarning[] {
  const players = table.playerIds.map((id) => playersById.get(id) as PlayerGameProfile)
  const warnings: MatchingWarning[] = []
  const social = countBy(players.map((player) => player.socialStyle))
  const participation = countBy(players.map((player) => player.participationLevel))
  const size = players.length

  if ((social.get('observer') ?? 0) / size >= 0.75) warnings.push({ type: 'TABLE_TOO_OBSERVER_HEAVY', message: 'Il tavolo concentra troppi profili observer.', tableId: table.tableId })
  if ((social.get('expressive') ?? 0) / size >= 0.75) warnings.push({ type: 'TABLE_TOO_EXPRESSIVE_HEAVY', message: 'Il tavolo concentra troppi profili expressive.', tableId: table.tableId })
  if ((participation.get('low') ?? 0) / size >= 0.75) warnings.push({ type: 'TABLE_LOW_PARTICIPATION', message: 'Il tavolo ha una partecipazione prevalentemente low.', tableId: table.tableId })
  if ((participation.get('high') ?? 0) / size >= 0.75) warnings.push({ type: 'TABLE_HIGH_PARTICIPATION', message: 'Il tavolo ha una partecipazione prevalentemente high.', tableId: table.tableId })
  if (tableGroupConcentration(table.playerIds, groups) >= 0.5 && table.playerIds.length > 2) warnings.push({ type: 'EXISTING_GROUP_CONCENTRATION', message: 'Un gruppo già esistente occupa una parte significativa del tavolo.', tableId: table.tableId })
  return warnings
}

function scoreTable(table: { tableId: string; playerIds: string[] }, playersById: Map<string, PlayerGameProfile>, groups: string[][]): MatchedTable {
  const players = table.playerIds.map((id) => playersById.get(id) as PlayerGameProfile)
  const metrics = {
    socialBalance: scoreSocialBalance(players),
    participationBalance: scoreParticipationBalance(players),
    existingGroupBalance: scoreExistingGroupBalance(table.playerIds, groups),
  }
  const warnings = warningsForTable(table, playersById, groups)
  const score = roundScore(
    metrics.socialBalance * TABLE_MATCHING_WEIGHTS.socialBalance
    + metrics.participationBalance * TABLE_MATCHING_WEIGHTS.participationBalance
    + metrics.existingGroupBalance * TABLE_MATCHING_WEIGHTS.existingGroupBalance,
  )
  return { ...table, score, metrics, warnings }
}

function resultForTables(tables: { tableId: string; playerIds: string[] }[], input: TableMatchingInput, groups: string[][]): TableMatchingResult {
  const playersById = new Map(input.players.map((player) => [player.playerId, player]))
  const scoredTables = tables.map((table) => scoreTable(table, playersById, groups))
  const warnings = scoredTables.flatMap((table) => table.warnings)
  const sizes = scoredTables.map((table) => table.playerIds.length)
  if (Math.max(...sizes) - Math.min(...sizes) > 1) warnings.push({ type: 'UNBALANCED_TABLE_SIZE', message: 'La dimensione dei tavoli non è distribuita in modo uniforme.' })
  const overallScore = roundScore(scoredTables.reduce((sum, table) => sum + table.score, 0) / scoredTables.length)
  return { status: warnings.length > 0 ? 'WARNING' : 'VALID', tables: scoredTables, overallScore, warnings }
}

export function buildInitialTables(input: TableMatchingInput): { tableId: string; playerIds: string[] }[] {
  const tables = Array.from({ length: input.tableCount }, (_, index) => ({ tableId: `table-${index + 1}`, playerIds: [] as string[] }))
  const playersById = new Map(input.players.map((player) => [player.playerId, player]))
  const units = connectedGroups(input.players)
    .flatMap((group) => group.length === 2 ? [group] : group.map((playerId) => [playerId]))
    .sort((first, second) => first[0].localeCompare(second[0]))
  const baseSize = Math.floor(input.players.length / input.tableCount)
  const extraPlayers = input.players.length % input.tableCount
  const targetSizes = tables.map((_, index) => baseSize + (index < extraPlayers ? 1 : 0))
  for (const unit of units) {
    const target = tables
      .filter((table, index) => table.playerIds.length + unit.length <= targetSizes[index])
      .sort((first, second) => first.playerIds.length - second.playerIds.length || first.tableId.localeCompare(second.tableId))[0]
    if (target) target.playerIds.push(...unit)
    else {
      for (const playerId of unit) {
        const fallback = tables
          .filter((table) => table.playerIds.length < input.maxPlayersPerTable)
          .sort((first, second) => first.playerIds.length - second.playerIds.length || first.tableId.localeCompare(second.tableId))[0]
        if (fallback) fallback.playerIds.push(playerId)
      }
    }
  }
  // Keep the helper defensive if a future group parser ever returns an unknown id.
  for (const table of tables) table.playerIds = table.playerIds.filter((playerId) => playersById.has(playerId))
  return tables
}

export function optimizeTableMatching(initialTables: { tableId: string; playerIds: string[] }[], input: TableMatchingInput, groups = connectedGroups(input.players)): { tableId: string; playerIds: string[] }[] {
  let current = initialTables.map((table) => ({ tableId: table.tableId, playerIds: [...table.playerIds] }))
  let currentScore = resultForTables(current, input, groups).overallScore
  let improved = true

  while (improved) {
    improved = false
    for (let first = 0; first < current.length && !improved; first += 1) {
      for (let second = first + 1; second < current.length && !improved; second += 1) {
        for (const firstId of [...current[first].playerIds]) {
          for (const secondId of [...current[second].playerIds]) {
            const candidate = current.map((table) => ({ tableId: table.tableId, playerIds: [...table.playerIds] }))
            candidate[first].playerIds[candidate[first].playerIds.indexOf(firstId)] = secondId
            candidate[second].playerIds[candidate[second].playerIds.indexOf(secondId)] = firstId
            const candidateScore = resultForTables(candidate, input, groups).overallScore
            if (candidateScore > currentScore) {
              current = candidate
              currentScore = candidateScore
              improved = true
              break
            }
          }
          if (improved) break
        }
      }
    }
  }
  return current.map((table) => ({ tableId: table.tableId, playerIds: [...table.playerIds].sort((a, b) => a.localeCompare(b)) }))
}

export function matchPlayersToTables(input: TableMatchingInput): TableMatchingResult {
  const validation = validateTableMatchingInput(input)
  if (!validation.valid) {
    const warnings: MatchingWarning[] = validation.violations.map((violation) => ({ type: 'CAPACITY_IMPOSSIBLE', message: violation }))
    return { status: 'INVALID', tables: [], overallScore: 0, warnings, error: validation.violations.join(', ') }
  }

  const groups = connectedGroups(input.players)
  const optimized = optimizeTableMatching(buildInitialTables(input), input, groups)
  return resultForTables(optimized, input, groups)
}
