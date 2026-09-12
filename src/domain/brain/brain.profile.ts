import { getMissionTemplate, isMissionCompatible, MISSION_TEMPLATES } from './brain.missions'
import type {
  ExposureLevel,
  GamePhase,
  MissionType,
  PlayerGameProfile,
  ProfileValueSource,
  SocialStyle,
  StrategyPreference,
  ParticipationLevel,
} from './brain.types'

export type PlayerProfileInput = {
  playerId: string
  groupBehavior?: 'breaks_ice' | 'warms_up' | 'observes_first'
  preferredGameStyle?: StrategyPreference
  participationComfort?: ParticipationLevel
  publicExposureComfort?: ExposureLevel
  arrivedWithPlayerIds?: string[]
}

export type ProfileValidationResult = { valid: boolean; violations: string[] }

export type ProfileCapabilities = {
  preferredMissionTypes: MissionType[]
  avoidedMissionTypes: MissionType[]
  maxExposureLevel: ExposureLevel
  suitableForObservation: boolean
  suitableForInfluence: boolean
}

const groupBehaviorToStyle: Record<NonNullable<PlayerProfileInput['groupBehavior']>, SocialStyle> = {
  breaks_ice: 'expressive',
  warms_up: 'balanced',
  observes_first: 'observer',
}

function source<T>(value: T | undefined, fallback: T): { value: T; source: ProfileValueSource } {
  return value === undefined ? { value: fallback, source: 'defaulted' } : { value, source: 'derived' }
}

export function derivePlayerGameProfile(input: PlayerProfileInput): PlayerGameProfile {
  const socialStyle = source<SocialStyle>(input.groupBehavior ? groupBehaviorToStyle[input.groupBehavior] : undefined, 'balanced')
  const exposureLevel = source<ExposureLevel>(input.publicExposureComfort, 'low')
  const participationLevel = source<ParticipationLevel>(input.participationComfort, 'medium')
  const strategyPreference = source<StrategyPreference>(input.preferredGameStyle, 'mixed')

  return {
    playerId: input.playerId,
    socialStyle: socialStyle.value,
    exposureLevel: exposureLevel.value,
    participationLevel: participationLevel.value,
    arrivedWithPlayerIds: [...(input.arrivedWithPlayerIds ?? [])],
    strategyPreference: strategyPreference.value,
    sources: {
      socialStyle: socialStyle.source,
      exposureLevel: exposureLevel.source,
      participationLevel: participationLevel.source,
      strategyPreference: strategyPreference.source,
    },
  }
}

const observerPreferences: MissionType[] = ['OBSERVE_PLAYER', 'VERIFY_STATEMENT', 'QUESTION_PLAYER', 'CHANGE_THEORY']
const balancedPreferences: MissionType[] = ['OBSERVE_PLAYER', 'VERIFY_STATEMENT', 'GAIN_TRUST', 'SHARE_INFORMATION', 'QUESTION_PLAYER', 'FORM_ALLIANCE', 'CHANGE_THEORY']
const expressivePreferences: MissionType[] = ['GAIN_TRUST', 'INFLUENCE_PLAYER', 'PROTECT_PLAYER', 'FORM_ALLIANCE']
const analyticalPreferences: MissionType[] = ['OBSERVE_PLAYER', 'VERIFY_STATEMENT', 'CHANGE_THEORY']
const socialPreferences: MissionType[] = ['GAIN_TRUST', 'SHARE_INFORMATION', 'QUESTION_PLAYER', 'FORM_ALLIANCE', 'INFLUENCE_PLAYER']

export function getCompatibleMissionTypes(profile: PlayerGameProfile, phase: GamePhase): MissionType[] {
  const stylePreferences = profile.socialStyle === 'observer'
    ? observerPreferences
    : profile.socialStyle === 'expressive' ? expressivePreferences : balancedPreferences
  const strategyPreferences = profile.strategyPreference === 'analytical'
    ? analyticalPreferences
    : profile.strategyPreference === 'social' ? socialPreferences : []
  const ordered = [...strategyPreferences, ...stylePreferences]

  return [...new Set(ordered)].filter((type) => {
    const template = getMissionTemplate(type)
    return template !== undefined && isMissionCompatible(template, phase, profile.socialStyle, profile.exposureLevel)
  })
}

export function getProfileCapabilities(profile: PlayerGameProfile): ProfileCapabilities {
  const preferredMissionTypes = getCompatibleMissionTypes(profile, 'DOUBT')
  const compatibleTypes = MISSION_TEMPLATES
    .filter((template) => template.compatibleProfiles.includes(profile.socialStyle))
    .filter((template) => template.exposureLevel === 'low' || profile.exposureLevel !== 'low')
    .map((template) => template.type)
  const preferred = new Set(preferredMissionTypes)

  return {
    preferredMissionTypes,
    avoidedMissionTypes: MISSION_TEMPLATES
      .map((template) => template.type)
      .filter((type) => !compatibleTypes.includes(type) || !preferred.has(type)),
    maxExposureLevel: profile.exposureLevel,
    suitableForObservation: profile.socialStyle === 'observer' || profile.socialStyle === 'balanced',
    suitableForInfluence: profile.socialStyle === 'expressive' && profile.exposureLevel !== 'low',
  }
}

export function validatePlayerProfile(input: PlayerProfileInput): ProfileValidationResult {
  const violations: string[] = []
  const validGroupBehaviors = ['breaks_ice', 'warms_up', 'observes_first']
  const validStyles = ['social', 'analytical', 'mixed']
  const validParticipation = ['low', 'medium', 'high']
  const validExposure = ['low', 'medium', 'high']
  const arrivedWith = input.arrivedWithPlayerIds ?? []

  if (!input.playerId.trim()) violations.push('PLAYER_ID_REQUIRED')
  if (input.groupBehavior !== undefined && !validGroupBehaviors.includes(input.groupBehavior)) violations.push('GROUP_BEHAVIOR_INVALID')
  if (input.preferredGameStyle !== undefined && !validStyles.includes(input.preferredGameStyle)) violations.push('GAME_STYLE_INVALID')
  if (input.participationComfort !== undefined && !validParticipation.includes(input.participationComfort)) violations.push('PARTICIPATION_COMFORT_INVALID')
  if (input.publicExposureComfort !== undefined && !validExposure.includes(input.publicExposureComfort)) violations.push('EXPOSURE_COMFORT_INVALID')
  if (arrivedWith.includes(input.playerId)) violations.push('PLAYER_CANNOT_REFERENCE_SELF')
  if (new Set(arrivedWith).size !== arrivedWith.length) violations.push('ARRIVED_PLAYER_IDS_DUPLICATED')

  return { valid: violations.length === 0, violations }
}
