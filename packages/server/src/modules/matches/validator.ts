import type { CreateDebugMatchRequest, CreateMatchRequest, DebugCommandRequest, GeneratedMatchRequest } from '@battle/shared';
import { z } from 'zod';

const setup = {
  gameKey: z.string().trim().min(1).max(64),
  variant: z.string().trim().min(1).max(64).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
};

export const generatedMatchSchema = z.strictObject(setup) satisfies z.ZodType<GeneratedMatchRequest>;

const base = {
  ...setup,
  playerIds: z.array(z.number().int().positive()).min(1).max(32)
    .refine((ids) => new Set(ids).size === ids.length, '玩家不能重复'),
};

export const createMatchSchema = z.object({ ...base, generatePlayers: z.never().optional() }) satisfies z.ZodType<CreateMatchRequest>;

export const CHAOS_REQUIRES_SCRIPTED = '混沌脚本只能用于脚本化对局，请同时开启 scripted';

const debugOptions = {
  seed: z.number().int().min(0).max(0xffffffff).optional(),
  breakpoints: z.union([z.literal('all'), z.array(z.string().min(1).max(64)).max(100)]).optional(),
  pacing: z.enum(['ack', 'free']).optional(),
  scripted: z.boolean().optional(),
  chaos: z.boolean().optional(),
};

export const createDebugMatchSchema = z.union([
  z.object({ ...base, ...debugOptions, generatePlayers: z.literal(false).optional() }),
  z.object({ ...setup, ...debugOptions, generatePlayers: z.literal(true), scripted: z.literal(true), playerIds: z.never().optional() }),
]).refine((value) => !value.chaos || value.scripted === true, { message: CHAOS_REQUIRES_SCRIPTED, path: ['chaos'] }) satisfies z.ZodType<CreateDebugMatchRequest>;

export const debugCommandSchema = z.object({
  command: z.enum(['continue', 'step', 'run', 'skip']),
}) satisfies z.ZodType<DebugCommandRequest>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(['created', 'running', 'waiting_ai', 'paused', 'completed', 'failed']).optional(),
  debug: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});
