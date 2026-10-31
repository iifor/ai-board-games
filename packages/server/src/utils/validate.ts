import type { Context } from 'hono';
import type { z, ZodType } from 'zod';
import { badRequest } from './errors';

function issues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(根)'}：${issue.message}`).join('；');
}

export function parseWith<T extends ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest(`参数不合法：${issues(parsed.error)}`);
  return parsed.data;
}

export async function parseJson<T extends ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest('请求体必须是 JSON');
  }
  return parseWith(schema, body);
}

export function parseQuery<T extends ZodType>(c: Context, schema: T): z.infer<T> {
  return parseWith(schema, c.req.query());
}
