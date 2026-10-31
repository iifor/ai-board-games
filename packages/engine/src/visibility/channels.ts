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

/** 观众能否看到；host 频道是运营信息（如兜底记录），不进入观众视图 */
export function audienceCanSee(channel: Channel, mode: AudienceMode): boolean {
  if (channel === 'host') return false;
  return mode === 'omniscient' || channel === 'public';
}
