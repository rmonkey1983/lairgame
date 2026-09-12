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

  const title = state?.narrative_phase === 'briefing' ? 'Briefing'
    : state?.narrative_phase === 'discovery' ? 'Scoperta'
    : state?.narrative_phase === 'comparison' ? 'Confronto'
    : state?.narrative_phase === 'pressure' ? 'Pressione'
    : state?.narrative_phase === 'auction' ? 'Asta in corso'
    : state?.narrative_phase === 'lobby' ? 'In attesa della Regia' : 'Il tuo ruolo'

  function renderContent() {
    if (!state) return null
    if (state.narrative_phase === 'auction') return <section aria-labelledby="auction-title"><h2 id="auction-title" className="text-3xl font-semibold text-primary">Asta in corso</h2><p className="mt-6 leading-7 text-text">Segui la Regia e resta nel gioco.</p></section>
    if (state.narrative_phase === 'briefing') return <section aria-labelledby="briefing-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">{state.scenario_title}</p><h2 id="briefing-title" className="mt-3 text-3xl font-semibold text-primary">{state.briefing_title}</h2><p className="mt-6 whitespace-pre-wrap leading-7 text-text">{state.briefing_body}</p></section>
    if (state.narrative_phase === 'discovery') return <section aria-labelledby="discovery-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">{state.scenario_title}</p><h2 id="discovery-title" className="mt-3 text-3xl font-semibold text-primary">{state.discovery_title}</h2><p className="mt-6 whitespace-pre-wrap leading-7 text-text">{state.discovery_body}</p>{state.clue_title && state.clue_body && <section className="mt-10 border-t border-border pt-6" aria-labelledby="player-clue-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Il vostro frammento</p><h3 id="player-clue-title" className="mt-2 text-2xl font-semibold text-primary">{state.clue_title}</h3><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.clue_body}</p></section>}</section>
    if (state.narrative_phase === 'comparison') return <section aria-labelledby="comparison-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">{state.scenario_title}</p><h2 id="comparison-title" className="mt-3 text-3xl font-semibold text-primary">{state.comparison_title}</h2><p className="mt-6 whitespace-pre-wrap leading-7 text-text">{state.comparison_body}</p>{state.clue_title && state.clue_body && <section className="mt-10 border-t border-border pt-6" aria-labelledby="comparison-clue-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Il vostro frammento</p><h3 id="comparison-clue-title" className="mt-2 text-2xl font-semibold text-primary">{state.clue_title}</h3><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.clue_body}</p></section>}<section className="mt-10 border-t border-border pt-6" aria-labelledby="comparison-route-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Tavolo obiettivo</p><h3 id="comparison-route-title" className="mt-2 text-2xl font-semibold text-primary">Tavolo {state.comparison_target_table_number}</h3><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.comparison_instruction}</p></section></section>
    if (state.narrative_phase === 'pressure') return <section aria-labelledby="pressure-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">{state.scenario_title}</p><h2 id="pressure-title" className="mt-3 text-3xl font-semibold text-primary">{state.pressure_title}</h2><p className="mt-6 whitespace-pre-wrap leading-7 text-text">{state.pressure_body}</p>{state.clue_title && state.clue_body && <section className="mt-10 border-t border-border pt-6" aria-labelledby="pressure-clue-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Il vostro frammento</p><h3 id="pressure-clue-title" className="mt-2 text-2xl font-semibold text-primary">{state.clue_title}</h3><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.clue_body}</p></section>}<section className="mt-10 border-t border-border pt-6" aria-labelledby="pressure-route-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Tavolo sotto pressione</p><h3 id="pressure-route-title" className="mt-2 text-2xl font-semibold text-primary">Tavolo {state.pressure_target_table_number}</h3><p className="mt-2 font-semibold text-primary">{state.pressure_route_title}</p><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.pressure_instruction}</p></section></section>
    if (state.narrative_phase === 'lobby' || !state.role) return <><p className="text-xl font-semibold">Sei dentro.</p><p className="mt-6 text-muted">Attendi l’inizio.</p></>
    return <><p className="text-sm uppercase tracking-[0.16em] text-muted">Il tuo ruolo privato</p><p className="mt-3 text-4xl font-semibold text-primary">{state.role === 'liar' ? 'Bugiardo' : state.role === 'accomplice' ? 'Complice' : 'Investigatore'}</p>{state.role_acknowledged ? <p className="mt-6 text-success">Ruolo confermato. Attendi la Regia.</p> : <><button className="action mt-6" type="button" disabled={ackPending} onClick={() => void handleAcknowledge()}>{ackPending ? 'Conferma in corso…' : 'Ho capito il mio ruolo'}</button>{ackError && <p role="alert" className="mt-3 text-danger">{ackError}</p>}</>}</>
  }

  return <PageShell eyebrow="Player session" title={title}>
    {state ? <div className="max-w-md">{renderContent()}<p className="mt-3 text-muted">{state.nickname}</p><p className="mt-1 text-muted">Tavolo {state.table_number} · Posto {state.seat_number}</p><p className="mt-1 text-muted">BBL Coin tavolo: {state.table_coin_balance}</p></div> : <div className="max-w-md"><p className="text-muted">{message}</p><Link className="action action-secondary mt-6 w-fit" to={`/play/${gameCode}`}>Torna al join</Link></div>}
  </PageShell>
}
