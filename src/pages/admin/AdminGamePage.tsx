import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { getStaffGameOverview, type StaffGameOverview } from '../../domain/session/staff.game.read'

export default function AdminGamePage() {
  const { gameCode } = useParams()
  const [overview, setOverview] = useState<StaffGameOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (gameCode) void getStaffGameOverview(gameCode).then((result) => result.ok ? setOverview(result.value) : setError(result.error.userMessage)) }, [gameCode])
  return <PageShell eyebrow="Control Room · game context" title="Regia"><div className="max-w-2xl"><Link className="text-sm text-primary underline underline-offset-4" to="/admin/games">← Torna alle partite</Link><p className="mt-8 text-sm uppercase tracking-[0.16em] text-muted">Game selezionato</p><p className="mt-2 font-mono text-3xl font-semibold text-primary">{gameCode}</p><div className="mt-8" aria-live="polite">{!overview && !error && <p role="status" className="text-muted">Caricamento overview…</p>}{error && <p role="alert" className="text-danger">{error}</p>}{overview && <><p className="text-xl font-semibold text-text">{overview.event_name}</p><dl className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-2"><div><dt className="text-sm text-muted">Lifecycle</dt><dd className="mt-1 font-semibold">{overview.lifecycle}</dd></div><div><dt className="text-sm text-muted">Narrative phase</dt><dd className="mt-1 font-semibold">{overview.narrative_phase}</dd></div><div><dt className="text-sm text-muted">Partecipanti</dt><dd className="mt-1 text-2xl font-semibold text-primary">{overview.player_count}</dd></div><div><dt className="text-sm text-muted">Tavoli</dt><dd className="mt-1 text-2xl font-semibold text-primary">{overview.table_count}</dd></div>{overview.venue_name && <div><dt className="text-sm text-muted">Venue</dt><dd className="mt-1 font-semibold">{overview.venue_name}</dd></div>}</dl></>}</div></div></PageShell>
}
