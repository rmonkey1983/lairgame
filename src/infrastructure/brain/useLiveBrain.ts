import { useEffect, useRef, useState } from 'react'
import type { BrainPersistence } from './brain.persistence'
import { createLiveBrainRealtime, type BrainRealtimeContext, type BrainRealtimeStatus, type LiveBrainSnapshot } from './brain.realtime'

export type LiveBrainRuntimeState = {
  status: BrainRealtimeStatus
  snapshot: LiveBrainSnapshot | null
  error: unknown
}

export type LiveBrainConfig = {
  client: Parameters<typeof createLiveBrainRealtime>[0]
  persistence: BrainPersistence
  sessionId: string
  loadContext: (sessionId: string) => Promise<BrainRealtimeContext>
}

export function useLiveBrain(config: LiveBrainConfig | null): LiveBrainRuntimeState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<LiveBrainRuntimeState>({ status: 'IDLE', snapshot: null, error: null })
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
    })
    bridgeRef.current = bridge
    void bridge.start()
    return () => { active = false; bridgeRef.current = null; void bridge.stop() }
  }, [config])

  return { ...(config ? state : { status: 'IDLE' as const, snapshot: null, error: null }), refresh: async () => { await bridgeRef.current?.refresh() } }
}
