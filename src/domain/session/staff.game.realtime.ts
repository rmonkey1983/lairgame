import type { RealtimeChannel } from '@supabase/supabase-js'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'

export type StaffGameRealtimeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED'

export function subscribeToStaffGameState(
  gameId: string,
  onStateChanged: () => void,
  onStatus?: (status: StaffGameRealtimeStatus) => void,
): () => void {
  const client = staffSupabaseClient
  if (!client || !gameId) return () => undefined

  let closed = false
  const channel: RealtimeChannel = client
    .channel(`game:${gameId}`, { config: { private: true } })
    .on('broadcast', { event: 'game_state_changed' }, () => {
      if (!closed) onStateChanged()
    })
    .on('broadcast', { event: 'role_acknowledgement_changed' }, () => {
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
      if (closed) return
      if (status === 'SUBSCRIBED' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus?.(status)
    })
  })()

  return () => {
    closed = true
    void client.removeChannel(channel)
  }
}
