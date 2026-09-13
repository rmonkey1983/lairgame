import type { SupabaseClient } from '@supabase/supabase-js'
import { appendBrainEvent, createBrainEventStore, type BrainEvent, type BrainEventStore } from '../../domain/brain/brain.events'
import { validateRegiaProposal, approveRegiaProposal, rejectRegiaProposal, type RegiaProposal } from '../../domain/brain/brain.regia'
import { setSuspicion, validateSuspicionSelection, type SuspicionGraph, type SuspicionSelection } from '../../domain/brain/brain.suspicion'
import { setTrust, validateTrustSelection, type TrustGraph, type TrustSelection, TRUST_LEVEL_STRENGTH } from '../../domain/brain/brain.trust'
import type { LiveDirectorContext } from '../../domain/brain/brain.director'
import type { GamePhase, MissionOutcomeRecord, MissionType } from '../../domain/brain/brain.types'
import type { Database, Json } from '../../lib/supabase/database.types'

type Client = SupabaseClient<Database>
type EventRow = Database['public']['Functions']['load_brain_events']['Returns'][number]
type TrustRow = Database['public']['Functions']['load_brain_trust_state']['Returns'][number]
type SuspicionRow = Database['public']['Functions']['load_brain_suspicion_state']['Returns'][number]
type ProposalRow = Database['public']['Functions']['load_brain_regia_proposals']['Returns'][number]
type ExecutionRow = { ok: boolean; proposal_id: string; execution_id: string | null; action: string | null; reason: string | null }
type MissionOutcomeRow = Database['public']['Functions']['load_brain_mission_outcome_metrics']['Returns'][number]
type AppendEventArgs = { session_id: string; event_id: string; event_type: string; phase: string; actor_player_id: string | null; target_player_id: string | null; payload: Json }

const phaseFromDb: Record<string, GamePhase> = {
  lobby: 'LOBBY', social_warmup: 'SOCIAL_WARMUP', role_reveal: 'ROLE_REVEAL', trust: 'TRUST', investigation: 'INVESTIGATION',
  doubt: 'DOUBT', final_theory: 'FINAL_THEORY', voting: 'VOTING', locked: 'LOCKED', reveal: 'REVEAL', results: 'RESULTS',
}
const phaseToDb: Record<GamePhase, string> = Object.fromEntries(Object.entries(phaseFromDb).map(([key, value]) => [value, key])) as Record<GamePhase, string>
const levels = new Set(['LOW', 'MEDIUM', 'HIGH'])
const strategies = new Set(['OBSERVE', 'CHECK_PLAYER', 'CHECK_TABLE', 'INCREASE_PARTICIPATION', 'DIVERSIFY_THEORIES', 'CREATE_TRUST_OPPORTUNITY', 'REDUCE_DIRECT_PRESSURE'])
const manualCommands = new Set(['START_PHASE', 'ADVANCE_PHASE', 'OPEN_VOTING', 'CLOSE_VOTING', 'LOCK_GAME', 'START_REVEAL', 'PAUSE_GAME', 'STOP_GAME'])
const forbiddenCommands = new Set(['CHANGE_SCENARIO_TRUTH', 'REASSIGN_LIAR_AFTER_START', 'REASSIGN_ACCOMPLICE_AFTER_START', 'REASSIGN_SCAPEGOAT_AFTER_START', 'BYPASS_MISSION_VALIDATOR'])

export class BrainPersistenceError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'BrainPersistenceError'
    this.code = code
  }
}

function requirePhase(value: string): GamePhase {
  const phase = phaseFromDb[value]
  if (!phase) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Unknown persisted phase: ${value}`)
  return phase
}

function requireLevel(value: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (!levels.has(value)) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Unknown persisted level: ${value}`)
  return value as 'LOW' | 'MEDIUM' | 'HIGH'
}

function requireRecord(value: Json): Record<string, Json> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', 'Persisted payload must be an object')
  return value as Record<string, Json>
}

export function toBrainEvent(row: EventRow): BrainEvent {
  if (!Number.isInteger(row.sequence) || row.sequence < 1 || !row.event_id.trim() || !row.session_id) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Invalid Brain event identity: ${row.event_id}`)
  const event = {
    id: row.event_id,
    sessionId: row.session_id,
    sequence: row.sequence,
    type: row.event_type,
    phase: requirePhase(row.phase),
    ...(row.actor_player_id ? { actorPlayerId: row.actor_player_id } : {}),
    ...(row.target_player_id ? { targetPlayerId: row.target_player_id } : {}),
    payload: requireRecord(row.payload),
  } as BrainEvent
  const validation = appendBrainEvent(createBrainEventStore(row.session_id), { ...event, sequence: 1 }).ok
  if (!validation) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Invalid Brain event: ${row.event_id}`)
  return event
}

export function fromBrainEvent(event: BrainEvent): AppendEventArgs {
  return {
    session_id: event.sessionId,
    event_id: event.id,
    event_type: event.type,
    phase: phaseToDb[event.phase],
    actor_player_id: event.actorPlayerId ?? null,
    target_player_id: event.targetPlayerId ?? null,
    payload: event.payload as unknown as Json,
  }
}

export function hydrateBrainEventStore(sessionId: string, rows: EventRow[]): BrainEventStore {
  const store = createBrainEventStore(sessionId)
  const ordered = [...rows].sort((first, second) => first.sequence - second.sequence)
  if (ordered[0] && ordered[0].sequence !== 1) throw new BrainPersistenceError('INVALID_PERSISTED_SEQUENCE', 'Brain event sequence must start at 1')
  for (const row of ordered) {
    const result = appendBrainEvent(store, toBrainEvent(row))
    if (!result.ok) throw new BrainPersistenceError('INVALID_PERSISTED_SEQUENCE', result.violations.join(','))
    Object.assign(store, result.store)
  }
  return store
}

export function toTrustGraphState(rows: TrustRow[], playerIds: string[]): TrustGraph {
  const graph: TrustGraph = { playerIds: [...playerIds].sort(), edges: [], history: [] }
  for (const row of rows) {
    const level = requireLevel(row.level)
    if (!row.active) continue
    if (row.source_player_id === row.target_player_id) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', 'Trust self-edge is invalid')
    graph.edges.push({ sourcePlayerId: row.source_player_id, targetPlayerId: row.target_player_id, type: 'TRUST', phase: requirePhase(row.phase), level, strength: TRUST_LEVEL_STRENGTH[level], active: true })
  }
  graph.edges.sort((first, second) => `${first.sourcePlayerId}:${first.targetPlayerId}`.localeCompare(`${second.sourcePlayerId}:${second.targetPlayerId}`))
  return graph
}

export function toSuspicionGraphState(rows: SuspicionRow[], playerIds: string[]): SuspicionGraph {
  const graph: SuspicionGraph = { playerIds: [...playerIds].sort(), edges: [], history: [] }
  const sources = new Set<string>()
  for (const row of rows) {
    const confidence = requireLevel(row.confidence)
    if (!row.active) continue
    if (sources.has(row.source_player_id) || row.source_player_id === row.target_player_id) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', 'Suspicion state violates one-active-source invariant')
    sources.add(row.source_player_id)
    graph.edges.push({ sourcePlayerId: row.source_player_id, targetPlayerId: row.target_player_id, type: 'SUSPICION', phase: requirePhase(row.phase), confidence, active: true })
  }
  graph.edges.sort((first, second) => first.sourcePlayerId.localeCompare(second.sourcePlayerId))
  return graph
}

function proposalPayload(row: ProposalRow): RegiaProposal['payload'] {
  const payload = requireRecord(row.payload)
  if (payload.commandType !== row.command_type) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Proposal payload command mismatch: ${row.proposal_id}`)
  if (strategies.has(row.command_type)) {
    const scope = payload.scope
    if (scope === null || typeof scope !== 'object' || Array.isArray(scope) || !['SESSION', 'TABLE', 'PLAYER'].includes(String((scope as Record<string, Json>).type))) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Invalid proposal scope: ${row.proposal_id}`)
    return { commandType: row.command_type as RegiaProposal['payload'] extends { commandType: infer T } ? T : never, scope: scope as never, ...('missionProposal' in payload ? { missionProposal: payload.missionProposal as never } : {}) } as RegiaProposal['payload']
  }
  if (manualCommands.has(row.command_type)) {
    if (row.command_type === 'START_PHASE' || row.command_type === 'ADVANCE_PHASE') {
      if (typeof payload.phase !== 'string' || !phaseFromDb[payload.phase.toLowerCase()]) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Invalid phase command payload: ${row.proposal_id}`)
      return { commandType: row.command_type, phase: requirePhase(payload.phase.toLowerCase()) }
    }
    return { commandType: row.command_type as never }
  }
  if (forbiddenCommands.has(row.command_type)) throw new BrainPersistenceError('FORBIDDEN_COMMAND', `Forbidden proposal: ${row.proposal_id}`)
  throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Unknown proposal command: ${row.proposal_id}`)
}

export function toRegiaProposal(row: ProposalRow): RegiaProposal {
  if (!['AUTO', 'SUGGEST', 'MANUAL'].includes(row.control_mode) || !['PENDING', 'APPROVED', 'REJECTED', 'EXECUTING', 'EXECUTED', 'EXECUTION_FAILED'].includes(row.status)) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', `Invalid proposal state: ${row.proposal_id}`)
  const proposal = {
    id: row.proposal_id,
    controlMode: row.control_mode,
    status: row.status,
    ...(row.source_proposal_id ? { sourceProposalId: row.source_proposal_id } : {}),
    commandType: row.command_type,
    payload: proposalPayload(row),
  } as RegiaProposal
  if (manualCommands.has(row.command_type) && proposal.sourceProposalId) throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', 'Manual proposal has a Director source')
  if (strategies.has(row.command_type) && row.control_mode === 'MANUAL') throw new BrainPersistenceError('INVALID_PERSISTED_PAYLOAD', 'Strategy proposal cannot be manual')
  return proposal
}

async function rpc<T>(call: PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>, operation: string): Promise<T[]> {
  const { data, error } = await call
  if (error) throw new BrainPersistenceError(error.code ?? 'DB_ERROR', `${operation}: ${error.message}`, { cause: error })
  if (!data) throw new BrainPersistenceError('DB_EMPTY_RESULT', `${operation}: empty result`)
  return data
}

export interface BrainPersistence {
  loadBrainEvents(sessionId: string): Promise<BrainEventStore>
  appendBrainEvent(event: BrainEvent): Promise<BrainEvent>
  loadTrustState(sessionId: string, playerIds: string[]): Promise<TrustGraph>
  setTrust(sessionId: string, selection: TrustSelection, graph?: TrustGraph): Promise<TrustGraph>
  loadSuspicionState(sessionId: string, playerIds: string[]): Promise<SuspicionGraph>
  setSuspicion(sessionId: string, selection: SuspicionSelection, graph?: SuspicionGraph): Promise<SuspicionGraph>
  loadRegiaProposals(sessionId: string): Promise<RegiaProposal[]>
  loadMissionOutcomes(sessionId: string): Promise<MissionOutcomeRecord[]>
  saveRegiaProposal(sessionId: string, proposal: RegiaProposal, context?: LiveDirectorContext): Promise<RegiaProposal>
  approveRegiaProposal(sessionId: string, proposalId: string, context?: LiveDirectorContext): Promise<RegiaProposal>
  rejectRegiaProposal(sessionId: string, proposalId: string, context?: LiveDirectorContext): Promise<RegiaProposal>
  executeApprovedProposal(sessionId: string, proposalId: string): Promise<ExecutionRow>
}

export function createBrainPersistence(client: Client): BrainPersistence {
  return {
    async loadBrainEvents(sessionId) {
      const rows = await rpc(client.rpc('load_brain_events', { session_id: sessionId }), 'loadBrainEvents')
      return hydrateBrainEventStore(sessionId, rows as EventRow[])
    },
    async appendBrainEvent(event) {
      const candidate = { ...event, sequence: 1 } as BrainEvent
      if (!appendBrainEvent(createBrainEventStore(event.sessionId), candidate).ok) throw new BrainPersistenceError('DOMAIN_VALIDATION_FAILED', 'Brain event rejected by domain validation')
      const row = (await rpc(client.rpc('append_brain_event', fromBrainEvent(event) as never), 'appendBrainEvent'))[0]
      if (!row) throw new BrainPersistenceError('DB_EMPTY_RESULT', 'appendBrainEvent: empty result')
      return toBrainEvent(row as EventRow)
    },
    async loadTrustState(sessionId, playerIds) {
      return toTrustGraphState(await rpc(client.rpc('load_brain_trust_state', { session_id: sessionId }), 'loadTrustState') as TrustRow[], playerIds)
    },
    async setTrust(sessionId, selection, graph) {
      const validation = validateTrustSelection(graph ?? { playerIds: [selection.sourcePlayerId, selection.targetPlayerId], edges: [], history: [] }, selection)
      if (!validation.valid) throw new BrainPersistenceError('DOMAIN_VALIDATION_FAILED', validation.violations.join(','))
      await rpc(client.rpc('set_brain_trust', { session_id: sessionId, source_player_id: selection.sourcePlayerId, target_player_id: selection.targetPlayerId, level: selection.level ?? 'MEDIUM', phase: phaseToDb[selection.phase] }), 'setTrust')
      return setTrust(graph ?? { playerIds: [selection.sourcePlayerId, selection.targetPlayerId], edges: [], history: [] }, selection)
    },
    async loadSuspicionState(sessionId, playerIds) {
      return toSuspicionGraphState(await rpc(client.rpc('load_brain_suspicion_state', { session_id: sessionId }), 'loadSuspicionState') as SuspicionRow[], playerIds)
    },
    async setSuspicion(sessionId, selection, graph) {
      const validation = validateSuspicionSelection(graph ?? { playerIds: [selection.sourcePlayerId, selection.targetPlayerId], edges: [], history: [] }, selection)
      if (!validation.valid) throw new BrainPersistenceError('DOMAIN_VALIDATION_FAILED', validation.violations.join(','))
      await rpc(client.rpc('set_brain_suspicion', { session_id: sessionId, source_player_id: selection.sourcePlayerId, target_player_id: selection.targetPlayerId, confidence: selection.confidence ?? 'MEDIUM', phase: phaseToDb[selection.phase] }), 'setSuspicion')
      return setSuspicion(graph ?? { playerIds: [selection.sourcePlayerId, selection.targetPlayerId], edges: [], history: [] }, selection)
    },
    async loadRegiaProposals(sessionId) {
      const rows = await rpc(client.rpc('load_brain_regia_proposals', { session_id: sessionId }), 'loadRegiaProposals')
      return (rows as ProposalRow[]).map(toRegiaProposal)
    },
    async loadMissionOutcomes(sessionId) {
      const rows = await rpc(client.rpc('load_brain_mission_outcome_metrics', { session_id: sessionId }), 'loadMissionOutcomes')
      return (rows as MissionOutcomeRow[]).map((row) => ({ missionId: row.mission_id, missionType: row.mission_type as MissionType, playerId: row.player_id, ...(row.table_id ? { tableId: row.table_id } : {}), status: row.status as MissionOutcomeRecord['status'], acknowledgedAt: row.acknowledged_at, activatedAt: row.activated_at, outcomeAt: row.outcome_at, sourceProposalId: row.regia_proposal_id, directorProposalId: row.director_proposal_id }))
    },
    async saveRegiaProposal(sessionId, proposal, context) {
      const validation = validateRegiaProposal(proposal, context)
      if (!validation.valid) throw new BrainPersistenceError('DOMAIN_VALIDATION_FAILED', validation.violations.join(','))
      const row = (await rpc(client.rpc('save_brain_regia_proposal', { session_id: sessionId, proposal_id: proposal.id, source_proposal_id: proposal.sourceProposalId ?? null, control_mode: proposal.controlMode, status: proposal.status, command_type: proposal.commandType, payload: proposal.payload as unknown as Json } as never), 'saveRegiaProposal'))[0]
      return toRegiaProposal(row as ProposalRow)
    },
    async approveRegiaProposal(sessionId, proposalId, context) {
      const current = (await this.loadRegiaProposals(sessionId)).find((proposal) => proposal.id === proposalId)
      if (!current) throw new BrainPersistenceError('PROPOSAL_NOT_FOUND', proposalId)
      const validation = approveRegiaProposal(current, 'MC', context)
      if (!validation.valid) throw new BrainPersistenceError('DOMAIN_VALIDATION_FAILED', validation.violations.join(','))
      const row = (await rpc(client.rpc('approve_brain_regia_proposal', { session_id: sessionId, proposal_id: proposalId }), 'approveRegiaProposal'))[0]
      return toRegiaProposal(row as ProposalRow)
    },
    async rejectRegiaProposal(sessionId, proposalId, context) {
      const current = (await this.loadRegiaProposals(sessionId)).find((proposal) => proposal.id === proposalId)
      if (!current) throw new BrainPersistenceError('PROPOSAL_NOT_FOUND', proposalId)
      const validation = rejectRegiaProposal(current, 'MC', context)
      if (!validation.valid) throw new BrainPersistenceError('DOMAIN_VALIDATION_FAILED', validation.violations.join(','))
      const row = (await rpc(client.rpc('reject_brain_regia_proposal', { session_id: sessionId, proposal_id: proposalId }), 'rejectRegiaProposal'))[0]
      return toRegiaProposal(row as ProposalRow)
    },
    async executeApprovedProposal(sessionId, proposalId) {
      const row = (await rpc(client.rpc('execute_approved_regia_proposal', { session_id: sessionId, proposal_id: proposalId }), 'executeApprovedProposal'))[0] as unknown as ExecutionRow | undefined
      if (!row) throw new BrainPersistenceError('DB_EMPTY_RESULT', 'executeApprovedProposal: empty result')
      if (!row.ok) throw new BrainPersistenceError(row.reason ?? 'EXECUTION_FAILED', `executeApprovedProposal: ${row.reason ?? 'execution failed'}`)
      return row
    },
  }
}
