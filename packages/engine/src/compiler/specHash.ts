import { z } from 'zod';
import { hashString } from '../utils/hash';

// spec 指纹：结构、模板源码、函数源码、schema 任一变化都会改变 hash。

function serialize(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'function') return `fn:${value.toString()}`;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof z.ZodType) {
    try {
      return { zod: z.toJSONSchema(value) };
    } catch {
      return { zod: 'unrepresentable' };
    }
  }
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item: unknown) => serialize(item, seen));
  const record = value as Record<string, unknown>;
  // 模板只取源码，解析后的节点是派生数据
  if (typeof record.source === 'string' && Array.isArray(record.nodes)) return { template: record.source };
  const keys = [
    ...Object.keys(record),
    ...Object.getOwnPropertyNames(record).filter((key) => typeof record[key] === 'function'),
  ];
  return Object.fromEntries([...new Set(keys)].sort().map((key) => [key, serialize(record[key], seen)]));
}

export function computeSpecHash(spec: object): string {
  return hashString(JSON.stringify(serialize(spec, new WeakSet())));
}
