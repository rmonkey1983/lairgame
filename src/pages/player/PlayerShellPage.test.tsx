import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlayerShellPage from './PlayerShellPage'

const getState = vi.hoisted(() => vi.fn())
const subscribe = vi.hoisted(() => vi.fn(() => vi.fn()))
const acknowledge = vi.hoisted(() => vi.fn())
vi.mock('../../domain/player/player.state', () => ({ getMyPlayerState: getState }))
vi.mock('../../domain/player/player.realtime', () => ({ subscribeToPlayerGameState: subscribe }))
vi.mock('../../domain/player/player.role', () => ({ acknowledgeMyRole: acknowledge }))

function renderShell() {
  return render(<MemoryRouter initialEntries={['/play/JOIN-ONE/session']}><Routes><Route path="/play/:gameCode/session" element={<PlayerShellPage />} /><Route path="/play/:gameCode" element={<p>join route</p>} /></Routes></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PlayerShellPage', () => {
  it('renders current player state only', async () => {
    getState.mockResolvedValue({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'lobby', nickname: 'Player', table_number: 3, seat_number: 1, role: null } })
    renderShell()
    expect(await screen.findByText('Sei dentro.')).toBeInTheDocument()
    expect(screen.getByText('Player')).toBeInTheDocument()
    expect(screen.getByText('Tavolo 3 · Posto 1')).toBeInTheDocument()
  })

  it('shows the private role after role reveal and refetches on the game wake-up', async () => {
    getState
      .mockResolvedValueOnce({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'lobby', nickname: 'Player', table_number: 3, seat_number: 1, role: null } })
      .mockResolvedValueOnce({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'role_reveal', nickname: 'Player', table_number: 3, seat_number: 1, role: 'investigator' } })
    let wakeUp!: () => void
    subscribe.mockImplementationOnce((...args: unknown[]) => { wakeUp = args[1] as () => void; return vi.fn() })
    renderShell()
    expect(await screen.findByText('Attendi l’inizio.')).toBeInTheDocument()
    wakeUp()
    expect(await screen.findByText('Investigatore')).toBeInTheDocument()
    expect(subscribe).toHaveBeenCalledWith('game-1', expect.any(Function))
  })

  it('masks a scapegoat response at the Player presentation boundary', async () => {
    getState.mockResolvedValue({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'role_reveal', nickname: 'Player', table_number: 3, seat_number: 1, role: 'investigator' } })
    renderShell()
    expect(await screen.findByText('Investigatore')).toBeInTheDocument()
    expect(screen.queryByText('Scapegoat')).not.toBeInTheDocument()
  })

  it('acknowledges the private role and refreshes authoritative state', async () => {
    getState
      .mockResolvedValueOnce({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'role_reveal', nickname: 'Player', table_number: 3, seat_number: 1, role: 'liar', role_acknowledged: false } })
      .mockResolvedValueOnce({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'role_reveal', nickname: 'Player', table_number: 3, seat_number: 1, role: 'liar', role_acknowledged: true } })
    acknowledge.mockResolvedValue({ ok: true, value: undefined })
    renderShell()
    await userEvent.click(await screen.findByRole('button', { name: 'Ho capito il mio ruolo' }))
    expect(acknowledge).toHaveBeenCalledWith('JOIN-ONE')
    expect(await screen.findByText('Ruolo confermato. Attendi la Regia.')).toBeInTheDocument()
  })

  it('renders only the selected public briefing after the phase wake-up', async () => {
    getState
      .mockResolvedValueOnce({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'role_reveal', nickname: 'Player', table_number: 3, seat_number: 1, role: 'investigator', role_acknowledged: false, scenario_title: null, briefing_title: null, briefing_body: null } })
      .mockResolvedValueOnce({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'briefing', nickname: 'Player', table_number: 3, seat_number: 1, role: 'investigator', role_acknowledged: false, scenario_title: 'Scenario', briefing_title: 'Titolo briefing', briefing_body: 'Corpo briefing' } })
    let wakeUp!: () => void
    subscribe.mockImplementationOnce((...args: unknown[]) => { wakeUp = args[1] as () => void; return vi.fn() })
    renderShell()
    expect(await screen.findByText('Investigatore')).toBeInTheDocument()
    expect(screen.queryByText('Titolo briefing')).not.toBeInTheDocument()
    wakeUp()
    expect(await screen.findByText('Titolo briefing')).toBeInTheDocument()
    expect(screen.getByText('Corpo briefing')).toBeInTheDocument()
  })

  it('moves from briefing to the Discovery cue without showing stale content', async () => {
    getState
      .mockResolvedValueOnce({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'briefing', nickname: 'Player', table_number: 3, seat_number: 1, role: 'investigator', role_acknowledged: true, scenario_title: 'Scenario', briefing_title: 'Titolo briefing', briefing_body: 'Corpo briefing', discovery_title: null, discovery_body: null } })
      .mockResolvedValueOnce({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'discovery', nickname: 'Player', table_number: 3, seat_number: 1, role: 'investigator', role_acknowledged: true, scenario_title: 'Scenario', briefing_title: null, briefing_body: null, discovery_title: 'Guardatevi intorno', discovery_body: 'Parlate al vostro tavolo.', clue_title: 'Il biglietto', clue_body: 'Un biglietto è stato trovato.' } })
    let wakeUp!: () => void
    subscribe.mockImplementationOnce((...args: unknown[]) => { wakeUp = args[1] as () => void; return vi.fn() })
    renderShell()
    expect(await screen.findByText('Titolo briefing')).toBeInTheDocument()
    wakeUp()
    expect(await screen.findByText('Guardatevi intorno')).toBeInTheDocument()
    expect(screen.getByText('Parlate al vostro tavolo.')).toBeInTheDocument()
    expect(screen.getByText('Il vostro frammento')).toBeInTheDocument()
    expect(screen.getByText('Il biglietto')).toBeInTheDocument()
    expect(screen.getByText('Un biglietto è stato trovato.')).toBeInTheDocument()
    expect(screen.queryByText('Titolo briefing')).not.toBeInTheDocument()
    expect(screen.queryByText('Il tuo ruolo privato')).not.toBeInTheDocument()
  })

  it('handles missing session without creating replacement identity', async () => {
    getState.mockResolvedValue({ ok: false, error: { userMessage: 'Sessione Player non disponibile.' } })
    renderShell()
    expect(await screen.findByText('Sessione Player non disponibile.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna al join' })).toHaveAttribute('href', '/play/JOIN-ONE')
  })

  it('shows only the authoritative comparison route and own clue after the wake-up', async () => {
    getState.mockResolvedValue({ ok: true, value: { game_id: 'game-1', lifecycle: 'live', narrative_phase: 'comparison', nickname: 'Player', table_number: 3, seat_number: 1, role: 'investigator', role_acknowledged: true, scenario_title: 'Scenario', comparison_title: 'Confrontate i frammenti', comparison_body: 'Parlate con il tavolo indicato.', clue_title: 'Il biglietto', clue_body: 'Il vostro frammento.', comparison_target_table_number: 4, comparison_instruction: 'Confrontate a voce il vostro frammento con il Tavolo 4.' } })
    renderShell()
    expect(await screen.findByRole('heading', { name: 'Confrontate i frammenti' })).toBeInTheDocument()
    expect(screen.getByText('Tavolo 4')).toBeInTheDocument()
    expect(screen.getByText('Il vostro frammento')).toBeInTheDocument()
    expect(screen.queryByText('Tavolo 1')).not.toBeInTheDocument()
  })
})
