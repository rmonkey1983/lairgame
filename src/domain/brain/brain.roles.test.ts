import { describe, expect, it } from 'vitest'
import { assignRoles, scorePlayerForRole, scoreRoleCombination, validateRoleAssignmentInput } from './brain.roles'
import { derivePlayerGameProfile } from './brain.profile'
import type { MatchedTable } from './brain.matching'
import type { PlayerGameProfile } from './brain.types'

function player(playerId: string, groupBehavior: 'breaks_ice' | 'warms_up' | 'observes_first', exposure: 'low' | 'medium' | 'high' = 'medium', participation: 'low' | 'medium' | 'high' = 'medium', arrivedWithPlayerIds: string[] = []): PlayerGameProfile {
  return derivePlayerGameProfile({ playerId, groupBehavior, publicExposureComfort: exposure, participationComfort: participation, arrivedWithPlayerIds })
}

function table(tableId: string, playerIds: string[]): MatchedTable {
  return { tableId, playerIds, score: 1, metrics: { socialBalance: 1, participationBalance: 1, existingGroupBalance: 1 }, warnings: [] }
}

const players = [
  player('p1', 'warms_up', 'high', 'high'),
  player('p2', 'breaks_ice', 'medium', 'high'),
  player('p3', 'observes_first', 'medium', 'medium'),
  player('p4', 'warms_up', 'medium', 'medium'),
]
const tables = [table('table-1', ['p1', 'p3']), table('table-2', ['p2', 'p4'])]
const input = { players, tables, config: { liarCount: 1, accompliceCount: 1, scapegoatCount: 1 } }

describe('Role Assignment Engine v0.4', () => {
  it('is deterministic and assigns every role exactly as configured', () => {
    const first = assignRoles(input)
    expect(assignRoles(input)).toEqual(first)
    expect(first.assignments.filter((assignment) => assignment.role === 'LIAR')).toHaveLength(1)
    expect(first.assignments.filter((assignment) => assignment.role === 'ACCOMPLICE')).toHaveLength(1)
    expect(first.assignments.filter((assignment) => assignment.role === 'SCAPEGOAT')).toHaveLength(1)
    expect(first.assignments.filter((assignment) => assignment.role === 'INVESTIGATOR')).toHaveLength(1)
  })

  it('allows an observer with sufficient exposure and participation to be liar-compatible', () => {
    expect(scorePlayerForRole(player('observer', 'observes_first', 'medium', 'medium'), 'LIAR').score).toBeGreaterThan(0)
  })

  it('does not force low exposure into liar or scapegoat', () => {
    const low = player('low', 'warms_up', 'low', 'low')
    expect(scorePlayerForRole(low, 'LIAR').score).toBeLessThan(scorePlayerForRole(players[0], 'LIAR').score)
    expect(scorePlayerForRole(low, 'SCAPEGOAT').score).toBe(0)
    const result = assignRoles({ players: [low, player('low2', 'warms_up', 'low', 'low'), player('low3', 'observes_first', 'low', 'low')], tables: [table('t', ['low', 'low2', 'low3'])], config: input.config })
    expect(result.status).toBe('INVALID')
  })

  it('prefers liar and accomplice on different tables', () => {
    const result = assignRoles(input)
    const liar = result.assignments.find((assignment) => assignment.role === 'LIAR')?.playerId
    const accomplice = result.assignments.find((assignment) => assignment.role === 'ACCOMPLICE')?.playerId
    expect(tables.find((candidate) => candidate.playerIds.includes(liar ?? ''))?.tableId).not.toBe(tables.find((candidate) => candidate.playerIds.includes(accomplice ?? ''))?.tableId)
  })

  it('penalizes a liar and accomplice that share an existing group', () => {
    const groupedPlayers = [player('a', 'warms_up', 'high', 'high', ['b']), player('b', 'breaks_ice', 'medium', 'high', ['a']), player('c', 'warms_up', 'medium', 'medium')]
    const grouped = [
      { playerId: 'a', role: 'LIAR' as const, compatibilityScore: scorePlayerForRole(groupedPlayers[0], 'LIAR').score },
      { playerId: 'b', role: 'ACCOMPLICE' as const, compatibilityScore: scorePlayerForRole(groupedPlayers[1], 'ACCOMPLICE').score },
    ]
    const independent = [
      { playerId: 'a', role: 'LIAR' as const, compatibilityScore: scorePlayerForRole(groupedPlayers[0], 'LIAR').score },
      { playerId: 'c', role: 'ACCOMPLICE' as const, compatibilityScore: scorePlayerForRole(groupedPlayers[2], 'ACCOMPLICE').score },
    ]
    const groupedScore = scoreRoleCombination(grouped, { players: groupedPlayers, tables: [table('t', ['a', 'b', 'c'])], config: input.config })
    const independentScore = scoreRoleCombination(independent, { players: groupedPlayers, tables: [table('t', ['a', 'b', 'c'])], config: input.config })
    expect(groupedScore).toBeLessThan(independentScore)
  })

  it('rejects duplicate or lost players and impossible role configuration', () => {
    expect(validateRoleAssignmentInput({ ...input, players: [players[0], players[0]], tables: [table('t', ['p1'])] }).valid).toBe(false)
    expect(validateRoleAssignmentInput({ ...input, tables: [table('t', ['p1', 'p2', 'p3'])] }).valid).toBe(false)
    expect(validateRoleAssignmentInput({ ...input, config: { liarCount: 3, accompliceCount: 2, scapegoatCount: 1 } }).valid).toBe(false)
  })

  it('keeps compatibility and assignment scores normalized', () => {
    const result = assignRoles(input)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
    expect(result.assignments.every((assignment) => assignment.compatibilityScore >= 0 && assignment.compatibilityScore <= 1)).toBe(true)
  })

  it('does not use random selection', () => {
    expect(assignRoles.toString()).not.toContain('Math.random')
  })
})
