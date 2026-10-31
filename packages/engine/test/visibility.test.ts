import { describe, expect, it } from 'vitest';
import { compileGame, createSnapshot } from '../src';
import { formatHistory } from '../src/prompt/history';
import { buildPublicContext, buildSeatContext } from '../src/prompt/visibleContext';
import { makePlayers, runToEnd } from '../src/testing';
import { assertNoLeak } from '../src/testing/properties';
import { secretGame, secretSpec, type SecretState } from './fixtures/secretGame';

describe('prompt context visibility', () => {
  const snapshot = createSnapshot(secretGame, { seed: 11, players: makePlayers(5) });
  const state = snapshot.state as SecretState;
  const red = snapshot.seats.filter((seat) => seat.team === 'red');
  const blue = snapshot.seats.filter((seat) => seat.team === 'blue');
  const extras = { turn: {}, legalTargets: null };

  it('projects ownerOnly, team and host fields', () => {
    const [redSeat] = red;
    const [blueSeat] = blue;
    if (!redSeat || !blueSeat) throw new Error('fixture 缺少阵营');
    const redContext = buildSeatContext(secretGame, snapshot, redSeat, extras);
    const blueContext = buildSeatContext(secretGame, snapshot, blueSeat, extras);
    expect(redContext.state).toEqual({ banner: '找出红队', codes: state.codes[String(redSeat.seat)], redPlan: state.redPlan });
    expect(blueContext.state).toEqual({ banner: '找出红队', codes: state.codes[String(blueSeat.seat)] });
    expect(buildPublicContext(secretGame, snapshot).state).toEqual({ banner: '找出红队' });
  });

  it('reveals teammates only to roles that know them', () => {
    const [redSeat] = red;
    const [blueSeat] = blue;
    if (!redSeat || !blueSeat) throw new Error('fixture 缺少阵营');
    const redContext = buildSeatContext(secretGame, snapshot, redSeat, extras) as { teammates: { role: string }[]; seats: { role: string | null }[] };
    const blueContext = buildSeatContext(secretGame, snapshot, blueSeat, extras) as { teammates: unknown[]; seats: { seat: number; role: string | null }[] };
    expect(redContext.teammates).toHaveLength(1);
    expect(redContext.seats.filter((seat) => seat.role === 'red')).toHaveLength(2);
    expect(blueContext.teammates).toEqual([]);
    expect(blueContext.seats.filter((seat) => seat.role !== null).map((seat) => seat.seat)).toEqual([blueSeat.seat]);
  });

  it('filters history by channel', () => {
    const run = runToEnd(secretGame, { seed: 11, playerCount: 5 });
    const [redSeat] = red;
    const [blueSeat] = blue;
    if (!redSeat || !blueSeat) throw new Error('fixture 缺少阵营');
    const redChat = run.log.find((entry) => entry.channel === 'team:red' && entry.kind === 'speech');
    const ownMark = run.log.find((entry) => entry.channel === `private:${blueSeat.seat}`);
    const blueHistory = formatHistory(secretGame, run.snapshot, blueSeat);
    expect(redChat && 'text' in redChat && formatHistory(secretGame, run.snapshot, redSeat).includes(redChat.text)).toBe(true);
    expect(redChat && 'text' in redChat && blueHistory.includes(redChat.text)).toBe(false);
    expect(ownMark && 'text' in ownMark && blueHistory.includes(ownMark.text)).toBe(true);
  });
});

describe('audience view', () => {
  it('hides roles until the end and reveals them when configured', () => {
    const run = runToEnd(secretGame, { seed: 12 });
    const running = run.stageEvents.filter((event) => event.view.status === 'running');
    expect(running.every((event) => event.view.seats.every((seat) => seat.role === null))).toBe(true);
    const last = run.stageEvents[run.stageEvents.length - 1];
    expect(last?.kind).toBe('game_over');
    expect(last?.view.seats.every((seat) => seat.role !== null)).toBe(true);
    expect(run.stageEvents.every((event) => event.channel === 'public')).toBe(true);
  });

  it('shows every non-host channel in omniscient mode', () => {
    const game = compileGame({ ...secretSpec, presentation: { ...secretSpec.presentation, audienceView: 'omniscient' } });
    const run = runToEnd(game, { seed: 12 });
    const channels = new Set(run.stageEvents.map((event) => event.channel));
    expect(channels.has('team:red')).toBe(true);
    expect(channels.has('host')).toBe(false);
    expect(run.stageEvents[0]?.view.seats.every((seat) => seat.role !== null)).toBe(true);
  });

  it('detects team-channel text inside another seat\'s prompt', () => {
    const run = runToEnd(secretGame, { seed: 1 });
    const redChat = run.log.find((entry) => entry.channel === 'team:red' && entry.kind === 'speech');
    const blueRequest = run.requests.find(({ request, snapshot }) =>
      snapshot.seats.find((seat) => seat.seat === request.seat)?.team === 'blue' && request.phaseId === 'talk');
    if (!redChat || !('text' in redChat) || !blueRequest) throw new Error('fixture 不完整');
    const tampered = {
      ...blueRequest,
      request: { ...blueRequest.request, prompt: { ...blueRequest.request.prompt, history: redChat.text } },
    };
    expect(() => assertNoLeak(secretGame, { ...run, requests: [tampered] })).toThrow(/泄露/);
  });

  it('detects leaks through view.extra', () => {
    const leaky = compileGame({
      ...secretSpec,
      presentation: { ...secretSpec.presentation, view: (ctx) => ({ plan: ctx.state.redPlan }) },
    });
    expect(() => assertNoLeak(leaky, runToEnd(leaky, { seed: 1 }))).toThrow(/view.extra/);
  });
});
