import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { runBrain } from '../../domain/brain/brain.engine'
import type { BrainMetricsContext } from '../../domain/brain/brain.metrics'
import { buildRegiaProposalFromDirector } from '../../domain/brain/brain.regia'
import { evaluateLiveDirector, type DirectorProposal, type LiveDirectorContext } from '../../domain/brain/brain.director'
import type { BrainEventStore } from '../../domain/brain/brain.events'
import type { SuspicionGraph } from '../../domain/brain/brain.suspicion'
import type { TrustGraph } from '../../domain/brain/brain.trust'
import type { BrainInput, BrainState, ScenarioTruth } from '../../domain/brain/brain.types'
import type { RegiaProposal } from '../../domain/brain/brain.regia'
import type { BrainPersistence } from './brain.persistence'
import { buildBrainAIRequest, evaluateWithBrainAI, selectDirectorProposalFromAI, type BrainAIEvaluationResult, type BrainAIProvider } from './brain.ai'

type Client = SupabaseClient

export type BrainRealtimeStatus = 'IDLE' | 'HYDRATING' | 'LIVE' | 'RECONNECTING' | 'ERROR' | 'STOPPED'
export type BrainRealtimeChangeRelevance = 'BRAIN_RELEVANT' | 'REGIA_STATUS_ONLY' | 'IRRELEVANT'

export type BrainRealtimePersistedContext = {
  events: BrainEventStore
  trustGraph: TrustGraph
  suspicionGraph: SuspicionGraph
  regiaProposals: RegiaProposal[]
}

export type BrainRealtimeContext = {
  input: BrainInput
  scenarioTruth?: ScenarioTruth
  metricsContext?: Omit<BrainMetricsContext, 'eventStore' | 'trustGraph' | 'suspicionGraph'>
  directorTables: LiveDirectorContext['tables']
  missionContext: LiveDirectorContext['missionContext']
}

export type LiveBrainSnapshot = {
  sessionId: string
  phase: BrainState['phase']
  events: BrainEventStore
  trustGraph: TrustGraph
  suspicionGraph: SuspicionGraph
  regiaProposals: RegiaProposal[]
  metrics: BrainState['metrics']
  decisions: ReturnType<typeof runBrain>['decisions']
  directorProposals: DirectorProposal[]
  revision: number
}

export type LiveBrainAIState = {
  status: 'DISABLED' | 'IDLE' | 'EVALUATING' | 'USED' | 'FALLBACK' | 'ERROR'
  evaluation?: BrainAIEvaluationResult
  selectedProposalId?: string
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH'
  explanation?: string
  evaluatedSnapshotRevision?: number
}

export type BrainRealtimeOptions = {
  loadContext: (sessionId: string) => Promise<BrainRealtimeContext>
  onSnapshot?: (snapshot: LiveBrainSnapshot) => void
  onStatus?: (status: BrainRealtimeStatus) => void
  onError?: (error: unknown, kind: 'hydration' | 'subscription' | 'reconciliation' | 'evaluation') => void
  channelFactory?: (topic: string) => RealtimeChannel
  aiEnabled?: boolean
  aiProvider?: BrainAIProvider
  aiTimeoutMs?: number
  onAIState?: (state: LiveBrainAIState) => void
}

export function classifyBrainRealtimeChange(eventName: string): BrainRealtimeChangeRelevance {
  if (eventName === 'brain_state_changed') return 'BRAIN_RELEVANT'
  if (eventName === 'brain_regia_status_changed') return 'REGIA_STATUS_ONLY'
  return 'IRRELEVANT'
}

function stableSnapshotValue(snapshot: Omit<LiveBrainSnapshot, 'revision'>): string {
  return JSON.stringify(snapshot)
}

export function meaningfulBrainAIFingerprint(snapshot: Omit<LiveBrainSnapshot, 'revision'>): string {
  return JSON.stringify({
    phase: snapshot.phase,
    decisions: snapshot.decisions.map((decision) => ({ type: decision.type, severity: decision.severity, scope: decision.scope })),
    directorProposals: snapshot.directorProposals.map((proposal) => ({ id: proposal.id, priority: proposal.priority, missionId: proposal.missionProposal?.missionId ?? null })),
  })
}

function socialEdges(trustGraph: TrustGraph, suspicionGraph: SuspicionGraph) {
  return [
    ...trustGraph.edges.map((edge) => ({ ...edge, strength: edge.strength })),
    ...suspicionGraph.edges.map((edge) => ({ ...edge })),
  ]
}

export function createLiveBrainRealtime(client: Client, persistence: BrainPersistence, sessionId: string, options: BrainRealtimeOptions) {
  let status: BrainRealtimeStatus = 'IDLE'
  let snapshot: LiveBrainSnapshot | undefined
  let snapshotFingerprint = ''
  let revision = 0
  let channel: RealtimeChannel | undefined
  let stopped = false
  let reconnecting = false
  let reloadInFlight: Promise<void> | undefined
  let latestAIFingerprint = ''
  let evaluatedAIFingerprint = ''
  let aiState: LiveBrainAIState = { status: options.aiEnabled ? 'IDLE' : 'DISABLED' }
  let aiInFlight: Promise<void> | undefined
  let pendingAIEvaluation: { snapshot: LiveBrainSnapshot; context: BrainRealtimeContext } | undefined
  options.onAIState?.(aiState)

  const setAIState = (next: LiveBrainAIState) => { aiState = next; options.onAIState?.(next) }

  const evaluateAI = async (nextSnapshot: LiveBrainSnapshot, context: BrainRealtimeContext) => {
    if (!options.aiEnabled) return
    const fingerprint = meaningfulBrainAIFingerprint(nextSnapshot)
    latestAIFingerprint = fingerprint
    if (nextSnapshot.directorProposals.length === 0 || fingerprint === evaluatedAIFingerprint) return
    if (aiInFlight) {
      pendingAIEvaluation = { snapshot: nextSnapshot, context }
      return
    }
    evaluatedAIFingerprint = fingerprint
    setAIState({ status: 'EVALUATING', evaluatedSnapshotRevision: nextSnapshot.revision })
    const request = buildBrainAIRequest({
      sessionId: nextSnapshot.sessionId,
      phase: context.input.phase,
      metrics: nextSnapshot.metrics,
      decisions: nextSnapshot.decisions,
      allowedDirectorProposals: nextSnapshot.directorProposals,
      allowedMissionProposals: nextSnapshot.directorProposals.flatMap((proposal) => proposal.missionProposal ? [proposal.missionProposal] : []),
    })
    aiInFlight = evaluateWithBrainAI(request, options.aiProvider, { aiEnabled: true, timeoutMs: options.aiTimeoutMs }).then((evaluation) => {
      if (stopped || latestAIFingerprint !== fingerprint) return
      if (evaluation.status === 'USED' || evaluation.status === 'FALLBACK') {
        const selected = selectDirectorProposalFromAI(request, evaluation)
        setAIState({ status: evaluation.status, evaluation, ...(selected ? { selectedProposalId: selected.id } : {}), confidence: evaluation.response.confidence, ...(evaluation.response.explanation ? { explanation: evaluation.response.explanation } : {}), evaluatedSnapshotRevision: nextSnapshot.revision })
      } else setAIState({ status: 'FALLBACK', evaluation, evaluatedSnapshotRevision: nextSnapshot.revision })
    }).catch(() => {
      if (!stopped && latestAIFingerprint === fingerprint) setAIState({ status: 'FALLBACK', evaluatedSnapshotRevision: nextSnapshot.revision })
    }).finally(() => {
      aiInFlight = undefined
      const pending = pendingAIEvaluation
      pendingAIEvaluation = undefined
      if (pending && !stopped) void evaluateAI(pending.snapshot, pending.context)
    })
    await aiInFlight
  }

  const setStatus = (next: BrainRealtimeStatus) => {
    status = next
    options.onStatus?.(next)
  }

  const loadAndEvaluate = async (emit: boolean) => {
    const context = await options.loadContext(sessionId)
    if (context.input.sessionId !== sessionId) throw new Error('BRAIN_SESSION_MISMATCH')
    const playerIds = context.input.players.map((player) => player.playerId)
    const [events, trustGraph, suspicionGraph, persistedProposals] = await Promise.all([
      persistence.loadBrainEvents(sessionId),
      persistence.loadTrustState(sessionId, playerIds),
      persistence.loadSuspicionState(sessionId, playerIds),
      persistence.loadRegiaProposals(sessionId),
    ])
    const metricsContext: BrainMetricsContext = {
      ...(context.metricsContext ?? {}),
      eventStore: events,
      trustGraph,
      suspicionGraph,
    }
    const evaluation = runBrain({ ...context.input, socialEdges: socialEdges(trustGraph, suspicionGraph) }, context.scenarioTruth, metricsContext)
    const directorContext: LiveDirectorContext = {
      phase: evaluation.state.phase,
      decisions: evaluation.decisions,
      players: evaluation.state.players,
      tables: context.directorTables,
      trustGraph,
      suspicionGraph,
      missionContext: { ...context.missionContext, phase: evaluation.state.phase, players: evaluation.state.players, trustGraph, suspicionGraph },
    }
    const directorProposals = evaluateLiveDirector(directorContext)
    const nextProposals = [...persistedProposals]
    for (const directorProposal of directorProposals) {
      const prepared = buildRegiaProposalFromDirector(directorProposal, directorContext)
      if (!prepared.valid || nextProposals.some((proposal) => proposal.id === prepared.proposal.id)) continue
      nextProposals.push(await persistence.saveRegiaProposal(sessionId, prepared.proposal, directorContext))
    }
    nextProposals.sort((a, b) => a.id.localeCompare(b.id))
    const next: Omit<LiveBrainSnapshot, 'revision'> = {
      sessionId,
      phase: evaluation.state.phase,
      events,
      trustGraph,
      suspicionGraph,
      regiaProposals: nextProposals,
      metrics: evaluation.state.metrics,
      decisions: evaluation.decisions,
      directorProposals,
    }
    const fingerprint = stableSnapshotValue(next)
    if (fingerprint !== snapshotFingerprint || !snapshot) {
      revision += 1
      snapshotFingerprint = fingerprint
      snapshot = { ...next, revision }
      if (emit) options.onSnapshot?.(snapshot)
    }
    if (snapshot) void evaluateAI(snapshot, context)
  }

  const reconcile = async (kind: 'hydration' | 'reconciliation' | 'evaluation') => {
    if (stopped) return
    if (reloadInFlight) return reloadInFlight
    setStatus(kind === 'hydration' ? 'HYDRATING' : status === 'LIVE' ? 'LIVE' : 'RECONNECTING')
    reloadInFlight = loadAndEvaluate(true)
      .catch((error) => {
        setStatus('ERROR')
        options.onError?.(error, kind)
      })
      .finally(() => {
        reloadInFlight = undefined
      })
    return reloadInFlight
  }

  const subscribe = async () => {
    if (stopped || channel) return
    const { data, error } = await client.auth.getSession()
    if (error || !data.session?.access_token) throw error ?? new Error('BRAIN_REALTIME_AUTH_MISSING')
    await client.realtime.setAuth(data.session.access_token)
    if (stopped) return
    const nextChannel = (options.channelFactory ?? ((topic) => client.channel(topic, { config: { private: true } })))(`brain:${sessionId}`)
      .on('broadcast', { event: 'brain_state_changed' }, () => {
        if (!stopped && classifyBrainRealtimeChange('brain_state_changed') === 'BRAIN_RELEVANT') void reconcile('reconciliation')
      })
    channel = nextChannel
    nextChannel.subscribe((nextStatus) => {
      if (stopped) return
      if (nextStatus === 'SUBSCRIBED') {
        setStatus('LIVE')
        void reconcile('reconciliation')
      } else if (nextStatus === 'TIMED_OUT' || nextStatus === 'CLOSED' || nextStatus === 'CHANNEL_ERROR') {
        setStatus('RECONNECTING')
        void reconnect()
      }
    })
  }

  const reconnect = async () => {
    if (stopped || reconnecting) return
    reconnecting = true
    const oldChannel = channel
    channel = undefined
    if (oldChannel) await client.removeChannel(oldChannel)
    try {
      await reconcile('reconciliation')
      await subscribe()
    } catch (error) {
      setStatus('ERROR')
      options.onError?.(error, 'subscription')
    } finally {
      reconnecting = false
    }
  }

  return {
    start: async () => {
      if (stopped || status !== 'IDLE') return
      try {
        await reconcile('hydration')
        await subscribe()
      } catch (error) {
        setStatus('ERROR')
        options.onError?.(error, 'subscription')
      }
    },
    stop: async () => {
      stopped = true
      setStatus('STOPPED')
      const oldChannel = channel
      channel = undefined
      if (oldChannel) await client.removeChannel(oldChannel)
      pendingAIEvaluation = undefined
    },
    refresh: () => reconcile('reconciliation'),
    getSnapshot: () => snapshot,
    getStatus: () => status,
  }
}
