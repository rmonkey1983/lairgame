import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureAnonymousPlayerSession } from './player.auth'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getUser: vi.fn(), signInAnonymously: vi.fn(), signOut: vi.fn(),
  staffTouched: vi.fn(),
}))
vi.mock('../../lib/supabase/player-client', () => ({ playerSupabaseClient: { auth: { getSession: mocks.getSession, getUser: mocks.getUser, signInAnonymously: mocks.signInAnonymously, signOut: mocks.signOut } } }))
vi.mock('../../lib/supabase/staff-client', () => ({ staffSupabaseClient: { auth: { signOut: mocks.staffTouched } } }))

const user = { id: 'player-1', is_anonymous: true }

describe('Player anonymous auth recovery', () => {
  afterEach(() => vi.clearAllMocks())

  it('reuses a session only after server-side getUser validation', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user } }, error: null })
    mocks.getUser.mockResolvedValue({ data: { user }, error: null })
    expect(await ensureAnonymousPlayerSession()).toMatchObject({ ok: true, value: user })
    expect(mocks.getUser).toHaveBeenCalledOnce()
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
  })

  it('creates a session when none is persisted', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mocks.signInAnonymously.mockResolvedValue({ data: { user }, error: null })
    expect(await ensureAnonymousPlayerSession()).toMatchObject({ ok: true, value: user })
    expect(mocks.signInAnonymously).toHaveBeenCalledOnce()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('clears and replaces an orphaned session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user } }, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'User not found' } })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.signInAnonymously.mockResolvedValue({ data: { user: { ...user, id: 'player-2' } }, error: null })
    expect(await ensureAnonymousPlayerSession()).toMatchObject({ ok: true, value: { id: 'player-2' } })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.staffTouched).not.toHaveBeenCalled()
  })

  it('clears and replaces an invalid refresh session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid Refresh Token' } })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.signInAnonymously.mockResolvedValue({ data: { user }, error: null })
    await expect(ensureAnonymousPlayerSession()).resolves.toMatchObject({ ok: true })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
