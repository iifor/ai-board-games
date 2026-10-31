import { describe, expect, it } from 'vitest';
import { act, combine, eliminated, entries, everyoneVotes, first, play, requestsIn, roleSeats, stateOf, wolvesKill, type Override } from '../helpers';

const BOARD = 'wild-child-12';
const SEED = 1;
const child = first(SEED, 'wild_child', BOARD);
const seer = first(SEED, 'seer', BOARD);
const wolves = roleSeats(SEED, 'werewolf', BOARD);
const villagers = roleSeats(SEED, 'villager', BOARD);
const [model = 0] = villagers;

const choose = act('wild_child_choose', child, [model], 1);
const plotNightOne: Override = (request, snapshot) => (request.phaseId === 'wolf_chat' && snapshot.round === 1
  ? { speech: `第一夜密谋：${request.seat}号建议空刀` }
  : undefined);
const requestsOn = (run: ReturnType<typeof play>, phaseId: string, round: number) =>
  run.requests.filter(({ request, snapshot }) => request.phaseId === phaseId && snapshot.round === round).map(({ request }) => request);

describe('wild child', () => {
  it('privately picks a role model on the first night and is neither god nor villager', () => {
    const run = play(SEED, choose, BOARD);
    const [offer] = requestsIn(run, 'wild_child_choose');
    expect(offer?.legalTargets).not.toContain(child);
    expect(offer?.prompt.output).not.toContain('空数组');
    expect(requestsIn(run, 'wild_child_choose')).toHaveLength(1);
    expect(entries(run, 'action', 'wild_child_choose')[0]).toMatchObject({ channel: `private:${child}`, text: `选择 ${model}号 作为榜样` });
    expect(requestsIn(run, 'day_speech').find((request) => request.seat === child)?.prompt.identity).toContain(`你的榜样是 ${model}号`);
    expect(run.snapshot.seats.filter((seat) => seat.role === 'werewolf')).toHaveLength(3);
  });

  it('lets the wolves win by killing every villager while the wild child lives', () => {
    const run = play(SEED, combine(choose, (request, snapshot) => (request.phaseId === 'wolf_kill' ? { target: villagers[snapshot.round - 1] ?? null } : undefined)), BOARD);
    expect(eliminated(run).map((death) => death.seat)).toEqual(villagers);
    expect(run.snapshot.result).toMatchObject({ winner: 'werewolf', summary: expect.stringContaining('屠边') });
  });

  it('turns into a wolf when the model is out and joins the pack from the next night', () => {
    const run = play(SEED, combine(choose, plotNightOne, everyoneVotes('exile_vote', model, 1), act('seer_check', seer, [child], 2)), BOARD);
    const converted = run.snapshot.seats.find((seat) => seat.seat === child);
    expect(converted).toMatchObject({ role: 'wild_child_wolf', team: 'werewolf' });
    expect(entries(run, 'narration', 'wild_child_convert').map((entry) => entry.channel)).toEqual([`private:${child}`, 'team:werewolf']);
    expect(requestsOn(run, 'wolf_chat', 1).map((request) => request.seat)).not.toContain(child);
    const chat = requestsOn(run, 'wolf_chat', 2);
    expect(chat.map((request) => request.seat)).toContain(child);
    const own = chat.find((request) => request.seat === child);
    for (const wolf of wolves) expect(own?.prompt.identity).toContain(`${wolf}号`);
    expect(own?.prompt.history).toContain(`野孩子 ${child}号的榜样已经出局`);
    expect(own?.prompt.history).not.toContain('第一夜密谋');
    const veteran = chat.find((request) => request.seat !== child);
    expect(veteran?.prompt.history).toContain('第一夜密谋');
    expect(veteran?.prompt.identity).toContain(`${child}号`);
    expect(entries(run, 'action', 'seer_check').find((entry) => entry.round === 2)?.text).toBe(`查验 ${child}号：狼人`);
    expect(requestsOn(run, 'day_speech', 2).find((request) => request.seat === child)?.prompt.output).toContain('selfDestruct');
  });

  it('stays good when he dies before the model', () => {
    const run = play(SEED, combine(choose, wolvesKill(child, 1), everyoneVotes('exile_vote', model, 1)), BOARD);
    expect(eliminated(run).slice(0, 2).map((death) => death.seat)).toEqual([child, model]);
    expect(entries(run, 'narration', 'wild_child_convert')).toHaveLength(0);
    expect(run.snapshot.seats.find((seat) => seat.seat === child)?.team).toBe('good');
    expect(stateOf(run.snapshot).wildChildModel).toBe(model);
  });
});
