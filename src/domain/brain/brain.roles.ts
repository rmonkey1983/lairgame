import type { ExposureLevel, ParticipationLevel, PlayerGameProfile } from './brain.types'
import type { MatchedTable } from './brain.matching'

export type AssignmentRole = 'LIAR' | 'ACCOMPLICE' | 'SCAPEGOAT' | 'INVESTIGATOR'

export type RoleAssignmentInput = {
  players: PlayerGameProfile[]
  tables: MatchedTable[]
  config: {
    liarCount: number
    accompliceCount: number
    scapegoatCount: number
  }
}

export type RoleAssignment = {
  playerId: string
  role: AssignmentRole
  compatibilityScore: number
}

export type RoleAssignmentWarningType =
  | 'SPECIAL_ROLES_SAME_TABLE'
  | 'LIAR_ACCOMPLICE_SAME_GROUP'
  | 'SCAPEGOAT_SAFETY_LIMIT'
  | 'TABLE_DATA_INVALID'
  | 'ROLE_CONFIG_INVALID'
  | 'PLAYER_DATA_INVALID'

export type RoleAssignmentWarning = {
  type: RoleAssignmentWarningType
  message: string
  playerIds?: string[]
  tableId?: string
}

export type RoleAssignmentReason = {
  playerId: string
  role: AssignmentRole
  code: string
  message: string
}

export type RoleAssignmentResult = {
  status: 'VALID' | 'WARNING' | 'INVALID'
  assignments: RoleAssignment[]
  score: number
  warnings: RoleAssignmentWarning[]
  reasoning: RoleAssignmentReason[]
  error?: string
}

export type RoleCompatibility = {
  score: number
  reasons: RoleAssignmentReason[]
}

export const ROLE_ASSIGNMENT_WEIGHTS = {
  gameplayCompatibility: 0.5,
  exposureCompatibility: 0.2,
  participationCompatibility: 0.2,
  strategyCompatibility: 0.1,
  tableDistributionPenalty: 0.15,
  groupIndependencePenalty: 0.2,
} as const

const SPECIAL_ROLES: AssignmentRole[] = ['LIAR', 'ACCOMPLICE', 'SCAPEGOAT']
const exposureRank: Record<ExposureLevel, number> = { low: 0, medium: 1, high: 2 }
const participationRank: Record<ParticipationLevel, number> = { low: 0, medium: 1, high: 2 }

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function roundScore(value: number): number {
  return Number(clamp(value).toFixed(6))
}

function counts(config: RoleAssignmentInput['config']): Record<AssignmentRole, number> {
  return {
    LIAR: config.liarCount,
    ACCOMPLICE: config.accompliceCount,
    SCAPEGOAT: config.scapegoatCount,
    INVESTIGATOR: 0,
  }
}

function invalidInput(input: RoleAssignmentInput): string[] {
  const violations: string[] = []
  const playerIds = input.players.map((player) => player.playerId)
  const tablePlayerIds = input.tables.flatMap((table) => table.playerIds)
  const roleCounts = counts(input.config)

  if (new Set(playerIds).size !== playerIds.length || input.players.some((player) => !player.playerId.trim())) violations.push('PLAYER_DATA_INVALID')
  if (new Set(tablePlayerIds).size !== tablePlayerIds.length || new Set(tablePlayerIds).size !== new Set(playerIds).size || tablePlayerIds.some((id) => !new Set(playerIds).has(id))) violations.push('TABLE_DATA_INVALID')
  if (input.tables.length === 0 || new Set(input.tables.map((table) => table.tableId)).size !== input.tables.length) violations.push('TABLE_DATA_INVALID')
  if (SPECIAL_ROLES.some((role) => !Number.isInteger(roleCounts[role]) || roleCounts[role] < 0)) violations.push('ROLE_CONFIG_INVALID')
  if (SPECIAL_ROLES.reduce((sum, role) => sum + roleCounts[role], 0) > input.players.length) violations.push('ROLE_CONFIG_INVALID')
  return [...new Set(violations)]
}

export function validateRoleAssignmentInput(input: RoleAssignmentInput): { valid: boolean; violations: string[] } {
  const violations = invalidInput(input)
  return { valid: violations.length === 0, violations }
}

function roleLabel(role: AssignmentRole): string {
  return role.toLowerCase()
}

function scoreLiar(profile: PlayerGameProfile): RoleCompatibility {
  const participation = participationRank[profile.participationLevel] / 2
  const exposure = exposureRank[profile.exposureLevel] / 2
  const social = profile.socialStyle === 'balanced' ? 1 : profile.socialStyle === 'observer' ? 0.8 : 0.9
  const score = roundScore(
    social * ROLE_ASSIGNMENT_WEIGHTS.gameplayCompatibility
    + exposure * ROLE_ASSIGNMENT_WEIGHTS.exposureCompatibility
    + participation * ROLE_ASSIGNMENT_WEIGHTS.participationCompatibility
    + (profile.strategyPreference === 'mixed' ? 1 : 0.8) * ROLE_ASSIGNMENT_WEIGHTS.strategyCompatibility,
  )
  const reasons: RoleAssignmentReason[] = [
    { playerId: profile.playerId, role: 'LIAR', code: `PARTICIPATION_${profile.participationLevel.toUpperCase()}`, message: `participation ${profile.participationLevel}` },
    { playerId: profile.playerId, role: 'LIAR', code: `EXPOSURE_${profile.exposureLevel.toUpperCase()}`, message: `exposure ${profile.exposureLevel}` },
  ]
  if (profile.socialStyle === 'observer' && exposureRank[profile.exposureLevel] >= 1 && participationRank[profile.participationLevel] >= 1) {
    reasons.push({ playerId: profile.playerId, role: 'LIAR', code: 'OBSERVER_CAPABLE', message: 'observer con exposure e participation sufficienti' })
  } else {
    reasons.push({ playerId: profile.playerId, role: 'LIAR', code: 'SOCIAL_COMPATIBILITY', message: `social ${profile.socialStyle}` })
  }
  return { score, reasons }
}

function scoreAccomplice(profile: PlayerGameProfile): RoleCompatibility {
  const social = profile.socialStyle === 'expressive' ? 1 : profile.socialStyle === 'balanced' ? 0.9 : 0.7
  const strategy = profile.strategyPreference === 'social' ? 1 : profile.strategyPreference === 'mixed' ? 0.85 : 0.7
  const participation = profile.participationLevel === 'low' ? 0.45 : profile.participationLevel === 'medium' ? 0.8 : 1
  const score = roundScore(
    social * ROLE_ASSIGNMENT_WEIGHTS.gameplayCompatibility
    + 0.8 * ROLE_ASSIGNMENT_WEIGHTS.exposureCompatibility
    + participation * ROLE_ASSIGNMENT_WEIGHTS.participationCompatibility
    + strategy * ROLE_ASSIGNMENT_WEIGHTS.strategyCompatibility,
  )
  return {
    score,
    reasons: [
      { playerId: profile.playerId, role: 'ACCOMPLICE', code: 'INDIRECT_SOCIAL_SUPPORT', message: `social ${profile.socialStyle}` },
      { playerId: profile.playerId, role: 'ACCOMPLICE', code: 'MISSION_COMPATIBILITY', message: `strategy ${profile.strategyPreference}` },
    ],
  }
}

function scoreScapegoat(profile: PlayerGameProfile): RoleCompatibility {
  const safe = exposureRank[profile.exposureLevel] >= 1 && participationRank[profile.participationLevel] >= 1
  if (!safe) {
    return {
      score: 0,
      reasons: [{ playerId: profile.playerId, role: 'SCAPEGOAT', code: 'SAFETY_REQUIREMENTS_NOT_MET', message: 'exposure e participation devono essere almeno medium' }],
    }
  }
  const exposure = exposureRank[profile.exposureLevel] === 2 ? 1 : 0.8
  const participation = participationRank[profile.participationLevel] === 2 ? 1 : 0.8
  return {
    score: roundScore(exposure * ROLE_ASSIGNMENT_WEIGHTS.exposureCompatibility + participation * ROLE_ASSIGNMENT_WEIGHTS.participationCompatibility + 0.8 * ROLE_ASSIGNMENT_WEIGHTS.gameplayCompatibility),
    reasons: [
      { playerId: profile.playerId, role: 'SCAPEGOAT', code: `EXPOSURE_${profile.exposureLevel.toUpperCase()}`, message: `exposure ${profile.exposureLevel}` },
      { playerId: profile.playerId, role: 'SCAPEGOAT', code: `PARTICIPATION_${profile.participationLevel.toUpperCase()}`, message: `participation ${profile.participationLevel}` },
      { playerId: profile.playerId, role: 'SCAPEGOAT', code: 'SOCIAL_SAFETY', message: 'nessuna esposizione incompatibile richiesta' },
    ],
  }
}

export function scorePlayerForRole(profile: PlayerGameProfile, role: AssignmentRole): RoleCompatibility {
  if (role === 'LIAR') return scoreLiar(profile)
  if (role === 'ACCOMPLICE') return scoreAccomplice(profile)
  if (role === 'SCAPEGOAT') return scoreScapegoat(profile)
  return { score: 1, reasons: [{ playerId: profile.playerId, role, code: 'DEFAULT_ROLE', message: 'ruolo investigator di default' }] }
}

function tableForPlayer(playerId: string, tables: MatchedTable[]): MatchedTable | undefined {
  return tables.find((table) => table.playerIds.includes(playerId))
}

function sameExistingGroup(first: string, second: string, profiles: Map<string, PlayerGameProfile>): boolean {
  const firstProfile = profiles.get(first)
  const secondProfile = profiles.get(second)
  return firstProfile?.arrivedWithPlayerIds.includes(second) === true || secondProfile?.arrivedWithPlayerIds.includes(first) === true
}

function combinationScore(assignments: RoleAssignment[], input: RoleAssignmentInput): { score: number; warnings: RoleAssignmentWarning[] } {
  const warnings: RoleAssignmentWarning[] = []
  const profiles = new Map(input.players.map((player) => [player.playerId, player]))
  const special = assignments.filter((assignment) => SPECIAL_ROLES.includes(assignment.role))
  const liar = assignments.find((assignment) => assignment.role === 'LIAR')
  const accomplice = assignments.find((assignment) => assignment.role === 'ACCOMPLICE')
  const specialTables = new Map<string, string[]>()
  for (const assignment of special) {
    const table = tableForPlayer(assignment.playerId, input.tables)
    if (table) specialTables.set(table.tableId, [...(specialTables.get(table.tableId) ?? []), assignment.playerId])
  }
  if (specialTables.size < special.length) warnings.push({ type: 'SPECIAL_ROLES_SAME_TABLE', message: 'Più ruoli speciali condividono un tavolo.', playerIds: special.map((assignment) => assignment.playerId) })
  if (liar && accomplice && sameExistingGroup(liar.playerId, accomplice.playerId, profiles)) warnings.push({ type: 'LIAR_ACCOMPLICE_SAME_GROUP', message: 'Bugiardo e complice appartengono allo stesso gruppo già esistente.', playerIds: [liar.playerId, accomplice.playerId] })
  const tablePenalty = Math.max(0, special.length - specialTables.size) / Math.max(1, special.length)
  const groupPenalty = liar && accomplice && sameExistingGroup(liar.playerId, accomplice.playerId, profiles) ? 1 : 0
  const compatibility = assignments.filter((assignment) => assignment.role !== 'INVESTIGATOR').reduce((sum, assignment) => sum + assignment.compatibilityScore, 0) / Math.max(1, special.length)
  return { score: roundScore(compatibility - tablePenalty * ROLE_ASSIGNMENT_WEIGHTS.tableDistributionPenalty - groupPenalty * ROLE_ASSIGNMENT_WEIGHTS.groupIndependencePenalty), warnings }
}

function roleSlots(config: RoleAssignmentInput['config']): AssignmentRole[] {
  return [
    ...Array.from({ length: config.liarCount }, () => 'LIAR' as const),
    ...Array.from({ length: config.accompliceCount }, () => 'ACCOMPLICE' as const),
    ...Array.from({ length: config.scapegoatCount }, () => 'SCAPEGOAT' as const),
  ]
}

function betterCandidate(current: RoleAssignment[] | undefined, candidate: RoleAssignment[], input: RoleAssignmentInput): RoleAssignment[] {
  if (!current) return candidate
  const currentScore = combinationScore(current, input).score
  const candidateScore = combinationScore(candidate, input).score
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current
  const currentKey = current.map((assignment) => `${assignment.role}:${assignment.playerId}`).join('|')
  const candidateKey = candidate.map((assignment) => `${assignment.role}:${assignment.playerId}`).join('|')
  return candidateKey < currentKey ? candidate : current
}

function findBestSpecialAssignment(input: RoleAssignmentInput): RoleAssignment[] | undefined {
  const profiles = [...input.players].sort((a, b) => a.playerId.localeCompare(b.playerId))
  const slots = roleSlots(input.config)
  let best: RoleAssignment[] | undefined
  function visit(slotIndex: number, used: Set<string>, assignments: RoleAssignment[]): void {
    if (slotIndex === slots.length) {
      best = betterCandidate(best, assignments, input)
      return
    }
    const role = slots[slotIndex]
    for (const profile of profiles) {
      if (used.has(profile.playerId)) continue
      const compatibility = scorePlayerForRole(profile, role)
      if (role === 'SCAPEGOAT' && compatibility.score === 0) continue
      used.add(profile.playerId)
      visit(slotIndex + 1, used, [...assignments, { playerId: profile.playerId, role, compatibilityScore: compatibility.score }])
      used.delete(profile.playerId)
    }
  }
  visit(0, new Set(), [])
  return best
}

export function scoreRoleCombination(assignments: RoleAssignment[], input: RoleAssignmentInput): number {
  return combinationScore(assignments, input).score
}

export function validateRoleAssignment(assignments: RoleAssignment[], input: RoleAssignmentInput): { valid: boolean; violations: string[] } {
  const violations: string[] = []
  const expected = counts(input.config)
  const actual = assignments.reduce<Record<AssignmentRole, number>>((result, assignment) => ({ ...result, [assignment.role]: (result[assignment.role] ?? 0) + 1 }), { LIAR: 0, ACCOMPLICE: 0, SCAPEGOAT: 0, INVESTIGATOR: 0 })
  for (const role of Object.keys(expected) as AssignmentRole[]) if (actual[role] !== (role === 'INVESTIGATOR' ? input.players.length - SPECIAL_ROLES.reduce((sum, specialRole) => sum + expected[specialRole], 0) : expected[role])) violations.push(`${role}_COUNT_INVALID`)
  if (new Set(assignments.map((assignment) => assignment.playerId)).size !== assignments.length) violations.push('PLAYER_IDS_DUPLICATED')
  if (new Set(assignments.map((assignment) => assignment.playerId)).size !== input.players.length) violations.push('PLAYER_LOST')
  return { valid: violations.length === 0, violations }
}

export function assignRoles(input: RoleAssignmentInput): RoleAssignmentResult {
  const validation = validateRoleAssignmentInput(input)
  if (!validation.valid) {
    return { status: 'INVALID', assignments: [], score: 0, warnings: validation.violations.map((violation) => ({ type: violation.includes('ROLE') ? 'ROLE_CONFIG_INVALID' : violation.includes('PLAYER') ? 'PLAYER_DATA_INVALID' : 'TABLE_DATA_INVALID', message: violation })), reasoning: [], error: validation.violations.join(', ') }
  }
  const special = findBestSpecialAssignment(input)
  if (!special) {
    const warning: RoleAssignmentWarning = { type: 'SCAPEGOAT_SAFETY_LIMIT', message: 'Nessun Player soddisfa i requisiti minimi di sicurezza per il ruolo scapegoat.' }
    return { status: 'INVALID', assignments: [], score: 0, warnings: [warning], reasoning: [], error: 'SCAPEGOAT_SAFETY_LIMIT' }
  }
  const specialIds = new Set(special.map((assignment) => assignment.playerId))
  const investigators = input.players
    .filter((player) => !specialIds.has(player.playerId))
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
    .map((player) => ({ playerId: player.playerId, role: 'INVESTIGATOR' as const, compatibilityScore: 1 }))
  const assignments = [...special, ...investigators]
  const combination = combinationScore(special, input)
  const validationResult = validateRoleAssignment(assignments, input)
  if (!validationResult.valid) return { status: 'INVALID', assignments: [], score: 0, warnings: [], reasoning: [], error: validationResult.violations.join(', ') }
  const reasoning = special.flatMap((assignment) => scorePlayerForRole(input.players.find((player) => player.playerId === assignment.playerId) as PlayerGameProfile, assignment.role).reasons)
  return { status: combination.warnings.length > 0 ? 'WARNING' : 'VALID', assignments, score: combination.score, warnings: combination.warnings, reasoning }
}

export const roleAssignmentRoleLabels: Record<AssignmentRole, string> = {
  LIAR: roleLabel('LIAR'),
  ACCOMPLICE: roleLabel('ACCOMPLICE'),
  SCAPEGOAT: roleLabel('SCAPEGOAT'),
  INVESTIGATOR: roleLabel('INVESTIGATOR'),
}
