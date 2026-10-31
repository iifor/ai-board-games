import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'ghost-bride-thief-12';
const SEED = 1;
const bride = first(SEED, 'ghost_bride', BOARD);
const thief = first(SEED, 'thief', BOARD);
const seer = first(SEED, 'seer', BOARD);
const guard = first(SEED, 'guard', BOARD);
const [groom = 0, wolf = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [witness = 0, villager = 0] = roleSeats(SEED, 'villager', BOARD);

const wed = combine(act('ghost_bride_link', bride, [groom], 1), act('ghost_bride_witness', bride, [witness], 1));
const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);
/** 单身狼（另一名狼人与拿到狼人牌的盗贼）在第 1、2 天自爆 */
const singlesSelfDestruct: Override = (request, snapshot) => (request.phaseId === 'day_speech' && request.seat === [wolf, thief][snapshot.round - 1]
  ? { speech: '我自爆。', declare: 'selfDestruct' }
  : undefined);

describe('ghost bride', () => {
  it('pulls a wolf groom and a witness out of their camps into a third party that chats at night', () => {
    const run = play(SEED, combine(wed, act('seer_check', seer, [groom], 1)), BOARD);
    expect(run.snapshot.seats.find((seat) => seat.seat === groom)).toMatchObject({ role: 'betrayer_wolf', team: 'ghost_bride' });
    expect(run.snapshot.seats.find((seat) => seat.seat === witness)).toMatchObject({ role: 'villager', team: 'ghost_bride' });
    expect(stateOf(run.snapshot)).toMatchObject({ lovers: [bride, groom], thirdParty: { kind: 'lovers', seats: [bride, groom, witness].sort((a, b) => a - b) } });
    expect(requestsOn(run, 'wolf_chat', 1).map((request) => request.seat)).not.toContain(groom);
    expect(requestsOn(run, 'wolf_chat', 1).map((request) => request.seat)).toContain(thief);
    expect(entries(run, 'action', 'seer_check')[0]?.text).toBe(`查验 ${groom}号：好人`);
    const witnessNote = entries(run, 'narration', 'ghost_bride_bond').find((entry) => entry.channel === `private:${witness}`);
    expect(witnessNote?.text).toContain(`新郎 ${groom}号（身份是狼人）`);
    const chat = requestsOn(run, 'ghost_bride_chat', 1);
    expect(chat.map((request) => request.seat).sort((a, b) => a - b)).toEqual([bride, groom, witness].sort((a, b) => a - b));
    expect(entries(run, 'speech', 'ghost_bride_chat').every((entry) => entry.channel === 'team:ghost_bride')).toBe(true);
    expect(requestsIn(run, 'ghost_bride_kill')).toHaveLength(0);
  });

  it('kills past the guard once every single wolf is out, while the good side cannot win yet', () => {
    const run = play(SEED, combine(wed, singlesSelfDestruct, act('ghost_bride_kill', bride, [villager], 3), act('guard_protect', guard, [villager], 3)), BOARD);
    expect(eliminated(run).slice(0, 3)).toEqual([
      { seat: wolf, round: 1, reason: '自爆' },
      { seat: thief, round: 2, reason: '自爆' },
      { seat: villager, round: 3, reason: '昨晚死亡' },
    ]);
    const [offer] = requestsIn(run, 'ghost_bride_kill');
    expect(offer?.seat).toBe(bride);
    expect(offer?.legalTargets).not.toContain(groom);
    expect(offer?.legalTargets).not.toContain(witness);
  });

  it('lets the witness take over the kill after the lovers die together', () => {
    const run = play(SEED, combine(wed, wolvesKill(bride, 1), singlesSelfDestruct), BOARD);
    expect(eliminated(run).slice(0, 2)).toEqual([bride, groom].sort((a, b) => a - b).map((seat) => ({ seat, round: 1, reason: '昨晚死亡' })));
    expect(requestsOn(run, 'ghost_bride_chat', 2)).toHaveLength(0);
    expect(requestsOn(run, 'ghost_bride_kill', 3).map((request) => request.seat)).toEqual([witness]);
  });
});
