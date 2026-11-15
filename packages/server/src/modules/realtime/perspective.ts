import type { StageEvent } from '@battle/shared';

/** 情侣关系已进入玩家私密认知；通知留在后台，不占用前台舞台或语音。 */
export function visibleOnStage(event: StageEvent): boolean {
  return !(event.view.gameKey === 'werewolf' && event.kind === 'narration'
    && event.phaseId === 'cupid_bond' && event.channel.startsWith('private:'));
}

/** 狼人杀的单座位观众可接收法官对本人的通知和本人的私密行动。 */
export function visibleToPlayerSeat(event: StageEvent, viewer: number): boolean {
  if (event.channel === 'public') return true;
  return event.view.gameKey === 'werewolf' && event.channel === `private:${viewer}` &&
    (event.kind === 'narration' || (event.kind === 'action' && event.seat === viewer));
}

export function forPlayerSeat(event: StageEvent, viewer: number): StageEvent | null {
  if (!visibleToPlayerSeat(event, viewer)) return null;
  const { view } = event;
  const legacyPublic = !view.publicRoles && (view.gameKey !== 'werewolf' || view.status === 'completed'
    || (event.kind === 'revealed' && event.phaseId === 'postgame_reveal' && Array.isArray(event.data.roles)));
  const seats = view.seats.map((s) => {
    // 旧狼人杀快照可能没有公开身份清单，开局时仍只展示所选座位。
    if (s.seat === viewer || legacyPublic || view.publicRoles?.includes(s.seat)) return s;
    const shown = view.shownRoles?.[s.seat];
    return { ...s, role: shown?.role ?? null, roleName: shown?.roleName ?? null, team: null, position: null };
  });
  return { ...event, view: { ...view, seats } };
}
