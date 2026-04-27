const QUESTIONS = [
  ['优先相信票型', '优先相信发言'],
  ['效率优先', '公平优先'],
  ['探索未知', '守护稳定'],
  ['理性决策', '直觉决策'],
  ['遵循规则', '灵活变通'],
  ['个人权利', '集体利益'],
  ['透明公开', '隐私保护'],
  ['长期收益', '短期止损'],
  ['严格惩罚', '给人机会'],
  ['统一标准', '因人而异'],
  ['快速行动', '充分讨论']
];

const DEFAULT_PLAYERS = [
  { id: 1, name: '1号', nickname: '星火', avatar: '', personality: '记录者' },
  { id: 2, name: '2号', nickname: '夜鸦', avatar: '', personality: '怀疑者' },
  { id: 3, name: '3号', nickname: '青砚', avatar: '', personality: '调和者' },
  { id: 4, name: '4号', nickname: '赫兹', avatar: '', personality: '原则派' },
  { id: 5, name: '5号', nickname: '暖场', avatar: '', personality: '机会主义者' },
  { id: 6, name: '6号', nickname: '锁链', avatar: '', personality: '观察者' }
];

const SPEECH_TEMPLATES = {
  记录者: '我是{player}号，我投了{vote}。我会看票数和声明是否对得上，回避理由的人下一轮要重点观察。',
  怀疑者: '我是{player}号，我投了{vote}。现在最可疑的不是少数票，而是谁在共识失败后急着甩锅。',
  调和者: '我是{player}号，我投了{vote}。先把理由说清楚，别让分歧扩大成误放逐。',
  原则派: '我是{player}号，我投了{vote}。我的选择延续前面的原则，突然摇摆的人需要解释清楚。',
  机会主义者: '我是{player}号，我投了{vote}。我会靠近更能形成共识的一边，但借机带节奏也很危险。',
  观察者: '我是{player}号，我投了{vote}。我暂时保留判断，先看谁的发言和真实票型冲突最大。'
};

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createPlayers(configPlayers = DEFAULT_PLAYERS) {
  const roles = shuffle(['chaos', 'chaos', 'order', 'order', 'order', 'order']);
  return roles.map((role, index) => {
    const config = configPlayers[index] || DEFAULT_PLAYERS[index];
    return {
      id: config.id || index + 1,
      name: config.name || `${index + 1}号`,
      nickname: config.nickname || config.name || `${index + 1}号`,
      avatar: config.avatar || '',
      role,
      alive: true,
      personality: config.personality || DEFAULT_PLAYERS[index].personality,
      votes: [],
      declared: [],
      suspicion: index === 1 ? 4 : (index % 5) + 1,
      eliminatedRound: null
    };
  });
}

function tallyVotes(votes) {
  return Object.values(votes).reduce(
    (acc, vote) => {
      acc[vote] += 1;
      return acc;
    },
    { A: 0, B: 0 }
  );
}

function getAlivePlayers(players, roundNumber) {
  return players.filter((player) => !player.eliminatedRound || player.eliminatedRound >= roundNumber);
}

function decideExile(exileVotes) {
  const counts = {};
  Object.values(exileVotes).forEach((targetId) => {
    counts[targetId] = (counts[targetId] || 0) + 1;
  });

  const maxExile = Math.max(0, ...Object.values(counts));
  const candidates = Object.entries(counts).filter(([, count]) => count === maxExile);
  return candidates.length === 1 && maxExile > 1 ? Number(candidates[0][0]) : null;
}

function createMockGame(config = {}) {
  const players = createPlayers(config.players);
  const questions = shuffle(QUESTIONS).slice(0, 3);
  const rounds = [];
  const consensusResults = [];

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const roundNumber = roundIndex + 1;
    const alive = getAlivePlayers(players, roundNumber);
    const threshold = alive.length <= 3 ? Math.max(2, alive.length) : Math.ceil(alive.length * 0.66);
    const [a, b] = questions[roundIndex];
    const votes = {};
    let stanceChanges = 0;

    alive.forEach((player) => {
      const previous = player.votes[player.votes.length - 1];
      let vote = previous || (player.id === 3 || player.id === 5 ? 'B' : 'A');
      if (player.role === 'chaos') vote = roundIndex % 2 === player.id % 2 ? 'A' : 'B';
      if (previous && previous !== vote) stanceChanges += 1;
      player.votes.push(vote);
      votes[player.id] = vote;
    });

    const tally = tallyVotes(votes);
    const consensus = Math.max(tally.A, tally.B) >= threshold;
    consensusResults.push(consensus);

    const speeches = alive.map((player) => {
      const vote = player.votes[player.votes.length - 1];
      const template = SPEECH_TEMPLATES[player.personality] || SPEECH_TEMPLATES.记录者;
      const text = template.replace('{player}', player.id).replace('{vote}', vote);
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

    const eliminatedId = decideExile(exileVotes);
    let eliminated = null;
    if (eliminatedId) {
      const target = players.find((player) => player.id === eliminatedId);
      if (target && !target.eliminatedRound) {
        target.eliminatedRound = roundNumber;
        eliminated = { id: target.id, role: target.role };
      }
    }

    rounds.push({
      number: roundNumber,
      question: { a, b },
      aliveIds: alive.map((player) => player.id),
      votes,
      tally,
      threshold,
      consensus,
      stanceChanges,
      speeches,
      exileVotes,
      eliminated
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
