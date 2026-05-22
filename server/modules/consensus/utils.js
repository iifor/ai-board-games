const { ROLES } = require('./constants');

function countVotes(votes) {
  const tally = new Map();
  votes.forEach((v) => { tally.set(v, (tally.get(v) || 0) + 1); });
  return tally;
}

function getTopTargets(tally, count = 1) {
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeSpeech(text, limit = 200) {
  return String(text || '').trim().slice(0, limit);
}

module.exports = { countVotes, getTopTargets, shuffle, normalizeSpeech };
