function countVotes(votes) {
  return Object.values(votes).reduce(
    (acc, vote) => {
      if (vote === 'A') acc.A += 1;
      if (vote === 'B') acc.B += 1;
      return acc;
    },
    { A: 0, B: 0 }
  );
}

function getConsensusThreshold(aliveCount) {
  if (aliveCount <= 3) return Math.max(2, aliveCount);
  return Math.ceil(aliveCount * 0.66);
}

function isConsensus(votes, threshold) {
  const tally = countVotes(votes);
  return Math.max(tally.A, tally.B) >= threshold;
}

function exileVote(votes) {
  const tally = {};

  for (const targetId of Object.values(votes)) {
    tally[targetId] = (tally[targetId] || 0) + 1;
  }

  const entries = Object.entries(tally);
  if (entries.length === 0) return null;

  const maxVotes = Math.max(...entries.map(([, count]) => count));
  const candidates = entries.filter(([, count]) => count === maxVotes);

  return candidates.length === 1 ? Number(candidates[0][0]) : null;
}

function checkWinCondition(roundsConsensus, players) {
  const consensusCount = roundsConsensus.filter(Boolean).length;
  if (consensusCount >= 2) return 'order';

  const alive = players.filter((player) => player.alive);
  const orderAlive = alive.filter((player) => player.role === 'order').length;
  const chaosAlive = alive.filter((player) => player.role === 'chaos').length;

  if (chaosAlive === 0) return 'order';
  if (chaosAlive > orderAlive) return 'chaos';

  return null;
}

function includesForbiddenReveal(text) {
  return /我是\s*(守序|破坏者|破坏|好人|坏人|混乱|chaos|order)/i.test(text);
}

function shuffle(items, rng = Math.random) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function parseJsonObject(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function clampText(text, maxLength) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

module.exports = {
  clampText,
  countVotes,
  getConsensusThreshold,
  includesForbiddenReveal,
  isConsensus,
  exileVote,
  checkWinCondition,
  parseJsonObject,
  shuffle
};
