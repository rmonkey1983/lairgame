import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { getMyPlayerState, isPlayerNotJoined, type PlayerGameState } from '../../domain/player/player.state'
import { acknowledgeMyRole } from '../../domain/player/player.role'
import { subscribeToPlayerGameState } from '../../domain/player/player.realtime'
import { acknowledgeMyMission, getPlayerMissionInstruction, loadMyActiveMissions, type PlayerActiveMission } from '../../domain/player/player.missions'

export default function PlayerShellPage() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<PlayerGameState | null>(null)
  const [message, setMessage] = useState('Caricamento sessione…')
  const [ackPending, setAckPending] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)
  const [missions, setMissions] = useState<PlayerActiveMission[]>([])
  const [missionError, setMissionError] = useState<string | null>(null)
  const [missionAckPending, setMissionAckPending] = useState(false)

  const returnToJoin = useCallback(() => {
    setState(null)
    setAckError(null)
    setMissions([])
    setMissionError(null)
    setMissionAckPending(false)
    navigate(`/play/${gameCode}`, { replace: true })
  }, [gameCode, navigate])

  const applyAuthoritativeState = useCallback((result: Awaited<ReturnType<typeof getMyPlayerState>>) => {
    if (isPlayerNotJoined(result)) {
      returnToJoin()
      return
    }
    if (result.ok && result.value) setState(result.value)
    else if (!result.ok) setMessage(result.error.userMessage)
  }, [returnToJoin])

  const refetchMissions = useCallback(() => {
    if (!gameCode) return
    void loadMyActiveMissions(gameCode).then((result) => {
      if (result.ok) {
        setMissions(result.value)
        setMissionError(null)
      } else setMissionError(result.error.userMessage)
    })
  }, [gameCode])

  async function handleMissionAcknowledge(mission: PlayerActiveMission) {
    if (!gameCode || missionAckPending || mission.acknowledgedAt) return
    setMissionAckPending(true)
    const result = await acknowledgeMyMission(gameCode, mission.missionId)
    if (result.ok) refetchMissions()
    else setMissionError(result.error.userMessage)
    setMissionAckPending(false)
  }

  useEffect(() => {
    let active = true
    void getMyPlayerState(gameCode ?? '').then((result) => {
      if (!active) return
      applyAuthoritativeState(result)
      if (result.ok) refetchMissions()
    })
    return () => { active = false }
  }, [applyAuthoritativeState, gameCode, refetchMissions])

  async function handleAcknowledge() {
    if (!gameCode || ackPending || state?.role_acknowledged) return
    setAckPending(true)
    setAckError(null)
    const result = await acknowledgeMyRole(gameCode)
    if (!result.ok) setAckError(result.error.userMessage)
    else {
      const fresh = await getMyPlayerState(gameCode)
      applyAuthoritativeState(fresh)
    }
    setAckPending(false)
  }

  const refetch = useCallback(() => {
    void getMyPlayerState(gameCode ?? '').then((result) => {
      applyAuthoritativeState(result)
    })
    refetchMissions()
  }, [applyAuthoritativeState, gameCode, refetchMissions])

  useEffect(() => {
    const handleFocus = () => refetch()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refetch])

  useEffect(() => {
    if (!state?.game_id) return undefined
    return subscribeToPlayerGameState(state.game_id, refetch)
  }, [refetch, state?.game_id])

  const title = state?.narrative_phase === 'briefing' ? 'Briefing'
    : state?.narrative_phase === 'discovery' ? 'Scoperta'
    : state?.narrative_phase === 'comparison' ? 'Confronto'
    : state?.narrative_phase === 'pressure' ? 'Pressione'
    : state?.narrative_phase === 'deliberation' ? 'Deliberazione'
    : state?.narrative_phase === 'final_vote' ? 'Voto finale'
    : state?.narrative_phase === 'reveal' ? 'Rivelazione'
    : state?.narrative_phase === 'lobby' ? 'In attesa della Regia' : 'Il tuo ruolo'

  function renderContent() {
    if (!state) return null
    if (['deliberation', 'final_vote', 'reveal'].includes(state.narrative_phase)) return <section aria-labelledby="waiting-title"><h2 id="waiting-title" className="text-3xl font-semibold text-primary">Segui la Regia</h2><p className="mt-6 leading-7 text-text">La prossima istruzione arriverà dalla Regia.</p></section>
    if (state.narrative_phase === 'briefing') return <section aria-labelledby="briefing-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">{state.scenario_title}</p><h2 id="briefing-title" className="mt-3 text-3xl font-semibold text-primary">{state.briefing_title}</h2><p className="mt-6 whitespace-pre-wrap leading-7 text-text">{state.briefing_body}</p></section>
    if (state.narrative_phase === 'discovery') return <section aria-labelledby="discovery-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">{state.scenario_title}</p><h2 id="discovery-title" className="mt-3 text-3xl font-semibold text-primary">{state.discovery_title}</h2><p className="mt-6 whitespace-pre-wrap leading-7 text-text">{state.discovery_body}</p>{state.clue_title && state.clue_body && <section className="mt-10 border-t border-border pt-6" aria-labelledby="player-clue-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Il vostro frammento</p><h3 id="player-clue-title" className="mt-2 text-2xl font-semibold text-primary">{state.clue_title}</h3><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.clue_body}</p></section>}</section>
    if (state.narrative_phase === 'comparison') return <section aria-labelledby="comparison-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">{state.scenario_title}</p><h2 id="comparison-title" className="mt-3 text-3xl font-semibold text-primary">{state.comparison_title}</h2><p className="mt-6 whitespace-pre-wrap leading-7 text-text">{state.comparison_body}</p>{state.clue_title && state.clue_body && <section className="mt-10 border-t border-border pt-6" aria-labelledby="comparison-clue-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Il vostro frammento</p><h3 id="comparison-clue-title" className="mt-2 text-2xl font-semibold text-primary">{state.clue_title}</h3><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.clue_body}</p></section>}<section className="mt-10 border-t border-border pt-6" aria-labelledby="comparison-route-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Tavolo obiettivo</p><h3 id="comparison-route-title" className="mt-2 text-2xl font-semibold text-primary">Tavolo {state.comparison_target_table_number}</h3><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.comparison_instruction}</p></section></section>
    if (state.narrative_phase === 'pressure') return <section aria-labelledby="pressure-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">{state.scenario_title}</p><h2 id="pressure-title" className="mt-3 text-3xl font-semibold text-primary">{state.pressure_title}</h2><p className="mt-6 whitespace-pre-wrap leading-7 text-text">{state.pressure_body}</p>{state.clue_title && state.clue_body && <section className="mt-10 border-t border-border pt-6" aria-labelledby="pressure-clue-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Il vostro frammento</p><h3 id="pressure-clue-title" className="mt-2 text-2xl font-semibold text-primary">{state.clue_title}</h3><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.clue_body}</p></section>}<section className="mt-10 border-t border-border pt-6" aria-labelledby="pressure-route-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Tavolo sotto pressione</p><h3 id="pressure-route-title" className="mt-2 text-2xl font-semibold text-primary">Tavolo {state.pressure_target_table_number}</h3><p className="mt-2 font-semibold text-primary">{state.pressure_route_title}</p><p className="mt-4 whitespace-pre-wrap leading-7 text-text">{state.pressure_instruction}</p></section></section>
    if (state.narrative_phase === 'lobby' || !state.role) return <><p className="text-xl font-semibold">Sei dentro.</p><p className="mt-6 text-muted">Attendi l’inizio.</p></>
    return <><p className="text-sm uppercase tracking-[0.16em] text-muted">Il tuo ruolo privato</p><p className="mt-3 text-4xl font-semibold text-primary">{state.role === 'liar' ? 'Bugiardo' : state.role === 'accomplice' ? 'Complice' : 'Investigatore'}</p>{state.role_acknowledged ? <p className="mt-6 text-success">Ruolo confermato. Attendi la Regia.</p> : <><button className="action mt-6" type="button" disabled={ackPending} onClick={() => void handleAcknowledge()}>{ackPending ? 'Conferma in corso…' : 'Ho capito il mio ruolo'}</button>{ackError && <p role="alert" className="mt-3 text-danger">{ackError}</p>}</>}</>
  }

  return <PageShell eyebrow="Player session" title={title}>
    {state ? <div className="player-session max-w-2xl"><div className="player-session-bar"><span className="player-live"><i aria-hidden="true" /> LIVE</span><span className="player-identity">{state.nickname}</span><span className="player-placement">{`Tavolo ${state.table_number} · Posto ${state.seat_number}`}</span></div><div className="player-stage">{renderContent()}<section className="mt-10 border-t border-border pt-6" aria-labelledby="mission-title"><p className="text-sm uppercase tracking-[0.16em] text-muted">Missione</p>{missions[0] ? <div className="mt-3"><h2 id="mission-title" className="text-2xl font-semibold text-primary">{getPlayerMissionInstruction(missions[0])}</h2>{missions[0].targetPlayerId && <p className="mt-3 text-muted">Obiettivo: {missions[0].targetPlayerId}</p>}<p className="mt-3 text-sm text-muted">Fase: {missions[0].phase}</p>{missions[0].acknowledgedAt ? <p className="mt-4 text-sm text-success">Missione attiva</p> : <button className="action mt-4" type="button" disabled={missionAckPending} onClick={() => void handleMissionAcknowledge(missions[0])}>{missionAckPending ? 'Conferma in corso…' : 'HO CAPITO'}</button>}</div> : <p id="mission-title" className="mt-3 text-muted">Nessuna missione attiva.</p>}{missionError && <p className="mt-3 text-sm text-muted" role="status">Missione non disponibile in questo momento.</p>}</section></div><div className="player-session-footer"><span>Sessione attiva</span></div></div> : <div className="max-w-md"><p className="text-muted">{message}</p><Link className="action action-secondary form-action mt-6 w-fit" to={`/play/${gameCode}`}>Torna al join</Link></div>}
  </PageShell>
}
