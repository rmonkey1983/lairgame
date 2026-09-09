import type { GameLifecycle } from './game.types'

const transitions: Record<GameLifecycle, readonly GameLifecycle[]> = {
  draft: ['ready', 'aborted'], ready: ['checkin_open', 'aborted'], checkin_open: ['live', 'aborted'], live: ['paused', 'completed', 'aborted'], paused: ['live', 'aborted'], completed: [], aborted: [],
}

export function getAllowedLifecycleTransitions(state: GameLifecycle): readonly GameLifecycle[] { return transitions[state] }
export function canTransitionLifecycle(from: GameLifecycle, to: GameLifecycle): boolean { return transitions[from].includes(to) }
