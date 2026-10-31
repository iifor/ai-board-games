import { describe, expect, it } from 'vitest';
import { combine, eliminated, entries, first, play, requestsIn, roleSeats, wolvesKill, type Override } from '../helpers';

const BOARD = 'nine-tailed-fox-12';
const SEED = 1;
const fox = first(SEED, 'nine_tailed_fox', BOARD);
const seer = first(SEED, 'seer', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const [wolfA = 0, wolfB = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villagerA = 0, villagerB = 0, villagerC = 0] = roleSeats(SEED, 'villager', BOARD);

/** 每晚狼刀 kills[n-1]、每天放逐 exiles[n-1] */
function schedule(kills: readonly number[], exiles: readonly number[]): Override {
  return (request, snapshot) => {
    if (request.phaseId === 'wolf_kill') return { target: kills[snapshot.round - 1] ?? null };
    if (request.phaseId !== 'exile_vote') return undefined;
    const target = exiles[snapshot.round - 1];
    return { target: target !== undefined && (request.legalTargets ?? []).includes(target) ? target : null };
  };
}
const tailChecks = (run: ReturnType<typeof play>) => entries(run, 'narration', 'fox_check').map((entry) => entry.text);
const tails = (count: number) => `九尾狐查看尾巴：你现在还有 ${count} 条尾巴。`;

describe('nine-tailed fox', () => {
  it('checks the tails privately as the last one awake each night', () => {
    const run = play(SEED, undefined, BOARD);
    const [check] = entries(run, 'narration', 'fox_check');
    expect(check).toMatchObject({ channel: `private:${fox}`, text: tails(9) });
    const order = run.log.filter((entry) => entry.round === 1).map((entry) => entry.phaseId);
    expect(order.indexOf('fox_check')).toBeGreaterThan(order.lastIndexOf('witch_poison'));
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === fox)?.prompt.identity).toContain('最近一次查看时你还有 9 条尾巴');
  });

  it('loses two tails per god and one per villager, none for wolves', () => {
    const run = play(SEED, combine(wolvesKill(seer, 1), wolvesKill(villagerA, 2), schedule([], [wolfA])), BOARD);
    expect(eliminated(run).slice(0, 3).map((death) => death.seat)).toEqual([seer, wolfA, villagerA]);
    expect(tailChecks(run).slice(0, 3)).toEqual([tails(9), tails(7), tails(6)]);
  });

  it('dies at once when the last tail is gone', () => {
    const run = play(SEED, schedule([villagerA, villagerB, witch, hunter], [wolfA, wolfB, seer, villagerC]), BOARD);
    expect(tailChecks(run)).toEqual([tails(9), tails(8), tails(7), tails(3)]);
    const roundFour = eliminated(run).filter((death) => death.round === 4);
    expect(roundFour.slice(-2)).toEqual([
      { seat: villagerC, round: 4, reason: '被放逐' },
      { seat: fox, round: 4, reason: '失去全部尾巴' },
    ]);
    expect(run.snapshot.result?.winner).toBe('werewolf');
  });
});
