import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminGamePage from './AdminGamePage'

const { getStaffGameOverview, getStaffGameRoster, transitionGameLifecycle, isStaleLifecycleError, transitionGameNarrativePhase, isStaleNarrativePhaseError, subscribeToStaffGameState } = vi.hoisted(() => ({ getStaffGameOverview: vi.fn(), getStaffGameRoster: vi.fn(() => Promise.resolve({ ok: true, value: [] as Array<{ player_id: string; nickname: string; table_number: number; seat_number: number; joined_at: string }> })), transitionGameLifecycle: vi.fn(), isStaleLifecycleError: vi.fn((error: { cause?: { message?: string } }) => error.cause?.message === 'STALE_GAME_STATE'), transitionGameNarrativePhase: vi.fn(), isStaleNarrativePhaseError: vi.fn((error: { cause?: { message?: string } }) => error.cause?.message === 'STALE_GAME_STATE'), subscribeToStaffGameState: vi.fn((gameId: string, onStateChanged: () => void, onStatus?: (status: string) => void) => { void gameId; void onStateChanged; void onStatus; return vi.fn() }) }))
vi.mock('../../domain/session/staff.game.read', () => ({ getStaffGameOverview, getStaffGameRoster }))
vi.mock('../../domain/session/staff.game.command', () => ({ transitionGameLifecycle, isStaleLifecycleError }))
vi.mock('../../domain/session/staff.game.phase.command', () => ({ transitionGameNarrativePhase, isStaleNarrativePhaseError }))
vi.mock('../../domain/session/staff.game.realtime', () => ({ subscribeToStaffGameState }))

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
    expect(subscribeToStaffGameState).toHaveBeenCalledWith('game-1', expect.any(Function))
  })
  it('refetches the authoritative overview when the game wake-up arrives', async () => {
    let wakeUp!: () => void
    getStaffGameOverview
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    subscribeToStaffGameState.mockImplementationOnce((_gameId: string, callback: () => void) => { wakeUp = callback; return vi.fn() })
    renderPage()
    await screen.findByText('Local Event')
    wakeUp()
    expect(await screen.findAllByText('live')).not.toHaveLength(0)
    expect(getStaffGameOverview).toHaveBeenCalledTimes(2)
  })
  it('renders occupied and empty seats across the selected tables', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 2 } })
    getStaffGameRoster.mockResolvedValue({ ok: true, value: [
      { player_id: 'player-1', nickname: 'Alice', table_number: 1, seat_number: 1, joined_at: '2026-09-10T10:01:00Z' },
      { player_id: 'player-2', nickname: 'Bob', table_number: 3, seat_number: 6, joined_at: '2026-09-10T10:02:00Z' },
    ] })
    renderPage()
    expect(await screen.findByText('2 / 30 posti occupati')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tavolo 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tavolo 5' })).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getAllByText('Posto vuoto')).toHaveLength(28)
  })
  it('refetches roster together with overview after a wake-up', async () => {
    let wakeUp!: () => void
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    getStaffGameRoster
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({ ok: true, value: [{ player_id: 'player-1', nickname: 'Cara', table_number: 2, seat_number: 3, joined_at: '2026-09-10T10:03:00Z' }] })
    subscribeToStaffGameState.mockImplementationOnce((_gameId: string, callback: () => void) => { wakeUp = callback; return vi.fn() })
    renderPage()
    await screen.findByText('0 / 30 posti occupati')
    wakeUp()
    expect(await screen.findByText('Cara')).toBeInTheDocument()
    expect(getStaffGameRoster).toHaveBeenCalledTimes(2)
  })
  it('cleans the selected game subscription on unmount', async () => {
    const unsubscribe = vi.fn()
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    subscribeToStaffGameState.mockReturnValueOnce(unsubscribe)
    const { unmount } = renderPage()
    await screen.findByText('Local Event')
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
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
  it('shows only the next narrative phase and no skip action', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Vai a scoperta ruoli' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vai al briefing' })).not.toBeInTheDocument()
  })
  it('disables the narrative command while pending', async () => {
    let resolveCommand!: (value: unknown) => void
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    transitionGameNarrativePhase.mockImplementation(() => new Promise((resolve) => { resolveCommand = resolve }))
    renderPage()
    const phaseButton = await screen.findByRole('button', { name: 'Vai a scoperta ruoli' })
    await userEvent.click(phaseButton)
    expect(phaseButton).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Aggiornamento fase narrativa in corso…')
    resolveCommand({ ok: true, value: { phase: 'role_reveal' } })
  })
  it('refetches authoritative phase after success', async () => {
    getStaffGameOverview
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'role_reveal', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    transitionGameNarrativePhase.mockResolvedValue({ ok: true, value: { phase: 'role_reveal' } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Vai a scoperta ruoli' }))
    expect((await screen.findAllByText('Role reveal')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Vai al briefing' })).toBeInTheDocument()
    expect(transitionGameNarrativePhase).toHaveBeenCalledWith(expect.objectContaining({ gameCode: 'TEST01', expectedPhase: 'lobby', targetPhase: 'role_reveal', commandId: expect.any(String) }))
  })
  it('refetches after a stale narrative phase and shows a safe message', async () => {
    getStaffGameOverview
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'briefing', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    transitionGameNarrativePhase.mockResolvedValue({ ok: false, error: { userMessage: 'La fase narrativa è cambiata. Dati aggiornati.', cause: { message: 'STALE_GAME_STATE' } } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Vai a scoperta ruoli' }))
    expect(await screen.findByRole('status')).toHaveTextContent('La fase narrativa è cambiata. Dati aggiornati.')
    expect(screen.getAllByText('Briefing').length).toBeGreaterThan(0)
    expect(getStaffGameOverview).toHaveBeenCalledTimes(2)
  })
  it('does not expose a phase action when reveal is terminal', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'reveal', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    renderPage()
    expect(await screen.findByText('Nessuna fase narrativa successiva.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Vai a/ })).not.toBeInTheDocument()
  })
  it('keeps the phase action disabled when lifecycle is not live', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Vai a scoperta ruoli' })).toBeDisabled()
    expect(screen.getByText('Disponibile solo con lifecycle live.')).toBeInTheDocument()
    expect(transitionGameNarrativePhase).not.toHaveBeenCalled()
  })
})
