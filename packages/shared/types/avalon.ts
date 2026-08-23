type AvalonRoleId = 'merlin' | 'percival' | 'loyal_servant' | 'assassin' | 'morgana';
type AvalonFaction = 'good' | 'evil';
type AvalonWinner = AvalonFaction;
type AvalonStatus = 'setup' | 'proposing' | 'team-vote' | 'quest' | 'assassination' | 'completed';

interface AvalonPublicPlayer {
  id: number;
  nickname: string;
  avatar?: string;
}

interface AvalonMissionPublicState {
  number: number;
  teamSize: number;
  status: 'pending' | 'team-vote' | 'quest' | 'success' | 'fail';
  attempt: number;
  leaderId?: number;
  teamIds: number[];
  approveCount?: number;
  rejectCount?: number;
  successCount?: number;
  failCount?: number;
}

interface AvalonRoleReveal {
  playerId: number;
  role: AvalonRoleId;
  faction: AvalonFaction;
}

interface AvalonPublicState {
  id: string;
  gameType: 'avalon';
  mode: 'standard-5';
  status: AvalonStatus;
  missionNumber: number;
  proposalAttempt: number;
  leaderId: number;
  players: AvalonPublicPlayer[];
  missions: AvalonMissionPublicState[];
  currentTeamIds: number[];
  goodScore: number;
  evilScore: number;
  winner?: AvalonWinner;
  winReason?: string;
  assassinationTargetId?: number;
  reveal?: AvalonRoleReveal[];
}

export type {
  AvalonFaction,
  AvalonMissionPublicState,
  AvalonPublicPlayer,
  AvalonPublicState,
  AvalonRoleId,
  AvalonRoleReveal,
  AvalonStatus,
  AvalonWinner,
};
