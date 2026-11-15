import type { PlayerInput } from '@battle/shared';
import { z } from 'zod';

export const playerSchema = z.object({
  name: z.string().trim().max(32).optional(),
  avatar: z.url({ protocol: /^https?$/ }).max(500).nullable().optional(),
  persona: z.string().trim().max(500).optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().min(16).max(32000).nullable().optional(),
  speechMaxChars: z.number().int().min(1).max(500).nullable().optional(),
  modelId: z.number().int().positive().nullable().optional(),
  voiceId: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
}) satisfies z.ZodType<PlayerInput>;
