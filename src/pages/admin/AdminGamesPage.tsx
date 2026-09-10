import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { signOutStaff, type StaffAccess } from '../../domain/session/staff.auth'
import { listStaffGames, type StaffGame } from '../../domain/session/staff.game.read'

export default function AdminGamesPage() {
  const access = useOutletContext<StaffAccess>()
  const navigate = useNavigate()
  const [games, setGames] = useState<StaffGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void listStaffGames().then((result) => result.ok ? setGames(result.value) : setError(result.error.userMessage)) }, [])
  async function logout() { await signOutStaff(); navigate('/admin/login', { replace: true }) }
  return <PageShell eyebrow="Control Room" title="Regia"><div className="max-w-3xl"><p className="text-sm text-muted">Accesso autorizzato{access.display_name ? ` · ${access.display_name}` : ''}.</p><div className="mt-8" aria-live="polite">{games === null && !error && <p role="status" className="text-muted">Caricamento partite…</p>}{error && <p role="alert" className="text-danger">{error}</p>}{games?.length === 0 && <p className="text-muted">Nessuna partita disponibile.</p>}{games && games.length > 0 && <ul className="grid gap-3" aria-label="Partite disponibili">{games.map((game) => <li key={game.game_id}><Link className="block border border-border bg-surface p-5 transition hover:border-primary" to={`/admin/games/${encodeURIComponent(game.game_code)}`}><div className="flex flex-wrap items-baseline justify-between gap-3"><span className="font-mono text-2xl font-semibold text-primary">{game.game_code}</span><span className="text-sm text-muted">{game.event_name}</span></div><dl className="mt-4 grid gap-2 text-sm sm:grid-cols-4"><div><dt className="text-muted">Lifecycle</dt><dd className="font-semibold">{game.lifecycle}</dd></div><div><dt className="text-muted">Phase</dt><dd className="font-semibold">{game.narrative_phase}</dd></div><div><dt className="text-muted">Tavoli</dt><dd className="font-semibold">{game.table_count}</dd></div><div><dt className="text-muted">Partecipanti</dt><dd className="font-semibold">{game.player_count}</dd></div></dl></Link></li>)}</ul>}</div><button className="action action-secondary mt-8 w-fit" type="button" onClick={() => void logout()}>Logout</button></div></PageShell>
}
