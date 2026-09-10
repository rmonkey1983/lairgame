import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminGamePage from './AdminGamePage'

const { getStaffGameOverview, transitionGameLifecycle, isStaleLifecycleError } = vi.hoisted(() => ({ getStaffGameOverview: vi.fn(), transitionGameLifecycle: vi.fn(), isStaleLifecycleError: vi.fn((error: { cause?: { message?: string } }) => error.cause?.message === 'STALE_GAME_STATE') }))
vi.mock('../../domain/session/staff.game.read', () => ({ getStaffGameOverview }))
vi.mock('../../domain/session/staff.game.command', () => ({ transitionGameLifecycle, isStaleLifecycleError }))

function renderPage(path = '/admin/games/TEST01') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/games/:gameCode" element={<AdminGamePage />} /><Route path="/admin/games" element={<p>games list</p>} /></Routes></MemoryRouter>) }

describe('AdminGamePage', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })
  it('shows loading, explicit game context and real overview', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: 'Local Venue', table_count: 5, player_count: 2 } })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento overview…')
    expect(screen.getByText('TEST01')).toBeInTheDocument()
    expect(await screen.findByText('Local Event')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Torna alle partite/ })).toHaveAttribute('href', '/admin/games')
  })
  it('shows safe not found and error states', async () => {
    getStaffGameOverview.mockResolvedValueOnce({ ok: false, error: { userMessage: 'Partita non trovata.' } })
    renderPage('/admin/games/MISSING')
    expect(await screen.findByRole('alert')).toHaveTextContent('Partita non trovata.')
    cleanup()
    getStaffGameOverview.mockResolvedValueOnce({ ok: false, error: { userMessage: 'Impossibile caricare i dati Regia.' } })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossibile caricare i dati Regia.')
  })
  it('shows only transitions allowed by the current lifecycle', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Avvia partita' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Interrompi partita' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Metti in pausa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Completa partita' })).not.toBeInTheDocument()
  })
  it('disables controls while pending and renders authoritative success', async () => {
    let resolveCommand!: (value: unknown) => void
    getStaffGameOverview
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    transitionGameLifecycle.mockImplementation(() => new Promise((resolve) => { resolveCommand = resolve }))
    renderPage()
    const startButton = await screen.findByRole('button', { name: 'Avvia partita' })
    await userEvent.click(startButton)
    expect(startButton).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Aggiornamento lifecycle in corso…')
    resolveCommand({ ok: true, value: { lifecycle: 'live' } })
    expect((await screen.findAllByText('live')).length).toBeGreaterThan(0)
    expect(screen.getByRole('status')).toHaveTextContent('Lifecycle aggiornato.')
    expect(transitionGameLifecycle).toHaveBeenCalledWith(expect.objectContaining({ gameCode: 'TEST01', expectedLifecycle: 'checkin_open', targetLifecycle: 'live', commandId: expect.any(String) }))
  })
  it('requires confirmation for terminal actions and cancellation does not call RPC', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Completa partita' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(transitionGameLifecycle).not.toHaveBeenCalled()
  })
  it('refetches after stale state and shows a safe message', async () => {
    getStaffGameOverview
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'paused', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    transitionGameLifecycle.mockResolvedValue({ ok: false, error: { userMessage: 'Lo stato della partita è cambiato. Dati aggiornati.', cause: { message: 'STALE_GAME_STATE' } } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Metti in pausa' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Lo stato della partita è cambiato. Dati aggiornati.')
    expect((await screen.findAllByText('paused')).length).toBeGreaterThan(0)
    expect(getStaffGameOverview).toHaveBeenCalledTimes(2)
  })
  it('shows invalid transition errors without raw database details', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    transitionGameLifecycle.mockResolvedValue({ ok: false, error: { userMessage: 'Transizione lifecycle non consentita.', cause: { message: 'INVALID_TRANSITION', code: 'P0001' } } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Avvia partita' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Transizione lifecycle non consentita.')
    expect(screen.queryByText(/P0001|SQL|function/i)).not.toBeInTheDocument()
  })
})
