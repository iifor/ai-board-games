import type { AccessCodeDto } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { DAY_MS } from './constants';
import { filterCodes, formValuesOf, toInput, usageLabel } from './utils';

const code = (overrides: Partial<AccessCodeDto> = {}): AccessCodeDto => ({
  id: 1, username: '张三', codeHint: 'AB12', expiresAt: '2027-01-01T00:00:00.000Z', maxMatches: null, usedMatches: 0,
  disabled: false, status: 'active', lastUsedAt: null, createdAt: '2026-11-01T00:00:00.000Z', ...overrides,
});

describe('access code form', () => {
  const now = Date.parse('2026-11-16T00:00:00.000Z');

  it('turns validity days into an absolute expiry and drops the cap when unlimited', () => {
    expect(toInput({ username: ' 李四 ', validityDays: 7, limited: false, maxMatches: 5, disabled: false }, null, now))
      .toEqual({ username: '李四', expiresAt: new Date(now + 7 * DAY_MS).toISOString(), maxMatches: null, disabled: false });
  });

  it('keeps the existing expiry when editing without new validity days', () => {
    const editing = code({ maxMatches: 3 });
    const values = { ...formValuesOf(editing), disabled: true };
    expect(values.validityDays).toBeNull();
    expect(toInput(values, editing, now)).toMatchObject({ expiresAt: editing.expiresAt, maxMatches: 3, disabled: true });
  });

  it('labels usage and filters by keyword or status', () => {
    expect(usageLabel(code({ usedMatches: 2 }))).toBe('2 / 不限');
    expect(usageLabel(code({ usedMatches: 2, maxMatches: 5 }))).toBe('2 / 5');
    const rows = [code(), code({ id: 2, username: '王五', codeHint: 'ZZ99', status: 'expired' })];
    expect(filterCodes(rows, 'zz', undefined).map((row) => row.id)).toEqual([2]);
    expect(filterCodes(rows, undefined, 'active').map((row) => row.id)).toEqual([1]);
  });
});
