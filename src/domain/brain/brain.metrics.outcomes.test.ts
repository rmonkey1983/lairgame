import { describe, expect, it } from 'vitest'
import { calculateMissionOutcomeMetrics, getMissionInterventionTrace } from './brain.metrics'
import type { MissionOutcomeRecord } from './brain.types'

const records: MissionOutcomeRecord[] = [
  { missionId: 'm2', missionType: 'GAIN_TRUST', playerId: 'p2', tableId: 't2', status: 'COMPLETED', acknowledgedAt: 'ack', sourceProposalId: 'regia-2', directorProposalId: 'director-2' },
  { missionId: 'm1', missionType: 'OBSERVE_PLAYER', playerId: 'p1', tableId: 't1', status: 'FAILED', acknowledgedAt: null, sourceProposalId: null },
  { missionId: 'm3', missionType: 'GAIN_TRUST', playerId: 'p1', tableId: 't1', status: 'EXPIRED', acknowledgedAt: 'ack' },
  { missionId: 'm4', missionType: 'OBSERVE_PLAYER', playerId: 'p2', tableId: 't2', status: 'ACTIVE', acknowledgedAt: 'ack' },
]

describe('Mission outcome metrics v0.22', () => {
  it('returns null rates when there are no terminal missions', () => {
    const result = calculateMissionOutcomeMetrics([{ ...records[3] }])
    expect(result.completionRate).toBeNull()
    expect(result.failureRate).toBeNull()
    expect(result.expirationRate).toBeNull()
  })

  it('calculates terminal and acknowledgement rates without causal claims', () => {
    const result = calculateMissionOutcomeMetrics(records)
    expect(result).toMatchObject({ totalActivated: 4, completed: 1, failed: 1, expired: 1, completionRate: 0.333333, failureRate: 0.333333, expirationRate: 0.333333, acknowledgementRate: 0.75 })
    expect(result).not.toHaveProperty('impact')
    expect(result).not.toHaveProperty('score')
  })

  it('returns deterministic type, player and table breakdowns', () => {
    const result = calculateMissionOutcomeMetrics(records)
    expect(result.byMissionType).toEqual([
      { missionType: 'GAIN_TRUST', activated: 2, completed: 1, failed: 0, expired: 1, completionRate: 0.5 },
      { missionType: 'OBSERVE_PLAYER', activated: 2, completed: 0, failed: 1, expired: 0, completionRate: 0 },
    ])
    expect(result.byPlayer.map((item) => item.playerId)).toEqual(['p1', 'p2'])
    expect(result.byTable.map((item) => item.tableId)).toEqual(['t1', 't2'])
    expect(calculateMissionOutcomeMetrics(records)).toEqual(result)
  })

  it('preserves existing intervention links and nulls missing links', () => {
    expect(getMissionInterventionTrace(records[0])).toEqual({ decisionId: null, directorProposalId: 'director-2', regiaProposalId: 'regia-2', missionId: 'm2', outcome: 'COMPLETED' })
    expect(getMissionInterventionTrace(records[2])).toMatchObject({ decisionId: null, directorProposalId: null, regiaProposalId: null })
  })
})
