import type { StageEvent } from '@battle/shared';

/** 随机角色观战只额外知道自己的身份；同阵营和本人的私聊也不进入这条流。 */
export function forPlayerSeat(event: StageEvent, viewer: number): StageEvent | null {
  if (event.channel !== 'public') return null;
  const { view } = event;
  const seats = view.seats.map((s) => {
    // 公开模式生成的快照已经由引擎隐藏身份；上帝快照携带 publicRoles。
    if (s.seat === viewer || !view.publicRoles || view.publicRoles.includes(s.seat)) return s;
    const shown = view.shownRoles?.[s.seat];
    return { ...s, role: shown?.role ?? null, roleName: shown?.roleName ?? null, team: null, position: null };
  });
  return { ...event, view: { ...view, seats } };
}
