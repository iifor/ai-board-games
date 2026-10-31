import type { GameCatalogItem } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.cleanup());

describe('public endpoints', () => {
  it('reports health when the database is reachable', async () => {
    expect(dataOf(await t.call<{ status: string }>('GET', '/api/health'))).toEqual({ status: 'ok' });
  });

  it('lists the game catalog with variants', async () => {
    const catalog = dataOf(await t.call<GameCatalogItem[]>('GET', '/api/toc/games'));
    const debate = catalog.find((game) => game.key === 'debate');
    const werewolf = catalog.find((game) => game.key === 'werewolf');
    expect(debate).toMatchObject({ layout: 'versus', variants: [], defaultVariant: null, players: { min: 9, max: 12 } });
    expect(werewolf?.defaultVariant).toBe('standard-12');
    expect(werewolf?.variants.map((variant) => variant.key)).toContain('white-wolf-king-guard-12');
  });
});

describe('error handling', () => {
  it('answers unknown routes with a JSON 404', async () => {
    expect(await t.call('GET', '/api/nope')).toMatchObject({ status: 404, body: { code: 40401 } });
  });

  it('rejects malformed JSON bodies', async () => {
    const response = await t.call('POST', '/api/admin/auth/login', { body: '{not json' });
    expect(response).toMatchObject({ status: 400, body: { message: '请求体必须是 JSON' } });
  });

  it('sets a request id on every response', async () => {
    const response = await t.app.request('/api/health');
    expect(response.headers.get('X-Request-Id')).toMatch(/[0-9a-f-]{36}/);
  });
});
