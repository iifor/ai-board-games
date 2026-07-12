import type { ChannelType, ViewerContext } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';

interface ScopedEvent {
  channel: ChannelType | string;
  scopeKey?: string;
  [key: string]: unknown;
}

function canAccess(event: ScopedEvent, viewer: ViewerContext): boolean {
  if (event.channel === CHANNEL_TYPES.SYSTEM) return viewer.type === 'system';
  if (event.channel === CHANNEL_TYPES.PUBLIC) return true;
  if (event.channel === CHANNEL_TYPES.AUDIENCE) return viewer.type === 'audience';
  if (event.channel === CHANNEL_TYPES.SCOPE) return matchScope(event.scopeKey || '', viewer);
  return false;
}

function matchScope(scopeKey: string, viewer: ViewerContext): boolean {
  if (!scopeKey) return false;

  if (scopeKey.startsWith('player:')) {
    return viewer.playerId === Number(scopeKey.split(':')[1]);
  }

  if (scopeKey === 'wolves') return viewer.faction === 'wolves';

  if (scopeKey === 'escape_hunters') {
    return viewer.faction === 'hunters' && (viewer.roles || []).includes('escape_hunter');
  }

  if (scopeKey === 'ghost_bride') {
    return viewer.faction === 'third_party' || (viewer.roles || []).includes('ghost_bride');
  }

  if (['seer', 'guard', 'witch'].includes(scopeKey)) {
    return (viewer.roles || []).includes(scopeKey);
  }

  if (scopeKey.startsWith('lovers:')) {
    return (viewer.relations || []).includes(scopeKey);
  }

  if (scopeKey.startsWith('third_party:')) {
    return viewer.faction === scopeKey;
  }

  return false;
}

function filterEventsForViewer<T extends ScopedEvent>(events: T[], viewer: ViewerContext): T[] {
  return events.filter((event) => canAccess(event, viewer));
}

function buildViewerContext(params: {
  type: 'player' | 'audience' | 'system';
  playerId?: number;
  faction?: string;
  roles?: string[];
  relations?: string[];
}): ViewerContext {
  return {
    type: params.type,
    playerId: params.playerId,
    faction: params.faction,
    roles: params.roles || [],
    relations: params.relations || []
  };
}

function buildWolfViewerContext(playerId: number): ViewerContext {
  return buildViewerContext({ type: 'player', playerId, faction: 'wolves', roles: [] });
}

function buildRoleViewerContext(playerId: number, role: string, faction?: string): ViewerContext {
  return buildViewerContext({ type: 'player', playerId, faction, roles: [role] });
}

function buildAudienceViewerContext(): ViewerContext {
  return buildViewerContext({ type: 'audience' });
}

function buildSystemViewerContext(): ViewerContext {
  return buildViewerContext({ type: 'system' });
}

export {
  canAccess,
  matchScope,
  filterEventsForViewer,
  buildViewerContext,
  buildWolfViewerContext,
  buildRoleViewerContext,
  buildAudienceViewerContext,
  buildSystemViewerContext
};

export type { ScopedEvent };
