const CHANNEL_TYPES = Object.freeze({
  PUBLIC: 'public',
  SCOPE: 'scope',
  SYSTEM: 'system',
  AUDIENCE: 'audience'
});

type ChannelType = typeof CHANNEL_TYPES[keyof typeof CHANNEL_TYPES];

const SCOPE_KEYS = Object.freeze({
  WOLVES: 'wolves',
  SEER: 'seer',
  GUARD: 'guard',
  WITCH: 'witch',
  player: (id: number | string) => `player:${id}`,
  lovers: (id: number | string) => `lovers:${id}`,
  thirdParty: (name: string) => `third_party:${name}`
});

interface RecipientSnapshot {
  playerId?: number;
  playerIds?: number[];
  faction?: string;
  relationKey?: string;
  snapshotAt: string;
}

interface RenderHint {
  layout?: 'speech' | 'action' | 'reveal' | 'drama' | 'vote';
  focusPlayerIds?: number[];
  tension?: 'low' | 'medium' | 'high' | 'climax';
  audienceOnly?: boolean;
}

interface ViewerContext {
  type: 'player' | 'audience' | 'system';
  playerId?: number;
  faction?: string;
  roles?: string[];
  relations?: string[];
}

export {
  CHANNEL_TYPES,
  SCOPE_KEYS
};

export type {
  ChannelType,
  RecipientSnapshot,
  RenderHint,
  ViewerContext
};
