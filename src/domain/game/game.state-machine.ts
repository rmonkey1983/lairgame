import type { GameLifecycle, NarrativePhase } from './game.types'

const transitions: Record<GameLifecycle, readonly GameLifecycle[]> = {
  draft: ['ready', 'aborted'], ready: ['checkin_open', 'aborted'], checkin_open: ['live', 'aborted'], live: ['paused', 'completed', 'aborted'], paused: ['live', 'aborted'], completed: [], aborted: [],
}

const narrativePhaseTransitions: Record<NarrativePhase, readonly NarrativePhase[]> = {
  lobby: ['role_reveal'],
  role_reveal: ['briefing'],
  briefing: ['discovery'],
  discovery: ['comparison'],
  comparison: ['pressure'],
  pressure: ['deliberation'],
  deliberation: ['final_vote'],
  final_vote: ['reveal'],
  reveal: [],
}

export function getAllowedLifecycleTransitions(state: GameLifecycle): readonly GameLifecycle[] { return transitions[state] }
export function canTransitionLifecycle(from: GameLifecycle, to: GameLifecycle): boolean { return transitions[from].includes(to) }
export function getAllowedNarrativePhaseTransitions(state: NarrativePhase): readonly NarrativePhase[] { return narrativePhaseTransitions[state] }
export function canTransitionNarrativePhase(from: NarrativePhase, to: NarrativePhase): boolean { return narrativePhaseTransitions[from].includes(to) }
