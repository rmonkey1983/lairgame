import type { BrainDecision, BrainDecisionEvidence, BrainDecisionSeverity, BrainDecisionType, DecisionThresholdKey } from './brain.types'

/** Tunable policy values. They are policy, not gameplay state. */
export const DECISION_THRESHOLDS: Record<DecisionThresholdKey, number> = {
  minimumSuspicionCoverage: 0.34,
  highLiarExposure: 0.7,
  lowLiarExposure: 0.2,
  theoryCollapse: 0.2,
  minimumTrustCoverage: 0.34,
  highTrustConcentration: 0.7,
  lowParticipationBalance: 0.34,
  inactivePlayerActivity: 0.25,
  minimumEvidencePlayers: 3,
}

export type DecisionOptions = {
  severity?: BrainDecisionSeverity
  scope?: BrainDecision['scope']
  recommendation?: BrainDecision['recommendation']
  evidence?: BrainDecisionEvidence
  priority?: BrainDecision['priority']
  playerId?: string
  tableId?: string
}

export function decision(type: BrainDecisionType, evidence: BrainDecisionEvidence, options: DecisionOptions = {}): BrainDecision {
  return {
    type,
    mode: 'SUGGEST',
    severity: options.severity ?? (type === 'NO_ACTION' ? 'INFO' : 'LOW'),
    scope: options.scope ?? { type: 'SESSION' },
    evidence,
    ...(options.recommendation ? { recommendation: options.recommendation } : {}),
    // Kept for v0.1 consumers; v0.9 deliberately does not emit executable actions.
    priority: options.priority ?? 'low',
    reason: type,
    ...(options.playerId ? { playerId: options.playerId } : {}),
    ...(options.tableId ? { tableId: options.tableId } : {}),
    requiresMcApproval: type !== 'NO_ACTION',
  }
}

export function threshold(key: DecisionThresholdKey): number { return DECISION_THRESHOLDS[key] }
