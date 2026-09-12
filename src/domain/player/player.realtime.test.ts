import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeToPlayerGameState } from './player.realtime'

const { channel, subscribe, removeChannel, setAuth, getSession, on } = vi.hoisted(() => {
  const on = vi.fn()
  const subscribe = vi.fn()
  return { channel: vi.fn(() => ({ on, subscribe })), subscribe, removeChannel: vi.fn(), setAuth: vi.fn().mockResolvedValue(undefined), getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'player-jwt' } }, error: null }), on }
})

vi.mock('../../lib/supabase/player-client', () => ({ playerSupabaseClient: { auth: { getSession }, channel, removeChannel, realtime: { setAuth } } }))

describe('player game realtime subscription', () => {
  afterEach(() => vi.clearAllMocks())

  it('authenticates before subscribing to the private game topic and cleans up', async () => {
    let wakeUp!: () => void
    on.mockImplementationOnce((_type: string, _filter: unknown, callback: () => void) => { wakeUp = callback; return { subscribe } })
    const onStateChanged = vi.fn()
    const unsubscribe = subscribeToPlayerGameState('game-1', onStateChanged)
    expect(channel).toHaveBeenCalledWith('game:game-1', { config: { private: true } })
    expect(subscribe).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce())
    expect(setAuth).toHaveBeenCalledWith('player-jwt')
    wakeUp()
    expect(onStateChanged).toHaveBeenCalledOnce()
    unsubscribe()
    wakeUp()
    expect(onStateChanged).toHaveBeenCalledOnce()
    expect(removeChannel).toHaveBeenCalledOnce()
  })
})
