import { describe, it, expect } from 'vitest';
import { assignStory, pickRandomLiar, tallyVotes } from './gameLogic';

describe('gameLogic', () => {
  it('returns null if no players are provided', () => {
    expect(pickRandomLiar([])).toBeNull();
    expect(pickRandomLiar(null)).toBeNull();
  });

  it('returns fallback story for empty stories list', () => {
    expect(assignStory([])).toBe("C'era una volta un bugiardo...");
  });

  it('tallies string vote format', () => {
    const votes = {
      alice: 'Marco',
      bob: 'Luca',
      carol: 'Marco',
    };

    expect(tallyVotes(votes)).toEqual({
      Marco: 2,
      Luca: 1,
    });
  });

  it('tallies object vote format used by session hooks', () => {
    const votes = {
      alice: { target: 'Marco', timestamp: '2026-01-01T12:00:00.000Z' },
      bob: { target: 'Luca', timestamp: '2026-01-01T12:00:01.000Z' },
      carol: { target: 'Marco', timestamp: '2026-01-01T12:00:02.000Z' },
    };

    expect(tallyVotes(votes)).toEqual({
      Marco: 2,
      Luca: 1,
    });
  });
});
