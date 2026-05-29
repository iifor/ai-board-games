/**
 * 频道解析工具
 * 根据行动类型或角色确定事件应路由的频道和 scopeKey
 */

import { CHANNEL_TYPES } from '../types/channelTypes';
import type { ChannelType } from '../types/channelTypes';
import { SCOPE_ACTION_MAP, ROLE_CHANNEL_MAP } from '../constants/channelMaps';

/** 频道解析结果 */
export interface ChannelInfo {
  channel: ChannelType;
  scopeKey?: string;
}

/** 根据行动类型解析频道 */
export function resolveActionChannel(actionType: string): ChannelInfo {
  const scopeKey = SCOPE_ACTION_MAP[actionType];
  if (scopeKey) return { channel: CHANNEL_TYPES.SCOPE, scopeKey };
  return { channel: CHANNEL_TYPES.PUBLIC };
}

/** 根据角色解析频道 */
export function getChannelForRole(role: string): ChannelInfo {
  const scopeKey = ROLE_CHANNEL_MAP[role];
  if (scopeKey) return { channel: CHANNEL_TYPES.SCOPE, scopeKey };
  return { channel: CHANNEL_TYPES.PUBLIC };
}
