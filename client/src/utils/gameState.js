export function classNames(...items) {
  return items.filter(Boolean).join(' ');
}

export function createEmptyGame() {
  const nicknames = ['豆包', 'Grok', '文心一言', 'Gemini', 'Kimi', 'DeepSeek'];
  const personalities = ['记录者', '怀疑者', '调和者', '原则派', '机会主义者', '观察者'];
  return {
    id: 'pending',
    mode: 'real',
    players: Array.from({ length: 6 }).map((_, index) => {
      const id = index + 1;
      return {
        id,
        name: `${id}号`,
        nickname: nicknames[index],
        avatar: '',
        role: 'unknown',
        alive: true,
        personality: personalities[index],
        votes: [],
        declared: [],
        suspicion: (index % 5) + 1,
        eliminatedRound: null
      };
    }),
    rounds: [],
    winner: null
  };
}

export function createPendingRound() {
  return {
    number: 1,
    question: { a: '等待议题', b: '等待议题' },
    aliveIds: [1, 2, 3, 4, 5, 6],
    votes: {},
    tally: { A: 0, B: 0 },
    threshold: 4,
    exileThreshold: 4,
    consensus: false,
    stanceChanges: 0,
    speeches: [],
    exileVotes: {},
    eliminated: null
  };
}

export function buildTimeline(game) {
  const events = [];
  game.rounds.forEach((round) => {
    events.push({ type: 'round', title: `第 ${round.number} 轮议题`, roundData: round, game });
    if (Object.keys(round.votes || {}).length) {
      events.push({ type: 'vote', title: '共识结果公布', roundData: round, game });
    }
    round.speeches.forEach((speech) => {
      events.push({ type: 'speech', title: `玩家 ${speech.playerId} 发言`, roundData: round, speech, game });
    });
    if (Object.keys(round.exileVotes || {}).length) {
      events.push({ type: 'exile', title: '放逐投票', roundData: round, game });
    }
  });
  if (game.winner) {
    events.push({ type: 'end', title: '胜负结算', roundData: game.rounds.at(-1) || createPendingRound(), game });
  }
  return events;
}

export function buildExileCards(round) {
  const counts = {};
  const voters = {};
  Object.entries(round.exileVotes || {}).forEach(([from, to]) => {
    counts[to] = (counts[to] || 0) + 1;
    voters[to] = [...(voters[to] || []), Number(from)];
  });

  const cards = Object.keys(counts).map((id) => ({
    id: Number(id),
    count: counts[id],
    voters: voters[id] || []
  }));

  while (cards.length < 3) {
    const fallbackId = round.aliveIds.find((id) => !cards.some((card) => card.id === id));
    if (!fallbackId) break;
    cards.push({ id: fallbackId, count: 0, voters: [] });
  }

  return cards.sort((a, b) => b.count - a.count).slice(0, 3);
}

export function getWinnerName(winner) {
  if (winner === 'order') return '守序方';
  if (winner === 'chaos') return '破坏者';
  return '未知阵营';
}

export function getChaosPlayers(game) {
  return game.players
    .filter((player) => player.role === 'chaos')
    .map((player) => `${player.nickname || player.name || `${player.id}号`}（${player.id}号）`);
}
