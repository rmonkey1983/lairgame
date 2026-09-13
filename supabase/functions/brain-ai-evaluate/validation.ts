export type BrainAIValidationResult = { valid: true } | { valid: false; reason: 'MALFORMED_REQUEST' | 'FORBIDDEN_FIELD' }

const requestKeys = new Set(['sessionId', 'phase', 'metrics', 'decisions', 'allowedDirectorProposals', 'allowedMissionProposals', 'constraints'])
const metricKeys = new Set(['liarExposure', 'roleExposure', 'theoryDiversity', 'participationBalance', 'trustCoverage', 'trustConcentration', 'suspicionCoverage', 'theoryShiftRate', 'averageTheoryChanges', 'liarConfidence', 'playerActivity', 'tableMetrics'])
const proposalKeys = new Set(['id', 'mode', 'sourceDecisionType', 'strategy', 'scope', 'priority', 'evidence', 'missionProposal', 'status'])
const missionKeys = new Set(['missionId', 'type', 'playerId', 'targetPlayerId', 'phase', 'status', 'exposureLevel'])
const forbiddenKeyPattern = /(?:scenario.?truth|real.?name|email|phone|age|gender|personal|auth|credential|password|secret|database|db.?row|token|tool)/i

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function exactKeys(value: Record<string, unknown>, allowed: Set<string>): boolean { return Object.keys(value).every((key) => allowed.has(key)) }

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => forbiddenKeyPattern.test(key) || containsForbiddenKey(child))
}

function validMetrics(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, metricKeys)) return false
  return Array.isArray(value.playerActivity) && Array.isArray(value.tableMetrics) && isRecord(value.roleExposure)
}

function validProposal(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, proposalKeys)) return false
  if (typeof value.id !== 'string' || value.mode !== 'SUGGEST' || typeof value.strategy !== 'string' || value.status !== 'PROPOSED') return false
  if (!isRecord(value.scope) || !isRecord(value.evidence)) return false
  return value.missionProposal === undefined || validMission(value.missionProposal)
}

function validMission(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, missionKeys)) return false
  return typeof value.missionId === 'string' && typeof value.type === 'string' && typeof value.playerId === 'string' && typeof value.phase === 'string' && value.status === 'PROPOSED' && typeof value.exposureLevel === 'string'
}

export function validateBrainAIRequestEnvelope(value: unknown): BrainAIValidationResult {
  if (!isRecord(value) || !exactKeys(value, new Set(['request', 'prompt'])) || typeof value.prompt !== 'string' || !isRecord(value.request)) return { valid: false, reason: 'MALFORMED_REQUEST' }
  if (containsForbiddenKey(value)) return { valid: false, reason: 'FORBIDDEN_FIELD' }
  const request = value.request
  if (!exactKeys(request, requestKeys) || typeof request.sessionId !== 'string' || typeof request.phase !== 'string' || !validMetrics(request.metrics)) return { valid: false, reason: 'MALFORMED_REQUEST' }
  if (!Array.isArray(request.decisions) || !Array.isArray(request.allowedDirectorProposals) || !Array.isArray(request.allowedMissionProposals) || !isRecord(request.constraints)) return { valid: false, reason: 'MALFORMED_REQUEST' }
  if (!request.allowedDirectorProposals.every(validProposal) || !request.allowedMissionProposals.every(validMission)) return { valid: false, reason: 'MALFORMED_REQUEST' }
  return { valid: true }
}

export function isStructuredBrainAIResponse(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const keys = new Set(['selectedProposalId', 'selectedMissionId', 'recommendation', 'rationale', 'confidence', 'explanation'])
  if (!exactKeys(value, keys) || !['SELECT_PROPOSAL', 'NO_INTERVENTION'].includes(String(value.recommendation)) || !['LOW', 'MEDIUM', 'HIGH'].includes(String(value.confidence))) return false
  if (!isRecord(value.rationale) || !exactKeys(value.rationale, new Set(['decisionTypes', 'metricSignals', 'reasonCode']))) return false
  return Array.isArray(value.rationale.decisionTypes) && Array.isArray(value.rationale.metricSignals) && typeof value.rationale.reasonCode === 'string' && (value.explanation === undefined || typeof value.explanation === 'string')
}

export function hasActiveStaffAccess(value: unknown): boolean { return Array.isArray(value) && value.length > 0 }
