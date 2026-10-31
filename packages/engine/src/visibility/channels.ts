import type { Channel } from '@battle/shared';
import type { Seat } from '../runtime/types';

export type AudienceMode = 'public' | 'omniscient';

export function teamChannel(team: string): Channel {
  return `team:${team}`;
}

export function privateChannel(seat: number): Channel {
  return `private:${seat}`;
}

/** AI 玩家能否看到某频道的内容；host 频道任何 AI 都看不到 */
export function seatCanSee(channel: Channel, viewer: Seat): boolean {
  if (channel === 'public') return true;
  if (channel === 'host') return false;
  if (channel.startsWith('team:')) return channel === teamChannel(viewer.team);
  return channel === privateChannel(viewer.seat);
}

/**
 * AI 玩家能否看到某条日志：频道可见，且阵营频道的内容不早于该玩家加入阵营的时间
 * （中途改变阵营的座位看不到新阵营此前的内部记录，见 Seat.teamSince）
 */
export function entryVisibleTo(entry: { readonly channel: Channel; readonly seq: number }, viewer: Seat): boolean {
  if (!seatCanSee(entry.channel, viewer)) return false;
  return !(entry.channel.startsWith('team:') && viewer.teamSince !== undefined && entry.seq < viewer.teamSince);
}

/** 观众能否看到；host 频道是运营信息（如兜底记录），不进入观众视图 */
export function audienceCanSee(channel: Channel, mode: AudienceMode): boolean {
  if (channel === 'host') return false;
  return mode === 'omniscient' || channel === 'public';
}
