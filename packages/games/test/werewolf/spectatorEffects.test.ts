import { describe, expect, it } from 'vitest';
import { nightDeathCauseSchema } from '../../src/werewolf/state';
import { nightDeathEffect } from '../../src/werewolf/rules/spectatorEffects';
import { act, combine, entries, first, play, roleSeats, wolvesKill } from './helpers';

const board = 'white-wolf-king-guard-12';
const seed = 11;
const guard = first(seed, 'guard', board);
const victim = first(seed, 'villager', board);
const witch = first(seed, 'witch', board);

describe('夜间结算动效', () => {
  it.each([
    [true, false, 'shield'], [false, true, 'heal'], [false, false, 'blade'], [true, true, 'blade'],
  ] as const)('守护 %s、解药 %s 的实际狼刀结算为 %s', (protectedSeat, saved, expected) => {
    const record = play(seed, combine(wolvesKill(victim, 1),
      act('guard_protect', guard, protectedSeat ? [victim] : [], 1),
      act('witch_save', witch, saved ? [victim] : [], 1)), board);
    const cues = record.stageEvents.flatMap(e => e.channel === 'spectator' && e.kind === 'revealed' && e.round === 1 && e.data.target === victim ? [e.data.effect] : []);
    expect(cues).toEqual([expected]);
    const effect = record.stageEvents.find(e => e.round === 1 && e.kind === 'revealed' && e.data.target === victim && e.data.effect === expected);
    expect(effect?.kind === 'revealed' && effect.data.announcement).toBe('dawn');
    expect(entries(record, 'narration', 'dawn')[0]?.text).toContain(expected === 'blade' ? `昨晚${victim}号出局。` : '昨晚是平安夜。');
  });

  it('所有夜死原因均交给晨报朗读', () => {
    for (const cause of nightDeathCauseSchema.options) {
      expect(nightDeathEffect(victim, cause)).toMatchObject({ kind: 'revealed', channel: 'spectator', data: { announcement: 'dawn' } });
    }
  });

  it.each([true, false])('另一名玩家被毒时，晨报名单按实际伤亡生成（守护 %s）', protectedSeat => {
    const poisoned = roleSeats(seed, 'villager', board).find(seat => seat !== victim)!;
    const record = play(seed, combine(wolvesKill(victim), act('guard_protect', guard, protectedSeat ? [victim] : [], 1),
      act('witch_save', witch, [], 1), act('witch_poison', witch, [poisoned], 1)), board);
    const deaths = protectedSeat ? [poisoned] : [victim, poisoned].sort((a, b) => a - b);
    const news = entries(record, 'narration', 'dawn').filter(event => event.round === 1);
    expect(news.map(event => event.text)).toEqual([`昨晚${deaths.map(seat => seat + '号').join('、')}出局。`]);
  });
});
