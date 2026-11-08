import type { StageEvent } from '@battle/shared';
import { isSkillKind, phaseEffect, type SkillKind } from './skillCatalog';

export interface SkillCue {
  readonly kind: SkillKind;
  readonly title: string;
  readonly actor: number | null;
  readonly targets: readonly number[];
}

// 这些 act 使用自己的座位号表达“确定”，真实受益人/受害者在随后的结算中给出。
const SELF_CONFIRMATION = new Set(['sheriff_signup','sheriff_withdraw','big_bad_wolf_decide','merchant_skill_check','merchant_skill_gun','bombman_blast','thief_choose']);

export function skillCue(event: StageEvent): SkillCue | null {
  if (event.view.gameKey !== 'werewolf') return null;
  const kind = phaseEffect(event.phaseId);
  if (event.kind === 'vote_tallied' && event.phaseId === 'wolf_kill') {
    return event.outcome?.kind === 'selected' ? { kind: 'blade', title: '狼刀锁定', actor: null, targets: [event.outcome.seat] } : null;
  }
  if (event.kind === 'action') {
    if (!event.targets.length && event.phaseId !== 'thief_choose' && event.action !== '自爆') return null;
    const targets = SELF_CONFIRMATION.has(event.phaseId ?? '') ? [] : event.targets;
    return { kind: event.action === '自爆' ? 'blast' : kind ?? 'reveal', title: event.action, actor: event.seat, targets };
  }
  if (event.kind === 'revealed') {
    const { effect, target, title, seat } = event.data;
    if (isSkillKind(effect) && typeof target === 'number' && typeof title === 'string') return { kind: effect, title, actor: null, targets: [target] };
    if (event.phaseId === 'postgame_reveal') return null;
    return { kind: kind ?? 'reveal', title: event.phaseId === 'knight_hit' ? '决斗命中' : event.phaseId === 'knight_miss' ? '决斗反噬' : '身份揭示',
      actor: typeof seat === 'number' ? seat : null, targets: typeof target === 'number' ? [target] : Array.isArray(event.data.targets) ? event.data.targets.filter((n): n is number => typeof n === 'number') : [] };
  }
  if (event.kind === 'seat_eliminated') return { kind: kind ?? 'reveal', title: event.reason, actor: null, targets: [event.seat] };
  if (event.kind === 'narration' && (kind || event.channel.startsWith('private:'))) {
    const recipient = event.channel.startsWith('private:') ? Number(event.channel.slice(8)) : null;
    return { kind: kind ?? 'reveal', title: event.view.phase?.title?.match(/[\u3400-\u9fff]/) ? event.view.phase.title : '技能反馈', actor: null, targets: recipient === null ? [] : [recipient] };
  }
  return null;
}
