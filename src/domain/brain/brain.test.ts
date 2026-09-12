import { describe, expect, it } from 'vitest'
import { CORE_LAWS } from './brain.laws'
import { buildBrainState, canTransitionBrainPhase } from './brain.state'
import { evaluateBrainState } from './brain.engine'
import { validateBrainAction } from './brain.validator'
import type { BrainPlayer, ScenarioTruth } from './brain.types'

const players: BrainPlayer[] = [
  { playerId: 'p1', socialStyle: 'observer', exposureLevel: 'low', participationLevel: 'medium', arrivedWithPlayerIds: [], activityCount: 1 },
  { playerId: 'p2', socialStyle: 'expressive', exposureLevel: 'high', participationLevel: 'high', arrivedWithPlayerIds: [], activityCount: 1 },
  { playerId: 'p3', socialStyle: 'balanced', exposureLevel: 'medium', participationLevel: 'medium', arrivedWithPlayerIds: [], activityCount: 1 },
]
const truth: ScenarioTruth = { liarPlayerId: 'p2', facts: [], lies: [] }

function state() {
  return buildBrainState({ sessionId: 's1', phase: 'DOUBT', players, tables: [{ tableId: 't1', playerIds: ['p1', 'p2', 'p3'] }], socialEdges: [{ sourcePlayerId: 'p1', targetPlayerId: 'p2', type: 'SUSPICION', phase: 'DOUBT', active: true }] })
}

describe('Liar Brain Core v0.1', () => {
  it('builds a defensive, deterministic state without mutating input arrays', () => {
    const inputPlayers = [...players]
    const result = state()
    expect(result.players).toEqual(inputPlayers)
    expect(result.metrics).toEqual({ liarExposure: null, theoryDiversity: null, participationBalance: null })
    expect(result.players).not.toBe(players)
  })

  it('calculates derived metrics and never changes truth', () => {
    const evaluation = evaluateBrainState(state(), truth)
    expect(evaluation.state.metrics).toEqual({ liarExposure: 1 / 3, theoryDiversity: 1, participationBalance: 1 })
    expect(truth.liarPlayerId).toBe('p2')
  })

  it('blocks an exposure-incompatible mission', () => {
    const result = validateBrainAction({ type: 'ASSIGN_SOCIAL_MISSION', playerId: 'p1', mission: { type: 'INFLUENCE_PLAYER', allowedPhases: ['DOUBT'], compatibleProfiles: ['observer'], exposureLevel: 'high', requiresTarget: true, requiresPublicExposure: true }, targetPlayerId: 'p2' }, state(), truth, CORE_LAWS)
    expect(result.valid).toBe(false)
    expect(result.violations).toContain('NO_FORCED_EXPOSURE')
  })

  it('blocks doubt before a trust edge exists and blocks truth mutation', () => {
    const result = validateBrainAction({ type: 'SUGGEST_DOUBT_EVENT', changesScenarioTruth: true }, state(), truth)
    expect(result.valid).toBe(false)
    expect(result.violations).toEqual(expect.arrayContaining(['TRUST_REQUIRED_BEFORE_DOUBT', 'IMMUTABLE_TRUTH']))
  })

  it('rejects actions outside the whitelist', () => {
    const result = validateBrainAction({ type: 'CHANGE_ROLE' }, state(), truth)
    expect(result.valid).toBe(false)
    expect(result.violations).toContain('ACTION_NOT_ALLOWED')
  })

  it('allows only the declared sequential phase transitions', () => {
    expect(canTransitionBrainPhase('LOBBY', 'SOCIAL_WARMUP')).toBe(true)
    expect(canTransitionBrainPhase('TRUST', 'DOUBT')).toBe(false)
    expect(canTransitionBrainPhase('RESULTS', 'LOBBY')).toBe(false)
  })

  it('blocks generic core-law violations', () => {
    const result = validateBrainAction({ type: 'SUGGEST_MC_ACTION', requiresActing: true, requiresPhone: true, meaningfulConsequence: false }, state(), truth)
    expect(result.valid).toBe(false)
    expect(result.violations).toEqual(expect.arrayContaining(['ACTING_NOT_REQUIRED', 'PHONE_REQUIRED', 'MEANINGFUL_CONSEQUENCE_REQUIRED']))
  })
})
