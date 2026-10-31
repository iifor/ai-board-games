import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, stateOf, type Override } from '../helpers';

const BOARD = 'succubus-thief-12';
const SEED = 3;
const succubus = first(SEED, 'succubus', BOARD);
const witch = first(SEED, 'witch', BOARD);
const hunter = first(SEED, 'hunter', BOARD);
const seer = first(SEED, 'seer', BOARD);
const guard = first(SEED, 'guard', BOARD);
const thief = first(SEED, 'thief', BOARD);
const [wolfA = 0, wolfB = 0, wolfC = 0] = roleSeats(SEED, 'werewolf', BOARD);
const [partner = 0, villagerB = 0, villagerC = 0] = roleSeats(SEED, 'villager', BOARD);

const linkPartner = act('succubus_link', succubus, [partner], 1);
const perRound = (phaseId: string, targets: readonly number[]): Override => (request, snapshot) => {
  if (request.phaseId !== phaseId) return undefined;
  const target = targets[snapshot.round - 1];
  return { target: target !== undefined && request.legalTargets?.includes(target) ? target : null };
};

describe('succubus', () => {
  it('runs with the pack and links herself to a good player as a third party', () => {
    const run = play(SEED, linkPartner, BOARD);
    const [offer] = requestsIn(run, 'succubus_link');
    expect(offer?.legalTargets).not.toContain(wolfA);
    expect(offer?.legalTargets).not.toContain(succubus);
    expect(requestsIn(run, 'wolf_chat').map((request) => request.seat)).toContain(succubus);
    expect(stateOf(run.snapshot)).toMatchObject({ lovers: [partner, succubus].sort((a, b) => a - b), thirdParty: { kind: 'lovers' } });
    expect(entries(run, 'narration', 'succubus_bond')[0]).toMatchObject({ channel: `private:${partner}`, text: expect.stringContaining(`魅魔 ${succubus}号 选择与你结为情侣`) });
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === partner)?.prompt.rules).toContain('你背叛原有阵营');
    expect(requestsIn(run, 'wolf_chat')[0]?.prompt.history).not.toContain(`${partner}号 结为情侣`);
  });

  it('wins once everyone outside the couple is out, and nobody else wins before that', () => {
    expect(thief).toBe(6);
    const kills = [hunter, witch, guard, villagerC];
    const exiles = [wolfC, wolfA, thief, villagerB];
    const run = play(SEED, combine(
      linkPartner,
      act('witch_poison', witch, [seer], 1),
      act('hunter_shot', hunter, [wolfB]),
      perRound('wolf_kill', kills),
      perRound('exile_vote', exiles),
    ), BOARD);
    const out = eliminated(run).map((death) => death.seat);
    expect(new Set(out)).toEqual(new Set([...kills, ...exiles, seer, wolfB]));
    expect(run.snapshot.seats.filter((seat) => seat.alive).map((seat) => seat.seat).sort((a, b) => a - b)).toEqual([partner, succubus].sort((a, b) => a - b));
    expect(run.snapshot.result).toMatchObject({ winner: 'lovers', winnerLabel: '情侣阵营胜利', summary: expect.stringContaining('其他玩家全部出局（第 4 天）') });
    expect(requestsIn(run, 'mvp_vote').length).toBe(12);
  });
});
