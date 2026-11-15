import type { ModelImportInput, ModelInput } from '@battle/shared';
import { z } from 'zod';

export const modelSchema = z.object({
  providerId: z.number().int().positive(),
  name: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(128),
  maxTokens: z.number().int().min(16).max(32_000).optional(),
  fallbackModelId: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
}) satisfies z.ZodType<ModelInput>;

export const importModelsSchema = z.object({
  modelIds: z.array(modelSchema.shape.model).min(1).max(1000),
}) satisfies z.ZodType<ModelImportInput>;
