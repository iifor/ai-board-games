import { VOICE_PROVIDERS, type VoiceInput } from '@battle/shared';
import { z } from 'zod';

export const voiceSchema = z.object({
  name: z.string().trim().min(1).max(64),
  provider: z.enum(VOICE_PROVIDERS),
  voiceName: z.string().trim().min(1).max(128),
  enabled: z.boolean().optional(),
}) satisfies z.ZodType<VoiceInput>;
