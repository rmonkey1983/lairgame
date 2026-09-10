import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import AdminGamesPage from './AdminGamesPage'

const { listStaffGames } = vi.hoisted(() => ({ listStaffGames: vi.fn() }))
vi.mock('../../domain/session/staff.game.read', () => ({ listStaffGames }))
vi.mock('../../domain/session/staff.auth', () => ({ signOutStaff: vi.fn().mockResolvedValue({ ok: true, value: undefined }) }))

const access = { staff_member_id: 'staff-1', display_name: 'Regia', active: true }
function renderPage() { return render(<MemoryRouter initialEntries={['/admin/games']}><Routes><Route element={<Outlet context={access} />}><Route path="/admin/games" element={<AdminGamesPage />} /><Route path="/admin/games/:gameCode" element={<p>overview route</p>} /></Route></Routes></MemoryRouter>) }

describe('AdminGamesPage', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })
  it('shows loading then the real game list and selects explicitly', async () => {
    listStaffGames.mockResolvedValue({ ok: true, value: [{ game_id: 'game-1', game_code: 'TEST01', lifecycle: 'checkin_open', narrative_phase: 'lobby', event_name: 'Local Event', starts_at: null, venue_name: null, table_count: 5, player_count: 0 }] })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento partite…')
    expect(await screen.findByRole('link', { name: /TEST01/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /TEST01/ }))
    expect(screen.getByText('overview route')).toBeInTheDocument()
  })
  it('shows empty and safe error states', async () => {
    listStaffGames.mockResolvedValueOnce({ ok: true, value: [] })
    renderPage()
    expect(await screen.findByText('Nessuna partita disponibile.')).toBeInTheDocument()
    cleanup()
    listStaffGames.mockResolvedValueOnce({ ok: false, error: { userMessage: 'Dati Regia non disponibili.' } })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Dati Regia non disponibili.')
    expect(screen.queryByText(/SQLSTATE|function|postgres/i)).not.toBeInTheDocument()
  })
})
