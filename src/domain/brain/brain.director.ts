import { buildMissionProposal, getValidMissionTargets } from './brain.missions'
import type { MatchedTable } from './brain.matching'
import type { SuspicionGraph } from './brain.suspicion'
import type { TrustGraph } from './brain.trust'
import type {
  BrainDecision,
  BrainDecisionEvidence,
  BrainDecisionSeverity,
  BrainDecisionType,
  GamePhase,
  MissionContext,
  MissionInstance,
  MissionType,
  PlayerGameProfile,
} from './brain.types'

export type DirectorStrategy =
  | 'OBSERVE'
  | 'INCREASE_PARTICIPATION'
  | 'DIVERSIFY_THEORIES'
  | 'REDUCE_DIRECT_PRESSURE'
  | 'CREATE_TRUST_OPPORTUNITY'
  | 'CHECK_PLAYER'
  | 'CHECK_TABLE'

export type DirectorPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export type LiveDirectorContext = {
  phase: GamePhase
  decisions: BrainDecision[]
  players: PlayerGameProfile[]
  tables: MatchedTable[]
  trustGraph?: TrustGraph
  suspicionGraph?: SuspicionGraph
  missionContext: MissionContext
}

export type DirectorProposalScope =
  | { type: 'SESSION' }
  | { type: 'TABLE'; tableId: string }
  | { type: 'PLAYER'; playerId: string }

export type DirectorProposal = {
  id: string
  mode: 'SUGGEST'
  sourceDecisionType: BrainDecisionType
  strategy: DirectorStrategy
  scope: DirectorProposalScope
  priority: DirectorPriority
  evidence: { decisionEvidence: BrainDecisionEvidence }
  missionProposal?: MissionInstance
  status: 'PROPOSED'
}

export type DirectorViolation =
  | 'UNKNOWN_STRATEGY'
  | 'INVALID_SCOPE'
  | 'MODE_NOT_SUGGEST'
  | 'MISSION_PROPOSAL_INVALID'
  | 'PLAYER_OUT_OF_SCOPE'
  | 'PROPOSAL_MALFORMED'

export type DirectorValidationResult = { valid: boolean; violations: DirectorViolation[] }

export const DIRECTOR_STRATEGY_WHITELIST: readonly DirectorStrategy[] = [
  'OBSERVE',
  'INCREASE_PARTICIPATION',
  'DIVERSIFY_THEORIES',
  'REDUCE_DIRECT_PRESSURE',
  'CREATE_TRUST_OPPORTUNITY',
  'CHECK_PLAYER',
  'CHECK_TABLE',
]

export const DIRECTOR_MAX_PROPOSALS = 3

/** Explicit policy: the Decision Engine diagnoses; this module selects safe strategies. */
export const DECISION_STRATEGY_MAP: Readonly<Record<BrainDecisionType, readonly DirectorStrategy[]>> = {
  NO_ACTION: [],
  HIGH_LIAR_EXPOSURE: ['REDUCE_DIRECT_PRESSURE', 'DIVERSIFY_THEORIES'],
  LOW_LIAR_EXPOSURE: ['OBSERVE'],
  THEORY_COLLAPSE: ['DIVERSIFY_THEORIES'],
  LOW_ENGAGEMENT: ['INCREASE_PARTICIPATION'],
  INACTIVE_PLAYER: ['CHECK_PLAYER'],
  TABLE_IMBALANCE: ['CHECK_TABLE'],
  TRUST_OPPORTUNITY: ['CREATE_TRUST_OPPORTUNITY'],
}

export const DIRECTOR_PRIORITY_BY_SEVERITY: Readonly<Record<BrainDecisionSeverity, DirectorPriority>> = {
  INFO: 'LOW',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
}

const missionCandidates: Readonly<Record<DirectorStrategy, readonly MissionType[]>> = {
  OBSERVE: ['OBSERVE_PLAYER'],
  INCREASE_PARTICIPATION: ['OBSERVE_PLAYER', 'QUESTION_PLAYER', 'GAIN_TRUST'],
  DIVERSIFY_THEORIES: ['VERIFY_STATEMENT', 'OBSERVE_PLAYER', 'CHANGE_THEORY'],
  REDUCE_DIRECT_PRESSURE: [],
  CREATE_TRUST_OPPORTUNITY: ['GAIN_TRUST', 'SHARE_INFORMATION'],
  CHECK_PLAYER: ['OBSERVE_PLAYER'],
  CHECK_TABLE: [],
}

function scopeKey(scope: DirectorProposalScope): string {
  return scope.type === 'SESSION' ? 'session' : `${scope.type.toLowerCase()}:${scope.type === 'TABLE' ? scope.tableId : scope.playerId}`
}

function decisionScope(decision: BrainDecision): DirectorProposalScope {
  if (decision.scope.type === 'TABLE') return { type: 'TABLE', tableId: decision.scope.tableId }
  if (decision.scope.type === 'PLAYER') return { type: 'PLAYER', playerId: decision.scope.playerId }
  return { type: 'SESSION' }
}

function playersInScope(scope: DirectorProposalScope, players: PlayerGameProfile[], tables: MatchedTable[]): PlayerGameProfile[] {
  if (scope.type === 'PLAYER') return players.filter((player) => player.playerId === scope.playerId)
  if (scope.type === 'TABLE') {
    const table = tables.find((candidate) => candidate.tableId === scope.tableId)
    return table ? players.filter((player) => table.playerIds.includes(player.playerId)) : []
  }
  return [...players]
}

function targetForMission(type: MissionType, player: PlayerGameProfile, context: LiveDirectorContext): string | undefined {
  return getValidMissionTargets(player, type, context.missionContext)[0]?.playerId
}

function buildStrategyMission(strategy: DirectorStrategy, scope: DirectorProposalScope, context: LiveDirectorContext): MissionInstance | undefined {
  for (const player of playersInScope(scope, context.players, context.tables).sort((a, b) => a.playerId.localeCompare(b.playerId))) {
    for (const type of missionCandidates[strategy]) {
      const targetPlayerId = targetForMission(type, player, context)
      if (targetPlayerId === undefined && type !== 'WITHHOLD_INFORMATION') continue
      const result = buildMissionProposal({
        type,
        player,
        ...(targetPlayerId ? { targetPlayerId } : {}),
        context: context.missionContext,
      })
      if (result.valid) return result.proposal
    }
  }
  return undefined
}

export function mapDecisionToStrategies(decision: BrainDecision): DirectorStrategy[] {
  return [...(DECISION_STRATEGY_MAP[decision.type] ?? [])]
}

export function selectMissionCandidates(strategy: DirectorStrategy, context: LiveDirectorContext, scope: DirectorProposalScope = { type: 'SESSION' }): PlayerGameProfile[] {
  return playersInScope(scope, context.players, context.tables)
    .filter((player) => missionCandidates[strategy].some((type) => buildMissionProposal({ type, player, targetPlayerId: targetForMission(type, player, context), context: context.missionContext }).valid))
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
}

export function buildDirectorMissionProposal(strategy: DirectorStrategy, scope: DirectorProposalScope, context: LiveDirectorContext): MissionInstance | undefined {
  return buildStrategyMission(strategy, scope, context)
}

function proposalId(decision: BrainDecision, strategy: DirectorStrategy, scope: DirectorProposalScope, mission?: MissionInstance): string {
  return [decision.type, strategy, scopeKey(scope), mission?.type ?? 'none', mission?.playerId ?? 'none', mission?.targetPlayerId ?? 'none'].join(':')
}

export function buildDirectorProposal(decision: BrainDecision, strategy: DirectorStrategy, context: LiveDirectorContext): DirectorProposal {
  const scope = decisionScope(decision)
  const missionProposal = buildDirectorMissionProposal(strategy, scope, context)
  return {
    id: proposalId(decision, strategy, scope, missionProposal),
    mode: 'SUGGEST',
    sourceDecisionType: decision.type,
    strategy,
    scope,
    priority: DIRECTOR_PRIORITY_BY_SEVERITY[decision.severity],
    evidence: { decisionEvidence: { ...decision.evidence, metrics: { ...decision.evidence.metrics } } },
    ...(missionProposal ? { missionProposal } : {}),
    status: 'PROPOSED',
  }
}

function proposalKey(proposal: DirectorProposal): string {
  return [proposal.strategy, scopeKey(proposal.scope), proposal.missionProposal?.type ?? 'none', proposal.missionProposal?.playerId ?? 'none', proposal.missionProposal?.targetPlayerId ?? 'none'].join(':')
}

function priorityRank(priority: DirectorPriority): number { return priority === 'HIGH' ? 3 : priority === 'MEDIUM' ? 2 : 1 }

function resolveConflicts(proposals: DirectorProposal[]): DirectorProposal[] {
  const byPlayer = new Map<string, DirectorProposal>()
  const kept: DirectorProposal[] = []
  for (const proposal of proposals) {
    const playerId = proposal.missionProposal?.playerId
    if (!playerId) {
      kept.push(proposal)
      continue
    }
    const existingIndex = kept.findIndex((candidate) => candidate.missionProposal?.playerId === playerId && candidate.strategy === proposal.strategy)
    if (existingIndex < 0) {
      kept.push(proposal)
      byPlayer.set(`${proposal.strategy}:${playerId}`, proposal)
      continue
    }
    const existing = kept[existingIndex]
    if (priorityRank(proposal.priority) > priorityRank(existing.priority) || (proposal.priority === existing.priority && proposal.id < existing.id)) kept[existingIndex] = proposal
  }
  return kept
}

export function validateDirectorProposal(proposal: DirectorProposal, context: LiveDirectorContext): DirectorValidationResult {
  const violations: DirectorViolation[] = []
  if (!DIRECTOR_STRATEGY_WHITELIST.includes(proposal.strategy)) violations.push('UNKNOWN_STRATEGY')
  if (proposal.mode !== 'SUGGEST') violations.push('MODE_NOT_SUGGEST')
  if (!proposal.id || proposal.status !== 'PROPOSED' || !proposal.sourceDecisionType || !proposal.evidence?.decisionEvidence) violations.push('PROPOSAL_MALFORMED')
  const scope = proposal.scope
  if (!scope || (scope.type === 'TABLE' && !context.tables.some((table) => table.tableId === scope.tableId)) || (scope.type === 'PLAYER' && !context.players.some((player) => player.playerId === scope.playerId)) || !['SESSION', 'TABLE', 'PLAYER'].includes(scope.type)) violations.push('INVALID_SCOPE')
  if (proposal.missionProposal) {
    const mission = proposal.missionProposal
    const player = context.players.find((candidate) => candidate.playerId === mission.playerId)
    const scopePlayers = playersInScope(scope, context.players, context.tables)
    if (!player || !scopePlayers.some((candidate) => candidate.playerId === mission.playerId)) violations.push('PLAYER_OUT_OF_SCOPE')
    else if (!buildMissionProposal({ type: mission.type, player, targetPlayerId: mission.targetPlayerId, context: context.missionContext }).valid) violations.push('MISSION_PROPOSAL_INVALID')
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] }
}

export function evaluateLiveDirector(context: LiveDirectorContext, maxProposalsPerEvaluation = DIRECTOR_MAX_PROPOSALS): DirectorProposal[] {
  const limit = Number.isInteger(maxProposalsPerEvaluation) && maxProposalsPerEvaluation >= 0 ? maxProposalsPerEvaluation : DIRECTOR_MAX_PROPOSALS
  const proposals: DirectorProposal[] = []
  for (const decision of [...context.decisions].sort((a, b) => a.type.localeCompare(b.type) || b.severity.localeCompare(a.severity))) {
    for (const strategy of mapDecisionToStrategies(decision)) {
      const proposal = buildDirectorProposal(decision, strategy, context)
      if (validateDirectorProposal(proposal, context).valid && !proposals.some((candidate) => proposalKey(candidate) === proposalKey(proposal))) proposals.push(proposal)
    }
  }
  return resolveConflicts(proposals).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.id.localeCompare(b.id)).slice(0, limit)
}
