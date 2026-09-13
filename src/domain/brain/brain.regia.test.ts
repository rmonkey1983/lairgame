import { describe, expect, it } from 'vitest'
import { buildDirectorProposal, type LiveDirectorContext } from './brain.director'
import { decision } from './brain.decisions'
import { buildManualRegiaProposal, buildRegiaProposalFromDirector, approveRegiaProposal, getRegiaControlMode, rejectRegiaProposal, validateRegiaProposal } from './brain.regia'
import { derivePlayerGameProfile } from './brain.profile'
import { createSuspicionGraph } from './brain.suspicion'
import { createTrustGraph } from './brain.trust'

const players = [derivePlayerGameProfile({ playerId: 'p1', publicExposureComfort: 'medium' }), derivePlayerGameProfile({ playerId: 'p2', publicExposureComfort: 'high' })]
const tables = [{ tableId: 't1', playerIds: ['p1', 'p2'], score: 1, metrics: { socialBalance: 1, participationBalance: 1, existingGroupBalance: 1 }, warnings: [] }]
const context = (): LiveDirectorContext => ({
  phase: 'INVESTIGATION', decisions: [], players, tables,
  trustGraph: createTrustGraph(['p1', 'p2']), suspicionGraph: createSuspicionGraph(['p1', 'p2']),
  missionContext: { phase: 'INVESTIGATION', players, trustGraph: createTrustGraph(['p1', 'p2']), suspicionGraph: createSuspicionGraph(['p1', 'p2']) },
})

describe('MC Regia Core v0.12', () => {
  const violations = (result: ReturnType<typeof approveRegiaProposal>) => result.valid ? [] : result.violations

  it('maps Director SUGGEST and OBSERVE to the policy modes', () => {
    const suggest = buildDirectorProposal(decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }), 'INCREASE_PARTICIPATION', context())
    const observe = buildDirectorProposal(decision('LOW_LIAR_EXPOSURE', { phase: 'INVESTIGATION', metrics: {} }), 'OBSERVE', context())
    expect(buildRegiaProposalFromDirector(suggest, context())).toMatchObject({ valid: true, proposal: { controlMode: 'SUGGEST', status: 'PENDING' } })
    expect(buildRegiaProposalFromDirector(observe, context())).toMatchObject({ valid: true, proposal: { controlMode: 'AUTO', status: 'APPROVED' } })
  })

  it('never creates MANUAL from the Director and requires MC for manual commands', () => {
    expect(getRegiaControlMode('START_PHASE')).toBe('MANUAL')
    expect(getRegiaControlMode('OBSERVE')).toBe('AUTO')
    const result = buildManualRegiaProposal('START_PHASE', { commandType: 'START_PHASE', phase: 'REVEAL' }, 'MC')
    expect(result).toMatchObject({ valid: true, proposal: { controlMode: 'MANUAL', status: 'APPROVED' } })
    expect(buildRegiaProposalFromDirector({ ...buildDirectorProposal(decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }), 'INCREASE_PARTICIPATION', context()), strategy: 'START_PHASE' as never }, context())).toMatchObject({ valid: false })
  })

  it('requires explicit MC approval for SUGGEST and preserves terminal status', () => {
    const built = buildRegiaProposalFromDirector(buildDirectorProposal(decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }), 'INCREASE_PARTICIPATION', context()), context())
    if (!built.valid) throw new Error('expected proposal')
    expect(violations(approveRegiaProposal(built.proposal, undefined, context()))).toContain('MC_APPROVAL_REQUIRED')
    const approved = approveRegiaProposal(built.proposal, 'MC', context())
    expect(approved).toMatchObject({ valid: true, proposal: { status: 'APPROVED' } })
    if (approved.valid) expect(violations(approveRegiaProposal(approved.proposal, 'MC', context()))).toContain('PROPOSAL_NOT_PENDING')
    expect(rejectRegiaProposal(built.proposal, 'MC', context())).toMatchObject({ valid: true, proposal: { status: 'REJECTED' } })
  })

  it('rejects forbidden commands and truth mutation even with MC', () => {
    const proposal = { id: 'bad', controlMode: 'MANUAL' as const, status: 'PENDING' as const, commandType: 'CHANGE_SCENARIO_TRUTH' as const, payload: { commandType: 'CHANGE_SCENARIO_TRUTH' as const } }
    expect(violations(validateRegiaProposal(proposal, context()))).toContain('FORBIDDEN_COMMAND')
    expect(approveRegiaProposal(proposal, 'MC', context()).valid).toBe(false)
    expect(violations(validateRegiaProposal({ ...proposal, commandType: 'START_PHASE', payload: { commandType: 'START_PHASE', phase: 'REVEAL' }, controlMode: 'SUGGEST' }, context()))).toContain('CONTROL_POLICY_INVALID')
  })

  it('keeps mission validation mandatory, deterministic, and input immutable', () => {
    const director = buildDirectorProposal(decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }), 'INCREASE_PARTICIPATION', context())
    const before = JSON.stringify(director)
    const first = buildRegiaProposalFromDirector(director, context())
    const second = buildRegiaProposalFromDirector(director, context())
    expect(first).toEqual(second)
    expect(JSON.stringify(director)).toBe(before)
    if (first.valid && 'missionProposal' in first.proposal.payload) expect(first.proposal.payload.missionProposal?.status).toBe('PROPOSED')
  })
})
