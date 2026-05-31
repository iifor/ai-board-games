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
  const cfg = modeConfig || {};
  const aliveWolves = agents.filter((agent) => agent.alive && agent.faction === 'wolves').length;
  if (aliveWolves === 0) return { winner: 'good', winReason: `第 ${day} 天，狼人全部出局，好人阵营胜利。` };
  if (options.checkWolfVoteLock) {
    const votePower = getAliveVotePower(agents, options.sheriffId, cfg.sheriff?.voteWeight);
    if (votePower.wolves >= votePower.good) {
      return { winner: 'wolves', winReason: '狼人通过绑票获胜。' };
    }
  }
  const aliveGood = agents.filter((agent) => agent.alive && agent.faction !== 'wolves');
  const aliveVillagers = aliveGood.filter((agent) => getRoleType(agent) === 'villager').length;
  const aliveGods = aliveGood.filter((agent) => getRoleType(agent) === 'god').length;
  const winCondition = cfg.winCondition || 'side';
  // 屠城局：所有好人出局或狼人数 >= 好人数 → 狼人胜
  if (winCondition === 'all') {
    if (aliveGood.length === 0) return { winner: 'wolves', winReason: `第 ${day} 天，所有好人出局，狼人阵营胜利。` };
    if (aliveWolves >= aliveGood.length) return { winner: 'wolves', winReason: `第 ${day} 天，狼人数量达到或超过好人，狼人阵营胜利。` };
  }
  // 屠边局：所有平民或所有神职出局 → 狼人胜
  if ((winCondition === 'side' || winCondition === 'villagers') && aliveVillagers === 0) return { winner: 'wolves', winReason: `第 ${day} 天，所有平民出局，狼人阵营胜利。` };
  if ((winCondition === 'side' || winCondition === 'gods') && aliveGods === 0) return { winner: 'wolves', winReason: `第 ${day} 天，所有神职出局，狼人阵营胜利。` };
  return { winner: null, winReason: '' };
}

/** 规则 4：天亮绑票判定 — 狼人数 >= 好人数 → 狼人绑票胜 */
function checkDawnBindVote(agents: WerewolfAgent[], day: number): WinResult {
  const aliveWolves = agents.filter((agent) => agent.alive && agent.faction === 'wolves').length;
  const aliveGood = agents.filter((agent) => agent.alive && agent.faction !== 'wolves').length;
  if (aliveWolves > 0 && aliveWolves >= aliveGood) {
    return { winner: 'wolves', winReason: `狼人绑票胜利。` };
  }
  return { winner: null, winReason: '' };
}

/** 规则 5：放逐后预判 — 好人数 === 狼人数 + 1 且无女巫毒药 → 狼人必胜 */
function checkPostExileWin(agents: WerewolfAgent[], day: number): WinResult {
  if (!Array.isArray(agents)) return { winner: null, winReason: '' };
  const aliveWolves = agents.filter((agent) => agent?.alive && agent?.faction === 'wolves').length;
  const aliveGood = agents.filter((agent) => agent?.alive && agent?.faction !== 'wolves');
  if (aliveWolves === 0) return { winner: null, winReason: '' };

  // 好人数 === 狼人数 + 1 → 夜间刀一人后天亮绑票
  if (aliveGood.length !== aliveWolves + 1) return { winner: null, winReason: '' };

  // 检查女巫是否还有毒药可用
  const witchAlive = aliveGood.find((agent) => {
    const actions = (agent?.roleConfig as Record<string, unknown> | undefined)?.rule
      ? ((agent?.roleConfig as Record<string, unknown>).rule as { actions?: Array<{ action: string }> })?.actions
      : undefined;
    return Array.isArray(actions) && actions.some((a) => a?.action === 'poison');
  });
  const witchHasPoison = witchAlive && !(witchAlive as WerewolfAgent).usedPoison;
  if (witchHasPoison) return { winner: null, winReason: '' };

  return { winner: 'wolves', winReason: `第 ${day} 天放逐结束，狼人夜间刀一人即可绑票，狼人阵营胜利。` };
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
    if (id == null || Number.isNaN(Number(id))) return; // 跳过 null/NaN 目标（弃票/AI 失败）
    counts[id] = (counts[id] || 0) + (Number(voterId) === Number(sheriffId) ? sheriffWeight : 1);
  });
  return counts;
}

function hasLastWords(agents: WerewolfAgent[], modeConfig: ModeConfig): boolean {
  const deaths = agents.filter((agent) => !agent.alive).length;
  return deaths <= (modeConfig.lastWordsLimit ?? Infinity);
}

/** 神职类技能 — 拥有其中之一的非狼人角色即为神职 */
const GOD_ACTIONS = new Set([
  'inspectFaction', 'guard', 'save', 'poison', 'shootOnDeath', 'surviveExileOnce',
]);

function getRoleType(agent: WerewolfAgent | null | undefined): string {
  if (!agent) return 'villager';
  if (agent.roleConfig?.roleType) return String(agent.roleConfig.roleType);
  if (agent.faction === 'wolves') return 'wolf';
  // 根据角色的技能列表推断：有神职技能 → god，否则 villager
  const actions = (agent.roleConfig?.rule as { actions?: Array<{ action: string }> } | undefined)?.actions || [];
  return actions.some((a) => GOD_ACTIONS.has(a.action)) ? 'god' : 'villager';
}

export {
  eliminate, applyNightDeaths, shouldRunFirstDaySheriffElection,
  checkWin, checkDawnBindVote, checkPostExileWin,
  getAliveVotePower, topTarget, topExile, countTargets,
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
