import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, first, play, requestsIn, roleSeats, stateOf, wolvesKill } from './helpers';

const SEED = 11;
const wolves = roleSeats(SEED, 'werewolf');
const villager = first(SEED, 'villager');
const seer = first(SEED, 'seer');
const witch = first(SEED, 'witch');
const hunter = first(SEED, 'hunter');

describe('werewolf setup', () => {
  it('deals 4 wolves, one of each god and 4 villagers', () => {
    const run = play(SEED);
    const counts = run.snapshot.seats.reduce<Record<string, number>>((all, seat) => ({ ...all, [seat.role]: (all[seat.role] ?? 0) + 1 }), {});
    expect(counts).toEqual({ werewolf: 4, seer: 1, witch: 1, hunter: 1, idiot: 1, villager: 4 });
  });

  it('lets wolves know each other and nobody else', () => {
    const run = play(SEED);
    const wolfPrompt = requestsIn(run, 'wolf_chat')[0]?.prompt.identity ?? '';
    for (const wolf of wolves.filter((seat) => seat !== requestsIn(run, 'wolf_chat')[0]?.seat)) {
      expect(wolfPrompt).toContain(`${wolf}号`);
    }
    const seerPrompt = requestsIn(run, 'seer_check')[0]?.prompt.identity ?? '';
    expect(seerPrompt).toContain('预言家');
    expect(seerPrompt).not.toContain('狼队友');
  });
});

describe('werewolf night', () => {
  it('keeps the wolf chat and kill vote inside the wolf channel and never targets a wolf', () => {
    const run = play(SEED, wolvesKill(villager));
    expect(entries(run, 'speech', 'wolf_chat').every((entry) => entry.channel === 'team:werewolf')).toBe(true);
    expect(requestsIn(run, 'wolf_chat').every((request) => wolves.includes(request.seat))).toBe(true);
    for (const request of requestsIn(run, 'wolf_kill')) {
      expect(request.legalTargets?.some((seat) => wolves.includes(seat))).toBe(false);
    }
    expect(entries(run, 'vote_tallied').find((entry) => entry.phaseId === 'wolf_kill')?.channel).toBe('team:werewolf');
  });

  it('kills nobody when every wolf abstains', () => {
    const run = play(SEED);
    expect(entries(run, 'narration').find((entry) => entry.phaseId === 'dawn')?.text).toBe('天亮了，昨晚是平安夜。');
  });

  it('tells the seer the faction privately and remembers it', () => {
    const [wolf] = wolves;
    const run = play(SEED, act('seer_check', seer, [wolf ?? 0], 1));
    const check = entries(run, 'action', 'seer_check')[0];
    expect(check).toMatchObject({ channel: `private:${seer}`, text: `查验 ${wolf}号：狼人` });
    const secondNight = requestsIn(run, 'seer_check').find((request) => request.id.startsWith('seer_check#2'));
    expect(secondNight?.prompt.identity).toContain(`第1夜查验 ${wolf}号，结果是狼人`);
    expect(stateOf(run.snapshot).seerChecks[String(seer)]).toHaveLength(run.snapshot.visits.seer_check ?? 0);
  });

  it('tells the witch the victim only while the antidote lasts', () => {
    const run = play(SEED, combine(wolvesKill(villager, 1), wolvesKill(villager, 2), act('witch_save', witch, [villager], 1)));
    const saves = requestsIn(run, 'witch_save');
    expect(saves).toHaveLength(1);
    expect(saves[0]?.legalTargets).toEqual([villager]);
    expect(saves[0]?.prompt.instruction).toContain(`${villager}号`);
    expect(eliminated(run)[0]).toEqual({ seat: villager, round: 2, reason: '昨晚死亡' });
  });

  it('allows self-save only on the first night', () => {
    const firstNight = play(SEED, combine(wolvesKill(witch, 1), act('witch_save', witch, [witch], 1)));
    expect(requestsIn(firstNight, 'witch_save')[0]?.legalTargets).toEqual([witch]);
    expect(eliminated(firstNight).some((death) => death.seat === witch && death.round === 1)).toBe(false);

    const secondNight = play(SEED, wolvesKill(witch, 2));
    expect(requestsIn(secondNight, 'witch_save').filter((request) => request.id.startsWith('witch_save#2'))).toHaveLength(0);
    expect(eliminated(secondNight)[0]).toMatchObject({ seat: witch, round: 2 });
  });

  it('forbids using both potions in one night', () => {
    const run = play(SEED, combine(wolvesKill(villager, 1), act('witch_save', witch, [villager], 1)));
    expect(requestsIn(run, 'witch_poison').filter((request) => request.id.startsWith('witch_poison#1'))).toHaveLength(0);
  });

  it('counts a seat both killed and poisoned as poisoned, so the hunter cannot shoot', () => {
    const run = play(SEED, combine(wolvesKill(hunter, 1), act('witch_poison', witch, [hunter], 1)));
    expect(eliminated(run)[0]).toMatchObject({ seat: hunter, round: 1 });
    expect(requestsIn(run, 'hunter_shot')).toHaveLength(0);
    expect(stateOf(run.snapshot).potions.poison).toBe(false);
  });
});
