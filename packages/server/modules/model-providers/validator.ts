import { z } from 'zod';

const createModelProviderSchema = z.object({
  name: z.string().trim().min(1, '供应商名称不能为空'),
  baseUrl: z.string().optional(),
  apiFormat: z.enum(['openai-compatible', 'anthropic-compatible']).optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().optional()
});

const updateModelProviderSchema = createModelProviderSchema.partial();

export { createModelProviderSchema, updateModelProviderSchema };
