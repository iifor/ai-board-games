import type { StageEvent } from '@battle/shared';
import { isSkillKind, phaseEffect } from './skillCatalog';
import type { SkillCue } from './skillTypes';
import { linkedSource } from './skillLinks';

/** 结果只消费投影后收到的事件，不查身份表，也不自行计算伤亡。 */
export function resultCue(event: StageEvent, history: readonly StageEvent[]): SkillCue | null {
  const kind = phaseEffect(event.phaseId);
  if (event.kind === 'revealed') {
    const { effect, target, title, seat } = event.data;
    if (isSkillKind(effect) && typeof target === 'number' && typeof title === 'string') {
      const hunt = title === '狩猎结算' ? history.findLast((item) => item.seq < event.seq && item.round === event.round && item.kind === 'action' && item.phaseId === 'demon_hunter_hunt') : undefined;
      if (hunt?.kind === 'action' && (hunt.seat === target || hunt.targets.includes(target))) {
        return { kind: 'duel', title, actor: hunt.seat === target ? hunt.targets[0] ?? null : hunt.seat, targets: [target],
          stage: 'result', feedback: title, ...(hunt.seat === target ? { route: 'reflect' as const } : {}) };
      }
      const illusion = history.findLast((item) => item.seq < event.seq && item.round === event.round && item.kind === 'action' && item.phaseId === 'illusionist_illusion' && item.targets.includes(target));
      const redirected = illusion?.kind === 'action' && history.some((item) => item.round === event.round && item.seq < event.seq &&
        (item.kind === 'vote_tallied' && item.phaseId === 'wolf_kill' && item.outcome?.kind === 'selected' && item.outcome.seat === illusion.seat ||
          item.kind === 'action' && item.phaseId === 'witch_poison' && item.targets.includes(illusion.seat)));
      const reflected = /恶灵反伤/.test(title) ? history.findLast((item) => item.seq < event.seq && item.round === event.round && item.kind === 'action' && item.seat === target &&
        ['witch_poison', 'seer_check', 'seer_check_late'].includes(item.phaseId ?? '')) : undefined;
      return { kind: effect, title, actor: null, targets: [target], stage: 'result', feedback: title,
        ...(effect === 'bond' ? { actor: linkedSource(event, history, target) } : {}),
        ...(redirected ? { actor: illusion.seat, route: 'redirect' as const }
          : reflected?.kind === 'action' ? { actor: reflected.targets[0] ?? null, route: 'reflect' as const }
          : /反伤|反噬/.test(title) ? { route: 'reflect' as const } : {}) };
    }
    if (event.phaseId === 'postgame_reveal') return null;
    const actor = typeof seat === 'number' ? seat : null;
    const targets = typeof target === 'number' ? [target] : Array.isArray(event.data.targets) ? event.data.targets.filter((n): n is number => typeof n === 'number') : [];
    if (event.phaseId === 'knight_miss' && actor !== null) {
      return { kind: 'duel', title: '决斗反噬', actor: targets[0] ?? null, targets: [actor], stage: 'result', route: 'reflect', feedback: '决斗失败 · 骑士出局' };
    }
    return { kind: kind ?? 'reveal', title: event.phaseId === 'knight_hit' ? '决斗命中' : '身份揭示', actor,
      ...(/白痴/.test(event.text) && event.phaseId === 'exile_resolve' ? { route: 'shatter' as const } : {}),
      targets: targets.length ? targets : actor === null ? [] : [actor], stage: 'result', feedback: event.text };
  }
  if (event.kind === 'seat_eliminated') {
    const previous = history.filter((item) => item.seq < event.seq).at(-1);
    const source = /殉情|连锁|魅惑/.test(event.reason) ? linkedSource(event, history, event.seat) ?? (previous?.kind === 'seat_eliminated' ? previous.seat : null) : null;
    return { kind: /殉情|连锁|魅惑/.test(event.reason) ? 'bond' : kind ?? 'reveal', title: event.reason,
      actor: source, targets: [event.seat], stage: 'result', feedback: event.reason };
  }
  if (event.kind !== 'narration' || event.purpose === 'decision') return null;
  if (event.phaseId === 'night_start') return null;
  if (event.phaseId === 'dawn') {
    const freeze = history.findLast((item) => item.seq < event.seq && item.round === event.round && item.kind === 'action' && item.phaseId === 'penguin_freeze');
    const thaw = freeze?.kind === 'action' ? freeze.targets.filter((seat) => event.view.seats.some((shown) => shown.seat === seat && shown.alive)) : [];
    return { kind: 'heal', title: event.text, actor: null, targets: [], stage: 'result', route: 'area', feedback: event.text, ...(thaw.length ? { thaw } : {}) };
  }
  if (event.phaseId === 'sheriff_resolve' && typeof event.view.extra.sheriff === 'number') {
    return { kind: 'badge', title: '当选警长', actor: null, targets: [event.view.extra.sheriff], stage: 'result', feedback: '当选警长' };
  }
  if (event.phaseId === 'fortune_notice') {
    const range = /只能击杀\s*(.+?)\s*中的/.exec(event.text);
    if (range) return { kind: 'inspect', title: '占卜范围', actor: null, targets: [...new Set([...range[1]!.matchAll(/(\d+)号/g)].map((match) => Number(match[1])))],
      stage: 'result', route: 'area', feedback: event.text };
  }
  const recipient = event.channel.startsWith('private:') ? Number(event.channel.slice(8)) : null;
  const actionPhase = event.phaseId === 'hunter_resolve' ? 'hunter_shot' : event.phaseId?.replace(/_resolve$/, '');
  const action = history.findLast((item) => item.seq < event.seq && item.round === event.round &&
    (item.phaseId === event.phaseId || item.phaseId === actionPhase) && item.kind === 'action');
  if (!kind && recipient === null) return null;
  const publicTarget = (event.phaseId === 'crow_announce' ? /诅咒了\s*(\d+)号/ : /^(\d+)号/).exec(event.text);
  const resource = /失去了一条命|还剩一条命/.test(event.text);
  const linkedTarget = publicTarget && /殉情/.test(event.text) ? Number(publicTarget[1]) : null;
  return { kind: resource ? 'shield' : event.phaseId === 'big_tree_fall' ? 'seal' : kind ?? 'reveal', title: event.view.phase?.title ?? '技能反馈',
    actor: linkedTarget === null ? action?.kind === 'action' ? action.seat : null : linkedSource(event, history, linkedTarget),
    targets: recipient !== null && Number.isInteger(recipient) ? [recipient] : publicTarget ? [Number(publicTarget[1])] : action?.kind === 'action' ? action.targets : [],
    stage: 'result', feedback: event.text };
}
