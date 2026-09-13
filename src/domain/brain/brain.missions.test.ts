import { describe, expect, it } from 'vitest'
import { createSuspicionGraph, setSuspicion } from './brain.suspicion'
import { createTrustGraph, setTrust } from './brain.trust'
import {
  buildMissionProposal,
  getCompatibleMissionDefinitions,
  getMissionDefinition,
  getMissionsAllowedInPhase,
  getSocialFirstMissions,
  getValidMissionTargets,
  validateMissionCompatibility,
} from './brain.missions'
import type { MissionContext, PlayerGameProfile } from './brain.types'

const players: PlayerGameProfile[] = [
  { playerId: 'p1', socialStyle: 'balanced', exposureLevel: 'medium', participationLevel: 'medium', arrivedWithPlayerIds: [], strategyPreference: 'mixed', sources: { socialStyle: 'derived', exposureLevel: 'derived', participationLevel: 'derived', strategyPreference: 'defaulted' } },
  { playerId: 'p2', socialStyle: 'balanced', exposureLevel: 'medium', participationLevel: 'medium', arrivedWithPlayerIds: [], strategyPreference: 'mixed', sources: { socialStyle: 'derived', exposureLevel: 'derived', participationLevel: 'derived', strategyPreference: 'defaulted' } },
  { playerId: 'p3', socialStyle: 'expressive', exposureLevel: 'high', participationLevel: 'high', arrivedWithPlayerIds: [], strategyPreference: 'social', sources: { socialStyle: 'derived', exposureLevel: 'derived', participationLevel: 'derived', strategyPreference: 'derived' } },
]

function context(phase: MissionContext['phase'], extras: Pick<MissionContext, 'trustGraph' | 'suspicionGraph'> = {}): MissionContext {
  return { phase, players, ...extras }
}

describe('Liar Brain Mission Engine v0.10', () => {
  it('exposes a deterministic, social-first catalog and blocks missing alliance runtime', () => {
    expect(getMissionDefinition('BREAK_ALLIANCE')).toMatchObject({ availability: 'BLOCKED_BY_MISSING_CONTEXT', socialFirst: true })
    expect(getMissionsAllowedInPhase('TRUST').every((mission) => mission.socialFirst)).toBe(true)
    expect(getSocialFirstMissions('DOUBT').map((mission) => mission.type)).toEqual(expect.arrayContaining(['QUESTION_PLAYER', 'FORM_ALLIANCE']))
  })

  it('returns non-self targets in stable order', () => {
    const targets = getValidMissionTargets(players[0], 'OBSERVE_PLAYER', context('INVESTIGATION'))
    expect(targets.map((player) => player.playerId)).toEqual(['p2', 'p3'])
  })

  it('uses the Trust Graph for trusted-player requirements', () => {
    let trustGraph = createTrustGraph(players.map((player) => player.playerId))
    trustGraph = setTrust(trustGraph, { sourcePlayerId: 'p1', targetPlayerId: 'p2', phase: 'TRUST', level: 'HIGH' })
    const result = getValidMissionTargets(players[0], 'SHARE_INFORMATION', context('TRUST', { trustGraph }))
    expect(result.map((player) => player.playerId)).toEqual(['p2'])
  })

  it('uses the Suspicion Graph for suspected-player requirements', () => {
    let suspicionGraph = createSuspicionGraph(players.map((player) => player.playerId))
    suspicionGraph = setSuspicion(suspicionGraph, { sourcePlayerId: 'p1', targetPlayerId: 'p2', phase: 'DOUBT', confidence: 'HIGH' })
    const result = getValidMissionTargets(players[0], 'VERIFY_STATEMENT', context('DOUBT', { suspicionGraph }))
    expect(result.map((player) => player.playerId)).toEqual(['p2'])
  })

  it('reports explainable target and context violations', () => {
    expect(validateMissionCompatibility('SHARE_INFORMATION', players[0], 'p2', context('TRUST'))).toMatchObject({ compatible: false, violations: ['MISSING_REQUIRED_CONTEXT'] })
    expect(validateMissionCompatibility('OBSERVE_PLAYER', players[0], 'p1', context('INVESTIGATION')).violations).toContain('SELF_TARGET')
    expect(validateMissionCompatibility('OBSERVE_PLAYER', players[0], undefined, context('INVESTIGATION')).violations).toContain('TARGET_REQUIRED')
    expect(validateMissionCompatibility('BREAK_ALLIANCE', players[0], 'p2', context('TRUST')).violations).toContain('UNSUPPORTED_RUNTIME_DEPENDENCY')
  })

  it('enforces profile exposure and phase compatibility', () => {
    const lowExposure = { ...players[0], exposureLevel: 'low' as const, socialStyle: 'expressive' as const }
    expect(validateMissionCompatibility('INFLUENCE_PLAYER', lowExposure, 'p2', context('DOUBT')).violations).toEqual(expect.arrayContaining(['PLAYER_EXPOSURE_TOO_LOW']))
    expect(validateMissionCompatibility('CHANGE_THEORY', players[0], 'p2', context('TRUST')).violations).toContain('MISSION_NOT_ALLOWED_IN_PHASE')
  })

  it('builds a valid deterministic proposal without assigning or activating it', () => {
    const result = buildMissionProposal({ type: 'OBSERVE_PLAYER', player: players[0], targetPlayerId: 'p2', context: context('INVESTIGATION') })
    expect(result).toEqual({ valid: true, proposal: { missionId: 'INVESTIGATION:OBSERVE_PLAYER:p1:p2', type: 'OBSERVE_PLAYER', playerId: 'p1', targetPlayerId: 'p2', phase: 'INVESTIGATION', status: 'PROPOSED', exposureLevel: 'low' } })
  })

  it('never makes BREAK_ALLIANCE assignable and has no random identity', () => {
    const result = buildMissionProposal('BREAK_ALLIANCE', players[0], 'p2', context('TRUST'))
    expect(result.valid).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/ACTIVE|COMPLETED|FAILED/)
    expect(JSON.stringify(result)).not.toMatch(/randomUUID|Math\.random|Date\.now/)
  })

  it('filters compatible definitions through the existing Profile Engine', () => {
    const compatible = getCompatibleMissionDefinitions(players[0], 'DOUBT').map((mission) => mission.type)
    expect(compatible).toEqual(expect.arrayContaining(['OBSERVE_PLAYER', 'CHANGE_THEORY']))
    expect(compatible).not.toContain('INFLUENCE_PLAYER')
  })
})
