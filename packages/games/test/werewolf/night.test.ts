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
  it('keeps the public wake call and the lone wolf’s abstention while skipping private chat', () => {
    const run = play(SEED, (request, snapshot) => {
      if (request.phaseId === 'day_speech' && snapshot.round <= 3 && request.seat === wolves[snapshot.round - 1]) {
        return { speech: '自爆。', declare: 'selfDestruct' };
      }
      return undefined;
    });
    const fourth = run.requests.filter(r => r.snapshot.round === 4);
    expect(fourth.filter(r => r.request.phaseId === 'wolf_chat')).toHaveLength(0);
    expect(fourth.filter(r => r.request.phaseId === 'wolf_kill').map(r => r.request.seat)).toEqual([wolves[3]]);
    const calls = run.stageEvents.filter(e => e.kind === 'phase_started' && e.phaseId === 'wolf_chat' && e.channel === 'public');
    const announcements = calls.flatMap(e => e.kind === 'phase_started' && e.round === 4 ? [e.announcement] : []);
    expect(announcements).toHaveLength(1);
    expect(announcements[0]).toMatch(/狼人请睁眼/);
    expect(entries(run, 'vote_tallied', 'wolf_kill').find(e => e.round === 4)?.outcome).toEqual({ kind: 'none' });
  });

  it('assigns identical thief cards privately without asking the model', () => {
    const variant = 'cupid-thief-12';
    const thief = first(33, 'thief', variant);
    const run = play(33, undefined, variant);
    expect(stateOf(run.snapshot).thief?.cards).toEqual(['villager', 'villager']);
    expect(requestsIn(run, 'thief_choose')).toHaveLength(0);
    expect(run.snapshot.seats.find(s => s.seat === thief)?.role).toBe('villager');
    expect(entries(run, 'narration', 'thief_take')).toContainEqual(expect.objectContaining({ channel: 'private:' + thief, text: expect.stringContaining('村民') }));
  });
  it('asks one wolf for a proposal each night and lets teammates read it before agreeing or objecting', () => {
    const replies = ['我提议今晚空刀，明天观察投票。', '同意。', '我想换个目标，优先选白天带票的人。', '同意。'];
    const run = play(SEED, (request, snapshot) => {
      if (request.phaseId !== 'wolf_chat') return undefined;
      const earlier = snapshot.log.filter(e => e.kind === 'speech' && e.phaseId === 'wolf_chat' && e.round === snapshot.round);
      return { speech: replies[earlier.length] };
    });
    for (const round of [1, 2]) {
      const turns = run.requests.filter(r => r.request.phaseId === 'wolf_chat' && r.snapshot.round === round);
      expect(turns.map(r => r.request.seat).sort()).toEqual([...wolves].sort());
      expect(turns[0]!.request.prompt.instruction).toContain('由你先提议');
      for (const [i, { request }] of turns.slice(1).entries()) {
        expect(request.prompt.instruction).toContain('认同就只说「同意」');
        expect(request.prompt.instruction).toContain('有不同意见');
        expect(request.prompt.instruction).not.toContain('由你先提议');
        for (const reply of replies.slice(0, i + 1)) expect(request.prompt.history).toContain(reply);
      }
      expect(entries(run, 'speech', 'wolf_chat').filter(e => e.round === round).map(e => e.text)).toEqual(replies);
    }
    expect(requestsIn(run, 'seer_check')[0]!.prompt.history).not.toContain(replies[0]);
  });

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
    expect(entries(run, 'narration').find((entry) => entry.phaseId === 'dawn')?.text).toBe('昨晚是平安夜。');
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

  it('skips poison after a save and keeps the bottle available for the next night', () => {
    const run = play(SEED, combine(
      wolvesKill(villager, 1),
      act('witch_save', witch, [villager], 1),
      act('witch_poison', witch, [seer]),
    ));
    const poisonRounds = run.requests.filter(({ request }) => request.phaseId === 'witch_poison').map(({ snapshot }) => snapshot.round);
    expect(poisonRounds).toEqual([2]);
    expect(eliminated(run)[0]).toMatchObject({ seat: seer, round: 2 });
    expect(stateOf(run.snapshot).potions).toMatchObject({ antidote: false, poison: false });
  });

  it('counts a seat both killed and poisoned as poisoned, so the hunter cannot shoot', () => {
    const run = play(SEED, combine(wolvesKill(hunter, 1), act('witch_poison', witch, [hunter], 1)));
    expect(eliminated(run)[0]).toMatchObject({ seat: hunter, round: 1 });
    expect(requestsIn(run, 'hunter_shot')).toHaveLength(0);
    expect(stateOf(run.snapshot).potions).toMatchObject({ antidote: true, poison: false });
  });
});
