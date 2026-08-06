import { z } from 'zod';

const createModelSchema = z.object({
  providerId: z.number().optional(),
  provider: z.string().trim().min(1, '供应商不能为空').optional(),
  name: z.string().trim().min(1, '模型名称不能为空'),
  displayName: z.string().max(120, '模型名称不能超过 120 个字符').optional(),
  baseUrl: z.string().optional(),
  apiFormat: z.enum(['openai-compatible', 'anthropic-compatible']).optional(),
  apiKey: z.string().optional(),
  thinkingEnabled: z.boolean().optional(),
  enabled: z.boolean().optional()
});

const updateModelSchema = createModelSchema.partial();

export { createModelSchema, updateModelSchema };
