import { describe, expect, it } from 'vitest'
import { canTransitionLifecycle, getAllowedLifecycleTransitions } from './game.state-machine'

describe('game lifecycle state machine', () => {
  it('allows documented forward and pause transitions', () => { expect(canTransitionLifecycle('draft', 'ready')).toBe(true); expect(canTransitionLifecycle('ready', 'checkin_open')).toBe(true); expect(canTransitionLifecycle('checkin_open', 'live')).toBe(true); expect(canTransitionLifecycle('live', 'paused')).toBe(true); expect(canTransitionLifecycle('paused', 'live')).toBe(true); expect(canTransitionLifecycle('live', 'completed')).toBe(true) })
  it('keeps terminal states terminal and rejects invalid jumps', () => { expect(getAllowedLifecycleTransitions('completed')).toEqual([]); expect(getAllowedLifecycleTransitions('aborted')).toEqual([]); expect(canTransitionLifecycle('draft', 'live')).toBe(false) })
})
