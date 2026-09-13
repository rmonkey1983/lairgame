import { describe, expect, it, vi } from 'vitest'
import { createBrainEventStore } from '../../domain/brain/brain.events'
import { createSuspicionGraph } from '../../domain/brain/brain.suspicion'
import { createTrustGraph } from '../../domain/brain/brain.trust'
import type { BrainPersistence } from './brain.persistence'
import { createLiveBrainRealtime, classifyBrainRealtimeChange, type BrainRealtimeContext } from './brain.realtime'

const sessionId = '00000000-0000-4000-8000-000000000001'
const player = {
  playerId: 'p1', socialStyle: 'balanced' as const, exposureLevel: 'medium' as const,
  participationLevel: 'medium' as const, arrivedWithPlayerIds: [], strategyPreference: 'mixed' as const,
  sources: { socialStyle: 'defaulted' as const, exposureLevel: 'defaulted' as const, participationLevel: 'defaulted' as const, strategyPreference: 'defaulted' as const },
}

function context(): BrainRealtimeContext {
  return {
    input: { sessionId, phase: 'INVESTIGATION', players: [player], tables: [{ tableId: 't1', playerIds: ['p1'] }] },
    directorTables: [{ tableId: 't1', playerIds: ['p1'], score: 1, metrics: { socialBalance: 1, participationBalance: 1, existingGroupBalance: 1 }, warnings: [] }],
    missionContext: { phase: 'INVESTIGATION', players: [player], trustGraph: createTrustGraph(['p1']), suspicionGraph: createSuspicionGraph(['p1']) },
  }
}

function persistence(): BrainPersistence {
  return {
    loadBrainEvents: vi.fn(async () => createBrainEventStore(sessionId)),
    appendBrainEvent: vi.fn(),
    loadTrustState: vi.fn(async () => createTrustGraph(['p1'])),
    setTrust: vi.fn(),
    loadSuspicionState: vi.fn(async () => createSuspicionGraph(['p1'])),
    setSuspicion: vi.fn(),
    loadRegiaProposals: vi.fn(async () => []),
    loadMissionOutcomes: vi.fn(async () => []),
    saveRegiaProposal: vi.fn(),
    approveRegiaProposal: vi.fn(),
    rejectRegiaProposal: vi.fn(),
    executeApprovedProposal: vi.fn(),
  }
}

function client() {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((callback: (status: string) => void) => { callback('SUBSCRIBED'); return channel }),
  }
  return {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'staff-token' } }, error: null })) },
    realtime: { setAuth: vi.fn(async () => undefined) },
    removeChannel: vi.fn(async () => 'ok'),
    channel: vi.fn(() => channel),
    channelRef: channel,
  }
}

describe('Brain Realtime Integration v0.14', () => {
  it('hydrates before becoming live, scopes the topic, and refreshes on a relevant event', async () => {
    const fakeClient = client()
    const store = persistence()
    const snapshots: unknown[] = []
    const bridge = createLiveBrainRealtime(fakeClient as never, store, sessionId, { loadContext: async () => context(), onSnapshot: (value) => snapshots.push(value) })
    await bridge.start()
    expect(fakeClient.realtime.setAuth).toHaveBeenCalledWith('staff-token')
    expect(fakeClient.channel).toHaveBeenCalledWith(`brain:${sessionId}`, { config: { private: true } })
    expect(snapshots).toHaveLength(1)
    const handler = fakeClient.channelRef.on.mock.calls[0]?.[2]
    handler?.()
    await Promise.resolve()
    expect(store.loadBrainEvents).toHaveBeenCalledTimes(2)
    expect(bridge.getStatus()).toBe('LIVE')
  })

  it('deduplicates repeated notifications and keeps deterministic proposals out of execution', async () => {
    const fakeClient = client()
    const store = persistence()
    const execute = vi.fn()
    const snapshots: Array<{ revision: number }> = []
    const bridge = createLiveBrainRealtime(fakeClient as never, store, sessionId, { loadContext: async () => context(), onSnapshot: (value) => snapshots.push(value), onError: execute })
    await bridge.start()
    const handler = fakeClient.channelRef.on.mock.calls[0]?.[2]
    handler?.(); handler?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(snapshots.map((value) => value.revision)).toEqual([1])
    expect(execute).not.toHaveBeenCalled()
    expect(store.saveRegiaProposal).not.toHaveBeenCalled()
  })

  it('reconciles after reconnect and cleans the old channel when stopped or switched', async () => {
    const fakeClient = client()
    const store = persistence()
    const bridge = createLiveBrainRealtime(fakeClient as never, store, sessionId, { loadContext: async () => context() })
    await bridge.start()
    const statusCallback = fakeClient.channelRef.subscribe.mock.calls[0]?.[0]
    statusCallback?.('TIMED_OUT')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fakeClient.removeChannel).toHaveBeenCalled()
    await bridge.stop()
    expect(bridge.getStatus()).toBe('STOPPED')
  })

  it('classifies only the bridge event as Brain-relevant', () => {
    expect(classifyBrainRealtimeChange('brain_state_changed')).toBe('BRAIN_RELEVANT')
    expect(classifyBrainRealtimeChange('brain_regia_status_changed')).toBe('REGIA_STATUS_ONLY')
    expect(classifyBrainRealtimeChange('game_state_changed')).toBe('IRRELEVANT')
  })
})
