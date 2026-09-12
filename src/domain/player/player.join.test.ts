import { afterEach, describe, expect, it, vi } from 'vitest'
import { joinGame } from './player.join'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), ensure: vi.fn(),
}))
vi.mock('../../lib/supabase/player-client', () => ({ playerSupabaseClient: { rpc: mocks.rpc } }))
vi.mock('./player.auth', () => ({ ensureAnonymousPlayerSession: mocks.ensure }))

const input = { gameCode: 'TEST01', nickname: 'Player', tableNumber: 1, seatNumber: 1 }
const joined = { player_id: 'player-1', game_id: 'game-1', game_code: 'TEST01', nickname: 'Player', table_number: 1, seat_number: 1, join_status: 'joined' }

describe('join auth recovery boundary', () => {
  afterEach(() => vi.clearAllMocks())

  it('retries once only for a stable stale-auth error', async () => {
    mocks.ensure.mockResolvedValue({ ok: true, value: { id: 'player-1' } })
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'AUTH_SESSION_STALE' } })
      .mockResolvedValueOnce({ data: [joined], error: null })
    expect(await joinGame(input)).toMatchObject({ ok: true, value: joined })
    expect(mocks.ensure).toHaveBeenNthCalledWith(1)
    expect(mocks.ensure).toHaveBeenNthCalledWith(2, { forceFresh: true })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('does not retry normal domain errors', async () => {
    mocks.ensure.mockResolvedValue({ ok: true, value: { id: 'player-1' } })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'SEAT_TAKEN' } })
    const result = await joinGame(input)
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(mocks.ensure).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })
})
