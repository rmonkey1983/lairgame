import { buildMissionProposal } from './brain.missions'
import type { LiveDirectorContext } from './brain.director'
import type { RegiaProposal } from './brain.regia'

export type ExecutionFailureReason =
  | 'PROPOSAL_NOT_FOUND'
  | 'PROPOSAL_NOT_APPROVED'
  | 'ALREADY_EXECUTED'
  | 'UNSUPPORTED_ACTION'
  | 'MISSION_MISSING'
  | 'MISSION_INVALID'
  | 'PLAYER_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'PHASE_CHANGED'
  | 'SESSION_MISMATCH'
  | 'UNAUTHORIZED'
  | 'PERSISTENCE_FAILURE'

export type ExecuteApprovedProposalInput = { sessionId: string; proposalId: string }
export type ProposalExecutionResult =
  | { ok: true; proposalId: string; executionId: string; action: 'ACTIVATE_MISSION' }
  | { ok: false; reason: ExecutionFailureReason }

export function validateApprovedMissionExecution(proposal: RegiaProposal, input: ExecuteApprovedProposalInput, context: LiveDirectorContext): ProposalExecutionResult {
  if (proposal.id !== input.proposalId) return { ok: false, reason: 'PROPOSAL_NOT_FOUND' }
  if (proposal.status === 'EXECUTED') return { ok: false, reason: 'ALREADY_EXECUTED' }
  if (proposal.status !== 'APPROVED') return { ok: false, reason: 'PROPOSAL_NOT_APPROVED' }
  if (proposal.controlMode === 'AUTO' || proposal.controlMode === 'MANUAL' || !('missionProposal' in proposal.payload) || !proposal.payload.missionProposal) return { ok: false, reason: 'UNSUPPORTED_ACTION' }
  const mission = proposal.payload.missionProposal
  if (mission.phase !== context.phase) return { ok: false, reason: 'PHASE_CHANGED' }
  const player = context.players.find((candidate) => candidate.playerId === mission.playerId)
  if (!player) return { ok: false, reason: 'PLAYER_NOT_FOUND' }
  if (mission.targetPlayerId && !context.players.some((candidate) => candidate.playerId === mission.targetPlayerId)) return { ok: false, reason: 'TARGET_NOT_FOUND' }
  if (!buildMissionProposal({ type: mission.type, player, targetPlayerId: mission.targetPlayerId, context: context.missionContext }).valid) return { ok: false, reason: 'MISSION_INVALID' }
  return { ok: true, proposalId: proposal.id, executionId: `execution:${input.sessionId}:${proposal.id}`, action: 'ACTIVATE_MISSION' }
}
