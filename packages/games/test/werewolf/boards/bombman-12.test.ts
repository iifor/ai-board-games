import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, wolvesKill, type Override } from '../helpers';

const BOARD = 'bombman-12';
const SEED = 1;
const bombman = first(SEED, 'bombman', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const witch = first(SEED, 'witch', BOARD);
const seer = first(SEED, 'seer', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const villagers = roleSeats(SEED, 'villager', BOARD);
const [wolfA = 0, wolfB = 0] = wolves;
const [villager = 0] = villagers;

/** 第 1 天只有 voters 投炸弹人，其他人弃票 */
function exileBombman(voters: readonly number[]): Override {
  return (request, snapshot) => {
    if (request.phaseId !== 'exile_vote' || snapshot.round !== 1) return undefined;
    return { target: voters.includes(request.seat) ? bombman : null };
  };
}
const blast = act('bombman_blast', bombman, [bombman]);
const sorted = (seats: readonly number[]) => [...seats].sort((a, b) => a - b);

describe('bombman', () => {
  it('blows up everyone who voted him out; the victims get no last words and cannot shoot', () => {
    const voters = [wolfA, wolfB, villager, hunter];
    const run = play(SEED, combine(exileBombman(voters), blast), BOARD);
    const dayOne = eliminated(run).filter((death) => death.round === 1);
    expect(dayOne[0]).toEqual({ seat: bombman, round: 1, reason: '被放逐' });
    expect(sorted(dayOne.slice(1).map((death) => death.seat))).toEqual(sorted(voters));
    expect(dayOne.slice(1).every((death) => death.reason === '被炸弹人炸死')).toBe(true);
    const reveal = entries(run, 'revealed', 'bombman_resolve')[0];
    expect(reveal).toMatchObject({ channel: 'public', text: expect.stringContaining(`${bombman}号翻牌为炸弹人并引爆`) });
    expect(entries(run, 'speech', 'last_words').map((entry) => entry.seat)).toEqual([bombman]);
    expect(requestsIn(run, 'hunter_shot')).toHaveLength(0);
    expect(run.snapshot.result?.winner).not.toBe('bombman');
  });

  it('may keep the bomb, and decides in private', () => {
    const run = play(SEED, exileBombman([wolfA, villager]), BOARD);
    expect(entries(run, 'action', 'bombman_blast')[0]).toMatchObject({ channel: `private:${bombman}`, text: '决定不引爆' });
    expect(eliminated(run).filter((death) => death.round === 1).map((death) => death.seat)).toEqual([bombman]);
    expect(entries(run, 'revealed', 'bombman_resolve')).toHaveLength(0);
  });

  it('wins alone when the blast takes every wolf and every villager', () => {
    const run = play(SEED, combine(exileBombman([...wolves, ...villagers]), blast), BOARD);
    expect(run.snapshot.result).toMatchObject({ winner: 'bombman', winnerLabel: '炸弹人胜利', endReason: 'normal' });
    expect(run.snapshot.result?.summary).toContain('炸死了所有狼人和一整边好人');
  });

  it('also wins alone by taking every wolf and every remaining god', () => {
    const run = play(SEED, combine(exileBombman([...wolves, witch, seer, hunter]), blast), BOARD);
    expect(run.snapshot.result?.winner).toBe('bombman');
  });

  it('cannot blast when he dies any other way', () => {
    const run = play(SEED, wolvesKill(bombman, 1), BOARD);
    expect(eliminated(run)[0]?.seat).toBe(bombman);
    expect(requestsIn(run, 'bombman_blast')).toHaveLength(0);
  });
});
