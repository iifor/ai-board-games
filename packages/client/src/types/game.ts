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
  mvpVotes?: Record<string, number>;
  mvpVoteTally?: Record<string, number>;
  postgameSpeeches?: Record<string, PostgameSpeech>;
  shareReport?: DebateShareReport;
  event?: { name?: string; background?: string };
  config?: { subtitleMaxChars?: number };
  subtitleMaxChars?: number;
  clientViewMode?: string;
  debugMode?: boolean;
  audienceSession?: { viewerPlayerId?: string };
  createdAt?: string;
  [key: string]: unknown;
}

export interface PostgameSpeech {
  playerId: number;
  text: string;
  thinking?: string;
  phase: 'postgame';
}

export interface GameEvent {
  type: string;
  actionType?: string;
  ackId?: number | string;
  text?: string;
  narration?: string;
  message?: string;
  audienceCue?: {
    kind: string;
    display?: 'modal' | 'none';
    speech?: 'browser' | 'none';
    textField?: 'text' | 'message' | 'narration';
    once?: boolean;
  };
  presentation?: {
    speakableText?: string;
    displayText?: string;
    displayMode?: string;
    uiHint?: string;
    suppressSpeech?: boolean;
  };
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
  reason?: string | null;
  selfDestruct?: { playerId?: string | number; text?: string; day?: number };
  seerCheck?: { target: string; result?: string; reason?: string | null };
  guardAction?: { target?: string | null; reason?: string | null };
  witchAction?: { use: boolean; target?: string | null; reason?: string | null };
  voterId?: number;
  targetId?: number;
  mvp?: Player | null;
  sheriffCandidateIds?: number[];
  playerId?: string;
  thinking?: string;
  [key: string]: unknown;
}

export type GameStatus = 'idle' | 'streaming' | 'ready' | 'error';
