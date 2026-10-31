import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, type Override } from '../helpers';

const BOARD = 'hybrid-12';
const SEED = 5;
const hybrid = first(SEED, 'hybrid', BOARD);
const villagers = roleSeats(SEED, 'villager', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [wolf = 0] = wolves;
const [villager = 0] = villagers;

const chooseMaster = (master: number): Override => act('hybrid_choose', hybrid, [master]);

/** 狼人按顺序每晚击杀一人 */
function killEachNight(order: readonly number[]): Override {
  return (request, snapshot) => (request.phaseId === 'wolf_kill' ? { target: order[snapshot.round - 1] ?? null } : undefined);
}

describe('hybrid board', () => {
  it('deals 3 villagers and a hybrid', () => {
    expect(villagers).toHaveLength(3);
    expect(roleSeats(SEED, 'idiot', BOARD)).toHaveLength(1);
  });

  it('lets the hybrid choose a master first thing on night one only, in private', () => {
    const run = play(SEED, chooseMaster(wolf), BOARD);
    expect(run.requests[0]?.request).toMatchObject({ phaseId: 'hybrid_choose', seat: hybrid });
    const choices = requestsIn(run, 'hybrid_choose');
    expect(choices).toHaveLength(1);
    expect(choices[0]?.legalTargets).not.toContain(hybrid);
    expect(choices[0]?.prompt.output).not.toContain('空数组');
    expect(entries(run, 'action', 'hybrid_choose')[0]).toMatchObject({ channel: `private:${hybrid}`, text: `选择 ${wolf}号 作为主人` });
  });

  it('tells only the hybrid who the master is, and nobody learns the other side', () => {
    const run = play(SEED, chooseMaster(wolf), BOARD);
    const later = run.requests.filter(({ request }) => request.phaseId !== 'hybrid_choose');
    for (const { request } of later) {
      const knowsMaster = request.prompt.identity.includes(`你的主人是 ${wolf}号`);
      expect(knowsMaster).toBe(request.seat === hybrid);
    }
    const wolfPrompt = requestsIn(run, 'wolf_chat')[0]?.prompt.identity ?? '';
    expect(wolfPrompt).not.toContain(`${hybrid}号`);
    expect(requestsIn(run, 'wolf_chat').some((request) => request.seat === hybrid)).toBe(false);
  });

  it('counts the hybrid as a villager for the side wipe', () => {
    const run = play(SEED, combine(chooseMaster(wolf), killEachNight([...villagers, hybrid])), BOARD);
    expect(eliminated(run).map((death) => death.seat)).toEqual([...villagers, hybrid]);
    expect(run.snapshot.result).toMatchObject({ winner: 'werewolf' });
    expect(run.snapshot.result?.summary).toContain('屠边');
  });

  it('wins or loses with the master', () => {
    const wolfMaster = play(SEED, combine(chooseMaster(wolf), killEachNight([...villagers, hybrid])), BOARD);
    expect(wolfMaster.snapshot.result?.summary).toContain(`混血儿 ${hybrid}号主人是 ${wolf}号（狼人阵营），随之胜利`);
    const goodMaster = play(SEED, combine(chooseMaster(villager), killEachNight([...villagers, hybrid])), BOARD);
    expect(goodMaster.snapshot.result?.summary).toContain(`混血儿 ${hybrid}号主人是 ${villager}号（好人阵营），随之落败`);
  });
});
