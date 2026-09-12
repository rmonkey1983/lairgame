import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlayerEntryPage from './PlayerEntryPage'

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
}))
vi.mock('../../domain/player/player.join', async () => {
  const actual = await vi.importActual<typeof import('../../domain/player/player.join')>('../../domain/player/player.join')
  return { ...actual, joinGame: mocks.join }
})

function renderEntry() {
  return render(<MemoryRouter initialEntries={['/play/JOIN-ONE']}><Routes><Route path="/play/:gameCode" element={<PlayerEntryPage />} /><Route path="/play/:gameCode/session" element={<p>session route</p>} /></Routes></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PlayerEntryPage', () => {
  it('does not create anonymous auth on page load', () => {
    renderEntry()
    expect(mocks.join).not.toHaveBeenCalled()
  })

  it('validates fields and starts auth only after valid submit', async () => {
    const user = userEvent.setup()
    mocks.join.mockResolvedValue({ ok: true, value: {} })
    renderEntry()
    await user.click(screen.getByRole('button', { name: 'Entra nel gioco' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Inserisci un nickname.')
    await user.type(screen.getByLabelText('Nickname'), ' Player ')
    await user.type(screen.getByLabelText('Numero tavolo'), '3')
    await user.type(screen.getByLabelText('Numero posto'), '1')
    await user.click(screen.getByRole('button', { name: 'Entra nel gioco' }))
    expect(mocks.join).toHaveBeenCalledWith({ gameCode: 'JOIN-ONE', nickname: 'Player', tableNumber: 3, seatNumber: 1 })
    expect(await screen.findByText('session route')).toBeInTheDocument()
  })

  it('maps service errors and prevents duplicate submit while pending', async () => {
    const user = userEvent.setup()
    mocks.join.mockResolvedValue({ ok: false, error: { userMessage: 'Posto già occupato.' } })
    renderEntry()
    await user.type(screen.getByLabelText('Nickname'), 'Player')
    await user.type(screen.getByLabelText('Numero tavolo'), '3')
    await user.type(screen.getByLabelText('Numero posto'), '1')
    const button = screen.getByRole('button', { name: 'Entra nel gioco' })
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Posto già occupato.')
  })
})
