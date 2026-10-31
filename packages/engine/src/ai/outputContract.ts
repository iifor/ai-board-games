import { z, type ZodType } from 'zod';
import type { JsonSchema } from '../runtime/types';

export function toJsonSchema(schema: ZodType): JsonSchema {
  // $schema 声明对模型没有信息量，去掉以缩短提示词
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/** L6：输出格式、合法目标，以及上一次输出的错误原因（重试时） */
export function describeOutputContract(
  schema: JsonSchema,
  legalTargets: readonly number[] | null,
  previousError: string | null,
): string {
  const lines = [
    '输出要求：只输出一个 JSON 对象，不要输出任何其他文字或代码块标记。',
    `JSON Schema：${JSON.stringify(schema)}`,
  ];
  if (legalTargets) {
    lines.push(`合法目标座位号：${legalTargets.length ? legalTargets.join('、') : '（无）'}`);
  }
  if (previousError) lines.push(`你上一次的输出不合法：${previousError}。请修正后重新输出。`);
  return lines.join('\n');
}

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : '(根)'}：${issue.message}`)
    .join('；');
}
