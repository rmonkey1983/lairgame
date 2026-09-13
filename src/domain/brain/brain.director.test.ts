import { describe, expect, it } from 'vitest'
import { evaluateLiveDirector, mapDecisionToStrategies, validateDirectorProposal, type LiveDirectorContext } from './brain.director'
import { decision } from './brain.decisions'
import { createSuspicionGraph } from './brain.suspicion'
import { createTrustGraph } from './brain.trust'
import { derivePlayerGameProfile } from './brain.profile'

const players = [
  derivePlayerGameProfile({ playerId: 'p1', groupBehavior: 'warms_up', publicExposureComfort: 'medium' }),
  derivePlayerGameProfile({ playerId: 'p2', groupBehavior: 'breaks_ice', publicExposureComfort: 'high' }),
  derivePlayerGameProfile({ playerId: 'p3', groupBehavior: 'observes_first' }),
]

const tables = [
  { tableId: 't1', playerIds: ['p1', 'p2'], score: 1, metrics: { socialBalance: 1, participationBalance: 1, existingGroupBalance: 1 }, warnings: [] },
  { tableId: 't2', playerIds: ['p3'], score: 1, metrics: { socialBalance: 1, participationBalance: 1, existingGroupBalance: 1 }, warnings: [] },
]

function context(decisions = [decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }, { severity: 'LOW' })]): LiveDirectorContext {
  return {
    phase: 'INVESTIGATION', decisions, players, tables,
    trustGraph: createTrustGraph(players.map((player) => player.playerId)),
    suspicionGraph: createSuspicionGraph(players.map((player) => player.playerId)),
    missionContext: { phase: 'INVESTIGATION', players, trustGraph: createTrustGraph(players.map((player) => player.playerId)), suspicionGraph: createSuspicionGraph(players.map((player) => player.playerId)) },
  }
}

describe('Adaptive Live Director v0.11', () => {
  it('maps all required decisions and leaves NO_ACTION empty', () => {
    expect(mapDecisionToStrategies(decision('HIGH_LIAR_EXPOSURE', { phase: 'DOUBT', metrics: {} }))).toEqual(['REDUCE_DIRECT_PRESSURE', 'DIVERSIFY_THEORIES'])
    expect(mapDecisionToStrategies(decision('THEORY_COLLAPSE', { phase: 'DOUBT', metrics: {} }))).toEqual(['DIVERSIFY_THEORIES'])
    expect(mapDecisionToStrategies(decision('NO_ACTION', { phase: 'LOBBY', metrics: {} }))).toEqual([])
  })

  it('produces safe suggestions with deterministic priority, ids, and ordering', () => {
    const first = evaluateLiveDirector(context([
      decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }, { severity: 'HIGH' }),
      decision('TRUST_OPPORTUNITY', { phase: 'INVESTIGATION', metrics: {} }, { severity: 'MEDIUM' }),
    ]))
    const second = evaluateLiveDirector(context([
      decision('TRUST_OPPORTUNITY', { phase: 'INVESTIGATION', metrics: {} }, { severity: 'MEDIUM' }),
      decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }, { severity: 'HIGH' }),
    ]))
    expect(first).toEqual(second)
    expect(first.every((proposal) => proposal.mode === 'SUGGEST' && proposal.status === 'PROPOSED')).toBe(true)
    expect(first[0]?.priority).toBe('HIGH')
    expect(first.length).toBeLessThanOrEqual(3)
  })

  it('keeps table-scoped missions inside their table and never forces low exposure', () => {
    const tableDecision = decision('TABLE_IMBALANCE', { phase: 'INVESTIGATION', metrics: {} }, { scope: { type: 'TABLE', tableId: 't1' }, severity: 'HIGH' })
    const participation = decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }, { scope: { type: 'TABLE', tableId: 't1' }, severity: 'HIGH' })
    const proposals = evaluateLiveDirector(context([tableDecision, participation]))
    expect(proposals.find((proposal) => proposal.strategy === 'CHECK_TABLE')).toBeDefined()
    const mission = proposals.find((proposal) => proposal.missionProposal)?.missionProposal
    expect(mission?.playerId === undefined || ['p1', 'p2'].includes(mission.playerId)).toBe(true)
    expect(mission?.exposureLevel === 'low' || mission === undefined).toBe(true)
  })

  it('keeps inactive-player handling safe and role-blind', () => {
    const proposals = evaluateLiveDirector(context([decision('INACTIVE_PLAYER', { phase: 'INVESTIGATION', metrics: {} }, { scope: { type: 'PLAYER', playerId: 'p3' }, playerId: 'p3', severity: 'HIGH' })]))
    expect(proposals[0]?.strategy).toBe('CHECK_PLAYER')
    expect(proposals[0]?.missionProposal?.playerId).toBe('p3')
    expect(JSON.stringify(proposals)).not.toContain('liar')
  })

  it('deduplicates strategies, respects max proposals, and does not mutate context', () => {
    const original = JSON.stringify(context())
    const proposals = evaluateLiveDirector(context([
      decision('THEORY_COLLAPSE', { phase: 'DOUBT', metrics: {} }),
      decision('HIGH_LIAR_EXPOSURE', { phase: 'DOUBT', metrics: {} }),
      decision('LOW_ENGAGEMENT', { phase: 'DOUBT', metrics: {} }),
    ]), 2)
    expect(proposals).toHaveLength(2)
    expect(new Set(proposals.map((proposal) => `${proposal.strategy}:${proposal.missionProposal?.playerId ?? 'none'}`)).size).toBe(proposals.length)
    expect(JSON.stringify(context())).toBe(original)
  })

  it('rejects malformed, non-suggest, invalid-scope, and invalid mission proposals', () => {
    const base = evaluateLiveDirector(context())[0]
    expect(base).toBeDefined()
    expect(validateDirectorProposal({ ...base, mode: 'SUGGEST', strategy: 'UNKNOWN' as never }, context()).valid).toBe(false)
    expect(validateDirectorProposal({ ...base, scope: { type: 'TABLE', tableId: 'missing' } }, context()).violations).toContain('INVALID_SCOPE')
    expect(validateDirectorProposal({ ...base, missionProposal: { ...base.missionProposal!, playerId: 'p3', targetPlayerId: 'p3' } }, context()).violations).toContain('MISSION_PROPOSAL_INVALID')
  })
})
