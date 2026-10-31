import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, stateOf, wolvesKill } from '../helpers';

const BOARD = 'wolf-king-magician-12';
const SEED = 1;
const magician = first(SEED, 'magician', BOARD);
const king = first(SEED, 'wolf_king', BOARD);
const witch = first(SEED, 'witch', BOARD);
const seer = first(SEED, 'seer', BOARD);
const [wolf = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const swap = (a: number, b: number, night: number) => act('magician_swap', magician, [a, b], night);
const deathsOn = (run: ReturnType<typeof play>, round: number) =>
  eliminated(run).filter((death) => death.round === round).map((death) => death.seat).sort((a, b) => a - b);

describe('magician', () => {
  it('acts first, may skip, and keeps the swap private', () => {
    const run = play(SEED, swap(villager, villagerB, 1), BOARD);
    const order = run.log.filter((entry) => entry.round === 1 && entry.kind === 'phase_started').map((entry) => entry.phaseId);
    expect(order[1]).toBe('magician_swap');
    expect(requestsIn(run, 'magician_swap')[0]?.prompt.output).toContain('空数组');
    expect(entries(run, 'action', 'magician_swap')[0]).toMatchObject({ channel: `private:${magician}`, text: `交换 ${villager}号 与 ${villagerB}号` });
  });

  it('redirects the wolf kill while the witch still sees the chosen number', () => {
    const run = play(SEED, combine(swap(villager, villagerB, 1), wolvesKill(villager, 1)), BOARD);
    expect(requestsIn(run, 'witch_save')[0]?.legalTargets).toEqual([villager]);
    expect(deathsOn(run, 1)).toEqual([villagerB]);

    const saved = play(SEED, combine(swap(villager, villagerB, 1), wolvesKill(villager, 1), act('witch_save', witch, [villager], 1)), BOARD);
    expect(deathsOn(saved, 1)).toEqual([]);
  });

  it('redirects the poison and the seer check', () => {
    const poisoned = play(SEED, combine(swap(villager, wolf, 1), act('witch_poison', witch, [villager], 1)), BOARD);
    expect(deathsOn(poisoned, 1)).toEqual([wolf]);

    const checked = play(SEED, combine(swap(villager, wolf, 1), act('seer_check', seer, [villager], 1)), BOARD);
    expect(entries(checked, 'action', 'seer_check')[0]?.text).toBe(`查验 ${villager}号：狼人`);
    expect(stateOf(checked.snapshot).seerChecks[String(seer)]?.[0]).toMatchObject({ target: villager, result: '狼人' });
  });

  it('lets the wolves knife their own king, who may then shoot', () => {
    const run = play(SEED, combine(swap(villager, king, 1), wolvesKill(villager, 1), act('death_shot', king, [villagerB])), BOARD);
    expect(deathsOn(run, 1)).toEqual([king, villagerB].sort((a, b) => a - b));
    expect(entries(run, 'action', 'death_shot')[0]?.text).toBe(`开枪带走 ${villagerB}号`);
  });

  it('swaps each number only once and restores numbers at dawn', () => {
    const run = play(SEED, combine(swap(villager, villagerB, 1), wolvesKill(villager, 2)), BOARD);
    const [, nightTwo] = requestsIn(run, 'magician_swap');
    expect(nightTwo?.legalTargets).not.toContain(villager);
    expect(nightTwo?.legalTargets).not.toContain(villagerB);
    expect(nightTwo?.prompt.identity).toContain(`已经交换过的号码：${villager}号 ${villagerB}号`);
    expect(deathsOn(run, 2)).toEqual([villager]);
  });
});
