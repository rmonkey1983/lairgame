import { CORE_LAWS, isCoreLawEnabled, type CoreLawSet } from './brain.laws'
import { calculateBrainMetrics, profileParticipationScore } from './brain.metrics'
import { decision } from './brain.decisions'
import { buildBrainState } from './brain.state'
import type { BrainEvaluation, BrainInput, BrainState, ScenarioTruth } from './brain.types'

export { buildBrainState, canTransitionBrainPhase, getAllowedBrainPhaseTransitions } from './brain.state'
export { validateBrainAction } from './brain.validator'

export function evaluateBrainState(state: BrainState, scenarioTruth?: ScenarioTruth, coreLaws: CoreLawSet = CORE_LAWS): BrainEvaluation {
  const metrics = calculateBrainMetrics(state, scenarioTruth)
  const evaluatedState: BrainState = { ...state, metrics }
  const decisions = []
  const averageParticipation = state.players.length > 0
    ? state.players.reduce((sum, player) => sum + profileParticipationScore(player), 0) / state.players.length
    : null

  if (averageParticipation === null) decisions.push(decision('NO_ACTION', 'Dati di partecipazione insufficienti.', { priority: 'low' }))
  else if (averageParticipation < 0.34) decisions.push(decision('LOW_ENGAGEMENT', 'La partecipazione rilevata è bassa.', { priority: 'medium', recommendedAction: 'SUGGEST_MC_ACTION' }))

  const inactivePlayer = state.players.find((player) => player.participationLevel === 'low')
  if (inactivePlayer) decisions.push(decision('INACTIVE_PLAYER', 'Un Player risulta con partecipazione bassa.', { priority: 'medium', playerId: inactivePlayer.playerId, recommendedAction: 'ASSIGN_SOCIAL_MISSION' }))

  if (metrics.liarExposure !== null && metrics.liarExposure >= 0.5) decisions.push(decision('HIGH_LIAR_EXPOSURE', 'Il vero Bugiardo è già sospettato da una quota significativa dei Player.', { priority: 'high', recommendedAction: 'SUGGEST_DOUBT_EVENT' }))
  else if (metrics.liarExposure !== null && metrics.liarExposure < 0.25) decisions.push(decision('LOW_LIAR_EXPOSURE', 'Il vero Bugiardo è poco presente nei sospetti registrati.', { priority: 'medium', recommendedAction: 'REQUEST_SUSPICION' }))

  if (metrics.theoryDiversity === 1 && state.socialEdges.some((edge) => edge.active && edge.type === 'SUSPICION') && isCoreLawEnabled(coreLaws, 'TRUST_BEFORE_DOUBT')) decisions.push(decision('THEORY_COLLAPSE', 'I sospetti registrati convergono su una sola teoria.', { priority: 'high', recommendedAction: 'SUGGEST_DOUBT_EVENT' }))
  if (state.socialEdges.some((edge) => edge.active && edge.type === 'TRUST' && edge.phase === 'TRUST')) decisions.push(decision('TRUST_OPPORTUNITY', 'È stata registrata una relazione di fiducia utilizzabile da una dinamica già prevista.', { priority: 'low', recommendedAction: 'SUGGEST_INFORMATION_EVENT' }))

  if (decisions.length === 0) decisions.push(decision('NO_ACTION', 'Nessuna condizione rilevante rilevata.', { priority: 'low' }))
  return { state: evaluatedState, decisions }
}

export function runBrain(input: BrainInput, scenarioTruth?: ScenarioTruth, coreLaws: CoreLawSet = CORE_LAWS): BrainEvaluation {
  return evaluateBrainState(buildBrainState(input), scenarioTruth, coreLaws)
}
