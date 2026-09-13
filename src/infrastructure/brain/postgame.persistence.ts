import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrainMetricsSnapshot, PersistedBrainSnapshot, PostGameAnalysisInput } from '../../domain/brain/brain.postgame'
import type { BrainPersistence } from './brain.persistence'
import type { BrainMetrics } from '../../domain/brain/brain.types'
import type { Database, Json } from '../../lib/supabase/database.types'

type Client = SupabaseClient<Database>
type SnapshotRow = Database['public']['Functions']['load_brain_snapshots']['Returns'][number]
type SnapshotPhase = PersistedBrainSnapshot['phase']
type SnapshotReason = PersistedBrainSnapshot['reason']

const phases = new Set(['LOBBY', 'SOCIAL_WARMUP', 'ROLE_REVEAL', 'TRUST', 'INVESTIGATION', 'DOUBT', 'FINAL_THEORY', 'VOTING', 'LOCKED', 'REVEAL', 'RESULTS'])
const phaseFromDb: Record<string, SnapshotPhase> = { lobby: 'LOBBY', role_reveal: 'ROLE_REVEAL', briefing: 'SOCIAL_WARMUP', discovery: 'INVESTIGATION', comparison: 'INVESTIGATION', pressure: 'DOUBT', deliberation: 'FINAL_THEORY', final_vote: 'VOTING', reveal: 'REVEAL', social_warmup: 'SOCIAL_WARMUP', trust: 'TRUST', investigation: 'INVESTIGATION', doubt: 'DOUBT', final_theory: 'FINAL_THEORY', voting: 'VOTING', locked: 'LOCKED', results: 'RESULTS' }
const reasons = new Set<SnapshotReason>(['PHASE_ENTERED', 'DECISION_CHANGED', 'INTERVENTION_APPROVED', 'MISSION_ACTIVATED', 'MISSION_OUTCOME', 'FINAL_VOTE_LOCKED'])

function nullableNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }
function metricsFromJson(value: Json): BrainMetricsSnapshot {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json> : {}
  const role = record.roleExposure !== null && typeof record.roleExposure === 'object' && !Array.isArray(record.roleExposure) ? record.roleExposure as Record<string, Json> : {}
  return { liarExposure: nullableNumber(record.liarExposure), roleExposure: { liar: nullableNumber(role.liar), accomplice: nullableNumber(role.accomplice), scapegoat: nullableNumber(role.scapegoat) }, suspicionCoverage: nullableNumber(record.suspicionCoverage), theoryDiversity: nullableNumber(record.theoryDiversity), theoryShiftRate: nullableNumber(record.theoryShiftRate), trustCoverage: nullableNumber(record.trustCoverage), trustConcentration: nullableNumber(record.trustConcentration), participationBalance: nullableNumber(record.participationBalance), ...(Array.isArray(record.tableMetrics) ? { tableMetrics: record.tableMetrics.filter((item): item is Record<string, Json> => item !== null && typeof item === 'object' && !Array.isArray(item)).map((item) => ({ tableId: String(item.tableId ?? ''), suspicionCoverage: nullableNumber(item.suspicionCoverage), theoryDiversity: nullableNumber(item.theoryDiversity), participationBalance: nullableNumber(item.participationBalance) })) } : {}) }
}

export function toPersistedBrainSnapshot(row: SnapshotRow): PersistedBrainSnapshot {
  const phase = phaseFromDb[row.phase]
  if (!phase || !phases.has(phase) || !reasons.has(row.reason as SnapshotReason) || !row.session_id || !Number.isInteger(row.sequence) || row.sequence < 1 || !row.fingerprint) throw new Error('INVALID_PERSISTED_BRAIN_SNAPSHOT')
  return { sessionId: row.session_id, sequence: row.sequence, phase, reason: row.reason as SnapshotReason, relatedEntityId: row.related_entity_id, fingerprint: row.fingerprint, metrics: metricsFromJson(row.metrics), createdAt: row.created_at }
}

export type PostGameContextLoader = (sessionId: string) => Promise<Pick<PostGameAnalysisInput, 'players' | 'tables' | 'finalPhase' | 'metrics'>>

export interface PostGamePersistence {
  loadPostGameSnapshots(sessionId: string): Promise<PersistedBrainSnapshot[]>
  appendPostGameSnapshot(input: { sessionId: string; phase: string; reason: SnapshotReason; relatedEntityId?: string; fingerprint: string; metrics: BrainMetricsSnapshot }): Promise<PersistedBrainSnapshot>
  loadPostGameAnalysisContext(sessionId: string): Promise<PostGameAnalysisInput>
}

function snapshotMetrics(metrics: BrainMetrics): BrainMetricsSnapshot {
  return { liarExposure: metrics.liarExposure, roleExposure: { ...metrics.roleExposure }, suspicionCoverage: metrics.suspicionCoverage, theoryDiversity: metrics.theoryDiversity, theoryShiftRate: metrics.theoryShiftRate, trustCoverage: metrics.trustCoverage, trustConcentration: metrics.trustConcentration, participationBalance: metrics.participationBalance, tableMetrics: metrics.tableMetrics.map((table) => ({ ...table })) }
}

export function createPostGamePersistence(client: Client, brain: BrainPersistence, loadContext: PostGameContextLoader): PostGamePersistence {
  return {
    async loadPostGameSnapshots(sessionId) {
      const { data, error } = await client.rpc('load_brain_snapshots', { session_id: sessionId })
      if (error) throw error
      return (data ?? []).map((row) => toPersistedBrainSnapshot(row))
    },
    async appendPostGameSnapshot(input) {
      if (!phases.has(input.phase) || !reasons.has(input.reason)) throw new Error('INVALID_BRAIN_SNAPSHOT_INPUT')
      const { data, error } = await client.rpc('append_brain_snapshot', { session_id: input.sessionId, reason: input.reason, phase: input.phase.toLowerCase(), related_entity_id: (input.relatedEntityId ?? null) as never, fingerprint: input.fingerprint, metrics: input.metrics as unknown as Json })
      if (error || !data?.[0]) throw error ?? new Error('EMPTY_BRAIN_SNAPSHOT_RESULT')
      return toPersistedBrainSnapshot(data[0])
    },
    async loadPostGameAnalysisContext(sessionId) {
      const context = await loadContext(sessionId)
      const playerIds = context.players.map((player) => player.playerId)
      const [eventStore, trustGraph, suspicionGraph, regiaProposals, missionOutcomes, brainSnapshots] = await Promise.all([brain.loadBrainEvents(sessionId), brain.loadTrustState(sessionId, playerIds), brain.loadSuspicionState(sessionId, playerIds), brain.loadRegiaProposals(sessionId), brain.loadMissionOutcomes(sessionId), this.loadPostGameSnapshots(sessionId)])
      return { ...context, sessionId, eventStore, trustGraph, suspicionGraph, regiaProposals, missionOutcomes, brainSnapshots, ...(context.metrics ? { metrics: context.metrics } : {}) }
    },
  }
}

export { snapshotMetrics }
