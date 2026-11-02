import type { CreateDebugMatchRequest, CreateMatchRequest, DebugCommandRequest } from '@battle/shared';
import { z } from 'zod';

const base = {
  gameKey: z.string().trim().min(1).max(64),
  variant: z.string().trim().min(1).max(64).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  playerIds: z.array(z.number().int().positive()).min(1).max(32)
    .refine((ids) => new Set(ids).size === ids.length, '玩家不能重复'),
};

export const createMatchSchema = z.object(base) satisfies z.ZodType<CreateMatchRequest>;

export const CHAOS_REQUIRES_SCRIPTED = '混沌脚本只能用于脚本化对局，请同时开启 scripted';

export const createDebugMatchSchema = z.object({
  ...base,
  seed: z.number().int().min(0).max(0xffffffff).optional(),
  breakpoints: z.union([z.literal('all'), z.array(z.string().min(1).max(64)).max(100)]).optional(),
  pacing: z.enum(['ack', 'free']).optional(),
  scripted: z.boolean().optional(),
  chaos: z.boolean().optional(),
}).refine((value) => !value.chaos || value.scripted === true, { message: CHAOS_REQUIRES_SCRIPTED, path: ['chaos'] }) satisfies z.ZodType<CreateDebugMatchRequest>;

export const debugCommandSchema = z.object({
  command: z.enum(['continue', 'step', 'run', 'skip']),
}) satisfies z.ZodType<DebugCommandRequest>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(['created', 'running', 'waiting_ai', 'paused', 'completed', 'failed']).optional(),
  debug: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});
