import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentStaffAccess, signInStaff, signOutStaff } from './staff.auth'

const mocks = vi.hoisted(() => ({
  auth: { signInWithPassword: vi.fn(), getSession: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
}))
vi.mock('../../lib/supabase/staff-client', () => ({ staffSupabaseClient: { auth: mocks.auth, rpc: mocks.rpc } }))

afterEach(() => vi.clearAllMocks())

describe('staff auth service', () => {
  it('rejects incomplete credentials locally', async () => {
    const result = await signInStaff('', '')
    expect(result.ok).toBe(false)
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('uses generic message for invalid credentials', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    const result = await signInStaff('staff@example.test', 'bad')
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED', userMessage: 'Credenziali non valide.' } })
  })

  it('requires active staff access after password login', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { user: { is_anonymous: false } }, error: null })
    mocks.auth.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } }, error: null })
    mocks.rpc.mockResolvedValue({ data: [{ staff_member_id: 'staff-1', display_name: 'Staff', active: true }], error: null })
    const result = await signInStaff(' staff@example.test ', 'secret')
    expect(result.ok).toBe(true)
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'staff@example.test', password: 'secret' })
  })

  it('logs out local scope when membership is denied', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { user: { is_anonymous: false } }, error: null })
    mocks.auth.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } }, error: null })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'STAFF_ACCESS_DENIED' } })
    const result = await signInStaff('staff@example.test', 'secret')
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('rejects anonymous session and signs out locally', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } }, error: null })
    const result = await getCurrentStaffAccess()
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('uses local logout scope', async () => {
    mocks.auth.signOut.mockResolvedValue({ error: null })
    const result = await signOutStaff()
    expect(result.ok).toBe(true)
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
