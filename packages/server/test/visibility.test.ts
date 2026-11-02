import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import type { MatchSummaryDto, ServerMessage } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

/** 一个环境一套应用与监听端口 */
interface Env {
  readonly t: TestApp;
  readonly server: ServerType;
  readonly port: number;
}

async function startEnv(env: 'production' | 'test'): Promise<Env> {
  const t = await createTestApp({ env });
  const server = serve({ fetch: t.app.fetch, port: 0 });
  t.injectWebSocket(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  return { t, server, port: (server.address() as AddressInfo).port };
}

async function stopEnv(env: Env): Promise<void> {
  await new Promise<void>((resolve) => env.server.close(() => resolve()));
  await env.t.cleanup();
}

/** 连接播放流，返回收到的第一条消息 */
function firstMessage(env: Env, matchId: string): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${env.port}/api/toc/ws/matches/${matchId}`);
    const timer = setTimeout(() => reject(new Error('播放流没有回应')), 10_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'hello', afterSeq: 0 })));
    socket.addEventListener('error', () => reject(new Error('WebSocket 出错')));
    socket.addEventListener('message', (message) => {
      clearTimeout(timer);
      socket.close();
      resolve(JSON.parse(String(message.data)) as ServerMessage);
    });
  });
}

async function createDebugMatch(env: Env): Promise<MatchSummaryDto> {
  const playerIds = await seedPlayers(env.t, 9);
  return env.t.services.matches.createDebug({ gameKey: 'debate', playerIds, scripted: true, pacing: 'free' });
}

describe('debug match visibility on public routes', () => {
  let production: Env;
  let development: Env;
  beforeAll(async () => {
    [production, development] = await Promise.all([startEnv('production'), startEnv('test')]);
  });
  afterAll(async () => {
    await Promise.all([stopEnv(production), stopEnv(development)]);
  });

  it('hides debug matches from the public summary and stream in production, while the admin still sees them', async () => {
    const match = await createDebugMatch(production);
    expect((await production.t.call('GET', `/api/toc/matches/${match.id}`)).status).toBe(404);
    expect(await firstMessage(production, match.id)).toEqual({ type: 'error', message: '对局不存在' });
    const token = await production.t.adminToken();
    expect(dataOf(await production.t.call<MatchSummaryDto>('GET', `/api/admin/matches/${match.id}`, { token })).id).toBe(match.id);
    expect(await production.t.services.matches.findPublic(match.id)).toBeUndefined();
  });

  it('keeps public matches viewable in production', async () => {
    const playerIds = await seedPlayers(production.t, 9);
    const created = dataOf(await production.t.call<MatchSummaryDto>('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } }));
    expect(dataOf(await production.t.call<MatchSummaryDto>('GET', `/api/toc/matches/${created.id}`)).debug).toBe(false);
    expect((await firstMessage(production, created.id)).type).not.toBe('error');
  });

  it('lets the C-end stage watch scripted debug matches outside production', async () => {
    const match = await createDebugMatch(development);
    expect(dataOf(await development.t.call<MatchSummaryDto>('GET', `/api/toc/matches/${match.id}`))).toMatchObject({ id: match.id, debug: true });
    expect((await firstMessage(development, match.id)).type).toBe('event');
  });
});
