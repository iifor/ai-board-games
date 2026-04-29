const QUESTIONS = [
  ['优先相信票型', '优先相信发言'],
  ['效率优先', '公平优先'],
  ['探索未知', '守护稳定'],
  ['理性决策', '直觉决策'],
  ['遵循规则', '灵活变通'],
  ['个人权利', '集体利益'],
  ['透明公开', '隐私保护']
];

const SPEECH_TEMPLATES = {
  记录者: '我是{player}号，我投了{vote}。我会看票数和声明是否对得上。',
  怀疑者: '我是{player}号，我投了{vote}。最可疑的是谁在共识失败后急着甩锅。',
  调和者: '我是{player}号，我投了{vote}。先把理由说清楚，别让分歧扩大。',
  原则派: '我是{player}号，我投了{vote}。突然摇摆的人需要解释清楚。',
  机会主义者: '我是{player}号，我投了{vote}。我会靠近更能形成共识的一边。',
  观察者: '我是{player}号，我投了{vote}。我先看谁的发言和票型冲突最大。'
};

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createPlayers(configPlayers = []) {
  const roles = shuffle(createRoleSet(configPlayers.length || 6));
  return roles.map((role, index) => {
    const config = configPlayers[index] || {};
    const id = config.id || index + 1;
    return {
      id,
      name: config.name || `${id}号`,
      nickname: config.nickname || config.name || `${id}号`,
      avatar: config.avatar || '',
      role,
      alive: true,
      personality: config.personality || ['记录者', '怀疑者', '调和者', '原则派', '机会主义者', '观察者'][index],
      votes: [],
      declared: [],
      suspicion: index === 1 ? 4 : (index % 5) + 1,
      eliminatedRound: null
    };
  });
}

function createRoleSet(playerCount) {
  const chaosCount = playerCount >= 8 ? 3 : playerCount >= 6 ? 2 : 1;
  return [
    ...Array.from({ length: chaosCount }, () => 'chaos'),
    ...Array.from({ length: playerCount - chaosCount }, () => 'order')
  ];
}

function tallyVotes(votes) {
  return Object.values(votes).reduce((acc, vote) => {
    acc[vote] += 1;
    return acc;
  }, { A: 0, B: 0 });
}

function createMockGame(config = {}) {
  const players = createPlayers(config.players);
  const questions = shuffle(QUESTIONS).slice(0, 3);
  const rounds = [];
  const consensusResults = [];

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const alive = players.filter((player) => !player.eliminatedRound || player.eliminatedRound >= roundIndex + 1);
    const threshold = alive.length <= 3 ? Math.max(2, alive.length) : Math.ceil(alive.length * 0.66);
    const [a, b] = questions[roundIndex];
    const votes = {};

    alive.forEach((player) => {
      const vote = player.role === 'chaos'
        ? (roundIndex % 2 === player.id % 2 ? 'A' : 'B')
        : (player.votes.at(-1) || (player.id === 3 || player.id === 5 ? 'B' : 'A'));
      player.votes.push(vote);
      votes[player.id] = vote;
    });

    const tally = tallyVotes(votes);
    const consensus = Math.max(tally.A, tally.B) >= threshold;
    consensusResults.push(consensus);

    const speeches = alive.map((player) => {
      const vote = player.votes.at(-1);
      const key = Object.keys(SPEECH_TEMPLATES).find((item) => player.personality.includes(item)) || '记录者';
      const text = SPEECH_TEMPLATES[key].replace('{player}', player.id).replace('{vote}', vote);
      player.declared.push(vote);
      return { playerId: player.id, text };
    });

    const exileVotes = {};
    alive.forEach((player, index) => {
      const targets = alive.filter((target) => target.id !== player.id);
      const target = targets[(index + roundIndex + player.id) % targets.length];
      exileVotes[player.id] = target.id;
      target.suspicion += 1;
    });

    rounds.push({
      number: roundIndex + 1,
      question: { a, b },
      aliveIds: alive.map((player) => player.id),
      votes,
      tally,
      threshold,
      exileThreshold: Math.floor(alive.length / 2) + 1,
      consensus,
      stanceChanges: 0,
      speeches,
      exileVotes,
      eliminated: null
    });
  }

  return {
    id: `game-${Date.now()}`,
    mode: 'mock',
    players,
    rounds,
    winner: consensusResults.filter(Boolean).length >= 2 ? 'order' : 'chaos',
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  createMockGame
};
