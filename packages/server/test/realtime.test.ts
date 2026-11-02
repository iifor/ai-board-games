import { gameRegistry } from '@battle/games';
import type { MatchSummaryDto } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_CLIENT_FRAME_BYTES, MESSAGE_TOO_BIG_CODE } from '../src/modules/realtime';
import { fakeTts, scriptedLlm, seedPlayers } from './support/fixtures';
import { listen, watch as watchOn } from './support/stream';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

let t: TestApp;
let server: Awaited<ReturnType<typeof listen>>;
const tts = fakeTts();

beforeAll(async () => {
  t = await createTestApp({}, { llm: scriptedLlm(), ttsProviders: { azure: tts } });
  server = await listen(t);
  t.services.worker.start();
});
afterAll(async () => {
  await server.close();
  await t.cleanup();
});

const watch = (matchId: string, afterSeq: number, limit?: number) => watchOn(server.port, matchId, afterSeq, limit);

describe('realtime playback', () => {
  it('streams a live match one acknowledged event at a time, with audio', async () => {
    const playerIds = await seedPlayers(t, 9);
    const match = dataOf(await t.call<MatchSummaryDto>('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } }));
    const first = await watch(match.id, 0, 5);
    expect(first.events.map((event) => event.seq)).toEqual([...first.events.map((event) => event.seq)].sort((a, b) => a - b));

    const rest = await watch(match.id, first.events[first.events.length - 1]?.seq ?? 0);
    expect(rest.end).toMatchObject({ type: 'end', result: { winner: expect.any(String) } });
    expect(rest.events[0]?.seq).toBeGreaterThan(first.events[first.events.length - 1]?.seq ?? 0);

    const speechAudio = [...first.events, ...rest.events]
      .map((event, index) => ({ event, url: [...first.audio, ...rest.audio][index] }))
      .filter(({ event }) => event.kind === 'speech');
    expect(speechAudio.length).toBeGreaterThan(0);
    expect(speechAudio.every(({ url }) => typeof url === 'string')).toBe(true);
    const media = await t.app.request(speechAudio[0]?.url ?? '');
    expect(media.headers.get('Content-Type')).toBe('audio/mpeg');
    expect((await media.text()).startsWith('audio:')).toBe(true);
  });

  it('replays a finished match through the same stream', async () => {
    const [finished] = dataOf(await t.call<MatchSummaryDto[]>('GET', '/api/toc/matches'));
    if (!finished) throw new Error('没有已完成的对局');
    const replay = await watch(finished.id, 0);
    expect(replay.end).toMatchObject({ type: 'end' });
    expect(replay.events[replay.events.length - 1]?.kind).toBe('game_over');
    expect(replay.events[replay.events.length - 1]?.view.status).toBe('completed');
  });

  /** 每个已注册游戏的每个变体：脚本化调试局经 WebSocket 播放到终局 */
  const cases = [...gameRegistry.values()].flatMap((game) => {
    const variants = Object.keys(game.spec.variants ?? {});
    return (variants.length ? variants : [null]).map((variant) => ({ game, variant }));
  });
  it.each(cases.map(({ game, variant }) => [`${game.spec.key}${variant ? `/${variant}` : ''}`, game, variant] as const))(
    'plays a scripted %s match to the end over WebSocket',
    async (_name, game, variant) => {
      const playerIds = await seedPlayers(t, game.spec.players.max);
      const match = await t.services.matches.createDebug({
        gameKey: game.spec.key,
        ...(variant ? { variant } : {}),
        playerIds,
        scripted: true,
        pacing: 'free',
        seed: 5,
      });
      const watched = await watch(match.id, 0);
      expect(watched.end).toMatchObject({ type: 'end', result: { winner: expect.anything() } });
      expect(watched.events[watched.events.length - 1]?.kind).toBe('game_over');
      expect(watched.events.every((event) => event.channel === 'public')).toBe(true);
    },
  );

  it('reports a missing match', async () => {
    const result = await watch('m_missing', 0);
    expect(result.end).toMatchObject({ type: 'error', message: '对局不存在' });
  });

  it('closes the connection with a policy violation when a client frame exceeds the size limit', async () => {
    const [finished] = dataOf(await t.call<MatchSummaryDto[]>('GET', '/api/toc/matches'));
    if (!finished) throw new Error('没有已完成的对局');
    const closed = await new Promise<{ code: number; events: number }>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/toc/ws/matches/${finished.id}`);
      const timer = setTimeout(() => reject(new Error('没有被关闭')), 10_000);
      let events = 0;
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'hello', afterSeq: 0, padding: 'x'.repeat(MAX_CLIENT_FRAME_BYTES) })));
      socket.addEventListener('message', () => { events += 1; });
      socket.addEventListener('close', (event) => {
        clearTimeout(timer);
        resolve({ code: event.code, events });
      });
    });
    // 过大的帧在 ws 协议层就被拒绝（1009 message too big），不会被当作 hello 解析：没有推送任何事件
    expect(closed).toEqual({ code: MESSAGE_TOO_BIG_CODE, events: 0 });
  });
});
