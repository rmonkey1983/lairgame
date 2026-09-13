import type { RealtimeChannel } from '@supabase/supabase-js'
import { playerSupabaseClient } from '../../lib/supabase/player-client'

export type PlayerRealtimeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED'

export function subscribeToPlayerGameState(
  gameId: string,
  onStateChanged: () => void,
  onStatus?: (status: PlayerRealtimeStatus) => void,
): () => void {
  const client = playerSupabaseClient
  if (!client || !gameId) return () => undefined
  let closed = false
  const channel: RealtimeChannel = client
    .channel(`game:${gameId}`, { config: { private: true } })
    .on('broadcast', { event: 'game_state_changed' }, () => {
      if (!closed) onStateChanged()
    })
    .on('broadcast', { event: 'mission_state_changed' }, () => {
      if (!closed) onStateChanged()
    })

  void (async () => {
    const { data, error } = await client.auth.getSession()
    if (closed || error || !data.session?.access_token) return
    try {
      await client.realtime.setAuth(data.session.access_token)
    } catch {
      return
    }
    if (closed) return
    channel.subscribe((status) => {
      if (!closed && (status === 'SUBSCRIBED' || status === 'TIMED_OUT' || status === 'CLOSED')) onStatus?.(status)
    })
  })()

  return () => {
    closed = true
    void client.removeChannel(channel)
  }
}
