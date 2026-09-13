import { describe, expect, it } from 'vitest'
import { decision } from './brain.decisions'
import { createBrainEventStore } from './brain.events'
import { analyzeDataQuality, analyzeFinalOutcome, analyzeInterventions, analyzeParticipation, analyzePostGame, analyzeTables, analyzeTrustDynamics, type PostGameAnalysisInput } from './brain.postgame'
import { derivePlayerGameProfile } from './brain.profile'
import { createSuspicionGraph, setSuspicion } from './brain.suspicion'
import { createTrustGraph, setTrust } from './brain.trust'
import type { DirectorProposal } from './brain.director'
import type { RegiaProposal } from './brain.regia'

const players = [
  derivePlayerGameProfile({ playerId: 'p1', publicExposureComfort: 'medium' }),
  derivePlayerGameProfile({ playerId: 'p2', publicExposureComfort: 'high' }),
  derivePlayerGameProfile({ playerId: 'p3', publicExposureComfort: 'low' }),
]
const tables = [{ tableId: 't1', playerIds: ['p1', 'p2'] }, { tableId: 't2', playerIds: ['p3'] }]
const metrics = {
  liarExposure: 0.5, roleExposure: { liar: 0.5, accomplice: null, scapegoat: null }, theoryDiversity: 0.5, participationBalance: 0.75,
  trustCoverage: 0.666667, trustConcentration: 0.5, suspicionCoverage: 0.666667, theoryShiftRate: 0.333333, averageTheoryChanges: 1,
  liarConfidence: null, playerActivity: [{ playerId: 'p1', eventCount: 3, normalizedActivity: 1 }, { playerId: 'p2', eventCount: 1, normalizedActivity: 0.333333 }, { playerId: 'p3', eventCount: 0, normalizedActivity: 0 }],
  tableMetrics: [{ tableId: 't1', suspicionCoverage: 1, theoryDiversity: 0, participationBalance: 0.5 }, { tableId: 't2', suspicionCoverage: null, theoryDiversity: null, participationBalance: null }],
}
const base = (): PostGameAnalysisInput => ({ sessionId: 's1', players, tables, finalPhase: 'RESULTS', metrics, missionOutcomes: [
  { missionId: 'm1', missionType: 'OBSERVE_PLAYER', playerId: 'p1', tableId: 't1', status: 'COMPLETED', activatedAt: '2026-01-01T00:00:00Z', outcomeAt: '2026-01-01T00:01:00Z', acknowledgedAt: '2026-01-01T00:00:30Z' },
  { missionId: 'm2', missionType: 'GAIN_TRUST', playerId: 'p2', tableId: 't1', status: 'FAILED', activatedAt: '2026-01-01T00:00:00Z' },
  { missionId: 'm3', missionType: 'OBSERVE_PLAYER', playerId: 'p3', tableId: 't2', status: 'ACTIVE', activatedAt: '2026-01-01T00:00:00Z' },
], theoryHistory: [
  { sequence: 1, phase: 'DOUBT', theories: { p1: 'p2', p2: 'p2', p3: null }, liarExposure: 0.2 },
  { sequence: 2, phase: 'FINAL_THEORY', theories: { p1: 'p3', p2: 'p2', p3: 'p1' }, liarExposure: 0.8 },
] })

describe('Post-Game Analysis Engine v0.23', () => {
  it('handles an empty or incomplete session without invented conclusions', () => {
    const report = analyzePostGame({ sessionId: 'empty', players: [], tables: [] })
    expect(report.finalOutcome).toBeNull()
    expect(report.summary.missionsActivated).toBe(0)
    expect(report.theoryDynamics.peakLiarExposure).toBeNull()
    expect(report.dataQuality.votingDataAvailable).toBe(false)
    expect(report.warnings).toContain('MISSING_FINAL_VOTE')
  })

  it('calculates summary, theory shifts, normalized before/after, and no causal claim', () => {
    const input = base()
    const report = analyzePostGame(input)
    expect(report.summary).toMatchObject({ players: 3, tables: 2, finalPhase: 'RESULTS', missionsActivated: 3, missionsTerminal: 2 })
    expect(report.theoryDynamics).toMatchObject({ initialTheoryDiversity: 0, finalTheoryDiversity: 1, theoryShiftRate: 0.666667, averageTheoryChanges: 0.666667, peakLiarExposure: 0.8, finalLiarExposure: 0.8 })
    expect(report.theoryDynamics.beforeAfterLiarExposure).toEqual({ before: 0.2, after: 0.8, delta: 0.6, attribution: 'OBSERVED_ONLY' })
    expect(JSON.stringify(report)).not.toContain('caused')
  })

  it('returns final outcome only when voting data exists', () => {
    expect(analyzeFinalOutcome()).toBeNull()
    expect(analyzeFinalOutcome({ liarPlayerId: 'p2', votes: [{ voterPlayerId: 'p1', targetPlayerId: 'p2' }, { voterPlayerId: 'p3', targetPlayerId: 'p1' }] })).toEqual({ trueLiarPlayerId: 'p2', finalVotes: 1, identifiedByPlayers: 1, totalVotes: 2 })
  })

  it('analyzes trust coverage, concentration, mutual trust and changes', () => {
    let graph = createTrustGraph(['p1', 'p2', 'p3'])
    graph = setTrust(graph, { sourcePlayerId: 'p1', targetPlayerId: 'p2', phase: 'TRUST', level: 'LOW' })
    graph = setTrust(graph, { sourcePlayerId: 'p2', targetPlayerId: 'p1', phase: 'TRUST', level: 'HIGH' })
    graph = setTrust(graph, { sourcePlayerId: 'p1', targetPlayerId: 'p2', phase: 'INVESTIGATION', level: 'HIGH' })
    const analysis = analyzeTrustDynamics({ ...base(), trustGraph: graph })
    expect(analysis).toMatchObject({ coverage: 0.666667, concentration: 0, mutualTrustCount: 1, trustChanges: 1, largestIncomingTrustConcentration: 0.5 })
  })

  it('analyzes participation and does not produce a player ranking', () => {
    const analysis = analyzeParticipation(base())
    expect(analysis.balance).toBeGreaterThanOrEqual(0)
    expect(analysis.balance).toBeLessThanOrEqual(1)
    expect(analysis.inactivePlayerDecisions).toBe(0)
    expect(analysis.tableParticipation).toHaveLength(2)
    expect(analysis).not.toHaveProperty('ranking')
  })

  it('produces table analysis and reuses mission outcome metrics', () => {
    const analysis = analyzeTables(base())
    expect(analysis).toEqual(expect.arrayContaining([
      expect.objectContaining({ tableId: 't1', playerCount: 2, missionsActivated: 2, missionsCompleted: 1 }),
      expect.objectContaining({ tableId: 't2', playerCount: 1, missionsActivated: 1, missionsCompleted: 0 }),
    ]))
  })

  it('traces intervention stages and marks incomplete traces', () => {
    const director = { id: 'd1', mode: 'SUGGEST', sourceDecisionType: 'LOW_ENGAGEMENT', strategy: 'INCREASE_PARTICIPATION', scope: { type: 'SESSION' }, priority: 'LOW', evidence: { decisionEvidence: { phase: 'DOUBT', metrics: {} } }, status: 'PROPOSED' } as DirectorProposal
    const regia = { id: 'r1', sourceProposalId: 'd1', commandType: 'INCREASE_PARTICIPATION', controlMode: 'SUGGEST', status: 'EXECUTED', payload: { commandType: 'INCREASE_PARTICIPATION', scope: { type: 'SESSION' } } } as RegiaProposal
    const analysis = analyzeInterventions({ ...base(), directorProposals: [director], regiaProposals: [regia], missionOutcomes: [{ ...base().missionOutcomes![0], sourceProposalId: 'r1' }] })
    expect(analysis.items[0]).toMatchObject({ directorProposalId: 'd1', regiaProposalId: 'r1', traceComplete: true })
    expect(analysis.funnel).toMatchObject({ proposals: 1, approved: 1, executed: 1, delivered: 1, acknowledged: 1, completed: 1 })
    expect(analyzeInterventions(base()).items[0].traceComplete).toBe(false)
  })

  it('flags missing data and keeps values bounded', () => {
    const suspicion = createSuspicionGraph(['p1', 'p2', 'p3'])
    const quality = analyzeDataQuality({ ...base(), suspicionGraph: setSuspicion(suspicion, { sourcePlayerId: 'p1', targetPlayerId: 'p2', phase: 'DOUBT', confidence: 'HIGH' }) })
    expect(quality.suspicionDataAvailable).toBe(true)
    expect(quality.trustDataAvailable).toBe(false)
    const report = analyzePostGame({ ...base(), suspicionGraph: suspicion })
    expect(report.warnings).toContain('LOW_TRUST_COVERAGE')
    expect(report.missionPerformance.completionRate).toBeGreaterThanOrEqual(0)
    expect(report.missionPerformance.completionRate).toBeLessThanOrEqual(1)
  })

  it('is deterministic and does not mutate input or alter decision/director behavior', () => {
    const input = base()
    const before = JSON.stringify(input)
    const first = analyzePostGame(input)
    const second = analyzePostGame(input)
    expect(first).toEqual(second)
    expect(JSON.stringify(input)).toBe(before)
    const d = decision('LOW_ENGAGEMENT', { phase: 'DOUBT', metrics: {} })
    expect(d.mode).toBe('SUGGEST')
  })

  it('uses event storage as an optional signal without requiring Supabase', () => {
    const store = createBrainEventStore('s1')
    const report = analyzePostGame({ ...base(), eventStore: store })
    expect(report.summary.eventsRecorded).toBe(0)
    expect(report.dataQuality.completeEventTimeline).toBe(false)
  })
})
