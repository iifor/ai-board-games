function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function countTargets(votes) {
  const tally = new Map();
  votes.forEach(v => { tally.set(v, (tally.get(v) || 0) + 1); });
  return tally;
}

function topTarget(tally) {
  let best = null;
  let bestCount = 0;
  for (const [id, count] of tally) {
    if (count > bestCount) { best = id; bestCount = count; }
  }
  return best;
}

function topExile(tally, aliveIds) {
  const filtered = new Map();
  for (const [id, count] of tally) {
    if (aliveIds.includes(id)) filtered.set(id, count);
  }
  return topTarget(filtered);
}

function getNextAliveId(players, startId) {
  const alive = players.filter(p => p.alive);
  const idx = alive.findIndex(p => p.id === startId);
  return alive[(idx + 1) % alive.length]?.id || startId;
}

function sortBySeat(players) {
  return [...players].sort((a, b) => (a.seat || 0) - (b.seat || 0));
}

function rotateFromSeat(players, startSeat) {
  const sorted = sortBySeat(players);
  const idx = sorted.findIndex(p => p.seat === startSeat);
  if (idx < 0) return sorted;
  return [...sorted.slice(idx), ...sorted.slice(0, idx)];
}

module.exports = {
  shuffle, countTargets, topTarget, topExile,
  getNextAliveId, sortBySeat, rotateFromSeat
};
