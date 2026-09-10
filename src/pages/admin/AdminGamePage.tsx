import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { getAllowedLifecycleTransitions } from '../../domain/game/game.state-machine'
import type { GameLifecycle } from '../../domain/game/game.types'
import { isStaleLifecycleError, transitionGameLifecycle } from '../../domain/session/staff.game.command'
import { getStaffGameOverview, type StaffGameOverview } from '../../domain/session/staff.game.read'

const lifecycleLabels: Record<GameLifecycle, string> = {
  draft: 'Bozza', ready: 'Rendi pronta', checkin_open: 'Apri check-in', live: 'Avvia partita', paused: 'Metti in pausa', completed: 'Completa partita', aborted: 'Interrompi partita',
}

function lifecycleActionLabel(from: GameLifecycle, target: GameLifecycle): string {
  if (target === 'live' && from === 'paused') return 'Riprendi partita'
  return lifecycleLabels[target]
}

export default function AdminGamePage() {
  const { gameCode } = useParams()
  const [overview, setOverview] = useState<StaffGameOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [commandPending, setCommandPending] = useState(false)

  async function loadOverview() {
    if (!gameCode) return null
    const result = await getStaffGameOverview(gameCode)
    if (result.ok) { setOverview(result.value); setError(null) }
    else setError(result.error.userMessage)
    return result
  }

  useEffect(() => {
    if (!gameCode) return
    let active = true
    void getStaffGameOverview(gameCode).then((result) => {
      if (!active) return
      if (result.ok) { setOverview(result.value); setError(null) }
      else setError(result.error.userMessage)
    })
    return () => { active = false }
  }, [gameCode])

  async function handleTransition(targetLifecycle: GameLifecycle) {
    if (!overview || !gameCode || commandPending) return
    if (targetLifecycle === 'completed' || targetLifecycle === 'aborted') {
      const confirmed = window.confirm(`Confermi: ${lifecycleLabels[targetLifecycle]}?`)
      if (!confirmed) return
    }
    setCommandPending(true); setError(null); setNotice(null)
    const result = await transitionGameLifecycle({ gameCode, expectedLifecycle: overview.lifecycle as GameLifecycle, targetLifecycle, commandId: crypto.randomUUID() })
    if (!result.ok) {
      if (isStaleLifecycleError(result.error)) {
        const refreshed = await loadOverview()
        if (refreshed?.ok) setNotice(result.error.userMessage)
      } else setError(result.error.userMessage)
      setCommandPending(false)
      return
    }
    const refreshed = await loadOverview()
    if (refreshed?.ok) setNotice('Lifecycle aggiornato.')
    setCommandPending(false)
  }

  const allowedTransitions = overview ? getAllowedLifecycleTransitions(overview.lifecycle as GameLifecycle) : []
  return <PageShell eyebrow="Control Room · game context" title="Regia"><div className="max-w-2xl"><Link className="text-sm text-primary underline underline-offset-4" to="/admin/games">← Torna alle partite</Link><p className="mt-8 text-sm uppercase tracking-[0.16em] text-muted">Game selezionato</p><p className="mt-2 font-mono text-3xl font-semibold text-primary">{gameCode}</p><div className="mt-8" aria-live="polite">{!overview && !error && <p role="status" className="text-muted">Caricamento overview…</p>}{error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="text-success">{notice}</p>}{overview && <><p className="text-xl font-semibold text-text">{overview.event_name}</p><dl className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-2"><div><dt className="text-sm text-muted">Lifecycle</dt><dd className="mt-1 font-semibold">{overview.lifecycle}</dd></div><div><dt className="text-sm text-muted">Narrative phase</dt><dd className="mt-1 font-semibold">{overview.narrative_phase}</dd></div><div><dt className="text-sm text-muted">Partecipanti</dt><dd className="mt-1 text-2xl font-semibold text-primary">{overview.player_count}</dd></div><div><dt className="text-sm text-muted">Tavoli</dt><dd className="mt-1 text-2xl font-semibold text-primary">{overview.table_count}</dd></div>{overview.venue_name && <div><dt className="text-sm text-muted">Venue</dt><dd className="mt-1 font-semibold">{overview.venue_name}</dd></div>}</dl><section className="mt-10 border-t border-border pt-6" aria-labelledby="lifecycle-control-title"><h2 id="lifecycle-control-title" className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Controllo lifecycle</h2><p className="mt-2 text-sm text-muted">Stato attuale: <span className="font-semibold text-text">{overview.lifecycle}</span></p>{allowedTransitions.length > 0 ? <div className="mt-5 flex flex-wrap gap-3">{allowedTransitions.map((target) => <button key={target} className={`action ${target === 'completed' || target === 'aborted' ? 'action-secondary' : ''}`} type="button" disabled={commandPending} onClick={() => void handleTransition(target)}>{commandPending ? 'Operazione in corso…' : lifecycleActionLabel(overview.lifecycle as GameLifecycle, target)}</button>)}</div> : <p className="mt-5 text-sm text-muted">Nessuna transizione disponibile.</p>}{commandPending && <p role="status" className="mt-4 text-sm text-muted">Aggiornamento lifecycle in corso…</p>}</section></>}</div></div></PageShell>
}
