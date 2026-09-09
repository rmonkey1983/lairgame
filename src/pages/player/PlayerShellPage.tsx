import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { getMyJoinState, type PlayerJoinState } from '../../domain/player/player.join'

export default function PlayerShellPage() {
  const { gameCode } = useParams()
  const [state, setState] = useState<PlayerJoinState | null>(null)
  const [message, setMessage] = useState('Caricamento sessione…')
  useEffect(() => {
    let active = true
    void getMyJoinState(gameCode ?? '').then((result) => {
      if (!active) return
      if (!result.ok) { setMessage(result.error.userMessage); return }
      if (!result.value) { setMessage('Sessione non trovata. Ripeti il join.'); return }
      setState(result.value)
    })
    return () => { active = false }
  }, [gameCode])

  return <PageShell eyebrow="Player session" title="In attesa della Regia">
    {state ? <div className="max-w-md"><p className="text-xl font-semibold">Sei dentro.</p><p className="mt-3 text-muted">{state.nickname}</p><p className="mt-1 text-muted">Tavolo {state.table_number} · Posto {state.seat_number}</p><p className="mt-6 text-muted">Attendi l’inizio.</p></div> : <div className="max-w-md"><p className="text-muted">{message}</p><Link className="action action-secondary mt-6 w-fit" to={`/play/${gameCode}`}>Torna al join</Link></div>}
  </PageShell>
}
