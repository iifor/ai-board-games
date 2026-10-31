import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, seatsOf, stateOf, type Override } from '../helpers';

const BOARD = 'cupid-thief-12';
const SEED = 1;
const thief = first(SEED, 'thief', BOARD);
const cupid = first(SEED, 'cupid', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const king = first(SEED, 'wolf_king', BOARD);
const [wolf = 0, wolfB = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0, villagerB = 0, villagerC = 0] = roleSeats(SEED, 'villager', BOARD);

const link = (a: number, b: number): Override => act('cupid_link', cupid, [a, b], 1);
const wolfVotes = (votes: Readonly<Record<number, number | null>>, night = 1): Override => (request, snapshot) =>
  (request.phaseId === 'wolf_kill' && snapshot.round === night ? { target: votes[request.seat] ?? null } : undefined);

describe('thief', () => {
  it('deals 12 of the 14 cards and lets the thief take one of the two extras', () => {
    expect(seatsOf(SEED, BOARD)).toHaveLength(12);
    const run = play(SEED, act('thief_choose', thief, [thief], 1), BOARD);
    const [offer] = requestsIn(run, 'thief_choose');
    expect(offer?.prompt.instruction).toContain('「预言家」 和 「村民」');
    expect(offer?.prompt.rules).toContain('法官手中的两张底牌是：「预言家」、「村民」。');
    expect(run.snapshot.seats.find((seat) => seat.seat === thief)?.role).toBe('seer');
    expect(requestsIn(run, 'seer_check')[0]?.seat).toBe(thief);
    expect(entries(run, 'narration', 'thief_take')[0]).toMatchObject({ channel: `private:${thief}`, text: '你拿走了预言家，从现在起你的身份是预言家。' });
  });

  it('must take a wolf card without being asked and joins the pack', () => {
    const forced = first(2, 'thief', BOARD);
    const run = play(2, undefined, BOARD);
    expect(requestsIn(run, 'thief_choose')).toHaveLength(0);
    expect(run.snapshot.seats.find((seat) => seat.seat === forced)).toMatchObject({ role: 'werewolf', team: 'werewolf' });
    expect(requestsIn(run, 'wolf_chat').map((request) => request.seat)).toContain(forced);
    expect(entries(run, 'narration', 'thief_take').map((entry) => entry.channel)).toEqual([`private:${forced}`, 'team:werewolf']);
  });

  it('keeps the public phases when the thief card itself is an extra card', () => {
    expect(stateOf(play(4, undefined, BOARD).snapshot).thief).toMatchObject({ seat: null, cards: ['thief', 'villager'] });
    const run = play(4, undefined, BOARD);
    expect(entries(run, 'phase_started').filter((entry) => entry.title === '盗贼')).toHaveLength(1);
    expect(requestsIn(run, 'thief_choose')).toHaveLength(0);
  });
});

describe('cupid', () => {
  it('links two good players who die together; the cupid sides with the good camp', () => {
    const run = play(SEED, combine(link(villager, hunter), wolfVotes({ [wolf]: villager, [wolfB]: villager, [king]: villager })), BOARD);
    expect(entries(run, 'narration', 'cupid_bond').map((entry) => entry.channel)).toEqual([`private:${hunter}`, `private:${villager}`].sort());
    expect(stateOf(run.snapshot).thirdParty).toBeNull();
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: hunter, round: 1, reason: '昨晚死亡' },
      { seat: villager, round: 1, reason: '昨晚死亡' },
    ]);
    expect(requestsIn(run, 'death_shot')).toHaveLength(0);
    expect(run.snapshot.result?.summary).toContain(`丘比特 ${cupid}号属于好人阵营`);
  });

  it('forms a third party with a mixed couple; the wolf lover can void the kill', () => {
    const run = play(SEED, combine(link(wolf, villager), wolfVotes({ [wolf]: villagerC, [wolfB]: villagerB, [king]: villagerB })), BOARD);
    expect(stateOf(run.snapshot).thirdParty).toEqual({ kind: 'lovers', seats: [wolf, villager, cupid].sort((a, b) => a - b) });
    expect(entries(run, 'vote_tallied', 'wolf_kill')[0]?.outcome).toMatchObject({ kind: 'selected', seat: villagerB });
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe('天亮了，昨晚是平安夜。');
  });

  it('takes the partner down by day when a lover is exiled', () => {
    const run = play(SEED, combine(link(wolf, villager), everyoneVotes('exile_vote', villager, 1)), BOARD);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: villager, round: 1, reason: '被放逐' },
      { seat: wolf, round: 1, reason: '殉情' },
    ]);
    expect(entries(run, 'speech', 'last_words').map((entry) => entry.seat)).toEqual([villager]);
  });
});
