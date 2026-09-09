export type PlayerRecoveryState = 'normal' | 'reconnect' | 'rebind_required' | 'rebind_pending' | 'recovered'

export type PlayerRecoveryContract = {
  state: PlayerRecoveryState
  playerId: string
  gameCode: string
}

export const PLAYER_RECOVERY_STATES: readonly PlayerRecoveryState[] = [
  'normal', 'reconnect', 'rebind_required', 'rebind_pending', 'recovered',
]

export const PLAYER_RECOVERY_INVARIANTS = [
  'recovery_preserves_logical_player_identity',
  'recovery_preserves_game',
  'recovery_does_not_change_table_or_seat_automatically',
  'recovery_does_not_change_role',
  'recovery_does_not_duplicate_player',
  'recovery_is_server_authorized',
  'rebind_requires_staff_approval',
  'recovery_is_auditable',
] as const
