/**
 * Selects a random player to be the liar.
 */
export const pickRandomLiar = (players) => {
  if (!players || players.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * players.length);
  return players[randomIndex];
};

/**
 * Assigns a random story from a list of stories.
 */
export const assignStory = (stories) => {
  if (!stories || stories.length === 0) return "C'era una volta un bugiardo...";
  const randomIndex = Math.floor(Math.random() * stories.length);
  return stories[randomIndex];
};

/**
 * Tallies votes and returns the results.
 */
export const tallyVotes = (votes) => {
  if (!votes) return {};
  const results = {};
  Object.values(votes).forEach(vote => {
    const target = typeof vote === 'string' ? vote : vote?.target;
    if (!target) return;
    results[target] = (results[target] || 0) + 1;
  });
  return results;
};
