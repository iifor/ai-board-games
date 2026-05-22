const { z } = require('zod');
const createVoiceSchema = z.object({
  name: z.string().min(1, '语音包名称不能为空'),
  provider: z.string().optional(),
  voiceId: z.string().optional(),
  language: z.string().optional(),
  gender: z.string().optional(),
  style: z.string().optional()
});
const updateVoiceSchema = createVoiceSchema.partial();
module.exports = { createVoiceSchema, updateVoiceSchema };
