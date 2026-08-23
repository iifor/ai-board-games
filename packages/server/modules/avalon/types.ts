import type {
  AvalonFaction,
  AvalonMissionPublicState,
  AvalonPublicPlayer,
  AvalonRoleId,
  AvalonStatus,
  AvalonWinner,
} from '../../../shared/types/avalon';

interface AvalonPlayerInput extends AvalonPublicPlayer {}

interface AvalonPlayerState extends AvalonPublicPlayer {
  role: AvalonRoleId;
  faction: AvalonFaction;
}

interface AvalonMissionState extends AvalonMissionPublicState {
  teamVotes: Record<string, boolean>;
  questVotes: Record<string, boolean>;
}

interface AvalonState {
  id: string;
  gameType: 'avalon';
  mode: 'standard-5';
  status: AvalonStatus;
  seed: number;
  missionNumber: number;
  proposalAttempt: number;
  leaderIndex: number;
  players: AvalonPlayerState[];
  missions: AvalonMissionState[];
  currentTeamIds: number[];
  winner?: AvalonWinner;
  winReason?: string;
  assassinationTargetId?: number;
}

interface AvalonWorkflowState extends AvalonState {
  completedSteps: Record<string, boolean>;
  [key: string]: unknown;
}

export type {
  AvalonMissionState,
  AvalonPlayerInput,
  AvalonPlayerState,
  AvalonState,
  AvalonWorkflowState,
};
