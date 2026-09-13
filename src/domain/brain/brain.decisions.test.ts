import { describe, expect, it } from 'vitest'
import { evaluateBrainState } from './brain.engine'
import { DECISION_THRESHOLDS } from './brain.decisions'
import { createTrustGraph, setTrust } from './brain.trust'
import { buildBrainState } from './brain.state'
import type { BrainPlayer, BrainState, ScenarioTruth, SocialEdge } from './brain.types'

const players: BrainPlayer[] = [
  { playerId: 'p1', activityCount: 1, socialStyle: 'balanced', exposureLevel: 'medium', participationLevel: 'medium', arrivedWithPlayerIds: [], strategyPreference: 'mixed', sources: { socialStyle: 'defaulted', exposureLevel: 'defaulted', participationLevel: 'defaulted', strategyPreference: 'defaulted' } },
  { playerId: 'p2', activityCount: 1, socialStyle: 'balanced', exposureLevel: 'medium', participationLevel: 'medium', arrivedWithPlayerIds: [], strategyPreference: 'mixed', sources: { socialStyle: 'defaulted', exposureLevel: 'defaulted', participationLevel: 'defaulted', strategyPreference: 'defaulted' } },
  { playerId: 'p3', activityCount: 1, socialStyle: 'balanced', exposureLevel: 'medium', participationLevel: 'medium', arrivedWithPlayerIds: [], strategyPreference: 'mixed', sources: { socialStyle: 'defaulted', exposureLevel: 'defaulted', participationLevel: 'defaulted', strategyPreference: 'defaulted' } },
]
const truth: ScenarioTruth = { liarPlayerId: 'p3', facts: [], lies: [] }

function makeState(phase: BrainState['phase'], edges: SocialEdge[], inputPlayers = players): BrainState {
  return buildBrainState({ sessionId: 's1', phase, players: inputPlayers, tables: [{ tableId: 't1', playerIds: inputPlayers.map((player) => player.playerId) }], socialEdges: edges })
}

function suspicion(sourcePlayerId: string, targetPlayerId: string): SocialEdge {
  return { sourcePlayerId, targetPlayerId, type: 'SUSPICION', phase: 'DOUBT', active: true }
}

describe('Liar Brain Decision Engine v0.9', () => {
  it('emits structured suggest-only high exposure with sufficient evidence', () => {
    const result = evaluateBrainState(makeState('DOUBT', [suspicion('p1', 'p3'), suspicion('p2', 'p3')]), truth)
    const high = result.decisions.find((item) => item.type === 'HIGH_LIAR_EXPOSURE')
    expect(high).toMatchObject({ mode: 'SUGGEST', severity: 'HIGH', scope: { type: 'SESSION' }, recommendation: { type: 'REDUCE_DIRECT_PRESSURE' } })
    expect(high?.evidence.metrics).toMatchObject({ liarExposure: 1, suspicionCoverage: 0.666667 })
    expect(high?.evidence.thresholds?.highLiarExposure).toBe(DECISION_THRESHOLDS.highLiarExposure)
  })

  it('does not produce a strong role-aware diagnosis from one source', () => {
    const result = evaluateBrainState(makeState('DOUBT', [suspicion('p1', 'p3')]), truth)
    expect(result.decisions.some((item) => item.type === 'HIGH_LIAR_EXPOSURE')).toBe(false)
    expect(result.decisions.some((item) => item.type === 'LOW_LIAR_EXPOSURE')).toBe(false)
  })

  it('limits low exposure to sufficiently advanced phases', () => {
    const edges = [suspicion('p2', 'p1'), suspicion('p3', 'p1')]
    expect(evaluateBrainState(makeState('INVESTIGATION', edges), truth).decisions.some((item) => item.type === 'LOW_LIAR_EXPOSURE')).toBe(false)
    expect(evaluateBrainState(makeState('FINAL_THEORY', edges), truth).decisions.some((item) => item.type === 'LOW_LIAR_EXPOSURE')).toBe(true)
  })

  it('reports role-blind theory collapse with the most suspected player as evidence', () => {
    const result = evaluateBrainState(makeState('DOUBT', [suspicion('p1', 'p2'), suspicion('p3', 'p2')]), truth)
    expect(result.decisions.find((item) => item.type === 'THEORY_COLLAPSE')).toMatchObject({ evidence: { mostSuspectedPlayerId: 'p2', metrics: { theoryDiversity: 0 } } })
  })

  it('reports concentrated trust as an informational opportunity', () => {
    let graph = createTrustGraph(players.map((player) => player.playerId))
    graph = setTrust(graph, { sourcePlayerId: 'p1', targetPlayerId: 'p3', phase: 'TRUST', level: 'HIGH' })
    graph = setTrust(graph, { sourcePlayerId: 'p2', targetPlayerId: 'p3', phase: 'TRUST', level: 'HIGH' })
    const result = evaluateBrainState(makeState('TRUST', []), undefined, { trustGraph: graph })
    expect(result.decisions.find((item) => item.type === 'TRUST_OPPORTUNITY')).toMatchObject({ severity: 'INFO', scope: { type: 'PLAYER', playerId: 'p3' } })
  })

  it('keeps decisions deterministic and does not execute actions', () => {
    const state = makeState('DOUBT', [suspicion('p1', 'p3'), suspicion('p2', 'p3')])
    const first = evaluateBrainState(state, truth)
    const second = evaluateBrainState(state, truth)
    expect(first.decisions).toEqual(second.decisions)
    expect(first.decisions.every((item) => item.mode === 'SUGGEST' && !item.recommendedAction)).toBe(true)
  })
})
