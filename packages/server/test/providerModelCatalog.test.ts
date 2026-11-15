import type { ModelDto, ModelImportResult, ProviderDto, ProviderModelOption } from '@battle/shared';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

const longId = 'long-' + 'a'.repeat(100);
const seen: Array<{ path: string; auth: string | undefined }> = [];
const server = createServer((req, res) => {
  seen.push({ path: req.url ?? '', auth: req.headers.authorization });
  if (req.url === '/v1/models') return res.writeHead(200).end(JSON.stringify({ data: [{ id: 'one' }, { id: 'two' }], has_more: true, last_id: 'two' }));
  if (req.url === '/v1/models?after=two') return res.writeHead(200).end(JSON.stringify({ data: [{ id: 'one' }, { id: longId }] }));
  return res.writeHead(401).end('private upstream details');
});
let t: TestApp;
let token: string;
let origin: string;
beforeAll(async () => {
  t = await createTestApp();
  token = await t.adminToken();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('缺少测试端口');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await t.cleanup();
});
const provider = async (name: string, path: string) => dataOf(await t.call<ProviderDto>('POST', '/api/admin/providers', {
  token, body: { name, baseUrl: origin + path, apiKey: 'catalog-fixture-only' },
}));
describe('供应商模型目录', () => {
  it('使用供应商密钥分页拉取，按供应商幂等地导入选中项', async () => {
    const a = await provider('目录甲', '/v1/');
    const b = await provider('目录乙', '/v1');
    const path = '/api/admin/models/catalog/' + a.id;
    const catalog = async () => dataOf(await t.call<ProviderModelOption[]>('GET', path, { token }));
    expect((await t.call('GET', path)).status).toBe(401);
    expect((await t.call('POST', path + '/import', { body: { modelIds: ['one'] } })).status).toBe(401);
    expect(await catalog()).toEqual([longId, 'one', 'two'].map(id => ({ id, added: false })));
    expect(seen).toContainEqual({ path: '/v1/models?after=two', auth: 'Bearer catalog-fixture-only' });
    const batch = (id: number) => t.call<ModelImportResult>('POST', `/api/admin/models/catalog/${id}/import`, { token, body: { modelIds: ['one', longId, 'one'] } });
    const results = (await Promise.all([batch(a.id), batch(a.id)])).map(dataOf);
    expect(results.map(r => r.created).sort()).toEqual([0, 2]);
    expect(results.map(r => r.skipped).sort()).toEqual([0, 2]);
    expect(dataOf(await batch(b.id))).toEqual({ created: 2, skipped: 0 });
    expect((await catalog()).filter(row => !row.added).map(row => row.id)).toEqual(['two']);
    const models = dataOf(await t.call<ModelDto[]>('GET', '/api/admin/models', { token }));
    expect(models).toHaveLength(4);
    expect(new Set(models.map(m => m.name)).size).toBe(4);
      expect(models.every(m => m.name.length <= 64 && m.maxTokens === 8192)).toBe(true);
    expect((await t.call('POST', path + '/import', { token, body: { modelIds: ['valid', ''] } })).status).toBe(400);
  });
  it('拉取失败时保留供应商，不返回上游响应正文或密钥', async () => {
    const p = await provider('目录不可用', '/unauthorized');
    const result = await t.call('GET', '/api/admin/models/catalog/' + p.id, { token });
    expect(result.status).toBe(502);
    expect(result.body.message).toContain('API Key');
    expect(JSON.stringify(result.body)).not.toMatch(/private upstream details|catalog-fixture-only/);
    expect((await t.call('GET', '/api/admin/providers/' + p.id, { token })).status).toBe(200);
  });
});
