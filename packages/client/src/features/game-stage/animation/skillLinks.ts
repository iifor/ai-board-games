import type { StageEvent } from '@battle/shared';

/** 只能沿已经可见的羁绊行动连线，不能从角色表猜情侣或魅惑对象。 */
export function linkedSource(event: StageEvent, history: readonly StageEvent[], target: number): number | null {
  const links = new Set(['cupid_link', 'succubus_link', 'ghost_bride_link', 'wolf_beauty_charm']);
  for (const action of [...history].reverse()) {
    if (action.seq >= event.seq || action.kind !== 'action' || !links.has(action.phaseId ?? '')) continue;
    const partners = action.phaseId === 'cupid_link' ? action.targets : [action.seat, ...action.targets];
    if (!partners.includes(target)) continue;
    const source = partners.find((seat) => seat !== target && event.view.seats.some((shown) => shown.seat === seat && !shown.alive));
    if (source !== undefined) return source;
  }
  return null;
}
