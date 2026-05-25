import type { Player } from './player';

export type GameStatus = 'idle' | 'streaming' | 'ready' | 'error';

export interface DebateTopic {
  title: string;
  proPosition: string;
  conPosition: string;
}

export interface DebatePhase {
  id: string;
  name?: string;
  title?: string;
  summary?: string;
  speeches?: DebateSpeech[];
  votes?: DebateVote[];
}

export interface DebateSpeech {
  id: string;
  phaseId: string;
  kind: string;
  playerId: string;
  side: string;
  debateRole: string;
  speakerLabel: string;
  text: string;
  targetId?: string | null;
}

export interface DebateVote {
  voterId: string;
  target: string;
  reason?: string;
}

export interface DebateTeamDraft {
  proIds: (number | null)[];
  conIds: (number | null)[];
  judgeIds: (number | null)[];
  proCaptainId?: number | null;
  conCaptainId?: number | null;
  captainEnabled?: boolean;
}

export interface DebateShareReport {
  topic: string;
  proPosition: string;
  conPosition: string;
  proLineup: Player[];
  conLineup: Player[];
  judges: Player[];
  winner: string | null;
  winnerLabel: string;
  winReason: string;
  mvp: Player | null;
  highlights: unknown[];
  judgeComments: unknown[];
  generatedAt: string;
}

export interface PosterSlot {
  x: number;
  avatarY: number;
  nameY: number;
  roleY?: number;
  radius: number;
}

export interface PosterBoxTextOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  color: string;
  weight: string;
  align?: string;
  shadow?: boolean;
  angle?: number;
}

export interface DebateStageStep {
  id?: string;
  ids: string[];
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  [key: string]: unknown;
}
