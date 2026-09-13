import type { DirectorProposal, LiveDirectorContext } from '../../domain/brain/brain.director'
import { buildRegiaProposalFromDirector, type RegiaProposal } from '../../domain/brain/brain.regia'
import type { BrainDecision, BrainDecisionType, BrainMetrics, GamePhase, MissionInstance } from '../../domain/brain/brain.types'

export type BrainAIReasonCode =
  | 'NO_ACTION'
  | 'LOW_PARTICIPATION'
  | 'HIGH_LIAR_EXPOSURE'
  | 'THEORY_COLLAPSE'
  | 'TRUST_OPPORTUNITY'
  | 'TABLE_IMBALANCE'
  | 'PROPOSAL_SELECTED'
  | 'CONTEXT_INSUFFICIENT'

export type BrainAIConstraints = {
  readonly allowedStrategies: readonly DirectorProposal['strategy'][]
  readonly allowedMissionTypes: readonly MissionInstance['type'][]
  readonly forbiddenCommands: readonly string[]
  readonly scenarioTruthAvailable: false
  readonly canExecute: false
}

export type BrainAIRequest = {
  readonly sessionId: string
  readonly phase: GamePhase
  readonly metrics: BrainMetrics
  readonly decisions: readonly BrainDecision[]
  readonly allowedDirectorProposals: readonly DirectorProposal[]
  readonly allowedMissionProposals: readonly MissionInstance[]
  readonly constraints: BrainAIConstraints
}

export type BrainAIRationale = {
  readonly decisionTypes: readonly BrainDecisionType[]
  readonly metricSignals: readonly string[]
  readonly reasonCode: BrainAIReasonCode
}

export type BrainAIResponse = {
  readonly selectedProposalId?: string
  readonly selectedMissionId?: string
  readonly recommendation: 'SELECT_PROPOSAL' | 'NO_INTERVENTION'
  readonly rationale: BrainAIRationale
  readonly confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  readonly explanation?: string
}

export type ValidatedBrainAIResponse = BrainAIResponse

export type BrainAIProvider = {
  evaluate(request: BrainAIRequest): Promise<unknown>
}

export type BrainAIProviderFailureCode = 'RATE_LIMIT' | 'HTTP_ERROR' | 'NETWORK_ERROR' | 'MALFORMED_RESPONSE' | 'MISSING_CONFIGURATION'

export class BrainAIProviderError extends Error {
  readonly code: BrainAIProviderFailureCode

  constructor(code: BrainAIProviderFailureCode) {
    super(code)
    this.name = 'BrainAIProviderError'
    this.code = code
  }
}

export type BrainAIEvaluationResult =
  | { status: 'USED'; response: ValidatedBrainAIResponse }
  | { status: 'SKIPPED'; reason: BrainAISkipReason }
  | { status: 'FALLBACK'; reason: BrainAIFallbackReason; response: ValidatedBrainAIResponse }

export type BrainAISkipReason = 'AI_DISABLED' | 'NO_PROVIDER' | 'NO_ALLOWED_PROPOSALS'
export type BrainAIFallbackReason = 'PROVIDER_FAILED' | 'RATE_LIMIT' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'VALIDATION_FAILED'

const decisionTypes = new Set<BrainDecisionType>([
  'NO_ACTION', 'LOW_ENGAGEMENT', 'HIGH_LIAR_EXPOSURE', 'LOW_LIAR_EXPOSURE',
  'THEORY_COLLAPSE', 'TRUST_OPPORTUNITY', 'INACTIVE_PLAYER', 'TABLE_IMBALANCE',
])
const reasonCodes = new Set<BrainAIReasonCode>([
  'NO_ACTION', 'LOW_PARTICIPATION', 'HIGH_LIAR_EXPOSURE', 'THEORY_COLLAPSE',
  'TRUST_OPPORTUNITY', 'TABLE_IMBALANCE', 'PROPOSAL_SELECTED', 'CONTEXT_INSUFFICIENT',
])
const responseKeys = new Set(['selectedProposalId', 'selectedMissionId', 'recommendation', 'rationale', 'confidence', 'explanation'])
const rationaleKeys = new Set(['decisionTypes', 'metricSignals', 'reasonCode'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

function isConfidence(value: unknown): value is BrainAIResponse['confidence'] {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH'
}

function isRecommendation(value: unknown): value is BrainAIResponse['recommendation'] {
  return value === 'SELECT_PROPOSAL' || value === 'NO_INTERVENTION'
}

export type BrainAIValidationResult =
  | { valid: true; response: ValidatedBrainAIResponse }
  | { valid: false; violations: string[] }

export function validateBrainAIResponse(value: unknown, request: BrainAIRequest): BrainAIValidationResult {
  const violations: string[] = []
  if (!isRecord(value) || !hasOnlyKeys(value, responseKeys)) return { valid: false, violations: ['MALFORMED_RESPONSE'] }
  if (!isRecommendation(value.recommendation)) violations.push('INVALID_RECOMMENDATION')
  if (!isConfidence(value.confidence)) violations.push('INVALID_CONFIDENCE')
  if (!isRecord(value.rationale) || !hasOnlyKeys(value.rationale, rationaleKeys)) violations.push('INVALID_RATIONALE')

  const rationale = value.rationale
  if (isRecord(rationale)) {
    if (!Array.isArray(rationale.decisionTypes) || !rationale.decisionTypes.every((item) => typeof item === 'string' && decisionTypes.has(item as BrainDecisionType))) violations.push('INVALID_DECISION_TYPES')
    if (!Array.isArray(rationale.metricSignals) || !rationale.metricSignals.every((item) => typeof item === 'string')) violations.push('INVALID_METRIC_SIGNALS')
    if (typeof rationale.reasonCode !== 'string' || !reasonCodes.has(rationale.reasonCode as BrainAIReasonCode)) violations.push('INVALID_REASON_CODE')
  }
  if ('explanation' in value && value.explanation !== undefined && typeof value.explanation !== 'string') violations.push('INVALID_EXPLANATION')

  const proposalIds = new Set(request.allowedDirectorProposals.map((proposal) => proposal.id))
  const missionIds = new Set(request.allowedMissionProposals.map((mission) => mission.missionId))
  const selectedProposal = typeof value.selectedProposalId === 'string' ? request.allowedDirectorProposals.find((proposal) => proposal.id === value.selectedProposalId) : undefined
  if (value.recommendation === 'SELECT_PROPOSAL') {
    if (typeof value.selectedProposalId !== 'string' || !proposalIds.has(value.selectedProposalId)) violations.push('PROPOSAL_NOT_ALLOWED')
    if (selectedProposal?.missionProposal && !missionIds.has(selectedProposal.missionProposal.missionId)) violations.push('MISSION_NOT_ALLOWED')
  } else if ('selectedProposalId' in value && value.selectedProposalId !== undefined) violations.push('UNEXPECTED_SELECTION')
  if ('selectedMissionId' in value && value.selectedMissionId !== undefined && (typeof value.selectedMissionId !== 'string' || !missionIds.has(value.selectedMissionId))) violations.push('MISSION_NOT_ALLOWED')
  if (selectedProposal?.missionProposal && typeof value.selectedMissionId === 'string' && value.selectedMissionId !== selectedProposal.missionProposal.missionId) violations.push('MISSION_SELECTION_MISMATCH')
  if (value.recommendation === 'NO_INTERVENTION' && 'selectedMissionId' in value && value.selectedMissionId !== undefined) violations.push('UNEXPECTED_MISSION_SELECTION')
  return violations.length > 0 ? { valid: false, violations: [...new Set(violations)] } : { valid: true, response: value as ValidatedBrainAIResponse }
}

function cloneRequest(request: BrainAIRequest): BrainAIRequest {
  return {
    ...request,
    metrics: structuredClone(request.metrics),
    decisions: structuredClone(request.decisions),
    allowedDirectorProposals: structuredClone(request.allowedDirectorProposals),
    allowedMissionProposals: structuredClone(request.allowedMissionProposals),
    constraints: {
      ...request.constraints,
      allowedStrategies: [...request.constraints.allowedStrategies],
      allowedMissionTypes: [...request.constraints.allowedMissionTypes],
      forbiddenCommands: [...request.constraints.forbiddenCommands],
    },
  }
}

export function buildBrainAIRequest(input: Omit<BrainAIRequest, 'constraints'> & { constraints?: Partial<BrainAIConstraints> }): BrainAIRequest {
  const request: BrainAIRequest = {
    ...input,
    constraints: {
      allowedStrategies: input.allowedDirectorProposals.map((proposal) => proposal.strategy),
      allowedMissionTypes: input.allowedMissionProposals.map((mission) => mission.type),
      forbiddenCommands: ['CHANGE_SCENARIO_TRUTH', 'REASSIGN_LIAR_AFTER_START', 'REASSIGN_ACCOMPLICE_AFTER_START', 'REASSIGN_SCAPEGOAT_AFTER_START', 'BYPASS_MISSION_VALIDATOR'],
      scenarioTruthAvailable: false,
      canExecute: false,
      ...input.constraints,
    },
  }
  return cloneRequest(request)
}

export function buildBrainAIPrompt(request: BrainAIRequest): string {
  return [
    'Choose only from the supplied proposals or return NO_INTERVENTION.',
    'Do not invent actions, missions, targets, roles, phases, or scenario truth.',
    'Return strict JSON matching the supplied response schema. Do not execute anything.',
    JSON.stringify({ sessionId: request.sessionId, phase: request.phase, metrics: request.metrics, decisions: request.decisions, allowedDirectorProposals: request.allowedDirectorProposals, allowedMissionProposals: request.allowedMissionProposals, constraints: request.constraints }),
  ].join('\n')
}

function fallbackResponse(request: BrainAIRequest): ValidatedBrainAIResponse {
  const proposal = [...request.allowedDirectorProposals]
    .sort((first, second) => (second.priority.localeCompare(first.priority) || first.id.localeCompare(second.id)))[0]
  if (!proposal) return { recommendation: 'NO_INTERVENTION', rationale: { decisionTypes: ['NO_ACTION'], metricSignals: [], reasonCode: 'NO_ACTION' }, confidence: 'LOW' }
  return {
    selectedProposalId: proposal.id,
    recommendation: 'SELECT_PROPOSAL',
    rationale: { decisionTypes: [proposal.sourceDecisionType], metricSignals: [], reasonCode: 'PROPOSAL_SELECTED' },
    confidence: 'LOW',
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('BRAIN_AI_TIMEOUT')), timeoutMs) })
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer) })
}

export async function evaluateWithBrainAI(request: BrainAIRequest, provider: BrainAIProvider | undefined, options: { aiEnabled: boolean; timeoutMs?: number }): Promise<BrainAIEvaluationResult> {
  if (!options.aiEnabled) return { status: 'SKIPPED', reason: 'AI_DISABLED' }
  if (request.allowedDirectorProposals.length === 0) return { status: 'SKIPPED', reason: 'NO_ALLOWED_PROPOSALS' }
  if (!provider) return { status: 'SKIPPED', reason: 'NO_PROVIDER' }
  try {
    const response = await withTimeout(provider.evaluate(cloneRequest(request)), options.timeoutMs ?? 1500)
    const validation = validateBrainAIResponse(response, request)
    if (!validation.valid) return { status: 'FALLBACK', reason: 'VALIDATION_FAILED', response: fallbackResponse(request) }
    return { status: 'USED', response: validation.response }
  } catch (error) {
    const reason: BrainAIFallbackReason = error instanceof Error && error.message === 'BRAIN_AI_TIMEOUT'
      ? 'TIMEOUT'
      : error instanceof BrainAIProviderError && error.code === 'RATE_LIMIT'
        ? 'RATE_LIMIT'
        : 'PROVIDER_FAILED'
    return { status: 'FALLBACK', reason, response: fallbackResponse(request) }
  }
}

export function selectDirectorProposalFromAI(request: BrainAIRequest, result: BrainAIEvaluationResult): DirectorProposal | undefined {
  if (result.status === 'SKIPPED' || result.response.recommendation === 'NO_INTERVENTION') return undefined
  return request.allowedDirectorProposals.find((proposal) => proposal.id === result.response.selectedProposalId)
}

export function buildRegiaProposalFromAI(request: BrainAIRequest, result: BrainAIEvaluationResult, context: LiveDirectorContext): { valid: true; proposal: RegiaProposal } | { valid: false; violations: string[] } | undefined {
  const directorProposal = selectDirectorProposalFromAI(request, result)
  if (!directorProposal) return undefined
  const regia = buildRegiaProposalFromDirector(directorProposal, context)
  return regia.valid ? regia : { valid: false, violations: regia.violations }
}
