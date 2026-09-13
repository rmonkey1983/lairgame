import { describe, expect, it, vi } from 'vitest'
import { buildBrainAIRequest, buildBrainAIPrompt, buildRegiaProposalFromAI, evaluateWithBrainAI, selectDirectorProposalFromAI, validateBrainAIResponse, type BrainAIRequest, type BrainAIResponse } from './brain.ai'
import { buildDirectorProposal, type LiveDirectorContext } from '../../domain/brain/brain.director'
import { decision } from '../../domain/brain/brain.decisions'
import { derivePlayerGameProfile } from '../../domain/brain/brain.profile'
import { createSuspicionGraph } from '../../domain/brain/brain.suspicion'
import { createTrustGraph } from '../../domain/brain/brain.trust'

const players = [derivePlayerGameProfile({ playerId: 'p1', publicExposureComfort: 'medium' }), derivePlayerGameProfile({ playerId: 'p2', publicExposureComfort: 'high' })]
const context = (): LiveDirectorContext => ({
  phase: 'INVESTIGATION', decisions: [], players,
  tables: [{ tableId: 't1', playerIds: ['p1', 'p2'], score: 1, metrics: { socialBalance: 1, participationBalance: 1, existingGroupBalance: 1 }, warnings: [] }],
  trustGraph: createTrustGraph(['p1', 'p2']), suspicionGraph: createSuspicionGraph(['p1', 'p2']),
  missionContext: { phase: 'INVESTIGATION', players, trustGraph: createTrustGraph(['p1', 'p2']), suspicionGraph: createSuspicionGraph(['p1', 'p2']) },
})

function request(): BrainAIRequest {
  const director = buildDirectorProposal(decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }), 'INCREASE_PARTICIPATION', context())
  return buildBrainAIRequest({ sessionId: 'session-1', phase: 'INVESTIGATION', metrics: { liarExposure: null, roleExposure: { liar: null, accomplice: null, scapegoat: null }, theoryDiversity: null, participationBalance: null, trustCoverage: null, trustConcentration: null, suspicionCoverage: null, theoryShiftRate: null, averageTheoryChanges: null, liarConfidence: null, playerActivity: [], tableMetrics: [] }, decisions: [decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} })], allowedDirectorProposals: [director], allowedMissionProposals: director.missionProposal ? [director.missionProposal] : [] })
}

const validResponse = (proposalId: string): BrainAIResponse => ({ selectedProposalId: proposalId, recommendation: 'SELECT_PROPOSAL', rationale: { decisionTypes: ['LOW_ENGAGEMENT'], metricSignals: ['low participation'], reasonCode: 'PROPOSAL_SELECTED' }, confidence: 'HIGH', explanation: 'MC explanation only.' })

describe('Brain AI Layer v0.15', () => {
  it('skips when disabled or when there are no options', async () => {
    const input = request()
    expect(await evaluateWithBrainAI(input, { evaluate: vi.fn() }, { aiEnabled: false })).toEqual({ status: 'SKIPPED', reason: 'AI_DISABLED' })
    expect(await evaluateWithBrainAI({ ...input, allowedDirectorProposals: [] }, { evaluate: vi.fn() }, { aiEnabled: true })).toEqual({ status: 'SKIPPED', reason: 'NO_ALLOWED_PROPOSALS' })
  })

  it('accepts only an allowed selection and keeps Regia policy authoritative', async () => {
    const input = request()
    const provider = { evaluate: vi.fn(async () => validResponse(input.allowedDirectorProposals[0].id)) }
    const result = await evaluateWithBrainAI(input, provider, { aiEnabled: true })
    expect(result.status).toBe('USED')
    expect(selectDirectorProposalFromAI(input, result)).toEqual(input.allowedDirectorProposals[0])
    const regia = buildRegiaProposalFromAI(input, result, context())
    expect(regia).toMatchObject({ valid: true, proposal: { controlMode: 'SUGGEST', status: 'PENDING' } })
    expect(provider.evaluate).toHaveBeenCalledWith(expect.objectContaining({ constraints: expect.objectContaining({ canExecute: false, scenarioTruthAvailable: false }) }))
  })

  it('fails closed for invented proposals, strategies, missions, commands, truth and extra fields', () => {
    const input = request()
    const base = validResponse('unknown')
    expect(validateBrainAIResponse(base, input).valid).toBe(false)
    expect(validateBrainAIResponse({ ...base, selectedProposalId: input.allowedDirectorProposals[0].id, strategy: 'CREATE_DRAMA' }, input).valid).toBe(false)
    expect(validateBrainAIResponse({ ...base, selectedProposalId: input.allowedDirectorProposals[0].id, controlMode: 'AUTO' }, input).valid).toBe(false)
    expect(validateBrainAIResponse({ ...base, selectedProposalId: input.allowedDirectorProposals[0].id, commandType: 'START_PHASE' }, input).valid).toBe(false)
    expect(validateBrainAIResponse({ ...base, selectedProposalId: input.allowedDirectorProposals[0].id, scenarioTruth: { liarPlayerId: 'p1' } }, input).valid).toBe(false)
    expect(validateBrainAIResponse({ ...base, selectedProposalId: input.allowedDirectorProposals[0].id, selectedMissionId: 'unknown' }, input).valid).toBe(false)
  })

  it('accepts no intervention and rejects malformed or invalid provider output with fallback', async () => {
    const input = request()
    const noAction: BrainAIResponse = { recommendation: 'NO_INTERVENTION', rationale: { decisionTypes: ['NO_ACTION'], metricSignals: [], reasonCode: 'NO_ACTION' }, confidence: 'LOW' }
    expect((await evaluateWithBrainAI(input, { evaluate: async () => noAction }, { aiEnabled: true })).status).toBe('USED')
    expect((await evaluateWithBrainAI(input, { evaluate: async () => ({ nope: true }) }, { aiEnabled: true })).status).toBe('FALLBACK')
    expect((await evaluateWithBrainAI(input, { evaluate: async () => { throw new Error('provider down') } }, { aiEnabled: true })).status).toBe('FALLBACK')
  })

  it('times out once, uses deterministic fallback, and does not mutate input', async () => {
    const input = request()
    const before = JSON.stringify(input)
    const result = await evaluateWithBrainAI(input, { evaluate: () => new Promise(() => undefined) }, { aiEnabled: true, timeoutMs: 5 })
    expect(result).toMatchObject({ status: 'FALLBACK', reason: 'TIMEOUT', response: { selectedProposalId: input.allowedDirectorProposals[0].id } })
    expect(JSON.stringify(input)).toBe(before)
  })

  it('builds a deterministic, privacy-bounded prompt', () => {
    const input = request()
    expect(buildBrainAIPrompt(input)).toBe(buildBrainAIPrompt(input))
    expect(buildBrainAIPrompt(input)).toContain('Do not invent actions')
    expect(buildBrainAIPrompt(input)).not.toContain('liarPlayerId')
  })
})
