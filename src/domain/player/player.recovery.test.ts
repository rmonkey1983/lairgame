import { describe, expect, it } from 'vitest'
import { PLAYER_RECOVERY_INVARIANTS, PLAYER_RECOVERY_STATES } from './player.recovery'

describe('player recovery contract', () => {
  it('defines bounded recovery states', () => {
    expect(PLAYER_RECOVERY_STATES).toEqual(['normal', 'reconnect', 'rebind_required', 'rebind_pending', 'recovered'])
  })

  it('preserves identity, placement and role by contract', () => {
    expect(PLAYER_RECOVERY_INVARIANTS).toEqual(expect.arrayContaining([
      'recovery_preserves_logical_player_identity',
      'recovery_does_not_change_table_or_seat_automatically',
      'recovery_does_not_change_role',
      'recovery_does_not_duplicate_player',
    ]))
  })
})
