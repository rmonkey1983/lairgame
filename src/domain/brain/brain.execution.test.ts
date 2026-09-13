import { describe, expect, it } from 'vitest'
import { validateApprovedMissionExecution } from './brain.execution'
import type { LiveDirectorContext } from './brain.director'
import type { RegiaProposal } from './brain.regia'

const player = { playerId: 'p1', socialStyle: 'balanced' as const, exposureLevel: 'medium' as const, participationLevel: 'medium' as const, arrivedWithPlayerIds: [], strategyPreference: 'mixed' as const, sources: { socialStyle: 'defaulted' as const, exposureLevel: 'defaulted' as const, participationLevel: 'defaulted' as const, strategyPreference: 'defaulted' as const } }
const target = { ...player, playerId: 'p2' }
const context = (): LiveDirectorContext => ({ phase: 'INVESTIGATION', decisions: [], players: [player, target], tables: [], missionContext: { phase: 'INVESTIGATION', players: [player, target] } })
const proposal: RegiaProposal = { id: 'p1', controlMode: 'SUGGEST', status: 'APPROVED', commandType: 'CHECK_PLAYER', payload: { commandType: 'CHECK_PLAYER', scope: { type: 'PLAYER', playerId: 'p1' }, missionProposal: { missionId: 'm1', type: 'OBSERVE_PLAYER', playerId: 'p1', targetPlayerId: 'p2', phase: 'INVESTIGATION', status: 'PROPOSED', exposureLevel: 'low' } } }

describe('Approved Action Execution Core v0.19', () => {
  it('validates a mission and creates a deterministic execution id without mutation', () => {
    const before = structuredClone(proposal)
    expect(validateApprovedMissionExecution(proposal, { sessionId: 's1', proposalId: 'p1' }, context())).toEqual({ ok: true, proposalId: 'p1', executionId: 'execution:s1:p1', action: 'ACTIVATE_MISSION' })
    expect(proposal).toEqual(before)
  })
  it('fails stale, terminal, unsupported and invalid executions closed', () => {
    expect(validateApprovedMissionExecution({ ...proposal, status: 'PENDING' }, { sessionId: 's1', proposalId: 'p1' }, context())).toMatchObject({ ok: false, reason: 'PROPOSAL_NOT_APPROVED' })
    expect(validateApprovedMissionExecution({ ...proposal, status: 'EXECUTED' }, { sessionId: 's1', proposalId: 'p1' }, context())).toMatchObject({ ok: false, reason: 'ALREADY_EXECUTED' })
    expect(validateApprovedMissionExecution({ ...proposal, controlMode: 'MANUAL' }, { sessionId: 's1', proposalId: 'p1' }, context())).toMatchObject({ ok: false, reason: 'UNSUPPORTED_ACTION' })
    const staleProposal: RegiaProposal = { ...proposal, payload: { commandType: 'CHECK_PLAYER', scope: { type: 'PLAYER', playerId: 'p1' }, missionProposal: { missionId: 'm1', type: 'OBSERVE_PLAYER', playerId: 'p1', targetPlayerId: 'p2', phase: 'FINAL_THEORY', status: 'PROPOSED', exposureLevel: 'low' } } }
    expect(validateApprovedMissionExecution(staleProposal, { sessionId: 's1', proposalId: 'p1' }, context())).toMatchObject({ ok: false, reason: 'PHASE_CHANGED' })
  })
})
