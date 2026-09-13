import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrainRegiaPanel } from './BrainRegiaPanel'
import type { LiveBrainSnapshot } from '../../infrastructure/brain/brain.realtime'

const snapshot = {
  sessionId: 'game-1', revision: 1, events: { sessionId: 'game-1', nextSequence: 1, events: [] },
  trustGraph: { playerIds: [], edges: [], history: [] }, suspicionGraph: { playerIds: [], edges: [], history: [] },
  metrics: { liarExposure: null, roleExposure: { liar: null, accomplice: null, scapegoat: null }, theoryDiversity: null, participationBalance: null, trustCoverage: null, trustConcentration: null, suspicionCoverage: null, theoryShiftRate: null, averageTheoryChanges: null, liarConfidence: null, playerActivity: [], tableMetrics: [{ tableId: 'table-1', suspicionCoverage: null, theoryDiversity: null, participationBalance: null }] },
  decisions: [], directorProposals: [], regiaProposals: [],
} as unknown as LiveBrainSnapshot

describe('BrainRegiaPanel', () => {
  it('renders authoritative null metrics as insufficient data and exposes pending suggest actions', () => {
    render(<BrainRegiaPanel status="LIVE" aiState={{ status: 'DISABLED' }} snapshot={{ ...snapshot, regiaProposals: [{ id: 'p1', controlMode: 'SUGGEST', status: 'PENDING', commandType: 'CHECK_TABLE', payload: { commandType: 'CHECK_TABLE', scope: { type: 'SESSION' } } }] }} error={null} onApprove={vi.fn()} onReject={vi.fn()} onExecute={vi.fn()} />)
    expect(screen.getAllByText('Dati insufficienti')).toHaveLength(6)
    expect(screen.getByText(/Sospetti Dati insufficienti/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approva' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rifiuta' })).toBeInTheDocument()
  })
})
