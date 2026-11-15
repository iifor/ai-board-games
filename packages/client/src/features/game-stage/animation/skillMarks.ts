import type { StageEvent } from '@battle/shared';
import type { SkillMark } from './skillTypes';

const NIGHT_MARKS: Readonly<Record<string, readonly [SkillMark['kind'], string]>> = {
  guard_protect: ['shield', '守护'], spirit_wolf_shield: ['shield', '庇护'],
  dreamer_dream: ['dream', '摄梦'], illusionist_illusion: ['dream', '幻影'],
  penguin_freeze: ['frost', '冰冻'], elder_silence: ['seal', '禁言'], nightmare_fear: ['seal', '恐惧'],
  crow_curse: ['seal', '诅咒'], wolf_witch_curse: ['seal', '封印'], magic_wolf_seal: ['seal', '封印'], butterfly_hug: ['seal', '拥抱'],
};
const BONDS = new Set(['cupid_link', 'succubus_link', 'ghost_bride_link', 'wolf_beauty_charm', 'hybrid_choose', 'wild_child_choose']);

/** 只积累已播放且对当前视角可见的状态；夜间状态在新夜晚清空，羁绊持续至出局。 */
export function skillMarks(events: readonly StageEvent[]): readonly SkillMark[] {
  const marks = new Map<string, SkillMark>();
  for (const event of events) {
    if (event.view.gameKey !== 'werewolf') continue;
    if (event.phaseId === 'night_start') {
      for (const [key, mark] of marks) if (key.startsWith('night:') || mark.kind !== 'bond' && mark.kind !== 'reveal' && !key.endsWith(':wound')) marks.delete(key);
    }
    if (event.phaseId === 'dawn') {
      for (const [key, mark] of marks) if (mark.kind === 'shield' || mark.kind === 'dream' || mark.kind === 'trade' || ['冰冻', '恐惧', '拥抱'].includes(mark.label)) marks.delete(key);
    }
    if (event.kind === 'seat_eliminated') {
      for (const [key, mark] of marks) if (mark.seat === event.seat) marks.delete(key);
    }
    if (event.kind === 'action') {
      const status = NIGHT_MARKS[event.phaseId ?? ''];
      if (status) for (const seat of event.targets) marks.set(`${seat}:${status[0]}`, { seat, kind: status[0], label: status[1] });
      if (BONDS.has(event.phaseId ?? '')) for (const seat of event.targets) {
        const partners = event.targets.filter(target => target !== seat).map(target => `${target}号`).join('、');
        const label = event.phaseId === 'cupid_link' ? `情侣${partners ? ' · ' + partners : ''}` : '羁绊';
        marks.set(`${event.phaseId === 'wolf_beauty_charm' ? 'night:' : ''}${seat}:bond`, {seat,kind:'bond',label});
      }
      if (event.phaseId === 'magician_swap') for (const seat of event.targets) marks.set(`${seat}:trade`, { seat, kind: 'trade', label: '号码交换' });
    }
    if (event.kind === 'revealed' && event.phaseId === 'exile_resolve' && /白痴/.test(event.text)) {
      const seat = event.data.seat;
      if (typeof seat === 'number') marks.set(`${seat}:reveal`, { seat, kind: 'reveal', label: '免于放逐 · 失去投票权' });
    }
    if (event.kind === 'narration' && event.channel.startsWith('private:')) {
      const count = event.text.match(/还有\s*(\d+)\s*条尾巴|剩余\s*(\d+)\s*条命/);
      if (count) {
        const seat = Number(event.channel.slice(8));
        marks.set(`${seat}:resource`, { seat, kind: 'reveal', label: count[1] ? `${count[1]}尾` : `${count[2]}命` });
      }
      if (/还剩一条命/.test(event.text)) {
        const seat = Number(event.channel.slice(8));
        marks.set(`${seat}:resource`, { seat, kind: 'reveal', label: '1命' });
      }
    }
    if (event.kind === 'narration' && /负伤状态/.test(event.text)) {
      const seat = Number(/^(\d+)号/.exec(event.text)?.[1]);
      if (Number.isInteger(seat)) marks.set(`${seat}:wound`, { seat, kind: 'poison', label: '负伤 · 延迟出局' });
    }
  }
  return [...marks.values()];
}
