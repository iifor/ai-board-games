import type { StageEvent } from '@battle/shared';
export { describeEvent, type EventDisplay } from '@battle/shared';

export function hostLabel(event: StageEvent): string {
  if (event.kind !== 'narration' || !event.channel.startsWith('private:')) return '主持人';
  const seat = Number(event.channel.slice('private:'.length));
  const role = event.view.seats.find((candidate) => candidate.seat === seat)?.roleName;
  return `法官 → ${role ?? seat + '号'}`;
}

/** 没有音频时的展示时长：按字数估算（不封顶，长发言静音时也要展示完），倍速缩短 */
export function displayDuration(text: string | null, speed: number): number {
  const base = text ? Math.max(900, text.length * 160) : 400;
  return Math.round(base / speed);
}
/** 无计票字幕时给选票飞行、票数条和阅读结果留出时间。 */
export function voteBoardDuration(event: Extract<StageEvent, { kind: 'vote_tallied' }>): number {
  return 4000 + 250 * event.tally.length;
}

