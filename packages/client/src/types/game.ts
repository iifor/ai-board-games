import type { Player } from './player';
import type { SpeechWordBoundary } from './speech';
import type { DebateTopic, DebatePhase, DebateShareReport } from './debate';
import type { WerewolfRound } from './werewolf';

export interface GameState {
  id?: string;
  type?: string;
  mode?: string;
  topic?: DebateTopic;
  players?: Player[];
  phases?: DebatePhase[];
  rounds?: WerewolfRound[];
  winner?: string | null;
  winReason?: string;
  mvp?: Player | null;
  shareReport?: DebateShareReport;
  event?: { name?: string; background?: string };
  config?: { subtitleMaxChars?: number };
  subtitleMaxChars?: number;
  clientViewMode?: string;
  audienceSession?: { viewerPlayerId?: string };
  createdAt?: string;
  [key: string]: unknown;
}

export interface GameEvent {
  type: string;
  ackId?: string;
  narration?: string;
  message?: string;
  subtitle?: { text?: string; speakerLabel?: string; speakerRole?: string };
  speech?: { playerId: string; text: string; side?: string; fullText?: string; thinking?: string };
  testimony?: { playerId: string; text: string; fullText?: string; thinking?: string };
  wordBoundaries?: SpeechWordBoundary[];
  currentTimeMs?: number;
  audioUrl?: string;
  audioMimeType?: string;
  game?: GameState;
  players?: Player[];
  phase?: string | { speeches?: unknown[]; stageSummary?: string };
  round?: WerewolfRound;
  shot?: { from: string; target: string };
  seerCheck?: { target: string; result?: string };
  sheriffCandidateIds?: number[];
  playerId?: string;
  thinking?: string;
  [key: string]: unknown;
}

export type GameStatus = 'idle' | 'streaming' | 'ready' | 'error';
