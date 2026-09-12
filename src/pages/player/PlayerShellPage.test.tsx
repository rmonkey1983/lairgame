import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlayerShellPage from './PlayerShellPage'

const getState = vi.hoisted(() => vi.fn())
const subscribe = vi.hoisted(() => vi.fn(() => vi.fn()))
vi.mock('../../domain/player/player.state', () => ({ getMyPlayerState: getState }))
vi.mock('../../domain/player/player.realtime', () => ({ subscribeToPlayerGameState: subscribe }))

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

  it('handles missing session without creating replacement identity', async () => {
    getState.mockResolvedValue({ ok: false, error: { userMessage: 'Sessione Player non disponibile.' } })
    renderShell()
    expect(await screen.findByText('Sessione Player non disponibile.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna al join' })).toHaveAttribute('href', '/play/JOIN-ONE')
  })
})
