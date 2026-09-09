import type { GameLifecycle, NarrativePhase } from './game.types'

export const GAME_LIFECYCLES: readonly GameLifecycle[] = ['draft', 'ready', 'checkin_open', 'live', 'paused', 'completed', 'aborted']
export const NARRATIVE_PHASES: readonly NarrativePhase[] = ['lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'auction', 'deliberation', 'final_vote', 'reveal']
