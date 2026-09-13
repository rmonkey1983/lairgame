import { useEffect, useRef, useState } from 'react'
import type { BrainPersistence } from './brain.persistence'
import type { BrainAIProvider } from './brain.ai'
import { createLiveBrainRealtime, type BrainRealtimeContext, type BrainRealtimeStatus, type LiveBrainAIState, type LiveBrainSnapshot } from './brain.realtime'

export type LiveBrainRuntimeState = {
  status: BrainRealtimeStatus
  snapshot: LiveBrainSnapshot | null
  error: unknown
  aiState: LiveBrainAIState
}

export type LiveBrainConfig = {
  client: Parameters<typeof createLiveBrainRealtime>[0]
  persistence: BrainPersistence
  sessionId: string
  loadContext: (sessionId: string) => Promise<BrainRealtimeContext>
  aiEnabled?: boolean
  aiProvider?: BrainAIProvider
  aiTimeoutMs?: number
}

export function useLiveBrain(config: LiveBrainConfig | null): LiveBrainRuntimeState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<LiveBrainRuntimeState>({ status: 'IDLE', snapshot: null, error: null, aiState: { status: 'DISABLED' } })
  const bridgeRef = useRef<ReturnType<typeof createLiveBrainRealtime> | null>(null)

  useEffect(() => {
    let active = true
    if (!config) {
      return () => { active = false }
    }
    const bridge = createLiveBrainRealtime(config.client, config.persistence, config.sessionId, {
      loadContext: config.loadContext,
      onSnapshot: (snapshot) => { if (active) setState((current) => ({ ...current, snapshot, error: null })) },
      onStatus: (status) => { if (active) setState((current) => ({ ...current, status })) },
      onError: (error) => { if (active) setState((current) => ({ ...current, error })) },
      aiEnabled: config.aiEnabled,
      aiProvider: config.aiProvider,
      aiTimeoutMs: config.aiTimeoutMs,
      onAIState: (aiState) => { if (active) setState((current) => ({ ...current, aiState })) },
    })
    bridgeRef.current = bridge
    void bridge.start()
    return () => { active = false; bridgeRef.current = null; void bridge.stop() }
  }, [config])

  return { ...(config ? state : { status: 'IDLE' as const, snapshot: null, error: null, aiState: { status: 'DISABLED' as const } }), refresh: async () => { await bridgeRef.current?.refresh() } }
}
