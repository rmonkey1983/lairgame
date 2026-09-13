import { getCompatibleMissionTypes, getProfileCapabilities } from './brain.profile'
import { getPlayersSuspecting } from './brain.suspicion'
import { getTrustedPlayers } from './brain.trust'
import type {
  ExposureLevel,
  GamePhase,
  MissionCompatibilityResult,
  MissionContext,
  MissionDefinition,
  MissionInstance,
  MissionProposalResult,
  MissionTemplate,
  MissionTargetRequirement,
  MissionType,
  PlayerGameProfile,
  SocialStyle,
} from './brain.types'

const socialProfiles: SocialStyle[] = ['observer', 'balanced', 'expressive']
const interactivePhases: GamePhase[] = ['TRUST', 'INVESTIGATION', 'DOUBT', 'FINAL_THEORY']

const definition = (
  type: MissionType,
  category: MissionDefinition['category'],
  allowedPhases: GamePhase[],
  compatibleProfiles: SocialStyle[],
  exposureLevel: ExposureLevel,
  targetRequirement: MissionTargetRequirement,
  options: Partial<Pick<MissionDefinition, 'requiresPublicExposure' | 'socialFirst' | 'constraints' | 'availability'>> = {},
): MissionDefinition => ({
  type,
  category,
  allowedPhases,
  compatibleProfiles,
  exposureLevel,
  requiresTarget: targetRequirement !== 'NONE',
  targetRequirement,
  socialFirst: options.socialFirst ?? true,
  constraints: options.constraints ?? ['SOCIAL_FIRST', 'NO_FORCED_EXPOSURE'],
  availability: options.availability ?? 'AVAILABLE',
  ...(options.requiresPublicExposure === undefined ? {} : { requiresPublicExposure: options.requiresPublicExposure }),
})

export const MISSION_DEFINITIONS: readonly MissionDefinition[] = [
  definition('OBSERVE_PLAYER', 'OBSERVATION', ['SOCIAL_WARMUP', 'TRUST', 'INVESTIGATION', 'DOUBT'], socialProfiles, 'low', 'PLAYER'),
  definition('VERIFY_STATEMENT', 'INFORMATION', ['INVESTIGATION', 'DOUBT'], ['balanced', 'expressive'], 'medium', 'SUSPECTED_PLAYER', { constraints: ['SOCIAL_FIRST', 'NO_FORCED_EXPOSURE', 'REQUIRES_SUSPICION_GRAPH'] }),
  definition('GAIN_TRUST', 'TRUST', ['TRUST', 'INVESTIGATION'], ['balanced', 'expressive'], 'medium', 'PLAYER'),
  definition('SHARE_INFORMATION', 'INFORMATION', interactivePhases, ['balanced', 'expressive'], 'medium', 'TRUSTED_PLAYER', { constraints: ['SOCIAL_FIRST', 'NO_FORCED_EXPOSURE', 'REQUIRES_TRUST_GRAPH'] }),
  definition('WITHHOLD_INFORMATION', 'INFORMATION', ['INVESTIGATION', 'DOUBT'], ['observer', 'balanced'], 'low', 'NONE'),
  definition('QUESTION_PLAYER', 'OBSERVATION', ['TRUST', 'INVESTIGATION', 'DOUBT'], ['balanced', 'expressive'], 'medium', 'PLAYER'),
  definition('PROTECT_PLAYER', 'TRUST', ['TRUST', 'DOUBT'], ['balanced', 'expressive'], 'medium', 'TRUSTED_PLAYER', { constraints: ['SOCIAL_FIRST', 'NO_FORCED_EXPOSURE', 'REQUIRES_TRUST_GRAPH'] }),
  definition('INFLUENCE_PLAYER', 'INFLUENCE', ['DOUBT', 'FINAL_THEORY'], ['expressive'], 'high', 'PLAYER', { requiresPublicExposure: true }),
  definition('FORM_ALLIANCE', 'ALLIANCE', ['TRUST', 'DOUBT'], ['balanced', 'expressive'], 'medium', 'PLAYER'),
  definition('BREAK_ALLIANCE', 'ALLIANCE', ['TRUST', 'INVESTIGATION', 'DOUBT'], socialProfiles, 'medium', 'PLAYER', { availability: 'BLOCKED_BY_MISSING_CONTEXT' }),
  definition('CHANGE_THEORY', 'THEORY', ['DOUBT', 'FINAL_THEORY'], socialProfiles, 'low', 'SUSPECTED_PLAYER', { constraints: ['SOCIAL_FIRST', 'NO_FORCED_EXPOSURE', 'REQUIRES_SUSPICION_GRAPH'] }),
]

/** Legacy alias retained for Profile Engine consumers. */
export const MISSION_TEMPLATES = MISSION_DEFINITIONS
export const MISSION_CATALOG = MISSION_DEFINITIONS

export function getMissionDefinition(type: MissionType): MissionDefinition | undefined {
  return MISSION_DEFINITIONS.find((mission) => mission.type === type)
}

export function getMissionTemplate(type: MissionType): MissionDefinition | undefined { return getMissionDefinition(type) }

export function getMissionDefinitions(): MissionDefinition[] { return MISSION_DEFINITIONS.map((mission) => ({ ...mission, allowedPhases: [...mission.allowedPhases], constraints: [...mission.constraints], compatibleProfiles: [...mission.compatibleProfiles] })) }

export function getMissionsAllowedInPhase(phase: GamePhase): MissionDefinition[] {
  return getMissionDefinitions().filter((mission) => mission.availability === 'AVAILABLE' && mission.allowedPhases.includes(phase))
}

export function getSocialFirstMissions(phase?: GamePhase): MissionDefinition[] {
  return getMissionDefinitions().filter((mission) => mission.socialFirst && (phase === undefined || mission.allowedPhases.includes(phase)))
}

export function getCompatibleMissionDefinitions(player: PlayerGameProfile, phase: GamePhase): MissionDefinition[] {
  const compatibleTypes = new Set(getCompatibleMissionTypes(player, phase))
  return getMissionsAllowedInPhase(phase).filter((mission) => compatibleTypes.has(mission.type))
}

export function isMissionCompatible(template: MissionTemplate, phase: GamePhase, socialStyle: SocialStyle, exposureLevel: ExposureLevel): boolean {
  return template.allowedPhases.includes(phase)
    && template.compatibleProfiles.includes(socialStyle)
    && (template.exposureLevel === 'low' || exposureLevel !== 'low')
    && template.availability !== 'BLOCKED_BY_MISSING_CONTEXT'
}

function hasTargetRequirement(definitionValue: MissionDefinition, context: MissionContext, player: PlayerGameProfile, targetPlayerId: string): boolean {
  if (definitionValue.targetRequirement === 'PLAYER') return context.players.some((candidate) => candidate.playerId === targetPlayerId && candidate.playerId !== player.playerId)
  if (definitionValue.targetRequirement === 'TRUSTED_PLAYER') return context.trustGraph !== undefined && getTrustedPlayers(context.trustGraph, player.playerId).includes(targetPlayerId)
  if (definitionValue.targetRequirement === 'SUSPECTED_PLAYER') return context.suspicionGraph !== undefined && getPlayersSuspecting(context.suspicionGraph, targetPlayerId).includes(player.playerId)
  return false
}

export function getValidMissionTargets(player: PlayerGameProfile, type: MissionType, context: MissionContext): PlayerGameProfile[] {
  const mission = getMissionDefinition(type)
  if (!mission || mission.targetRequirement === 'NONE' || mission.availability !== 'AVAILABLE') return []
  return context.players
    .filter((candidate) => candidate.playerId !== player.playerId)
    .filter((candidate) => hasTargetRequirement(mission, context, player, candidate.playerId))
    .sort((first, second) => first.playerId.localeCompare(second.playerId))
}

export function validateMissionCompatibility(type: MissionType, player: PlayerGameProfile | undefined, targetPlayerId: string | undefined, context: MissionContext): MissionCompatibilityResult {
  const mission = getMissionDefinition(type)
  const violations: MissionCompatibilityResult['violations'] = []
  if (!mission || !player || !context.players.some((candidate) => candidate.playerId === player.playerId)) {
    violations.push('UNKNOWN_PLAYER')
    return { compatible: false, violations }
  }
  if (mission.availability !== 'AVAILABLE') violations.push('UNSUPPORTED_RUNTIME_DEPENDENCY')
  if (!mission.allowedPhases.includes(context.phase)) violations.push('MISSION_NOT_ALLOWED_IN_PHASE')
  const capabilities = getProfileCapabilities(player)
  if (mission.exposureLevel === 'high' && capabilities.maxExposureLevel === 'low') violations.push('PLAYER_EXPOSURE_TOO_LOW')
  if (!getCompatibleMissionTypes(player, context.phase).includes(type) && mission.availability === 'AVAILABLE') violations.push('MISSION_NOT_COMPATIBLE_WITH_PROFILE')
  if (mission.targetRequirement === 'NONE') {
    if (targetPlayerId !== undefined) violations.push('TARGET_NOT_ALLOWED')
  } else if (targetPlayerId === undefined) {
    violations.push('TARGET_REQUIRED')
  } else {
    const target = context.players.find((candidate) => candidate.playerId === targetPlayerId)
    if (!target) violations.push('UNKNOWN_TARGET')
    else if (target.playerId === player.playerId) violations.push('SELF_TARGET')
    else if (!hasTargetRequirement(mission, context, player, target.playerId)) {
      if (mission.targetRequirement === 'TRUSTED_PLAYER') violations.push(context.trustGraph ? 'TARGET_NOT_TRUSTED' : 'MISSING_REQUIRED_CONTEXT')
      else if (mission.targetRequirement === 'SUSPECTED_PLAYER') violations.push(context.suspicionGraph ? 'TARGET_NOT_SUSPECTED' : 'MISSING_REQUIRED_CONTEXT')
    }
  }
  return { compatible: violations.length === 0, violations: [...new Set(violations)] }
}

export type BuildMissionProposalInput = {
  type: MissionType
  player: PlayerGameProfile
  targetPlayerId?: string
  context: MissionContext
  missionId?: string
}

export function buildMissionProposal(input: BuildMissionProposalInput): MissionProposalResult
export function buildMissionProposal(type: MissionType, player: PlayerGameProfile, targetPlayerId: string | undefined, context: MissionContext, missionId?: string): MissionProposalResult
export function buildMissionProposal(inputOrType: BuildMissionProposalInput | MissionType, player?: PlayerGameProfile, targetPlayerId?: string, context?: MissionContext, missionId?: string): MissionProposalResult {
  const input: BuildMissionProposalInput = typeof inputOrType === 'string'
    ? { type: inputOrType, player: player as PlayerGameProfile, targetPlayerId, context: context as MissionContext, missionId }
    : inputOrType
  const compatibility = validateMissionCompatibility(input.type, input.player, input.targetPlayerId, input.context)
  if (!compatibility.compatible) return { valid: false, violations: compatibility.violations }
  const mission = getMissionDefinition(input.type) as MissionDefinition
  const proposal: MissionInstance = {
    missionId: input.missionId ?? `${input.context.phase}:${input.type}:${input.player.playerId}:${input.targetPlayerId ?? 'none'}`,
    type: input.type,
    playerId: input.player.playerId,
    ...(input.targetPlayerId ? { targetPlayerId: input.targetPlayerId } : {}),
    phase: input.context.phase,
    status: 'PROPOSED',
    exposureLevel: mission.exposureLevel,
  }
  return { valid: true, proposal }
}
