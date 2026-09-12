import { describe, expect, it } from 'vitest'
import { buildInitialTables, matchPlayersToTables, validateTableMatchingInput } from './brain.matching'
import { derivePlayerGameProfile } from './brain.profile'
import type { PlayerGameProfile } from './brain.types'

function player(playerId: string, groupBehavior: 'breaks_ice' | 'warms_up' | 'observes_first', participationComfort: 'low' | 'medium' | 'high' = 'medium', arrivedWithPlayerIds: string[] = []): PlayerGameProfile {
  return derivePlayerGameProfile({ playerId, groupBehavior, participationComfort, publicExposureComfort: 'medium', preferredGameStyle: 'mixed', arrivedWithPlayerIds })
}

const players: PlayerGameProfile[] = [
  player('p1', 'observes_first'), player('p2', 'observes_first'), player('p3', 'observes_first'),
  player('p4', 'breaks_ice'), player('p5', 'breaks_ice'), player('p6', 'breaks_ice'),
  player('p7', 'warms_up'), player('p8', 'warms_up'), player('p9', 'warms_up'),
]

describe('Table Matching Engine v0.3', () => {
  it('is deterministic and respects capacity', () => {
    const input = { players, tableCount: 3, minPlayersPerTable: 2, maxPlayersPerTable: 4 }
    const first = matchPlayersToTables(input)
    expect(matchPlayersToTables(input)).toEqual(first)
    expect(first.tables.every((table) => table.playerIds.length >= 2 && table.playerIds.length <= 4)).toBe(true)
  })

  it('distributes observer and expressive profiles instead of concentrating them', () => {
    const result = matchPlayersToTables({ players, tableCount: 3, minPlayersPerTable: 2, maxPlayersPerTable: 4 })
    for (const table of result.tables) {
      const tablePlayers = table.playerIds.map((id) => players.find((candidate) => candidate.playerId === id) as PlayerGameProfile)
      expect(tablePlayers.filter((candidate) => candidate.socialStyle === 'observer').length).toBeLessThan(3)
      expect(tablePlayers.filter((candidate) => candidate.socialStyle === 'expressive').length).toBeLessThan(3)
    }
  })

  it('uses balanced profiles as stabilizers and evaluates participation composition', () => {
    const mixed = [...players, player('p10', 'warms_up', 'low'), player('p11', 'warms_up', 'high')]
    const result = matchPlayersToTables({ players: mixed, tableCount: 3, minPlayersPerTable: 3, maxPlayersPerTable: 4 })
    expect(result.tables.every((table) => table.metrics.participationBalance >= 0 && table.metrics.participationBalance <= 1)).toBe(true)
    expect(result.tables.some((table) => table.playerIds.some((id) => id === 'p7' || id === 'p8' || id === 'p9'))).toBe(true)
  })

  it('distributes a large existing group when possible but allows a pair together', () => {
    const grouped = [
      player('a1', 'warms_up', 'medium', ['a2']), player('a2', 'warms_up', 'medium', ['a1', 'a3']),
      player('a3', 'warms_up', 'medium', ['a2', 'a4']), player('a4', 'warms_up', 'medium', ['a3']),
      player('b1', 'breaks_ice'), player('b2', 'observes_first'), player('b3', 'warms_up'), player('b4', 'breaks_ice'),
    ]
    const result = matchPlayersToTables({ players: grouped, tableCount: 2, minPlayersPerTable: 4, maxPlayersPerTable: 4 })
    expect(result.tables.every((table) => table.playerIds.filter((id) => id.startsWith('a')).length < 4)).toBe(true)

    const pairResult = matchPlayersToTables({ players: [player('x1', 'warms_up', 'medium', ['x2']), player('x2', 'warms_up', 'medium', ['x1']), player('x3', 'observes_first'), player('x4', 'breaks_ice')], tableCount: 2, minPlayersPerTable: 2, maxPlayersPerTable: 2 })
    expect(pairResult.tables.some((table) => table.playerIds.includes('x1') && table.playerIds.includes('x2'))).toBe(true)
  })

  it('reports impossible capacity without inventing valid-looking tables', () => {
    const result = matchPlayersToTables({ players, tableCount: 4, minPlayersPerTable: 3, maxPlayersPerTable: 3 })
    expect(result.status).toBe('INVALID')
    expect(result.error).toContain('CAPACITY_IMPOSSIBLE')
    expect(result.tables).toEqual([])
    expect(validateTableMatchingInput({ players, tableCount: 4, minPlayersPerTable: 3, maxPlayersPerTable: 3 }).valid).toBe(false)
  })

  it('emits composition warnings and keeps scores normalized', () => {
    const lowObservers = Array.from({ length: 4 }, (_, index) => player(`o${index}`, 'observes_first', 'low'))
    const result = matchPlayersToTables({ players: lowObservers, tableCount: 1, minPlayersPerTable: 4, maxPlayersPerTable: 4 })
    expect(result.status).toBe('WARNING')
    expect(result.warnings.map((warning) => warning.type)).toEqual(expect.arrayContaining(['TABLE_TOO_OBSERVER_HEAVY', 'TABLE_LOW_PARTICIPATION']))
    expect(result.tables[0].score).toBeGreaterThanOrEqual(0)
    expect(result.tables[0].score).toBeLessThanOrEqual(1)
  })

  it('assigns every player exactly once', () => {
    const result = matchPlayersToTables({ players, tableCount: 3, minPlayersPerTable: 2, maxPlayersPerTable: 4 })
    const assigned = result.tables.flatMap((table) => table.playerIds)
    expect(assigned).toHaveLength(players.length)
    expect(new Set(assigned).size).toBe(players.length)
    expect(new Set(assigned)).toEqual(new Set(players.map((candidate) => candidate.playerId)))
  })

  it('builds a stable initial distribution in playerId order', () => {
    expect(buildInitialTables({ players: [player('b', 'warms_up'), player('a', 'warms_up'), player('c', 'warms_up')], tableCount: 2, minPlayersPerTable: 1, maxPlayersPerTable: 2 })).toEqual([
      { tableId: 'table-1', playerIds: ['a', 'c'] },
      { tableId: 'table-2', playerIds: ['b'] },
    ])
  })
})
