export function classNames(...items) {
  return items.filter(Boolean).join(' ');
}

export function createEmptyGame() {
  const nicknames = ['豆包', 'Grok', '文心一言', 'Gemini', 'Kimi', 'DeepSeek', '千问'];
  const personalities = ['记录者', '怀疑者', '调和者', '原则派', '机会主义者', '观察者', '倾听者'];
  return {
    id: 'pending',
    mode: 'real',
    event: {
      name: 'AI实验室异常',
      version: 'v3.2',
      background: '等待主持人公布事件背景。',
      terms: {
        investigators: '安全调查员',
        mist: '隐瞒者',
        keyFigure: '违规操作者',
        cover: '日志篡改者',
        suspicionMark: '风险标记',
        exclusion: '权限冻结',
        lastTestimony: '离组记录'
      },
      truth: ''
    },
    players: Array.from({ length: 7 }).map((_, index) => {
      const id = index + 1;
      return {
        id,
        name: `${id}号`,
        nickname: nicknames[index],
        avatar: '',
        role: 'unknown',
        roleLabel: '身份隐藏',
        alive: true,
        excluded: false,
        excludedRound: null,
        marked: false,
        personality: personalities[index],
        votes: [],
        declared: [],
        suspicion: (index % 5) + 1
      };
    }),
    rounds: [],
    winner: null,
    winReason: ''
  };
}

export function createPendingRound() {
  return {
    number: 1,
    phase: 'suspicion',
    question: { premise: '等待主持人说明本轮调查前提。', a: '等待调查题', b: '等待调查题' },
    aliveIds: [1, 2, 3, 4, 5, 6, 7],
    votes: {},
    tally: { A: 0, B: 0 },
    consensusType: 'failed',
    consensus: false,
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
}

export function buildTimeline(game, messageLog = []) {
  const events = [];
  messageLog.forEach((message, index) => {
    events.push({
      type: message.type === 'host' ? 'host-message' : 'speech-log',
      title: message.title || (message.type === 'host' ? '主持人' : `玩家 ${message.playerId} 发言`),
      message,
      order: index + 1,
      game
    });
  });
  game.rounds.forEach((round) => {
    events.push({ type: 'round', title: `第 ${round.number} 轮调查`, roundData: round, game });
    if (Object.keys(round.votes || {}).length) {
      events.push({ type: 'vote', title: '共识结果公布', roundData: round, game });
    }
    if (round.clue || round.appraisal || round.noise || Object.keys(round.votes || {}).length) {
      events.push({ type: 'clue', title: '线索与鉴定', roundData: round, game });
    }
    if (!messageLog.length) {
      round.speeches.forEach((speech) => {
        events.push({ type: 'speech', title: `玩家 ${speech.playerId} 发言`, roundData: round, speech, game });
      });
    }
    if (round.suspicionVotes) {
      events.push({ type: 'suspicion', title: '风险标记投票', roundData: round, game });
    }
    if (round.exclusionVotes) {
      events.push({ type: 'exclusion', title: '权限冻结投票', roundData: round, game });
    }
    if (round.finalAccusationVotes) {
      events.push({ type: 'final', title: '最终指认', roundData: round, game });
    }
  });
  if (game.winner) {
    events.push({ type: 'end', title: '胜负结算', roundData: game.rounds.at(-1) || createPendingRound(), game });
  }
  return events;
}

export function buildVoteCards(votes = {}, fallbackIds = []) {
  const counts = {};
  const voters = {};
  Object.entries(votes || {}).forEach(([from, to]) => {
    counts[to] = (counts[to] || 0) + 1;
    voters[to] = [...(voters[to] || []), Number(from)];
  });

  const cards = Object.keys(counts).map((id) => ({
    id: Number(id),
    count: counts[id],
    voters: voters[id] || []
  }));

  while (cards.length < 3) {
    const fallbackId = fallbackIds.find((id) => !cards.some((card) => card.id === id));
    if (!fallbackId) break;
    cards.push({ id: fallbackId, count: 0, voters: [] });
  }

  return cards.sort((a, b) => b.count - a.count).slice(0, 3);
}

export function getWinnerName(winner) {
  if (winner === 'investigators') return '调查方';
  if (winner === 'mist') return '迷雾方';
  return '未知阵营';
}

export function getConsensusTypeName(type) {
  if (type === 'overConsensus') return '过度共识';
  if (type === 'effective') return '有效共识';
  return '共识失败';
}

export function getRoleName(role, roleLabel) {
  if (roleLabel && !['身份隐藏', '玩家视角隐藏', '未知'].includes(roleLabel)) return roleLabel;
  if (role === 'investigator') return '安全调查员';
  if (role === 'keyFigure') return '违规操作者';
  if (role === 'cover') return '日志篡改者';
  return '身份隐藏';
}

export function getMistPlayers(game) {
  return game.players
    .filter((player) => player.role === 'keyFigure' || player.role === 'cover')
    .map((player) => `${player.nickname || player.name || `${player.id}号`}（${getRoleName(player.role, player.roleLabel)}，${player.id}号）`);
}
