import { describe, expect, it } from 'vitest'
import { PLAYER_AUTH_STORAGE_KEY } from './player-client'
import { STAFF_AUTH_STORAGE_KEY } from './staff-client'

describe('auth storage boundaries', () => {
  it('uses different Player and Staff storage keys', () => {
    expect(PLAYER_AUTH_STORAGE_KEY).not.toBe(STAFF_AUTH_STORAGE_KEY)
  })
})
