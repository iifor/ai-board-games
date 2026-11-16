import { API_ERROR_CODES, type AccessCodeDto, type AccessCodeSecret, type AccessProfile, type AccessSessionResponse, type MatchDetailDto, type MatchSummaryDto } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scriptedLlm, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

let t: TestApp;
let admin: string;
let playerIds: number[];
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();

beforeAll(async () => {
  t = await createTestApp({ matches: { maxActive: 100, idleMs: 30 * 60_000 } }, { llm: scriptedLlm() });
  admin = await t.adminToken();
  playerIds = await seedPlayers(t, 9);
});

afterAll(async () => {
  await t.cleanup();
});

const createCode = async (body: Record<string, unknown> = {}) =>
  dataOf(await t.call<AccessCodeSecret>('POST', '/api/admin/access-codes', { token: admin, body: { username: '张三', expiresAt: inDays(7), maxMatches: null, ...body } }));
const session = (code: string) => t.call<AccessSessionResponse>('POST', '/api/toc/access/session', { body: { code } });
const start = (token?: string) => t.call<MatchSummaryDto>('POST', '/api/toc/matches', { ...(token ? { token } : {}), body: { gameKey: 'debate', playerIds } });
const update = (code: AccessCodeDto, patch: Record<string, unknown>) =>
  t.call<AccessCodeDto>('PUT', `/api/admin/access-codes/${code.id}`, { token: admin, body: { username: code.username, expiresAt: code.expiresAt, maxMatches: code.maxMatches, ...patch } });

describe('access codes', () => {
  it('shows the plain code once, accepts it in any spacing or case, and records who started the match', async () => {
    const { accessCode, secret } = await createCode({ username: '李四', maxMatches: 3 });
    expect(secret).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(accessCode).toMatchObject({ username: '李四', codeHint: secret.slice(-4), status: 'active', usedMatches: 0 });
    const listed = dataOf(await t.call<AccessCodeDto[]>('GET', '/api/admin/access-codes', { token: admin }));
    expect(JSON.stringify(listed)).not.toContain(secret.replaceAll('-', ''));

    const loose = ` ${secret.toLowerCase().replaceAll('-', ' ')} `;
    const { token, remainingMatches } = dataOf(await session(loose));
    expect(remainingMatches).toBe(3);
    const match = dataOf(await start(token));
    const detail = dataOf(await t.call<MatchDetailDto>('GET', `/api/admin/matches/${match.id}`, { token: admin }));
    expect(detail.startedBy).toBe('李四');
    expect(dataOf(await t.call<AccessProfile>('GET', '/api/toc/access/me', { token })).remainingMatches).toBe(2);
  });

  it('requires a code to start a match but keeps history and summaries public', async () => {
    expect(await start()).toMatchObject({ status: 401, body: { code: API_ERROR_CODES.unauthorized } });
    expect((await t.call('GET', '/api/toc/matches')).status).toBe(200);
  });

  it('keeps admin tokens and access tokens apart', async () => {
    const { secret } = await createCode();
    const { token } = dataOf(await session(secret));
    expect((await t.call('GET', '/api/admin/access-codes', { token })).status).toBe(401);
    expect((await t.call('GET', '/api/admin/auth/me', { token })).status).toBe(401);
    expect((await start(admin)).status).toBe(401);
  });

  it('stops working as soon as the code is disabled, expired, regenerated or deleted', async () => {
    const created = await createCode();
    const { token } = dataOf(await session(created.secret));
    expect(dataOf(await update(created.accessCode, { disabled: true })).status).toBe('disabled');
    expect(await start(token)).toMatchObject({ status: 401, body: { message: expect.stringContaining('停用') } });
    expect((await session(created.secret)).status).toBe(401);

    const restored = dataOf(await update(created.accessCode, { disabled: false }));
    expect((await start(token)).status).toBe(201);
    await t.db.updateTable('accessCodes').set({ expiresAt: new Date(Date.now() - 1000) }).where('id', '=', restored.id).execute();
    expect(await start(token)).toMatchObject({ status: 401, body: { message: expect.stringContaining('过期') } });
    await update(restored, { expiresAt: inDays(3) });

    const rotated = dataOf(await t.call<AccessCodeSecret>('POST', `/api/admin/access-codes/${restored.id}/regenerate`, { token: admin }));
    expect(rotated.secret).not.toBe(created.secret);
    expect((await start(token)).status).toBe(401);
    expect((await session(created.secret)).status).toBe(401);
    const fresh = dataOf(await session(rotated.secret)).token;
    expect((await start(fresh)).status).toBe(201);

    expect((await t.call('DELETE', `/api/admin/access-codes/${restored.id}`, { token: admin })).status).toBe(200);
    expect((await start(fresh)).status).toBe(401);
  });

  it('never lets concurrent starts exceed the match quota', async () => {
    const { secret, accessCode } = await createCode({ maxMatches: 2 });
    const { token } = dataOf(await session(secret));
    const results = await Promise.all(Array.from({ length: 5 }, () => start(token)));
    expect(results.filter((result) => result.status === 201)).toHaveLength(2);
    expect(results.filter((result) => result.status === 403)).toHaveLength(3);
    expect(results.find((result) => result.status === 403)?.body.message).toContain('用完');
    const [row] = dataOf(await t.call<AccessCodeDto[]>('GET', '/api/admin/access-codes', { token: admin })).filter((code) => code.id === accessCode.id);
    expect(row).toMatchObject({ usedMatches: 2, status: 'exhausted' });
  });

  it('does not use up the quota when the match itself is rejected', async () => {
    const { secret, accessCode } = await createCode({ maxMatches: 1 });
    const { token } = dataOf(await session(secret));
    const invalid = await t.call('POST', '/api/toc/matches', { token, body: { gameKey: 'debate', playerIds: [999_999] } });
    expect(invalid.status).toBe(400);
    expect((await t.services.accessCodes.list()).find((code) => code.id === accessCode.id)?.usedMatches).toBe(0);
  });

  it('validates input and locks out a source after too many wrong codes', async () => {
    const bad = await t.call('POST', '/api/admin/access-codes', { token: admin, body: { username: '王五', expiresAt: inDays(-1), maxMatches: null } });
    expect(bad.status).toBe(400);
    expect((await t.call('POST', '/api/admin/access-codes', { token: admin, body: { username: '', expiresAt: inDays(1), maxMatches: 0 } })).status).toBe(400);

    const { secret } = await createCode();
    // 前面的用例换发后试过旧码，也算输错；从零开始计数
    await t.db.deleteFrom('requestWindows').execute();
    for (let index = 0; index < 10; index += 1) expect((await session(`WRONG-CODE-${index}`)).status).toBe(401);
    expect(await session(secret)).toMatchObject({ status: 429, body: { code: API_ERROR_CODES.tooManyRequests } });
  });
});
