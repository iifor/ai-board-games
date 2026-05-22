const { z } = require('zod');

const createPlayerSchema = z.object({
  nickname: z.string().min(1, '昵称不能为空'),
  name: z.string().optional(),
  avatar: z.string().optional(),
  sex: z.string().optional(),
  personality: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  modelId: z.number().nullable().optional(),
  voicePackageId: z.number().nullable().optional(),
  temperature: z.number().optional(),
  enabled: z.boolean().optional()
});

const updatePlayerSchema = createPlayerSchema.partial();
const reorderSchema = z.array(z.object({ id: z.number(), sortOrder: z.number().optional(), sort_order: z.number().optional() }));
const debugChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000)
});
const debugChatSchema = z.object({
  message: z.string().trim().min(1, '消息不能为空').max(4000),
  history: z.array(debugChatMessageSchema).max(20).optional()
});

module.exports = { createPlayerSchema, updatePlayerSchema, reorderSchema, debugChatSchema };
