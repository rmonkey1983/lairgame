import type { GamePhase } from './brain.types'

export type BrainEventType =
  | 'TRUST_SELECTED'
  | 'TRUST_CHANGED'
  | 'SUSPICION_SELECTED'
  | 'SUSPICION_TARGET_CHANGED'
  | 'SUSPICION_CONFIDENCE_CHANGED'
  | 'PHASE_ENTERED'

export type TrustSelectedPayload = { level: 'LOW' | 'MEDIUM' | 'HIGH' }
export type TrustChangedPayload = { previousLevel: 'LOW' | 'MEDIUM' | 'HIGH'; newLevel: 'LOW' | 'MEDIUM' | 'HIGH' }
export type SuspicionSelectedPayload = { confidence: 'LOW' | 'MEDIUM' | 'HIGH' }
export type SuspicionTargetChangedPayload = { previousTargetPlayerId: string; newTargetPlayerId: string; confidence: 'LOW' | 'MEDIUM' | 'HIGH' }
export type SuspicionConfidenceChangedPayload = { targetPlayerId: string; previousConfidence: 'LOW' | 'MEDIUM' | 'HIGH'; newConfidence: 'LOW' | 'MEDIUM' | 'HIGH' }
export type PhaseEnteredPayload = { previousPhase?: GamePhase; newPhase: GamePhase }

type BrainEventBase<TType extends BrainEventType, TPayload> = {
  id: string
  sessionId: string
  sequence: number
  type: TType
  phase: GamePhase
  actorPlayerId?: string
  targetPlayerId?: string
  payload: TPayload
}

export type BrainEvent =
  | (BrainEventBase<'TRUST_SELECTED', TrustSelectedPayload> & { actorPlayerId: string; targetPlayerId: string })
  | (BrainEventBase<'TRUST_CHANGED', TrustChangedPayload> & { actorPlayerId: string; targetPlayerId: string })
  | (BrainEventBase<'SUSPICION_SELECTED', SuspicionSelectedPayload> & { actorPlayerId: string; targetPlayerId: string })
  | (BrainEventBase<'SUSPICION_TARGET_CHANGED', SuspicionTargetChangedPayload> & { actorPlayerId: string; targetPlayerId: string })
  | (BrainEventBase<'SUSPICION_CONFIDENCE_CHANGED', SuspicionConfidenceChangedPayload> & { actorPlayerId: string; targetPlayerId: string })
  | (BrainEventBase<'PHASE_ENTERED', PhaseEnteredPayload>)

export type BrainEventStore = { sessionId: string; events: BrainEvent[] }
export type EventPlayerFilter = 'actor' | 'target' | 'both'
export type EventValidationResult = { valid: boolean; violations: string[] }
export type AppendEventResult = { ok: true; store: BrainEventStore } | { ok: false; violations: string[] }

const phases: GamePhase[] = ['LOBBY', 'SOCIAL_WARMUP', 'ROLE_REVEAL', 'TRUST', 'INVESTIGATION', 'DOUBT', 'FINAL_THEORY', 'VOTING', 'LOCKED', 'REVEAL', 'RESULTS']
const levels = ['LOW', 'MEDIUM', 'HIGH'] as const
const relationEventTypes: BrainEventType[] = ['TRUST_SELECTED', 'TRUST_CHANGED', 'SUSPICION_SELECTED', 'SUSPICION_TARGET_CHANGED', 'SUSPICION_CONFIDENCE_CHANGED']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))
}

function isPhase(value: unknown): value is GamePhase {
  return typeof value === 'string' && phases.includes(value as GamePhase)
}

function isLevel(value: unknown): value is (typeof levels)[number] {
  return typeof value === 'string' && levels.includes(value as (typeof levels)[number])
}

function nonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validPayload(event: BrainEvent): boolean {
  if (!isRecord(event.payload)) return false
  const payload = event.payload as Record<string, unknown>
  if (event.type === 'TRUST_SELECTED') return hasOnlyKeys(payload, ['level']) && isLevel(payload.level)
  if (event.type === 'TRUST_CHANGED') return hasOnlyKeys(payload, ['previousLevel', 'newLevel']) && isLevel(payload.previousLevel) && isLevel(payload.newLevel) && payload.previousLevel !== payload.newLevel
  if (event.type === 'SUSPICION_SELECTED') return hasOnlyKeys(payload, ['confidence']) && isLevel(payload.confidence)
  if (event.type === 'SUSPICION_TARGET_CHANGED') return hasOnlyKeys(payload, ['previousTargetPlayerId', 'newTargetPlayerId', 'confidence']) && nonEmptyId(payload.previousTargetPlayerId) && nonEmptyId(payload.newTargetPlayerId) && payload.previousTargetPlayerId !== payload.newTargetPlayerId && isLevel(payload.confidence)
  if (event.type === 'SUSPICION_CONFIDENCE_CHANGED') return hasOnlyKeys(payload, ['targetPlayerId', 'previousConfidence', 'newConfidence']) && nonEmptyId(payload.targetPlayerId) && isLevel(payload.previousConfidence) && isLevel(payload.newConfidence) && payload.previousConfidence !== payload.newConfidence
  return (hasOnlyKeys(payload, ['newPhase']) || hasOnlyKeys(payload, ['previousPhase', 'newPhase'])) && (payload.previousPhase === undefined || isPhase(payload.previousPhase)) && isPhase(payload.newPhase) && payload.newPhase === event.phase
}

function cloneEvent(event: BrainEvent): BrainEvent {
  return { ...event, payload: { ...event.payload } } as BrainEvent
}

export function createBrainEventStore(sessionId: string): BrainEventStore {
  return { sessionId, events: [] }
}

export function validateBrainEvent(store: BrainEventStore, event: BrainEvent): EventValidationResult {
  const violations: string[] = []
  if (!nonEmptyId(store.sessionId) || event.sessionId !== store.sessionId) violations.push('SESSION_MISMATCH')
  if (!nonEmptyId(event.id)) violations.push('EVENT_ID_INVALID')
  if (!Number.isInteger(event.sequence) || event.sequence < 1) violations.push('SEQUENCE_INVALID')
  const latest = store.events[store.events.length - 1]
  if (latest && event.sequence !== latest.sequence + 1) violations.push('SEQUENCE_OUT_OF_ORDER')
  if (store.events.some((existing) => existing.id === event.id)) violations.push('EVENT_ID_DUPLICATED')
  if (store.events.some((existing) => existing.sequence === event.sequence)) violations.push('SEQUENCE_DUPLICATED')
  if (!isPhase(event.phase)) violations.push('PHASE_INVALID')
  if (!relationEventTypes.includes(event.type)) {
    if (event.type !== 'PHASE_ENTERED') violations.push('EVENT_TYPE_UNKNOWN')
  } else {
    if (!nonEmptyId(event.actorPlayerId) || !nonEmptyId(event.targetPlayerId)) violations.push('ACTOR_TARGET_REQUIRED')
    if (event.actorPlayerId === event.targetPlayerId) violations.push('ACTOR_TARGET_INVALID')
    if (event.type === 'SUSPICION_CONFIDENCE_CHANGED' && isRecord(event.payload) && event.payload.targetPlayerId !== event.targetPlayerId) violations.push('TARGET_MISMATCH')
    if (event.type === 'SUSPICION_TARGET_CHANGED' && isRecord(event.payload) && event.payload.newTargetPlayerId !== event.targetPlayerId) violations.push('TARGET_MISMATCH')
  }
  if (!validPayload(event)) violations.push('PAYLOAD_INVALID')
  return { valid: violations.length === 0, violations: [...new Set(violations)] }
}

export function appendBrainEvent(store: BrainEventStore, event: BrainEvent): AppendEventResult {
  const validation = validateBrainEvent(store, event)
  if (!validation.valid) return { ok: false, violations: validation.violations }
  return { ok: true, store: { sessionId: store.sessionId, events: [...store.events.map(cloneEvent), cloneEvent(event)] } }
}

function orderedEvents(store: BrainEventStore): BrainEvent[] {
  return [...store.events].sort((first, second) => first.sequence - second.sequence).map(cloneEvent)
}

export function getEvents(store: BrainEventStore): BrainEvent[] { return orderedEvents(store) }

export function getEventsByType(store: BrainEventStore, type: BrainEventType): BrainEvent[] { return orderedEvents(store).filter((event) => event.type === type) }

export function getEventsByPlayer(store: BrainEventStore, playerId: string, filter: EventPlayerFilter = 'both'): BrainEvent[] {
  return orderedEvents(store).filter((event) => filter === 'actor' ? event.actorPlayerId === playerId : filter === 'target' ? event.targetPlayerId === playerId : event.actorPlayerId === playerId || event.targetPlayerId === playerId)
}

export function getEventsByPhase(store: BrainEventStore, phase: GamePhase): BrainEvent[] { return orderedEvents(store).filter((event) => event.phase === phase) }

export function getEventsBetweenSequences(store: BrainEventStore, fromSequence: number, toSequence: number): BrainEvent[] {
  return orderedEvents(store).filter((event) => event.sequence >= fromSequence && event.sequence <= toSequence)
}

export function getLatestEvent(store: BrainEventStore): BrainEvent | null { return orderedEvents(store).at(-1) ?? null }

export function getLatestEventOfType(store: BrainEventStore, type: BrainEventType): BrainEvent | null { return getEventsByType(store, type).at(-1) ?? null }

export function countEvents(store: BrainEventStore): number { return store.events.length }

export function countEventsByType(store: BrainEventStore, type: BrainEventType): number { return getEventsByType(store, type).length }
