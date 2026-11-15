import { expect, it } from 'vitest';
import { werewolfAnnouncements } from '../../src/werewolf/announcements';
import { BOARDS, boardPlayers } from '../../src/werewolf/boards';
import { play, act, first } from './helpers';

it('每个已登记的夜间口令均在实际板子中播出，公开夜间事件不包含私密行动或具体选择', () => {
  const calls = werewolfAnnouncements.filter(d => d.group === '夜间叫号');
  const observed = new Set<string>();
  for (const board of BOARDS) {
    const run = play(11, undefined, board.key, boardPlayers(board).min);
    for (const event of run.stageEvents) {
      if (event.channel !== 'public' || event.view.extra.period !== 'night') continue;
      expect(['phase_started', 'narration']).toContain(event.kind);
      if (event.kind === 'phase_started' && event.announcement) observed.add(event.announcement);
    }
  }
  expect([...observed].sort()).toEqual(calls.map(c => c.defaultText).sort());
  for (const call of calls) {
    expect(call.audience).toBe('public');
    expect(call.defaultText).toMatch(/请睁眼.+。$/);
    expect(call.defaultText).not.toMatch(/\d+号|[{}]/);
  }
}, 30000);

it('祈求者所得能力和灵狼学习对象只改变私下行动，公开口令按夜数一致', () => {
  for (const [board, phase, roles] of [
    ['heavenly-eye-requester-12', 'requester_pray', ['werewolf', 'villager']],
    ['spirit-wolf-12', 'spirit_wolf_learn', ['seer', 'guard']],
  ] as const) {
    const runs = roles.map(role => play(11, act(phase, null, [first(11, role, board)], 1), board));
    const words = runs.map(run => run.stageEvents.filter(e => e.round <= 2 && e.view.extra.period === 'night' && e.channel === 'public')
      .map(e => e.kind === 'phase_started' ? e.announcement ?? e.title : e.kind === 'narration' ? e.text : e.kind));
    expect(words[0]).toEqual(words[1]);
    const actions = runs.map(run => run.requests.filter(r => r.snapshot.round === 2).map(r => r.request.phaseId));
    expect(actions[0]).not.toEqual(actions[1]);
  }
});
