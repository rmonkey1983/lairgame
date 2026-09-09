import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppRoutes } from './router'
import App from './App'

function renderRoute(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>) }
describe('foundation routes', () => {
  afterEach(cleanup)
  it('mounts App with BrowserRouter', () => { render(<App />); expect(screen.getByRole('heading', { name: 'Liar System' })).toBeInTheDocument() })
  it('renders home', () => { renderRoute('/'); expect(screen.getByRole('heading', { name: 'Liar System' })).toBeInTheDocument() })
  it('renders player game code', () => { renderRoute('/play/ABC123'); expect(screen.getByText('ABC123')).toBeInTheDocument() })
  it('renders admin game context', () => { renderRoute('/admin/games/ROOM7'); expect(screen.getByText('ROOM7')).toBeInTheDocument() })
  it('renders not found', () => { renderRoute('/unknown'); expect(screen.getByRole('heading', { name: 'Pagina non trovata' })).toBeInTheDocument() })
})
