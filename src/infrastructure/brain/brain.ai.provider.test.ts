import { describe, expect, it, vi } from 'vitest'
import { createConfiguredProductionBrainAIProvider, createProductionBrainAIProvider, type BrainAIEndpointRequest } from './brain.ai.provider'
import { buildBrainAIRequest, type BrainAIResponse } from './brain.ai'
import { buildDirectorProposal } from '../../domain/brain/brain.director'
import { decision } from '../../domain/brain/brain.decisions'
import { derivePlayerGameProfile } from '../../domain/brain/brain.profile'
import { createSuspicionGraph } from '../../domain/brain/brain.suspicion'
import { createTrustGraph } from '../../domain/brain/brain.trust'
import type { LiveDirectorContext } from '../../domain/brain/brain.director'

const players = [derivePlayerGameProfile({ playerId: 'p1', publicExposureComfort: 'medium' }), derivePlayerGameProfile({ playerId: 'p2', publicExposureComfort: 'high' })]
const context: LiveDirectorContext = {
  phase: 'INVESTIGATION', decisions: [], players,
  tables: [{ tableId: 't1', playerIds: ['p1', 'p2'], score: 1, metrics: { socialBalance: 1, participationBalance: 1, existingGroupBalance: 1 }, warnings: [] }],
  trustGraph: createTrustGraph(['p1', 'p2']), suspicionGraph: createSuspicionGraph(['p1', 'p2']),
  missionContext: { phase: 'INVESTIGATION', players, trustGraph: createTrustGraph(['p1', 'p2']), suspicionGraph: createSuspicionGraph(['p1', 'p2']) },
}

function request() {
  const proposal = buildDirectorProposal(decision('LOW_ENGAGEMENT', { phase: 'INVESTIGATION', metrics: {} }), 'INCREASE_PARTICIPATION', context)
  return buildBrainAIRequest({ sessionId: 'session-1', phase: 'INVESTIGATION', metrics: { liarExposure: null, roleExposure: { liar: null, accomplice: null, scapegoat: null }, theoryDiversity: null, participationBalance: null, trustCoverage: null, trustConcentration: null, suspicionCoverage: null, theoryShiftRate: null, averageTheoryChanges: null, liarConfidence: null, playerActivity: [], tableMetrics: [] }, decisions: [], allowedDirectorProposals: [proposal], allowedMissionProposals: proposal.missionProposal ? [proposal.missionProposal] : [] })
}

const response: BrainAIResponse = { recommendation: 'NO_INTERVENTION', rationale: { decisionTypes: ['NO_ACTION'], metricSignals: [], reasonCode: 'NO_ACTION' }, confidence: 'LOW' }

describe('Production Brain AI provider v0.16', () => {
  it('posts only the bounded request and prompt to the configured boundary', async () => {
    const fetcher = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]): Promise<Response> => { void args; return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } }) })
    await createProductionBrainAIProvider({ endpoint: 'https://brain.example.test/evaluate', fetcher, getAccessToken: async () => 'staff-jwt' }).evaluate(request())
    const init = fetcher.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(init.body)) as BrainAIEndpointRequest
    expect(fetcher).toHaveBeenCalledWith('https://brain.example.test/evaluate', expect.objectContaining({ method: 'POST', credentials: 'include', headers: expect.objectContaining({ authorization: 'Bearer staff-jwt' }) }))
    expect(body.request.sessionId).toBe('session-1')
    expect(body.prompt).toContain('Choose only from the supplied proposals')
    expect(JSON.stringify(body)).not.toContain('liarPlayerId')
  })

  it('returns structured JSON and rejects non-success responses', async () => {
    const ok = createProductionBrainAIProvider({ endpoint: 'https://brain.example.test', fetcher: vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })) })
    await expect(ok.evaluate(request())).resolves.toEqual(response)
    const rateLimited = createProductionBrainAIProvider({ endpoint: 'https://brain.example.test', fetcher: vi.fn(async () => new Response('busy', { status: 429 })) })
    await expect(rateLimited.evaluate(request())).rejects.toMatchObject({ code: 'RATE_LIMIT' })
  })

  it('fails closed for missing configuration, malformed JSON, and timeout', async () => {
    expect(createConfiguredProductionBrainAIProvider('')).toBeUndefined()
    const malformed = createProductionBrainAIProvider({ endpoint: 'https://brain.example.test', fetcher: vi.fn(async () => new Response('not-json', { status: 200 })) })
    await expect(malformed.evaluate(request())).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    const pending = createProductionBrainAIProvider({ endpoint: 'https://brain.example.test', timeoutMs: 5, fetcher: vi.fn((...args: [RequestInfo | URL, RequestInit?]) => new Promise<Response>((_resolve, reject) => { args[1]?.signal?.addEventListener('abort', () => reject(new Error('aborted'))) })) })
    await expect(pending.evaluate(request())).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})
