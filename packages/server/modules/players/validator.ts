import { z } from 'zod';

const playerFields = z.object({
  nickname: z.string().min(1, '昵称不能为空'),
  name: z.string().optional(),
  avatar: z.string().optional(),
  sex: z.string().optional(),
  personality: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  modelId: z.number().nullable().optional(),
  fallbackModelId: z.number().nullable().optional(),
  voicePackageId: z.number().nullable().optional(),
  temperature: z.number().optional(),
  enabled: z.boolean().optional()
});

function requireDistinctModels(value: { modelId?: number | null; fallbackModelId?: number | null }, ctx: z.RefinementCtx): void {
  if (value.modelId != null && value.fallbackModelId != null && value.modelId === value.fallbackModelId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fallbackModelId'], message: '备选模型不能与主模型相同' });
  }
}

const createPlayerSchema = playerFields.superRefine(requireDistinctModels);
const updatePlayerSchema = playerFields.partial().superRefine(requireDistinctModels);
const reorderSchema = z.array(z.object({ id: z.number(), sortOrder: z.number().optional(), sort_order: z.number().optional() }));
const debugChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000)
});
const debugChatSchema = z.object({
  message: z.string().trim().min(1, '消息不能为空').max(4000),
  history: z.array(debugChatMessageSchema).max(20).optional()
});

export { createPlayerSchema, updatePlayerSchema, reorderSchema, debugChatSchema };
