import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, wolvesKill } from '../helpers';

const BOARD = 'big-bad-wolf-fortune-teller-12';
const SEED = 1;
const bigWolf = first(SEED, 'big_bad_wolf', BOARD);
const teller = first(SEED, 'fortune_teller', BOARD);
const seer = first(SEED, 'seer', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0] = roleSeats(SEED, 'villager', BOARD);

const arm = (night: number) => act('big_bad_wolf_decide', bigWolf, [bigWolf], night);
const deathsOn = (run: ReturnType<typeof play>, round: number) =>
  eliminated(run).filter((death) => death.round === round).map((death) => death.seat).sort((a, b) => a - b);

describe('big bad wolf', () => {
  it('knows the pack and is known by it, but never joins the wolf chat or kill', () => {
    const run = play(SEED, wolvesKill(villager, 1), BOARD);
    expect(requestsIn(run, 'wolf_chat').map((request) => request.seat)).not.toContain(bigWolf);
    expect(requestsIn(run, 'wolf_kill').every((request) => !request.legalTargets?.includes(bigWolf))).toBe(true);
    const own = requestsIn(run, 'big_bad_wolf_decide')[0];
    expect(own?.prompt.identity).toContain(`你的狼同伴：${wolves.map((seat) => `${seat}号`).join(' ')}`);
    expect(own?.prompt.history).not.toContain('狼人夜聊」的发言');
    expect(requestsIn(run, 'wolf_chat')[0]?.prompt.identity).toContain(`你还认识离群的狼同伴：${bigWolf}号`);
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === bigWolf)?.prompt.output).not.toContain('selfDestruct');
  });

  it('kills once on his own, out of the witch’s sight, and must strike after deciding', () => {
    const run = play(SEED, combine(arm(1), act('big_bad_wolf_kill', bigWolf, [villagerB], 1), wolvesKill(villager, 1)), BOARD);
    expect(requestsIn(run, 'big_bad_wolf_kill')[0]?.prompt.output).not.toContain('空数组');
    expect(requestsIn(run, 'witch_save')[0]?.legalTargets).toEqual([villager]);
    expect(deathsOn(run, 1)).toEqual([villager, villagerB].sort((a, b) => a - b));
    expect(entries(run, 'action', 'big_bad_wolf_kill')[0]?.channel).toBe(`private:${bigWolf}`);
    expect(requestsIn(run, 'big_bad_wolf_decide')).toHaveLength(1);
  });

  it('is a wolf to the seer', () => {
    const run = play(SEED, act('seer_check', seer, [bigWolf], 1), BOARD);
    expect(entries(run, 'action', 'seer_check')[0]?.text).toBe(`查验 ${bigWolf}号：狼人`);
  });
});

describe('fortune teller', () => {
  const mark = act('fortune_mark', teller, [villagerB], 1);
  const scope = [villagerB - 1, villagerB, villagerB + 1];

  it('limits every wolf kill to the marked number and its neighbours', () => {
    const run = play(SEED, combine(mark, arm(1)), BOARD);
    const nightOne = run.requests.filter(({ request, snapshot }) => request.phaseId === 'wolf_kill' && snapshot.round === 1);
    expect(nightOne.length).toBeGreaterThan(0);
    for (const { request } of nightOne) expect(request.legalTargets?.every((seat) => scope.includes(seat))).toBe(true);
    const nightTwo = run.requests.find(({ request, snapshot }) => request.phaseId === 'wolf_kill' && snapshot.round === 2);
    expect(nightTwo?.request.legalTargets?.some((seat) => !scope.includes(seat))).toBe(true);
    expect(requestsIn(run, 'big_bad_wolf_kill')[0]?.legalTargets?.every((seat) => scope.includes(seat))).toBe(true);
    const notice = `占卜师今晚标记了 ${villagerB}号：今晚狼人只能击杀 ${scope.map((seat) => `${seat}号`).join('、')} 中的存活玩家。`;
    expect(entries(run, 'narration', 'fortune_notice')[0]).toMatchObject({ channel: 'team:werewolf', text: notice });
    expect(entries(run, 'narration', 'big_bad_wolf_notice')[0]).toMatchObject({ channel: `private:${bigWolf}`, text: notice });
  });

  it('tells the big bad wolf about the mark only after he decides to strike', () => {
    const declined = play(SEED, mark, BOARD);
    expect(entries(declined, 'narration', 'big_bad_wolf_notice')).toHaveLength(0);
    expect(requestsIn(declined, 'big_bad_wolf_decide')[0]?.prompt.history).not.toContain('占卜师今晚标记了');
  });

  it('marks only once per game', () => {
    const run = play(SEED, mark, BOARD);
    expect(requestsIn(run, 'fortune_mark')).toHaveLength(1);
    expect(requestsIn(run, 'fortune_mark')[0]?.legalTargets).not.toContain(teller);
  });
});
