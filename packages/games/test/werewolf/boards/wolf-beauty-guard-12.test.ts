import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats } from '../helpers';

const BOARD = 'wolf-beauty-guard-12';
const SEED = 8;
const beauty = first(SEED, 'wolf_beauty', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const [wolf = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [villager = 0] = roleSeats(SEED, 'villager', BOARD);

const charm = (target: number, night: number) => act('wolf_beauty_charm', beauty, [target], night);
const lastWordsBy = (run: ReturnType<typeof play>) => entries(run, 'speech', 'last_words').map((entry) => entry.seat);

describe('wolf beauty', () => {
  it('charms privately after the wolf kill, may skip, and never charms herself', () => {
    const run = play(SEED, charm(villager, 1), BOARD);
    const [offer] = requestsIn(run, 'wolf_beauty_charm');
    expect(offer?.legalTargets).not.toContain(beauty);
    expect(offer?.prompt.output).toContain('空数组');
    expect(entries(run, 'action', 'wolf_beauty_charm')[0]).toMatchObject({ channel: `private:${beauty}`, text: `魅惑 ${villager}号` });
    const order = run.log.filter((entry) => entry.round === 1 && entry.kind === 'phase_started').map((entry) => entry.phaseId);
    expect(order.indexOf('wolf_beauty_charm')).toBeGreaterThan(order.indexOf('wolf_kill'));
  });

  it('takes the charmed player with her when she dies at night; a charmed hunter cannot shoot', () => {
    const run = play(SEED, combine(charm(hunter, 1), act('witch_poison', witch, [beauty], 1)), BOARD);
    expect(entries(run, 'narration', 'dawn')[0]?.text).toBe(`天亮了，昨晚死亡的是：${[beauty, hunter].sort((a, b) => a - b).map((seat) => `${seat}号`).join('、')}。`);
    expect(requestsIn(run, 'hunter_shot')).toHaveLength(0);
    expect(lastWordsBy(run).sort()).toEqual([beauty, hunter].sort());
  });

  it('takes the charmed player when exiled the next day; the lover has no last words', () => {
    const run = play(SEED, combine(charm(villager, 1), everyoneVotes('exile_vote', beauty, 1)), BOARD);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: beauty, round: 1, reason: '被放逐' },
      { seat: villager, round: 1, reason: '殉情' },
    ]);
    expect(entries(run, 'narration', 'wolf_beauty_link')[0]?.text).toBe(`${villager}号随狼美人殉情出局。`);
    expect(lastWordsBy(run)).toEqual([beauty]);
  });

  it('only links the charm of that night', () => {
    const run = play(SEED, combine(charm(villager, 1), everyoneVotes('exile_vote', beauty, 2)), BOARD);
    expect(eliminated(run).filter((death) => death.round <= 2).map((death) => death.seat)).toEqual([beauty]);
  });

  it('cannot self-destruct, unlike the other wolves', () => {
    const run = play(SEED, undefined, BOARD);
    const speeches = requestsIn(run, 'day_speech');
    expect(speeches.find((request) => request.seat === beauty)?.prompt.output).not.toContain('selfDestruct');
    expect(speeches.find((request) => request.seat === wolf)?.prompt.output).toContain('selfDestruct');
  });
});
