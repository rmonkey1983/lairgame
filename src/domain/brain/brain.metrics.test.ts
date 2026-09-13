import { describe, expect, it } from 'vitest'
import { appendBrainEvent, createBrainEventStore } from './brain.events'
import { calculateAverageTheoryChanges, calculateBrainMetrics, calculateLiarConfidence, calculateLiarExposure, calculateParticipationBalance, calculatePlayerActivity, calculateRoleExposure, calculateSuspicionCoverage, calculateTableMetrics, calculateTheoryDiversity, calculateTheoryShiftRate } from './brain.metrics'
import { createSuspicionGraph, setSuspicion } from './brain.suspicion'
import { createTrustGraph, setTrust } from './brain.trust'
import { buildBrainState } from './brain.state'
import type { BrainEvent, BrainEventStore } from './brain.events'
import type { BrainPlayer, BrainState, ScenarioTruth } from './brain.types'

const players: BrainPlayer[] = ['P1', 'P2', 'P3', 'P4'].map((playerId) => ({
  playerId,
  socialStyle: 'balanced',
  exposureLevel: 'medium',
  participationLevel: 'medium',
  arrivedWithPlayerIds: [],
  strategyPreference: 'mixed',
  sources: { socialStyle: 'derived', exposureLevel: 'derived', participationLevel: 'derived', strategyPreference: 'derived' },
}))
const truth: ScenarioTruth = { liarPlayerId: 'P2', accomplicePlayerId: 'P3', scapegoatPlayerId: 'P4', facts: [], lies: [] }

function state(): BrainState {
  return buildBrainState({ sessionId: 'metrics-session', phase: 'DOUBT', players, tables: [{ tableId: 'T1', playerIds: ['P1', 'P2'] }, { tableId: 'T2', playerIds: ['P3', 'P4'] }] })
}

function suspicionGraph(targets: Array<[string, string]>, confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM') {
  let graph = createSuspicionGraph(players.map((player) => player.playerId))
  for (const [sourcePlayerId, targetPlayerId] of targets) graph = setSuspicion(graph, { sourcePlayerId, targetPlayerId, phase: 'DOUBT', confidence })
  return graph
}

function event(sequence: number, type: BrainEvent['type'], actorPlayerId: string, targetPlayerId = 'P4'): BrainEvent {
  const base = { id: `e${sequence}`, sessionId: 'metrics-session', sequence, phase: 'DOUBT' as const, actorPlayerId, targetPlayerId: type === 'SUSPICION_CONFIDENCE_CHANGED' ? targetPlayerId : targetPlayerId }
  if (type === 'SUSPICION_SELECTED') return { ...base, type, payload: { confidence: 'MEDIUM' } }
  if (type === 'SUSPICION_TARGET_CHANGED') return { ...base, type, payload: { previousTargetPlayerId: 'P2', newTargetPlayerId: targetPlayerId, confidence: 'HIGH' } }
  if (type === 'SUSPICION_CONFIDENCE_CHANGED') return { ...base, type, payload: { targetPlayerId, previousConfidence: 'LOW', newConfidence: 'HIGH' } }
  if (type === 'TRUST_CHANGED') return { ...base, type, targetPlayerId: 'P2', payload: { previousLevel: 'LOW', newLevel: 'HIGH' } }
  return { ...base, type: 'TRUST_SELECTED', targetPlayerId: 'P2', payload: { level: 'HIGH' } }
}

function eventStore(events: BrainEvent[]): BrainEventStore {
  let store = createBrainEventStore('metrics-session')
  for (const next of events) {
    const result = appendBrainEvent(store, next)
    if (!result.ok) throw new Error(result.violations.join(', '))
    store = result.store
  }
  return store
}

describe('Metrics Engine v0.8', () => {
  it('measures liar, accomplice and scapegoat exposure over active suspicion sources', () => {
    const graph = suspicionGraph([['P1', 'P2'], ['P2', 'P3'], ['P3', 'P4']])
    expect(calculateLiarExposure(state(), truth, graph)).toBeCloseTo(1 / 3)
    expect(calculateRoleExposure(state(), truth, graph)).toEqual({ liar: 0.333333, accomplice: 0.333333, scapegoat: 0.333333 })
    expect(calculateLiarExposure(state(), truth, createSuspicionGraph(['P1', 'P2']))).toBeNull()
  })

  it('measures suspicion coverage and normalized 1-HHI theory diversity', () => {
    const graph = suspicionGraph([['P1', 'P2'], ['P2', 'P3'], ['P3', 'P4']])
    expect(calculateSuspicionCoverage(state(), graph)).toBe(0.75)
    expect(calculateTheoryDiversity(state(), suspicionGraph([['P1', 'P2'], ['P3', 'P2']]))).toBe(0)
    expect(calculateTheoryDiversity(state(), graph)).toBe(1)
  })

  it('separates target shifts from confidence-only changes', () => {
    const confidenceOnly = eventStore([event(1, 'SUSPICION_SELECTED', 'P1', 'P2'), event(2, 'SUSPICION_CONFIDENCE_CHANGED', 'P1', 'P2')])
    const targetChanged = eventStore([event(1, 'SUSPICION_SELECTED', 'P1', 'P2'), event(2, 'SUSPICION_TARGET_CHANGED', 'P1', 'P3')])
    expect(calculateTheoryShiftRate(state(), { eventStore: confidenceOnly })).toBe(0)
    expect(calculateAverageTheoryChanges(state(), { eventStore: confidenceOnly })).toBe(0)
    expect(calculateTheoryShiftRate(state(), { eventStore: targetChanged })).toBe(1)
    expect(calculateAverageTheoryChanges(state(), { eventStore: targetChanged })).toBe(1)
  })

  it('calculates declared liar confidence without treating it as probability', () => {
    const graph = suspicionGraph([['P1', 'P2']], 'HIGH')
    expect(calculateLiarConfidence(state(), truth, graph)).toBe(1)
    expect(calculateLiarConfidence(state(), truth, suspicionGraph([['P1', 'P3']], 'LOW'))).toBeNull()
  })

  it('reuses trust graph metrics and derives player activity from event history', () => {
    let trust = createTrustGraph(players.map((player) => player.playerId))
    trust = setTrust(trust, { sourcePlayerId: 'P1', targetPlayerId: 'P3', phase: 'TRUST', level: 'HIGH' })
    trust = setTrust(trust, { sourcePlayerId: 'P2', targetPlayerId: 'P3', phase: 'TRUST', level: 'HIGH' })
    const store = eventStore([event(1, 'TRUST_SELECTED', 'P1'), event(2, 'TRUST_CHANGED', 'P1'), event(3, 'SUSPICION_SELECTED', 'P2')])
    const metrics = calculateBrainMetrics(state(), truth, { trustGraph: trust, eventStore: store })
    expect(metrics.trustCoverage).toBe(0.5)
    expect(metrics.trustConcentration).toBe(1)
    expect(calculatePlayerActivity(state(), store)).toEqual([
      { playerId: 'P1', eventCount: 2, normalizedActivity: 1 },
      { playerId: 'P2', eventCount: 1, normalizedActivity: 0.5 },
      { playerId: 'P3', eventCount: 0, normalizedActivity: 0 },
      { playerId: 'P4', eventCount: 0, normalizedActivity: 0 },
    ])
  })

  it('measures balanced and concentrated participation, with null for no evidence', () => {
    const balanced = buildBrainState({ ...state(), players: players.map((player) => ({ ...player, activityCount: 2 })) })
    const concentrated = buildBrainState({ ...state(), players: players.map((player, index) => ({ ...player, activityCount: index === 0 ? 4 : 0 })) })
    expect(calculateParticipationBalance(balanced)).toBe(1)
    expect(calculateParticipationBalance(concentrated)).toBe(0)
    expect(calculateParticipationBalance(state())).toBeNull()
  })

  it('isolates table metrics and returns player activity normalized to the session maximum', () => {
    const graph = suspicionGraph([['P1', 'P2'], ['P2', 'P1'], ['P3', 'P4']])
    const metrics = calculateTableMetrics(state(), { suspicionGraph: graph })
    expect(metrics).toEqual([
      { tableId: 'T1', suspicionCoverage: 1, theoryDiversity: 1, participationBalance: null },
      { tableId: 'T2', suspicionCoverage: 0.5, theoryDiversity: 0, participationBalance: null },
    ])
  })

  it('keeps current metrics separate from historical activity and does not mutate inputs', () => {
    const original = state()
    const truthCopy = structuredClone(truth)
    const graph = suspicionGraph([['P1', 'P2']])
    const store = eventStore([event(1, 'SUSPICION_SELECTED', 'P1', 'P2'), event(2, 'SUSPICION_TARGET_CHANGED', 'P1', 'P3')])
    const first = calculateBrainMetrics(original, truth, { suspicionGraph: graph, eventStore: store })
    const second = calculateBrainMetrics(original, truth, { suspicionGraph: graph, eventStore: store })
    expect(first).toEqual(second)
    expect(first.theoryDiversity).toBe(0)
    expect(first.theoryShiftRate).toBe(1)
    expect(first.averageTheoryChanges).toBe(1)
    expect(truth).toEqual(truthCopy)
    expect(original.socialEdges).toEqual([])
  })

  it('keeps every normalized metric within 0..1', () => {
    const metrics = calculateBrainMetrics(state(), truth, { suspicionGraph: suspicionGraph([['P1', 'P2'], ['P2', 'P3'], ['P3', 'P4']]) })
    const values = [metrics.liarExposure, metrics.theoryDiversity, metrics.participationBalance, metrics.trustCoverage, metrics.trustConcentration, metrics.suspicionCoverage, metrics.theoryShiftRate, metrics.liarConfidence]
    expect(values.filter((value): value is number => value !== null).every((value) => value >= 0 && value <= 1)).toBe(true)
  })
})
