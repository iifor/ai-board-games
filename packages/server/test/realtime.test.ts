import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import type { MatchSummaryDto, ServerMessage, StageEvent } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeTts, scriptedLlm, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

let t: TestApp;
let server: ServerType;
let port = 0;
const tts = fakeTts();

beforeAll(async () => {
  t = await createTestApp({}, { llm: scriptedLlm(), ttsProviders: { azure: tts } });
  server = serve({ fetch: t.app.fetch, port: 0 });
  t.injectWebSocket(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  port = (server.address() as AddressInfo).port;
  t.services.worker.start();
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await t.cleanup();
});

interface Watched {
  readonly events: StageEvent[];
  readonly audio: (string | null)[];
  readonly end: ServerMessage | null;
}

/** 连接对局流并逐个确认，直到收到 end 或达到 limit 个事件 */
function watch(matchId: string, afterSeq: number, limit = Number.POSITIVE_INFINITY): Promise<Watched> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/toc/ws/matches/${matchId}`);
    const events: StageEvent[] = [];
    const audio: (string | null)[] = [];
    const timer = setTimeout(() => reject(new Error('观看超时')), 60_000);
    const finish = (end: ServerMessage | null) => {
      clearTimeout(timer);
      socket.close();
      resolve({ events, audio, end });
    };
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'hello', afterSeq })));
    socket.addEventListener('error', () => reject(new Error('WebSocket 出错')));
    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data)) as ServerMessage;
      if (data.type === 'event') {
        events.push(data.event);
        audio.push(data.audio?.url ?? null);
        if (events.length >= limit) return finish(null);
        socket.send(JSON.stringify({ type: 'ack', seq: data.event.seq }));
      } else if (data.type === 'end' || data.type === 'error' || (data.type === 'status' && data.status === 'failed')) {
        finish(data);
      }
    });
  });
}

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

  it('reports a missing match', async () => {
    const result = await watch('m_missing', 0);
    expect(result.end).toMatchObject({ type: 'error', message: '对局不存在' });
  });
});
