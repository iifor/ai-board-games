function eliminate(agents, id, day, reason) {
  const target = agents.find((agent) => agent.id === id);
  if (!target || !target.alive) return;
  target.alive = false;
  target.deathDay = day;
  target.deathReason = reason;
}

function applyNightDeaths(agents, round) {
  for (const death of round.night?.deaths || []) {
    eliminate(agents, death.id, round.day, death.reason);
  }
}

function shouldRunFirstDaySheriffElection(round, modeConfig) {
  return round.day === 1 && modeConfig.sheriff.enabled && modeConfig.sheriff.firstDayElection !== false;
}

function checkWin(agents, day, modeConfig = {}, options = {}) {
  const aliveWolves = agents.filter((agent) => agent.alive && agent.faction === 'wolves').length;
  if (aliveWolves === 0) return { winner: 'good', winReason: `第 ${day} 天，狼人全部出局，好人阵营胜利。` };
  if (options.checkWolfVoteLock) {
    const votePower = getAliveVotePower(agents, options.sheriffId, modeConfig.sheriff?.voteWeight);
    if (votePower.wolves >= votePower.good) {
      return { winner: 'wolves', winReason: '狼人通过绑票获胜。' };
    }
  }
  const aliveGood = agents.filter((agent) => agent.alive && agent.faction !== 'wolves');
  const aliveVillagers = aliveGood.filter((agent) => getRoleType(agent) === 'villager').length;
  const aliveGods = aliveGood.filter((agent) => getRoleType(agent) === 'god').length;
  const winCondition = modeConfig.winCondition || 'side';
  if (winCondition === 'all' && aliveGood.length === 0) return { winner: 'wolves', winReason: `第 ${day} 天，所有好人出局，狼人阵营胜利。` };
  if ((winCondition === 'side' || winCondition === 'villagers') && aliveVillagers === 0) return { winner: 'wolves', winReason: `第 ${day} 天，所有平民出局，狼人阵营胜利。` };
  if ((winCondition === 'side' || winCondition === 'gods') && aliveGods === 0) return { winner: 'wolves', winReason: `第 ${day} 天，所有神职出局，狼人阵营胜利。` };
  return { winner: null, winReason: '' };
}

function getAliveVotePower(agents, sheriffId = null, sheriffWeight = 1) {
  return agents
    .filter((agent) => agent.alive && agent.canVote)
    .reduce((totals, agent) => {
      const weight = Number(agent.id) === Number(sheriffId) ? Number(sheriffWeight) || 1 : 1;
      if (agent.faction === 'wolves') totals.wolves += weight;
      else totals.good += weight;
      return totals;
    }, { wolves: 0, good: 0 });
}

function topTarget(votes) {
  const tally = countTargets(votes);
  const entries = Object.entries(tally);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return Number(entries[0][0]);
}

function topExile(tally) {
  const entries = Object.entries(tally);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
  return Number(entries[0][0]);
}

function countTargets(votes, sheriffId = null, sheriffWeight = 1) {
  const counts = {};
  Object.entries(votes || {}).forEach(([voterId, id]) => {
    counts[id] = (counts[id] || 0) + (Number(voterId) === Number(sheriffId) ? sheriffWeight : 1);
  });
  return counts;
}

function hasLastWords(agents, modeConfig) {
  const deaths = agents.filter((agent) => !agent.alive).length;
  return deaths <= modeConfig.lastWordsLimit;
}

function getRoleType(agent) {
  return agent?.roleConfig?.roleType || (agent?.faction === 'wolves' ? 'wolf' : 'villager');
}

module.exports = {
  eliminate, applyNightDeaths, shouldRunFirstDaySheriffElection,
  checkWin, getAliveVotePower, topTarget, topExile, countTargets,
  hasLastWords, getRoleType
};
