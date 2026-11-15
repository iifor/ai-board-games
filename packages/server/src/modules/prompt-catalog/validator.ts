import { z } from 'zod';
import type { PromptExampleRef } from '@battle/shared';

const example = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('example'), index: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal('history'), matchId: z.string().min(1).max(128), requestId: z.string().min(1).max(256) }),
]) satisfies z.ZodType<PromptExampleRef>;
const source = z.string().trim().min(1).max(8000);
export const previewInput = z.strictObject({ example, source: source.optional() });
export const saveInput = z.strictObject({ source, revision: z.number().int().min(0).max(2147483646) });
export const compareInput = z.strictObject({ example, source, modelId: z.number().int().positive() });
