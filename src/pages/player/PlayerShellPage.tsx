import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { getMyPlayerState, type PlayerGameState } from '../../domain/player/player.state'
import { acknowledgeMyRole } from '../../domain/player/player.role'
import { subscribeToPlayerGameState } from '../../domain/player/player.realtime'

export default function PlayerShellPage() {
  const { gameCode } = useParams()
  const [state, setState] = useState<PlayerGameState | null>(null)
  const [message, setMessage] = useState('Caricamento sessione…')
  const [ackPending, setAckPending] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void getMyPlayerState(gameCode ?? '').then((result) => {
      if (!active) return
      if (!result.ok) { setMessage(result.error.userMessage); return }
      if (!result.value) { setMessage('Sessione non trovata. Ripeti il join.'); return }
      setState(result.value)
    })
    return () => { active = false }
  }, [gameCode])

  async function handleAcknowledge() {
    if (!gameCode || ackPending || state?.role_acknowledged) return
    setAckPending(true)
    setAckError(null)
    const result = await acknowledgeMyRole(gameCode)
    if (!result.ok) setAckError(result.error.userMessage)
    else {
      const fresh = await getMyPlayerState(gameCode)
      if (fresh.ok && fresh.value) setState(fresh.value)
    }
    setAckPending(false)
  }

  const refetch = useCallback(() => {
    void getMyPlayerState(gameCode ?? '').then((result) => {
      if (result.ok && result.value) setState(result.value)
    })
  }, [gameCode])

  useEffect(() => {
    if (!state?.game_id) return undefined
    return subscribeToPlayerGameState(state.game_id, refetch)
  }, [refetch, state?.game_id])

  return <PageShell eyebrow="Player session" title={state?.narrative_phase === 'lobby' ? 'In attesa della Regia' : 'Il tuo ruolo'}>
    {state ? <div className="max-w-md">
      {state.narrative_phase === 'lobby' || !state.role ? <><p className="text-xl font-semibold">Sei dentro.</p><p className="mt-6 text-muted">Attendi l’inizio.</p></> : <><p className="text-sm uppercase tracking-[0.16em] text-muted">Il tuo ruolo privato</p><p className="mt-3 text-4xl font-semibold text-primary">{state.role === 'liar' ? 'Bugiardo' : state.role === 'accomplice' ? 'Complice' : 'Investigatore'}</p>{state.role_acknowledged ? <p className="mt-6 text-success">Ruolo confermato. Attendi la Regia.</p> : <><button className="action mt-6" type="button" disabled={ackPending} onClick={() => void handleAcknowledge()}>{ackPending ? 'Conferma in corso…' : 'Ho capito il mio ruolo'}</button>{ackError && <p role="alert" className="mt-3 text-danger">{ackError}</p>}</>}</>}
      <p className="mt-3 text-muted">{state.nickname}</p><p className="mt-1 text-muted">Tavolo {state.table_number} · Posto {state.seat_number}</p>
    </div> : <div className="max-w-md"><p className="text-muted">{message}</p><Link className="action action-secondary mt-6 w-fit" to={`/play/${gameCode}`}>Torna al join</Link></div>}
  </PageShell>
}
