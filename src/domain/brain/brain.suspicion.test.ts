import { describe, expect, it } from 'vitest'
import { createSuspicionGraph, countSuspicionChanges, getCurrentSuspicion, getMostSuspectedPlayers, getPlayersSuspecting, getSuspicionChangeType, getSuspicionDistribution, hasSuspicionChanged, setSuspicion, validateSuspicionGraph, validateSuspicionSelection } from './brain.suspicion'
import { createTrustGraph, setTrust } from './brain.trust'

const base = createSuspicionGraph(['P1', 'P2', 'P3', 'P4'])

describe('Suspicion Graph Engine v0.6', () => {
  it('records directional primary suspicion', () => {
    const graph = setSuspicion(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'INVESTIGATION', confidence: 'HIGH' })
    expect(getCurrentSuspicion(graph, 'P1')).toMatchObject({ type: 'SUSPICION', targetPlayerId: 'P2', confidence: 'HIGH', active: true })
    expect(getCurrentSuspicion(graph, 'P2')).toBeNull()
  })

  it('rejects self suspicion, unknown players, invalid phases and confidence', () => {
    expect(validateSuspicionSelection(base, { sourcePlayerId: 'P1', targetPlayerId: 'P1', phase: 'DOUBT' }).violations).toContain('SELF_SUSPICION_FORBIDDEN')
    expect(validateSuspicionSelection(base, { sourcePlayerId: 'P1', targetPlayerId: 'P9', phase: 'DOUBT' }).valid).toBe(false)
    expect(validateSuspicionSelection(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'TRUST' }).valid).toBe(false)
    expect(validateSuspicionSelection(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'DOUBT', confidence: 'INVALID' as never }).valid).toBe(false)
  })

  it('keeps one active primary suspect and preserves target-change history', () => {
    const first = setSuspicion(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'INVESTIGATION', confidence: 'MEDIUM' })
    const second = setSuspicion(first, { sourcePlayerId: 'P1', targetPlayerId: 'P3', phase: 'DOUBT', confidence: 'HIGH' })
    expect(second.edges).toHaveLength(1)
    expect(getCurrentSuspicion(second, 'P1')?.targetPlayerId).toBe('P3')
    expect(second.history).toHaveLength(2)
    expect(hasSuspicionChanged(second, 'P1')).toBe(true)
    expect(countSuspicionChanges(second, 'P1')).toBe(1)
  })

  it('records confidence changes and ignores identical selections', () => {
    const first = setSuspicion(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'INVESTIGATION', confidence: 'LOW' })
    expect(getSuspicionChangeType(first, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'DOUBT', confidence: 'LOW' })).toBe('NO_CHANGE')
    const unchanged = setSuspicion(first, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'DOUBT', confidence: 'LOW' })
    expect(unchanged.history).toHaveLength(1)
    const updated = setSuspicion(unchanged, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'DOUBT', confidence: 'HIGH' })
    expect(getSuspicionChangeType(first, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'DOUBT', confidence: 'HIGH' })).toBe('CONFIDENCE_CHANGED')
    expect(updated.history).toHaveLength(2)
    expect(countSuspicionChanges(updated, 'P1')).toBe(1)
  })

  it('queries suspect sources, distribution and most suspected players deterministically', () => {
    let graph = setSuspicion(base, { sourcePlayerId: 'P1', targetPlayerId: 'P4', phase: 'DOUBT', confidence: 'HIGH' })
    graph = setSuspicion(graph, { sourcePlayerId: 'P2', targetPlayerId: 'P4', phase: 'DOUBT', confidence: 'LOW' })
    graph = setSuspicion(graph, { sourcePlayerId: 'P3', targetPlayerId: 'P2', phase: 'FINAL_THEORY', confidence: 'MEDIUM' })
    expect(getPlayersSuspecting(graph, 'P4')).toEqual(['P1', 'P2'])
    expect(getSuspicionDistribution(graph)).toEqual([{ playerId: 'P4', suspectedByCount: 2 }, { playerId: 'P2', suspectedByCount: 1 }])
    expect(getMostSuspectedPlayers(graph)).toEqual([
      { playerId: 'P4', suspectedByCount: 2, averageConfidence: 2 },
      { playerId: 'P2', suspectedByCount: 1, averageConfidence: 2 },
    ])
  })

  it('validates malformed and duplicate primary edges', () => {
    const graph = setSuspicion(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'DOUBT' })
    const malformed = { ...graph, edges: [...graph.edges, { ...graph.edges[0], targetPlayerId: 'P3' }] }
    expect(validateSuspicionGraph(malformed).violations).toContain('MULTIPLE_PRIMARY_SUSPICIONS')
  })

  it('does not mutate input or interfere with Trust edges', () => {
    const original = createSuspicionGraph(['P1', 'P2'])
    const next = setSuspicion(original, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'INVESTIGATION' })
    expect(original.edges).toEqual([])
    expect(original.history).toEqual([])
    const trust = setTrust(createTrustGraph(['P1', 'P2']), { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'TRUST' })
    expect(trust.edges).toHaveLength(1)
    expect(JSON.stringify(next)).not.toContain('role')
  })

  it('is deterministic and role-blind', () => {
    const selection = { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'FINAL_THEORY' as const, confidence: 'MEDIUM' as const }
    expect(setSuspicion(base, selection)).toEqual(setSuspicion(base, selection))
    expect(JSON.stringify(setSuspicion(base, selection))).not.toContain('liar')
    expect(JSON.stringify(setSuspicion(base, selection))).not.toContain('nickname')
  })
})
