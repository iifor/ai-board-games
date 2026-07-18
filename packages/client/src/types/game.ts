import type { Player } from './player';
import type { SpeechWordBoundary } from './speech';
import type { DebateTopic, DebatePhase, DebateShareReport } from './debate';
import type { WerewolfRound } from './werewolf';

export interface GameState {
  id?: string;
  gameType?: string;
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
  selfDestruct?: { playerId?: string | number; text?: string; day?: number; targetId?: string | number | null };
  seerCheck?: { target: string; result?: string; reason?: string | null };
  guardAction?: { target?: string | null; reason?: string | null };
  witchAction?: { use: boolean; target?: string | null; reason?: string | null };
  hybridMaster?: { actorId?: string | number; masterId?: string | number | null };
  silencedPlayerId?: string | number | null;
  knightDuel?: { actorId?: string | number; targetId?: string | number; targetFaction?: string; success?: boolean; reason?: string | null };
  butterflyTarget?: string | number | null;
  stalkerTarget?: string | number | null;
  wolfBeautyTarget?: string | number | null;
  demonInspect?: { target?: string | number | null; result?: string; reason?: string | null };
  nightmareTarget?: string | number | null;
  penguinFrozenId?: string | number | null;
  foxInspect?: { targetIds?: Array<string | number>; hasWolf?: boolean; reason?: string | null } | null;
  dreamerTarget?: string | number | null;
  magicianSwap?: { firstTarget?: string | number | null; secondTarget?: string | number | null; reason?: string | null } | null;
  fortuneTellerMark?: { target?: string | number | null; reason?: string | null } | null;
  bigBadWolfTarget?: string | number | null;
  crowCurse?: { target?: string | number | null; reason?: string | null } | null;
  blackMerchantGift?: { actorId?: string | number; targetId?: string | number; gift?: string; success?: boolean; reason?: string | null } | null;
  luckySeerCheck?: { actorId?: string | number; target?: string | number | null; result?: string; reason?: string | null } | null;
  luckyPoisonTarget?: string | number | null;
  youngerBrotherTarget?: string | number | null;
  bearRoar?: { roaring?: boolean; adjacentWolfIds?: Array<string | number> } | null;
  escapeHunterTarget?: string | number | null;
  escapeHunterChoices?: Record<string, string | number>;
  escapeHunterVoteTally?: Record<string, number>;
  wolfSeedInfect?: { actorId?: string | number; targetId?: string | number; used?: boolean; success?: boolean; reason?: string | null } | null;
  heavenlyEyeCheck?: { target?: string | number | null; roleId?: string; roleName?: string; reason?: string | null } | null;
  requesterPrayer?: { actorId?: string | number; targetId?: string | number; result?: string; reason?: string | null } | null;
  requesterTarget?: string | number | null;
  thiefChoice?: { actorId?: string | number; roleId?: string; offeredRoleIds?: string[]; reason?: string | null } | null;
  loverLink?: { actorId?: string | number; targetIds?: Array<string | number>; source?: string; reason?: string | null } | null;
  succubusLink?: { actorId?: string | number; targetIds?: Array<string | number>; reason?: string | null } | null;
  ghostBrideLink?: { actorId?: string | number; partnerId?: string | number; witnessId?: string | number; reason?: string | null } | null;
  ghostBrideChat?: { playerId?: string | number; text?: string; thinking?: string }[];
  ghostBrideTarget?: string | number | null;
  spiritWolfLearn?: { actorId?: string | number; targetId?: string | number; learnedRole?: string; reason?: string | null } | null;
  spiritWolfInspect?: { target?: string | number | null; result?: string; reason?: string | null } | null;
  spiritWolfGuardTarget?: string | number | null;
  spiritWolfAntidoteTarget?: string | number | null;
  wolfWitchCurse?: { actorId?: string | number; targetId?: string | number; reason?: string | null } | null;
  illusionTarget?: string | number | null;
  bombmanBlast?: { actorId?: string | number; targetIds?: Array<string | number> } | null;
  evilKnightTrigger?: { actorId?: string | number; trigger?: string; targetId?: string | number } | null;
  oldRoguePendingDeath?: { playerId?: string | number; reason?: string; sourceAction?: string; announced?: boolean } | null;
  voterId?: number;
  targetId?: number;
  mvp?: Player | null;
  sheriffCandidateIds?: number[];
  playerId?: string;
  thinking?: string;
  [key: string]: unknown;
}

export type GameStatus = 'idle' | 'streaming' | 'ready' | 'error';
