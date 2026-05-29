import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { resolveActionChannel as resolveChannel } from '@ai-presenter/shared/utils/channelResolution';
import type { ChannelInfo } from '@ai-presenter/shared/utils/channelResolution';

// Re-export from shared (backward-compatible)
interface ActionChannelInfo {
  channel: ChannelType;
  scopeKey?: string;
}

function resolveActionChannel(actionType: string): ActionChannelInfo {
  const { channel, scopeKey } = resolveChannel(actionType);
  const info: ActionChannelInfo = { channel };
  if (scopeKey) info.scopeKey = scopeKey;
  return info;
}

export { resolveActionChannel };
