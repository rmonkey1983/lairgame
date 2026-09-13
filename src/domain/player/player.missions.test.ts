import { describe, expect, it } from 'vitest'
import { getPlayerMissionInstruction } from './player.missions'

describe('Player mission delivery', () => {
  it('maps instructions deterministically without mutating input', () => {
    const mission = { type: 'QUESTION_PLAYER' as const, targetPlayerId: 'P12' }
    expect(getPlayerMissionInstruction(mission)).toBe('Fai una domanda a P12 per chiarire un dubbio.')
    expect(mission).toEqual({ type: 'QUESTION_PLAYER', targetPlayerId: 'P12' })
  })
  it('supports missions without a target', () => expect(getPlayerMissionInstruction({ type: 'WITHHOLD_INFORMATION' })).toBe('Ascolta con attenzione e conserva per te un’informazione.'))
})
