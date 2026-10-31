import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from './helpers';

const SEED = 11;
const villagers = roleSeats(SEED, 'villager');
const idiot = first(SEED, 'idiot');
const [candidateA = 0, candidateB = 0, candidateC = 0] = villagers;

/** 除 a、b 外的玩家按座位号一半投 a、一半投 b；a、b 互投（若有资格） */
function split(phaseIds: readonly string[], a: number, b: number): Override {
  const others = Array.from({ length: 12 }, (_, index) => index + 1).filter((seat) => seat !== a && seat !== b);
  const forA = new Set(others.slice(0, others.length / 2));
  return (request) => {
    if (!phaseIds.includes(request.phaseId)) return undefined;
    if (request.seat === a) return { target: b };
    if (request.seat === b) return { target: a };
    return { target: forA.has(request.seat) ? a : b };
  };
}

function signUp(...seats: number[]): Override {
  return (request) => (request.phaseId === 'sheriff_signup' ? { targets: seats.includes(request.seat) ? [request.seat] : [] } : undefined);
}

describe('sheriff election', () => {
  it('elects by vote, excludes candidates from voting and gives the sheriff 1.5 votes', () => {
    const run = play(SEED, combine(
      signUp(candidateA, candidateB),
      everyoneVotes('sheriff_vote', candidateA),
      everyoneVotes('exile_vote', candidateC, 1),
    ));
    expect(stateOf(run.snapshot).sheriff).toBe(candidateA);
    const voters = requestsIn(run, 'sheriff_vote').map((request) => request.seat);
    expect(voters).toHaveLength(10);
    expect(voters).not.toContain(candidateA);
    expect(voters).not.toContain(candidateB);
    const exile = entries(run, 'vote_tallied', 'exile_vote')[0];
    expect(exile?.ballots.find((ballot) => ballot.voter === candidateA)?.weight).toBe(1.5);
    // 除 candidateC 本人外 11 人投票，其中警长 1.5 票
    expect(exile?.tally.find((row) => row.target === candidateC)?.votes).toBe(11.5);
  });

  it('elects a lone candidate without a vote', () => {
    const run = play(SEED, signUp(candidateA));
    expect(requestsIn(run, 'sheriff_vote')).toHaveLength(0);
    expect(stateOf(run.snapshot).sheriff).toBe(candidateA);
  });

  it('runs a PK on a tie and loses the badge if the PK ties again', () => {
    const run = play(SEED, combine(signUp(candidateA, candidateB), split(['sheriff_vote', 'sheriff_pk_vote'], candidateA, candidateB)));
    const tallies = entries(run, 'vote_tallied').filter((entry) => entry.phaseId?.startsWith('sheriff'));
    expect(tallies[0]?.tied).toEqual([candidateA, candidateB].sort((x, y) => x - y));
    expect(requestsIn(run, 'sheriff_pk_speech').map((request) => request.seat).sort()).toEqual([candidateA, candidateB].sort());
    expect(requestsIn(run, 'sheriff_pk_vote')).toHaveLength(10);
    expect(tallies.map((entry) => entry.phaseId)).toEqual(['sheriff_vote', 'sheriff_pk_vote']);
    expect(stateOf(run.snapshot).sheriff).toBeNull();
  });

  it('lets candidates withdraw', () => {
    const run = play(SEED, combine(signUp(candidateA, candidateB), act('sheriff_withdraw', candidateB, [candidateB])));
    expect(entries(run, 'action', 'sheriff_withdraw').find((entry) => entry.seat === candidateB)?.text).toBe('退水');
    expect(stateOf(run.snapshot).sheriff).toBe(candidateA);
  });
});

describe('day speeches and exile', () => {
  it('lets the sheriff pick a neighbour and speak last', () => {
    const run = play(SEED, signUp(candidateA));
    const direction = requestsIn(run, 'speech_direction')[0];
    expect(direction?.seat).toBe(candidateA);
    const start = direction?.legalTargets?.[0] ?? 0;
    const order = entries(run, 'speech', 'day_speech').filter((entry) => entry.round === 1).map((entry) => entry.seat);
    expect(order[0]).toBe(start);
    expect(order[order.length - 1]).toBe(candidateA);
    expect(order).toHaveLength(12);
  });

  it('starts after the highest-numbered death when there is no sheriff', () => {
    const target = Math.max(...villagers);
    const run = play(SEED, wolvesKill(target));
    const order = entries(run, 'speech', 'day_speech').filter((entry) => entry.round === 1).map((entry) => entry.seat);
    expect(order[0]).toBe((target % 12) + 1);
    expect(order).not.toContain(target);
  });

  it('exiles nobody on a tie', () => {
    const run = play(SEED, split(['exile_vote'], candidateA, candidateB));
    const exile = entries(run, 'vote_tallied', 'exile_vote')[0];
    expect(exile).toMatchObject({ tied: [candidateA, candidateB].sort((x, y) => x - y), outcome: { kind: 'none' } });
    expect(eliminated(run).filter((death) => death.round === 1)).toEqual([]);
    expect(entries(run, 'narration', 'exile_resolve')[0]?.text).toBe('本轮无人被放逐。');
  });

  it('reveals the idiot instead of exiling him, then takes away his vote', () => {
    const run = play(SEED, everyoneVotes('exile_vote', idiot, 1));
    expect(entries(run, 'revealed', 'exile_resolve')[0]?.text).toContain(`${idiot}号翻牌`);
    expect(eliminated(run).some((death) => death.seat === idiot)).toBe(false);
    const dayTwo = requestsIn(run, 'exile_vote').filter((request) => request.id.startsWith('exile_vote#2'));
    expect(dayTwo.map((request) => request.seat)).not.toContain(idiot);
    expect(dayTwo.every((request) => !request.legalTargets?.includes(idiot))).toBe(true);
    expect(entries(run, 'speech', 'day_speech').some((entry) => entry.seat === idiot && entry.round === 2)).toBe(true);
  });
});
