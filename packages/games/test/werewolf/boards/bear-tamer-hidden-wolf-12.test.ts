import { describe, expect, it } from 'vitest';
import { eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, wolvesKill, type Override } from '../helpers';

const BOARD = 'bear-tamer-hidden-wolf-12';

const dawnText = (run: ReturnType<typeof play>, round: number) => entries(run, 'narration', 'dawn').find((entry) => entry.round === round)?.text;

describe('bear tamer', () => {
  // 种子 1：7 号驯熊师，左邻 6 号狼人、右邻 8 号村民
  const SEED = 1;
  const tamer = first(SEED, 'bear_tamer', BOARD);
  const [leftWolf = 0] = roleSeats(SEED, 'werewolf', BOARD).filter((seat) => seat === tamer - 1);

  it('roars at dawn together with the death news when a neighbour is a wolf', () => {
    expect(leftWolf).toBe(tamer - 1);
    expect(dawnText(play(SEED, undefined, BOARD), 1)).toBe('天亮了，昨晚是平安夜。熊咆哮了。');
  });

  it('re-checks the neighbours before each night', () => {
    const run = play(SEED, everyoneVotes('exile_vote', leftWolf, 1), BOARD);
    expect(eliminated(run)[0]).toEqual({ seat: leftWolf, round: 1, reason: '被放逐' });
    expect(dawnText(run, 2)).toBe('天亮了，昨晚是平安夜。熊没有咆哮。');
  });

  it('stays quiet once the tamer is dead', () => {
    const run = play(SEED, wolvesKill(tamer, 1), BOARD);
    expect(dawnText(run, 1)).toBe(`天亮了，昨晚死亡的是：${tamer}号。熊没有咆哮。`);
  });

  it('does not roar for the hidden wolf', () => {
    // 种子 7：4 号驯熊师，邻座 3 号白痴与 5 号村民；5 号出局后右邻变为 6 号隐狼
    const seed = 7;
    const bearTamer = first(seed, 'bear_tamer', BOARD);
    const hidden = first(seed, 'hidden_wolf', BOARD);
    expect(hidden).toBe(bearTamer + 2);
    const run = play(seed, everyoneVotes('exile_vote', bearTamer + 1, 1), BOARD);
    expect(dawnText(run, 1)).toBe('天亮了，昨晚是平安夜。熊没有咆哮。');
    expect(dawnText(run, 2)).toBe('天亮了，昨晚是平安夜。熊没有咆哮。');
  });
});

describe('linked hidden wolf', () => {
  const SEED = 1;
  const hidden = first(SEED, 'hidden_wolf', BOARD);
  const wolves = roleSeats(SEED, 'werewolf', BOARD);
  const packSelfDestructs: Override = (request, snapshot) => request.phaseId === 'day_speech' && request.seat === wolves[snapshot.round - 1]
    ? { speech: '我自爆。', declare: 'selfDestruct' }
    : undefined;

  it('neither knows nor is known by the pack and never kills', () => {
    const run = play(SEED, undefined, BOARD);
    const own = requestsIn(run, 'day_speech').find((request) => request.seat === hidden);
    expect(own?.prompt.identity).toContain('你和狼人互不相认');
    for (const wolf of wolves) expect(own?.prompt.identity).not.toContain(`${wolf}号`);
    expect(requestsIn(run, 'wolf_chat')[0]?.prompt.identity).not.toContain(`${hidden}号`);
    expect(requestsIn(run, 'wolf_kill').map((request) => request.seat)).not.toContain(hidden);
    expect(run.log.some((entry) => entry.phaseId === 'hidden_wolf_kill')).toBe(false);
  });

  it('leaves together with the last pack wolf, which ends the game', () => {
    const run = play(SEED, packSelfDestructs, BOARD);
    expect(eliminated(run).map((death) => death.seat)).toEqual([...wolves, hidden]);
    expect(eliminated(run)[3]).toEqual({ seat: hidden, round: 3, reason: '随狼队出局' });
    expect(run.snapshot.result).toMatchObject({ winner: 'good', endReason: 'normal' });
  });
});
