import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeToStaffGameState } from './staff.game.realtime'

const { channel, subscribe, removeChannel, setAuth, getSession, on } = vi.hoisted(() => {
  const on = vi.fn()
  const subscribe = vi.fn()
  const channelApi = { on, subscribe }
  const channel = vi.fn(() => channelApi)
  return { channel, subscribe, removeChannel: vi.fn(), setAuth: vi.fn().mockResolvedValue(undefined), getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'staff-jwt' } }, error: null }), on }
})

vi.mock('../../lib/supabase/staff-client', () => ({
  staffSupabaseClient: { auth: { getSession }, channel, removeChannel, realtime: { setAuth } },
}))

describe('staff game realtime subscription', () => {
  afterEach(() => { vi.clearAllMocks() })

  it('uses a private selected-game channel and authenticates before subscribing', async () => {
    let received!: () => void
    on.mockImplementation((_type: string, _filter: unknown, callback: () => void) => { received = callback; return { on, subscribe } })
    const onStateChanged = vi.fn()
    const unsubscribe = subscribeToStaffGameState('game-1', onStateChanged)

    expect(channel).toHaveBeenCalledWith('game:game-1', { config: { private: true } })
    expect(subscribe).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce())
    expect(getSession).toHaveBeenCalledOnce()
    expect(setAuth).toHaveBeenCalledWith('staff-jwt')
    received()
    expect(onStateChanged).toHaveBeenCalledOnce()
    unsubscribe()
    expect(removeChannel).toHaveBeenCalledOnce()
  })

  it('forwards only safe connection statuses and ignores events after cleanup', async () => {
    let received!: () => void
    on.mockImplementation((_type: string, _filter: unknown, callback: () => void) => { received = callback; return { on, subscribe } })
    const onStatus = vi.fn()
    const onStateChanged = vi.fn()
    const unsubscribe = subscribeToStaffGameState('game-1', onStateChanged, onStatus)
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce())
    const statusCallback = subscribe.mock.calls[0][0] as (status: string) => void
    statusCallback('SUBSCRIBED')
    statusCallback('TIMED_OUT')
    statusCallback('CLOSED')
    statusCallback('CHANNEL_ERROR')
    expect(onStatus).toHaveBeenCalledTimes(3)
    unsubscribe()
    received()
    expect(onStateChanged).not.toHaveBeenCalled()
  })
})
