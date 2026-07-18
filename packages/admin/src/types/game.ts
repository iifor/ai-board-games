export type GameType = 'debate' | 'werewolf' | 'undercover' | 'consensus';

export interface GameTopic {
  title?: string;
  proPosition?: string;
  conPosition?: string;
}

export interface GamePlayer {
  id: number | string;
  playerId?: number;
  nickname?: string;
  name?: string;
  side?: string;
  camp?: string;
  faction?: string;
  team?: string;
  role?: string;
  identity?: string;
  sideIndex?: number;
  sideLabel?: string;
  roleLabel?: string;
  _rowKey?: string;
}

export interface WerewolfModeRef {
  id: string;
  name?: string;
  winCondition?: string;
  roles?: Array<{ roleId: string; name?: string; count: number }>;
}

export interface GameEvent {
  name?: string;
  mode?: string;
  modeId?: string;
  werewolfMode?: WerewolfModeRef;
}

export interface Game {
  id: string;
  gameType: GameType;
  type?: string;
  mode: string;
  modeName?: string;
  topic: GameTopic;
  winner: string;
  players: GamePlayer[];
  rounds: unknown[];
  createdAt: string;
  skinName?: string;
  event?: GameEvent;
  werewolfMode?: { id: string };
}

export interface PreloadTask {
  id: string;
  status: string;
  done: number;
  total: number;
  generated: number;
  cached: number;
  skipped: number;
  failed: number;
  error?: string;
}
