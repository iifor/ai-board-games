import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'silence-elder-stalker-12';
const SEED = 4;
const stalker = first(SEED, 'stalker', BOARD);
const [villager = 0, villagerB = 0, villagerC = 0] = roleSeats(SEED, 'villager', BOARD);

/** 第 round 天：潜行者投 stalkerTarget（null 为弃票），其他人都投 exiled */
function exileWith(round: number, exiled: number, stalkerTarget: number | null): Override {
  return (request, snapshot) => {
    if (request.phaseId !== 'exile_vote' || snapshot.round !== round) return undefined;
    if (request.seat === stalker) return { target: stalkerTarget };
    return { target: (request.legalTargets ?? []).includes(exiled) ? exiled : null };
  };
}

const assassinationsOn = (run: ReturnType<typeof play>, night: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === 'stalker_assassinate' && snapshot.round === night);

describe('stalker', () => {
  it('may assassinate that night the player he voted for when that player was not exiled', () => {
    const run = play(SEED, combine(exileWith(1, villagerB, villager), act('stalker_assassinate', stalker, [villager], 2)), BOARD);
    const [offer] = assassinationsOn(run, 2);
    expect(offer?.request.legalTargets).toEqual([villager]);
    expect(offer?.request.prompt.instruction).toContain(`${villager}号`);
    expect(eliminated(run).slice(0, 2)).toEqual([
      { seat: villagerB, round: 1, reason: '被放逐' },
      { seat: villager, round: 2, reason: '昨晚死亡' },
    ]);
    expect(entries(run, 'narration', 'dawn').find((entry) => entry.round === 2)?.text).toContain(`昨晚死亡的是：${villager}号`);
  });

  it('gets no chance when his target was exiled or when he abstained', () => {
    const exiled = play(SEED, exileWith(1, villager, villager), BOARD);
    expect(assassinationsOn(exiled, 2)).toHaveLength(0);
    const abstained = play(SEED, exileWith(1, villagerB, null), BOARD);
    expect(assassinationsOn(abstained, 2)).toHaveLength(0);
  });

  it('loses the chance when he declines, and can only assassinate once', () => {
    const declined = play(SEED, combine(exileWith(1, villagerB, villager), exileWith(2, villagerC, villager)), BOARD);
    expect(assassinationsOn(declined, 2)).toHaveLength(1);
    expect(assassinationsOn(declined, 3)).toHaveLength(1);
    expect(stateOf(declined.snapshot).stalkerUsed).toBe(false);

    const used = play(SEED, combine(
      exileWith(1, villagerB, villager),
      act('stalker_assassinate', stalker, [villager], 2),
      exileWith(2, villagerC, villagerC),
    ), BOARD);
    expect(stateOf(used.snapshot).stalkerUsed).toBe(true);
    expect(assassinationsOn(used, 3)).toHaveLength(0);
  });

  it('cannot be saved by the witch, who only learns the wolf target', () => {
    const run = play(SEED, combine(
      exileWith(1, villagerB, villager),
      act('stalker_assassinate', stalker, [villager], 2),
      wolvesKill(villagerC, 2),
    ), BOARD);
    expect(requestsIn(run, 'witch_save').map((request) => request.legalTargets)).toEqual([[villagerC]]);
    expect(eliminated(run).filter((death) => death.round === 2).map((death) => death.seat).sort()).toEqual([villager, villagerC].sort());
  });
});
