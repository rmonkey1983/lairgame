import { CORE_LAWS, isCoreLawEnabled, type CoreLawSet } from './brain.laws'
import { calculateBrainMetrics, type BrainMetricsContext } from './brain.metrics'
import { DECISION_THRESHOLDS, decision } from './brain.decisions'
import { buildBrainState } from './brain.state'
import type { BrainDecision, BrainEvaluation, BrainInput, BrainState, ScenarioTruth, TableBrainMetrics } from './brain.types'

export { buildBrainState, canTransitionBrainPhase, getAllowedBrainPhaseTransitions } from './brain.state'
export { validateBrainAction } from './brain.validator'

const advancedPhases = new Set(['DOUBT', 'FINAL_THEORY', 'VOTING', 'LOCKED', 'REVEAL', 'RESULTS'])

function hasEnoughSuspicion(metrics: BrainState['metrics']): boolean {
  return metrics.suspicionCoverage !== null && metrics.suspicionCoverage >= DECISION_THRESHOLDS.minimumSuspicionCoverage
}

function evidence(state: BrainState, metrics: BrainState['metrics'], extra: Partial<Parameters<typeof decision>[1]> = {}): Parameters<typeof decision>[1] {
  return {
    phase: state.phase,
    metrics: {
      liarExposure: metrics.liarExposure,
      suspicionCoverage: metrics.suspicionCoverage,
      theoryDiversity: metrics.theoryDiversity,
      participationBalance: metrics.participationBalance,
      trustCoverage: metrics.trustCoverage,
      trustConcentration: metrics.trustConcentration,
      theoryShiftRate: metrics.theoryShiftRate,
      averageTheoryChanges: metrics.averageTheoryChanges,
      liarConfidence: metrics.liarConfidence,
    },
    thresholds: { ...DECISION_THRESHOLDS },
    playerActivity: metrics.playerActivity,
    ...extra,
  }
}

function mostSuspectedPlayerId(state: BrainState, context: BrainMetricsContext): string | undefined {
  const counts = new Map<string, number>()
  const edges = context.suspicionGraph?.edges ?? state.socialEdges
  for (const edge of edges) {
    if (edge.active && edge.type === 'SUSPICION') counts.set(edge.targetPlayerId, (counts.get(edge.targetPlayerId) ?? 0) + 1)
  }
  return [...counts.entries()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))[0]?.[0]
}

function currentTrustConcentrationTarget(state: BrainState, context: BrainMetricsContext): string | undefined {
  const counts = new Map<string, number>()
  const edges = context.trustGraph?.edges ?? state.socialEdges.filter((edge) => edge.active && edge.type === 'TRUST')
  for (const edge of edges) if (edge.active && edge.type === 'TRUST') counts.set(edge.targetPlayerId, (counts.get(edge.targetPlayerId) ?? 0) + 1)
  return [...counts.entries()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))[0]?.[0]
}

function tableIsImbalanced(table: TableBrainMetrics, peers: TableBrainMetrics[]): boolean {
  const comparable = peers.filter((peer) => peer.tableId !== table.tableId && peer.suspicionCoverage !== null && peer.participationBalance !== null)
  if (table.suspicionCoverage === null || table.participationBalance === null || comparable.length === 0) return false
  const suspicionAverage = comparable.reduce((sum, peer) => sum + (peer.suspicionCoverage ?? 0), 0) / comparable.length
  const participationAverage = comparable.reduce((sum, peer) => sum + (peer.participationBalance ?? 0), 0) / comparable.length
  return table.suspicionCoverage < suspicionAverage && table.participationBalance < participationAverage
}

function buildDecisions(state: BrainState, metrics: BrainState['metrics'], context: BrainMetricsContext, coreLaws: CoreLawSet): BrainDecision[] {
  const decisions: BrainDecision[] = []
  const shared = evidence(state, metrics)
  const enoughSuspicion = hasEnoughSuspicion(metrics)
  const enoughPlayers = state.players.length >= DECISION_THRESHOLDS.minimumEvidencePlayers
  const advanced = advancedPhases.has(state.phase)

  if (metrics.liarExposure !== null && enoughSuspicion && metrics.liarExposure >= DECISION_THRESHOLDS.highLiarExposure) {
    decisions.push(decision('HIGH_LIAR_EXPOSURE', evidence(state, metrics), { severity: 'HIGH', priority: 'high', recommendation: { type: 'REDUCE_DIRECT_PRESSURE' } }))
  } else if (metrics.liarExposure !== null && enoughSuspicion && advanced && metrics.liarExposure <= DECISION_THRESHOLDS.lowLiarExposure) {
    decisions.push(decision('LOW_LIAR_EXPOSURE', evidence(state, metrics), { severity: 'MEDIUM', priority: 'medium', recommendation: { type: 'INCREASE_THEORY_DIVERSITY' } }))
  }

  if (metrics.theoryDiversity !== null && enoughSuspicion && metrics.theoryDiversity <= DECISION_THRESHOLDS.theoryCollapse && isCoreLawEnabled(coreLaws, 'TRUST_BEFORE_DOUBT')) {
    decisions.push(decision('THEORY_COLLAPSE', evidence(state, metrics, { mostSuspectedPlayerId: mostSuspectedPlayerId(state, context) }), { severity: 'HIGH', priority: 'high', recommendation: { type: 'INCREASE_THEORY_DIVERSITY' } }))
  }

  const enoughTrust = metrics.trustCoverage !== null && metrics.trustCoverage >= DECISION_THRESHOLDS.minimumTrustCoverage
  if (enoughTrust && metrics.trustConcentration !== null && metrics.trustConcentration >= DECISION_THRESHOLDS.highTrustConcentration) {
    const trustTarget = currentTrustConcentrationTarget(state, context)
    decisions.push(decision('TRUST_OPPORTUNITY', shared, { severity: 'INFO', scope: trustTarget ? { type: 'PLAYER', playerId: trustTarget } : undefined, recommendation: { type: 'CREATE_TRUST_OPPORTUNITY' } }))
  }

  const activity = metrics.playerActivity
  const hasActivityEvidence = enoughPlayers && activity.some((metric) => metric.eventCount > 0)
  if (advanced && hasActivityEvidence && metrics.participationBalance !== null && metrics.participationBalance <= DECISION_THRESHOLDS.lowParticipationBalance) {
    decisions.push(decision('LOW_ENGAGEMENT', shared, { severity: 'MEDIUM', priority: 'medium', recommendation: { type: 'INVITE_BROADER_PARTICIPATION' } }))
  }

  if (advanced && hasActivityEvidence && activity.length >= DECISION_THRESHOLDS.minimumEvidencePlayers) {
    const inactive = activity.find((metric) => metric.normalizedActivity <= DECISION_THRESHOLDS.inactivePlayerActivity && metric.eventCount < Math.max(...activity.map((item) => item.eventCount)))
    if (inactive) decisions.push(decision('INACTIVE_PLAYER', evidence(state, metrics, { playerActivity: activity }), { severity: 'LOW', scope: { type: 'PLAYER', playerId: inactive.playerId }, playerId: inactive.playerId, recommendation: { type: 'INVITE_BROADER_PARTICIPATION' } }))
  }

  const imbalanced = metrics.tableMetrics.find((table) => tableIsImbalanced(table, metrics.tableMetrics))
  if (imbalanced) decisions.push(decision('TABLE_IMBALANCE', evidence(state, metrics, { tableMetrics: imbalanced }), { severity: 'LOW', scope: { type: 'TABLE', tableId: imbalanced.tableId }, tableId: imbalanced.tableId, recommendation: { type: 'INVITE_BROADER_PARTICIPATION' } }))

  if (decisions.length === 0) decisions.push(decision('NO_ACTION', shared, { severity: 'INFO' }))
  return decisions
}

function isMetricsContext(value: BrainMetricsContext | CoreLawSet): value is BrainMetricsContext {
  return !Array.isArray(value)
}

export function evaluateBrainState(state: BrainState, scenarioTruth?: ScenarioTruth, contextOrCoreLaws: BrainMetricsContext | CoreLawSet = {}, coreLaws: CoreLawSet = CORE_LAWS): BrainEvaluation {
  const context = isMetricsContext(contextOrCoreLaws) ? contextOrCoreLaws : {}
  const laws = isMetricsContext(contextOrCoreLaws) ? coreLaws : contextOrCoreLaws
  const metrics = calculateBrainMetrics(state, scenarioTruth, context)
  const evaluatedState: BrainState = { ...state, metrics }
  return { state: evaluatedState, decisions: buildDecisions(evaluatedState, metrics, context, laws) }
}

export function runBrain(input: BrainInput, scenarioTruth?: ScenarioTruth, contextOrCoreLaws: BrainMetricsContext | CoreLawSet = {}, coreLaws: CoreLawSet = CORE_LAWS): BrainEvaluation {
  return evaluateBrainState(buildBrainState(input), scenarioTruth, contextOrCoreLaws, coreLaws)
}
