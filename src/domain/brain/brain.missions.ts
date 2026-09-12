import type { GamePhase, MissionTemplate, MissionType, SocialStyle } from './brain.types'

const socialProfiles: SocialStyle[] = ['observer', 'balanced', 'expressive']
const interactivePhases: GamePhase[] = ['TRUST', 'INVESTIGATION', 'DOUBT', 'FINAL_THEORY']

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  { type: 'OBSERVE_PLAYER', allowedPhases: ['SOCIAL_WARMUP', 'INVESTIGATION', 'DOUBT'], compatibleProfiles: socialProfiles, exposureLevel: 'low', requiresTarget: true },
  { type: 'VERIFY_STATEMENT', allowedPhases: ['INVESTIGATION', 'DOUBT'], compatibleProfiles: ['balanced', 'expressive'], exposureLevel: 'medium', requiresTarget: true },
  { type: 'GAIN_TRUST', allowedPhases: ['TRUST'], compatibleProfiles: ['balanced', 'expressive'], exposureLevel: 'medium', requiresTarget: true },
  { type: 'SHARE_INFORMATION', allowedPhases: interactivePhases, compatibleProfiles: ['balanced', 'expressive'], exposureLevel: 'medium', requiresTarget: true },
  { type: 'WITHHOLD_INFORMATION', allowedPhases: ['INVESTIGATION', 'DOUBT'], compatibleProfiles: ['observer', 'balanced'], exposureLevel: 'low', requiresTarget: false },
  { type: 'QUESTION_PLAYER', allowedPhases: ['TRUST', 'INVESTIGATION', 'DOUBT'], compatibleProfiles: ['balanced', 'expressive'], exposureLevel: 'medium', requiresTarget: true },
  { type: 'PROTECT_PLAYER', allowedPhases: ['TRUST', 'DOUBT'], compatibleProfiles: ['balanced', 'expressive'], exposureLevel: 'medium', requiresTarget: true },
  { type: 'INFLUENCE_PLAYER', allowedPhases: ['DOUBT', 'FINAL_THEORY'], compatibleProfiles: ['expressive'], exposureLevel: 'high', requiresTarget: true, requiresPublicExposure: true },
  { type: 'FORM_ALLIANCE', allowedPhases: ['TRUST', 'DOUBT'], compatibleProfiles: ['balanced', 'expressive'], exposureLevel: 'medium', requiresTarget: true },
  { type: 'CHANGE_THEORY', allowedPhases: ['DOUBT', 'FINAL_THEORY'], compatibleProfiles: ['observer', 'balanced', 'expressive'], exposureLevel: 'low', requiresTarget: false },
]

export function getMissionTemplate(type: MissionType): MissionTemplate | undefined {
  return MISSION_TEMPLATES.find((template) => template.type === type)
}

export function isMissionCompatible(template: MissionTemplate, phase: GamePhase, socialStyle: SocialStyle, exposureLevel: string): boolean {
  return template.allowedPhases.includes(phase)
    && template.compatibleProfiles.includes(socialStyle)
    && (template.exposureLevel === 'low' || exposureLevel !== 'low')
}
