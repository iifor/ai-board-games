import type { ApiResponse, MatchSummaryDto } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeTts, scriptedLlm } from './support/fixtures';
import { listen, watch } from './support/stream';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

describe('generated debug players', () => {
  let t: TestApp;
  let token: string;
  let server: Awaited<ReturnType<typeof listen>>;
  const llm = scriptedLlm();
  const voice = fakeTts();
  const path = '/api/toc/matches/local-debug';
  const local = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${server.port}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });

  beforeAll(async () => {
    t = await createTestApp({ env: 'development' }, { llm, ttsProviders: { azure: voice, mimo: voice } });
    token = await t.adminToken();
    server = await listen(t);
    t.services.worker.start();
  });
  afterAll(async () => { await server.close(); await t.cleanup(); });

  it('plays a local debate on an empty roster and keeps its generated seats out of public resources', async () => {
    const response = await local({ gameKey: 'debate' });
    expect(response.status).toBe(201);
    const match = dataOf({ body: await response.json() as ApiResponse<MatchSummaryDto> });
    expect(match).toMatchObject({ debug: true, scripted: true });
    expect(match.seats).toHaveLength(9);
    expect(new Set(match.seats.map((seat) => seat.name)).size).toBe(9);
    expect(match.seats.every((seat) => seat.playerId === null)).toBe(true);
    const played = await watch(server.port, match.id, 0);
    expect(played.end?.type).toBe('end');
    expect(played.events.some((event) => event.kind === 'speech')).toBe(true);
    expect(played.audio.every((url) => url === null)).toBe(true);
    expect(llm.calls).toHaveLength(0);
    expect(voice.texts).toHaveLength(0);
    expect(dataOf(await t.call('GET', '/api/toc/players'))).toEqual([]);
    expect(dataOf(await t.call('GET', '/api/toc/matches'))).toEqual([]);
  });

  it.each([['animal-zoo-12', 11], ['standard-12', 12]] as const)('uses the seat count for %s and honors admin breakpoints', async (variant, count) => {
    const body = { gameKey: 'werewolf', variant, scripted: true, generatePlayers: true, breakpoints: 'all' };
    const match = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', { token, body }));
    expect(match).toMatchObject({ status: 'paused', variantKey: variant, debug: true, scripted: true });
    expect(match.seats).toHaveLength(count);
    await t.call('POST', `/api/admin/matches/${match.id}/debug`, { token, body: { command: 'run' } });
    expect((await watch(server.port, match.id, 0)).end?.type).toBe('end');
  });

  it('rejects invalid rosters, paid-mode overrides, foreign origins and attempts to forge loopback access', async () => {
    const generated = { gameKey: 'debate', scripted: true, generatePlayers: true };
    const admin = '/api/admin/matches';
    expect((await t.call('POST', admin, { body: generated })).status).toBe(401);
    expect((await t.call('POST', admin, { token, body: { ...generated, scripted: false } })).status).toBe(400);
    expect((await t.call('POST', admin, { token, body: { ...generated, playerIds: [1] } })).status).toBe(400);
    expect((await t.call('POST', '/api/toc/matches', { body: generated })).status).toBe(400);
    expect((await local({ gameKey: 'debate', scripted: false })).status).toBe(400);
    expect((await local({ gameKey: 'werewolf', variant: 'unknown' })).status).toBe(400);
    expect((await local({ gameKey: 'debate' }, { Origin: 'https://example.com' })).status).toBe(404);
    expect((await t.call('POST', path, { body: { gameKey: 'debate' }, headers: { 'X-Forwarded-For': '127.0.0.1' } })).status).toBe(404);
  });

  it('does not register the local endpoint in production', async () => {
    const prod = await createTestApp({ env: 'production' });
    const productionServer = await listen(prod);
    try {
      const response = await fetch(`http://127.0.0.1:${productionServer.port}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameKey: 'debate' }),
      });
      expect(response.status).toBe(404);
    } finally {
      await productionServer.close();
      await prod.cleanup();
    }
  });
});
