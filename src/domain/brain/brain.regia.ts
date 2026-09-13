import { validateDirectorProposal, type DirectorProposal, type DirectorProposalScope, type DirectorStrategy, type LiveDirectorContext } from './brain.director'
import { buildMissionProposal } from './brain.missions'
import type { GamePhase, MissionInstance } from './brain.types'

export type RegiaControlMode = 'AUTO' | 'SUGGEST' | 'MANUAL'
export type RegiaProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type RegiaActor = 'MC'

export type CriticalRegiaCommand =
  | 'START_PHASE'
  | 'ADVANCE_PHASE'
  | 'OPEN_VOTING'
  | 'CLOSE_VOTING'
  | 'LOCK_GAME'
  | 'START_REVEAL'
  | 'PAUSE_GAME'
  | 'STOP_GAME'

export type ForbiddenRegiaCommand =
  | 'CHANGE_SCENARIO_TRUTH'
  | 'REASSIGN_LIAR_AFTER_START'
  | 'REASSIGN_ACCOMPLICE_AFTER_START'
  | 'REASSIGN_SCAPEGOAT_AFTER_START'
  | 'BYPASS_MISSION_VALIDATOR'

export type RegiaCommandType = DirectorStrategy | CriticalRegiaCommand | ForbiddenRegiaCommand

type StrategyPayload = {
  commandType: DirectorStrategy
  scope: DirectorProposalScope
  missionProposal?: MissionInstance
}

type PhasePayload = { commandType: 'START_PHASE' | 'ADVANCE_PHASE'; phase: GamePhase }
type EmptyCriticalPayload = { commandType: Exclude<CriticalRegiaCommand, 'START_PHASE' | 'ADVANCE_PHASE'> }
type ForbiddenPayload = { commandType: ForbiddenRegiaCommand }

export type RegiaCommandPayload = StrategyPayload | PhasePayload | EmptyCriticalPayload | ForbiddenPayload

export type RegiaProposal = {
  id: string
  controlMode: RegiaControlMode
  status: RegiaProposalStatus
  sourceProposalId?: string
  commandType: RegiaCommandType
  payload: RegiaCommandPayload
}

export type RegiaViolation =
  | 'DIRECTOR_PROPOSAL_INVALID'
  | 'UNKNOWN_COMMAND'
  | 'CONTROL_POLICY_INVALID'
  | 'MANUAL_NOT_DIRECTOR_GENERATED'
  | 'MC_APPROVAL_REQUIRED'
  | 'MC_ACTOR_REQUIRED'
  | 'PROPOSAL_NOT_PENDING'
  | 'PROPOSAL_MALFORMED'
  | 'FORBIDDEN_COMMAND'
  | 'MISSION_VALIDATOR_REQUIRED'
  | 'MISSION_PROPOSAL_INVALID'

export type RegiaOperationResult =
  | { valid: true; proposal: RegiaProposal }
  | { valid: false; violations: RegiaViolation[] }

export const REGIA_CONTROL_POLICY: Readonly<Record<DirectorStrategy, RegiaControlMode>> = {
  OBSERVE: 'AUTO',
  CHECK_PLAYER: 'SUGGEST',
  CHECK_TABLE: 'SUGGEST',
  INCREASE_PARTICIPATION: 'SUGGEST',
  DIVERSIFY_THEORIES: 'SUGGEST',
  CREATE_TRUST_OPPORTUNITY: 'SUGGEST',
  REDUCE_DIRECT_PRESSURE: 'SUGGEST',
}

export const REGIA_MANUAL_COMMANDS: readonly CriticalRegiaCommand[] = [
  'START_PHASE', 'ADVANCE_PHASE', 'OPEN_VOTING', 'CLOSE_VOTING', 'LOCK_GAME', 'START_REVEAL', 'PAUSE_GAME', 'STOP_GAME',
]

export const REGIA_FORBIDDEN_COMMANDS: readonly ForbiddenRegiaCommand[] = [
  'CHANGE_SCENARIO_TRUTH', 'REASSIGN_LIAR_AFTER_START', 'REASSIGN_ACCOMPLICE_AFTER_START', 'REASSIGN_SCAPEGOAT_AFTER_START', 'BYPASS_MISSION_VALIDATOR',
]

function isStrategy(commandType: RegiaCommandType): commandType is DirectorStrategy {
  return Object.prototype.hasOwnProperty.call(REGIA_CONTROL_POLICY, commandType)
}

function isManualCommand(commandType: RegiaCommandType): commandType is CriticalRegiaCommand {
  return REGIA_MANUAL_COMMANDS.includes(commandType as CriticalRegiaCommand)
}

function isForbiddenCommand(commandType: RegiaCommandType): commandType is ForbiddenRegiaCommand {
  return REGIA_FORBIDDEN_COMMANDS.includes(commandType as ForbiddenRegiaCommand)
}

export function getRegiaControlMode(commandType: RegiaCommandType): RegiaControlMode | undefined {
  if (isStrategy(commandType)) return REGIA_CONTROL_POLICY[commandType]
  if (isManualCommand(commandType)) return 'MANUAL'
  return undefined
}

function proposalId(sourceProposalId: string, commandType: RegiaCommandType): string {
  return `regia:${sourceProposalId}:${commandType}`
}

function cloneMission(mission: MissionInstance): MissionInstance {
  return { ...mission }
}

function validateMissionPayload(payload: StrategyPayload, context: LiveDirectorContext | undefined): RegiaViolation[] {
  if (!payload.missionProposal) return []
  if (!context) return ['MISSION_VALIDATOR_REQUIRED']
  const mission = payload.missionProposal
  const player = context.players.find((candidate) => candidate.playerId === mission.playerId)
  if (!player || !buildMissionProposal({ type: mission.type, player, targetPlayerId: mission.targetPlayerId, context: context.missionContext }).valid) return ['MISSION_PROPOSAL_INVALID']
  return []
}

export function buildRegiaProposalFromDirector(directorProposal: DirectorProposal, context: LiveDirectorContext): RegiaOperationResult {
  const directorValidation = validateDirectorProposal(directorProposal, context)
  if (!directorValidation.valid) return { valid: false, violations: ['DIRECTOR_PROPOSAL_INVALID'] }
  const controlMode = REGIA_CONTROL_POLICY[directorProposal.strategy]
  if (!controlMode) return { valid: false, violations: ['CONTROL_POLICY_INVALID'] }
  const payload: StrategyPayload = {
    commandType: directorProposal.strategy,
    scope: { ...directorProposal.scope },
    ...(directorProposal.missionProposal ? { missionProposal: cloneMission(directorProposal.missionProposal) } : {}),
  }
  const missionViolations = validateMissionPayload(payload, context)
  if (missionViolations.length > 0) return { valid: false, violations: missionViolations }
  return {
    valid: true,
    proposal: {
      id: proposalId(directorProposal.id, directorProposal.strategy),
      controlMode,
      status: controlMode === 'AUTO' ? 'APPROVED' : 'PENDING',
      sourceProposalId: directorProposal.id,
      commandType: directorProposal.strategy,
      payload,
    },
  }
}

export function buildManualRegiaProposal(commandType: CriticalRegiaCommand, payload: Extract<RegiaCommandPayload, { commandType: CriticalRegiaCommand }>, actor: RegiaActor): RegiaOperationResult {
  if (actor !== 'MC' || !isManualCommand(commandType) || payload.commandType !== commandType) return { valid: false, violations: ['MC_ACTOR_REQUIRED'] }
  return {
    valid: true,
    proposal: { id: `regia:mc:${commandType}:${JSON.stringify(payload)}`, controlMode: 'MANUAL', status: 'APPROVED', commandType, payload },
  }
}

export function validateRegiaProposal(proposal: RegiaProposal, context?: LiveDirectorContext): RegiaOperationResult {
  const violations: RegiaViolation[] = []
  if (!proposal.id || !proposal.controlMode || !proposal.status || !proposal.commandType || !proposal.payload || proposal.payload.commandType !== proposal.commandType) violations.push('PROPOSAL_MALFORMED')
  if (isForbiddenCommand(proposal.commandType)) violations.push('FORBIDDEN_COMMAND')
  if (isManualCommand(proposal.commandType) && proposal.sourceProposalId) violations.push('MANUAL_NOT_DIRECTOR_GENERATED')
  if (isStrategy(proposal.commandType) && REGIA_CONTROL_POLICY[proposal.commandType] !== proposal.controlMode) violations.push('CONTROL_POLICY_INVALID')
  if (isManualCommand(proposal.commandType) && proposal.controlMode !== 'MANUAL') violations.push('CONTROL_POLICY_INVALID')
  if (!isStrategy(proposal.commandType) && !isManualCommand(proposal.commandType) && !isForbiddenCommand(proposal.commandType)) violations.push('UNKNOWN_COMMAND')
  if (isStrategy(proposal.commandType)) {
    const missionViolations = validateMissionPayload(proposal.payload as StrategyPayload, context)
    violations.push(...missionViolations)
  }
  return violations.length > 0 ? { valid: false, violations: [...new Set(violations)] } : { valid: true, proposal }
}

export function approveRegiaProposal(proposal: RegiaProposal, actor?: RegiaActor, context?: LiveDirectorContext): RegiaOperationResult {
  const validation = validateRegiaProposal(proposal, context)
  if (!validation.valid) return validation
  if (proposal.status !== 'PENDING') return { valid: false, violations: ['PROPOSAL_NOT_PENDING'] }
  if (proposal.controlMode === 'SUGGEST' && actor !== 'MC') return { valid: false, violations: ['MC_APPROVAL_REQUIRED'] }
  if (proposal.controlMode === 'MANUAL' && actor !== 'MC') return { valid: false, violations: ['MC_ACTOR_REQUIRED'] }
  return { valid: true, proposal: { ...proposal, status: 'APPROVED' } }
}

export function rejectRegiaProposal(proposal: RegiaProposal, actor?: RegiaActor, context?: LiveDirectorContext): RegiaOperationResult {
  const validation = validateRegiaProposal(proposal, context)
  if (!validation.valid) return validation
  if (proposal.status !== 'PENDING') return { valid: false, violations: ['PROPOSAL_NOT_PENDING'] }
  if (actor !== 'MC') return { valid: false, violations: ['MC_ACTOR_REQUIRED'] }
  return { valid: true, proposal: { ...proposal, status: 'REJECTED' } }
}
