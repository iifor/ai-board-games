import type { StageEvent } from '@battle/shared';
import { phaseEffect } from './skillCatalog';
import { resultCue } from './skillResults';
import type { SkillCue } from './skillTypes';
export type { SkillCue } from './skillTypes';

// 这些 act 使用自己的座位号表达“确定”，真实受益人/受害者在随后的结算中给出。
const SELF_CONFIRMATION = new Set(['sheriff_signup','sheriff_withdraw','big_bad_wolf_decide','merchant_skill_check','merchant_skill_gun','bombman_blast','thief_choose']);

export function skillCue(event: StageEvent, history: readonly StageEvent[] = []): SkillCue | null {
  if (event.view.gameKey !== 'werewolf') return null;
  const kind = phaseEffect(event.phaseId);
  if (event.kind === 'vote_tallied' && kind === 'blade') {
    return event.outcome?.kind === 'selected' ? { kind: 'blade', title: event.phaseId === 'wolf_kill' ? '狼刀锁定' : `${event.view.phase?.title ?? '击杀'}锁定`, actor: null, stage: 'cast', targets: [event.outcome.seat], sources: [...new Set(event.ballots.map((ballot) => ballot.voter))] } : null;
  }
  if (event.kind === 'action') {
    const exploding = event.action === '自爆';
    const destroyingBadge = event.phaseId === 'badge_transfer' && !event.targets.length;
    if (!event.targets.length && event.phaseId !== 'thief_choose' && !exploding && !destroyingBadge) return null;
    if (!kind && !exploding) return null;
    const targets = SELF_CONFIRMATION.has(event.phaseId ?? '') ? [] : event.targets;
    const inspect = (kind === 'inspect' || event.phaseId === 'spirit_wolf_learn') && (event.inspectionResult || event.text.includes('：'));
    const feedback = inspect ? event.inspectionResult ?? event.text.split('：').slice(1).join('：') : undefined;
    const tone = feedback && /没有狼人|好人/.test(feedback) ? 'good' : feedback && /狼人/.test(feedback) ? 'evil' : 'neutral';
    const route = event.phaseId === 'magician_swap' ? 'swap'
      : event.phaseId === 'fox_inspect' ? 'area'
      : event.phaseId === 'spirit_wolf_learn' || event.phaseId === 'thief_choose' ? 'learn'
      : kind === 'trade' ? 'gift' : destroyingBadge ? 'shatter' : undefined;
    // 狐狸只画相邻三人的检查范围，不透露其中任何一个人的身份。
    const area = route === 'area' ? event.view.seats.filter((seat) => seat.alive).map((seat) => seat.seat) : [];
    const index = area.indexOf(targets[0] ?? -1);
    const scopedTargets = index >= 0 ? [-1, 0, 1].map((offset) => area[(index + offset + area.length) % area.length]!).filter((seat, i, all) => all.indexOf(seat) === i) : targets;
    return { kind: exploding ? 'blast' : kind!, title: event.action, actor: event.seat,
      targets: exploding && !targets.length ? [event.seat] : scopedTargets, stage: 'cast',
      ...(route ? { route } : {}), ...(feedback ? { feedback, tone } : {}) };
  }
  return resultCue(event, history);
}
