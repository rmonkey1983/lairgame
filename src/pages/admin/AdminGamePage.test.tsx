import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminGamePage from './AdminGamePage'

const { getStaffGameOverview, getStaffGameRoster, getStaffGameRoles, getStaffGameClues, getStaffGameComparisons, getStaffGamePressureRoutes, getStaffGameCoins, getStaffGameAuction, openGameAuction, recordGameAuctionBid, closeGameAuction, closeGameAuctionNoSale, assignGameRoles, resetGameForTesting, transitionGameLifecycle, isStaleLifecycleError, transitionGameNarrativePhase, isStaleNarrativePhaseError, subscribeToStaffGameState } = vi.hoisted(() => ({ getStaffGameOverview: vi.fn(), getStaffGameRoster: vi.fn(() => Promise.resolve({ ok: true, value: [] as Array<{ player_id: string; nickname: string; table_number: number; seat_number: number; joined_at: string }> })), getStaffGameRoles: vi.fn(() => Promise.resolve({ ok: true, value: [] })), getStaffGameClues: vi.fn(() => Promise.resolve({ ok: true, value: [] as Array<{ table_number: number; title: string; body: string }> })), getStaffGameComparisons: vi.fn(() => Promise.resolve({ ok: true, value: [] as Array<{ source_table_number: number; target_table_number: number; instruction: string }> })), getStaffGamePressureRoutes: vi.fn(() => Promise.resolve({ ok: true, value: [] as Array<{ source_table_number: number; target_table_number: number; title: string; instruction: string }> })), getStaffGameCoins: vi.fn(() => Promise.resolve({ ok: true, value: [] as Array<{ table_number: number; balance: number }> })), getStaffGameAuction: vi.fn(() => Promise.resolve({ ok: true, value: null as unknown })), openGameAuction: vi.fn(), recordGameAuctionBid: vi.fn(), closeGameAuction: vi.fn(), closeGameAuctionNoSale: vi.fn(), assignGameRoles: vi.fn(), resetGameForTesting: vi.fn(), transitionGameLifecycle: vi.fn(), isStaleLifecycleError: vi.fn((error: { cause?: { message?: string } }) => error.cause?.message === 'STALE_GAME_STATE'), transitionGameNarrativePhase: vi.fn(), isStaleNarrativePhaseError: vi.fn((error: { cause?: { message?: string } }) => error.cause?.message === 'STALE_GAME_STATE'), subscribeToStaffGameState: vi.fn((gameId: string, onStateChanged: () => void, onStatus?: (status: string) => void) => { void gameId; void onStateChanged; void onStatus; return vi.fn() }) }))
vi.mock('../../domain/session/staff.game.read', () => ({ getStaffGameOverview, getStaffGameRoster, getStaffGameRoles, getStaffGameClues, getStaffGameComparisons, getStaffGamePressureRoutes, getStaffGameCoins, getStaffGameAuction }))
vi.mock('../../domain/session/staff.game.auction.command', () => ({ openGameAuction, recordGameAuctionBid, closeGameAuction, closeGameAuctionNoSale }))
vi.mock('../../domain/session/staff.game.roles.command', () => ({ assignGameRoles }))
vi.mock('../../domain/session/staff.game.reset.command', () => ({ resetGameForTesting }))
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
  it('shows the test reset only when enabled and requires confirmation', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'auction', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', table_count: 5, player_count: 0, reset_enabled: true } })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    const resetButton = await screen.findByRole('button', { name: 'Reset partita test' })
    await userEvent.click(resetButton)
    expect(window.confirm).toHaveBeenCalledWith('Reset TEST01?\nTutti i partecipanti verranno espulsi dalla partita.\nLo stato del game verrà azzerato e sarà pronto per una nuova partita.')
    expect(resetGameForTesting).not.toHaveBeenCalled()
  })
  it('resets the authoritative Regia state after confirmed test reset', async () => {
    getStaffGameOverview
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'completed', narrative_phase: 'reveal', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', table_count: 5, player_count: 0, reset_enabled: true } })
      .mockResolvedValueOnce({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', table_count: 5, player_count: 0, reset_enabled: true } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    resetGameForTesting.mockResolvedValue({ ok: true, value: { game_id: 'game-1', game_code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', command_id: 'reset-1', reset_at: '2026-09-10T10:00:00Z' } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Reset partita test' }))
    expect(resetGameForTesting).toHaveBeenCalledWith('TEST01')
    expect(await screen.findByText('Partita resettata.')).toBeInTheDocument()
    expect(await screen.findAllByText('checkin_open')).not.toHaveLength(0)
    expect(screen.getAllByText('Lobby')).not.toHaveLength(0)
    expect(await screen.findByText('0 / 30 posti occupati')).toBeInTheDocument()
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

  it('shows the authoritative Discovery cue for Regia', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'discovery', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0, scenario_title: 'Scenario', scenario_version_number: 1, discovery_title: 'Guardatevi intorno', discovery_body: 'Parlate al vostro tavolo.' } })
    getStaffGameClues.mockResolvedValue({ ok: true, value: [{ table_number: 1, title: 'Il bicchiere', body: 'Frammento uno.' }, { table_number: 2, title: 'La sedia vuota', body: 'Frammento due.' }] })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Guardatevi intorno' })).toBeInTheDocument()
    expect(screen.getByText('Parlate al vostro tavolo.')).toBeInTheDocument()
    expect(screen.getByText('Frammento uno.')).toBeInTheDocument()
    expect(screen.getByText('Frammento due.')).toBeInTheDocument()
  })
  it('shows all directed comparison routes for Regia', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'comparison', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', table_count: 5, player_count: 0, scenario_title: 'Scenario', scenario_version_number: 1, comparison_title: 'Confrontate i frammenti', comparison_body: 'Parlate con il tavolo indicato.' } })
    getStaffGameComparisons.mockResolvedValue({ ok: true, value: [{ source_table_number: 1, target_table_number: 2, instruction: 'Istruzione 1' }, { source_table_number: 2, target_table_number: 3, instruction: 'Istruzione 2' }, { source_table_number: 3, target_table_number: 4, instruction: 'Istruzione 3' }, { source_table_number: 4, target_table_number: 5, instruction: 'Istruzione 4' }, { source_table_number: 5, target_table_number: 1, instruction: 'Istruzione 5' }] })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Confrontate i frammenti' })).toBeInTheDocument()
    expect(screen.getByText('Tavolo 1 → Tavolo 2')).toBeInTheDocument()
    expect(screen.getByText('Tavolo 5 → Tavolo 1')).toBeInTheDocument()
  })
  it('renders the authoritative BBL Coin balance for every table', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', table_count: 5, player_count: 0 } })
    getStaffGameCoins.mockResolvedValue({ ok: true, value: [1, 2, 3, 4, 5].map((table_number) => ({ table_number, balance: 20 })) })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'BBL COIN' })).toBeInTheDocument()
    expect(screen.getAllByText('Tavolo 1', { exact: false })).toHaveLength(2)
    expect(screen.getAllByText('Tavolo 5', { exact: false })).toHaveLength(2)
    expect(screen.getAllByText('20')).toHaveLength(5)
  })
  it('renders the MC-led auction controls and accepted bids', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'auction', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', table_count: 5, player_count: 0 } })
    getStaffGameAuction.mockResolvedValue({ ok: true, value: { auction_id: 'auction-1', item_title: 'La chiave', item_teaser: 'Un oggetto.', status: 'open', bids: [{ table_number: 2, amount: 8, created_at: '2026-09-10T10:00:00Z' }], current_highest_bid: 8, current_highest_table_number: 2, winning_table_number: null, winning_bid: null, table_balances: [] } })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'La chiave' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registra offerta' })).toBeInTheDocument()
    expect(screen.getByText('Offerta massima: 8 · Tavolo 2')).toBeInTheDocument()
    expect(screen.getByText('Tavolo 2 — 8')).toBeInTheDocument()
    expect(screen.queryByText(/Riservato al Player/)).not.toBeInTheDocument()
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
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'reveal', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Completa partita' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(transitionGameLifecycle).not.toHaveBeenCalled()
  })
  it('shows a clear completion guard error if the backend rejects stale early completion', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'reveal', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 } })
    transitionGameLifecycle.mockResolvedValue({ ok: false, error: { userMessage: 'La partita può essere completata solo dopo la rivelazione finale.', cause: { message: 'GAME_NOT_READY_TO_COMPLETE' } } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Completa partita' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La partita può essere completata solo dopo la rivelazione finale.')
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
  it('offers role assignment in live lobby and refetches the authoritative roles', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 3 } })
    assignGameRoles.mockResolvedValue({ ok: true, value: { player_count: 3 } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Assegna ruoli' }))
    expect(assignGameRoles).toHaveBeenCalledWith('TEST01')
    expect(transitionGameNarrativePhase).not.toHaveBeenCalled()
    expect(getStaffGameRoles).toHaveBeenCalled()
  })
  it('disables role reveal until the role snapshot covers the roster', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'lobby', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 3 } })
    getStaffGameRoster.mockResolvedValue({ ok: true, value: [
      { player_id: 'p1', nickname: 'Alice', table_number: 1, seat_number: 1, joined_at: '2026-09-10T00:00:00Z' },
      { player_id: 'p2', nickname: 'Bob', table_number: 1, seat_number: 2, joined_at: '2026-09-10T00:00:00Z' },
      { player_id: 'p3', nickname: 'Cara', table_number: 1, seat_number: 3, joined_at: '2026-09-10T00:00:00Z' },
    ] })
    renderPage()
    const button = await screen.findByRole('button', { name: 'Vai a scoperta ruoli' })
    expect(button).toBeDisabled()
    expect(button).toHaveClass('opacity-50')
    expect(screen.getByText('Assegna i ruoli prima di avanzare.')).toBeInTheDocument()
    await userEvent.click(button)
    expect(transitionGameNarrativePhase).not.toHaveBeenCalled()
  })

  it('shows acknowledgement progress and guards briefing until all Players confirm', async () => {
    getStaffGameOverview.mockResolvedValue({ ok: true, value: { id: 'game-1', code: 'TEST01', lifecycle: 'live', narrative_phase: 'role_reveal', created_at: '2026-09-10T10:00:00Z', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 3 } })
    getStaffGameRoster.mockResolvedValue({ ok: true, value: [
      { player_id: 'p1', nickname: 'Alice', table_number: 1, seat_number: 1, joined_at: '2026-09-10T00:00:00Z' },
      { player_id: 'p2', nickname: 'Bob', table_number: 1, seat_number: 2, joined_at: '2026-09-10T00:00:00Z' },
      { player_id: 'p3', nickname: 'Cara', table_number: 1, seat_number: 3, joined_at: '2026-09-10T00:00:00Z' },
    ] })
    getStaffGameRoles.mockResolvedValue({ ok: true, value: [
      { player_id: 'p1', nickname: 'Alice', table_number: 1, seat_number: 1, role: 'liar', role_acknowledged: true },
      { player_id: 'p2', nickname: 'Bob', table_number: 1, seat_number: 2, role: 'accomplice', role_acknowledged: false },
      { player_id: 'p3', nickname: 'Cara', table_number: 1, seat_number: 3, role: 'investigator', role_acknowledged: false },
    ] as never })
    renderPage()
    const button = await screen.findByRole('button', { name: 'Vai al briefing' })
    expect(screen.getByText('Ruoli confermati: 1 / 3')).toBeInTheDocument()
    expect(button).toBeDisabled()
    expect(screen.getByText('Attendi la conferma di tutti i Player.')).toBeInTheDocument()
  })
})
