import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'wolf-seed-hidden-wolf-12';
const SEED = 1;
const seed = first(SEED, 'wolf_seed', BOARD);
const hidden = first(SEED, 'hidden_wolf', BOARD);
const seer = first(SEED, 'seer', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0] = roleSeats(SEED, 'villager', BOARD);

const infect = (target: number): Override => combine(wolvesKill(target, 1), act('wolf_seed_infect', seed, [target], 1));
const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);
const roleOf = (run: ReturnType<typeof play>, seat: number) => run.snapshot.seats.find((item) => item.seat === seat);

describe('wolf seed', () => {
  it('turns a successfully killed victim into a pack wolf instead of killing him', () => {
    const run = play(SEED, combine(infect(villager), act('seer_check', seer, [villager], 2)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
    expect(entries(run, 'action', 'wolf_seed_infect')[0]).toMatchObject({ channel: 'team:werewolf', text: `种狼对 ${villager}号 发动感染` });
    expect(roleOf(run, villager)).toMatchObject({ role: 'infected_wolf', team: 'werewolf' });
    expect(entries(run, 'narration', 'night_resolve').map((entry) => entry.channel)).toEqual([`private:${villager}`, 'team:werewolf']);
    expect(requestsOn(run, 'wolf_chat', 2).map((request) => request.seat)).toContain(villager);
    expect(entries(run, 'action', 'seer_check').find((entry) => entry.round === 2)?.text).toBe(`查验 ${villager}号：狼人`);
    expect(requestsIn(run, 'wolf_seed_infect')).toHaveLength(1);
  });

  it('fails when the witch saves the victim, and the infection is still spent', () => {
    const run = play(SEED, combine(infect(villager), act('witch_save', witch, [villager], 1)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
    expect(roleOf(run, villager)?.role).toBe('villager');
    expect(stateOf(run.snapshot).wolfSeedUsed).toBe(true);
    expect(requestsIn(run, 'wolf_seed_infect')).toHaveLength(1);
  });

  it('strips the original skill: an infected hunter cannot shoot', () => {
    const run = play(SEED, combine(infect(hunter), everyoneVotes('exile_vote', hunter, 1)), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: hunter, round: 1, reason: '被放逐' });
    expect(requestsIn(run, 'hunter_shot')).toHaveLength(0);
  });

  it('keeps the linked hidden wolf alive while an infected wolf remains', () => {
    const order = [...wolves, seed, villager];
    const selfDestruct: Override = (request, snapshot) => (request.phaseId === 'day_speech' && request.seat === order[snapshot.round - 1]
      ? { speech: '我自爆。', declare: 'selfDestruct' }
      : undefined);
    const run = play(SEED, combine(infect(villager), selfDestruct), BOARD);
    const deaths = eliminated(run);
    expect(deaths.slice(0, 3).map((death) => death.seat)).toEqual(order.slice(0, 3));
    expect(deaths[3]).toEqual({ seat: villager, round: 4, reason: '自爆' });
    expect(deaths[4]).toEqual({ seat: hidden, round: 4, reason: '随狼队出局' });
    expect(run.snapshot.result?.winner).toBe('good');
  });
});
