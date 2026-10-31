import type { ModelInput } from '@battle/shared';
import { z } from 'zod';

export const modelSchema = z.object({
  providerId: z.number().int().positive(),
  name: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(128),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(32_000).optional(),
  fallbackModelId: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
}) satisfies z.ZodType<ModelInput>;
