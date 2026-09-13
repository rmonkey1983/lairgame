import { describe, expect, it } from 'vitest'
import { createBrainEventStore } from '../../domain/brain/brain.events'
import type { Database } from '../../lib/supabase/database.types'
import { BrainPersistenceError, fromBrainEvent, hydrateBrainEventStore, toBrainEvent, toRegiaProposal, toSuspicionGraphState, toTrustGraphState } from './brain.persistence'

type EventRow = Database['public']['Functions']['load_brain_events']['Returns'][number]
type TrustRow = Database['public']['Functions']['load_brain_trust_state']['Returns'][number]
type SuspicionRow = Database['public']['Functions']['load_brain_suspicion_state']['Returns'][number]
type ProposalRow = Database['public']['Functions']['load_brain_regia_proposals']['Returns'][number]

const sessionId = 'a0000000-0000-0000-0000-000000000050'
const p1 = '20000000-0000-0000-0000-000000000901'
const p2 = '20000000-0000-0000-0000-000000000902'

const eventRow = (overrides: Partial<EventRow> = {}): EventRow => ({
  event_id: 'event-1', session_id: sessionId, sequence: 1, event_type: 'TRUST_SELECTED', phase: 'trust',
  actor_player_id: p1, target_player_id: p2, payload: { level: 'HIGH' }, created_at: 'not-part-of-domain', ...overrides,
})

describe('Brain Supabase bridge v0.13', () => {
  it('maps events in both directions and preserves structured payloads', () => {
    const event = toBrainEvent(eventRow())
    expect(event).toMatchObject({ id: 'event-1', sessionId, sequence: 1, type: 'TRUST_SELECTED', phase: 'TRUST', actorPlayerId: p1, targetPlayerId: p2, payload: { level: 'HIGH' } })
    expect(fromBrainEvent(event)).toEqual({ session_id: sessionId, event_id: 'event-1', event_type: 'TRUST_SELECTED', phase: 'trust', actor_player_id: p1, target_player_id: p2, payload: { level: 'HIGH' } })
  })

  it('hydrates an ordered immutable domain event store and rejects invalid persisted payloads', () => {
    const store = hydrateBrainEventStore(sessionId, [eventRow({ event_id: 'event-2', sequence: 2, event_type: 'PHASE_ENTERED', phase: 'investigation', actor_player_id: undefined, target_player_id: undefined, payload: { previousPhase: 'TRUST', newPhase: 'INVESTIGATION' } }), eventRow()])
    expect(store).toMatchObject({ sessionId, events: [{ sequence: 1 }, { sequence: 2 }] })
    expect(() => toBrainEvent(eventRow({ payload: { level: 'INVALID' } }))).toThrow(BrainPersistenceError)
    expect(() => hydrateBrainEventStore(sessionId, [eventRow({ sequence: 2 })])).toThrow(BrainPersistenceError)
    expect(createBrainEventStore(sessionId).events).toHaveLength(0)
  })

  it('hydrates trust and suspicion current state without database fields', () => {
    const trustRows: TrustRow[] = [{ session_id: sessionId, source_player_id: p1, target_player_id: p2, level: 'HIGH', phase: 'trust', active: true }]
    const suspicionRows: SuspicionRow[] = [{ session_id: sessionId, source_player_id: p1, target_player_id: p2, confidence: 'MEDIUM', phase: 'investigation', active: true }]
    expect(toTrustGraphState(trustRows, [p2, p1])).toMatchObject({ playerIds: [p1, p2], edges: [{ sourcePlayerId: p1, targetPlayerId: p2, strength: 1 }] })
    expect(toSuspicionGraphState(suspicionRows, [p2, p1])).toMatchObject({ playerIds: [p1, p2], edges: [{ sourcePlayerId: p1, targetPlayerId: p2, confidence: 'MEDIUM' }] })
  })

  it('hydrates only valid Regia envelopes and rejects forbidden or malformed data', () => {
    const base: ProposalRow = { proposal_id: 'proposal-1', session_id: sessionId, source_proposal_id: 'director-1', control_mode: 'SUGGEST', status: 'PENDING', command_type: 'CHECK_TABLE', payload: { commandType: 'CHECK_TABLE', scope: { type: 'TABLE', tableId: 't1' } }, created_at: 'created', updated_at: 'updated' }
    expect(toRegiaProposal(base)).toMatchObject({ id: 'proposal-1', controlMode: 'SUGGEST', status: 'PENDING', commandType: 'CHECK_TABLE' })
    expect(() => toRegiaProposal({ ...base, command_type: 'CHANGE_SCENARIO_TRUTH', payload: { commandType: 'CHANGE_SCENARIO_TRUTH' } })).toThrow(BrainPersistenceError)
    expect(() => toRegiaProposal({ ...base, payload: { commandType: 'CHECK_PLAYER' } })).toThrow(BrainPersistenceError)
  })
})
