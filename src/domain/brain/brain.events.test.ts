import { describe, expect, it } from 'vitest'
import { appendBrainEvent, countEvents, countEventsByType, createBrainEventStore, getEvents, getEventsBetweenSequences, getEventsByPhase, getEventsByPlayer, getEventsByType, getLatestEvent, getLatestEventOfType, validateBrainEvent } from './brain.events'
import type { BrainEvent } from './brain.events'

const store = createBrainEventStore('session-1')
const event = (sequence: number, overrides: Partial<BrainEvent> = {}): BrainEvent => ({ id: `event-${sequence}`, sessionId: 'session-1', sequence, type: 'TRUST_SELECTED', phase: 'TRUST', actorPlayerId: 'P1', targetPlayerId: 'P2', payload: { level: 'HIGH' }, ...overrides } as BrainEvent)
function add(current: typeof store, next: BrainEvent): typeof store {
  const result = appendBrainEvent(current, next)
  if (!result.ok) throw new Error(result.violations.join(', '))
  return result.store
}

describe('Event Store v0.7', () => {
  it('appends valid events with strictly increasing sequence', () => {
    const next = add(add(store, event(1)), event(2, { type: 'PHASE_ENTERED', phase: 'INVESTIGATION', actorPlayerId: undefined, targetPlayerId: undefined, payload: { previousPhase: 'TRUST', newPhase: 'INVESTIGATION' } } as Partial<BrainEvent>))
    expect(countEvents(next)).toBe(2)
    expect(getEvents(next).map((entry) => entry.sequence)).toEqual([1, 2])
  })

  it('rejects duplicate IDs, duplicate sequences, gaps, wrong sessions and invalid IDs', () => {
    const one = add(store, event(1))
    expect(appendBrainEvent(one, event(1)).ok).toBe(false)
    expect(appendBrainEvent(one, event(2, { id: 'event-1' })).ok).toBe(false)
    expect(appendBrainEvent(one, event(3)).ok).toBe(false)
    expect(appendBrainEvent(one, event(2, { sessionId: 'session-2' })).ok).toBe(false)
    expect(appendBrainEvent(one, event(2, { id: ' ' }))).toMatchObject({ ok: false, violations: ['EVENT_ID_INVALID'] })
  })

  it('supports all v0.7 event types with structured payloads', () => {
    let current = add(store, event(1))
    current = add(current, event(2, { type: 'TRUST_CHANGED', payload: { previousLevel: 'LOW', newLevel: 'HIGH' } }))
    current = add(current, event(3, { type: 'SUSPICION_SELECTED', phase: 'INVESTIGATION', payload: { confidence: 'MEDIUM' } }))
    current = add(current, event(4, { type: 'SUSPICION_TARGET_CHANGED', phase: 'DOUBT', targetPlayerId: 'P3', payload: { previousTargetPlayerId: 'P2', newTargetPlayerId: 'P3', confidence: 'HIGH' } }))
    current = add(current, event(5, { type: 'SUSPICION_CONFIDENCE_CHANGED', phase: 'FINAL_THEORY', targetPlayerId: 'P3', payload: { targetPlayerId: 'P3', previousConfidence: 'MEDIUM', newConfidence: 'HIGH' } }))
    current = add(current, event(6, { type: 'PHASE_ENTERED', phase: 'REVEAL', actorPlayerId: undefined, targetPlayerId: undefined, payload: { previousPhase: 'FINAL_THEORY', newPhase: 'REVEAL' } }))
    expect(getEventsByType(current, 'TRUST_CHANGED')).toHaveLength(1)
    expect(getEventsByType(current, 'SUSPICION_SELECTED')).toHaveLength(1)
    expect(getEventsByType(current, 'SUSPICION_TARGET_CHANGED')).toHaveLength(1)
    expect(getEventsByType(current, 'SUSPICION_CONFIDENCE_CHANGED')).toHaveLength(1)
    expect(getEventsByType(current, 'PHASE_ENTERED')).toHaveLength(1)
  })

  it('rejects malformed payloads and incoherent actors/targets', () => {
    const one = add(store, event(1))
    expect(validateBrainEvent(one, event(2, { payload: { level: 'HIGH', nickname: 'private' } } as Partial<BrainEvent>)).violations).toContain('PAYLOAD_INVALID')
    expect(validateBrainEvent(one, event(2, { actorPlayerId: 'P1', targetPlayerId: 'P1' })).violations).toContain('ACTOR_TARGET_INVALID')
    expect(validateBrainEvent(one, event(2, { type: 'SUSPICION_TARGET_CHANGED', targetPlayerId: 'P3', payload: { previousTargetPlayerId: 'P2', newTargetPlayerId: 'P4', confidence: 'HIGH' } })).violations).toContain('TARGET_MISMATCH')
  })

  it('queries by type, player, phase and inclusive sequence range', () => {
    let current = add(store, event(1))
    current = add(current, event(2, { targetPlayerId: 'P3' }))
    current = add(current, event(3, { type: 'PHASE_ENTERED', phase: 'INVESTIGATION', actorPlayerId: undefined, targetPlayerId: undefined, payload: { previousPhase: 'TRUST', newPhase: 'INVESTIGATION' } }))
    expect(getEventsByPlayer(current, 'P3', 'target')).toHaveLength(1)
    expect(getEventsByPlayer(current, 'P1', 'actor')).toHaveLength(2)
    expect(getEventsByPhase(current, 'INVESTIGATION')).toHaveLength(1)
    expect(getEventsBetweenSequences(current, 2, 3).map((entry) => entry.sequence)).toEqual([2, 3])
    expect(getLatestEvent(current)?.sequence).toBe(3)
    expect(getLatestEventOfType(current, 'TRUST_SELECTED')?.sequence).toBe(2)
  })

  it('returns deterministic ordered copies and preserves input immutability', () => {
    const original = add(store, event(1))
    const queried = getEvents({ ...original, events: [...original.events].reverse() })
    expect(queried[0].sequence).toBe(1)
    expect(queried).not.toBe(original.events)
    const next = add(original, event(2))
    expect(original.events).toHaveLength(1)
    expect(next.events).toHaveLength(2)
    expect(countEventsByType(next, 'TRUST_SELECTED')).toBe(2)
  })

  it('keeps events role-blind and contains no personal data', () => {
    const next = add(store, event(1))
    const serialized = JSON.stringify(next)
    expect(serialized).not.toContain('role')
    expect(serialized).not.toContain('nickname')
    expect(serialized).not.toContain('email')
    expect(serialized).not.toContain('Date.now')
    expect(serialized).not.toContain('Math.random')
  })
})
