import type { BrainDecision } from './brain.types'

export function decision(type: BrainDecision['type'], reason: string, extras: Partial<Omit<BrainDecision, 'type' | 'reason' | 'requiresMcApproval'>> = {}): BrainDecision {
  return { type, reason, priority: 'low', requiresMcApproval: type !== 'NO_ACTION', ...extras }
}
