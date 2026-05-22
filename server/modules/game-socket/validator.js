const { z } = require('zod');

const startGameSchema = z.object({
  gameType: z.enum(['consensus', 'debate', 'werewolf']),
  mode: z.string().optional(),
  playerIds: z.array(z.number()).min(1),
  topic: z.string().optional()
});

const playerSelectionSchema = z.object({
  playerIds: z.array(z.number())
});

const voiceSynthesizeSchema = z.object({
  voicePackageId: z.number().optional(),
  text: z.string().min(1, '文本不能为空')
});

module.exports = { startGameSchema, playerSelectionSchema, voiceSynthesizeSchema };
