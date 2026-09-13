import type { BrainInput, BrainState, GamePhase } from './brain.types'

export const BRAIN_PHASE_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  LOBBY: ['SOCIAL_WARMUP'],
  SOCIAL_WARMUP: ['ROLE_REVEAL'],
  ROLE_REVEAL: ['TRUST'],
  TRUST: ['INVESTIGATION'],
  INVESTIGATION: ['DOUBT'],
  DOUBT: ['FINAL_THEORY'],
  FINAL_THEORY: ['VOTING'],
  VOTING: ['LOCKED'],
  LOCKED: ['REVEAL'],
  REVEAL: ['RESULTS'],
  RESULTS: [],
}

export function getAllowedBrainPhaseTransitions(phase: GamePhase): readonly GamePhase[] {
  return BRAIN_PHASE_TRANSITIONS[phase]
}

export function canTransitionBrainPhase(from: GamePhase, to: GamePhase): boolean {
  return BRAIN_PHASE_TRANSITIONS[from].includes(to)
}

export function buildBrainState(input: BrainInput): BrainState {
  return {
    sessionId: input.sessionId,
    phase: input.phase,
    players: input.players.map((player) => ({
      ...player,
      arrivedWithPlayerIds: [...player.arrivedWithPlayerIds],
    })),
    tables: input.tables.map((table) => ({ ...table, playerIds: [...table.playerIds] })),
    socialEdges: input.socialEdges?.map((edge) => ({ ...edge })) ?? [],
    activeMissions: input.activeMissions?.map((mission) => ({ ...mission, allowedPhases: [...mission.allowedPhases], compatibleProfiles: [...mission.compatibleProfiles] })) ?? [],
    revealedInformation: input.revealedInformation?.map((information) => ({ ...information })) ?? [],
    metrics: {
      liarExposure: null,
      roleExposure: { liar: null, accomplice: null, scapegoat: null },
      theoryDiversity: null,
      participationBalance: null,
      trustCoverage: null,
      trustConcentration: null,
      suspicionCoverage: null,
      theoryShiftRate: null,
      averageTheoryChanges: null,
      liarConfidence: null,
      playerActivity: [],
      tableMetrics: [],
    },
  }
}
