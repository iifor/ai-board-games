import { z } from 'zod';

const undercoverStartSchema = z.object({
  playerIds: z.array(z.coerce.number().int().positive()).length(6)
    .refine((ids) => new Set(ids).size === ids.length, 'playerIds must be unique'),
});

const undercoverSpeechSchema = z.object({
  speech: z.string().trim().min(1).max(120),
});

const undercoverVoteSchema = z.object({
  targetId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(80).default(''),
});

export { undercoverSpeechSchema, undercoverStartSchema, undercoverVoteSchema };
