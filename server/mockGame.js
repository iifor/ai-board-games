const { getRandomEnabledSkin } = require('./adminStore');
const { buildMemoryCard, getInvestigationQuestions } = require('./mistTemplate');

function createMockGame(config = {}) {
  const template = getRandomEnabledSkin();
  const questions = getInvestigationQuestions(template);
  const selectedPlayers = createPlayers(config.players).slice(0, 7);
  const roles = ['investigator', 'keyFigure', 'investigator', 'cover', 'investigator', 'investigator', 'investigator'];
  const keyFigureId = selectedPlayers[roles.indexOf('keyFigure')].id;
  const coverId = selectedPlayers[roles.indexOf('cover')].id;
  const players = selectedPlayers.map((player, index) => ({
    ...player,
    role: roles[index],
    roleLabel: getRoleLabel(roles[index], template),
    alive: true,
    excluded: false,
    excludedRound: null,
    marked: false,
    votes: [],
    declared: [],
    suspicion: (index % 5) + 1,
    memoryCard: ''
  }));

  players.forEach((player) => {
    player.memoryCard = buildMemoryCard(player, players, keyFigureId, coverId, template);
  });

  const rounds = [];
  let nextClueIndex = 0;
  let winner = null;
  let winReason = '';

  const scriptedConsensusVotes = [
    { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: 'A', 7: 'A' },
    { 1: 'A', 2: 'B', 3: 'A', 4: 'A', 5: 'A', 6: 'B', 7: 'A' },
    { 1: 'A', 3: 'B', 4: 'A', 5: 'B', 6: 'A', 7: 'B' }
  ];

  for (let index = 0; index < 3; index += 1) {
    const roundNumber = index + 1;
    const voters = players.filter((player) => !player.excluded);
    const votes = {};
    voters.forEach((player) => {
      const vote = scriptedConsensusVotes[index][player.id] || (player.id % 2 ? 'A' : 'B');
      votes[player.id] = vote;
      player.votes.push(vote);
    });

    const tally = tallyVotes(votes);
    const consensusType = getConsensusType(tally, voters.length);
    const round = {
      number: roundNumber,
      phase: roundNumber === 1 ? 'suspicion' : roundNumber === 2 ? 'exclusion' : 'final',
      question: questions[index],
      aliveIds: voters.map((player) => player.id),
      votes,
      tally,
      consensusType,
      consensus: consensusType !== 'failed',
      clue: null,
      appraisal: '',
      noise: '',
      speeches: [],
      suspicionVotes: null,
      markedSuspects: [],
      exclusionVotes: null,
      excluded: [],
      finalAccusationVotes: null,
      finalTargets: []
    };

    if (round.consensus && nextClueIndex < template.clues.length) {
      const sourceClue = template.clues[nextClueIndex];
      round.clue = { title: sourceClue.title, text: sourceClue.text };
      round.appraisal = sourceClue.appraisal;
      nextClueIndex += 1;
    }
    if (consensusType === 'overConsensus') {
      round.noise = template.noises[index % template.noises.length];
    }

    round.speeches = voters.map((player) => ({
      playerId: player.id,
      text: getMockSpeech(player, round)
    }));

    if (roundNumber === 1) {
      round.suspicionVotes = { 1: 2, 2: 5, 3: 2, 4: 5, 5: 6, 6: 6, 7: 7 };
      round.markedSuspects = getTopTargets(round.suspicionVotes);
      round.markedSuspects.forEach((id) => {
        const target = players.find((player) => player.id === id);
        if (target) {
          target.marked = true;
          target.suspicion = Math.min(5, target.suspicion + 2);
        }
      });
    }

    if (roundNumber === 2) {
      round.exclusionVotes = { 1: 5, 2: 6, 3: 5, 4: 6, 5: 6, 6: 5, 7: 5 };
      const excludedIds = getTopTargets(round.exclusionVotes);
      excludedIds.forEach((id) => {
        const target = players.find((player) => player.id === id);
        if (target) {
          target.excluded = true;
          target.alive = false;
          target.excludedRound = 2;
          target.lastTestimony = `${id}号${template.terms.lastTestimony}：我更担心一直淡化关键线索的人，最终指认别被噪音带跑。`;
          round.excluded.push({ id, testimony: target.lastTestimony });
        }
      });
      if (excludedIds.some((id) => players.find((player) => player.id === id)?.role === 'keyFigure')) {
        winner = 'investigators';
        winReason = `第二轮${template.terms.exclusion}命中${template.terms.keyFigure}，调查方立即胜利。`;
      }
    }

    if (roundNumber === 3) {
      round.finalAccusationVotes = { 1: 2, 2: 5, 3: 2, 4: 5, 6: 2, 7: 5 };
      round.finalTargets = getTopTargets(round.finalAccusationVotes);
      winner = 'mist';
      winReason = '第三轮最终指认出现最高票平票，迷雾方胜利。';
    }

    rounds.push(round);
    if (winner && roundNumber === 2) break;
  }

  if (!winner) {
    winner = 'mist';
    winReason = '调查方未能在三轮内形成明确正确指认，迷雾方胜利。';
  }

  return {
    id: `game-${Date.now()}`,
    mode: 'mock',
    event: {
      id: template.id,
      name: template.name,
      version: template.version,
      source: template.source,
      background: template.background,
      terms: template.terms,
      truth: template.truth
    },
    players,
    rounds,
    winner,
    winReason,
    createdAt: new Date().toISOString()
  };
}

function createPlayers(configPlayers = []) {
  const fallback = ['豆包', 'Grok', '文心一言', 'Gemini', 'Kimi', 'DeepSeek', '千问'];
  return Array.from({ length: 7 }).map((_, index) => {
    const config = configPlayers[index] || {};
    const id = config.id || index + 1;
    return {
      id,
      name: config.name || `${id}号`,
      nickname: config.nickname || fallback[index] || `${id}号`,
      avatar: config.avatar || '',
      provider: config.provider || 'mock',
      model: config.model || 'mock',
      sex: config.sex || ['女', '男', '男', '男', '男', '男', '女'][index] || '未知',
      personality: config.personality || ['记录者', '怀疑者', '调和者', '原则派', '机会主义者', '观察者', '倾听者'][index]
    };
  });
}

function getMockSpeech(player, round) {
  if (player.role === 'keyFigure') return '公共终端那条噪音不能完全忽略，我不赞成现在就把手册和违规操作者强行画等号。';
  if (player.role === 'cover') return '日志重写听起来严重，但它也可能只是修复痕迹。相比之下，谁急着定案更值得看。';
  if (round.noise) return '这轮全票太顺了，噪音会让判断变浑。我更想听接触过隔离区材料的人解释时间线。';
  return '我会把手册下载、权限撤回和备用终端连起来看，目前最可疑的是回避这些细节的人。';
}

function tallyVotes(votes) {
  return Object.values(votes).reduce((acc, vote) => {
    if (vote === 'A') acc.A += 1;
    if (vote === 'B') acc.B += 1;
    return acc;
  }, { A: 0, B: 0 });
}

function getConsensusType(tally, voterCount) {
  const max = Math.max(tally.A, tally.B);
  if (max === voterCount && voterCount > 0) return 'overConsensus';
  if (max >= Math.ceil(voterCount * 0.66)) return 'effective';
  return 'failed';
}

function getTopTargets(votes) {
  const counts = {};
  Object.values(votes).forEach((target) => {
    counts[target] = (counts[target] || 0) + 1;
  });
  const entries = Object.entries(counts);
  const max = entries.length ? Math.max(...entries.map(([, count]) => count)) : 0;
  return entries.filter(([, count]) => count === max).map(([id]) => Number(id));
}

function getRoleLabel(role, template) {
  if (role === 'investigator') return template.terms.investigators;
  if (role === 'keyFigure') return template.terms.keyFigure;
  if (role === 'cover') return template.terms.cover;
  return '未知';
}

module.exports = {
  createMockGame
};
