import { z } from 'zod';

const setDefaultHostSchema = z.object({
  defaultHostPlayerId: z.number().nullable().optional(),
  playerId: z.number().nullable().optional()
});

export { setDefaultHostSchema };
