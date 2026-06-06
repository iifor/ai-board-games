interface RoleConfig {
  id?: string;
  roleType?: string;
  [key: string]: unknown;
}

interface WerewolfAgent {
  id: number;
  role?: string;
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

interface WinResult {
  winner: string | null;
  winReason: string;
}

type WinCondition = 'side' | 'gods' | 'villagers' | 'all';

interface AliveRosterStats {
  wolves: number;
  gods: number;
  villagers: number;
  good: number;
}

type WinnerLockRejectionReason =
  | 'invalid_source'
  | 'missing_trigger_roster'
  | 'invalid_trigger_roster'
  | 'trigger_roster_not_winning';

interface WinnerLockRejection {
  reason: WinnerLockRejectionReason;
  winnerLock: NonNullable<Round['winnerLock']>;
  currentRoster: AliveRosterStats;
  winCondition: WinCondition;
}

interface WinResolution {
  result: WinResult;
  rejectedLock?: WinnerLockRejection;
}

interface Round {
  day: number;
  night?: Night;
  winnerLock?: WinResult & {
    sourceFaction?: string;
    sourceAction?: string;
    winCondition?: WinCondition;
    triggerRoster?: AliveRosterStats;
  };
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

interface VotePower {
  wolves: number;
  good: number;
}

function eliminate(agents: WerewolfAgent[], id: number, day: number, reason: string): void {
  const target = agents.find((agent) => Number(agent.id) === Number(id));
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
  return round.day === 1
    && Boolean(modeConfig.sheriff?.enabled)
    && modeConfig.sheriff?.firstDayElection !== false;
}

function checkWin(agents: WerewolfAgent[], day: number, modeConfig: ModeConfig = {}): WinResult {
  const roster = getAliveRosterStats(agents);
  if (roster.wolves === 0) {
    return { winner: 'good', winReason: `第 ${day} 天，狼人全部出局，好人阵营胜利。` };
  }
  return checkWolfVictoryFromRoster(roster, day, normalizeWinCondition(modeConfig.winCondition));
}

function checkWolfVictory(agents: WerewolfAgent[], day: number, modeConfig: ModeConfig = {}): WinResult {
  return checkWolfVictoryFromRoster(
    getAliveRosterStats(agents),
    day,
    normalizeWinCondition(modeConfig.winCondition),
  );
}

function checkWolfVictoryFromRoster(
  roster: AliveRosterStats,
  day: number,
  winCondition: WinCondition,
): WinResult {
  if (roster.wolves === 0) return { winner: null, winReason: '' };
  if (winCondition === 'all' && roster.good === 0) {
    return { winner: 'wolves', winReason: `第 ${day} 天，所有好人出局，狼人阵营胜利。` };
  }
  if ((winCondition === 'side' || winCondition === 'villagers') && roster.villagers === 0) {
    return { winner: 'wolves', winReason: `第 ${day} 天，所有平民出局，狼人阵营胜利。` };
  }
  if ((winCondition === 'side' || winCondition === 'gods') && roster.gods === 0) {
    return { winner: 'wolves', winReason: `第 ${day} 天，所有神职出局，狼人阵营胜利。` };
  }
  return { winner: null, winReason: '' };
}

function resolveWinAfterDeaths(
  agents: WerewolfAgent[],
  round: Round,
  day: number,
  modeConfig: ModeConfig = {},
): WinResult {
  return resolveWinAfterDeathsDetailed(agents, round, day, modeConfig).result;
}

function resolveWinAfterDeathsDetailed(
  agents: WerewolfAgent[],
  round: Round,
  day: number,
  modeConfig: ModeConfig = {},
): WinResolution {
  const winnerLock = round.winnerLock;
  const currentRoster = getAliveRosterStats(agents);
  const winCondition = winnerLock?.winCondition || normalizeWinCondition(modeConfig.winCondition);
  if (winnerLock?.winner === 'wolves') {
    const rejectionReason = getWinnerLockRejectionReason(winnerLock);
    if (rejectionReason) {
      return {
        result: checkWin(agents, day, modeConfig),
        rejectedLock: { reason: rejectionReason, winnerLock, currentRoster, winCondition },
      };
    }
    const lockedResult = checkWolfVictoryFromRoster(winnerLock.triggerRoster!, day, winCondition);
    if (lockedResult.winner === 'wolves') {
      return {
        result: {
          winner: 'wolves',
          winReason: winnerLock.winReason || lockedResult.winReason,
        },
      };
    }
    return {
      result: checkWin(agents, day, modeConfig),
      rejectedLock: {
        reason: 'trigger_roster_not_winning',
        winnerLock,
        currentRoster,
        winCondition,
      },
    };
  } else if (winnerLock?.winner && winnerLock.winner !== 'wolves') {
    return {
      result: {
        winner: winnerLock.winner,
        winReason: winnerLock.winReason,
      },
    };
  }
  return { result: checkWin(agents, day, modeConfig) };
}

function getWinnerLockRejectionReason(
  winnerLock: NonNullable<Round['winnerLock']>,
): WinnerLockRejectionReason | null {
  if (winnerLock.sourceFaction !== 'wolves') return 'invalid_source';
  if (!winnerLock.triggerRoster) return 'missing_trigger_roster';
  if (!isAliveRosterStats(winnerLock.triggerRoster)) return 'invalid_trigger_roster';
  return null;
}

function isAliveRosterStats(value: AliveRosterStats): boolean {
  return ['wolves', 'gods', 'villagers', 'good'].every((key) => {
    const count = value[key as keyof AliveRosterStats];
    return Number.isInteger(count) && count >= 0;
  }) && value.good === value.gods + value.villagers;
}

function normalizeWinCondition(value: unknown): WinCondition {
  if (value === 'single') return 'side';
  if (value === 'gods' || value === 'villagers' || value === 'all') return value;
  return 'side';
}

function getAliveVotePower(
  agents: WerewolfAgent[],
  sheriffId: number | null = null,
  sheriffWeight: number = 1,
): VotePower {
  return agents
    .filter((agent) => agent.alive && agent.canVote)
    .reduce((totals, agent) => {
      const weight = Number(agent.id) === Number(sheriffId) ? Number(sheriffWeight) || 1 : 1;
      if (agent.faction === 'wolves') totals.wolves += weight;
      else totals.good += weight;
      return totals;
    }, { wolves: 0, good: 0 });
}

function topTarget(votes: Record<string, number | null>): number | null {
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

function countTargets(
  votes: Record<string, number | null> | null | undefined,
  sheriffId: number | null = null,
  sheriffWeight: number = 1,
): Record<string, number> {
  const counts: Record<string, number> = {};
  Object.entries(votes || {}).forEach(([voterId, id]) => {
    if (id == null || Number.isNaN(Number(id))) return;
    counts[id] = (counts[id] || 0) + (Number(voterId) === Number(sheriffId) ? sheriffWeight : 1);
  });
  return counts;
}

function hasLastWords(agents: WerewolfAgent[], modeConfig: ModeConfig): boolean {
  const deaths = agents.filter((agent) => !agent.alive).length;
  return deaths <= (modeConfig.lastWordsLimit ?? Infinity);
}

const GOD_ACTIONS = new Set([
  'inspectFaction',
  'guard',
  'save',
  'poison',
  'shootOnDeath',
  'surviveExileOnce',
]);

const GOD_ROLE_IDS = new Set(['seer', 'witch', 'hunter', 'guard', 'idiot']);
const VILLAGER_ROLE_IDS = new Set(['villager']);
const WOLF_ROLE_IDS = new Set(['werewolf', 'wolf']);

function getRoleType(agent: WerewolfAgent | null | undefined): string {
  if (!agent) return 'villager';
  if (agent.faction === 'wolves') return 'wolf';
  const configuredType = String(agent.roleConfig?.roleType || '').trim().toLowerCase();
  if (configuredType === 'god' || configuredType === 'villager' || configuredType === 'wolf') {
    return configuredType;
  }
  const roleId = String(agent.role || agent.roleConfig?.id || configuredType).trim().toLowerCase();
  if (WOLF_ROLE_IDS.has(roleId)) return 'wolf';
  if (GOD_ROLE_IDS.has(roleId)) return 'god';
  if (VILLAGER_ROLE_IDS.has(roleId)) return 'villager';
  const actions = (agent.roleConfig?.rule as { actions?: Array<{ action: string }> } | undefined)?.actions || [];
  return actions.some((action) => GOD_ACTIONS.has(action.action)) ? 'god' : 'villager';
}

function getAliveRosterStats(agents: WerewolfAgent[]): AliveRosterStats {
  return agents.filter((agent) => agent.alive).reduce<AliveRosterStats>((stats, agent) => {
    const roleType = getRoleType(agent);
    if (roleType === 'wolf') stats.wolves += 1;
    else if (roleType === 'god') {
      stats.gods += 1;
      stats.good += 1;
    } else {
      stats.villagers += 1;
      stats.good += 1;
    }
    return stats;
  }, { wolves: 0, gods: 0, villagers: 0, good: 0 });
}

export {
  eliminate,
  applyNightDeaths,
  shouldRunFirstDaySheriffElection,
  checkWin,
  checkWolfVictory,
  resolveWinAfterDeaths,
  resolveWinAfterDeathsDetailed,
  getAliveVotePower,
  topTarget,
  topExile,
  countTargets,
  hasLastWords,
  getRoleType,
  getAliveRosterStats,
  normalizeWinCondition,
};

export type {
  WerewolfAgent,
  RoleConfig,
  Round,
  ModeConfig,
  WinResult,
  VotePower,
  NightDeath,
  AliveRosterStats,
  WinCondition,
  WinResolution,
  WinnerLockRejection,
  WinnerLockRejectionReason,
};
