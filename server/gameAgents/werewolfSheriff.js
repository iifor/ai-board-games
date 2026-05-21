function sortBySeat(items = []) {
  return items.slice().sort((a, b) => Number(a.id) - Number(b.id));
}

function rotateFromSeat(items = [], startId, direction = 'clockwise') {
  const sorted = sortBySeat(items);
  if (!sorted.length) return sorted;
  const directional = direction === 'counterclockwise' ? sorted.slice().reverse() : sorted;
  const startIndex = directional.findIndex((item) => Number(item.id) === Number(startId));
  if (startIndex <= 0) return directional;
  return [...directional.slice(startIndex), ...directional.slice(0, startIndex)];
}

function getNextAliveId(alive = [], afterId, direction = 'clockwise') {
  const sorted = sortBySeat(alive);
  if (!sorted.length) return null;
  if (direction === 'counterclockwise') {
    return (sorted.slice().reverse().find((agent) => Number(agent.id) < Number(afterId)) || sorted.at(-1))?.id || null;
  }
  return (sorted.find((agent) => Number(agent.id) > Number(afterId)) || sorted[0])?.id || null;
}

function getClockStartId(alive = [], date = new Date()) {
  const hour = date.getHours();
  const seat = hour % 12 || 12;
  return getNextAliveId(alive, seat - 1);
}

function getSheriffSpeechOrder(alive = [], sheriffId, direction = 'clockwise') {
  const sheriff = alive.find((agent) => Number(agent.id) === Number(sheriffId));
  if (!sheriff) return rotateFromSeat(alive, getClockStartId(alive), 'clockwise');
  const speakers = alive.filter((agent) => Number(agent.id) !== Number(sheriffId));
  const startId = getNextAliveId(alive, sheriffId, direction);
  return [...rotateFromSeat(speakers, startId, direction), sheriff];
}

function getTopCandidateIds(tally = {}) {
  const entries = Object.entries(tally)
    .map(([id, count]) => [Number(id), Number(count)])
    .filter(([id, count]) => id && count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];
  return entries.filter(([, count]) => count === entries[0][1]).map(([id]) => id);
}

module.exports = {
  getClockStartId,
  getNextAliveId,
  getSheriffSpeechOrder,
  getTopCandidateIds,
  rotateFromSeat,
  sortBySeat
};
