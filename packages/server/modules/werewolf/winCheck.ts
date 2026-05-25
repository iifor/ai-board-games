interface RoleConfig {
  roleType?: string;
  [key: string]: unknown;
}

interface WerewolfAgent {
  id: number;
  alive: boolean;
  faction: string;
  canVote: boolean;
  deathDay?: number | null;
  deathReason?: string;
  roleConfig?: RoleConfig;
  [key: string]: unknown;
}

interface NightDeath {
  id: number;
  reason: string;
}

interface Night {
  deaths?: NightDeath[];
  [key: string]: unknown;
}

interface Round {
  day: number;
  night?: Night;
  [key: string]: unknown;
}

interface SheriffConfig {
  enabled?: boolean;
  firstDayElection?: boolean;
  voteWeight?: number;
}

interface ModeConfig {
  sheriff?: SheriffConfig;
  winCondition?: string;
  lastWordsLimit?: number;
  [key: string]: unknown;
}

interface WinCheckOptions {
  checkWolfVoteLock?: boolean;
  sheriffId?: number | null;
}

interface WinResult {
  winner: string | null;
  winReason: string;
}

interface VotePower {
  wolves: number;
  good: number;
}

function eliminate(agents: WerewolfAgent[], id: number, day: number, reason: string): void {
  const target = agents.find((agent) => agent.id === id);
  if (!target || !target.alive) return;
  target.alive = false;
  target.deathDay = day;
  target.deathReason = reason;
}

function applyNightDeaths(agents: WerewolfAgent[], round: Round): void {
  for (const death of round.night?.deaths || []) {
    eliminate(agents, death.id, round.day, death.reason);
  }
}

function shouldRunFirstDaySheriffElection(round: Round, modeConfig: ModeConfig): boolean {
  return round.day === 1 && Boolean(modeConfig.sheriff?.enabled) && modeConfig.sheriff?.firstDayElection !== false;
}

function checkWin(agents: WerewolfAgent[], day: number, modeConfig: ModeConfig = {}, options: WinCheckOptions = {}): WinResult {
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

function getAliveVotePower(agents: WerewolfAgent[], sheriffId: number | null = null, sheriffWeight: number = 1): VotePower {
  return agents
    .filter((agent) => agent.alive && agent.canVote)
    .reduce((totals, agent) => {
      const weight = Number(agent.id) === Number(sheriffId) ? Number(sheriffWeight) || 1 : 1;
      if (agent.faction === 'wolves') totals.wolves += weight;
      else totals.good += weight;
      return totals;
    }, { wolves: 0, good: 0 });
}

function topTarget(votes: Record<string, number>): number | null {
  const tally = countTargets(votes);
  const entries = Object.entries(tally);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return Number(entries[0][0]);
}

function topExile(tally: Record<string, number>): number | null {
  const entries = Object.entries(tally);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
  return Number(entries[0][0]);
}

function countTargets(votes: Record<string, number> | null | undefined, sheriffId: number | null = null, sheriffWeight: number = 1): Record<string, number> {
  const counts: Record<string, number> = {};
  Object.entries(votes || {}).forEach(([voterId, id]) => {
    counts[id] = (counts[id] || 0) + (Number(voterId) === Number(sheriffId) ? sheriffWeight : 1);
  });
  return counts;
}

function hasLastWords(agents: WerewolfAgent[], modeConfig: ModeConfig): boolean {
  const deaths = agents.filter((agent) => !agent.alive).length;
  return deaths <= (modeConfig.lastWordsLimit ?? Infinity);
}

function getRoleType(agent: WerewolfAgent | null | undefined): string {
  return agent?.roleConfig?.roleType || (agent?.faction === 'wolves' ? 'wolf' : 'villager');
}

export {
  eliminate, applyNightDeaths, shouldRunFirstDaySheriffElection,
  checkWin, getAliveVotePower, topTarget, topExile, countTargets,
  hasLastWords, getRoleType
};

export type {
  WerewolfAgent,
  RoleConfig,
  Round,
  ModeConfig,
  WinResult,
  VotePower,
  NightDeath
};
