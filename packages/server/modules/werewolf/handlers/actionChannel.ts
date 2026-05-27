import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';

interface ActionChannelInfo {
  channel: ChannelType;
  scopeKey?: string;
}

const SCOPE_ACTION_MAP: Record<string, string> = {
  wolf_kill: 'wolves',
  wolf_speech: 'wolves',
  wolf_vote: 'wolves',
  seer_check: 'seer',
  guard_protect: 'guard',
  witch_save: 'witch',
  witch_poison: 'witch'
};

function resolveActionChannel(actionType: string): ActionChannelInfo {
  const scopeKey = SCOPE_ACTION_MAP[actionType];
  if (scopeKey) return { channel: CHANNEL_TYPES.SCOPE, scopeKey };
  return { channel: CHANNEL_TYPES.PUBLIC };
}

export { resolveActionChannel };
