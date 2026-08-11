import { createHash } from 'node:crypto';

const INVALID_BIGINT = '[INVALID_BIGINT]';
const INVALID_TIMESTAMP = '[INVALID_TIMESTAMP]';
type JsonRepresentation = 'parsed' | 'serialized';

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function normalizeJson(value: unknown, representation: JsonRepresentation): unknown {
  if (typeof value === 'string') {
    if (representation === 'serialized') return canonicalValue(JSON.parse(value));
    return value;
  }
  return canonicalValue(value);
}

function normalizeBigint(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? BigInt(value).toString() : INVALID_BIGINT;
  }
  if (typeof value === 'string' && /^[+-]?\d+$/.test(value)) {
    try { return BigInt(value).toString(); } catch { return INVALID_BIGINT; }
  }
  return INVALID_BIGINT;
}

function normalizeTimestamp(value: unknown): string {
  const timestamp = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : null;
  return timestamp && !Number.isNaN(timestamp.getTime())
    ? timestamp.toISOString()
    : INVALID_TIMESTAMP;
}

export function normalizeBusinessSampleRow(
  row: Record<string, unknown> | null,
  bigintColumns: readonly string[] = [],
  jsonRepresentation: JsonRepresentation = 'parsed',
): Record<string, unknown> | null {
  if (!row) return null;
  const bigintColumnSet = new Set(bigintColumns);
  return Object.fromEntries(Object.entries(row).map(([column, rawValue]) => {
    if (rawValue == null) return [column, null];
    if (bigintColumnSet.has(column)) return [column, normalizeBigint(rawValue)];
    if (column.endsWith('_json')) return [column, normalizeJson(rawValue, jsonRepresentation)];
    if (column.endsWith('_at')) return [column, normalizeTimestamp(rawValue)];
    return [column, rawValue];
  }));
}

export function businessSampleHash(
  row: Record<string, unknown> | null,
  bigintColumns: readonly string[] = [],
  jsonRepresentation: JsonRepresentation = 'parsed',
): string {
  const normalized = canonicalValue(normalizeBusinessSampleRow(row, bigintColumns, jsonRepresentation));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
