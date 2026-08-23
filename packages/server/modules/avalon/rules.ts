import type { AvalonRoleId } from '../../../shared/types/avalon';
import type {
  AvalonMissionState,
  AvalonPlayerInput,
  AvalonState,
} from './types';

const AVALON_MISSION_TEAM_SIZES = [2, 3, 2, 3, 3] as const;
const AVALON_ROLES: AvalonRoleId[] = [
  'merlin',
  'percival',
  'loyal_servant',
  'assassin',
  'morgana',
];

function createInitialAvalonState(players: AvalonPlayerInput[], seed: number): AvalonState {
  if (players.length !== 5) throw new Error('Avalon standard-5 requires exactly five players');
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new Error('Avalon player ids must be unique');
  }
  const roleOrder = seededShuffle(AVALON_ROLES, seed);
  const playerStates = players.map((player, index) => {
    const role = roleOrder[index];
    return {
      ...player,
      role,
      faction: role === 'assassin' || role === 'morgana' ? 'evil' as const : 'good' as const,
    };
  });
  return {
    id: `avalon-${seed}`,
    gameType: 'avalon',
    mode: 'standard-5',
    status: 'setup',
    seed,
    missionNumber: 1,
    proposalAttempt: 1,
    leaderIndex: seed % players.length,
    players: playerStates,
    missions: AVALON_MISSION_TEAM_SIZES.map((teamSize, index) => createMission(index + 1, teamSize)),
    currentTeamIds: [],
  };
}

function createMission(number: number, teamSize: number): AvalonMissionState {
  return {
    number,
    teamSize,
    status: 'pending',
    attempt: 1,
    teamIds: [],
    teamVotes: {},
    questVotes: {},
  };
}

function getCurrentMission(state: AvalonState): AvalonMissionState {
  const mission = state.missions[state.missionNumber - 1];
  if (!mission) throw new Error(`Avalon mission not found: ${state.missionNumber}`);
  return mission;
}

function getLeaderId(state: AvalonState): number {
  return state.players[state.leaderIndex % state.players.length].id;
}

function rotateLeader(state: AvalonState): number {
  return (state.leaderIndex + 1) % state.players.length;
}

function validateProposedTeam(state: AvalonState, teamIds: number[]): boolean {
  const mission = getCurrentMission(state);
  const unique = [...new Set(teamIds.map(Number))];
  const playerIds = new Set(state.players.map((player) => player.id));
  return unique.length === mission.teamSize && unique.every((id) => playerIds.has(id));
}

function countBooleanVotes(votes: Record<string, boolean>): { positive: number; negative: number } {
  const values = Object.values(votes);
  return {
    positive: values.filter(Boolean).length,
    negative: values.filter((value) => !value).length,
  };
}

function getScore(state: AvalonState): { good: number; evil: number } {
  return {
    good: state.missions.filter((mission) => mission.status === 'success').length,
    evil: state.missions.filter((mission) => mission.status === 'fail').length,
  };
}

function getPrivateKnowledge(state: AvalonState, playerId: number): string {
  const actor = state.players.find((player) => player.id === playerId);
  if (!actor) throw new Error(`Avalon player not found: ${playerId}`);
  const evil = state.players.filter((player) => player.faction === 'evil');
  if (actor.role === 'merlin') {
    return `你知道邪恶阵营是：${evil.map(labelPlayer).join('、')}。`;
  }
  if (actor.role === 'percival') {
    const candidates = state.players.filter((player) => player.role === 'merlin' || player.role === 'morgana');
    return `你看到的梅林候选人是：${candidates.map(labelPlayer).join('、')}，但不知道谁是莫甘娜。`;
  }
  if (actor.faction === 'evil') {
    return `你的邪恶队友是：${evil.filter((player) => player.id !== actor.id).map(labelPlayer).join('、') || '无'}。`;
  }
  return '你没有额外的私密身份信息。';
}

function getRoleLabel(role: AvalonRoleId): string {
  return ({
    merlin: '梅林',
    percival: '派西维尔',
    loyal_servant: '忠臣',
    assassin: '刺客',
    morgana: '莫甘娜',
  } satisfies Record<AvalonRoleId, string>)[role];
}

function seededShuffle<T>(values: T[], seed: number): T[] {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function labelPlayer(player: { id: number; nickname: string }): string {
  return `${player.id}号${player.nickname}`;
}

export {
  AVALON_MISSION_TEAM_SIZES,
  countBooleanVotes,
  createInitialAvalonState,
  getCurrentMission,
  getLeaderId,
  getPrivateKnowledge,
  getRoleLabel,
  getScore,
  rotateLeader,
  seededShuffle,
  validateProposedTeam,
};
