import { describe, expect, it } from 'vitest'
import { calculateTrustConcentration, calculateTrustCoverage, createTrustGraph, getMutualTrust, getPlayersTrusting, getTrust, getTrustOpportunities, getTrustedPlayers, hasTrustChanged, setTrust, validateTrustGraph, validateTrustSelection } from './brain.trust'

const base = createTrustGraph(['P1', 'P2', 'P3', 'P4'])

describe('Trust Graph Engine v0.5', () => {
  it('records a directional trust relation in an allowed phase', () => {
    const graph = setTrust(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'TRUST', level: 'HIGH' })
    expect(getTrust(graph, 'P1', 'P2')).toMatchObject({ type: 'TRUST', level: 'HIGH', active: true })
    expect(getTrust(graph, 'P2', 'P1')).toBeNull()
  })

  it('rejects self trust, unknown players, invalid phases and levels', () => {
    expect(validateTrustSelection(base, { sourcePlayerId: 'P1', targetPlayerId: 'P1', phase: 'TRUST' }).violations).toContain('SELF_TRUST_FORBIDDEN')
    expect(validateTrustSelection(base, { sourcePlayerId: 'P1', targetPlayerId: 'P9', phase: 'TRUST' }).valid).toBe(false)
    expect(validateTrustSelection(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'LOBBY' }).valid).toBe(false)
    expect(validateTrustSelection(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'TRUST', level: 'INVALID' as never }).valid).toBe(false)
  })

  it('updates one active edge while preserving history', () => {
    const first = setTrust(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'TRUST', level: 'HIGH' })
    const second = setTrust(first, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'DOUBT', level: 'LOW' })
    expect(second.edges).toHaveLength(1)
    expect(getTrust(second, 'P1', 'P2')?.level).toBe('LOW')
    expect(second.history).toHaveLength(2)
    expect(hasTrustChanged(second, 'P1', 'P2')).toBe(true)
    expect(first).not.toBe(second)
    expect(base.edges).toHaveLength(0)
  })

  it('derives mutual trust and deterministic ordered queries', () => {
    let graph = setTrust(base, { sourcePlayerId: 'P1', targetPlayerId: 'P3', phase: 'TRUST', level: 'LOW' })
    graph = setTrust(graph, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'TRUST', level: 'HIGH' })
    graph = setTrust(graph, { sourcePlayerId: 'P3', targetPlayerId: 'P1', phase: 'TRUST', level: 'MEDIUM' })
    expect(getTrustedPlayers(graph, 'P1')).toEqual(['P2', 'P3'])
    expect(getPlayersTrusting(graph, 'P1')).toEqual(['P3'])
    expect(getMutualTrust(graph, 'P1', 'P3')).toBe(true)
    expect(getMutualTrust(graph, 'P1', 'P2')).toBe(false)
  })

  it('has no duplicate active edge and validates malformed graph data', () => {
    const graph = setTrust(base, { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'TRUST' })
    const malformed = { ...graph, edges: [...graph.edges, { ...graph.edges[0] }] }
    expect(validateTrustGraph(malformed).violations).toContain('DUPLICATE_ACTIVE_TRUST_EDGE')
  })

  it('calculates concentration, coverage and trust opportunities', () => {
    let graph = setTrust(base, { sourcePlayerId: 'P1', targetPlayerId: 'P4', phase: 'TRUST', level: 'HIGH' })
    graph = setTrust(graph, { sourcePlayerId: 'P2', targetPlayerId: 'P4', phase: 'TRUST', level: 'MEDIUM' })
    graph = setTrust(graph, { sourcePlayerId: 'P3', targetPlayerId: 'P4', phase: 'TRUST', level: 'LOW' })
    expect(calculateTrustConcentration(graph)).toBe(1)
    expect(calculateTrustCoverage(graph)).toBe(0.75)
    expect(getTrustOpportunities(graph)[0]).toMatchObject({ playerId: 'P4', trustedByCount: 3 })
    expect(getTrustOpportunities(graph)[0].averageTrustStrength).toBeCloseTo(2 / 3)
  })

  it('returns null concentration when there is insufficient trust data', () => {
    expect(calculateTrustConcentration(base)).toBeNull()
    expect(calculateTrustConcentration(createTrustGraph(['P1']))).toBeNull()
  })

  it('keeps the graph role-blind and deterministic', () => {
    const selection = { sourcePlayerId: 'P1', targetPlayerId: 'P2', phase: 'INVESTIGATION' as const, level: 'MEDIUM' as const }
    expect(setTrust(base, selection)).toEqual(setTrust(base, selection))
    expect(JSON.stringify(setTrust(base, selection))).not.toContain('role')
    expect(JSON.stringify(setTrust(base, selection))).not.toContain('nickname')
  })
})
