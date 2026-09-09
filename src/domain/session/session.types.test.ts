import { describe, expect, it } from 'vitest'
import type { PlayerSession, StaffSession } from './session.types'

describe('session contracts', () => {
  it('represents player and staff boundaries separately', () => {
    const player: PlayerSession = { kind: 'player', status: 'none' }
    const staff: StaffSession = { kind: 'staff', status: 'none' }
    expect(player.kind).not.toBe(staff.kind)
    expect(player.status).toBe('none')
    expect(staff.status).toBe('none')
  })

  it('represents player verification and invalidation states', () => {
    const states: PlayerSession['status'][] = ['available', 'verifying', 'invalid', 'rebind_required']
    expect(states).toHaveLength(4)
  })
})
