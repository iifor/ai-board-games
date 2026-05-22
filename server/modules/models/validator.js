const { z } = require('zod');

const createModelSchema = z.object({
  provider: z.string().min(1, '供应商不能为空'),
  name: z.string().min(1, '模型名称不能为空'),
  baseUrl: z.string().optional(),
  apiFormat: z.enum(['openai-compatible', 'anthropic-compatible']).optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().optional()
});

const updateModelSchema = createModelSchema.partial();

module.exports = { createModelSchema, updateModelSchema };
