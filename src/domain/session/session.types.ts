export type PlayerSessionStatus = 'none' | 'available' | 'verifying' | 'invalid' | 'rebind_required'
export type StaffSessionStatus = 'none' | 'available' | 'invalid'

export type PlayerSession = {
  kind: 'player'
  status: PlayerSessionStatus
  playerId?: string
  gameCode?: string
}

export type StaffSession = {
  kind: 'staff'
  status: StaffSessionStatus
  staffMemberId?: string
}

export type SessionState =
  | { kind: 'player'; session: PlayerSession }
  | { kind: 'staff'; session: StaffSession }
