import type { PlayerInput } from '@battle/shared';
import { z } from 'zod';

export const playerSchema = z.object({
  name: z.string().trim().min(1).max(32),
  avatar: z.url({ protocol: /^https?$/ }).max(500).nullable().optional(),
  persona: z.string().trim().max(500).optional(),
  modelId: z.number().int().positive(),
  voiceId: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
}) satisfies z.ZodType<PlayerInput>;
