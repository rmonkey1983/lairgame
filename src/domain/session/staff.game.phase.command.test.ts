import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStaleNarrativePhaseError, transitionGameNarrativePhase } from './staff.game.phase.command'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase/staff-client', () => ({ staffSupabaseClient: { rpc } }))

afterEach(() => vi.clearAllMocks())

describe('staff narrative phase command service', () => {
  it('calls the authoritative RPC with the expected phase and command id', async () => {
    rpc.mockResolvedValue({ data: [{ phase: 'role_reveal' }], error: null })
    const result = await transitionGameNarrativePhase({ gameCode: 'TEST01', expectedPhase: 'lobby', targetPhase: 'role_reveal', commandId: '70000000-0000-0000-0000-000000000001' })
    expect(result).toMatchObject({ ok: true, value: { phase: 'role_reveal' } })
    expect(rpc).toHaveBeenCalledWith('transition_game_narrative_phase', { game_code: 'TEST01', expected_phase: 'lobby', target_phase: 'role_reveal', command_id: '70000000-0000-0000-0000-000000000001' })
  })
  it('maps GAME_NOT_LIVE to a safe conflict message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'GAME_NOT_LIVE' } })
    const result = await transitionGameNarrativePhase({ gameCode: 'TEST01', expectedPhase: 'lobby', targetPhase: 'role_reveal' })
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT', userMessage: 'La partita deve essere live per avanzare la fase narrativa.' } })
    expect(result.ok && result.value).toBeFalsy()
  })
  it('maps ROLE_ASSIGNMENT_REQUIRED to a visible Regia message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'ROLE_ASSIGNMENT_REQUIRED' } })
    const result = await transitionGameNarrativePhase({ gameCode: 'TEST01', expectedPhase: 'lobby', targetPhase: 'role_reveal' })
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT', userMessage: 'Assegna i ruoli prima di avanzare alla rivelazione.' } })
  })
  it('recognizes only the internal stale-state cause', () => {
    expect(isStaleNarrativePhaseError({ code: 'CONFLICT', userMessage: 'safe', cause: { message: 'STALE_GAME_STATE' }, retryable: false })).toBe(true)
    expect(isStaleNarrativePhaseError({ code: 'CONFLICT', userMessage: 'safe', cause: { message: 'P0001' }, retryable: false })).toBe(false)
  })
})
