import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminGamePage from './AdminGamePage'

const { getStaffGameOverview } = vi.hoisted(() => ({ getStaffGameOverview: vi.fn() }))
vi.mock('../../domain/session/staff.game.read', () => ({ getStaffGameOverview }))

function renderPage(path = '/admin/games/TEST01') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/games/:gameCode" element={<AdminGamePage />} /><Route path="/admin/games" element={<p>games list</p>} /></Routes></MemoryRouter>) }

describe('AdminGamePage', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })
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
})
