import { API_ERROR_CODES } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TracePanel } from './features/matches/components/TracePanel';
import { channelColor, describeLog } from './features/matches/utils';
import { applyFilters, enabledFilter, uniqueOptions, type ResourceFilter } from './features/resources/utils';
import { AUTH_EVENTS, http } from './services/http';
import { tokenStore } from './services/tokenStore';

const meta = { seq: 1, round: 1, phaseId: 'vote', channel: 'host' as const };

describe('match utils', () => {
  it('describes log entries including weighted votes, abstentions and fallbacks', () => {
    expect(describeLog({
      ...meta, kind: 'vote_tallied', title: '放逐投票', runoff: 0, abstained: [4],
      ballots: [{ voter: 1, target: 3, weight: 1.5 }, { voter: 2, target: 3, weight: 1 }],
      tally: [{ target: 3, votes: 2.5 }], tied: [], outcome: { kind: 'selected', seat: 3, byTieBreak: false },
    })).toBe('放逐投票：1→3(×1.5) 2→3；弃票 4 → 3号当选');
    expect(describeLog({ ...meta, kind: 'fallback', seat: 2, reason: '输出不合法' })).toBe('2号兜底：输出不合法');
    expect(channelColor('team:werewolf')).toBe('purple');
    expect(channelColor('private:3')).toBe('gold');
  });
});

describe('resource filters', () => {
  interface Row { readonly id: number; readonly name: string; readonly provider: string; readonly enabled: boolean }
  const rows: Row[] = [
    { id: 1, name: 'Azure 女声', provider: 'azure', enabled: true },
    { id: 2, name: 'Mimo 男声', provider: 'mimo', enabled: false },
  ];
  const providerFilter: ResourceFilter<Row> = { key: 'provider', placeholder: '来源', options: () => [], matches: (dto, value) => dto.provider === value };
  const filters = [providerFilter, enabledFilter<Row>()];
  const search = (dto: Row) => [dto.name];

  it('combines select filters with a case-insensitive keyword search', () => {
    expect(applyFilters(rows, filters, { provider: 'azure' }, search).map((row) => row.id)).toEqual([1]);
    expect(applyFilters(rows, filters, { enabled: 'false', q: 'MIMO' }, search).map((row) => row.id)).toEqual([2]);
    expect(applyFilters(rows, filters, { q: '不存在' }, search)).toEqual([]);
    expect(applyFilters(rows, filters, { q: '', provider: undefined }, search)).toHaveLength(2);
    expect(uniqueOptions(['b', 'a', null, 'a'])).toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]);
  });
});

describe('http auth handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    tokenStore.clear();
  });

  function stub(body: unknown) {
    const events: string[] = [];
    vi.stubGlobal('window', { dispatchEvent: (event: Event) => events.push(event.type) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))));
    return events;
  }

  it('sends the token and clears it when the server says it expired', async () => {
    tokenStore.set('t-1');
    const events = stub({ code: API_ERROR_CODES.unauthorized, message: '登录已失效' });
    await expect(http.get('/api/admin/players')).rejects.toThrow('登录已失效');
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer t-1' });
    expect(tokenStore.get()).toBeNull();
    expect(events).toEqual([AUTH_EVENTS.expired]);
  });

  it('asks for a password change and returns data on success', async () => {
    tokenStore.set('t-2');
    expect(stub({ code: API_ERROR_CODES.passwordChangeRequired, message: '请先修改初始密码' })).toEqual([]);
    await expect(http.get('/x')).rejects.toThrow('请先修改初始密码');
    stub({ code: 0, message: 'ok', data: [1, 2] });
    await expect(http.get('/y')).resolves.toEqual([1, 2]);
  });
});

describe('TracePanel', () => {
  it('shows prompt layers and the raw response for each call', () => {
    const html = renderToStaticMarkup(
      <TracePanel calls={[{
        id: 1, requestId: 'opening#1:t0:a1', seat: 4, modelName: '主模型', latencyMs: 820, error: null, createdAt: '2026-10-31T00:00:00Z',
        prompt: { platform: 'P', rules: 'R', identity: 'I', history: 'H', instruction: '请立论', output: 'O' },
        rawResponse: '{"speech":"你好"}', output: { speech: '你好' },
      }]} />,
    );
    expect(html).toContain('opening#1:t0:a1');
    expect(html).toContain('主模型');
    expect(html).toContain('820 ms');
  });
});
