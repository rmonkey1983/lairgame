import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlayerShellPage from './PlayerShellPage'

const getState = vi.hoisted(() => vi.fn())
vi.mock('../../domain/player/player.join', () => ({ getMyJoinState: getState }))

function renderShell() {
  return render(<MemoryRouter initialEntries={['/play/JOIN-ONE/session']}><Routes><Route path="/play/:gameCode/session" element={<PlayerShellPage />} /><Route path="/play/:gameCode" element={<p>join route</p>} /></Routes></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PlayerShellPage', () => {
  it('renders current player state only', async () => {
    getState.mockResolvedValue({ ok: true, value: { nickname: 'Player', table_number: 3, seat_number: 1 } })
    renderShell()
    expect(await screen.findByText('Sei dentro.')).toBeInTheDocument()
    expect(screen.getByText('Player')).toBeInTheDocument()
    expect(screen.getByText('Tavolo 3 · Posto 1')).toBeInTheDocument()
  })

  it('handles missing session without creating replacement identity', async () => {
    getState.mockResolvedValue({ ok: false, error: { userMessage: 'Sessione Player non disponibile.' } })
    renderShell()
    expect(await screen.findByText('Sessione Player non disponibile.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna al join' })).toHaveAttribute('href', '/play/JOIN-ONE')
  })
})
