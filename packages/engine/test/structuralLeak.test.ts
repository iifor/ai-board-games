import { describe, expect, it } from 'vitest';
import { compileGame } from '../src';
import { formatEntry } from '../src/prompt/history';
import type { AiRequest } from '../src/runtime/types';
import {
  assertNoLeak,
  omniscientStageProblems,
  requestStructuralProblems,
  runToEnd,
  type RecordedRequest,
  type RunRecord,
} from '../src/testing';
import { secretGame, secretSpec } from './fixtures/secretGame';

// 结构检查不依赖文本长度：把不可见内容逐类塞进一个合法请求，确认每一类都会被抓到

const run = runToEnd(secretGame, { seed: 3 });
const blueVote = run.requests.find(({ request, snapshot }) =>
  request.phaseId === 'vote' && snapshot.seats.find((seat) => seat.seat === request.seat)?.team === 'blue')!;
const viewer = blueVote.snapshot.seats.find((seat) => seat.seat === blueVote.request.seat)!;
const redSeat = blueVote.snapshot.seats.find((seat) => seat.team === 'red')!;

function withRequest(recorded: RecordedRequest, patch: (request: AiRequest) => AiRequest): RecordedRequest {
  return { ...recorded, request: patch(recorded.request) };
}

function withContext(recorded: RecordedRequest, patch: (context: Record<string, unknown>) => Record<string, unknown>): RecordedRequest {
  return withRequest(recorded, (request) => ({
    ...request,
    taskTemplate: { ...request.taskTemplate!, context: patch({ ...request.taskTemplate!.context }) },
  }));
}

describe('structural leak checks', () => {
  it('accept every request of a clean run', () => {
    for (const recorded of run.requests) expect(requestStructuralProblems(secretGame, recorded)).toEqual([]);
    expect(() => assertNoLeak(secretGame, run)).not.toThrow();
  });

  it('catch another seat\'s private log line in the history, however short', () => {
    const hidden = blueVote.snapshot.log.find((entry) => entry.channel === `private:${redSeat.seat}`)!;
    const line = formatEntry(secretGame, blueVote.snapshot, hidden)!;
    const leaky = withRequest(blueVote, (request) => ({ ...request, prompt: { ...request.prompt, history: `${request.prompt.history}\n${line}` } }));
    const problems = requestStructuralProblems(secretGame, leaky);
    expect(problems.join('\n')).toContain(`不可见日志 #${hidden.seq}`);
    expect(() => assertNoLeak(secretGame, { ...run, requests: [leaky] })).toThrow(/信息泄露/);
  });

  it('catch a hidden role exposed in the seat list, even a two-character role key', () => {
    const leaky = withContext(blueVote, (context) => ({
      ...context,
      seats: (context.seats as Record<string, unknown>[]).map((seat) => (seat.seat === redSeat.seat ? { ...seat, role: 'red' } : seat)),
    }));
    expect(requestStructuralProblems(secretGame, leaky)).toEqual([`请求 ${blueVote.request.id}（${viewer.seat}号） 的 seats[${redSeat.seat - 1}] 暴露了 ${redSeat.seat}号的 role`]);
  });

  it('catch teammates handed to a role that does not know them', () => {
    const mate = blueVote.snapshot.seats.find((seat) => seat.team === 'blue' && seat.seat !== viewer.seat)!;
    const leaky = withContext(blueVote, (context) => ({ ...context, teammates: [{ seat: mate.seat, role: null, roleName: null, team: null, position: null }] }));
    expect(requestStructuralProblems(secretGame, leaky).join('\n')).toContain(`teammates 含不应知道的 ${mate.seat}号`);
  });

  it('catch state that differs from the engine projection for the viewer', () => {
    const leaky = withContext(blueVote, (context) => ({ ...context, state: { ...(context.state as object), redPlan: '计划' } }));
    expect(requestStructuralProblems(secretGame, leaky).join('\n')).toContain('state 不等于引擎对该座位的投影');
  });
});

describe('omniscient stage checks', () => {
  const omniscient = compileGame({ ...secretSpec, presentation: { ...secretSpec.presentation, audienceView: 'omniscient' } });
  const godRun = runToEnd(omniscient, { seed: 3 });

  it('accept the engine stage stream', () => {
    expect(godRun.stageEvents.some((event) => event.channel === 'team:red')).toBe(true);
    expect(omniscientStageProblems(omniscient, godRun)).toEqual([]);
  });

  it('catch host-channel events and hidden roles listed as public', () => {
    const [event] = godRun.stageEvents;
    const tampered: RunRecord = {
      ...godRun,
      stageEvents: [{ ...event!, channel: 'host', view: { ...event!.view, publicRoles: [redSeat.seat] } }],
    };
    const problems = omniscientStageProblems(omniscient, tampered);
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain('host 频道');
    expect(problems.join('\n')).toContain(`publicRoles 公开了 ${redSeat.seat}号`);
  });
});
