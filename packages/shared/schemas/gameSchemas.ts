import { z } from 'zod';

const gameTypeEnum = z.enum(['debate', 'werewolf']);

const startGameSchema = z.object({
  gameType: gameTypeEnum,
  mode: z.string().optional(),
  playerIds: z.array(z.number()).min(1),
  topic: z.string().optional(),
  debateTeams: z.object({
    proIds: z.array(z.number()),
    conIds: z.array(z.number()),
    judgeIds: z.array(z.number()).optional(),
    captainEnabled: z.boolean().optional(),
    proCaptainId: z.number().optional(),
    conCaptainId: z.number().optional()
  }).optional(),
  hostId: z.number().optional(),
  werewolfMode: z.any().optional(),
  replayGameId: z.string().optional(),
  clientViewMode: z.string().optional(),
  replayView: z.any().optional()
});

const playerSelectionSchema = z.object({
  playerIds: z.array(z.number())
});

const voiceSynthesizeSchema = z.object({
  voicePackageId: z.number().optional(),
  text: z.string().min(1, '文本不能为空')
});

export { startGameSchema, playerSelectionSchema, voiceSynthesizeSchema, gameTypeEnum };
