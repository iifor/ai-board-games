import type { StreamSocket } from './protocol';
import { createMatchStream, type MatchStream, type StreamDeps, type StreamOptions } from './session';

/** 实时推送服务：持有播放流需要的仓储、总线、语音与配置，网关只通过它打开播放流 */
export function createRealtimeService(deps: StreamDeps, options: StreamOptions) {
  return {
    open: (matchId: string, socket: StreamSocket): MatchStream => createMatchStream(matchId, socket, deps, options),
  };
}

export type RealtimeService = ReturnType<typeof createRealtimeService>;
