import { describe, expect, it } from 'vitest'
import { derivePlayerGameProfile, getCompatibleMissionTypes, getProfileCapabilities, validatePlayerProfile } from './brain.profile'

const input = {
  playerId: 'P17',
  groupBehavior: 'observes_first' as const,
  preferredGameStyle: 'analytical' as const,
  participationComfort: 'medium' as const,
  publicExposureComfort: 'low' as const,
  arrivedWithPlayerIds: ['P18'],
}

describe('Player Profile Engine v0.2', () => {
  it.each([
    ['breaks_ice', 'expressive'],
    ['warms_up', 'balanced'],
    ['observes_first', 'observer'],
  ] as const)('maps %s to %s', (groupBehavior, socialStyle) => {
    expect(derivePlayerGameProfile({ ...input, groupBehavior }).socialStyle).toBe(socialStyle)
  })

  it('uses conservative defaults and records their origin', () => {
    const profile = derivePlayerGameProfile({ playerId: 'P1' })
    expect(profile).toMatchObject({ socialStyle: 'balanced', exposureLevel: 'low', participationLevel: 'medium', strategyPreference: 'mixed' })
    expect(profile.sources).toEqual({ socialStyle: 'defaulted', exposureLevel: 'defaulted', participationLevel: 'defaulted', strategyPreference: 'defaulted' })
  })

  it('keeps observer missions within the low exposure limit', () => {
    const profile = derivePlayerGameProfile(input)
    const capabilities = getProfileCapabilities(profile)
    expect(capabilities.preferredMissionTypes).toEqual(expect.arrayContaining(['OBSERVE_PLAYER', 'CHANGE_THEORY']))
    expect(capabilities.preferredMissionTypes).not.toContain('INFLUENCE_PLAYER')
    expect(capabilities.suitableForInfluence).toBe(false)
  })

  it('prioritizes analytical and social preferences without changing mixed behavior', () => {
    const analytical = derivePlayerGameProfile({ ...input, groupBehavior: 'warms_up', preferredGameStyle: 'analytical', publicExposureComfort: 'high' })
    const social = derivePlayerGameProfile({ ...input, preferredGameStyle: 'social', groupBehavior: 'warms_up', publicExposureComfort: 'high' })
    const mixed = derivePlayerGameProfile({ ...input, preferredGameStyle: 'mixed', groupBehavior: 'warms_up', publicExposureComfort: 'high' })
    expect(getCompatibleMissionTypes(analytical, 'DOUBT').slice(0, 3)).toEqual(['OBSERVE_PLAYER', 'VERIFY_STATEMENT', 'CHANGE_THEORY'])
    expect(getCompatibleMissionTypes(social, 'TRUST').slice(0, 2)).toEqual(['GAIN_TRUST', 'SHARE_INFORMATION'])
    expect(getCompatibleMissionTypes(mixed, 'DOUBT')).toEqual(['OBSERVE_PLAYER', 'VERIFY_STATEMENT', 'SHARE_INFORMATION', 'QUESTION_PLAYER', 'FORM_ALLIANCE', 'CHANGE_THEORY'])
  })

  it('validates self references and duplicate arrivals', () => {
    expect(validatePlayerProfile({ playerId: 'P1', arrivedWithPlayerIds: ['P1'] }).violations).toContain('PLAYER_CANNOT_REFERENCE_SELF')
    expect(validatePlayerProfile({ playerId: 'P1', arrivedWithPlayerIds: ['P2', 'P2'] }).violations).toContain('ARRIVED_PLAYER_IDS_DUPLICATED')
  })

  it('is deterministic for the same input', () => {
    expect(derivePlayerGameProfile(input)).toEqual(derivePlayerGameProfile(input))
  })
})
