import { calculateMissionOutcomeMetrics, type MissionOutcomeMetrics } from './brain.metrics'
import { countEvents, getEvents, type BrainEventStore } from './brain.events'
import { calculateTrustConcentration, calculateTrustCoverage, type TrustGraph } from './brain.trust'
import type { BrainDecision, BrainMetrics, BrainPlayer, BrainTable, BrainDecisionType, GamePhase, MissionOutcomeRecord, MissionType } from './brain.types'
import type { DirectorProposal, DirectorStrategy } from './brain.director'
import type { RegiaProposal } from './brain.regia'
import type { SuspicionGraph } from './brain.suspicion'

export type FinalVote = { voterPlayerId: string; targetPlayerId: string }
export type FinalVotingData = { votes: FinalVote[]; liarPlayerId?: string }

export type TheorySnapshot = {
  sequence: number
  phase: GamePhase
  theories: Record<string, string | null>
  liarExposure?: number | null
}

export type BrainMetricsSnapshot = {
  liarExposure: number | null
  roleExposure: { liar: number | null; accomplice: number | null; scapegoat: number | null }
  suspicionCoverage: number | null
  theoryDiversity: number | null
  theoryShiftRate: number | null
  trustCoverage: number | null
  trustConcentration: number | null
  participationBalance: number | null
  tableMetrics?: Array<{ tableId: string; suspicionCoverage: number | null; theoryDiversity: number | null; participationBalance: number | null }>
}

export type PersistedBrainSnapshot = {
  sessionId: string
  sequence: number
  phase: GamePhase
  reason: 'PHASE_ENTERED' | 'DECISION_CHANGED' | 'INTERVENTION_APPROVED' | 'MISSION_ACTIVATED' | 'MISSION_OUTCOME' | 'FINAL_VOTE_LOCKED'
  relatedEntityId?: string | null
  fingerprint: string
  metrics: BrainMetricsSnapshot
  createdAt: string
}

export function getSnapshotsForSession(snapshots: readonly PersistedBrainSnapshot[], sessionId: string): PersistedBrainSnapshot[] {
  return snapshots.filter((snapshot) => snapshot.sessionId === sessionId).sort((a, b) => a.sequence - b.sequence).map((snapshot) => ({ ...snapshot, metrics: { ...snapshot.metrics, roleExposure: { ...snapshot.metrics.roleExposure }, ...(snapshot.metrics.tableMetrics ? { tableMetrics: snapshot.metrics.tableMetrics.map((table) => ({ ...table })) } : {}) } }))
}

export function getSnapshotBefore(snapshots: readonly PersistedBrainSnapshot[], sequence: number): PersistedBrainSnapshot | null {
  return [...snapshots].filter((snapshot) => snapshot.sequence < sequence).sort((a, b) => b.sequence - a.sequence)[0] ?? null
}

export function getSnapshotAfter(snapshots: readonly PersistedBrainSnapshot[], sequence: number): PersistedBrainSnapshot | null {
  return [...snapshots].filter((snapshot) => snapshot.sequence > sequence).sort((a, b) => a.sequence - b.sequence)[0] ?? null
}

export type ObservedBeforeAfter = { before: number | null; after: number | null; delta: number | null; attribution: 'OBSERVED_ONLY' }

export type PostGameSummary = {
  players: number
  tables: number
  finalPhase: GamePhase | null
  eventsRecorded: number
  trustCoverage: number | null
  suspicionCoverage: number | null
  missionsActivated: number
  missionsTerminal: number
}

export type FinalGameOutcome = {
  trueLiarPlayerId: string
  finalVotes: number
  identifiedByPlayers: number
  totalVotes: number
}

export type TheoryDynamicsAnalysis = {
  initialTheoryDiversity: number | null
  finalTheoryDiversity: number | null
  peakLiarExposure: number | null
  finalLiarExposure: number | null
  theoryShiftRate: number | null
  averageTheoryChanges: number | null
  mostSuspectedPlayers: string[]
  beforeAfterLiarExposure: ObservedBeforeAfter | null
}

export type TrustDynamicsAnalysis = {
  coverage: number | null
  concentration: number | null
  mutualTrustCount: number
  trustChanges: number
  largestIncomingTrustConcentration: number | null
  beforeAfterConcentration: ObservedBeforeAfter | null
}
export type SocialDynamicsAnalysis = { trust: TrustDynamicsAnalysis; suspicionCoverage: number | null }

export type ParticipationAnalysis = {
  balance: number | null
  activity: BrainMetrics['playerActivity']
  inactivePlayerDecisions: number
  tableParticipation: Array<{ tableId: string; playerCount: number; activityCount: number; participationBalance: number | null }>
}

export type PostGameTableAnalysis = {
  tableId: string
  playerCount: number
  suspicionCoverage: number | null
  theoryDiversity: number | null
  participationBalance: number | null
  missionsActivated: number
  missionsCompleted: number
  brainDecisionCount: number
}

export type InterventionAnalysisItem = {
  decisionId?: string
  decisionType?: BrainDecisionType
  directorProposalId?: string
  strategy?: DirectorStrategy
  regiaProposalId?: string
  regiaStatus?: string
  missionId?: string
  missionType?: MissionType
  missionOutcome?: MissionOutcomeRecord['status']
  traceComplete: boolean
}

export type InterventionAnalysis = { items: InterventionAnalysisItem[]; funnel: { proposals: number; approved: number; executed: number; delivered: number; acknowledged: number; completed: number } }
export type BrainPerformanceAnalysis = { decisionsGenerated: number; directorProposalsGenerated: number; regiaApproved: number; regiaRejected: number; missionsExecuted: number; deterministicFallbackCount: number | null; aiUsedCount: number | null; invalidProposalCount: number | null }
export type PostGameAnalysisWarning = 'LOW_SUSPICION_COVERAGE' | 'LOW_TRUST_COVERAGE' | 'INCOMPLETE_EVENT_HISTORY' | 'MISSING_FINAL_VOTE' | 'LOW_MISSION_OUTCOME_COVERAGE' | 'INCOMPLETE_INTERVENTION_TRACE'
export type PostGameDataQuality = { completeEventTimeline: boolean; trustDataAvailable: boolean; suspicionDataAvailable: boolean; votingDataAvailable: boolean; missionOutcomeCoverage: number | null; missingSignals: string[] }

export type PostGameAnalysisInput = {
  sessionId: string
  players: BrainPlayer[]
  tables: BrainTable[]
  finalPhase?: GamePhase | null
  eventStore?: BrainEventStore
  trustGraph?: TrustGraph
  suspicionGraph?: SuspicionGraph
  metrics?: BrainMetrics
  decisions?: BrainDecision[]
  directorProposals?: DirectorProposal[]
  regiaProposals?: RegiaProposal[]
  missionOutcomes?: MissionOutcomeRecord[]
  theoryHistory?: TheorySnapshot[]
  finalVoting?: FinalVotingData
  brainSnapshots?: PersistedBrainSnapshot[]
}

function clamp(value: number): number { return Number(Math.max(0, Math.min(1, value)).toFixed(6)) }
function ratio(numerator: number, denominator: number): number | null { return denominator > 0 ? clamp(numerator / denominator) : null }
function diversity(theories: Array<string | null>): number | null {
  const values = theories.filter((value): value is string => Boolean(value))
  if (!values.length) return null
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  if (counts.size === 1) return 0
  const hhi = [...counts.values()].reduce((sum, count) => sum + (count / values.length) ** 2, 0)
  return clamp((1 - hhi) / (1 - 1 / values.length))
}
function beforeAfter(before: number | null | undefined, after: number | null | undefined): ObservedBeforeAfter | null {
  if (before === null || before === undefined || after === null || after === undefined) return null
  return { before, after, delta: Number((after - before).toFixed(6)), attribution: 'OBSERVED_ONLY' }
}
function latestSnapshots(history: TheorySnapshot[]): [TheorySnapshot | undefined, TheorySnapshot | undefined] {
  const ordered = [...history].sort((a, b) => a.sequence - b.sequence)
  return [ordered[0], ordered.at(-1)]
}

export function analyzeGameSummary(input: PostGameAnalysisInput, outcomes: MissionOutcomeRecord[] = input.missionOutcomes ?? []): PostGameSummary {
  const missionMetrics = calculateMissionOutcomeMetrics(outcomes)
  return { players: input.players.length, tables: input.tables.length, finalPhase: input.finalPhase ?? null, eventsRecorded: input.eventStore ? countEvents(input.eventStore) : 0, trustCoverage: input.trustGraph ? calculateTrustCoverage(input.trustGraph) : input.metrics?.trustCoverage ?? null, suspicionCoverage: input.metrics?.suspicionCoverage ?? null, missionsActivated: missionMetrics.totalActivated, missionsTerminal: missionMetrics.completed + missionMetrics.failed + missionMetrics.expired }
}

export function analyzeFinalOutcome(voting?: FinalVotingData): FinalGameOutcome | null {
  if (!voting?.liarPlayerId || !voting.votes.length) return null
  return { trueLiarPlayerId: voting.liarPlayerId, finalVotes: voting.votes.filter((vote) => vote.targetPlayerId === voting.liarPlayerId).length, identifiedByPlayers: new Set(voting.votes.filter((vote) => vote.targetPlayerId === voting.liarPlayerId).map((vote) => vote.voterPlayerId)).size, totalVotes: voting.votes.length }
}

export function analyzeTheoryDynamics(input: PostGameAnalysisInput): TheoryDynamicsAnalysis {
  const [first, last] = latestSnapshots(input.theoryHistory ?? [])
  const history = [...(input.theoryHistory ?? [])].sort((a, b) => a.sequence - b.sequence)
  const persisted = getSnapshotsForSession(input.brainSnapshots ?? [], input.sessionId)
  const firstPersisted = persisted[0]
  const lastPersisted = persisted.at(-1)
  const changes = new Map<string, number>()
  for (let index = 1; index < history.length; index += 1) for (const playerId of Object.keys(history[index].theories)) if (history[index - 1].theories[playerId] !== history[index].theories[playerId]) changes.set(playerId, (changes.get(playerId) ?? 0) + 1)
  const allTargets = history.flatMap((snapshot) => Object.values(snapshot.theories))
  const suspectCounts = new Map<string, number>()
  allTargets.forEach((target) => { if (target) suspectCounts.set(target, (suspectCounts.get(target) ?? 0) + 1) })
  const max = Math.max(...suspectCounts.values(), 0)
  const exposures = history.length ? history.map((snapshot) => snapshot.liarExposure).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value)) : persisted.map((snapshot) => snapshot.metrics.liarExposure).filter((value): value is number => value !== null && Number.isFinite(value))
  const initialDiversity = first ? diversity(Object.values(first.theories)) : firstPersisted?.metrics.theoryDiversity ?? null
  const finalDiversity = last ? diversity(Object.values(last.theories)) : lastPersisted?.metrics.theoryDiversity ?? null
  const firstExposure = first?.liarExposure ?? firstPersisted?.metrics.liarExposure
  const finalExposure = last?.liarExposure ?? lastPersisted?.metrics.liarExposure
  return { initialTheoryDiversity: initialDiversity, finalTheoryDiversity: finalDiversity, peakLiarExposure: exposures.length ? Math.max(...exposures) : null, finalLiarExposure: finalExposure ?? null, theoryShiftRate: ratio([...changes.values()].filter((value) => value > 0).length, input.players.length), averageTheoryChanges: input.players.length ? Number(([...changes.values()].reduce((sum, value) => sum + value, 0) / input.players.length).toFixed(6)) : null, mostSuspectedPlayers: max > 0 ? [...suspectCounts.entries()].filter(([, count]) => count === max).map(([playerId]) => playerId).sort() : [], beforeAfterLiarExposure: beforeAfter(firstExposure, finalExposure) }
}

export function analyzeTrustDynamics(input: PostGameAnalysisInput): TrustDynamicsAnalysis {
  const graph = input.trustGraph
  if (!graph) return { coverage: null, concentration: null, mutualTrustCount: 0, trustChanges: 0, largestIncomingTrustConcentration: null, beforeAfterConcentration: null }
  const mutualTrustCount = graph.edges.filter((edge) => graph.edges.some((other) => other.sourcePlayerId === edge.targetPlayerId && other.targetPlayerId === edge.sourcePlayerId)).length / 2
  const incoming = new Map<string, number>()
  graph.edges.forEach((edge) => incoming.set(edge.targetPlayerId, (incoming.get(edge.targetPlayerId) ?? 0) + 1))
  const total = graph.edges.length
  const largest = total ? Math.max(...incoming.values()) / total : null
  const trustHistory = new Map<string, typeof graph.history[number][]>()
  graph.history.forEach((entry) => { const key = `${entry.sourcePlayerId}:${entry.targetPlayerId}`; trustHistory.set(key, [...(trustHistory.get(key) ?? []), entry]) })
  const trustChanges = [...trustHistory.values()].reduce((sum, entries) => sum + entries.slice(1).filter((entry, index) => entry.level !== entries[index].level).length, 0)
  return { coverage: calculateTrustCoverage(graph), concentration: calculateTrustConcentration(graph), mutualTrustCount, trustChanges, largestIncomingTrustConcentration: largest === null ? null : clamp(largest), beforeAfterConcentration: null }
}

export function analyzeParticipation(input: PostGameAnalysisInput): ParticipationAnalysis {
  const activity = input.metrics?.playerActivity ?? input.players.map((player) => ({ playerId: player.playerId, eventCount: player.activityCount ?? 0, normalizedActivity: 0 }))
  const max = Math.max(...activity.map((metric) => metric.eventCount), 0)
  const total = activity.reduce((sum, metric) => sum + metric.eventCount, 0)
  const balance = total === 0 ? null : activity.length === 1 ? 1 : clamp((1 - activity.reduce((sum, metric) => sum + (metric.eventCount / total) ** 2, 0)) / (1 - 1 / activity.length))
  const activityByPlayer = new Map(activity.map((metric) => [metric.playerId, metric.eventCount]))
  return { balance, activity: activity.map((metric) => ({ ...metric, normalizedActivity: max ? clamp(metric.eventCount / max) : 0 })), inactivePlayerDecisions: (input.decisions ?? []).filter((decision) => decision.type === 'INACTIVE_PLAYER').length, tableParticipation: input.tables.map((table) => { const counts = table.playerIds.map((playerId) => activityByPlayer.get(playerId) ?? 0); const tableTotal = counts.reduce((sum, count) => sum + count, 0); return { tableId: table.tableId, playerCount: table.playerIds.length, activityCount: tableTotal, participationBalance: tableTotal === 0 ? null : counts.length === 1 ? 1 : clamp((1 - counts.reduce((sum, count) => sum + (count / tableTotal) ** 2, 0)) / (1 - 1 / counts.length)) } }) }
}

export function analyzeTables(input: PostGameAnalysisInput): PostGameTableAnalysis[] {
  const missionMetrics = calculateMissionOutcomeMetrics(input.missionOutcomes ?? [])
  const participation = analyzeParticipation(input)
  return input.tables.map((table, index) => { const brainTable = input.metrics?.tableMetrics.find((candidate) => candidate.tableId === table.tableId); const missions = missionMetrics.byTable.find((candidate) => candidate.tableId === table.tableId); return { tableId: table.tableId, playerCount: table.playerIds.length, suspicionCoverage: brainTable?.suspicionCoverage ?? null, theoryDiversity: brainTable?.theoryDiversity ?? null, participationBalance: brainTable?.participationBalance ?? participation.tableParticipation[index]?.participationBalance ?? null, missionsActivated: missions?.activated ?? 0, missionsCompleted: missions?.completed ?? 0, brainDecisionCount: (input.decisions ?? []).filter((decision) => decision.scope.type === 'SESSION' || (decision.scope.type === 'TABLE' && decision.scope.tableId === table.tableId) || (decision.scope.type === 'PLAYER' && table.playerIds.includes(decision.scope.playerId))).length } })
}

export function analyzeInterventions(input: PostGameAnalysisInput): InterventionAnalysis {
  const missions = [...(input.missionOutcomes ?? [])].sort((a, b) => a.missionId.localeCompare(b.missionId))
  const directors = new Map((input.directorProposals ?? []).map((proposal) => [proposal.id, proposal]))
  const regia = new Map((input.regiaProposals ?? []).flatMap((proposal) => [[proposal.id, proposal], ...(proposal.sourceProposalId ? [[proposal.sourceProposalId, proposal]] : [])] as Array<[string, RegiaProposal]>))
  const items = missions.map((mission) => { const regiaProposal = mission.sourceProposalId ? regia.get(mission.sourceProposalId) : undefined; const director = regiaProposal?.sourceProposalId ? directors.get(regiaProposal.sourceProposalId) : undefined; return { ...(director ? { decisionType: director.sourceDecisionType, directorProposalId: director.id, strategy: director.strategy } : {}), ...(regiaProposal ? { regiaProposalId: regiaProposal.id, regiaStatus: regiaProposal.status } : {}), missionId: mission.missionId, missionType: mission.missionType, missionOutcome: mission.status, traceComplete: Boolean(director && regiaProposal && mission.missionId) } })
  const allRegia = input.regiaProposals ?? []
  const approvedStatuses = new Set(['APPROVED', 'EXECUTING', 'EXECUTED', 'EXECUTION_FAILED'])
  return { items, funnel: { proposals: allRegia.length, approved: allRegia.filter((proposal) => approvedStatuses.has(proposal.status)).length, executed: allRegia.filter((proposal) => proposal.status === 'EXECUTED').length, delivered: missions.filter((mission) => mission.activatedAt != null).length, acknowledged: missions.filter((mission) => mission.acknowledgedAt != null).length, completed: missions.filter((mission) => mission.status === 'COMPLETED').length } }
}

export function analyzeBrainPerformance(input: PostGameAnalysisInput): BrainPerformanceAnalysis {
  const regia = input.regiaProposals ?? []
  const outcomes = input.missionOutcomes ?? []
  const approvedStatuses = new Set(['APPROVED', 'EXECUTING', 'EXECUTED', 'EXECUTION_FAILED'])
  return { decisionsGenerated: input.decisions?.length ?? 0, directorProposalsGenerated: input.directorProposals?.length ?? 0, regiaApproved: regia.filter((proposal) => approvedStatuses.has(proposal.status)).length, regiaRejected: regia.filter((proposal) => proposal.status === 'REJECTED').length, missionsExecuted: outcomes.filter((mission) => mission.activatedAt != null).length, deterministicFallbackCount: null, aiUsedCount: null, invalidProposalCount: null }
}

export function analyzeDataQuality(input: PostGameAnalysisInput): PostGameDataQuality {
  const outcomes = input.missionOutcomes ?? []
  const terminal = outcomes.filter((mission) => mission.status !== 'ACTIVE').length
  const missionCoverage = outcomes.length ? ratio(terminal, outcomes.length) : null
  const missingSignals: string[] = []
  if (!input.eventStore || !getEvents(input.eventStore).some((event) => event.type === 'PHASE_ENTERED')) missingSignals.push('INCOMPLETE_EVENT_HISTORY')
  if (!input.trustGraph) missingSignals.push('TRUST_DATA_UNAVAILABLE')
  if (!input.suspicionGraph) missingSignals.push('SUSPICION_DATA_UNAVAILABLE')
  if (!input.finalVoting) missingSignals.push('MISSING_FINAL_VOTE')
  if (missionCoverage !== null && missionCoverage < 1) missingSignals.push('LOW_MISSION_OUTCOME_COVERAGE')
  return { completeEventTimeline: Boolean(input.eventStore && input.eventStore.events.length > 0 && input.eventStore.events.some((event) => event.type === 'PHASE_ENTERED')), trustDataAvailable: Boolean(input.trustGraph), suspicionDataAvailable: Boolean(input.suspicionGraph), votingDataAvailable: Boolean(input.finalVoting), missionOutcomeCoverage: missionCoverage, missingSignals }
}

export function analyzePostGame(input: PostGameAnalysisInput): PostGameAnalysis {
  const missionPerformance = calculateMissionOutcomeMetrics(input.missionOutcomes ?? [])
  const finalOutcome = analyzeFinalOutcome(input.finalVoting)
  const dataQuality = analyzeDataQuality(input)
  const theoryDynamics = analyzeTheoryDynamics(input)
  const trustDynamics = analyzeTrustDynamics(input)
  const warnings: PostGameAnalysisWarning[] = []
  if ((dataQuality.suspicionDataAvailable ? (input.metrics?.suspicionCoverage ?? 0) : 0) < 0.34) warnings.push('LOW_SUSPICION_COVERAGE')
  if ((dataQuality.trustDataAvailable ? (input.metrics?.trustCoverage ?? trustDynamics.coverage ?? 0) : 0) < 0.34) warnings.push('LOW_TRUST_COVERAGE')
  dataQuality.missingSignals.forEach((signal) => { if (signal === 'INCOMPLETE_EVENT_HISTORY') warnings.push('INCOMPLETE_EVENT_HISTORY'); if (signal === 'MISSING_FINAL_VOTE') warnings.push('MISSING_FINAL_VOTE'); if (signal === 'LOW_MISSION_OUTCOME_COVERAGE') warnings.push('LOW_MISSION_OUTCOME_COVERAGE') })
  const interventions = analyzeInterventions(input)
  if (interventions.items.some((item) => !item.traceComplete)) warnings.push('INCOMPLETE_INTERVENTION_TRACE')
  return { sessionId: input.sessionId, summary: analyzeGameSummary(input), finalOutcome, socialDynamics: { trust: trustDynamics, suspicionCoverage: input.metrics?.suspicionCoverage ?? null }, theoryDynamics, participation: analyzeParticipation(input), interventions, missionPerformance, brainPerformance: analyzeBrainPerformance(input), warnings: [...new Set(warnings)], dataQuality }
}

export type PostGameAnalysis = {
  sessionId: string
  summary: PostGameSummary
  finalOutcome: FinalGameOutcome | null
  socialDynamics: SocialDynamicsAnalysis
  theoryDynamics: TheoryDynamicsAnalysis
  participation: ParticipationAnalysis
  interventions: InterventionAnalysis
  missionPerformance: MissionOutcomeMetrics
  brainPerformance: BrainPerformanceAnalysis
  warnings: PostGameAnalysisWarning[]
  dataQuality: PostGameDataQuality
}
