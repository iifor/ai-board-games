const { z } = require('zod');

const listGamesSchema = z.object({
  gameType: z.enum(['debate', 'werewolf']).optional(),
  mode: z.string().optional(),
  skinId: z.string().optional(),
  winner: z.string().optional(),
  playerId: z.number().optional()
}).optional();

const importGameSchema = z.object({
  raw: z.string().optional(),
  id: z.string().optional(),
  gameType: z.string().optional()
}).optional();

module.exports = { listGamesSchema, importGameSchema };
