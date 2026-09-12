import { isCoreLawEnabled, CORE_LAWS, type CoreLawSet } from './brain.laws'
import type { BrainAction, BrainState, ScenarioTruth } from './brain.types'

const allowedActions = new Set([
  'ASSIGN_SOCIAL_MISSION',
  'REQUEST_TRUST_SELECTION',
  'REQUEST_SUSPICION',
  'SUGGEST_DOUBT_EVENT',
  'SUGGEST_INFORMATION_EVENT',
  'SUGGEST_MC_ACTION',
])

export function validateBrainAction(
  action: BrainAction,
  brainState: BrainState,
  scenarioTruth: ScenarioTruth,
  coreLaws: CoreLawSet = CORE_LAWS,
): { valid: boolean; violations: string[] } {
  const violations: string[] = []
  if (!allowedActions.has(action.type)) violations.push('ACTION_NOT_ALLOWED')
  if (action.changesScenarioTruth) violations.push('IMMUTABLE_TRUTH')
  if (isCoreLawEnabled(coreLaws, 'NO_ACTING_REQUIRED') && action.requiresActing) violations.push('ACTING_NOT_REQUIRED')
  if (isCoreLawEnabled(coreLaws, 'SOCIAL_SAFETY') && action.requiresPersonalDisclosure) violations.push('PERSONAL_DISCLOSURE_NOT_ALLOWED')
  if (isCoreLawEnabled(coreLaws, 'PHONE_DOWN') && action.requiresPhone) violations.push('PHONE_REQUIRED')
  if (isCoreLawEnabled(coreLaws, 'INFORMATION_MUST_BE_RESOLVABLE') && action.informationResolvable === false) violations.push('INFORMATION_NOT_RESOLVABLE')
  if (isCoreLawEnabled(coreLaws, 'NO_ONE_KNOWS_EVERYTHING') && action.givesCompleteScenarioKnowledge) violations.push('COMPLETE_SCENARIO_KNOWLEDGE_NOT_ALLOWED')
  if (isCoreLawEnabled(coreLaws, 'ACTION_HAS_CONSEQUENCE') && action.meaningfulConsequence === false) violations.push('MEANINGFUL_CONSEQUENCE_REQUIRED')

  if (action.type === 'ASSIGN_SOCIAL_MISSION') {
    const player = brainState.players.find((candidate) => candidate.playerId === action.playerId)
    const mission = action.mission
    if (!player) violations.push('PLAYER_NOT_FOUND')
    if (!mission) violations.push('MISSION_TEMPLATE_REQUIRED')
    if (mission && !mission.allowedPhases.includes(brainState.phase)) violations.push('MISSION_PHASE_NOT_ALLOWED')
    if (mission && player && !mission.compatibleProfiles.includes(player.socialStyle)) violations.push('MISSION_PROFILE_NOT_COMPATIBLE')
    if (mission && player && mission.requiresPublicExposure && player.exposureLevel === 'low') violations.push('NO_FORCED_EXPOSURE')
    if (mission && player && mission.requiresTarget && !action.targetPlayerId) violations.push('MISSION_TARGET_REQUIRED')
    if (mission && player && mission.exposureLevel === 'high' && player.exposureLevel === 'low') violations.push('NO_FORCED_EXPOSURE')
    if (isCoreLawEnabled(coreLaws, 'SOCIAL_MISSIONS_FIRST') && !mission) violations.push('SOCIAL_MISSION_REQUIRED')
  }

  if (action.type === 'SUGGEST_DOUBT_EVENT') {
    const hasTrust = brainState.socialEdges.some((edge) => edge.active && edge.type === 'TRUST')
    if (isCoreLawEnabled(coreLaws, 'TRUST_BEFORE_DOUBT') && (!hasTrust || brainState.phase !== 'DOUBT')) violations.push('TRUST_REQUIRED_BEFORE_DOUBT')
  }

  if (isCoreLawEnabled(coreLaws, 'IMMUTABLE_TRUTH') && scenarioTruth.liarPlayerId.length === 0) violations.push('SCENARIO_TRUTH_INVALID')
  return { valid: violations.length === 0, violations: [...new Set(violations)] }
}
