import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, roleSeats, stateOf, type Override } from '../helpers';

const BOARD = 'wolf-beauty-rogue-12';
const SEED = 1;
const rogue = first(SEED, 'old_rogue', BOARD);
const beauty = first(SEED, 'wolf_beauty', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const [wolf = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0] = roleSeats(SEED, 'villager', BOARD);

const charm = (target: number, night: number) => act('wolf_beauty_charm', beauty, [target], night);
const daySpeakers = (run: ReturnType<typeof play>, round: number) =>
  entries(run, 'speech', 'day_speech').filter((entry) => entry.round === round).map((entry) => entry.seat);
const phasesOf = (run: ReturnType<typeof play>, round: number) => run.log.flatMap((entry) => {
  if (entry.round !== round) return [];
  if (entry.kind === 'phase_started') return [entry.title];
  return entry.kind === 'seat_eliminated' ? [`出局${entry.seat}`] : [];
});

describe('wolf-beauty-rogue board', () => {
  it('deals an idiot, an old rogue and three villagers', () => {
    const roles = play(SEED, undefined, BOARD).snapshot.seats.map((seat) => seat.role);
    expect(roles.filter((role) => role === 'villager')).toHaveLength(3);
    expect(roles).toEqual(expect.arrayContaining(['idiot', 'old_rogue', 'wolf_beauty']));
  });
});

describe('old rogue', () => {
  it('survives the poison silently and leaves after the next day’s speeches', () => {
    const run = play(SEED, act('witch_poison', witch, [rogue], 1), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
    expect(run.log.some((entry) => 'text' in entry && entry.channel === 'public' && entry.text.includes('中毒'))).toBe(false);
    expect(eliminated(run)[0]).toEqual({ seat: rogue, round: 2, reason: '发言结束后出局' });
    expect(daySpeakers(run, 2)).toContain(rogue);
    const roundTwo = phasesOf(run, 2);
    expect(roundTwo.indexOf(`出局${rogue}`)).toBeGreaterThan(roundTwo.indexOf('白天发言'));
    expect(roundTwo.indexOf(`出局${rogue}`)).toBeLessThan(roundTwo.indexOf('放逐投票'));
    expect(entries(run, 'speech', 'last_words')).toHaveLength(0);
    expect(stateOf(run.snapshot).potions.poison).toBe(false);
  });

  it('is announced as wounded when shot and leaves after the next day’s speeches', () => {
    const run = play(SEED, combine(everyoneVotes('exile_vote', hunter, 1), act('hunter_shot', hunter, [rogue])), BOARD);
    expect(entries(run, 'narration', 'hunter_resolve')[0]?.text).toBe(`${rogue}号中枪后进入负伤状态，没有立即出局。`);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: hunter, round: 1, reason: '被放逐' },
      { seat: rogue, round: 2, reason: '伤重出局' },
    ]);
  });

  it('leaves right after a self-destruct cuts the speeches short on the due day', () => {
    const blast: Override = (request, snapshot) => request.phaseId === 'day_speech' && request.seat === wolf && snapshot.round === 2
      ? { speech: '我自爆。', declare: 'selfDestruct' }
      : undefined;
    const run = play(SEED, combine(act('witch_poison', witch, [rogue], 1), blast), BOARD);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: wolf, round: 2, reason: '自爆' },
      { seat: rogue, round: 2, reason: '发言结束后出局' },
    ]);
  });

  it('ignores the wolf beauty’s charm', () => {
    const run = play(SEED, combine(charm(rogue, 1), everyoneVotes('exile_vote', beauty, 1)), BOARD);
    expect(eliminated(run).filter((death) => death.round === 1)).toEqual([{ seat: beauty, round: 1, reason: '被放逐' }]);
  });
});

describe('weakened wolf beauty', () => {
  it('takes nobody with her when poisoned', () => {
    const run = play(SEED, combine(charm(villager, 1), act('witch_poison', witch, [beauty], 1)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe(`天亮了，昨晚死亡的是：${beauty}号。`);
    expect(run.requests[0]?.request.prompt.rules).toContain('本局的狼美人被女巫毒杀时不能带走被魅惑的玩家');
  });

  it('still takes the charmed player when exiled', () => {
    const run = play(SEED, combine(charm(villager, 1), everyoneVotes('exile_vote', beauty, 1)), BOARD);
    expect(eliminated(run).slice(0, 2).map((death) => death.seat)).toEqual([beauty, villager]);
  });
});
