import { z } from 'zod';

const listGamesSchema = z.object({
  gameType: z.string().trim().min(1).max(64).optional(),
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

export { listGamesSchema, importGameSchema };
