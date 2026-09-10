import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaffGate } from './StaffGate'

const getAccess = vi.hoisted(() => vi.fn())
vi.mock('../../domain/session/staff.auth', () => ({ getCurrentStaffAccess: getAccess, signOutStaff: vi.fn().mockResolvedValue({ ok: true, value: undefined }) }))

function renderGate() {
  return render(<MemoryRouter initialEntries={['/admin/games']}><Routes><Route element={<StaffGate />}><Route path="/admin/games" element={<p>authorized content</p>} /></Route><Route path="/admin/login" element={<p>login content</p>} /></Routes></MemoryRouter>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('StaffGate', () => {
  it('shows checking state before access resolves', () => {
    getAccess.mockReturnValue(new Promise(() => undefined))
    renderGate()
    expect(screen.getByText('Verifica accesso…')).toBeInTheDocument()
  })

  it('renders authorized route after active membership check', async () => {
    getAccess.mockResolvedValue({ ok: true, value: { staff_member_id: 'staff-1', display_name: 'Staff', active: true } })
    renderGate()
    expect(await screen.findByText('authorized content')).toBeInTheDocument()
  })

  it('redirects unauthorized route to login', async () => {
    getAccess.mockResolvedValue({ ok: false, error: { userMessage: 'Access denied.' } })
    renderGate()
    expect(await screen.findByText('login content')).toBeInTheDocument()
  })
})
